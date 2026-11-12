import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  courses,
  discussionNotifications,
  discussionQuestions,
  discussionReplies,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  quizzes,
  quizQuestions,
  quizOptions,
  users,
  UserRole,
  QuestionType,
} from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import {
  action,
  clientAction,
  headers,
  loader,
} from "./courses.$slug.lessons.$lessonId";

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  testDb.update(courses).set({ discussionOverride: "enabled" }).run();
  testDb
    .insert(enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();
  const module = testDb
    .insert(modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get();
  lessonId = testDb
    .insert(lessons)
    .values({
      moduleId: module.id,
      title: "Lesson",
      content: "Lesson context",
      position: 1,
    })
    .returning()
    .get().id;
});
afterEach(() => testDb.$client.close());

async function args(
  actorId: number | null,
  fields?: Record<string, string>,
  search = "",
  slug = base.course.slug,
  method = fields ? "POST" : "GET"
) {
  const url = `http://localhost/courses/${slug}/lessons/${lessonId}${search}`;
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
    pattern: "/courses/:slug/lessons/:lessonId",
    params: { slug, lessonId: String(lessonId) },
    context: new RouterContextProvider(),
  };
}
async function post(
  actorId: number | null,
  intent: string,
  fields: Record<string, string> = {}
) {
  return action(await args(actorId, { intent, ...fields }));
}
function question() {
  return testDb
    .insert(discussionQuestions)
    .values({
      lessonId,
      authorId: base.user.id,
      title: "Question",
      body: "**Question** details",
    })
    .returning()
    .get();
}

