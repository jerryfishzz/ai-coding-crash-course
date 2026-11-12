import { and, eq } from "drizzle-orm";
import { discussionQuestions, discussionReplies } from "~/db/schema";
import type { LessonContext, Store } from "./access";
import { unavailable } from "./errors";

export function requireQuestion(
  store: Store,
  context: LessonContext,
  questionId: number
) {
  const question = store
    .select()
    .from(discussionQuestions)
    .where(
      and(
        eq(discussionQuestions.id, questionId),
        eq(discussionQuestions.lessonId, context.lesson.id)
      )
    )
    .get();
  if (!question || (question.hiddenAt && !context.staff)) unavailable();
  return question;
}

export function requireReply(
  store: Store,
  questionId: number,
  replyId: number
) {
  const reply = store
    .select()
    .from(discussionReplies)
    .where(
      and(
        eq(discussionReplies.id, replyId),
        eq(discussionReplies.questionId, questionId)
      )
    )
    .get();
  if (!reply) unavailable();
  return reply;
}

type Post =
  | typeof discussionReplies.$inferSelect
  | typeof discussionQuestions.$inferSelect;

export function projectPost(
  post: Post,
  context: LessonContext,
  authorName: string
) {
  const deleted = !!post.deletedAt;
  const hidden = !!post.hiddenAt;
  const visible = !deleted && (!hidden || context.staff);
  const own = context.actor.id === post.authorId;
  return {
    id: post.id,
    authorId: post.authorId,
    authorName,
    instructor: post.authorId === context.course.instructorId,
    body: visible ? post.body : null,
    createdAt: post.createdAt,
    editedAt: post.editedAt,
    deleted,
    hidden,
    capabilities: {
      edit: visible && own && context.settings.participationEnabled,
      delete: visible && own && context.settings.participationEnabled,
      report: visible,
      moderate: context.staff && !deleted,
    },
  };
}

export function projectQuestion(
  question: typeof discussionQuestions.$inferSelect,
  context: LessonContext,
  authorName: string
) {
  const post = projectPost(question, context, authorName);
  return {
    ...post,
    title: post.body === null ? "Deleted question" : question.title,
    resolved: !!question.resolvedAt,
    resolvedAt: question.resolvedAt,
    capabilities: {
      ...post.capabilities,
      resolve:
        !post.deleted &&
        context.settings.participationEnabled &&
        (context.staff || context.actor.id === question.authorId),
      reply: context.settings.participationEnabled,
    },
  };
}
