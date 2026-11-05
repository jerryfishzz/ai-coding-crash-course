// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UserRole } from "~/db/schema";
import { MainScroll } from "./main-scroll";
import { Sidebar, MobileNavigation } from "./sidebar";
import { DevUI } from "./dev-ui";
import { UnreadActivity } from "./discussions/unread-activity";
import { LessonDrafts, useLessonDrafts } from "./discussions/lesson-drafts";
import { emptyPost } from "./discussions/draft-memory";

let container: HTMLDivElement;
let root: Root;
let router: ReturnType<typeof createMemoryRouter>;
let desktop = false;
let changeBreakpoint: () => void;
const counts = { notifications: 3, discussionInbox: 2 };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  desktop = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return desktop;
      },
      addEventListener: (_: string, callback: () => void) => {
        changeBreakpoint = callback;
      },
      removeEventListener: vi.fn(),
    }))
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(counts))
  );
  document.documentElement.classList.remove("dark");
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
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
});

function DraftEditor() {
  const { memory, drafts } = useLessonDrafts();
  return (
    <button
      onClick={() =>
        memory.change("question", emptyPost, { body: "Unsent text" })
      }
    >
      {drafts.question?.text.body || "Write draft"}
    </button>
  );
}

async function mount(
  role: UserRole | null = UserRole.Instructor,
  dirtyLesson = false
) {
  const currentUser = role
    ? { id: 17, name: "Pat", role, avatarUrl: null }
    : null;
  const props = {
    currentUser,
    isTeamAdmin: true,
    recentCourses: [
      {
        courseId: 28,
        title: "Recent course",
        slug: "recent",
        coverImageUrl: null,
        completedLessons: 1,
        totalLessons: 2,
        progress: 50,
      },
    ],
  };
  function Shell() {
    return (
      <UnreadActivity initialCounts={counts} enabled={!!currentUser}>
        <Sidebar {...props} />
        <MobileNavigation
          {...props}
          tools={
            <DevUI
              users={[]}
              currentUser={currentUser}
              countries={[]}
              devCountry={null}
              countryTierInfo={{ tier: 1, discount: 0, label: "Full price" }}
              placement="menu"
            />
          }
        />
        <MainScroll>
          <Outlet />
        </MainScroll>
      </UnreadActivity>
    );
  }
  router = createMemoryRouter(
    [
      {
        Component: Shell,
        children: [
          {
            path: "*",
            Component: () =>
              dirtyLesson ? (
                <LessonDrafts lessonId={1} courseSlug="test">
                  <DraftEditor />
                </LessonDrafts>
              ) : (
                <button>Outside the menu</button>
              ),
          },
        ],
      },
    ],
    { initialEntries: ["/courses/test/lessons/1"] }
  );
  await act(async () => root.render(<RouterProvider router={router} />));
}

const button = (text: string, within: ParentNode = document) =>
  Array.from(within.querySelectorAll("button")).find(
    (b) => b.textContent === text || b.getAttribute("aria-label") === text
  )!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await tick();
  });
}
async function key(value: string, shiftKey = false) {
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
    );
    await tick();
  });
}
async function open() {
  await click(button("Open navigation"));
}

it.each([UserRole.Student, UserRole.Instructor, UserRole.Admin, null])(
  "shares all allowed links and badges between desktop and mobile for %s",
  async (role) => {
    await mount(role);
    const desktopLinks = Array.from(container.querySelectorAll("aside a")).map(
      (a) => [a.getAttribute("href"), a.textContent]
    );
    await open();
    const links = Array.from(dialog().querySelectorAll("a")).map((a) => [
      a.getAttribute("href"),
      a.textContent,
    ]);
    expect(links).toEqual(desktopLinks.slice(1)); // Desktop brand is outside shared content.
    const notifications = dialog().querySelector('a[href="/notifications"]');
    if (role) expect(notifications?.textContent).toBe("Notifications3");
    else expect(notifications).toBeNull();
    const inbox = dialog().querySelector('a[href="/discussion-inbox"]');
    if (role === UserRole.Instructor || role === UserRole.Admin)
      expect(inbox?.textContent).toBe("Discussion inbox2");
    else expect(inbox).toBeNull();
  }
);

