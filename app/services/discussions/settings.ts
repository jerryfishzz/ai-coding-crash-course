import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  courses,
  discussionSettings,
  lessons,
  modules,
  UserRole,
} from "~/db/schema";
import {
  effectiveSettings,
  isStaff,
  requireActor,
  requireCourse,
} from "./access";
import {
  commandResult,
  DiscussionError,
  forbidden,
  unavailable,
} from "./errors";

export function getGlobalDiscussionSettings(actorId: number | null) {
  if (requireActor(db, actorId).role !== UserRole.Admin) forbidden();
  return {
    defaultEnabled:
      db
        .select()
        .from(discussionSettings)
        .where(eq(discussionSettings.id, 1))
        .get()?.defaultEnabled ?? false,
  };
}

export function getCourseDiscussionSettings(
  actorId: number | null,
  courseId: number,
  lessonId?: number
) {
  const actor = requireActor(db, actorId);
  const course = requireCourse(db, courseId);
  if (!isStaff(actor, course)) forbidden();
  let paused = false;
  if (lessonId !== undefined) {
    const row = db
      .select({ lesson: lessons, courseId: modules.courseId })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(lessons.id, lessonId))
      .get();
    if (!row || row.courseId !== courseId) unavailable();
    paused = row.lesson.discussionPaused;
  }
  return {
    ...effectiveSettings(db, course, paused),
    canManage: actor.role === UserRole.Admin,
  };
}

const settingSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("discussion-set-global"),
    value: z.enum(["enabled", "disabled"]),
  }),
  z.object({
    intent: z.literal("discussion-set-course"),
    value: z.enum(["inherit", "enabled", "disabled"]),
  }),
  z.object({
    intent: z.literal("discussion-set-lesson"),
    value: z.enum(["inherit", "disabled"]),
  }),
]);

// Target IDs come from the route, never from a submitted form's hidden IDs.
export type SettingTarget =
  | { level: "global" }
  | { level: "course"; courseId: number }
  | { level: "lesson"; courseId: number; lessonId: number };

export function updateDiscussionSetting(
  actorId: number | null,
  target: SettingTarget,
  input: unknown
) {
  return commandResult(() =>
    db.transaction(
      (tx) => {
        if (requireActor(tx, actorId).role !== UserRole.Admin) forbidden();
        const parsed = settingSchema.safeParse(input);
        if (!parsed.success)
          throw new DiscussionError(
            "validation",
            "Choose a valid discussion setting.",
            400
          );
        const setting = parsed.data;
        if (setting.intent !== `discussion-set-${target.level}`)
          throw new DiscussionError(
            "validation",
            "Invalid setting action.",
            400
          );
        if (
          target.level === "global" &&
          setting.intent === "discussion-set-global"
        ) {
          const defaultEnabled = setting.value === "enabled";
          tx.insert(discussionSettings)
            .values({ id: 1, defaultEnabled })
            .onConflictDoUpdate({
              target: discussionSettings.id,
              set: { defaultEnabled },
            })
            .run();
        } else if (
          target.level === "course" &&
          setting.intent === "discussion-set-course"
        ) {
          requireCourse(tx, target.courseId);
          tx.update(courses)
            .set({ discussionOverride: setting.value })
            .where(eq(courses.id, target.courseId))
            .run();
        } else if (
          target.level === "lesson" &&
          setting.intent === "discussion-set-lesson"
        ) {
          requireCourse(tx, target.courseId);
          const row = tx
            .select({ id: lessons.id, courseId: modules.courseId })
            .from(lessons)
            .innerJoin(modules, eq(lessons.moduleId, modules.id))
            .where(eq(lessons.id, target.lessonId))
            .get();
          if (!row || row.courseId !== target.courseId) unavailable();
          tx.update(lessons)
            .set({ discussionPaused: setting.value === "disabled" })
            .where(eq(lessons.id, target.lessonId))
            .run();
        }
        return { success: true as const };
      },
      { behavior: "immediate" }
    )
  );
}
