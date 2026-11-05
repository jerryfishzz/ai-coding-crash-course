import { eq } from "drizzle-orm";
import type { db as applicationDb } from "../app/db";
import {
  courses,
  discussionNotifications,
  discussionQuestions,
  discussionReplies,
  discussionReports,
  discussionSettings,
  lessons,
  modules,
} from "../app/db/schema";

// Used only by the reset seed, against its newly created courses and accounts.
// The migration and normal application startup never activate a pilot.
export function seedDiscussionPilot(
  db: typeof applicationDb,
  courseId: number,
  studentId: number,
  adminId: number
) {
  return db.transaction((tx) => {
    const course = tx
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .get();
    const lesson = tx
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId))
      .orderBy(modules.position, lessons.position, lessons.id)
      .get();
    if (!course || !lesson)
      throw new Error("The pilot needs a course and lesson.");
    const ownerId = course.instructorId;
    const date = (days: number) =>
      new Date(Date.now() - days * 86_400_000).toISOString();

    tx.insert(discussionSettings)
      .values({ id: 1, defaultEnabled: false })
      .onConflictDoUpdate({
        target: discussionSettings.id,
        set: { defaultEnabled: false },
      })
      .run();
    tx.update(courses)
      .set({ discussionOverride: "enabled" })
      .where(eq(courses.id, courseId))
      .run();

    const titles = [
      "How can I narrow an API response safely?",
      "Why does a literal type become a string?",
      "Example awaiting moderation",
      "", // Deleted question: original title and body have been cleared.
      "When should a function return unknown?",
      "How do optional properties differ from undefined?",
      "Can an interface describe a callback?",
      "How do I type a readonly array?",
      "What makes a useful discriminant?",
      "Where should shared types live?",
      "How do I narrow a value inside a loop?",
      "When does TypeScript infer a union?",
      "How can I model a successful result?",
      "What is a safe default for a type parameter?",
      "How do I check an external JSON value?",
      "Can I keep a tuple immutable?",
      "How do I model an optional callback?",
      "What does the never type tell us?",
      "Why does this property need narrowing?",
      "How do I describe an asynchronous function?",
      "When should I use a type predicate?",
      "How do I keep object keys as literal types?",
    ];
    const questions = titles.map((title, index) => {
      const createdAt = date(index === 0 ? 0.3 : 0.5 + index / 10);
      const question = tx
        .insert(discussionQuestions)
        .values({
          lessonId: lesson.id,
          authorId: studentId,
          title,
          body:
            index === 3
              ? ""
              : index === 0
                ? `I receive data from an API and want to narrow it before use. How should I validate it?\n\n\`\`\`ts\nconst endpoint = "https://example.test/${"very-long-path-segment/".repeat(18)}";\nconst payload: unknown = await response.json();\n\`\`\`\n\nHere is a long reference link: https://example.test/${"reference".repeat(35)}`
                : "Could you explain this using the example from the lesson?",
          createdAt,
          resolvedAt: index === 1 ? date(0.4) : null,
          resolvedBy: index === 1 ? studentId : null,
          hiddenAt: index === 2 ? date(0.4) : null,
          hiddenBy: index === 2 ? adminId : null,
          deletedAt: index === 3 ? date(0.4) : null,
        })
        .returning()
        .get();
      tx.insert(discussionNotifications)
        .values({
          recipientId: ownerId,
          inboxKind: "discussion_inbox",
          questionId: question.id,
          createdAt,
          readAt: index % 4 === 1 ? date(0.1) : null,
        })
        .run();
      return question;
    });

    const replies = Array.from({ length: 23 }, (_, index) => {
      const authorId = index % 3 === 0 ? ownerId : studentId;
      const createdAt = date(0.28 - index / 100);
      const reply = tx
        .insert(discussionReplies)
        .values({
          questionId: questions[0].id,
          authorId,
          body:
            index === 4
              ? ""
              : index === 3
                ? "This example is hidden while staff review it."
                : authorId === ownerId
                  ? `Example ${index + 1}: validate the response before narrowing it.\n\n\`\`\`ts\nif (typeof payload === "object" && payload !== null && "status" in payload) {\n  // Continue checking each required field.\n}\n\`\`\``
                  : `Follow-up ${index + 1}: does the same check work when a field is optional?`,
          createdAt,
          hiddenAt: index === 3 ? date(0.02) : null,
          hiddenBy: index === 3 ? adminId : null,
          deletedAt: index === 4 ? date(0.02) : null,
          editedAt: index === 6 ? date(0.02) : null,
        })
        .returning()
        .get();
      tx.insert(discussionNotifications)
        .values({
          recipientId: authorId === ownerId ? studentId : ownerId,
          inboxKind:
            authorId === ownerId ? "notifications" : "discussion_inbox",
          questionId: questions[0].id,
          replyId: reply.id,
          createdAt,
          readAt: index % 5 === 0 ? date(0.01) : null,
        })
        .run();
      return reply;
    });
    // A deleted parent still keeps other participants' replies.
    tx.insert(discussionReplies)
      .values({
        questionId: questions[3].id,
        authorId: ownerId,
        body: "This reply remains available after the author removed the question.",
        createdAt: date(0.6),
      })
      .run();
    tx.insert(discussionReports)
      .values([
        {
          reporterId: studentId,
          replyId: replies[0].id,
          reason: "Could staff check this example?",
          createdAt: date(0.02),
        },
        {
          reporterId: ownerId,
          replyId: replies[4].id,
          reason: "Reported before its author deleted it.",
          createdAt: date(0.03),
        },
        {
          reporterId: studentId,
          replyId: replies[3].id,
          reason: "This reply needs review.",
          createdAt: date(0.03),
          outcome: "hidden",
          reviewedAt: date(0.02),
          reviewedBy: adminId,
        },
        {
          reporterId: ownerId,
          questionId: questions[2].id,
          reason: "Please review this question.",
          createdAt: date(0.5),
          outcome: "hidden",
          reviewedAt: date(0.4),
          reviewedBy: adminId,
        },
        {
          reporterId: ownerId,
          questionId: questions[1].id,
          reason: "Review requested for context.",
          createdAt: date(0.5),
          outcome: "dismissed",
          reviewedAt: date(0.4),
          reviewedBy: adminId,
        },
      ])
      .run();
    return {
      lessonId: lesson.id,
      questionIds: questions.map((q) => q.id),
      replyIds: replies.map((r) => r.id),
    };
  });
}