it("shows students only Notifications, instructors both inboxes, and numeric badges that disappear at zero", async () => {
  await mount(UserRole.Student);
  await open();
  expect(
    dialog().querySelector('a[href="/notifications"]')?.textContent
  ).toContain("3");
  expect(dialog().querySelector('a[href="/discussion-inbox"]')).toBeNull();
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ notifications: 0, discussionInbox: 0 })
  );
  await act(async () => {
    await router.navigate("/notifications");
    await tick();
  });
  expect(dialog()).toBeNull();
  await open();
  expect(
    dialog().querySelector('a[href="/notifications"] [aria-label$="unread"]')
  ).toBeNull();
});

it("contains focus, loops boundary Tab keys, closes with Escape, restores the trigger and releases scroll lock", async () => {
  await mount();
  const trigger = button("Open navigation");
  const main = document.querySelector("main")!;
  main.scrollTop = 320;
  trigger.focus();
  await open();
  const close = button("Close navigation");
  expect(document.activeElement).toBe(close);
  expect(document.body.getAttribute("data-scroll-locked")).toBe("1");
  await act(async () => button("Outside the menu").focus());
  expect(dialog().contains(document.activeElement)).toBe(true);
  await act(async () => button("Sign out", dialog()).focus());
  await key("Tab");
  expect(document.activeElement).toBe(close);
  await key("Tab", true);
  expect(document.activeElement).toBe(button("Sign out", dialog()));
  await key("Escape");
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  expect(main.scrollTop).toBe(320);
});

it("closes after links, query navigation, Back/Forward and resizing to desktop", async () => {
  await mount();
  await open();
  await click(
    dialog().querySelector<HTMLElement>('a[href="/discussion-inbox"]')!
  );
  expect(router.state.location.pathname).toBe("/discussion-inbox");
  expect(dialog()).toBeNull();
  await open();
  await act(async () => {
    await router.navigate("?page=2");
    await tick();
  });
  expect(dialog()).toBeNull();
  await open();
  await act(async () => {
    await router.navigate(-1);
    await tick();
  });
  expect(dialog()).toBeNull();
  await open();
  await act(async () => {
    await router.navigate(1);
    await tick();
  });
  expect(dialog()).toBeNull();
  await open();
  await act(async () => {
    desktop = true;
    changeBreakpoint();
    await tick();
  });
  expect(dialog()).toBeNull();
  expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
});

it("keeps a blocked navigation's menu link for Stay, then closes after confirmed Leave", async () => {
  await mount(UserRole.Student, true);
  await click(button("Write draft"));
  await open();
  const target = dialog().querySelector<HTMLElement>(
    'a[href="/notifications"]'
  )!;
  target.focus();
  await click(target);
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(dialog()).not.toBeNull();
  expect(document.activeElement).toBe(button("Stay"));
  await click(button("Stay"));
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.activeElement === target).toBe(true)
    );
  });
  expect(button("Unsent text")).toBeDefined();
  expect(router.state.location.pathname).toBe("/courses/test/lessons/1");
  await click(target);
  await click(button("Leave"));
  expect(router.state.location.pathname).toBe("/notifications");
  expect(dialog()).toBeNull();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
});

it("synchronizes theme controls across surfaces and keeps development tools inside the mobile menu", async () => {
  await mount();
  await open();
  expect(dialog().querySelector("details summary")?.textContent).toBe(
    "Development tools"
  );
  expect(dialog().querySelector('[aria-label="PPP country"]')).not.toBeNull();
  await click(button("Dark Mode", dialog()));
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(button("Light Mode", container)).toBeDefined();
  await click(button("Close navigation"));
  await click(button("Light Mode", container));
  await open();
  expect(button("Dark Mode", dialog())).toBeDefined();
});
