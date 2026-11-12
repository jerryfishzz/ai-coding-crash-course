import type { Route } from "./+types/api.discussions.read";
import { discussionResource } from "~/lib/discussion-resources.server";

export function loader({ request }: Route.LoaderArgs) {
  return discussionResource(request, "read");
}
export function action({ request }: Route.ActionArgs) {
  return discussionResource(request, "read");
}
