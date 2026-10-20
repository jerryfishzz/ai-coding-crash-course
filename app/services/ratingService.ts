import { and, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings, UserRole } from "~/db/schema";
import { getUserById } from "./userService";

export function canRateCourse(userId: number) {
  return getUserById(userId)?.role === UserRole.Student;
}

export function getCourseRatingSummaries() {
  return db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .groupBy(courseRatings.courseId)
    .all();
}

export function getCourseRatingSummary(courseId: number) {
  return db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get()!;
}

export function getStudentCourseRating(courseId: number, userId: number) {
  return (
    db
      .select()
      .from(courseRatings)
      .where(
        and(
          eq(courseRatings.courseId, courseId),
          eq(courseRatings.userId, userId)
        )
      )
      .get()?.rating ?? null
  );
}

export function saveCourseRating(
  courseId: number,
  userId: number,
  rating: number
) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Choose a whole-number rating from 1 to 5.");
  }
  if (!canRateCourse(userId))
    throw new Error("Only students can rate courses.");
  return db
    .insert(courseRatings)
    .values({ courseId, userId, rating })
    .onConflictDoUpdate({
      target: [courseRatings.courseId, courseRatings.userId],
      set: { rating },
    })
    .returning()
    .get();
}
