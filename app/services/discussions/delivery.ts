import { and, eq, gt } from "drizzle-orm";
import {
  discussionNotifications,
  discussionQuestions,
  discussionReplies,
} from "~/db/schema";
import { isLearner, type LessonContext, type Store } from "./access";
import { DiscussionError } from "./errors";

export function checkPostingLimit(store: Store, actorId: number, now: Date) {
  const since = new Date(now.getTime() - 60_000).toISOString();
  // Include tombstones: deleting a post cannot reset the posting limit.
  const times = [
    ...store
      .select({ createdAt: discussionQuestions.createdAt })
      .from(discussionQuestions)
      .where(
        and(
          eq(discussionQuestions.authorId, actorId),
          gt(discussionQuestions.createdAt, since)
        )
      )
      .all(),
    ...store
      .select({ createdAt: discussionReplies.createdAt })
      .from(discussionReplies)
      .where(
        and(
          eq(discussionReplies.authorId, actorId),
          gt(discussionReplies.createdAt, since)
        )
      )
      .all(),
  ]
    .map((post) => post.createdAt)
    .sort();
  if (times.length >= 5) {
    // Enough of the newest five must expire before another creation is allowed.
    const expires = new Date(times[times.length - 5]).getTime() + 60_000;
    throw new DiscussionError(
      "rate_limited",
      "You can post five times per minute. Please try again shortly.",
      429,
      Math.max(1, Math.ceil((expires - now.getTime()) / 1000))
    );
  }
}

export function deliverActivity(
  store: Store,
  context: LessonContext,
  question: typeof discussionQuestions.$inferSelect,
  replyId: number | null,
  createdAt: string,
  currentCountry: string | null
) {
  const common = { questionId: question.id, replyId, createdAt };
  if (
    isLearner(store, context.actor.id, context.course, currentCountry) &&
    context.actor.id !== context.course.instructorId
  ) {
    store
      .insert(discussionNotifications)
      .values({
        ...common,
        recipientId: context.course.instructorId,
        inboxKind: "discussion_inbox",
      })
      .run();
  }
  // Recipients' current locations are unknown at delivery time. Recheck access
  // in their own request context when reading an inbox/count/receipt.
  if (
    replyId !== null &&
    question.authorId !== context.actor.id &&
    isLearner(store, question.authorId, context.course, null)
  ) {
    store
      .insert(discussionNotifications)
      .values({
        ...common,
        recipientId: question.authorId,
        inboxKind: "notifications",
      })
      .run();
  }
}
