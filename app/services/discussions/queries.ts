import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  discussionQuestions as questions,
  discussionReplies as replies,
  users,
} from "~/db/schema";
import { lessonContext } from "./access";
import { DiscussionError } from "./errors";
import { projectPost, projectQuestion } from "./posts";

export const DISCUSSION_PAGE_SIZE = 20;
const positiveInteger = z.number().int().positive().max(1_000_000_000);
const selectionSchema = z
  .object({
    questionsPage: positiveInteger.default(1),
    questionId: positiveInteger.optional(),
    repliesPage: positiveInteger.default(1),
    replyId: positiveInteger.optional(),
  })
  .refine(
    (value) => value.replyId === undefined || value.questionId !== undefined,
    "A reply requires a question."
  );

export function getLessonDiscussion(
  actorId: number | null,
  lessonId: number,
  selection: unknown = {},
  currentCountry: string | null = null
) {
  const context = lessonContext(db, actorId, lessonId, currentCountry);
  const parsed = selectionSchema.safeParse(selection);
  if (!parsed.success)
    throw new DiscussionError(
      "validation",
      "Invalid discussion selection.",
      400
    );
  const selected = parsed.data;
  const common = {
    settings: context.settings,
    capabilities: {
      participate: context.settings.participationEnabled,
      moderate: context.staff,
    },
    questionsPage: selected.questionsPage,
  };
  const availableQuestion = and(
    eq(questions.lessonId, lessonId),
    context.staff ? undefined : isNull(questions.hiddenAt)
  );

  if (selected.questionId === undefined) {
    const total = db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(availableQuestion)
      .get()!.count;
    const rows = db
      .select({ question: questions, authorName: users.name })
      .from(questions)
      .innerJoin(users, eq(questions.authorId, users.id))
      .where(availableQuestion)
      .orderBy(desc(questions.createdAt), desc(questions.id))
      .limit(DISCUSSION_PAGE_SIZE)
      .offset((selected.questionsPage - 1) * DISCUSSION_PAGE_SIZE)
      .all();
    return {
      ...common,
      kind: "list" as const,
      total,
      pageSize: DISCUSSION_PAGE_SIZE,
      questions: rows.map(({ question, authorName }) => {
        const projected = projectQuestion(question, context, authorName);
        const activity = db
          .select({
            count: sql<number>`count(*)`,
            latest: sql<string | null>`max(${replies.createdAt})`,
          })
          .from(replies)
          .where(eq(replies.questionId, question.id))
          .get()!;
        const { body, ...summary } = projected;
        return {
          ...summary,
          excerpt: body?.slice(0, 240) ?? null,
          replyCount: activity.count,
          latestActivityAt: activity.latest ?? question.createdAt,
        };
      }),
    };
  }

  const row = db
    .select({ question: questions, authorName: users.name })
    .from(questions)
    .innerJoin(users, eq(questions.authorId, users.id))
    .where(and(availableQuestion, eq(questions.id, selected.questionId)))
    .get();
  if (!row) return { ...common, kind: "unavailable" as const };

  let repliesPage = selected.repliesPage;
  let linkedReplyUnavailable = false;
  if (selected.replyId !== undefined) {
    const linkedReply = db
      .select()
      .from(replies)
      .where(
        and(
          eq(replies.id, selected.replyId),
          eq(replies.questionId, row.question.id)
        )
      )
      .get();
    if (!linkedReply) linkedReplyUnavailable = true;
    else {
      const before = db
        .select({ count: sql<number>`count(*)` })
        .from(replies)
        .where(
          and(
            eq(replies.questionId, row.question.id),
            or(
              lt(replies.createdAt, linkedReply.createdAt),
              and(
                eq(replies.createdAt, linkedReply.createdAt),
                lt(replies.id, linkedReply.id)
              )
            )
          )
        )
        .get()!.count;
      repliesPage = Math.floor(before / DISCUSSION_PAGE_SIZE) + 1;
      linkedReplyUnavailable =
        !!linkedReply.deletedAt || (!!linkedReply.hiddenAt && !context.staff);
    }
  }
  const total = db
    .select({ count: sql<number>`count(*)` })
    .from(replies)
    .where(eq(replies.questionId, row.question.id))
    .get()!.count;
  const rows = db
    .select({ reply: replies, authorName: users.name })
    .from(replies)
    .innerJoin(users, eq(replies.authorId, users.id))
    .where(eq(replies.questionId, row.question.id))
    .orderBy(asc(replies.createdAt), asc(replies.id))
    .limit(DISCUSSION_PAGE_SIZE)
    .offset((repliesPage - 1) * DISCUSSION_PAGE_SIZE)
    .all();
  return {
    ...common,
    kind: "thread" as const,
    question: projectQuestion(row.question, context, row.authorName),
    replies: rows.map(({ reply, authorName }) =>
      projectPost(reply, context, authorName)
    ),
    repliesPage,
    total,
    pageSize: DISCUSSION_PAGE_SIZE,
    linkedReplyUnavailable,
  };
}
