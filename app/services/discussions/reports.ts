import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  discussionQuestions,
  discussionReplies,
  discussionReports,
  lessons,
  modules,
  users,
} from "~/db/schema";
import { isStaff, requireActor, requireCourse, type Store } from "./access";
import {
  commandResult,
  DiscussionError,
  forbidden,
  unavailable,
} from "./errors";
import { DISCUSSION_PAGE_SIZE } from "./queries";

function requireCourseModerator(
  store: Store,
  actorId: number | null,
  courseId: number
) {
  const actor = requireActor(store, actorId);
  const course = requireCourse(store, courseId);
  if (!isStaff(actor, course)) forbidden();
  return actor;
}

// Resolve a report's source on the server, including its complete course path.
function reportsQuery(store: Store, courseId: number) {
  return store
    .select({
      report: discussionReports,
      question: discussionQuestions,
      reply: discussionReplies,
      reporterName: users.name,
      lessonTitle: lessons.title,
    })
    .from(discussionReports)
    .leftJoin(
      discussionReplies,
      eq(discussionReports.replyId, discussionReplies.id)
    )
    .innerJoin(
      discussionQuestions,
      or(
        eq(discussionReports.questionId, discussionQuestions.id),
        eq(discussionReplies.questionId, discussionQuestions.id)
      )
    )
    .innerJoin(lessons, eq(discussionQuestions.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(users, eq(discussionReports.reporterId, users.id))
    .where(eq(modules.courseId, courseId))
    .$dynamic();
}

export function getCourseDiscussionReports(
  actorId: number | null,
  courseId: number,
  page = 1
) {
  requireCourseModerator(db, actorId, courseId);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000_000)
    throw new DiscussionError("validation", "Invalid reports page.", 400);
  const courseQuestions = db
    .select({ id: discussionQuestions.id })
    .from(discussionQuestions)
    .innerJoin(lessons, eq(discussionQuestions.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId));
  const total = db
    .select({ count: sql<number>`count(*)` })
    .from(discussionReports)
    .where(
      sql`
    ${discussionReports.questionId} in (${courseQuestions}) or ${discussionReports.replyId} in
    (select ${discussionReplies.id} from ${discussionReplies} where ${discussionReplies.questionId} in (${courseQuestions}))
  `
    )
    .get()!.count;
  return {
    reports: reportsQuery(db, courseId)
      .orderBy(desc(discussionReports.createdAt), desc(discussionReports.id))
      .limit(DISCUSSION_PAGE_SIZE)
      .offset((page - 1) * DISCUSSION_PAGE_SIZE)
      .all(),
    page,
    pageSize: DISCUSSION_PAGE_SIZE,
    total,
  };
}

const reviewSchema = z.object({
  intent: z.enum([
    "discussion-dismiss-report",
    "discussion-hide-reported-content",
  ]),
  reportId: z.number().int().positive().safe(),
});

export function reviewDiscussionReport(
  actorId: number | null,
  courseId: number,
  input: unknown
) {
  return commandResult(() =>
    db.transaction(
      (tx) => {
        const actor = requireCourseModerator(tx, actorId, courseId);
        const parsed = reviewSchema.safeParse(input);
        if (!parsed.success)
          throw new DiscussionError(
            "validation",
            "Invalid report action.",
            400
          );
        const { intent, reportId } = parsed.data;
        const source = reportsQuery(tx, courseId)
          .where(
            and(
              eq(modules.courseId, courseId),
              eq(discussionReports.id, reportId)
            )
          )
          .get();
        if (!source) unavailable();
        // Repeated review submissions are harmless and preserve the original audit.
        if (source.report.reviewedAt) return { reportId };
        const timestamp = new Date().toISOString();
        const hide = intent === "discussion-hide-reported-content";
        if (hide) {
          const post = source.reply ?? source.question;
          if (!post.deletedAt) {
            const update = { hiddenAt: timestamp, hiddenBy: actor.id };
            if (source.reply)
              tx.update(discussionReplies)
                .set(update)
                .where(eq(discussionReplies.id, post.id))
                .run();
            else
              tx.update(discussionQuestions)
                .set(update)
                .where(eq(discussionQuestions.id, post.id))
                .run();
          }
        }
        tx.update(discussionReports)
          .set({
            outcome: hide ? "hidden" : "dismissed",
            reviewedAt: timestamp,
            reviewedBy: actor.id,
          })
          .where(
            and(
              eq(discussionReports.id, reportId),
              isNull(discussionReports.reviewedAt)
            )
          )
          .run();
        return { reportId };
      },
      { behavior: "immediate" }
    )
  );
}
