import { eq } from "drizzle-orm";
import type { db as applicationDb } from "../app/db";
import {
  discussionNotifications,
  discussionQuestions,
  discussionReplies,
  enrollments,
  lessons,
  modules,
} from "../app/db/schema";

// Add examples without enabling the pilot or resetting an existing database.
export function seedDiscussionActivity(
  db: typeof applicationDb,
  teachingCourseId: number,
  learningCourseId: number,
  instructorId: number,
  otherInstructorId: number,
  studentId: number
) {
  function firstLesson(courseId: number) {
    return db
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId))
      .orderBy(modules.position, lessons.position, lessons.id)
      .get()!.id;
  }
  const date = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString();
  db.insert(enrollments)
    .values({ userId: instructorId, courseId: learningCourseId })
    .run();
  for (const [lessonId, learnerId, ownerId, title, body] of [
    [
      firstLesson(teachingCourseId),
      studentId,
      instructorId,
      "When should I add an explicit type?",
      "How do I decide between type inference and an explicit annotation?",
    ],
    [
      firstLesson(learningCourseId),
      instructorId,
      otherInstructorId,
      "How should an API return validation errors?",
      "I’m taking this course to improve my backend skills. What makes an error response useful to callers?",
    ],
  ] as const) {
    const question = db
      .insert(discussionQuestions)
      .values({
        lessonId,
        authorId: learnerId,
        title,
        body,
        createdAt: date(3),
      })
      .returning()
      .get();
    db.insert(discussionNotifications)
      .values({
        recipientId: ownerId,
        inboxKind: "discussion_inbox",
        questionId: question.id,
        createdAt: question.createdAt,
      })
      .run();
    for (const [text, days, readAt] of [
      [
        "Start with the public contract; it helps readers understand what to expect.",
        2,
        date(1.5),
      ],
      [
        "The next lesson has another example. Does that clarify your question?",
        1,
        null,
      ],
    ] as const) {
      const reply = db
        .insert(discussionReplies)
        .values({
          questionId: question.id,
          authorId: ownerId,
          body: text,
          createdAt: date(days),
        })
        .returning()
        .get();
      db.insert(discussionNotifications)
        .values({
          recipientId: learnerId,
          inboxKind: "notifications",
          questionId: question.id,
          replyId: reply.id,
          createdAt: reply.createdAt,
          readAt,
        })
        .run();
    }
    const followUp = db
      .insert(discussionReplies)
      .values({
        questionId: question.id,
        authorId: learnerId,
        body: "That helps. Could you show one more example?",
        createdAt: date(0.5),
      })
      .returning()
      .get();
    db.insert(discussionNotifications)
      .values({
        recipientId: ownerId,
        inboxKind: "discussion_inbox",
        questionId: question.id,
        replyId: followUp.id,
        createdAt: followUp.createdAt,
      })
      .run();
  }
}
