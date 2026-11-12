import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  courses,
  discussionQuestions,
  discussionReplies,
  discussionReports,
  enrollments,
  lessons,
  modules,
  users,
  CourseStatus,
  UserRole,
} from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let questionId: number;
let replyId: number;
let adminId: number;
let otherInstructorId: number;
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import {
  action as lessonAction,
  loader as lessonLoader,
} from "./courses.$slug.lessons.$lessonId";
import {
  action as courseAction,
  clientAction as courseClientAction,
  loader as courseLoader,
  headers,
} from "./instructor.$courseId";

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  testDb
    .insert(enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();
  adminId = testDb
    .insert(users)
    .values({ name: "Admin", email: "admin@test.com", role: UserRole.Admin })
    .returning()
    .get().id;
  otherInstructorId = testDb
    .insert(users)
    .values({
      name: "Other instructor",
      email: "other@test.com",
      role: UserRole.Instructor,
    })
    .returning()
    .get().id;
  const module = testDb
    .insert(modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get();
  lessonId = testDb
    .insert(lessons)
    .values({
      moduleId: module.id,
      title: "Lesson context",
      content: "Full lesson",
      position: 1,
    })
    .returning()
    .get().id;
  questionId = testDb
    .insert(discussionQuestions)
    .values({
      lessonId,
      authorId: base.user.id,
      title: "Question original",
      body: "Question secret",
    })
    .returning()
    .get().id;
  replyId = testDb
    .insert(discussionReplies)
    .values({ questionId, authorId: base.user.id, body: "Reply secret" })
    .returning()
    .get().id;
});
afterEach(() => testDb.$client.close());

async function args(
  actorId: number | null,
  fields?: Record<string, string>,
  search = "",
  courseId = base.course.id,
  method = fields ? "POST" : "GET"
) {
  const url = `http://localhost/instructor/${courseId}${search}`;
  const requestHeaders = new Headers({ "CF-IPCountry": "US" });
  if (actorId !== null) {
    const cookie = await setCurrentUserId(new Request(url), actorId);
    requestHeaders.set("Cookie", cookie.split(";")[0]);
  }
  return {
    request: new Request(url, {
      method,
      headers: requestHeaders,
      body: fields ? new URLSearchParams(fields) : undefined,
    }),
    url: new URL(url),
    pattern: "/instructor/:courseId",
    context: new RouterContextProvider(),
    params: {
      courseId: String(courseId),
      slug: base.course.slug,
      lessonId: String(lessonId),
    },
  };
}
function reportFields(reply = false, reason?: string) {
  return {
    intent: "discussion-report",
    questionId: String(questionId),
    ...(reply ? { replyId: String(replyId) } : {}),
    ...(reason === undefined ? {} : { reason }),
  };
}
async function report(reply = false, reason?: string) {
  return lessonAction(await args(base.user.id, reportFields(reply, reason)));
}
async function moderate(actorId: number, intent: string, reply = false) {
  return lessonAction(
    await args(actorId, {
      intent,
      questionId: String(questionId),
      ...(reply ? { replyId: String(replyId) } : {}),
    })
  );
}

