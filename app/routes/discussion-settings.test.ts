import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  courses,
  discussionSettings,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let adminId: number;
let lessonId: number;
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import { action as adminAction, loader as adminLoader } from "./admin.courses";
import {
  action as courseAction,
  loader as courseLoader,
} from "./instructor.$courseId";
import {
  action as lessonAction,
  loader as lessonLoader,
} from "./instructor.$courseId.lessons.$lessonId";

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
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
      title: "Lesson",
      content: "Existing lesson",
      position: 1,
    })
    .returning()
    .get().id;
});

afterEach(() => testDb.$client.close());

async function args(
  actorId: number | null,
  fields?: Record<string, string>,
  params = { courseId: String(base.course.id), lessonId: String(lessonId) },
  method = fields ? "POST" : "GET"
) {
  const url = "http://localhost/instructor/course";
  const headers = new Headers();
  if (actorId !== null) {
    const cookie = await setCurrentUserId(new Request(url), actorId);
    headers.set("Cookie", cookie.split(";")[0]);
  }
  return {
    request: new Request(url, {
      method,
      headers,
      body: fields ? new URLSearchParams(fields) : undefined,
    }),
    url: new URL(url),
    pattern: "/instructor/:courseId/lessons/:lessonId",
    params,
    context: new RouterContextProvider(),
  };
}

describe("discussion setting request handlers", () => {
  it("changes the global default using the actual admin action and cookie session", async () => {
    expect(
      await adminAction(
        await args(adminId, {
          intent: "discussion-set-global",
          value: "enabled",
        })
      )
    ).toMatchObject({ data: { success: true } });
    expect(testDb.select().from(discussionSettings).get()?.defaultEnabled).toBe(
      true
    );
    await expect(
      adminAction(
        await args(base.instructor.id, {
          intent: "discussion-set-global",
          value: "disabled",
        })
      )
    ).rejects.toMatchObject({ init: { status: 403 } });
    await expect(
      adminAction(
        await args(null, { intent: "discussion-set-global", value: "disabled" })
      )
    ).rejects.toMatchObject({ init: { status: 401 } });
  });

  it("rejects instructor writes at both course and lesson level", async () => {
    expect(
      await courseAction(
        await args(base.instructor.id, {
          intent: "discussion-set-course",
          value: "enabled",
        })
      )
    ).toMatchObject({
      data: { error: expect.any(String) },
      init: { status: 403 },
    });
    expect(
      await lessonAction(
        await args(base.instructor.id, {
          intent: "discussion-set-lesson",
          value: "disabled",
        })
      )
    ).toMatchObject({
      data: { error: expect.any(String) },
      init: { status: 403 },
    });
    expect(testDb.select().from(courses).get()?.discussionOverride).toBe(
      "inherit"
    );
    expect(testDb.select().from(lessons).get()?.discussionPaused).toBe(false);
  });

  it("supports admin course overrides and lesson pauses without changing publication or lesson content", async () => {
    expect(
      await courseAction(
        await args(adminId, {
          intent: "discussion-set-course",
          value: "enabled",
        })
      )
    ).toMatchObject({ data: { success: true } });
    expect(
      await lessonAction(
        await args(adminId, {
          intent: "discussion-set-lesson",
          value: "disabled",
        })
      )
    ).toMatchObject({ data: { success: true } });
    expect(testDb.select().from(courses).get()).toMatchObject({
      discussionOverride: "enabled",
      status: base.course.status,
    });
    expect(testDb.select().from(lessons).get()).toMatchObject({
      discussionPaused: true,
      content: "Existing lesson",
    });
    expect(
      await lessonAction(
        await args(adminId, {
          intent: "discussion-set-lesson",
          value: "inherit",
        })
      )
    ).toMatchObject({ data: { success: true } });
    expect(testDb.select().from(lessons).get()?.discussionPaused).toBe(false);
  });

  it("validates explicit values and rejects unsupported methods", async () => {
    expect(
      await lessonAction(
        await args(adminId, {
          intent: "discussion-set-lesson",
          value: "enabled",
        })
      )
    ).toMatchObject({ init: { status: 400 } });
    expect(
      await courseAction(
        await args(adminId, { intent: "discussion-set-course", value: "bogus" })
      )
    ).toMatchObject({ init: { status: 400 } });
    expect(
      await adminAction(
        await args(
          adminId,
          { intent: "discussion-set-global", value: "enabled" },
          undefined,
          "PUT"
        )
      )
    ).toMatchObject({ init: { status: 405 } });
  });

  it("validates the course/lesson path and ignores submitted IDs and privileged extra fields", async () => {
    const second = testDb
      .insert(courses)
      .values({ ...base.course, id: undefined, slug: "second" })
      .returning()
      .get();
    await expect(
      lessonAction(
        await args(
          adminId,
          { intent: "discussion-set-lesson", value: "disabled" },
          { courseId: String(second.id), lessonId: String(lessonId) }
        )
      )
    ).rejects.toMatchObject({ init: { status: 404 } });
    await courseAction(
      await args(adminId, {
        intent: "discussion-set-course",
        value: "enabled",
        courseId: String(second.id),
      })
    );
    expect(
      testDb.select().from(courses).where(eq(courses.id, second.id)).get()
        ?.discussionOverride
    ).toBe("inherit");
    await lessonAction(
      await args(base.instructor.id, {
        intent: "update-lesson",
        content: "Updated content",
        discussionPaused: "true",
      })
    );
    expect(testDb.select().from(lessons).get()).toMatchObject({
      discussionPaused: false,
      content: "Updated content",
    });
  });

  it("returns effective settings on GET without mutating settings or notifying users", async () => {
    expect(await adminLoader(await args(adminId))).toMatchObject({
      discussionSettings: { defaultEnabled: false },
    });
    expect(await courseLoader(await args(base.instructor.id))).toMatchObject({
      discussionSettings: { courseEnabled: false, canManage: false },
    });
    expect(await lessonLoader(await args(adminId))).toMatchObject({
      discussionSettings: { lessonPaused: false, canManage: true },
    });
    expect(testDb.select().from(discussionSettings).all()).toEqual([
      { id: 1, defaultEnabled: false },
    ]);
  });
});
