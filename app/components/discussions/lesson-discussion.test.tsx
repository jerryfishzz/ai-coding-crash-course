// @vitest-environment jsdom
import { act } from "react";
import { URLSearchParams as NodeSearchParams } from "node:url";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryRouter,
  Outlet,
  RouterContextProvider,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  courses,
  discussionQuestions,
  discussionReplies,
  discussionReports,
  discussionNotifications,
  CourseStatus,
  enrollments,
  lessons,
  modules,
  users,
  videoWatchEvents,
} from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { MainScroll } from "~/components/main-scroll";
import { Sidebar } from "~/components/sidebar";
import { UnreadActivity } from "./unread-activity";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let questionId: number;
let container: HTMLDivElement;
let root: Root;
let router: ReturnType<typeof createMemoryRouter>;
let beforeAction: (() => Promise<void>) | undefined;
let actionFailure: Error | undefined;
const pendingResources = new Set<Promise<Response>>();
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
import LessonViewer, {
  action,
  clientAction,
  loader,
} from "~/routes/courses.$slug.lessons.$lessonId";
import Notifications, {
  loader as notificationsLoader,
  ErrorBoundary as InboxError,
} from "~/routes/notifications";
import InstructorInbox, {
  loader as teachingLoader,
} from "~/routes/discussion-inbox";
import { discussionResource } from "~/lib/discussion-resources.server";
import { getDiscussionUnreadCounts } from "~/services/discussions";

// Model the iframe replacement performed by YouTube without making network calls.
const players: FakePlayer[] = [];
class FakePlayer {
  iframe = document.createElement("iframe");
  position: number;
  destroy = vi.fn(() => this.iframe.remove());
  getCurrentTime = () => this.position;
  getDuration = () => 600;
  playVideo = vi.fn();
  constructor(
    target: HTMLElement,
    public options: {
      playerVars: { start: number };
      events: { onReady: () => void };
    }
  ) {
    this.position = options.playerVars.start;
    target.replaceWith(this.iframe);
    players.push(this);
    queueMicrotask(() => options.events.onReady());
  }
}

beforeEach(() => {
  beforeAction = undefined;
  actionFailure = undefined;
  pendingResources.clear();
  // Router requests use Node's fetch implementation, which checks this brand.
  vi.stubGlobal("URLSearchParams", NodeSearchParams);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("YT", {
    Player: FakePlayer,
    PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
  });
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
      title: "Lesson context",
      content: "Keep the full lesson visible.",
      videoUrl: "https://www.youtube.com/watch?v=example1234",
      durationMinutes: 10,
      position: 1,
    })
    .returning()
    .get().id;
  questionId = testDb
    .insert(discussionQuestions)
    .values({
      lessonId,
      authorId: base.user.id,
      title: "Original question",
      body: "Question details",
    })
    .returning()
    .get().id;
  players.length = 0;
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

