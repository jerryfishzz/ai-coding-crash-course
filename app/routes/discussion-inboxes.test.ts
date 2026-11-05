import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  courses,
  discussionNotifications as notifications,
  discussionQuestions as questions,
  discussionReplies as replies,
  enrollments,
  lessons,
  modules,
  purchases,
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
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import {
  acknowledgeDiscussionSources,
  getDiscussionInbox,
  getDiscussionUnreadCounts,
} from "~/services/discussions";
import {
  loader as unreadLoader,
  action as unreadAction,
} from "./api.discussions.unread";
import {
  action as readAction,
  loader as readLoader,
} from "./api.discussions.read";
import {
  loader as notificationsLoader,
  headers as inboxHeaders,
} from "./notifications";
import { loader as teachingLoader } from "./discussion-inbox";
import { loader as layoutLoader, headers as layoutHeaders } from "./layout.app";
import { loader as lessonLoader } from "./courses.$slug.lessons.$lessonId";
import { seedDiscussionActivity } from "../../scripts/seed-discussions";

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
  const module = testDb
    .insert(modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get();
  lessonId = testDb
    .insert(lessons)
    .values({
      moduleId: module.id,
      title: "Full lesson",
      content: "Lesson content",
      position: 1,
    })
    .returning()
    .get().id;
  questionId = question();
  replyId = reply();
});
afterEach(() => testDb.$client.close());

function question(authorId = base.user.id, targetLesson = lessonId) {
  return testDb
    .insert(questions)
    .values({
      lessonId: targetLesson,
      authorId,
      title: "Question title",
      body: "Question body",
    })
    .returning()
    .get().id;
}
function reply(authorId = base.instructor.id, targetQuestion = questionId) {
  return testDb
    .insert(replies)
    .values({ questionId: targetQuestion, authorId, body: "Reply body" })
    .returning()
    .get().id;
}
function deliver(
  recipientId: number,
  inboxKind: "notifications" | "discussion_inbox",
  source: number | null = replyId,
  targetQuestion = questionId,
  readAt: string | null = null
) {
  return testDb
    .insert(notifications)
    .values({
      recipientId,
      inboxKind,
      questionId: targetQuestion,
      replyId: source,
      readAt,
      createdAt: "2026-11-01T00:00:00.000Z",
    })
    .returning()
    .get();
}
async function args(
  path: string,
  actorId: number | null = base.user.id,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  extraHeaders?: HeadersInit
) {
  const url = `http://localhost${path}`;
  const headers = new Headers({ "CF-IPCountry": "US", ...extraHeaders });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (actorId !== null)
    headers.set(
      "Cookie",
      (await setCurrentUserId(new Request(url), actorId)).split(";")[0]
    );
  return {
    request: new Request(url, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    }),
    url: new URL(url),
    pattern: path,
    params: {},
    context: new RouterContextProvider(),
  };
}
const receipt = () => ({ lessonId, questionId, replyIds: [replyId] });
const unread = (actorId = base.user.id, country: string | null = null) =>
  getDiscussionUnreadCounts(actorId, country);

