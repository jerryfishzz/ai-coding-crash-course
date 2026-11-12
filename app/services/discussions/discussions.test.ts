import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  courses,
  discussionNotifications,
  discussionQuestions,
  discussionReplies,
  discussionReports,
  discussionSettings,
  enrollments,
  lessons,
  modules,
  purchases,
  users,
  CourseStatus,
  UserRole,
} from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let moduleId: number;
let adminId: number;
let otherId: number;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import {
  executeDiscussionCommand,
  getCourseDiscussionReports,
  getCourseDiscussionSettings,
  getGlobalDiscussionSettings,
  getLessonDiscussion,
  reviewDiscussionReport,
  updateDiscussionSetting,
} from "./index";
import { deleteLesson } from "~/services/lessonService";
import { deleteModule } from "~/services/moduleService";

function command(actorId: number | null, intent: string, fields = {}) {
  return executeDiscussionCommand(actorId, lessonId, { intent, ...fields });
}

function question(actorId = base.user.id, title = "Question") {
  const result = command(actorId, "discussion-create-question", {
    title,
    body: "Original question body",
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.questionId;
}

function reply(questionId: number, actorId = base.instructor.id) {
  const result = command(actorId, "discussion-create-reply", {
    questionId,
    body: "Original reply body",
  });
  if (!result.ok || !("replyId" in result) || !result.replyId)
    throw new Error("Could not create reply");
  return result.replyId;
}

function thread(actorId: number, questionId: number, selection = {}) {
  const result = getLessonDiscussion(actorId, lessonId, {
    questionId,
    ...selection,
  });
  if (result.kind !== "thread") throw new Error("Expected thread");
  return result;
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  moduleId = testDb
    .insert(modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get().id;
  lessonId = testDb
    .insert(lessons)
    .values({ moduleId, title: "Lesson", position: 1 })
    .returning()
    .get().id;
  adminId = testDb
    .insert(users)
    .values({ name: "Admin", email: "admin@test.com", role: UserRole.Admin })
    .returning()
    .get().id;
  otherId = testDb
    .insert(users)
    .values({
      name: "Other instructor",
      email: "other@test.com",
      role: UserRole.Instructor,
    })
    .returning()
    .get().id;
  testDb
    .insert(enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();
  updateDiscussionSetting(
    adminId,
    { level: "course", courseId: base.course.id },
    { intent: "discussion-set-course", value: "enabled" }
  );
});

afterEach(() => {
  vi.useRealTimers();
  testDb.$client.close();
});

describe("discussion settings and access", () => {
  it("starts globally disabled and new courses/lessons inherit", () => {
    expect(getGlobalDiscussionSettings(adminId)).toEqual({
      defaultEnabled: false,
    });
    expect(base.course.discussionOverride).toBe("inherit");
    expect(testDb.select().from(lessons).get()?.discussionPaused).toBe(false);
    testDb.delete(discussionSettings).run();
    expect(getGlobalDiscussionSettings(adminId).defaultEnabled).toBe(false);
  });

  it("computes every inheritance combination and retains lesson pauses across course changes", () => {
    for (const defaultEnabled of [false, true]) {
      updateDiscussionSetting(
        adminId,
        { level: "global" },
        {
          intent: "discussion-set-global",
          value: defaultEnabled ? "enabled" : "disabled",
        }
      );
      for (const override of ["inherit", "enabled", "disabled"]) {
        updateDiscussionSetting(
          adminId,
          { level: "course", courseId: base.course.id },
          { intent: "discussion-set-course", value: override }
        );
        for (const paused of [false, true]) {
          updateDiscussionSetting(
            adminId,
            { level: "lesson", courseId: base.course.id, lessonId },
            {
              intent: "discussion-set-lesson",
              value: paused ? "disabled" : "inherit",
            }
          );
          const enabled =
            override === "inherit" ? defaultEnabled : override === "enabled";
          expect(
            getCourseDiscussionSettings(adminId, base.course.id, lessonId)
          ).toMatchObject({
            courseEnabled: enabled,
            lessonPaused: paused,
            participationEnabled: enabled && !paused,
          });
        }
      }
    }
    updateDiscussionSetting(
      adminId,
      { level: "course", courseId: base.course.id },
      { intent: "discussion-set-course", value: "enabled" }
    );
    expect(
      getCourseDiscussionSettings(adminId, base.course.id, lessonId)
        .participationEnabled
    ).toBe(false);
  });

  it("only allows admins to change any level, even via a direct command", () => {
    for (const actorId of [base.user.id, base.instructor.id, otherId]) {
      expect(
        updateDiscussionSetting(
          actorId,
          { level: "global" },
          { intent: "discussion-set-global", value: "enabled" }
        )
      ).toMatchObject({ ok: false, status: 403 });
      expect(
        updateDiscussionSetting(
          actorId,
          { level: "course", courseId: base.course.id },
          { intent: "discussion-set-course", value: "disabled" }
        )
      ).toMatchObject({ ok: false, status: 403 });
      expect(
        updateDiscussionSetting(
          actorId,
          { level: "lesson", courseId: base.course.id, lessonId },
          { intent: "discussion-set-lesson", value: "disabled" }
        )
      ).toMatchObject({ ok: false, status: 403 });
    }
    expect(
      updateDiscussionSetting(null, { level: "global" }, {})
    ).toMatchObject({ ok: false, status: 401 });
    expect(
      updateDiscussionSetting(
        adminId,
        { level: "lesson", courseId: base.course.id, lessonId },
        { intent: "discussion-set-lesson", value: "enabled" }
      )
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      updateDiscussionSetting(
        adminId,
        { level: "global" },
        { intent: "discussion-set-course", value: "enabled" }
      )
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("requires enrollment for unrelated instructors and preserves posts after access loss", () => {
    const questionId = question();
    reply(questionId);
    expect(() => getLessonDiscussion(otherId, lessonId)).toThrow(
      expect.objectContaining({ status: 403 })
    );
    expect(
      command(otherId, "discussion-create-question", {
        title: "Denied",
        body: "Denied",
      })
    ).toMatchObject({ ok: false, status: 403 });
    testDb
      .delete(enrollments)
      .where(eq(enrollments.userId, base.user.id))
      .run();
    expect(() => getLessonDiscussion(base.user.id, lessonId)).toThrow(
      expect.objectContaining({ status: 403 })
    );
    for (const intent of [
      "discussion-edit-question",
      "discussion-delete-question",
      "discussion-resolve",
    ]) {
      expect(
        command(base.user.id, intent, {
          questionId,
          title: "Changed",
          body: "Changed",
        })
      ).toMatchObject({ ok: false, status: 403 });
    }
    expect(testDb.select().from(discussionQuestions).get()?.body).toBe(
      "Original question body"
    );
    testDb
      .insert(enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    expect(thread(base.user.id, questionId).question.body).toBe(
      "Original question body"
    );
    expect(testDb.select().from(discussionNotifications).all()).toHaveLength(2);
    expect(
      getLessonDiscussion(base.instructor.id, lessonId).capabilities.moderate
    ).toBe(true);
    expect(getLessonDiscussion(adminId, lessonId).capabilities.moderate).toBe(
      true
    );
    expect(command(null, "discussion-create-question", {})).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("applies paid lesson PPP access while preserving staff access", () => {
    testDb
      .update(courses)
      .set({ price: 5000 })
      .where(eq(courses.id, base.course.id))
      .run();
    testDb
      .insert(purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        country: "IN",
        pricePaid: 2500,
      })
      .run();
    expect(() => getLessonDiscussion(base.user.id, lessonId, {}, "US")).toThrow(
      expect.objectContaining({ status: 403 })
    );
    expect(
      executeDiscussionCommand(
        base.user.id,
        lessonId,
        { intent: "discussion-create-question", title: "Q", body: "Body" },
        "US"
      )
    ).toMatchObject({ ok: false, status: 403 });
    expect(getLessonDiscussion(base.user.id, lessonId, {}, "IN").kind).toBe(
      "list"
    );
    expect(
      getLessonDiscussion(base.instructor.id, lessonId, {}, "US").kind
    ).toBe("list");
  });

  it.each(["global", "course", "lesson", "archive"])(
    "pausing at %s blocks everyone's participation but preserves reading/reporting/moderation",
    (level) => {
      const questionId = question();
      const replyId = reply(questionId);
      if (level === "global")
        testDb.update(courses).set({ discussionOverride: "inherit" }).run();
      if (level === "course")
        testDb.update(courses).set({ discussionOverride: "disabled" }).run();
      if (level === "lesson")
        testDb.update(lessons).set({ discussionPaused: true }).run();
      if (level === "archive")
        testDb.update(courses).set({ status: CourseStatus.Archived }).run();
      for (const actorId of [base.user.id, base.instructor.id, adminId]) {
        expect(thread(actorId, questionId).question.body).toBeTruthy();
        for (const intent of [
          "discussion-create-question",
          "discussion-create-reply",
          "discussion-edit-question",
          "discussion-edit-reply",
          "discussion-delete-question",
          "discussion-delete-reply",
          "discussion-resolve",
          "discussion-reopen",
        ]) {
          expect(
            command(actorId, intent, {
              questionId,
              replyId,
              title: "Valid",
              body: "Valid",
            })
          ).toMatchObject({ ok: false, status: 409 });
        }
      }
      expect(
        command(base.user.id, "discussion-report", {
          questionId,
          replyId,
          reason: "Please review",
        }).ok
      ).toBe(true);
      expect(
        command(base.instructor.id, "discussion-hide", { questionId, replyId })
          .ok
      ).toBe(true);
      expect(
        command(adminId, "discussion-restore", { questionId, replyId }).ok
      ).toBe(true);
    }
  );
});

describe("commands and private projections", () => {
  it("rejects cross-course report reviews and lesson settings even for an admin", () => {
    const questionId = question();
    command(base.user.id, "discussion-report", { questionId });
    const reportId = getCourseDiscussionReports(adminId, base.course.id)
      .reports[0].report.id;
    const secondCourse = testDb
      .insert(courses)
      .values({
        ...base.course,
        id: undefined,
        slug: "second-course",
      })
      .returning()
      .get();
    expect(
      reviewDiscussionReport(adminId, secondCourse.id, {
        intent: "discussion-hide-reported-content",
        reportId,
      })
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      updateDiscussionSetting(
        adminId,
        {
          level: "lesson",
          courseId: secondCourse.id,
          lessonId,
        },
        { intent: "discussion-set-lesson", value: "disabled" }
      )
    ).toMatchObject({ ok: false, status: 404 });
    expect(getCourseDiscussionReports(adminId, secondCourse.id).total).toBe(0);
    expect(thread(base.user.id, questionId).question.hidden).toBe(false);
    expect(
      testDb.select().from(discussionReports).get()?.reviewedAt
    ).toBeNull();
  });

  it("validates title/body limits without stripping useful code whitespace", () => {
    for (const [title, body] of [
      [" ", "Text"],
      ["x".repeat(161), "Text"],
      ["Title", " \n"],
      ["Title", "x".repeat(10001)],
    ]) {
      expect(
        command(base.user.id, "discussion-create-question", { title, body })
      ).toMatchObject({
        ok: false,
        status: 400,
        error: { code: "validation" },
      });
    }
    expect(
      command(base.user.id, "discussion-create-question", {
        title: "  Valid  ",
        body: "  code\n  next\n",
      }).ok
    ).toBe(true);
    expect(testDb.select().from(discussionQuestions).get()).toMatchObject({
      title: "Valid",
      body: "  code\n  next\n",
    });
  });

  it("rejects cross-lesson/question/reply IDs and grants no ownership from submitted fields", () => {
    const questionId = question();
    const replyId = reply(questionId);
    const otherQuestion = question();
    const anotherLesson = testDb
      .insert(lessons)
      .values({ moduleId, title: "Elsewhere", position: 2 })
      .returning()
      .get();
    expect(
      executeDiscussionCommand(base.user.id, anotherLesson.id, {
        intent: "discussion-edit-question",
        questionId,
        title: "Spoof",
        body: "Spoof",
      })
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      command(base.user.id, "discussion-edit-reply", {
        questionId: otherQuestion,
        replyId,
        body: "Spoof",
      })
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      command(base.user.id, "discussion-edit-reply", {
        questionId,
        replyId,
        authorId: base.user.id,
        body: "Spoof",
      })
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      command(adminId, "discussion-edit-question", {
        questionId,
        title: "Staff edit",
        body: "Changed",
      })
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      getLessonDiscussion(base.user.id, anotherLesson.id, { questionId }).kind
    ).toBe("unavailable");
    expect(
      thread(base.user.id, questionId, { replyId: 9999 }).linkedReplyUnavailable
    ).toBe(true);
  });

  it("edits own posts, resolves/reopens, and leaves resolved questions replyable", () => {
    const questionId = question();
    expect(
      command(base.user.id, "discussion-edit-question", {
        questionId,
        title: "Updated",
        body: "Updated body",
      }).ok
    ).toBe(true);
    expect(thread(base.user.id, questionId).question).toMatchObject({
      title: "Updated",
      body: "Updated body",
      editedAt: expect.any(String),
    });
    expect(
      command(base.instructor.id, "discussion-resolve", { questionId }).ok
    ).toBe(true);
    expect(thread(base.user.id, questionId).question.resolved).toBe(true);
    reply(questionId);
    expect(command(base.user.id, "discussion-reopen", { questionId }).ok).toBe(
      true
    );
    expect(thread(base.user.id, questionId).question.resolved).toBe(false);
    expect(thread(base.user.id, questionId).replies[0].instructor).toBe(true);
    expect(testDb.select().from(discussionNotifications).all()).toHaveLength(2);
  });

  it("hides originals from learners including the author and retains private staff access", () => {
    const questionId = question();
    const replyId = reply(questionId);
    command(base.instructor.id, "discussion-hide", { questionId, replyId });
    const learner = thread(base.user.id, questionId);
    expect(learner.replies[0]).toMatchObject({ body: null, hidden: true });
    expect(JSON.stringify(learner)).not.toContain("Original reply body");
    expect(thread(base.instructor.id, questionId).replies[0].body).toBe(
      "Original reply body"
    );
    expect(
      command(base.user.id, "discussion-report", { questionId, replyId })
    ).toMatchObject({ ok: false, status: 404 });
    command(adminId, "discussion-hide", { questionId });
    expect(
      getLessonDiscussion(base.user.id, lessonId, { questionId }).kind
    ).toBe("unavailable");
    expect(
      JSON.stringify(getLessonDiscussion(base.user.id, lessonId))
    ).not.toContain("Original question body");
    expect(thread(adminId, questionId).question).toMatchObject({
      body: "Original question body",
      hidden: true,
    });
    command(base.instructor.id, "discussion-restore", { questionId });
    command(adminId, "discussion-restore", { questionId, replyId });
    expect(thread(base.user.id, questionId).replies[0].body).toBe(
      "Original reply body"
    );
  });

  it("author deletion clears text and preserves replies/history; restore cannot resurrect it", () => {
    const questionId = question();
    const replyId = reply(questionId);
    command(base.instructor.id, "discussion-delete-reply", {
      questionId,
      replyId,
    });
    command(base.user.id, "discussion-delete-question", { questionId });
    const view = thread(base.user.id, questionId);
    expect(view.question).toMatchObject({
      title: "Deleted question",
      body: null,
      deleted: true,
    });
    expect(view.replies[0]).toMatchObject({
      id: replyId,
      body: null,
      deleted: true,
    });
    expect(testDb.select().from(discussionQuestions).get()).toMatchObject({
      title: "",
      body: "",
    });
    expect(testDb.select().from(discussionReplies).get()?.body).toBe("");
    expect(testDb.select().from(discussionNotifications).all()).toHaveLength(2);
    expect(
      command(adminId, "discussion-restore", { questionId })
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("paginates deterministically and uses placeholder slots to locate deep replies", () => {
    const questionId = question();
    const timestamp = "2026-01-01T00:00:00.000Z";
    const inserted = testDb
      .insert(discussionReplies)
      .values(
        Array.from({ length: 25 }, (_, index) => ({
          questionId,
          authorId: base.user.id,
          body: `Reply ${index}`,
          createdAt: timestamp,
          hiddenAt: index === 20 ? timestamp : null,
        }))
      )
      .returning()
      .all();
    expect(
      thread(base.user.id, questionId).replies.map((post) => post.id)
    ).toEqual(inserted.slice(0, 20).map((post) => post.id));
    const view = thread(base.user.id, questionId, { replyId: inserted[20].id });
    expect(view).toMatchObject({
      repliesPage: 2,
      total: 25,
      linkedReplyUnavailable: true,
    });
    expect(view.replies).toHaveLength(5);
    expect(view.replies[0].body).toBeNull();
    testDb
      .insert(discussionQuestions)
      .values(
        Array.from({ length: 25 }, (_, index) => ({
          lessonId,
          authorId: base.user.id,
          title: `Older ${index}`,
          body: "Body",
          createdAt: timestamp,
        }))
      )
      .run();
    const list = getLessonDiscussion(base.user.id, lessonId);
    if (list.kind !== "list") throw new Error("Expected list");
    expect(list.questions).toHaveLength(20);
    expect(list.questions[0].id).toBe(questionId);
    expect(list.questions[1].title).toBe("Older 24");
    expect(
      getLessonDiscussion(base.user.id, lessonId, { questionsPage: 2 })
    ).toMatchObject({ total: 26, questions: expect.any(Array) });
    expect(() =>
      getLessonDiscussion(base.user.id, lessonId, { questionId: -1 })
    ).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("restricts reports to course staff, resolves targets, and moderates while paused", () => {
    const questionId = question();
    const replyId = reply(questionId);
    command(base.user.id, "discussion-report", {
      questionId,
      replyId,
      reason: "Review this",
    });
    const report = getCourseDiscussionReports(
      base.instructor.id,
      base.course.id
    ).reports[0];
    expect(report.report.reason).toBe("Review this");
    expect(report.reply?.id).toBe(replyId);
    expect(() => getCourseDiscussionReports(otherId, base.course.id)).toThrow(
      expect.objectContaining({ status: 403 })
    );
    expect(() =>
      getCourseDiscussionReports(base.user.id, base.course.id)
    ).toThrow(expect.objectContaining({ status: 403 }));
    expect(
      reviewDiscussionReport(otherId, base.course.id, {
        intent: "discussion-dismiss-report",
        reportId: report.report.id,
      })
    ).toMatchObject({ ok: false, status: 403 });
    testDb.update(lessons).set({ discussionPaused: true }).run();
    expect(
      reviewDiscussionReport(base.instructor.id, base.course.id, {
        intent: "discussion-hide-reported-content",
        reportId: report.report.id,
      }).ok
    ).toBe(true);
    expect(thread(base.user.id, questionId).replies[0].hidden).toBe(true);
    expect(getCourseDiscussionReports(adminId, base.course.id)).toMatchObject({
      total: 1,
      reports: [
        { report: { outcome: "hidden", reviewedBy: base.instructor.id } },
      ],
    });
    expect(
      reviewDiscussionReport(adminId, base.course.id, {
        intent: "discussion-dismiss-report",
        reportId: report.report.id,
      }).ok
    ).toBe(true);
    expect(testDb.select().from(discussionReports).get()?.outcome).toBe(
      "hidden"
    );
  });
});

describe("delivery, posting transactions, and persistence constraints", () => {
  it("keeps teaching and learning deliveries separate, excludes self alerts and edits", () => {
    testDb
      .insert(enrollments)
      .values({ userId: otherId, courseId: base.course.id })
      .run();
    const questionId = question(otherId);
    reply(questionId);
    reply(questionId, otherId);
    command(otherId, "discussion-edit-question", {
      questionId,
      title: "Edited",
      body: "Edited",
    });
    expect(testDb.select().from(discussionNotifications).all()).toEqual([
      expect.objectContaining({
        recipientId: base.instructor.id,
        inboxKind: "discussion_inbox",
        questionId,
        replyId: null,
      }),
      expect.objectContaining({
        recipientId: otherId,
        inboxKind: "notifications",
        questionId,
        replyId: expect.any(Number),
      }),
      expect.objectContaining({
        recipientId: base.instructor.id,
        inboxKind: "discussion_inbox",
        questionId,
        replyId: expect.any(Number),
      }),
    ]);
    const staffQuestion = question(base.instructor.id);
    expect(testDb.select().from(discussionNotifications).all()).toHaveLength(3);
    reply(staffQuestion, base.user.id);
    expect(testDb.select().from(discussionNotifications).all()).toHaveLength(4);
  });

  it("limits five creates across question/reply/lesson boundaries and includes deleted posts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
    const questionId = question();
    for (let i = 0; i < 4; i++) reply(questionId, base.user.id);
    command(base.user.id, "discussion-delete-question", { questionId });
    const anotherLesson = testDb
      .insert(lessons)
      .values({ moduleId, title: "Other lesson", position: 2 })
      .returning()
      .get();
    expect(
      executeDiscussionCommand(base.user.id, anotherLesson.id, {
        intent: "discussion-create-question",
        title: "Sixth",
        body: "Body",
      })
    ).toMatchObject({ ok: false, status: 429, retryAfter: 60 });
    vi.advanceTimersByTime(59_000);
    expect(
      command(base.user.id, "discussion-create-reply", {
        questionId,
        body: "Sixth",
      })
    ).toMatchObject({ ok: false, retryAfter: 1 });
    vi.advanceTimersByTime(1000);
    expect(
      command(base.user.id, "discussion-create-reply", {
        questionId,
        body: "Now allowed",
      }).ok
    ).toBe(true);
  });

  it("rolls back the source and all deliveries if any delivery fails", () => {
    const questionId = question();
    testDb.run(
      sql`create trigger fail_learning_delivery before insert on discussion_notifications when NEW.inbox_kind = 'notifications' begin select raise(abort, 'delivery failed'); end`
    );
    const before = testDb.select().from(discussionNotifications).all();
    expect(() => reply(questionId, otherId)).toThrow(); // Access is denied before any write.
    testDb
      .insert(enrollments)
      .values({ userId: otherId, courseId: base.course.id })
      .run();
    expect(() => reply(questionId, otherId)).toThrow("delivery failed");
    expect(testDb.select().from(discussionReplies).all()).toHaveLength(0);
    expect(testDb.select().from(discussionNotifications).all()).toEqual(before);
  });

  it("enforces target, setting, delivery uniqueness, and notification reply relationships in SQLite", () => {
    const questionId = question();
    const replyId = reply(questionId);
    const otherQuestion = question();
    expect(() =>
      testDb
        .insert(discussionSettings)
        .values({ id: 2, defaultEnabled: false })
        .run()
    ).toThrow();
    expect(() =>
      testDb.run(sql`update courses set discussion_override = 'invalid'`)
    ).toThrow();
    expect(() =>
      testDb
        .insert(discussionReports)
        .values({ reporterId: base.user.id })
        .run()
    ).toThrow();
    expect(() =>
      testDb
        .insert(discussionReports)
        .values({ reporterId: base.user.id, questionId, replyId })
        .run()
    ).toThrow();
    const deliveries = testDb.select().from(discussionNotifications).all();
    for (const { id: _id, ...delivery } of deliveries)
      expect(() =>
        testDb.insert(discussionNotifications).values(delivery).run()
      ).toThrow();
    expect(() =>
      testDb
        .insert(discussionNotifications)
        .values({
          recipientId: adminId,
          inboxKind: "notifications",
          questionId: otherQuestion,
          replyId,
        })
        .run()
    ).toThrow();
  });

  it.each(["lesson", "module"])(
    "cascades hard %s deletion through posts, reports and deliveries",
    (kind) => {
      const questionId = question();
      const replyId = reply(questionId);
      command(base.user.id, "discussion-report", { questionId });
      command(base.user.id, "discussion-report", { questionId, replyId });
      if (kind === "lesson") deleteLesson(lessonId);
      else deleteModule(moduleId);
      expect(testDb.select().from(discussionQuestions).all()).toHaveLength(0);
      expect(testDb.select().from(discussionReplies).all()).toHaveLength(0);
      expect(testDb.select().from(discussionReports).all()).toHaveLength(0);
      expect(testDb.select().from(discussionNotifications).all()).toHaveLength(
        0
      );
    }
  );
});
