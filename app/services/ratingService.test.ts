import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { courseRatings, users, UserRole } from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import {
  getCourseRatingSummaries,
  getCourseRatingSummary,
  getStudentCourseRating,
  saveCourseRating,
} from "./ratingService";

describe("course ratings", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("distinguishes unrated courses from rated courses", () => {
    expect(getCourseRatingSummary(base.course.id)).toEqual({
      average: null,
      count: 0,
    });
    expect(getStudentCourseRating(base.course.id, base.user.id)).toBeNull();
  });

  it("shares the average and replaces a student's previous rating", () => {
    const other = testDb
      .insert(users)
      .values({
        name: "Other",
        email: "other@example.com",
        role: UserRole.Student,
      })
      .returning()
      .get();
    saveCourseRating(base.course.id, base.user.id, 5);
    saveCourseRating(base.course.id, other.id, 2);
    expect(getCourseRatingSummary(base.course.id)).toEqual({
      average: 3.5,
      count: 2,
    });
    saveCourseRating(base.course.id, base.user.id, 4);
    expect(getCourseRatingSummary(base.course.id)).toEqual({
      average: 3,
      count: 2,
    });
    expect(getCourseRatingSummaries()).toEqual([
      { courseId: base.course.id, average: 3, count: 2 },
    ]);
    expect(getStudentCourseRating(base.course.id, base.user.id)).toBe(4);
  });

  it.each([0, 6, 1.5, NaN, Infinity])("rejects invalid rating %s", (rating) => {
    expect(() =>
      saveCourseRating(base.course.id, base.user.id, rating)
    ).toThrow();
    expect(getCourseRatingSummary(base.course.id).count).toBe(0);
  });

  it("rejects instructors and unknown users", () => {
    expect(() =>
      saveCourseRating(base.course.id, base.instructor.id, 5)
    ).toThrow("Only students");
    expect(() => saveCourseRating(base.course.id, 9999, 5)).toThrow(
      "Only students"
    );
  });

  it("enforces uniqueness and range in the database", () => {
    saveCourseRating(base.course.id, base.user.id, 5);
    expect(() =>
      testDb
        .insert(courseRatings)
        .values({ courseId: base.course.id, userId: base.user.id, rating: 3 })
        .run()
    ).toThrow();
    expect(() =>
      testDb
        .insert(courseRatings)
        .values({
          courseId: base.course.id,
          userId: base.instructor.id,
          rating: 6,
        })
        .run()
    ).toThrow();
  });
});