describe("embedded lesson discussion request contract", () => {
  it("creates and loads safe posts through cookie-authenticated handlers without marking activity read", async () => {
    expect(
      await post(base.user.id, "discussion-create-question", {
        title: "Why?",
        body: "**Details**\n\n<script>alert(1)</script>",
        authorId: String(base.instructor.id),
      })
    ).toMatchObject({ data: { discussionResult: { ok: true } } });
    const q = testDb.select().from(discussionQuestions).get()!;
    expect(q.authorId).toBe(base.user.id);
    expect(
      await post(base.instructor.id, "discussion-create-reply", {
        questionId: String(q.id),
        body: "Use `const answer = 42`",
      })
    ).toMatchObject({ data: { discussionResult: { ok: true } } });
    const result = await loader(
      await args(base.user.id, undefined, `?question=${q.id}`)
    );
    expect(result).toMatchObject({
      contentHtml: expect.stringContaining("Lesson context"),
      discussion: {
        kind: "thread",
        question: {
          bodyHtml: expect.stringContaining("<strong>Details</strong>"),
        },
        replies: [
          {
            instructor: true,
            bodyHtml: expect.stringContaining("<code>const answer = 42</code>"),
          },
        ],
      },
    });
    if (result.discussion.kind !== "thread") throw new Error("Expected thread");
    expect(result.discussion.question.bodyHtml).not.toContain("<script>");
    expect(
      testDb
        .select()
        .from(discussionNotifications)
        .all()
        .every((row) => row.readAt === null)
    ).toBe(true);
    const responseHeaders = headers({
      actionHeaders: new Headers({ "Retry-After": "12", Allow: "POST" }),
      loaderHeaders: new Headers(),
      parentHeaders: new Headers(),
      errorHeaders: undefined,
    });
    expect(responseHeaders.get("Cache-Control")).toBe("private, no-store");
    expect(responseHeaders.get("Retry-After")).toBe("12");
    expect(responseHeaders.get("Allow")).toBe("POST");
  });

  it("keeps list payloads compact and selects the linked reply's actual chronological page", async () => {
    const q = question();
    for (let i = 0; i < 21; i++) {
      testDb
        .insert(discussionReplies)
        .values({
          questionId: q.id,
          authorId: base.instructor.id,
          body: `Reply ${i}`,
          createdAt: "2026-11-01T12:00:00.000Z",
        })
        .run();
    }
    const last = testDb.select().from(discussionReplies).all().at(-1)!;
    expect(await loader(await args(base.user.id))).toMatchObject({
      discussion: { kind: "list", questions: [{ replyCount: 21 }] },
    });
    const list = (await loader(await args(base.user.id))).discussion;
    if (list.kind !== "list") throw new Error("Expected list");
    expect(list.questions[0]).not.toHaveProperty("body");
    expect(list).not.toHaveProperty("replies");
    expect(
      await loader(
        await args(
          base.user.id,
          undefined,
          `?question=${q.id}&reply=${last.id}&repliesPage=1&questionsPage=3`
        )
      )
    ).toMatchObject({
      discussion: {
        kind: "thread",
        questionsPage: 3,
        repliesPage: 2,
        replies: [{ id: last.id }],
      },
    });
  });

  it("returns unavailable or invalid discussion states while retaining accessible lesson content", async () => {
    expect(
      await loader(await args(base.user.id, undefined, "?question=999"))
    ).toMatchObject({
      contentHtml: expect.any(String),
      discussion: { kind: "unavailable" },
    });
    for (const search of [
      "?question=0",
      "?questionsPage=bad",
      "?reply=1",
      "?question=1&question=2",
    ]) {
      expect(
        await loader(await args(base.user.id, undefined, search))
      ).toMatchObject({ discussion: { kind: "invalid" } });
    }
    const q = question();
    expect(
      await loader(
        await args(base.user.id, undefined, `?question=${q.id}&reply=999`)
      )
    ).toMatchObject({
      discussion: { kind: "thread", linkedReplyUnavailable: true },
    });
  });

  it("denies anonymous, former, and unrelated instructor access without leaking posts", async () => {
    const q = question();
    const other = testDb
      .insert(users)
      .values({
        name: "Other",
        email: "other@test.com",
        role: UserRole.Instructor,
      })
      .returning()
      .get();
    testDb.delete(enrollments).run();
    for (const actor of [null, base.user.id, other.id]) {
      const result = await loader(
        await args(actor, undefined, `?question=${q.id}`)
      );
      expect(result.discussion.kind).toBe("denied");
      expect(JSON.stringify(result.discussion)).not.toContain(
        "Question details"
      );
      expect(
        await post(actor, "discussion-create-reply", {
          questionId: String(q.id),
          body: "Forged",
        })
      ).toMatchObject({
        data: { discussionResult: { ok: false } },
        init: { status: actor === null ? 401 : 403 },
      });
    }
    expect((await loader(await args(base.instructor.id))).discussion.kind).toBe(
      "list"
    );
  });

  it("rechecks current PPP access and returns no discussion content when blocked", async () => {
    question();
    testDb.update(courses).set({ price: 10000, pppEnabled: true }).run();
    testDb
      .insert(purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 3000,
        country: "IN",
      })
      .run();
    expect(await loader(await args(base.user.id))).toMatchObject({
      pppBlocked: true,
      discussion: { kind: "denied" },
    });
    expect(
      await post(base.user.id, "discussion-create-question", {
        title: "Blocked",
        body: "Blocked",
      })
    ).toMatchObject({ init: { status: 403 } });
  });

  it("checks the route's complete course/lesson path and the submitted question relationship", async () => {
    const q = question();
    const other = testDb
      .insert(courses)
      .values({
        ...base.course,
        id: undefined,
        slug: "other-course",
        discussionOverride: "enabled",
      })
      .returning()
      .get();
    expect(
      await action(
        await args(
          base.user.id,
          {
            intent: "discussion-edit-question",
            questionId: String(q.id),
            title: "Forged",
            body: "Forged",
          },
          "",
          other.slug
        )
      )
    ).toMatchObject({ init: { status: 404 } });
    const secondLesson = testDb
      .insert(lessons)
      .values({
        moduleId: testDb.select().from(modules).get()!.id,
        title: "Other lesson",
        position: 2,
      })
      .returning()
      .get();
    const foreign = testDb
      .insert(discussionQuestions)
      .values({
        lessonId: secondLesson.id,
        authorId: base.user.id,
        title: "Foreign",
        body: "Foreign",
      })
      .returning()
      .get();
    expect(
      await post(base.user.id, "discussion-create-reply", {
        questionId: String(foreign.id),
        body: "Wrong lesson",
      })
    ).toMatchObject({ init: { status: 404 } });
    expect(testDb.select().from(discussionReplies).all()).toEqual([]);
  });

  it("edits, resolves/reopens, and deletes to tombstones while keeping replies", async () => {
    const q = question();
    testDb
      .insert(discussionReplies)
      .values({
        questionId: q.id,
        authorId: base.instructor.id,
        body: "Keep this reply",
      })
      .run();
    expect(
      await post(base.user.id, "discussion-edit-question", {
        questionId: String(q.id),
        title: "Changed",
        body: "Changed details",
      })
    ).toMatchObject({ data: { discussionResult: { ok: true } } });
    expect(
      await post(base.instructor.id, "discussion-resolve", {
        questionId: String(q.id),
      })
    ).toMatchObject({ data: { discussionResult: { ok: true } } });
    expect(
      await loader(await args(base.user.id, undefined, `?question=${q.id}`))
    ).toMatchObject({
      discussion: {
        question: {
          title: "Changed",
          editedAt: expect.any(String),
          resolved: true,
        },
      },
    });
    await post(base.user.id, "discussion-reopen", { questionId: String(q.id) });
    await post(base.user.id, "discussion-delete-question", {
      questionId: String(q.id),
    });
    expect(
      await loader(await args(base.user.id, undefined, `?question=${q.id}`))
    ).toMatchObject({
      discussion: {
        question: { title: "Deleted question", body: null, bodyHtml: null },
        replies: [{ body: "Keep this reply" }],
      },
    });
  });

  it("does not serialize hidden originals to learners, including linked placeholders", async () => {
    const q = question();
    const reply = testDb
      .insert(discussionReplies)
      .values({
        questionId: q.id,
        authorId: base.user.id,
        body: "HIDDEN_REPLY_SECRET",
        hiddenAt: "2026-11-01",
      })
      .returning()
      .get();
    const result = await loader(
      await args(base.user.id, undefined, `?question=${q.id}&reply=${reply.id}`)
    );
    expect(result.discussion).toMatchObject({
      kind: "thread",
      linkedReplyUnavailable: true,
      replies: [{ body: null, bodyHtml: null }],
    });
    expect(JSON.stringify(result.discussion)).not.toContain(
      "HIDDEN_REPLY_SECRET"
    );
    testDb
      .update(discussionQuestions)
      .set({ body: "HIDDEN_QUESTION_SECRET", hiddenAt: "2026-11-01" })
      .run();
    expect(
      (await loader(await args(base.user.id, undefined, `?question=${q.id}`)))
        .discussion.kind
    ).toBe("unavailable");
    expect(
      await loader(
        await args(base.instructor.id, undefined, `?question=${q.id}`)
      )
    ).toMatchObject({
      discussion: {
        question: {
          bodyHtml: expect.stringContaining("HIDDEN_QUESTION_SECRET"),
        },
        replies: [{ bodyHtml: expect.stringContaining("HIDDEN_REPLY_SECRET") }],
      },
    });
  });

  it("returns inline field, pause, method, and rate-limit failures with correct status", async () => {
    expect(
      await post(base.user.id, "discussion-create-question", {
        title: " ",
        body: " ",
      })
    ).toMatchObject({
      data: {
        discussionResult: {
          error: {
            fields: { title: expect.any(Array), body: expect.any(Array) },
          },
        },
      },
      init: { status: 400 },
    });
    expect(
      await action(
        await args(
          base.user.id,
          {
            intent: "discussion-create-question",
            title: "Title",
            body: "Body",
          },
          "",
          undefined,
          "PUT"
        )
      )
    ).toMatchObject({ init: { status: 405, headers: { Allow: "POST" } } });
    testDb.update(lessons).set({ discussionPaused: true }).run();
    expect(
      await post(base.user.id, "discussion-create-question", {
        title: "Paused",
        body: "Keep draft",
      })
    ).toMatchObject({
      data: { discussionResult: { error: { code: "participation_paused" } } },
      init: { status: 409 },
    });
    testDb.update(lessons).set({ discussionPaused: false }).run();
    for (let i = 0; i < 5; i++)
      await post(base.user.id, "discussion-create-question", {
        title: "Title",
        body: "Body",
      });
    expect(
      await post(base.user.id, "discussion-create-question", {
        title: "Sixth",
        body: "Body",
      })
    ).toMatchObject({
      init: { status: 429, headers: { "Retry-After": expect.any(String) } },
    });
  });

  it("preserves existing completion and quiz handlers and keeps quiz answers out of loader data", async () => {
    expect(await post(base.user.id, "mark-complete")).toEqual({
      success: true,
    });
    expect(testDb.select().from(lessonProgress).get()?.status).toBe(
      "completed"
    );
    const quiz = testDb
      .insert(quizzes)
      .values({ lessonId, title: "Quiz", passingScore: 70 })
      .returning()
      .get();
    const q = testDb
      .insert(quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: "Choose",
        questionType: QuestionType.MultipleChoice,
        position: 1,
      })
      .returning()
      .get();
    const option = testDb
      .insert(quizOptions)
      .values({ questionId: q.id, optionText: "Answer", isCorrect: true })
      .returning()
      .get();
    expect(
      await post(base.user.id, "submit-quiz", {
        quizId: String(quiz.id),
        [`question-${q.id}`]: String(option.id),
      })
    ).toMatchObject({ quizResult: { score: 1, passed: true } });
    const result = await loader(await args(base.user.id));
    expect(result.quiz?.questions[0].options[0]).not.toHaveProperty(
      "isCorrect"
    );
    expect(result.bestAttempt).toEqual({ score: 1, passed: true });
  });

  it.each([new TypeError("Failed to fetch"), new Error("Server unavailable")])(
    "converts an unconfirmed discussion submission into inline retry feedback without retrying it",
    async (error) => {
      const serverAction = vi.fn(async () => {
        throw error;
      });
      const result = await clientAction({
        ...(await args(base.user.id, {
          intent: "discussion-create-reply",
          questionId: "1",
          body: "Keep draft",
        })),
        serverAction,
      });
      expect(result).toMatchObject({
        init: { status: 503 },
        data: {
          discussionResult: {
            ok: false,
            error: {
              code: "submission_failed",
              message: expect.stringContaining(
                "Check the discussion before trying again"
              ),
            },
          },
        },
      });
      expect(serverAction).toHaveBeenCalledOnce();
    }
  );

  it("passes through successful and expected failed command data, preserving existing action behavior", async () => {
    const failure = {
      discussionResult: {
        ok: false as const,
        status: 429,
        retryAfter: 30,
        error: { code: "rate_limited", message: "Try later" },
      },
    };
    const actionArgs = await args(base.user.id, {
      intent: "discussion-create-question",
      title: "Question",
      body: "Body",
    });
    expect(
      await clientAction({ ...actionArgs, serverAction: async () => failure })
    ).toBe(failure);
    const completionArgs = await args(base.user.id, {
      intent: "mark-complete",
    });
    expect(
      await clientAction({
        ...completionArgs,
        serverAction: async () => ({ success: true }),
      })
    ).toEqual({ success: true });
    const error = new Error("Existing action error");
    await expect(
      clientAction({
        ...completionArgs,
        request: completionArgs.request.clone(),
        serverAction: async () => {
          throw error;
        },
      })
    ).rejects.toBe(error);
  });

  it("keeps redirects and aborted requests on the router's normal path", async () => {
    const actionArgs = await args(base.user.id, {
      intent: "discussion-create-question",
    });
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
    await expect(
      clientAction({
        ...actionArgs,
        serverAction: async () => {
          throw redirect;
        },
      })
    ).rejects.toBe(redirect);
    const controller = new AbortController();
    const request = new Request(actionArgs.request, {
      signal: controller.signal,
    });
    const aborted = new DOMException("Aborted", "AbortError");
    controller.abort();
    await expect(
      clientAction({
        ...actionArgs,
        request,
        serverAction: async () => {
          throw aborted;
        },
      })
    ).rejects.toBe(aborted);
  });
});
