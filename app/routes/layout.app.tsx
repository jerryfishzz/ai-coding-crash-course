import { Outlet } from "react-router";
import type { Route } from "./+types/layout.app";
import { MobileNavigation, Sidebar } from "~/components/sidebar";
import { DevUI } from "~/components/dev-ui";
import { Toaster } from "sonner";
import { getAllUsers, getUserById } from "~/services/userService";
import { getCurrentUserId, getDevCountry } from "~/lib/session";
import {
  getRecentlyProgressedCourses,
  calculateProgress,
  getCompletedLessonCount,
  getTotalLessonCount,
} from "~/services/progressService";
import { getCountryTierInfo, COUNTRIES } from "~/lib/ppp";
import { isTeamAdmin } from "~/services/teamService";
import { MainScroll } from "~/components/main-scroll";
import { UnreadActivity } from "~/components/discussions/unread-activity";
import { emptyUnreadCounts } from "~/components/discussions/unread-controller";
import { getDiscussionUnreadCounts } from "~/services/discussions";
import { resolveCountry } from "~/lib/country.server";

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request }: Route.LoaderArgs) {
  const users = getAllUsers();
  const currentUserId = await getCurrentUserId(request);
  const currentUser = currentUserId ? getUserById(currentUserId) : null;
  const devCountry = await getDevCountry(request);
  const countryTierInfo = getCountryTierInfo(devCountry);

  const recentCourses = currentUserId
    ? getRecentlyProgressedCourses(currentUserId).map((course) => {
        const completedLessons = getCompletedLessonCount(
          currentUserId,
          course.courseId
        );
        const totalLessons = getTotalLessonCount(course.courseId);
        const progress = calculateProgress(
          currentUserId,
          course.courseId,
          false,
          false
        );
        return {
          courseId: course.courseId,
          title: course.courseTitle,
          slug: course.courseSlug,
          coverImageUrl: course.coverImageUrl,
          completedLessons,
          totalLessons,
          progress,
        };
      })
    : [];

  return {
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    currentUser: currentUser
      ? {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          avatarUrl: currentUser.avatarUrl ?? null,
        }
      : null,
    recentCourses,
    devCountry,
    countryTierInfo,
    countries: COUNTRIES,
    isTeamAdmin: currentUserId ? isTeamAdmin(currentUserId) : false,
    unreadCounts: currentUser
      ? getDiscussionUnreadCounts(currentUser.id, await resolveCountry(request))
      : emptyUnreadCounts,
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const {
    users,
    currentUser,
    recentCourses,
    devCountry,
    countryTierInfo,
    countries,
    isTeamAdmin: userIsTeamAdmin,
  } = loaderData;

  return (
    <UnreadActivity
      key={currentUser?.id ?? "signed-out"}
      initialCounts={loaderData.unreadCounts}
      enabled={currentUser !== null}
    >
      <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
        <MobileNavigation
          currentUser={currentUser}
          recentCourses={recentCourses}
          isTeamAdmin={userIsTeamAdmin}
          tools={
            <DevUI
              users={users}
              currentUser={currentUser}
              devCountry={devCountry}
              countryTierInfo={countryTierInfo}
              countries={countries}
              placement="menu"
            />
          }
        />
        <Sidebar
          currentUser={currentUser}
          recentCourses={recentCourses}
          isTeamAdmin={userIsTeamAdmin}
        />
        <MainScroll>
          <Outlet />
        </MainScroll>
        <DevUI
          users={users}
          currentUser={currentUser}
          devCountry={devCountry}
          countryTierInfo={countryTierInfo}
          countries={countries}
        />
        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </UnreadActivity>
  );
}