async function mount(
  search = "",
  actorId = base.user.id,
  withUnread = false,
  hydrated = false
) {
  const path = `/courses/${base.course.slug}/lessons/${lessonId}`;
  const cookie = (
    await setCurrentUserId(new Request("http://localhost"), actorId)
  ).split(";")[0];
  function requestArgs(
    request: Request,
    params: { slug?: string; lessonId?: string }
  ) {
    const headers = new Headers(request.headers);
    headers.set("Cookie", cookie);
    headers.set("CF-IPCountry", "US");
    return {
      request: new Request(request, { headers }),
      url: new URL(request.url),
      pattern: "/courses/:slug/lessons/:lessonId",
      params: { slug: params.slug ?? "", lessonId: params.lessonId ?? "" },
      context: new RouterContextProvider(),
    };
  }
  if (withUnread)
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        const request = new Request(new URL(input, "http://localhost"), init);
        const authenticated = requestArgs(request, {}).request;
        if (
          input === "/api/discussions/read" ||
          input === "/api/discussions/unread"
        ) {
          const pending = discussionResource(
            authenticated,
            input.endsWith("/read") ? "read" : "unread"
          );
          pendingResources.add(pending);
          void pending.then(
            () => pendingResources.delete(pending),
            () => pendingResources.delete(pending)
          );
          return pending;
        }
        return Promise.resolve(Response.json({ success: true }));
      })
    );
  const user = testDb.select().from(users).where(eq(users.id, actorId)).get()!;
  function Frame() {
    const content = (
      <>
        <Sidebar currentUser={{ ...user, avatarUrl: null }} />
        <MainScroll>
          <Outlet />
        </MainScroll>
      </>
    );
    return withUnread ? (
      <UnreadActivity initialCounts={getDiscussionUnreadCounts(actorId)}>
        {content}
      </UnreadActivity>
    ) : (
      <MainScroll>
        <Outlet />
      </MainScroll>
    );
  }
  const initialData = hydrated
    ? await loader(
        requestArgs(new Request(`http://localhost${path}${search}`), {
          slug: base.course.slug,
          lessonId: String(lessonId),
        })
      )
    : undefined;
  router = createMemoryRouter(
    [
      {
        Component: Frame,
        children: [
          {
            id: "lesson",
            path: "/courses/:slug/lessons/:lessonId",
            loader: ({ request, params }) =>
              loader(requestArgs(request, params)),
            action: async ({ request, params }) => {
              await beforeAction?.();
              const args = requestArgs(request, params);
              if (actionFailure)
                return clientAction({
                  ...args,
                  serverAction: async () => {
                    throw actionFailure;
                  },
                });
              return action(args);
            },
            Component: () => (
              <LessonViewer loaderData={useLoaderData<typeof loader>()} />
            ),
            HydrateFallback: () => null,
          },
          { path: "/elsewhere", Component: () => <h1>Elsewhere</h1> },
          {
            path: "/notifications",
            loader: ({ request }) =>
              notificationsLoader({ ...requestArgs(request, {}), params: {} }),
            Component: () => (
              <Notifications
                loaderData={useLoaderData<typeof notificationsLoader>()}
              />
            ),
            ErrorBoundary: InboxError,
          },
          {
            path: "/discussion-inbox",
            loader: ({ request }) =>
              teachingLoader({ ...requestArgs(request, {}), params: {} }),
            Component: () => (
              <InstructorInbox
                loaderData={useLoaderData<typeof teachingLoader>()}
              />
            ),
            ErrorBoundary: InboxError,
          },
        ],
      },
    ],
    {
      initialEntries: [path + search],
      ...(hydrated
        ? { hydrationData: { loaderData: { lesson: initialData } } }
        : {}),
    }
  );
  await act(async () => {
    root.render(<RouterProvider router={router} />);
  });
  await settle();
}
async function settle() {
  // A successful fetcher commits first; its effect can then navigate to the
  // created source. Flush that commit before waiting for the resulting loader.
  for (let commit = 0; commit < 2; commit++) {
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
      // Unread resources use native fetch rather than Router fetchers. Wait
      // for those real handlers too, then let their consumers commit counts.
      await Promise.all([...pendingResources]);
    });
  }
}
function section() {
  return container.querySelector<HTMLElement>("#lesson-discussion")!;
}
function button(text: string, scope: ParentNode = section()) {
  const found = [...scope.querySelectorAll("button")].find(
    (node) => node.textContent === text
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
  await settle();
}
async function fill(
  name: string,
  value: string,
  scope: ParentNode = section()
) {
  const input = scope.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`
  )!;
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      input,
      value
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function value(name: string, scope: ParentNode = section()) {
  return scope.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`
  )?.value;
}
async function go(search: string) {
  await act(async () => {
    await router.navigate(
      `/courses/${base.course.slug}/lessons/${lessonId}${search}`
    );
  });
  await settle();
}
function unload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("lesson discussion UI with real loaders/actions and SQLite", () => {
  it("marks only displayed original sources read, keeps history, and removes the number badge at zero without resetting playback", async () => {
    const created = [];
    for (let i = 0; i < 22; i++) {
      const reply = testDb
        .insert(discussionReplies)
        .values({
          questionId,
          authorId: base.instructor.id,
          body: `Activity ${i}`,
          hiddenAt: i === 1 ? "2026-11-01" : null,
          deletedAt: i === 2 ? "2026-11-01" : null,
        })
        .returning()
        .get();
      created.push(reply);
      testDb
        .insert(discussionNotifications)
        .values({
          recipientId: base.user.id,
          inboxKind: "notifications",
          questionId,
          replyId: reply.id,
        })
        .run();
    }
    await mount("", base.user.id, true);
    const nav = container.querySelector("aside")!;
    expect(nav.querySelector('[aria-label="20 unread"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/discussion-inbox"]')).toBeNull();
    const iframe = container.querySelector("iframe");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => url === "/api/discussions/read")
    ).toHaveLength(0);
    await go(`?question=${questionId}`);
    expect(
      testDb
        .select()
        .from(discussionNotifications)
        .all()
        .filter((n) => !!n.readAt)
    ).toHaveLength(18);
    expect(nav.querySelector('[aria-label="2 unread"]')).not.toBeNull();
    const receiptCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/discussions/read")!;
    expect(JSON.parse(String(receiptCall[1]?.body)).replyIds).toEqual(
      created
        .slice(0, 20)
        .filter((_, i) => i !== 1 && i !== 2)
        .map((r) => r.id)
    );
    await go(`?question=${questionId}&repliesPage=2`);
    expect(
      testDb
        .select()
        .from(discussionNotifications)
        .all()
        .filter((n) => !!n.readAt)
    ).toHaveLength(20);
    expect(nav.querySelector('[aria-label$=" unread"]')).toBeNull();
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(players).toHaveLength(1);
    await click(
      nav.querySelector<HTMLAnchorElement>('a[href="/notifications"]')!
    );
    const main = container.querySelector("main")!;
    expect(main.querySelector("h1")?.textContent).toBe("Notifications");
    expect(main.querySelectorAll("li")).toHaveLength(20);
    expect(main.textContent).not.toContain("Unread");
    expect(testDb.select().from(discussionNotifications).all()).toHaveLength(
      22
    );
  });

  it("checks counts after pathname/query and history navigation, excluding scroll, hash, and menu state", async () => {
    await mount("", base.user.id, true);
    const countRequests = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => url === "/api/discussions/unread").length;
    expect(countRequests()).toBe(0);
    container.querySelector("main")!.dispatchEvent(new Event("scroll"));
    await click(
      [...container.querySelectorAll("aside button")].find((button) =>
        button.textContent?.includes("Mode")
      )! as HTMLElement
    );
    await go("#lesson-discussion");
    expect(countRequests()).toBe(0);
    await go("?questionsPage=2");
    expect(countRequests()).toBe(1);
    // An unavailable selection exercises query navigation without a read
    // receipt's independently required reconciliation GET racing these counts.
    await go("?question=1000000000");
    expect(countRequests()).toBe(2);
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(countRequests()).toBe(3);
    await act(async () => {
      await router.navigate(1);
    });
    await settle();
    expect(countRequests()).toBe(4);
    await act(async () => {
      await router.navigate("/elsewhere");
    });
    await settle();
    expect(countRequests()).toBe(5);
  });

  it("retries a failed receipt while its detail view is active and stops retries after leaving that view", async () => {
    const reply = testDb
      .insert(discussionReplies)
      .values({
        questionId,
        authorId: base.instructor.id,
        body: "Unread answer",
      })
      .returning()
      .get();
    testDb
      .insert(discussionNotifications)
      .values({
        recipientId: base.user.id,
        inboxKind: "notifications",
        questionId,
        replyId: reply.id,
      })
      .run();
    await mount("", base.user.id, true);
    const send = vi.mocked(fetch).getMockImplementation()!;
    let receiptAttempts = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (input === "/api/discussions/read" && ++receiptAttempts === 1)
        return Response.json({}, { status: 503 });
      return send(input, init);
    });
    vi.useFakeTimers();
    await go(`?question=${questionId}`);
    expect(receiptAttempts).toBe(1);
    expect(
      testDb.select().from(discussionNotifications).get()?.readAt
    ).toBeNull();
    expect(
      container.querySelector('aside [aria-label="1 unread"]')
    ).not.toBeNull();
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
    } finally {
      vi.useRealTimers();
    }
    await settle();
    expect(receiptAttempts).toBe(2);
    expect(
      testDb.select().from(discussionNotifications).get()?.readAt
    ).toBeTruthy();
    expect(container.querySelector('aside [aria-label$=" unread"]')).toBeNull();
    await go("");
    testDb.update(discussionNotifications).set({ readAt: null }).run();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (input === "/api/discussions/read") {
        receiptAttempts++;
        return Response.json({}, { status: 503 });
      }
      return send(input, init);
    });
    vi.useFakeTimers();
    await go(`?question=${questionId}`);
    const beforeLeaving = receiptAttempts;
    await go("");
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(receiptAttempts).toBe(beforeLeaving);
    expect(
      testDb.select().from(discussionNotifications).get()?.readAt
    ).toBeNull();
  });

  it("shows paginated read/unread inbox history in the main area with safe text, deep links, and an invalid-page recovery", async () => {
    for (let i = 0; i < 21; i++) {
      const reply = testDb
        .insert(discussionReplies)
        .values({
          questionId,
          authorId: base.instructor.id,
          body: `<img src=x onerror=alert(1)> Activity ${i}`,
        })
        .returning()
        .get();
      testDb
        .insert(discussionNotifications)
        .values({
          recipientId: base.user.id,
          inboxKind: "notifications",
          questionId,
          replyId: reply.id,
          readAt: i === 20 ? "2026-11-01" : null,
          createdAt: "2026-11-01",
        })
        .run();
    }
    await mount("", base.user.id, true);
    await act(async () => {
      await router.navigate("/notifications?context=keep");
    });
    await settle();
    const main = container.querySelector("main")!;
    expect(main.querySelectorAll("li")).toHaveLength(20);
    expect(main.querySelector("img")).toBeNull();
    expect(main.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(main.textContent).toContain("Unread");
    expect(
      testDb
        .select()
        .from(discussionNotifications)
        .all()
        .filter((n) => n.readAt)
    ).toHaveLength(1);
    const next = [...main.querySelectorAll<HTMLAnchorElement>("nav a")].find(
      (a) => a.textContent === "Next"
    )!;
    await click(next);
    expect(router.state.location.search).toBe("?context=keep&page=2");
    expect(main.querySelectorAll("li")).toHaveLength(1);
    const detail = main.querySelector<HTMLAnchorElement>(
      'li a[href*="&reply="]'
    )!;
    await click(detail);
    expect(container.querySelector("h1")?.textContent).toBe("Lesson context");
    expect(section().querySelectorAll('[id^="reply-"]')).toHaveLength(20);
    await act(async () => {
      await router.navigate("/notifications?page=oops");
    });
    await settle();
    expect(main.querySelector('[role="alert"]')?.textContent).toContain(
      "invalid"
    );
    await click(
      main.querySelector<HTMLAnchorElement>('a[href="/notifications"]')!
    );
    expect(main.querySelector("h1")?.textContent).toBe("Notifications");
    expect(main.querySelectorAll("li")).toHaveLength(20);
  });

  it("offers both instructor inbox links, keeps the pages separate, and marks a new question read only in its lesson detail", async () => {
    testDb
      .insert(discussionNotifications)
      .values({
        recipientId: base.instructor.id,
        inboxKind: "discussion_inbox",
        questionId,
      })
      .run();
    await mount("", base.instructor.id, true);
    const nav = container.querySelector("aside")!;
    expect(nav.querySelector('a[href="/notifications"]')).not.toBeNull();
    expect(
      nav.querySelector('a[href="/discussion-inbox"] [aria-label="1 unread"]')
    ).not.toBeNull();
    await click(
      nav.querySelector<HTMLAnchorElement>('a[href="/notifications"]')!
    );
    expect(container.querySelector("main")?.textContent).toContain(
      "No notifications yet."
    );
    await click(
      nav.querySelector<HTMLAnchorElement>('a[href="/discussion-inbox"]')!
    );
    expect(container.querySelector("main h1")?.textContent).toBe(
      "Discussion inbox"
    );
    expect(
      testDb.select().from(discussionNotifications).get()?.readAt
    ).toBeNull();
    await click(
      container.querySelector<HTMLAnchorElement>(
        'main li a[href*="?question="]'
      )!
    );
    expect(
      testDb.select().from(discussionNotifications).get()?.readAt
    ).toBeTruthy();
    expect(nav.querySelector('[aria-label$=" unread"]')).toBeNull();
  });

  it("reports with an optional reason, keeps failed report text for explicit retry, and leaves posting drafts alone", async () => {
    testDb
      .insert(discussionReplies)
      .values({
        questionId,
        authorId: base.instructor.id,
        body: "Report this reply",
      })
      .run();
    await mount(`?question=${questionId}`);
    await fill(
      "body",
      "Unrelated reply draft",
      section()
        .querySelector('form input[value="discussion-create-reply"]')!
        .closest("form")!
    );
    const question = () =>
      section().querySelector<HTMLElement>(`#question-${questionId}`)!;
    await click(button("Report", question()));
    expect(document.activeElement).toBe(
      question().querySelector('[name="reason"]')
    );
    expect(question().querySelector("textarea")?.maxLength).toBe(2000);
    await fill("reason", "Please review this", question());
    actionFailure = new TypeError("Connection lost");
    await click(button("Send report", question()));
    expect(question().querySelector('[role="alert"]')?.textContent).toContain(
      "couldn’t confirm"
    );
    expect(value("reason", question())).toBe("Please review this");
    expect(testDb.select().from(discussionReports).all()).toHaveLength(0);
    actionFailure = undefined;
    await click(button("Send report", question()));
    expect(question().textContent).toContain(
      "Report sent to the course moderators."
    );
    expect(document.activeElement).toBe(button("Report", question()));
    expect(question().querySelector('[name="reason"]')).toBeNull();
    expect(testDb.select().from(discussionReports).get()).toMatchObject({
      questionId,
      replyId: null,
      reason: "Please review this",
    });
    const reply = section().querySelector<HTMLElement>('[id^="reply-"]')!;
    await click(button("Report", reply));
    await click(button("Send report", reply));
    expect(testDb.select().from(discussionReports).all()).toMatchObject([
      { reason: "Please review this" },
      { questionId: null, reason: null },
    ]);
    expect(
      value(
        "body",
        section()
          .querySelector('form input[value="discussion-create-reply"]')!
          .closest("form")!
      )
    ).toBe("Unrelated reply draft");
    expect(section().textContent).not.toContain("Hide question");
  });

  it("offers hide/restore with staff originals while archived without resetting the lesson player", async () => {
    const reply = testDb
      .insert(discussionReplies)
      .values({
        questionId,
        authorId: base.user.id,
        body: "Staff can inspect this reply",
      })
      .returning()
      .get();
    testDb.update(courses).set({ status: CourseStatus.Archived }).run();
    await mount(`?question=${questionId}`, base.instructor.id);
    const player = players[0];
    const article = () =>
      section().querySelector<HTMLElement>(`#reply-${reply.id}`)!;
    expect(section().textContent).toContain("This course is archived");
    expect(section().textContent).not.toContain("Resolve question");
    await click(button("Hide reply", article()));
    expect(article().textContent).toContain("Hidden from students.");
    expect(article().textContent).toContain("Staff can inspect this reply");
    expect(testDb.select().from(discussionReplies).get()?.hiddenBy).toBe(
      base.instructor.id
    );
    await click(button("Restore reply", article()));
    expect(article().textContent).not.toContain("Hidden from students.");
    await click(button("Hide question"));
    expect(section().textContent).toContain("Question details");
    expect(section().textContent).toContain("Staff can inspect this reply");
    await click(
      section().querySelector<HTMLAnchorElement>(
        'a[href="?questionsPage=1"]'
      ) ??
        [...section().querySelectorAll("a")].find((link) =>
          link.textContent?.includes("All questions")
        )!
    );
    expect(section().textContent).toContain("Hidden");
    await click(
      section().querySelector<HTMLAnchorElement>(
        `#discussion-question-link-${questionId}`
      )!
    );
    await click(button("Restore question"));
    expect(
      testDb.select().from(discussionQuestions).get()?.hiddenAt
    ).toBeNull();
    expect(players).toHaveLength(1);
    expect(player.destroy).not.toHaveBeenCalled();
  });

  it("gives learners placeholders without report/restore controls or hidden originals", async () => {
    const reply = testDb
      .insert(discussionReplies)
      .values({
        questionId,
        authorId: base.user.id,
        body: "Hidden learner original",
        hiddenAt: new Date().toISOString(),
        hiddenBy: base.instructor.id,
      })
      .returning()
      .get();
    const deleted = testDb
      .insert(discussionReplies)
      .values({
        questionId,
        authorId: base.user.id,
        body: "",
        deletedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    await mount(`?question=${questionId}`);
    for (const id of [reply.id, deleted.id]) {
      const article = section().querySelector<HTMLElement>(`#reply-${id}`)!;
      expect(article.querySelector("button")).toBeNull();
    }
    expect(section().textContent).toContain("This reply is hidden.");
    expect(section().textContent).not.toContain("Hidden learner original");
    testDb
      .update(discussionQuestions)
      .set({ hiddenAt: new Date().toISOString() })
      .run();
    await act(async () => {
      await router.revalidate();
    });
    await settle();
    expect(section().textContent).toContain(
      "This discussion content is unavailable."
    );
    expect(section().textContent).not.toContain("Question details");
    expect(section().querySelector("article")).toBeNull();
    expect(container.textContent).toContain("Keep the full lesson visible.");
  });

  it("keeps a question draft and independent reply drafts through query navigation and history without warnings", async () => {
    const other = testDb
      .insert(discussionQuestions)
      .values({
        lessonId,
        authorId: base.instructor.id,
        title: "Other question",
        body: "Other details",
      })
      .returning()
      .get();
    await mount();
    await click(button("Ask a question"));
    await fill("title", "A draft question");
    await fill("body", "Unsent question details");
    expect(unload()).toBe(true);
    await go(`?question=${questionId}`);
    await fill("body", "First thread draft");
    await go(`?question=${other.id}`);
    expect(value("body")).toBe("");
    await fill("body", "Other thread draft");
    await go(`?question=${questionId}&repliesPage=2`);
    expect(value("body")).toBe("First thread draft");
    await go("?questionsPage=2");
    expect(value("title")).toBe("A draft question");
    expect(value("body")).toBe("Unsent question details");
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(value("body")).toBe("First thread draft");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    await go(`?question=${other.id}#lesson-discussion`);
    expect(value("body")).toBe("Other thread draft");
    await go("");
    await click(button("Close draft"));
    await click(button("Resume question"));
    expect(value("title")).toBe("A draft question");
    await go(`?question=${questionId}`);
    const input = section().querySelector<HTMLTextAreaElement>("textarea")!;
    input.focus();
    await go(`?question=${questionId}&context=keep-focus`);
    expect(document.activeElement).toBe(input);
    await click(button("Post reply"));
    expect(value("body")).toBe("");
    await go(`?question=${other.id}`);
    expect(value("body")).toBe("Other thread draft");
    await go("");
    expect(value("title")).toBe("A draft question");
    expect(value("body")).toBe("Unsent question details");
  });

  it("preserves dirty question/reply edits when the forms unmount, and lets an author explicitly discard them", async () => {
    const reply = testDb
      .insert(discussionReplies)
      .values({ questionId, authorId: base.user.id, body: "Original answer" })
      .returning()
      .get();
    await mount(`?question=${questionId}`);
    let q = section().querySelector<HTMLElement>(`#question-${questionId}`)!;
    let r = section().querySelector<HTMLElement>(`#reply-${reply.id}`)!;
    await click(button("Edit", q));
    await fill("title", "Edited draft title", q);
    await fill("body", "Edited draft body", q);
    await click(button("Edit", r));
    await fill("body", "Edited reply draft", r);
    await go("");
    await go(`?question=${questionId}`);
    q = section().querySelector<HTMLElement>(`#question-${questionId}`)!;
    r = section().querySelector<HTMLElement>(`#reply-${reply.id}`)!;
    expect(value("title", q)).toBe("Edited draft title");
    expect(value("body", q)).toBe("Edited draft body");
    expect(value("body", r)).toBe("Edited reply draft");
    expect(unload()).toBe(true);
    await click(button("Discard changes", q));
    expect(unload()).toBe(true);
    await click(button("Discard changes", r));
    expect(unload()).toBe(false);
    expect(testDb.select().from(discussionReplies).get()?.body).toBe(
      "Original answer"
    );
  });

  it("blocks leaving the lesson, focuses Stay, restores focus on Stay/Escape, and discards drafts only on Leave", async () => {
    const next = testDb
      .insert(lessons)
      .values({
        moduleId: testDb.select().from(modules).get()!.id,
        title: "Next lesson",
        position: 2,
      })
      .returning()
      .get();
    await mount(`?question=${questionId}`);
    await fill("body", "Do not lose this reply");
    const nextLink = container.querySelector<HTMLAnchorElement>(
      `a[href$="/lessons/${next.id}"]`
    )!;
    nextLink.focus();
    await click(nextLink);
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain(
      "Leaving will discard this lesson’s drafts"
    );
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(button("Stay", dialog));
    expect(router.state.location.pathname).toContain(`/lessons/${lessonId}`);
    await click(button("Stay", dialog));
    await act(async () => {
      await vi.waitFor(() => expect(document.activeElement).toBe(nextLink));
    });
    expect(value("body")).toBe("Do not lose this reply");
    await click(nextLink);
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(value("body")).toBe("Do not lose this reply");
    await click(nextLink);
    await click(button("Leave", document.body));
    expect(container.querySelector("h1")?.textContent).toBe("Next lesson");
    expect(unload()).toBe(false);
    await go(`?question=${questionId}`);
    expect(value("body")).toBe("");
    expect(unload()).toBe(false);
  });

  it("warns for app exits and browser unload only while dirty, and fresh mounts have no saved drafts", async () => {
    await mount();
    await click(button("Ask a question"));
    expect(unload()).toBe(false);
    await fill("body", "Temporary text");
    expect(unload()).toBe(true);
    await act(async () => {
      await router.navigate("/elsewhere");
    });
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click(button("Stay", document.body));
    await fill("body", "");
    expect(unload()).toBe(false);
    await fill("body", "Memory only");
    await act(async () => {
      root.render(null);
      router.dispose();
    });
    expect(unload()).toBe(false);
    await mount();
    expect(button("Ask a question")).not.toBeNull();
    await click(button("Ask a question"));
    expect(value("body")).toBe("");
    await act(async () => {
      await router.navigate("/elsewhere");
    });
    expect(container.querySelector("h1")?.textContent).toBe("Elsewhere");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("keeps text typed during a pending create, prevents double submission, and clears only the successfully resubmitted snapshot", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    beforeAction = vi.fn(() => gate);
    await mount();
    await click(button("Ask a question"));
    await fill("title", "Submitted title");
    await fill("body", "Submitted body");
    await act(async () => button("Post question").click());
    expect(beforeAction).toHaveBeenCalledOnce();
    expect(button("Saving…").disabled).toBe(true);
    expect(
      section().querySelector<HTMLTextAreaElement>("textarea")?.disabled
    ).toBe(false);
    await fill("body", "Newer body while saving");
    await act(async () => button("Saving…").click());
    expect(beforeAction).toHaveBeenCalledOnce();
    await act(async () => release());
    await settle();
    expect(testDb.select().from(discussionQuestions).all().at(-1)?.body).toBe(
      "Submitted body"
    );
    expect(router.state.location.search).toBe("");
    expect(value("body")).toBe("Newer body while saving");
    expect(section().textContent).toContain(
      "Saved. The text you changed while saving is still in this draft."
    );
    expect(unload()).toBe(true);
    await click(button("Post question"));
    expect(testDb.select().from(discussionQuestions).all().at(-1)?.body).toBe(
      "Newer body while saving"
    );
    expect(unload()).toBe(false);
    await go("");
    await click(button("Ask a question"));
    expect(value("title")).toBe("");
    expect(value("body")).toBe("");
  });

  it("finishes an off-screen save without redirecting, clearing another draft, or resubmitting after remount", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    beforeAction = vi.fn(() => gate);
    await mount();
    await click(button("Ask a question"));
    await fill("title", "Save in background");
    await fill("body", "Original snapshot");
    await act(async () => button("Post question").click());
    await act(async () => {
      await router.navigate(`?question=${questionId}`);
    });
    await fill("body", "An unrelated reply draft");
    await act(async () => release());
    await settle();
    expect(router.state.location.search).toBe(`?question=${questionId}`);
    expect(value("body")).toBe("An unrelated reply draft");
    await go("");
    expect(value("body")).toBe("");
    expect(testDb.select().from(discussionQuestions).all()).toHaveLength(2);
    expect(beforeAction).toHaveBeenCalledOnce();
  });

  it("retains edits made during a pending edit and does not mistake saved text for another unsent draft", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    beforeAction = () => gate;
    await mount(`?question=${questionId}`);
    const article = section().querySelector<HTMLElement>(
      `#question-${questionId}`
    )!;
    await click(button("Edit", article));
    expect(unload()).toBe(false);
    await fill("body", "Saved edit", article);
    await act(async () => button("Save changes", article).click());
    await fill("body", "Newer edit", article);
    await act(async () => release());
    await settle();
    expect(testDb.select().from(discussionQuestions).get()?.body).toBe(
      "Saved edit"
    );
    expect(value("body", article)).toBe("Newer edit");
    expect(unload()).toBe(true);
    await click(button("Save changes", article));
    expect(testDb.select().from(discussionQuestions).get()?.body).toBe(
      "Newer edit"
    );
    expect(unload()).toBe(false);
    expect(article.querySelector("form textarea")).toBeNull();
  });

  it("retains text and inline errors after connection failure, navigation, and retry without automatically reposting", async () => {
    actionFailure = new TypeError("Failed to fetch");
    await mount(`?question=${questionId}`);
    await fill("body", "Keep during connection failure");
    await click(button("Post reply"));
    expect(section().querySelector('[role="alert"]')?.textContent).toContain(
      "couldn’t confirm"
    );
    expect(testDb.select().from(discussionReplies).all()).toHaveLength(0);
    await go("");
    await go(`?question=${questionId}`);
    expect(value("body")).toBe("Keep during connection failure");
    expect(section().querySelector('[role="alert"]')?.textContent).toContain(
      "Check the discussion before trying again"
    );
    actionFailure = undefined;
    await click(button("Post reply"));
    expect(testDb.select().from(discussionReplies).all()).toHaveLength(1);
    expect(value("body")).toBe("");
    expect(unload()).toBe(false);
  });

  it("keeps drafts and errors when a lesson pauses or access is lost, and restores them when access returns", async () => {
    await mount();
    await click(button("Ask a question"));
    await fill("title", "Paused draft");
    await fill("body", "Keep through access changes");
    testDb.update(lessons).set({ discussionPaused: true }).run();
    await click(button("Post question"));
    await go(`?question=${questionId}`);
    await go("");
    expect(value("body")).toBe("Keep through access changes");
    expect(button("Post question").disabled).toBe(true);
    expect(section().querySelector('[role="alert"]')?.textContent).toContain(
      "paused"
    );
    testDb.delete(enrollments).run();
    await go("?context=access-lost");
    expect(section().textContent).toContain(
      "Your unsent discussion drafts are kept"
    );
    expect(section().querySelector("textarea")).toBeNull();
    expect(unload()).toBe(true);
    testDb
      .insert(enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    testDb.update(lessons).set({ discussionPaused: false }).run();
    await go("");
    expect(value("body")).toBe("Keep through access changes");
    expect(button("Post question").disabled).toBe(false);
  });

  it("keeps validation and rate-limit feedback with the draft until a successful explicit retry", async () => {
    await mount(`?question=${questionId}`);
    await fill("body", "x".repeat(10001));
    await click(button("Post reply"));
    expect(
      section().querySelector('textarea[aria-invalid="true"]')
    ).not.toBeNull();
    expect(value("body")).toHaveLength(10001);
    await go("");
    await go(`?question=${questionId}`);
    expect(
      section().querySelector('textarea[aria-invalid="true"]')
    ).not.toBeNull();
    await fill("body", "Ready to retry");
    for (let i = 0; i < 4; i++)
      testDb
        .insert(discussionReplies)
        .values({ questionId, authorId: base.user.id, body: "Recent post" })
        .run();
    await click(button("Post reply"));
    expect(section().querySelector('[role="alert"]')?.textContent).toMatch(
      /Try again in \d+ seconds/
    );
    await go("");
    await go(`?question=${questionId}`);
    expect(value("body")).toBe("Ready to retry");
    expect(section().querySelector('[role="alert"]')?.textContent).toContain(
      "Try again in"
    );
    testDb
      .update(discussionQuestions)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .run();
    testDb
      .update(discussionReplies)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .run();
    await click(button("Post reply"));
    expect(testDb.select().from(discussionReplies).all()).toHaveLength(5);
    expect(value("body")).toBe("");
    expect(section().querySelector('[role="alert"]')).toBeNull();
    expect(unload()).toBe(false);
  });

  it("restores the inner panel's list position and focus on All questions and Back/Forward", async () => {
    await mount("?questionsPage=2&context=keep");
    // JSDOM does not lay out pixels. Supply deterministic element rectangles
    // to verify the panel scroll calculation without pretending to test layout.
    const panel = container.querySelector("main")!;
    const heading = section().querySelector<HTMLElement>("h2")!;
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      top: 0,
    } as DOMRect);
    vi.spyOn(heading, "getBoundingClientRect").mockImplementation(
      () => ({ top: 1200 - panel.scrollTop }) as DOMRect
    );
    // Put the question on the retained second page.
    for (let i = 0; i < 20; i++)
      testDb
        .insert(discussionQuestions)
        .values({
          lessonId,
          authorId: base.user.id,
          title: `Newer ${i}`,
          body: "Details",
        })
        .run();
    await go("?questionsPage=2&context=keep&refresh=1");
    const link = section().querySelector<HTMLAnchorElement>(
      `#discussion-question-link-${questionId}`
    )!;
    link.focus();
    panel.scrollTop = 1700;
    panel.dispatchEvent(new Event("scroll"));
    await click(link);
    expect(document.activeElement).toBe(heading);
    expect(panel.scrollTop).toBe(1176);
    panel.scrollTop = 1950;
    panel.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(panel.scrollTop).toBe(1700);
    expect(document.activeElement?.id).toBe(
      `discussion-question-link-${questionId}`
    );
    await act(async () => {
      await router.navigate(1);
    });
    await settle();
    expect(panel.scrollTop).toBe(1950);
    await click(section().querySelector<HTMLAnchorElement>("a")!);
    expect(panel.scrollTop).toBe(1700);
    expect(router.state.location.search).toContain("questionsPage=2");
    expect(router.state.location.search).toContain("context=keep");
  });

  it("focuses a deep-linked reply and falls back to the discussion heading for a directly opened thread's list", async () => {
    const reply = testDb
      .insert(discussionReplies)
      .values({
        questionId,
        authorId: base.instructor.id,
        body: "Linked answer",
      })
      .returning()
      .get();
    await mount(`?question=${questionId}&reply=${reply.id}&questionsPage=2`);
    expect(document.activeElement?.id).toBe(`reply-${reply.id}`);
    await click(section().querySelector<HTMLAnchorElement>("a")!);
    expect(document.activeElement?.id).toBe("discussion-heading");
    expect(router.state.location.search).toBe("?questionsPage=2");
  });

  it("focuses and scrolls an initial deep link when the server supplied data and main mount together", async () => {
    const geometry = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return new DOMRect(
          0,
          this.id === "discussion-heading" ? 640 : 0,
          320,
          20
        );
      });
    try {
      await mount(`?question=${questionId}`, base.user.id, false, true);
      expect(document.activeElement?.id).toBe("discussion-heading");
      expect(container.querySelector("main")!.scrollTop).toBe(616);
    } finally {
      geometry.mockRestore();
    }
  });

  it("keeps the full lesson and playing iframe through list/detail, query history, and refreshed resume data", async () => {
    for (let i = 0; i < 20; i++)
      testDb
        .insert(discussionQuestions)
        .values({
          lessonId,
          authorId: base.user.id,
          title: `Newer ${i}`,
          body: "Details",
        })
        .run();
    await mount("?questionsPage=2&context=keep");
    const lessonHeading = container.querySelector("h1");
    const iframe = container.querySelector("iframe");
    expect(players).toHaveLength(1);
    players[0].position = 145;
    testDb
      .insert(videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 140,
      })
      .run();
    await click(
      section().querySelector<HTMLAnchorElement>('a[href*="question="]')!
    );
    expect(section().querySelector("#question-" + questionId)).not.toBeNull();
    expect(router.state.location.search).toContain("questionsPage=2");
    expect(router.state.location.search).toContain("context=keep");
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(section().textContent).toContain("Newest first");
    await act(async () => {
      await router.navigate(1);
    });
    await settle();
    await click(section().querySelector<HTMLAnchorElement>("a")!);
    expect(router.state.location.search).toBe("?context=keep&questionsPage=2");
    expect(container.querySelector("h1")).toBe(lessonHeading);
    expect(container.textContent).toContain("Keep the full lesson visible.");
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(players).toHaveLength(1);
    expect(players[0].position).toBe(145);
    expect(players[0].destroy).not.toHaveBeenCalled();
    await click(container.querySelector<HTMLButtonElement>('[role="switch"]')!);
    expect(players).toHaveLength(1);
  });

  it("creates a question, replies, edits, resolves/reopens, and deletes without resetting the player", async () => {
    await mount();
    await click(button("Ask a question"));
    await fill("title", "How does this work?");
    await fill("body", "**Question** with code");
    await click(button("Post question"));
    const q = testDb.select().from(discussionQuestions).all().at(-1)!;
    expect(router.state.location.search).toBe(`?question=${q.id}`);
    expect(section().querySelector("strong")?.textContent).toBe("Question");
    await fill("body", "An initial reply");
    await click(button("Post reply"));
    const reply = testDb.select().from(discussionReplies).get()!;
    expect(router.state.location.search).toBe(
      `?question=${q.id}&reply=${reply.id}`
    );
    const replyArticle = section().querySelector<HTMLElement>(
      `#reply-${reply.id}`
    )!;
    await click(button("Edit", replyArticle));
    await fill("body", "Changed reply", replyArticle);
    await click(button("Save changes", replyArticle));
    expect(replyArticle.textContent).toContain("Changed reply");
    expect(replyArticle.textContent).toContain("Edited");
    await click(button("Resolve question"));
    expect(section().textContent).toContain("Resolved");
    expect(button("Post reply")).not.toBeNull();
    await click(button("Reopen question"));
    expect(button("Resolve question")).not.toBeNull();
    const questionArticle = section().querySelector<HTMLElement>(
      `#question-${q.id}`
    )!;
    await click(button("Delete", questionArticle));
    await click(button("Confirm delete", questionArticle));
    expect(questionArticle.textContent).toContain("Deleted question");
    expect(section().textContent).toContain("Changed reply");
    await click(button("Delete", replyArticle));
    await click(button("Confirm delete", replyArticle));
    expect(replyArticle.textContent).toContain(
      "This post was deleted by its author."
    );
    expect(players).toHaveLength(1);
    expect(players[0].destroy).not.toHaveBeenCalled();
  });

  it("destroys the old player and applies the new lesson's resume position when leaving the lesson", async () => {
    const nextLesson = testDb
      .insert(lessons)
      .values({
        moduleId: testDb.select().from(modules).get()!.id,
        title: "Next lesson",
        content: "Next lesson content",
        position: 2,
        videoUrl: "https://youtu.be/second12345",
        durationMinutes: 10,
      })
      .returning()
      .get();
    testDb
      .insert(videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId: nextLesson.id,
        eventType: "progress",
        positionSeconds: 80,
      })
      .run();
    await mount(`?question=${questionId}`);
    const first = players[0];
    const nextLink = [
      ...container.querySelectorAll<HTMLAnchorElement>("a"),
    ].find((link) => link.pathname.endsWith(`/lessons/${nextLesson.id}`))!;
    await click(nextLink);
    expect(container.querySelector("h1")?.textContent).toBe("Next lesson");
    expect(container.textContent).toContain("Next lesson content");
    expect(section().textContent).toContain("No questions yet");
    expect(players).toHaveLength(2);
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(players[1].position).toBe(80);
    expect(container.querySelector("iframe")).toBe(players[1].iframe);
  });

  it("opens the correct reply page, keeps placeholders and badges, and changes only reply pagination", async () => {
    let lastId = 0;
    for (let i = 0; i < 21; i++)
      lastId = testDb
        .insert(discussionReplies)
        .values({
          questionId,
          authorId: base.instructor.id,
          body: `Answer ${i}`,
          hiddenAt: i === 20 ? "2026-11-01" : null,
        })
        .returning()
        .get().id;
    await mount(`?question=${questionId}&reply=${lastId}&questionsPage=2`);
    expect(section().querySelectorAll('[id^="reply-"]')).toHaveLength(1);
    expect(section().textContent).toContain("This reply is hidden.");
    expect(section().textContent).not.toContain("Answer 20");
    expect(section().textContent).toContain("Instructor");
    expect(section().textContent).toContain("Page 2 of 2");
    const previous = section().querySelector<HTMLAnchorElement>(
      'nav[aria-label="Replies pagination"] a'
    )!;
    await click(previous);
    expect(router.state.location.search).toBe(
      `?questionsPage=2&question=${questionId}`
    );
    expect(section().querySelectorAll('[id^="reply-"]')).toHaveLength(20);
    expect(section().textContent).toContain("Answer 0");
    expect(section().textContent).toContain("Page 1 of 2");
  });

  it("keeps submitted text and displays a server error if participation is paused while composing", async () => {
    await mount();
    await click(button("Ask a question"));
    await fill("title", "Keep this question");
    await fill("body", "Keep this unsent text");
    testDb
      .update(lessons)
      .set({ discussionPaused: true })
      .where(eq(lessons.id, lessonId))
      .run();
    await click(button("Post question"));
    expect(section().querySelector('[role="alert"]')?.textContent).toContain(
      "Discussions are paused"
    );
    expect(
      section().querySelector<HTMLInputElement>('[name="title"]')?.value
    ).toBe("Keep this question");
    expect(
      section().querySelector<HTMLTextAreaElement>('[name="body"]')?.value
    ).toBe("Keep this unsent text");
    expect(testDb.select().from(discussionQuestions).all()).toHaveLength(1);
    testDb.update(lessons).set({ discussionPaused: false }).run();
    await click(button("Post question"));
    expect(section().querySelector('[role="alert"]')).toBeNull();
    expect(section().textContent).toContain("Keep this question");
  });
});
