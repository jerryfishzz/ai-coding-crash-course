import type { Route } from "./+types/api.discussions.unread";
import { discussionResource } from "~/lib/discussion-resources.server";

export function loader({ request }: Route.LoaderArgs) {
  return discussionResource(request, "unread");
}
export function action({ request }: Route.ActionArgs) {
  return discussionResource(request, "unread");
}
