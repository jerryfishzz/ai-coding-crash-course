import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  discussionSettings,
  enrollments,
  lessons,
  modules,
  purchases,
  users,
  CourseStatus,
  UserRole,
} from "~/db/schema";
import { checkPppAccess } from "~/lib/ppp";
import { DiscussionError, forbidden, unavailable } from "./errors";

// Both the database and a synchronous transaction implement this interface.
export type Store = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export function requireActor(store: Store, actorId: number | null) {
  const actor =
    actorId && Number.isSafeInteger(actorId)
      ? store.select().from(users).where(eq(users.id, actorId)).get()
      : undefined;
  if (!actor)
    throw new DiscussionError("unauthenticated", "Please sign in.", 401);
  return actor;
}

export function requireCourse(store: Store, courseId: number) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) unavailable();
  const course = store
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) unavailable();
  return course;
}

export function isStaff(
  actor: typeof users.$inferSelect,
  course: typeof courses.$inferSelect
) {
  return actor.role === UserRole.Admin || actor.id === course.instructorId;
}

export function effectiveSettings(
  store: Store,
  course: typeof courses.$inferSelect,
  paused = false
) {
  const defaultEnabled =
    store
      .select()
      .from(discussionSettings)
      .where(eq(discussionSettings.id, 1))
      .get()?.defaultEnabled ?? false;
  const courseEnabled =
    course.discussionOverride === "inherit"
      ? defaultEnabled
      : course.discussionOverride === "enabled";
  const archived = course.status === CourseStatus.Archived;
  return {
    defaultEnabled,
    courseOverride: course.discussionOverride,
    courseEnabled,
    lessonPaused: paused,
    archived,
    participationEnabled: courseEnabled && !paused && !archived,
  };
}

export function isLearner(
  store: Store,
  userId: number,
  course: typeof courses.$inferSelect,
  currentCountry: string | null
) {
  // Staff authority and learning notification eligibility are separate relationships.
  if (userId === course.instructorId) return false;
  const enrollment = store
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, course.id))
    )
    .get();
  if (!enrollment) return false;
  const purchase = store
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, course.id)))
    .get();
  return !checkPppAccess(
    course.price,
    course.pppEnabled,
    purchase?.country ?? null,
    currentCountry
  ).blocked;
}

export function lessonContext(
  store: Store,
  actorId: number | null,
  lessonId: number,
  currentCountry: string | null
) {
  const actor = requireActor(store, actorId);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1) unavailable();
  const row = store
    .select({ lesson: lessons, course: courses })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
  if (!row) unavailable();
  const staff = isStaff(actor, row.course);
  if (!staff && !isLearner(store, actor.id, row.course, currentCountry))
    forbidden();
  return {
    ...row,
    actor,
    staff,
    settings: effectiveSettings(store, row.course, row.lesson.discussionPaused),
  };
}

export type LessonContext = ReturnType<typeof lessonContext>;

export function requireParticipation(context: LessonContext) {
  if (!context.settings.participationEnabled) {
    throw new DiscussionError(
      "participation_paused",
      "Discussions are paused. Your draft has been kept.",
      409
    );
  }
}
