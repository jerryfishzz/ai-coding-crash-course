import { NavLink, Form, useLocation } from "react-router";
import {
  useState,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Dialog } from "radix-ui";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { UserAvatar } from "~/components/user-avatar";
import { useUnreadCounts } from "~/components/discussions/unread-activity";
import {
  BookOpen,
  LayoutDashboard,
  GraduationCap,
  Shield,
  Tag,
  Users,
  UsersRound,
  Moon,
  Sun,
  LogOut,
  Settings,
  Bell,
  MessagesSquare,
  Menu,
  X,
} from "lucide-react";

interface CurrentUser {
  id: number;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

interface RecentCourse {
  courseId: number;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  completedLessons: number;
  totalLessons: number;
  progress: number;
}

interface SidebarProps {
  currentUser: CurrentUser | null;
  recentCourses?: RecentCourse[];
  isTeamAdmin?: boolean;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles: UserRole[] | "all";
  badge?: "notifications" | "discussionInbox";
}

const navItems: NavItem[] = [
  {
    label: "Browse Courses",
    to: "/courses",
    icon: <BookOpen className="size-4" />,
    roles: "all",
  },
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
    roles: [UserRole.Student],
  },
  {
    label: "My Courses",
    to: "/instructor",
    icon: <GraduationCap className="size-4" />,
    roles: [UserRole.Instructor],
  },
  {
    label: "Notifications",
    to: "/notifications",
    icon: <Bell className="size-4" />,
    roles: [UserRole.Student, UserRole.Instructor, UserRole.Admin],
    badge: "notifications",
  },
  {
    label: "Discussion inbox",
    to: "/discussion-inbox",
    icon: <MessagesSquare className="size-4" />,
    roles: [UserRole.Instructor, UserRole.Admin],
    badge: "discussionInbox",
  },
  {
    label: "Manage Users",
    to: "/admin/users",
    icon: <Users className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Manage Courses",
    to: "/admin/courses",
    icon: <Shield className="size-4" />,
    roles: [UserRole.Admin],
  },
  {
    label: "Categories",
    to: "/admin/categories",
    icon: <Tag className="size-4" />,
    roles: [UserRole.Admin],
  },
];

function isVisible(item: NavItem, role: UserRole | null): boolean {
  if (item.roles === "all") return true;
  if (!role) return false;
  return item.roles.includes(role);
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <NavLink to="/" className="text-lg font-bold tracking-tight">
          Cadence
        </NavLink>
      </div>
      <NavigationContent {...props} />
    </aside>
  );
}

export function MobileNavigation({
  tools,
  ...props
}: SidebarProps & { tools?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Wait for committed navigation, so a cancelled unsaved-draft warning keeps
  // its initiating link available for focus restoration.
  useEffect(() => setOpen(false), [location.key, props.currentUser?.id]);
  useEffect(() => {
    const desktop = window.matchMedia?.("(min-width: 768px)");
    if (!desktop) return;
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-sidebar px-3 text-sidebar-foreground md:hidden">
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu aria-hidden="true" />
          </Button>
        </Dialog.Trigger>
        <NavLink to="/" className="text-lg font-bold tracking-tight">
          Cadence
        </NavLink>
      </header>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex h-dvh w-full max-w-xs flex-col overflow-y-auto overscroll-contain border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl md:hidden">
          <div className="flex min-h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
            <Dialog.Title className="text-lg font-semibold">
              Navigation
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Courses, activity, and account navigation.
          </Dialog.Description>
          <NavigationContent {...props} tools={tools} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("cadence-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("cadence-theme-change", onChange);
  };
}
const darkTheme = () => document.documentElement.classList.contains("dark");

// One set of links, permissions, badges, recent courses and account controls for
// both navigation surfaces.
function NavigationContent({
  currentUser,
  recentCourses = [],
  isTeamAdmin = false,
  tools,
}: SidebarProps & { tools?: ReactNode }) {
  const currentUserRole = currentUser?.role ?? null;
  const unread = useUnreadCounts();
  const isDark = useSyncExternalStore(subscribeTheme, darkTheme, () => false);

  function toggleDarkMode() {
    const next = !darkTheme();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cadence-theme", next ? "dark" : "light");
    } catch {}
    window.dispatchEvent(new Event("cadence-theme-change"));
  }

  return (
    <>
      <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
        {navItems
          .filter((item) => isVisible(item, currentUserRole))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              {item.icon}
              <span className="min-w-0 break-words">{item.label}</span>
              {item.badge && unread[item.badge] > 0 && (
                <span
                  aria-label={`${unread[item.badge]} unread`}
                  className="ml-auto shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
                >
                  {unread[item.badge]}
                </span>
              )}
            </NavLink>
          ))}
        {isTeamAdmin && (
          <NavLink
            to="/team"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <UsersRound className="size-4" />
            Team
          </NavLink>
        )}
      </nav>

      {recentCourses.length > 0 && (
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Recent Courses
          </div>
          <div className="space-y-1">
            {recentCourses.map((course) => (
              <NavLink
                key={course.courseId}
                to={`/courses/${course.slug}`}
                className={({ isActive }) =>
                  cn(
                    "block rounded-md px-3 py-2 transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <div className="truncate text-sm font-medium">
                  {course.title}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-sidebar-accent">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-sidebar-foreground/50">
                    {course.progress}%
                  </span>
                </div>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {tools && (
        <details className="border-t border-sidebar-border p-3">
          <summary className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium">
            Development tools
          </summary>
          {tools}
        </details>
      )}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <button
          onClick={toggleDarkMode}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>

        {currentUser && (
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <UserAvatar
              name={currentUser.name}
              avatarUrl={currentUser.avatarUrl}
            />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">
                {currentUser.name}
              </div>
              <div className="truncate text-xs capitalize text-sidebar-foreground/50">
                {currentUser.role}
              </div>
            </div>
            <NavLink
              to="/settings"
              title="Settings"
              aria-label="Settings"
              className="rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Settings className="size-4" />
            </NavLink>
            <Form method="post" action="/api/logout">
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </Form>
          </div>
        )}
      </div>
    </>
  );
}
