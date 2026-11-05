import type { Route } from "./+types/notifications";
import {
  discussionPrivateHeaders,
  loadDiscussionInbox,
} from "~/lib/discussion-inbox.server";
import { DiscussionInbox } from "~/components/discussions/inbox";
export { DiscussionInboxError as ErrorBoundary } from "~/components/discussions/inbox";

export function headers() {
  return discussionPrivateHeaders;
}
export function loader({ request }: Route.LoaderArgs) {
  return loadDiscussionInbox(request, "notifications");
}
export default function Notifications({
  loaderData,
}: Pick<Route.ComponentProps, "loaderData">) {
  return <DiscussionInbox view={loaderData} />;
}