describe("discussion inbox eligibility", () => {
  it("keeps audiences separate by course relationship, including an instructor and admin learning elsewhere", () => {
    deliver(base.user.id, "notifications");
    deliver(base.instructor.id, "discussion_inbox", null);
    // Forged/stale deliveries must not create authority or self alerts.
    deliver(adminId, "discussion_inbox", null);
    deliver(base.instructor.id, "notifications");
    deliver(base.user.id, "discussion_inbox", null);
    deliver(adminId, "notifications");
    expect(unread()).toEqual({ notifications: 1, discussionInbox: 0 });
    expect(unread(base.instructor.id)).toEqual({
      notifications: 0,
      discussionInbox: 1,
    });
    expect(unread(adminId)).toEqual({ notifications: 0, discussionInbox: 0 });
    for (const learnerId of [base.instructor.id, adminId]) {
      const other = testDb
        .insert(courses)
        .values({
          title: "Other",
          description: "Other",
          categoryId: base.category.id,
          slug: `other-${learnerId}`,
          instructorId: base.user.id,
          status: CourseStatus.Published,
        })
        .returning()
        .get();
      const mod = testDb
        .insert(modules)
        .values({ courseId: other.id, title: "Other", position: 1 })
        .returning()
        .get();
      const lesson = testDb
        .insert(lessons)
        .values({ moduleId: mod.id, title: "Other lesson", position: 1 })
        .returning()
        .get();
      testDb
        .insert(enrollments)
        .values({ userId: learnerId, courseId: other.id })
        .run();
      const q = question(learnerId, lesson.id);
      deliver(learnerId, "notifications", reply(base.user.id, q), q);
      expect(unread(learnerId).notifications).toBe(1);
      expect(
        getDiscussionInbox(learnerId, "notifications").entries[0].questionId
      ).toBe(q);
    }
  });

  it("filters hidden/deleted sources before pagination/counts and restores original IDs, order, and read state", () => {
    const entries = Array.from({ length: 23 }, (_, i) => {
      const r = i === 0 ? replyId : reply();
      return deliver(
        base.user.id,
        "notifications",
        r,
        questionId,
        i === 2 ? "2026-11-02" : null
      );
    });
    testDb
      .update(replies)
      .set({ hiddenAt: "2026-11-03" })
      .where(eq(replies.id, entries[22].replyId!))
      .run();
    testDb
      .update(replies)
      .set({ deletedAt: "2026-11-03", body: "" })
      .where(eq(replies.id, entries[21].replyId!))
      .run();
    const first = getDiscussionInbox(base.user.id, "notifications");
    expect(first.total).toBe(21);
    expect(first.entries).toHaveLength(20);
    expect(first.entries.map((e) => e.id)).toEqual(
      entries
        .slice(1, 21)
        .reverse()
        .map((e) => e.id)
    );
    expect(
      getDiscussionInbox(base.user.id, "notifications", 2).entries.map(
        (e) => e.id
      )
    ).toEqual([entries[0].id]);
    expect(unread().notifications).toBe(20);
    testDb.update(questions).set({ hiddenAt: "2026-11-03" }).run();
    expect(getDiscussionInbox(base.user.id, "notifications").total).toBe(0);
    expect(unread().notifications).toBe(0);
    expect(testDb.select().from(notifications).all()).toHaveLength(23);
    testDb.update(questions).set({ hiddenAt: null }).run();
    testDb.update(replies).set({ hiddenAt: null }).run();
    expect(
      getDiscussionInbox(base.user.id, "notifications").entries[0].id
    ).toBe(entries[22].id);
    expect(unread().notifications).toBe(21);
    expect(
      testDb
        .select()
        .from(notifications)
        .where(eq(notifications.id, entries[2].id))
        .get()?.readAt
    ).toBe("2026-11-02");
  });

  it("rechecks enrollment and PPP, preserves inaccessible history, and keeps paused/archived activity readable", () => {
    const original = deliver(base.user.id, "notifications");
    testDb
      .update(courses)
      .set({
        price: 1000,
        pppEnabled: true,
        status: CourseStatus.Archived,
        discussionOverride: "disabled",
      })
      .run();
    testDb.update(lessons).set({ discussionPaused: true }).run();
    testDb
      .insert(purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 500,
        country: "IN",
      })
      .run();
    expect(unread(base.user.id, "US").notifications).toBe(0);
    expect(
      getDiscussionInbox(base.user.id, "notifications", 1, "US").total
    ).toBe(0);
    expect(unread(base.user.id, "IN").notifications).toBe(1);
    testDb.delete(enrollments).run();
    expect(unread().notifications).toBe(0);
    expect(() => acknowledgeDiscussionSources(base.user.id, receipt())).toThrow(
      /access/
    );
    testDb
      .insert(enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    expect(
      getDiscussionInbox(base.user.id, "notifications", 1, "IN").entries[0]
    ).toMatchObject({
      id: original.id,
      createdAt: original.createdAt,
      readAt: null,
    });
    expect(testDb.select().from(notifications).get()?.readAt).toBeNull();
  });

  it("allows owning staff hidden originals while excluding deleted source content, and retains live replies under a deleted question", () => {
    deliver(base.instructor.id, "discussion_inbox", null);
    const learnerReply = reply(base.user.id);
    deliver(base.instructor.id, "discussion_inbox", learnerReply);
    testDb.update(questions).set({ hiddenAt: "2026-11-03" }).run();
    testDb.update(replies).set({ hiddenAt: "2026-11-03" }).run();
    expect(unread(base.instructor.id).discussionInbox).toBe(2);
    expect(
      getDiscussionInbox(base.instructor.id, "discussion_inbox").entries.map(
        (e) => e.excerpt
      )
    ).toEqual(["Reply body", "Question body"]);
    testDb
      .update(questions)
      .set({ deletedAt: "2026-11-03", title: "", body: "" })
      .run();
    const view = getDiscussionInbox(base.instructor.id, "discussion_inbox");
    expect(view.total).toBe(1);
    expect(view.entries[0]).toMatchObject({
      questionTitle: "Deleted question",
      excerpt: "Reply body",
    });
    testDb.update(replies).set({ deletedAt: "2026-11-03", body: "" }).run();
    expect(unread(base.instructor.id).discussionInbox).toBe(0);
  });
});

