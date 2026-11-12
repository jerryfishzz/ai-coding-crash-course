import {
  Link,
  isRouteErrorResponse,
  useLocation,
  useRevalidator,
  useRouteError,
} from "react-router";
import type { DiscussionInboxView } from "~/lib/discussion-inbox.server";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function DiscussionInbox({ view }: { view: DiscussionInboxView }) {
  const location = useLocation();
  const title =
    view.kind === "notifications" ? "Notifications" : "Discussion inbox";
  const pages = Math.max(1, Math.ceil(view.total / view.pageSize));
  function pageLink(page: number) {
    const search = new URLSearchParams(location.search);
    if (page === 1) search.delete("page");
    else search.set("page", String(page));
    return { pathname: location.pathname, search: search.toString() };
  }
  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-6 p-4 md:p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {view.kind === "notifications"
            ? "Replies to your questions in courses you’re taking."
            : "Student questions and replies in courses you teach."}{" "}
          Read activity stays here for reference.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {view.total} {view.total === 1 ? "item" : "items"} · Newest first
      </p>
      {view.entries.length === 0 ? (
        <p className="rounded-lg border p-6 text-muted-foreground">
          {view.total === 0
            ? view.kind === "notifications"
              ? "No notifications yet."
              : "No student discussion activity yet."
            : "No activity on this page."}
        </p>
      ) : (
        <ul className="space-y-3">
          {view.entries.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                "min-w-0 rounded-lg border p-4",
                !entry.readAt && "border-primary/40 bg-primary/5"
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {!entry.readAt && (
                  <span className="font-semibold text-primary">Unread</span>
                )}
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {entry.authorName}
                </span>
                <time dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleString("en-US", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </time>
              </div>
              <Link
                className="block break-words font-semibold text-primary hover:underline [overflow-wrap:anywhere]"
                to={`/courses/${encodeURIComponent(entry.courseSlug)}/lessons/${entry.lessonId}?question=${entry.questionId}${entry.replyId === null ? "" : `&reply=${entry.replyId}`}`}
              >
                {entry.replyId === null ? "Question: " : "Reply: "}
                {entry.questionTitle}
              </Link>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                {entry.excerpt}
              </p>
              <p className="mt-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {entry.courseTitle} · {entry.lessonTitle}
              </p>
            </li>
          ))}
        </ul>
      )}
      {(pages > 1 || view.page > 1) && (
        <nav
          aria-label={`${title} pages`}
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          {view.page > 1 ? (
            <Link
              to={pageLink(view.page > pages ? 1 : view.page - 1)}
              className="text-primary underline"
            >
              {view.page > pages ? "First page" : "Previous"}
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {view.page} of {pages}
          </span>
          {view.page < pages ? (
            <Link
              to={pageLink(view.page + 1)}
              className="text-primary underline"
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

export function DiscussionInboxError() {
  const error = useRouteError();
  const location = useLocation();
  const revalidator = useRevalidator();
  const invalid = isRouteErrorResponse(error) && error.status === 400;
  return (
    <div className="space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">
        {location.pathname === "/notifications"
          ? "Notifications"
          : "Discussion inbox"}
      </h1>
      <p role="alert">
        {invalid
          ? "This inbox page is invalid."
          : "We couldn’t load this inbox. Please try again."}
      </p>
      {invalid ? (
        <Link to={location.pathname} className="text-primary underline">
          First page
        </Link>
      ) : (
        <Button
          disabled={revalidator.state !== "idle"}
          onClick={() => revalidator.revalidate()}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
