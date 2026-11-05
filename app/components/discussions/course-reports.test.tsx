// @vitest-environment jsdom
import { act } from "react";
import { URLSearchParams as NodeSearchParams } from "node:url";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryRouter,
  RouterContextProvider,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  courses,
  discussionQuestions,
  discussionReplies,
  discussionReports,
  lessons,
  modules,
  CourseStatus,
} from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let questionId: number;
let replyId: number;
let container: HTMLDivElement;
let root: Root;
let router: ReturnType<typeof createMemoryRouter>;
let beforeAction: (() => Promise<void>) | undefined;
let actionFailure: Error | undefined;
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import CourseEditor, {
  action,
  clientAction,
  loader,
} from "~/routes/instructor.$courseId";

beforeEach(() => {
  vi.stubGlobal("URLSearchParams", NodeSearchParams);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  beforeAction = undefined;
  actionFailure = undefined;
  testDb = createTestDb();
  base = seedBaseData(testDb);
  testDb.update(courses).set({ status: CourseStatus.Archived }).run();
  const module = testDb
    .insert(modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get();
  lessonId = testDb
    .insert(lessons)
    .values({ moduleId: module.id, title: "Lesson context", position: 1 })
    .returning()
    .get().id;
  questionId = testDb
    .insert(discussionQuestions)
    .values({
      lessonId,
      authorId: base.user.id,
      title: "Question context",
      body: "**Question** original\n\n<script>alert(1)</script>",
    })
    .returning()
    .get().id;
  replyId = testDb
    .insert(discussionReplies)
    .values({ questionId, authorId: base.user.id, body: "Reply original" })
    .returning()
    .get().id;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    router?.dispose();
  });
  container.remove();
  testDb.$client.close();
  vi.unstubAllGlobals();
});
function report(reply = false, reason: string | null = null) {
  return testDb
    .insert(discussionReports)
    .values({
      reporterId: base.user.id,
      questionId: reply ? null : questionId,
      replyId: reply ? replyId : null,
      reason,
      createdAt: "2026-11-01T12:00:00.000Z",
    })
    .returning()
    .get();
}
async function mount(search = "?tab=reports") {
  const cookie = (
    await setCurrentUserId(new Request("http://localhost"), base.instructor.id)
  ).split(";")[0];
  function args(request: Request, params: { courseId?: string }) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("Cookie", cookie);
    return {
      request: new Request(request, { headers: requestHeaders }),
      url: new URL(request.url),
      pattern: "/instructor/:courseId",
      params: { courseId: params.courseId ?? "" },
      context: new RouterContextProvider(),
    };
  }
  router = createMemoryRouter(
    [
      {
        path: "/instructor/:courseId",
        loader: ({ request, params }) => loader(args(request, params)),
        action: async ({ request, params }) => {
          await beforeAction?.();
          if (actionFailure)
            return clientAction({
              ...args(request, params),
              serverAction: async () => {
                throw actionFailure;
              },
            });
          return action(args(request, params));
        },
        Component: () => (
          <CourseEditor loaderData={useLoaderData<typeof loader>()} />
        ),
        HydrateFallback: () => null,
      },
    ],
    { initialEntries: [`/instructor/${base.course.id}${search}`] }
  );
  await act(async () => {
    root.render(<RouterProvider router={router} />);
  });
  await settle();
}
async function settle() {
  await act(async () => {
    await vi.waitFor(() => {
      expect(router.state.initialized).toBe(true);
      expect(router.state.navigation.state).toBe("idle");
      expect(
        [...router.state.fetchers.values()].every(
          (fetcher) => fetcher.state === "idle"
        )
      ).toBe(true);
    });
  });
}
async function click(element: HTMLElement) {
  await act(async () => {
    // Radix tabs activate on pointer down; links and form buttons use click.
    if (element.getAttribute("role") === "tab")
      element.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      );
    element.click();
  });
  await settle();
}
function button(text: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll("button")].find(
    (node) => node.textContent === text
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function article(id: number) {
  return container.querySelector<HTMLElement>(
    `[aria-labelledby="report-${id}"]`
  )!;
}

describe("private course Reports tab with real requests and SQLite", () => {
  it("keeps a failed review visible for an explicit retry without hiding content automatically", async () => {
    const source = report();
    await mount();
    actionFailure = new TypeError("Connection lost");
    await click(button("Hide content", article(source.id)));
    expect(
      article(source.id).querySelector('[role="alert"]')?.textContent
    ).toContain("couldn’t confirm that your review was saved");
    expect(
      testDb.select().from(discussionReports).get()?.reviewedAt
    ).toBeNull();
    expect(
      testDb.select().from(discussionQuestions).get()?.hiddenAt
    ).toBeNull();
    await act(async () => {
      await router.revalidate();
    });
    await settle();
    expect(
      testDb.select().from(discussionReports).get()?.reviewedAt
    ).toBeNull();
    actionFailure = undefined;
    await click(button("Hide content", article(source.id)));
    expect(article(source.id).querySelector('[role="alert"]')).toBeNull();
    expect(article(source.id).textContent).toContain(
      "Reviewed: content hidden"
    );
  });

  it("loads reports through tab navigation, preserves query context and restores tabs with Back/Forward", async () => {
    const source = report();
    await mount("?tab=settings&context=keep");
    expect(container.querySelector("#course-reports-heading")).toBeNull();
    await click(button("Reports"));
    expect(router.state.location.search).toBe("?tab=reports&context=keep");
    expect(
      container.querySelector('[role="tab"][data-state="active"]')?.textContent
    ).toBe("Reports");
    expect(article(source.id).textContent).toContain("Question original");
    expect(article(source.id).textContent).toContain("No reason provided.");
    expect(article(source.id).querySelector("strong")?.textContent).toBe(
      "Question"
    );
    expect(article(source.id).querySelector("script")).toBeNull();
    const tabs = container.querySelector('[aria-label="Course management"]')!;
    expect(tabs.parentElement?.className).toContain("overflow-x-auto");
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(
      container.querySelector('[role="tab"][data-state="active"]')?.textContent
    ).toBe("Settings");
    expect(container.querySelector("#course-reports-heading")).toBeNull();
    await act(async () => {
      await router.navigate(1);
    });
    await settle();
    expect(article(source.id)).not.toBeNull();
  });

  it("paginates twenty reports, escapes private reasons, and links replies into the full lesson", async () => {
    for (let index = 0; index < 21; index++)
      report(
        true,
        index === 20 ? '<img src=x onerror="alert(1)">' : `Reason ${index}`
      );
    await mount("?tab=reports&context=keep");
    expect(container.querySelectorAll("article")).toHaveLength(20);
    expect(container.querySelector("article")?.textContent).toContain(
      '<img src=x onerror="alert(1)">'
    );
    expect(container.querySelector("article img")).toBeNull();
    expect(
      container
        .querySelector<HTMLAnchorElement>("article a")
        ?.getAttribute("href")
    ).toBe(
      `/courses/${base.course.slug}/lessons/${lessonId}?question=${questionId}&reply=${replyId}`
    );
    const next = container.querySelector<HTMLAnchorElement>(
      'nav[aria-label="Reports pages"] a'
    )!;
    expect(next.textContent).toBe("Next reports");
    await click(next);
    expect(router.state.location.search).toBe(
      "?tab=reports&context=keep&reportsPage=2"
    );
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.textContent).toContain("Reason 0");
    expect(container.textContent).toContain("Page 2 of 2");
    await click(
      container.querySelector<HTMLAnchorElement>(
        'nav[aria-label="Reports pages"] a'
      )!
    );
    expect(router.state.location.search).toBe("?tab=reports&context=keep");
    expect(container.querySelectorAll("article")).toHaveLength(20);
  });

  it("reviews while archived, disables duplicate submissions, and retains reviewed history", async () => {
    const questionReport = report();
    const replyReport = report(true, "Please review");
    await mount();
    let release!: () => void;
    beforeAction = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    await act(async () => {
      button("Hide content", article(replyReport.id)).click();
    });
    await act(async () => {
      await vi.waitFor(() => expect(release).toBeDefined());
    });
    expect(button("Hide content", article(replyReport.id)).disabled).toBe(true);
    expect(button("Dismiss report", article(replyReport.id)).disabled).toBe(
      true
    );
    expect(article(replyReport.id).textContent).toContain("Reviewing…");
    beforeAction = undefined;
    await act(async () => {
      release();
    });
    await settle();
    expect(article(replyReport.id).textContent).toContain(
      "Reviewed: content hidden"
    );
    expect(article(replyReport.id).textContent).toContain("Hidden");
    expect(article(replyReport.id).textContent).toContain("Reply original");
    expect(article(replyReport.id).querySelector("button")).toBeNull();
    expect(testDb.select().from(discussionReplies).get()?.hiddenBy).toBe(
      base.instructor.id
    );
    await click(button("Dismiss report", article(questionReport.id)));
    expect(article(questionReport.id).textContent).toContain("Dismissed");
    expect(
      testDb.select().from(discussionQuestions).get()?.hiddenAt
    ).toBeNull();
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(
      testDb
        .select()
        .from(discussionReports)
        .all()
        .every((row) => row.reviewedBy === base.instructor.id)
    ).toBe(true);
  });

  it("shows an empty state and deleted originals as tombstones with only dismiss available", async () => {
    await mount();
    expect(container.textContent).toContain("No discussion reports yet.");
    const source = report(true);
    testDb
      .update(discussionReplies)
      .set({ body: "", deletedAt: new Date().toISOString() })
      .run();
    await act(async () => {
      await router.revalidate();
    });
    await settle();
    expect(article(source.id).textContent).toContain(
      "This post was deleted by its author."
    );
    expect(article(source.id).textContent).not.toContain("Reply original");
    expect(
      [...article(source.id).querySelectorAll("button")].map(
        (node) => node.textContent
      )
    ).toEqual(["Dismiss report"]);
    await click(button("Dismiss report", article(source.id)));
    expect(article(source.id).textContent).toContain("Dismissed");
  });
});