describe("discussion read resources", () => {
  it("never marks read during layout/count/inbox/lesson loaders, then acknowledges only supplied visible sources and retains history", async () => {
    const first = deliver(base.user.id, "notifications");
    const laterReply = reply();
    const later = deliver(base.user.id, "notifications", laterReply);
    const hidden = reply();
    deliver(base.user.id, "notifications", hidden);
    testDb
      .update(replies)
      .set({ hiddenAt: "2026-11-03" })
      .where(eq(replies.id, hidden))
      .run();
    const layout = await layoutLoader(await args("/notifications"));
    expect(layout.unreadCounts.notifications).toBe(2);
    expect(
      (await unreadLoader(await args("/api/discussions/unread"))).headers.get(
        "Cache-Control"
      )
    ).toBe("private, no-store");
    expect(
      (await notificationsLoader(await args("/notifications"))).total
    ).toBe(2);
    expect(
      (
        await teachingLoader(
          await args("/discussion-inbox", base.instructor.id)
        )
      ).total
    ).toBe(0);
    const lessonArgs = await args(
      `/courses/${base.course.slug}/lessons/${lessonId}?question=${questionId}`
    );
    await lessonLoader({
      ...lessonArgs,
      params: { slug: base.course.slug, lessonId: String(lessonId) },
    });
    expect(
      testDb
        .select()
        .from(notifications)
        .all()
        .every((n) => n.readAt === null)
    ).toBe(true);
    const result = await readAction(
      await args("/api/discussions/read", base.user.id, {
        ...receipt(),
        replyIds: [replyId, hidden],
      })
    );
    expect(await result.json()).toEqual({
      notifications: 1,
      discussionInbox: 0,
    });
    const saved = testDb
      .select()
      .from(notifications)
      .where(eq(notifications.id, first.id))
      .get()!.readAt;
    expect(saved).toBeTruthy();
    expect(
      testDb
        .select()
        .from(notifications)
        .where(eq(notifications.id, later.id))
        .get()?.readAt
    ).toBeNull();
    expect(testDb.select().from(notifications).all().at(-1)?.readAt).toBeNull();
    await readAction(
      await args("/api/discussions/read", base.user.id, receipt())
    );
    expect(
      testDb
        .select()
        .from(notifications)
        .where(eq(notifications.id, first.id))
        .get()?.readAt
    ).toBe(saved);
    expect(
      (await notificationsLoader(await args("/notifications"))).total
    ).toBe(2);
    expect(inboxHeaders()["Cache-Control"]).toBe("private, no-store");
    expect(layoutHeaders()["Cache-Control"]).toBe("private, no-store");
  });

  it("marks question activity for the owner but never other recipients or unsupplied replies", async () => {
    const ownerQuestion = deliver(base.instructor.id, "discussion_inbox", null);
    const learnerReply = reply(base.user.id);
    deliver(base.instructor.id, "discussion_inbox", learnerReply);
    const studentReply = deliver(base.user.id, "notifications");
    const result = await readAction(
      await args("/api/discussions/read", base.instructor.id, {
        ...receipt(),
        replyIds: [],
      })
    );
    expect(await result.json()).toEqual({
      notifications: 0,
      discussionInbox: 1,
    });
    expect(
      testDb
        .select()
        .from(notifications)
        .where(eq(notifications.id, ownerQuestion.id))
        .get()?.readAt
    ).toBeTruthy();
    expect(
      testDb
        .select()
        .from(notifications)
        .where(eq(notifications.id, studentReply.id))
        .get()?.readAt
    ).toBeNull();
  });

  it("rejects malformed, oversized, forged and cross-origin receipts atomically with private predictable errors", async () => {
    deliver(base.user.id, "notifications");
    const anotherQuestion = question();
    const wrongReply = reply(base.instructor.id, anotherQuestion);
    const invalid = [
      null,
      {},
      "{bad",
      { ...receipt(), replyIds: [replyId, replyId] },
      { ...receipt(), replyIds: Array(21).fill(replyId) },
      { ...receipt(), questionId: "1" },
      { ...receipt(), recipientId: adminId },
    ];
    for (const body of invalid) {
      const result = await readAction(
        await args("/api/discussions/read", base.user.id, body)
      );
      expect(result.status).toBe(400);
      expect(await result.json()).toMatchObject({
        error: { code: "validation" },
      });
      expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect(
      (
        await readAction(
          await args("/api/discussions/read", base.user.id, {
            ...receipt(),
            replyIds: [replyId, wrongReply],
          })
        )
      ).status
    ).toBe(404);
    expect(
      (
        await readAction(
          await args("/api/discussions/read", base.user.id, {
            ...receipt(),
            lessonId: 9999,
          })
        )
      ).status
    ).toBe(404);
    expect(
      (
        await readAction(
          await args(
            "/api/discussions/read",
            base.user.id,
            '"' + "x".repeat(4096) + '"'
          )
        )
      ).status
    ).toBe(413);
    expect(
      (
        await readAction(
          await args("/api/discussions/read", base.user.id, receipt(), "POST", {
            Origin: "https://other.example",
          })
        )
      ).status
    ).toBe(403);
    const nonJson = await args(
      "/api/discussions/read",
      base.user.id,
      receipt()
    );
    nonJson.request.headers.set("Content-Type", "text/plain");
    expect((await readAction(nonJson)).status).toBe(400);
    expect(testDb.select().from(notifications).get()?.readAt).toBeNull();
  });

  it("enforces sessions/methods and ignores no client-supplied recipient", async () => {
    expect(
      (await unreadLoader(await args("/api/discussions/unread", null))).status
    ).toBe(401);
    expect(
      (await readAction(await args("/api/discussions/read", null, receipt())))
        .status
    ).toBe(401);
    for (const actorId of [adminId, base.instructor.id]) {
      const result = await unreadLoader(
        await args(
          `/api/discussions/unread?recipientId=${base.user.id}`,
          actorId
        )
      );
      expect(result.status).toBe(400);
    }
    const wrongGet = await readLoader(await args("/api/discussions/read"));
    expect(wrongGet.status).toBe(405);
    expect(wrongGet.headers.get("Allow")).toBe("POST");
    const wrongPost = await unreadAction(
      await args("/api/discussions/unread", base.user.id, {})
    );
    expect(wrongPost.status).toBe(405);
    expect(wrongPost.headers.get("Allow")).toBe("GET");
    await expect(
      notificationsLoader(await args("/notifications", null))
    ).rejects.toMatchObject({ status: 302 });
    for (const search of [
      "?page=0",
      "?page=",
      "?page=-1",
      "?page=1.5",
      "?page=1&page=2",
      "?page=9999999999999999999",
    ]) {
      await expect(
        notificationsLoader(await args("/notifications" + search))
      ).rejects.toMatchObject({ init: { status: 400 } });
    }
    expect(
      (await notificationsLoader(await args("/notifications?page=3"))).entries
    ).toHaveLength(0);
  });

  it("does not mark inaccessible hidden/deleted content or bypass another lesson's question", async () => {
    deliver(base.user.id, "notifications");
    testDb.update(questions).set({ hiddenAt: "2026-11-03" }).run();
    expect(
      (
        await readAction(
          await args("/api/discussions/read", base.user.id, receipt())
        )
      ).status
    ).toBe(404);
    testDb.update(questions).set({ hiddenAt: null }).run();
    testDb.update(replies).set({ deletedAt: "2026-11-03", body: "" }).run();
    expect(
      await (
        await readAction(
          await args("/api/discussions/read", base.user.id, receipt())
        )
      ).json()
    ).toEqual({ notifications: 0, discussionInbox: 0 });
    expect(testDb.select().from(notifications).get()?.readAt).toBeNull();
    const otherLesson = testDb
      .insert(lessons)
      .values({
        moduleId: testDb.select().from(modules).get()!.id,
        title: "Other",
        position: 2,
      })
      .returning()
      .get();
    expect(
      (
        await readAction(
          await args("/api/discussions/read", base.user.id, {
            ...receipt(),
            lessonId: otherLesson.id,
          })
        )
      ).status
    ).toBe(404);
  });
});

it("seeds both inbox kinds, history, and an instructor's separate learner relationship without enabling discussions", () => {
  const otherCourse = testDb
    .insert(courses)
    .values({
      title: "Other course",
      description: "Other",
      categoryId: base.category.id,
      slug: "other",
      instructorId: adminId,
      status: CourseStatus.Published,
    })
    .returning()
    .get();
  const mod = testDb
    .insert(modules)
    .values({ courseId: otherCourse.id, title: "Other", position: 1 })
    .returning()
    .get();
  testDb
    .insert(lessons)
    .values({ moduleId: mod.id, title: "Other lesson", position: 1 })
    .run();
  seedDiscussionActivity(
    testDb,
    base.course.id,
    otherCourse.id,
    base.instructor.id,
    adminId,
    base.user.id
  );
  expect(unread(base.instructor.id)).toEqual({
    notifications: 1,
    discussionInbox: 2,
  });
  expect(unread(base.user.id).notifications).toBe(1);
  expect(
    getDiscussionInbox(base.instructor.id, "notifications").entries.filter(
      (e) => !!e.readAt
    )
  ).toHaveLength(1);
  expect(getDiscussionInbox(base.user.id, "notifications").total).toBe(2);
  expect(
    testDb
      .select()
      .from(courses)
      .all()
      .every((c) => c.discussionOverride === "inherit")
  ).toBe(true);
});
