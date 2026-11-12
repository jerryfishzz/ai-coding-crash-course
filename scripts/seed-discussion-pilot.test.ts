import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "../app/test/setup";
import {
  courses,
  CourseStatus,
  discussionQuestions,
  discussionReplies,
  discussionReports,
  enrollments,
  lessons,
  modules,
  UserRole,
  users,
} from "../app/db/schema";
import { seedDiscussionPilot } from "./seed-discussion-pilot";

let testDb: ReturnType<typeof createTestDb>;
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import {
  getCourseDiscussionSettings,
  getDiscussionInbox,
  getDiscussionUnreadCounts,
  getGlobalDiscussionSettings,
  getLessonDiscussion,
} from "../app/services/discussions";

beforeEach(() => {
  testDb = createTestDb();
});
afterEach(() => {
  testDb.$client.close();
});

it("seeds one enabled pilot, inheritance, second pages and safe moderation/history examples using returned identities", () => {
  // Offset all identities to catch accidental assumptions about seeded IDs.
  testDb
    .insert(users)
    .values({
      name: "Earlier account",
      email: "earlier@test.dev",
      role: UserRole.Student,
    })
    .run();
  const { course, user, instructor, category } = seedBaseData(testDb);
  const admin = testDb
    .insert(users)
    .values({ name: "Admin", email: "admin@test.dev", role: UserRole.Admin })
    .returning()
    .get();
  const otherCourse = testDb
    .insert(courses)
    .values({
      title: "Other course",
      slug: "other",
      description: "Inherits",
      categoryId: category.id,
      instructorId: instructor.id,
      status: CourseStatus.Published,
    })
    .returning()
    .get();
  const mod = testDb
    .insert(modules)
    .values({ courseId: course.id, title: "First module", position: 1 })
    .returning()
    .get();
  const firstLesson = testDb
    .insert(lessons)
    .values({ moduleId: mod.id, title: "First lesson", position: 1 })
    .returning()
    .get();
  const secondLesson = testDb
    .insert(lessons)
    .values({ moduleId: mod.id, title: "Second lesson", position: 2 })
    .returning()
    .get();
  testDb
    .insert(enrollments)
    .values({ courseId: course.id, userId: user.id })
    .run();

  const fixture = seedDiscussionPilot(testDb, course.id, user.id, admin.id);
  expect(fixture.lessonId).toBe(firstLesson.id);
  expect(getGlobalDiscussionSettings(admin.id).defaultEnabled).toBe(false);
  expect(getCourseDiscussionSettings(admin.id, course.id).courseEnabled).toBe(
    true
  );
  expect(getCourseDiscussionSettings(admin.id, otherCourse.id)).toMatchObject({
    courseOverride: "inherit",
    courseEnabled: false,
  });
  expect(
    testDb
      .select()
      .from(lessons)
      .all()
      .every((lesson) => !lesson.discussionPaused)
  ).toBe(true);
  expect(
    getLessonDiscussion(user.id, secondLesson.id).capabilities.participate
  ).toBe(true);
  const newLesson = testDb
    .insert(lessons)
    .values({ moduleId: mod.id, title: "New lesson", position: 3 })
    .returning()
    .get();
  expect(newLesson.discussionPaused).toBe(false);
  expect(
    getLessonDiscussion(user.id, newLesson.id).capabilities.participate
  ).toBe(true);

  const first = getLessonDiscussion(user.id, firstLesson.id);
  const second = getLessonDiscussion(user.id, firstLesson.id, {
    questionsPage: 2,
  });
  expect(first.kind).toBe("list");
  expect(first.kind === "list" && first.questions).toHaveLength(20);
  expect(second.kind === "list" && second.questions).toHaveLength(1);
  expect(
    first.kind === "list" &&
      first.questions.find((q) => q.id === fixture.questionIds[1])?.resolved
  ).toBe(true);
  expect(
    getLessonDiscussion(user.id, firstLesson.id, {
      questionId: fixture.questionIds[2],
    }).kind
  ).toBe("unavailable");

  const detail = getLessonDiscussion(user.id, firstLesson.id, {
    questionId: fixture.questionIds[0],
  });
  if (detail.kind !== "thread") throw new Error("Missing long thread");
  expect(detail.replies).toHaveLength(20);
  expect(detail.total).toBe(23);
  expect(
    detail.replies.find((r) => r.id === fixture.replyIds[3])?.body
  ).toBeNull();
  expect(
    detail.replies.find((r) => r.id === fixture.replyIds[4])?.body
  ).toBeNull();
  expect(detail.question.body).toContain("very-long-path-segment/");
  const linked = getLessonDiscussion(user.id, firstLesson.id, {
    questionId: fixture.questionIds[0],
    replyId: fixture.replyIds[22],
  });
  expect(linked.kind === "thread" && linked.repliesPage).toBe(2);
  expect(linked.kind === "thread" && linked.replies).toHaveLength(3);
  const hidden = getLessonDiscussion(instructor.id, firstLesson.id, {
    questionId: fixture.questionIds[2],
  });
  expect(hidden.kind === "thread" && hidden.question.body).toContain(
    "Could you explain"
  );
  const deleted = testDb
    .select()
    .from(discussionQuestions)
    .where(eq(discussionQuestions.id, fixture.questionIds[3]))
    .get()!;
  expect([deleted.title, deleted.body]).toEqual(["", ""]);
  const deletedReply = testDb
    .select()
    .from(discussionReplies)
    .where(eq(discussionReplies.id, fixture.replyIds[4]))
    .get()!;
  expect(deletedReply.body).toBe("");
  const tombstone = getLessonDiscussion(user.id, firstLesson.id, {
    questionId: deleted.id,
  });
  expect(tombstone.kind === "thread" && tombstone.replies).toHaveLength(1);

  expect(testDb.select().from(discussionReports).all()).toHaveLength(5);
  expect(
    getDiscussionUnreadCounts(instructor.id).discussionInbox
  ).toBeGreaterThan(0);
  expect(getDiscussionUnreadCounts(user.id).notifications).toBeGreaterThan(0);
  expect(
    getDiscussionInbox(instructor.id, "discussion_inbox", 2).entries.length
  ).toBeGreaterThan(0);
  expect(
    getDiscussionInbox(user.id, "notifications").entries.some(
      (entry) => entry.readAt
    )
  ).toBe(true);
  expect(testDb.$client.pragma("foreign_key_check")).toEqual([]);
});

it("rolls back pilot activation if the selected course has no lesson", () => {
  const { course, user, instructor } = seedBaseData(testDb);
  expect(() =>
    seedDiscussionPilot(testDb, course.id, user.id, instructor.id)
  ).toThrow("needs a course and lesson");
  expect(testDb.select().from(courses).get()?.discussionOverride).toBe(
    "inherit"
  );
  expect(testDb.select().from(discussionQuestions).all()).toEqual([]);
});
