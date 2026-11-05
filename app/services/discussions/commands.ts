import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  discussionQuestions,
  discussionReplies,
  discussionReports,
} from "~/db/schema";
import { lessonContext, requireParticipation } from "./access";
import { checkPostingLimit, deliverActivity } from "./delivery";
import {
  commandResult,
  DiscussionError,
  forbidden,
  unavailable,
} from "./errors";
import { requireQuestion, requireReply } from "./posts";

const id = z.number().int().positive().safe();
const title = z.string().trim().min(1, "A title is required.").max(160);
const body = z
  .string()
  .min(1)
  .max(10_000)
  .refine((value) => !!value.trim(), "A message is required.");
const questionTarget = { questionId: id };
const replyTarget = { questionId: id, replyId: id };
const moderationTarget = { questionId: id, replyId: id.optional() };
const commandSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("discussion-create-question"), title, body }),
  z.object({
    intent: z.literal("discussion-create-reply"),
    ...questionTarget,
    body,
  }),
  z.object({
    intent: z.literal("discussion-edit-question"),
    ...questionTarget,
    title,
    body,
  }),
  z.object({
    intent: z.literal("discussion-edit-reply"),
    ...replyTarget,
    body,
  }),
  z.object({
    intent: z.literal("discussion-delete-question"),
    ...questionTarget,
  }),
  z.object({ intent: z.literal("discussion-delete-reply"), ...replyTarget }),
  z.object({ intent: z.literal("discussion-resolve"), ...questionTarget }),
  z.object({ intent: z.literal("discussion-reopen"), ...questionTarget }),
  z.object({
    intent: z.literal("discussion-report"),
    ...moderationTarget,
    reason: z.string().trim().max(2000).optional(),
  }),
  z.object({ intent: z.literal("discussion-hide"), ...moderationTarget }),
  z.object({ intent: z.literal("discussion-restore"), ...moderationTarget }),
]);

export function executeDiscussionCommand(
  actorId: number | null,
  lessonId: number,
  input: unknown,
  currentCountry: string | null = null
) {
  return commandResult(() =>
    db.transaction(
      (tx) => {
        const context = lessonContext(tx, actorId, lessonId, currentCountry);
        const parsed = commandSchema.safeParse(input);
        if (!parsed.success)
          throw new DiscussionError(
            "validation",
            "Check your discussion fields.",
            400,
            undefined,
            parsed.error.flatten().fieldErrors
          );
        const command = parsed.data;
        const now = new Date();
        const timestamp = now.toISOString();

        if (command.intent === "discussion-create-question") {
          requireParticipation(context);
          checkPostingLimit(tx, context.actor.id, now);
          const question = tx
            .insert(discussionQuestions)
            .values({
              lessonId,
              authorId: context.actor.id,
              title: command.title,
              body: command.body,
              createdAt: timestamp,
            })
            .returning()
            .get();
          deliverActivity(
            tx,
            context,
            question,
            null,
            timestamp,
            currentCountry
          );
          return { questionId: question.id };
        }

        const question = requireQuestion(tx, context, command.questionId);
        if (command.intent === "discussion-create-reply") {
          requireParticipation(context);
          checkPostingLimit(tx, context.actor.id, now);
          const reply = tx
            .insert(discussionReplies)
            .values({
              questionId: question.id,
              authorId: context.actor.id,
              body: command.body,
              createdAt: timestamp,
            })
            .returning()
            .get();
          deliverActivity(
            tx,
            context,
            question,
            reply.id,
            timestamp,
            currentCountry
          );
          return { questionId: question.id, replyId: reply.id };
        }

        const reply =
          "replyId" in command && command.replyId !== undefined
            ? requireReply(tx, question.id, command.replyId)
            : undefined;
        const post = reply ?? question;
        if (post.hiddenAt && !context.staff) unavailable();
        if (post.deletedAt) unavailable();

        if (command.intent === "discussion-report") {
          tx.insert(discussionReports)
            .values({
              reporterId: context.actor.id,
              questionId: reply ? null : question.id,
              replyId: reply?.id ?? null,
              reason: command.reason || null,
              createdAt: timestamp,
            })
            .run();
        } else if (
          command.intent === "discussion-hide" ||
          command.intent === "discussion-restore"
        ) {
          if (!context.staff) forbidden();
          const hide = command.intent === "discussion-hide";
          const update = {
            hiddenAt: hide ? timestamp : null,
            hiddenBy: hide ? context.actor.id : null,
          };
          if (reply)
            tx.update(discussionReplies)
              .set(update)
              .where(eq(discussionReplies.id, reply.id))
              .run();
          else
            tx.update(discussionQuestions)
              .set(update)
              .where(eq(discussionQuestions.id, question.id))
              .run();
        } else {
          requireParticipation(context);
          if (
            command.intent === "discussion-resolve" ||
            command.intent === "discussion-reopen"
          ) {
            if (question.authorId !== context.actor.id && !context.staff)
              forbidden();
            const resolve = command.intent === "discussion-resolve";
            tx.update(discussionQuestions)
              .set({
                resolvedAt: resolve ? timestamp : null,
                resolvedBy: resolve ? context.actor.id : null,
              })
              .where(eq(discussionQuestions.id, question.id))
              .run();
          } else {
            if (post.authorId !== context.actor.id) forbidden();
            switch (command.intent) {
              case "discussion-edit-question":
                tx.update(discussionQuestions)
                  .set({
                    title: command.title,
                    body: command.body,
                    editedAt: timestamp,
                  })
                  .where(eq(discussionQuestions.id, question.id))
                  .run();
                break;
              case "discussion-edit-reply":
                tx.update(discussionReplies)
                  .set({ body: command.body, editedAt: timestamp })
                  .where(eq(discussionReplies.id, post.id))
                  .run();
                break;
              case "discussion-delete-question":
                tx.update(discussionQuestions)
                  .set({ title: "", body: "", deletedAt: timestamp })
                  .where(eq(discussionQuestions.id, question.id))
                  .run();
                break;
              case "discussion-delete-reply":
                tx.update(discussionReplies)
                  .set({ body: "", deletedAt: timestamp })
                  .where(eq(discussionReplies.id, post.id))
                  .run();
                break;
            }
          }
        }
        return {
          questionId: question.id,
          ...(reply ? { replyId: reply.id } : {}),
        };
      },
      { behavior: "immediate" }
    )
  );
}
