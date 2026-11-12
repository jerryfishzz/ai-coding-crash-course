import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  courses,
  discussionNotifications as notifications,
  discussionQuestions as questions,
  discussionReplies as replies,
  enrollments,
  lessons,
  modules,
  purchases,
  users,
  UserRole,
  type DiscussionInboxKind,
} from "~/db/schema";
import { checkPppAccess } from "~/lib/ppp";
import { lessonContext, requireActor, type Store } from "./access";
import { DiscussionError } from "./errors";
import { requireQuestion, requireReply } from "./posts";
import { DISCUSSION_PAGE_SIZE } from "./queries";

// Resolve geographic access once per enrolled course, not once per delivery.
// Both the count and the paginated query use this exact SQL predicate.
function eligibility(
  store: Store,
  actorId: number | null,
  country: string | null
) {
  const actor = requireActor(store, actorId);
  const learningCourses = store
    .select({ course: courses, purchaseCountry: purchases.country })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .leftJoin(
      purchases,
      and(eq(purchases.courseId, courses.id), eq(purchases.userId, actor.id))
    )
    .where(
      and(eq(enrollments.userId, actor.id), ne(courses.instructorId, actor.id))
    )
    .all()
    .filter(
      ({ course, purchaseCountry }) =>
        !checkPppAccess(
          course.price,
          course.pppEnabled,
          purchaseCountry,
          country
        ).blocked
    )
    .map(({ course }) => course.id);
  const staff =
    actor.role === UserRole.Admin ? sql`1` : eq(courses.instructorId, actor.id);
  const sourceVisible = and(
    or(staff, isNull(questions.hiddenAt)),
    or(
      and(
        isNull(notifications.replyId),
        isNull(questions.deletedAt),
        ne(questions.authorId, actor.id)
      ),
      and(
        isNotNull(notifications.replyId),
        isNotNull(replies.id),
        isNull(replies.deletedAt),
        or(staff, isNull(replies.hiddenAt)),
        ne(replies.authorId, actor.id)
      )
    )
  );
  return and(
    eq(notifications.recipientId, actor.id),
    sourceVisible,
    or(
      and(
        eq(notifications.inboxKind, "discussion_inbox"),
        eq(courses.instructorId, actor.id)
      ),
      and(
        eq(notifications.inboxKind, "notifications"),
        isNotNull(notifications.replyId),
        eq(questions.authorId, actor.id),
        inArray(courses.id, learningCourses)
      )
    )
  );
}

function activityQuery(store: Store) {
  return store
    .select({
      id: notifications.id,
      inboxKind: notifications.inboxKind,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      questionId: questions.id,
      replyId: notifications.replyId,
      questionTitle:
        sql<string>`case when ${questions.deletedAt} is not null then 'Deleted question' else ${questions.title} end`.as(
          "question_title"
        ),
      excerpt:
        sql<string>`substr(case when ${notifications.replyId} is null then ${questions.body} else ${replies.body} end, 1, 240)`.as(
          "excerpt"
        ),
      authorName: users.name,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
    })
    .from(notifications)
    .innerJoin(questions, eq(notifications.questionId, questions.id))
    .leftJoin(
      replies,
      and(
        eq(notifications.replyId, replies.id),
        eq(replies.questionId, questions.id)
      )
    )
    .innerJoin(lessons, eq(questions.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .innerJoin(
      users,
      eq(users.id, sql`coalesce(${replies.authorId}, ${questions.authorId})`)
    );
}

function unreadCounts(store: Store, eligible: ReturnType<typeof eligibility>) {
  const visible = activityQuery(store)
    .where(and(eligible, isNull(notifications.readAt)))
    .as("visible_activity");
  const rows = store
    .select({ kind: visible.inboxKind, count: sql<number>`count(*)` })
    .from(visible)
    .groupBy(visible.inboxKind)
    .all();
  return {
    notifications: rows.find((row) => row.kind === "notifications")?.count ?? 0,
    discussionInbox:
      rows.find((row) => row.kind === "discussion_inbox")?.count ?? 0,
  };
}

export function getDiscussionUnreadCounts(
  actorId: number | null,
  country: string | null = null
) {
  return unreadCounts(db, eligibility(db, actorId, country));
}

export function getDiscussionInbox(
  actorId: number | null,
  kind: DiscussionInboxKind,
  page = 1,
  country: string | null = null
) {
  const eligible = eligibility(db, actorId, country);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1_000_000_000 ||
    !["notifications", "discussion_inbox"].includes(kind)
  )
    throw new DiscussionError("validation", "Invalid inbox page.", 400);
  const where = and(eligible, eq(notifications.inboxKind, kind));
  const visible = activityQuery(db).where(where).as("visible_activity");
  const total = db
    .select({ count: sql<number>`count(*)` })
    .from(visible)
    .get()!.count;
  return {
    kind,
    page,
    pageSize: DISCUSSION_PAGE_SIZE,
    total,
    entries: activityQuery(db)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(DISCUSSION_PAGE_SIZE)
      .offset((page - 1) * DISCUSSION_PAGE_SIZE)
      .all(),
  };
}

const id = z.number().int().positive().max(1_000_000_000);
const receiptSchema = z
  .object({
    lessonId: id,
    questionId: id,
    replyIds: z.array(id).max(DISCUSSION_PAGE_SIZE),
  })
  .strict()
  .refine((value) => new Set(value.replyIds).size === value.replyIds.length);

export function acknowledgeDiscussionSources(
  actorId: number | null,
  input: unknown,
  country: string | null = null
) {
  requireActor(db, actorId);
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success)
    throw new DiscussionError("validation", "Invalid read receipt.", 400);
  return db.transaction(
    (tx) => {
      const { lessonId, questionId, replyIds } = parsed.data;
      const context = lessonContext(tx, actorId, lessonId, country);
      requireQuestion(tx, context, questionId);
      // Validate the complete batch before changing anything. Visibility can have
      // changed after render; filtered sources stay unread rather than leaking data.
      for (const replyId of replyIds) requireReply(tx, questionId, replyId);
      const eligible = eligibility(tx, actorId, country);
      const visible = activityQuery(tx)
        .where(
          and(
            eligible,
            eq(questions.id, questionId),
            isNull(notifications.readAt),
            or(
              isNull(notifications.replyId),
              inArray(notifications.replyId, replyIds)
            )
          )
        )
        .all();
      if (visible.length)
        tx.update(notifications)
          .set({ readAt: new Date().toISOString() })
          .where(
            inArray(
              notifications.id,
              visible.map((row) => row.id)
            )
          )
          .run();
      return unreadCounts(tx, eligible);
    },
    { behavior: "immediate" }
  );
}