describe("discussion moderation request contract", () => {
  it("keeps unconfirmed review failures inline without retrying, while preserving unrelated actions, redirects and aborts", async () => {
    const requestArgs = await args(base.instructor.id, {
      intent: "discussion-dismiss-report",
      reportId: "1",
    });
    const error = new TypeError("Connection lost");
    const serverAction = vi.fn(async () => {
      throw error;
    });
    expect(
      await courseClientAction({ ...requestArgs, serverAction })
    ).toMatchObject({
      init: { status: 503 },
      data: {
        discussionResult: {
          ok: false,
          error: {
            code: "submission_failed",
            message: expect.stringContaining("Refresh the reports"),
          },
        },
      },
    });
    expect(serverAction).toHaveBeenCalledOnce();
    const success = { discussionResult: { ok: true as const, reportId: 1 } };
    expect(
      await courseClientAction({
        ...requestArgs,
        serverAction: async () => success,
      })
    ).toBe(success);
    await expect(
      courseClientAction({
        ...(await args(base.instructor.id, {
          intent: "update-title",
          title: "Title",
        })),
        serverAction,
      })
    ).rejects.toBe(error);
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
    await expect(
      courseClientAction({
        ...requestArgs,
        serverAction: async () => {
          throw redirect;
        },
      })
    ).rejects.toBe(redirect);
    const controller = new AbortController();
    const request = new Request(requestArgs.request, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(
      courseClientAction({ ...requestArgs, request, serverAction })
    ).rejects.toBe(error);
  });

  it("accepts optional reasons while disabled and archived; keeps reports out of public lesson payloads", async () => {
    testDb.update(courses).set({ status: CourseStatus.Archived }).run();
    expect(await report()).toMatchObject({
      data: { discussionResult: { ok: true } },
    });
    expect(await report(true, "  Private reason  ")).toMatchObject({
      data: { discussionResult: { ok: true } },
    });
    expect(
      testDb
        .select()
        .from(discussionReports)
        .all()
        .map((row) => row.reason)
    ).toEqual([null, "Private reason"]);
    const learnerView = await lessonLoader(
      await args(base.user.id, undefined, `?question=${questionId}`)
    );
    expect(JSON.stringify(learnerView)).not.toContain("Private reason");
    expect(learnerView.discussion).toMatchObject({
      kind: "thread",
      question: {
        capabilities: { report: true, moderate: false, edit: false },
      },
    });
    expect(await courseLoader(await args(base.instructor.id))).toMatchObject({
      discussionReports: null,
    });
    expect(
      await courseLoader(await args(adminId, undefined, "?tab=reports"))
    ).toMatchObject({ discussionReports: { total: 2 } });
  });

  it("validates report text and full target relationships on direct submissions", async () => {
    expect(await report(false, "x".repeat(2001))).toMatchObject({
      init: { status: 400 },
      data: {
        discussionResult: { error: { fields: { reason: expect.any(Array) } } },
      },
    });
    expect(await report(false, "x".repeat(2000))).toMatchObject({
      data: { discussionResult: { ok: true } },
    });
    const otherQuestion = testDb
      .insert(discussionQuestions)
      .values({
        lessonId,
        authorId: base.user.id,
        title: "Other",
        body: "Other",
      })
      .returning()
      .get();
    expect(
      await lessonAction(
        await args(base.user.id, {
          ...reportFields(true),
          questionId: String(otherQuestion.id),
        })
      )
    ).toMatchObject({ init: { status: 404 } });
    const otherModule = testDb
      .insert(modules)
      .values({ courseId: base.course.id, title: "Other", position: 2 })
      .returning()
      .get();
    const otherLesson = testDb
      .insert(lessons)
      .values({ moduleId: otherModule.id, title: "Other", position: 1 })
      .returning()
      .get();
    const elsewhere = testDb
      .insert(discussionQuestions)
      .values({
        lessonId: otherLesson.id,
        authorId: base.user.id,
        title: "Elsewhere",
        body: "Elsewhere",
      })
      .returning()
      .get();
    expect(
      await lessonAction(
        await args(base.user.id, {
          ...reportFields(),
          questionId: String(elsewhere.id),
        })
      )
    ).toMatchObject({ init: { status: 404 } });
    expect(testDb.select().from(discussionReports).all()).toHaveLength(1);
  });

  it("denies students, unrelated instructors, and signed-out users private report reads and reviews", async () => {
    await report(false, "Private reason");
    const reportId = testDb.select().from(discussionReports).get()!.id;
    for (const [actorId, status] of [
      [base.user.id, 403],
      [otherInstructorId, 403],
      [null, 401],
    ] as const) {
      await expect(
        courseLoader(await args(actorId, undefined, "?tab=reports"))
      ).rejects.toMatchObject({ init: { status } });
      await expect(
        courseAction(
          await args(actorId, {
            intent: "discussion-dismiss-report",
            reportId: String(reportId),
          })
        )
      ).rejects.toMatchObject({ init: { status } });
    }
    expect(
      testDb.select().from(discussionReports).get()?.reviewedAt
    ).toBeNull();
  });

  it("provides sanitized current source context only to the owner and admins, with strict pagination and no GET mutations", async () => {
    testDb
      .update(discussionReplies)
      .set({
        body: "**Reply secret**\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))",
      })
      .run();
    for (let index = 0; index < 21; index++)
      await report(true, `Private ${index}`);
    testDb
      .update(discussionReports)
      .set({ createdAt: "2026-11-01T12:00:00.000Z" })
      .run();
    const before = testDb.select().from(discussionReports).all();
    const first = await courseLoader(
      await args(base.instructor.id, undefined, "?tab=reports&keep=context")
    );
    expect(first.discussionReports).toMatchObject({
      total: 21,
      page: 1,
      reports: expect.any(Array),
    });
    expect(first.discussionReports?.reports).toHaveLength(20);
    const source = first.discussionReports!.reports[0];
    expect(source).toMatchObject({
      reason: "Private 20",
      questionTitle: "Question original",
      lessonId,
      lessonTitle: "Lesson context",
      questionId,
      replyId,
      bodyHtml: expect.stringContaining("<strong>Reply secret</strong>"),
    });
    expect(source.bodyHtml).not.toContain("<script>");
    expect(source.bodyHtml).not.toContain('href="javascript:');
    expect(source).not.toHaveProperty("body");
    const second = await courseLoader(
      await args(adminId, undefined, "?tab=reports&reportsPage=2")
    );
    expect(second.discussionReports?.reports).toMatchObject([
      { reason: "Private 0" },
    ]);
    expect(
      (
        await courseLoader(
          await args(adminId, undefined, "?tab=reports&reportsPage=3")
        )
      ).discussionReports?.reports
    ).toEqual([]);
    for (const page of [
      "0",
      "-1",
      "1.5",
      "no",
      "1000000001",
      "1&reportsPage=2",
    ]) {
      await expect(
        courseLoader(
          await args(adminId, undefined, `?tab=reports&reportsPage=${page}`)
        )
      ).rejects.toMatchObject({ init: { status: 400 } });
    }
    expect(testDb.select().from(discussionReports).all()).toEqual(before);
    const responseHeaders = headers({
      actionHeaders: new Headers({ Allow: "POST" }),
      loaderHeaders: new Headers(),
      parentHeaders: new Headers(),
      errorHeaders: undefined,
    });
    expect(responseHeaders.get("Cache-Control")).toBe("private, no-store");
    expect(responseHeaders.get("Allow")).toBe("POST");
  });

  it("rejects malformed, cross-course and non-POST reviews without changing sources or audit fields", async () => {
    await report();
    const reportId = testDb.select().from(discussionReports).get()!.id;
    const otherCourse = testDb
      .insert(courses)
      .values({
        title: "Other",
        slug: "other",
        description: "Other",
        instructorId: otherInstructorId,
        categoryId: base.category.id,
        status: CourseStatus.Draft,
      })
      .returning()
      .get();
    expect(
      await courseAction(
        await args(
          adminId,
          {
            intent: "discussion-hide-reported-content",
            reportId: String(reportId),
          },
          "",
          otherCourse.id
        )
      )
    ).toMatchObject({ init: { status: 404 } });
    for (const id of ["", "invalid", "0", "1.5"]) {
      expect(
        await courseAction(
          await args(adminId, {
            intent: "discussion-dismiss-report",
            reportId: id,
          })
        )
      ).toMatchObject({ init: { status: 400 } });
    }
    expect(
      await courseAction(
        await args(
          base.instructor.id,
          {
            intent: "discussion-hide-reported-content",
            reportId: String(reportId),
          },
          "",
          base.course.id,
          "PUT"
        )
      )
    ).toMatchObject({ init: { status: 405, headers: { Allow: "POST" } } });
    expect(
      testDb.select().from(discussionReports).get()?.reviewedAt
    ).toBeNull();
    expect(
      testDb.select().from(discussionQuestions).get()?.hiddenAt
    ).toBeNull();
  });

  it("hides and restores a reported reply without exposing its original to its author or hiding neighboring replies", async () => {
    const neighbor = testDb
      .insert(discussionReplies)
      .values({
        questionId,
        authorId: base.instructor.id,
        body: "Neighbor remains",
      })
      .returning()
      .get();
    await report(true);
    const reportId = testDb.select().from(discussionReports).get()!.id;
    testDb.update(courses).set({ status: CourseStatus.Archived }).run();
    expect(
      await courseAction(
        await args(base.instructor.id, {
          intent: "discussion-hide-reported-content",
          reportId: String(reportId),
        })
      )
    ).toMatchObject({ data: { discussionResult: { ok: true } } });
    const learner = await lessonLoader(
      await args(
        base.user.id,
        undefined,
        `?question=${questionId}&reply=${replyId}`
      )
    );
    expect(learner.discussion).toMatchObject({
      kind: "thread",
      replies: [
        {
          id: replyId,
          body: null,
          bodyHtml: null,
          hidden: true,
          capabilities: { report: false },
        },
        { id: neighbor.id, body: "Neighbor remains" },
      ],
    });
    expect(JSON.stringify(learner)).not.toContain("Reply secret");
    for (const actor of [base.instructor.id, adminId]) {
      expect(
        (
          await lessonLoader(
            await args(actor, undefined, `?question=${questionId}`)
          )
        ).discussion
      ).toMatchObject({
        kind: "thread",
        replies: [
          {
            hidden: true,
            body: "Reply secret",
            capabilities: { moderate: true, edit: false },
          },
          {},
        ],
      });
    }
    const reviewed = testDb.select().from(discussionReports).get()!;
    expect(
      await moderate(base.user.id, "discussion-restore", true)
    ).toMatchObject({ init: { status: 404 } });
    expect(
      await courseAction(
        await args(adminId, {
          intent: "discussion-dismiss-report",
          reportId: String(reportId),
        })
      )
    ).toMatchObject({ data: { discussionResult: { ok: true } } });
    expect(testDb.select().from(discussionReports).get()).toEqual(reviewed);
    expect(await moderate(adminId, "discussion-restore", true)).toMatchObject({
      data: { discussionResult: { ok: true } },
    });
    expect(
      (
        await lessonLoader(
          await args(base.user.id, undefined, `?question=${questionId}`)
        )
      ).discussion
    ).toMatchObject({
      kind: "thread",
      replies: [{ body: "Reply secret", hidden: false }, {}],
    });
  });

  it("hides whole question threads, permits staff inspection and restoration, and rejects learner moderation", async () => {
    expect(await moderate(base.user.id, "discussion-hide")).toMatchObject({
      init: { status: 403 },
    });
    expect(await moderate(base.instructor.id, "discussion-hide")).toMatchObject(
      { data: { discussionResult: { ok: true } } }
    );
    testDb
      .insert(enrollments)
      .values({ userId: otherInstructorId, courseId: base.course.id })
      .run();
    for (const actor of [base.user.id, otherInstructorId]) {
      const detail = await lessonLoader(
        await args(actor, undefined, `?question=${questionId}&reply=${replyId}`)
      );
      expect(detail.discussion).toMatchObject({ kind: "unavailable" });
      expect(JSON.stringify(detail)).not.toContain("Question secret");
      expect(JSON.stringify(detail)).not.toContain("Reply secret");
      expect((await lessonLoader(await args(actor))).discussion).toMatchObject({
        kind: "list",
        questions: [],
        total: 0,
      });
      expect(
        await lessonAction(await args(actor, reportFields()))
      ).toMatchObject({ init: { status: 404 } });
    }
    expect(
      (
        await lessonLoader(
          await args(base.instructor.id, undefined, `?question=${questionId}`)
        )
      ).discussion
    ).toMatchObject({
      kind: "thread",
      question: { body: "Question secret", hidden: true },
      replies: [{ body: "Reply secret" }],
    });
    expect(await moderate(adminId, "discussion-restore")).toMatchObject({
      data: { discussionResult: { ok: true } },
    });
    expect(
      (
        await lessonLoader(
          await args(base.user.id, undefined, `?question=${questionId}`)
        )
      ).discussion
    ).toMatchObject({
      kind: "thread",
      question: { hidden: false, body: "Question secret" },
    });
  });

  it("dismisses without hiding; deleted reported sources stay tombstones and cannot be restored", async () => {
    await report();
    await report(true);
    const [questionReport, replyReport] = testDb
      .select()
      .from(discussionReports)
      .all();
    expect(
      await courseAction(
        await args(adminId, {
          intent: "discussion-dismiss-report",
          reportId: String(questionReport.id),
        })
      )
    ).toMatchObject({ data: { discussionResult: { ok: true } } });
    expect(
      testDb.select().from(discussionQuestions).get()?.hiddenAt
    ).toBeNull();
    testDb.update(courses).set({ discussionOverride: "enabled" }).run();
    await lessonAction(
      await args(base.user.id, {
        intent: "discussion-delete-reply",
        questionId: String(questionId),
        replyId: String(replyId),
      })
    );
    const view = await courseLoader(
      await args(adminId, undefined, "?tab=reports")
    );
    expect(
      view.discussionReports?.reports.find((row) => row.id === replyReport.id)
    ).toMatchObject({ deleted: true, bodyHtml: null });
    expect(JSON.stringify(view.discussionReports)).not.toContain(
      "Reply secret"
    );
    await courseAction(
      await args(adminId, {
        intent: "discussion-hide-reported-content",
        reportId: String(replyReport.id),
      })
    );
    expect(await moderate(adminId, "discussion-restore", true)).toMatchObject({
      init: { status: 404 },
    });
    expect(
      testDb
        .select()
        .from(discussionReplies)
        .where(eq(discussionReplies.id, replyId))
        .get()
    ).toMatchObject({
      body: "",
      hiddenAt: null,
      deletedAt: expect.any(String),
    });
  });
});
