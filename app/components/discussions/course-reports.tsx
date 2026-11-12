import { Link, useFetcher, useLocation } from "react-router";
import type {
  DiscussionReportResult,
  DiscussionReportsView,
} from "~/lib/discussion-reports.server";
import { Button } from "~/components/ui/button";
import { CommandError } from "./post-form";

type Report = DiscussionReportsView["reports"][number];

function ReportReview({ report }: { report: Report }) {
  const fetcher = useFetcher<{ discussionResult: DiscussionReportResult }>();
  const pending = fetcher.state !== "idle";
  return (
    <div className="space-y-2">
      {report.reviewedAt ? (
        <p role="status" className="text-sm text-muted-foreground">
          {report.outcome === "hidden"
            ? "Reviewed: content hidden"
            : "Dismissed"}{" "}
          ·{" "}
          {new Date(report.reviewedAt).toLocaleString("en-US", {
            timeZone: "UTC",
          })}{" "}
          UTC
        </p>
      ) : (
        <fetcher.Form
          method="post"
          preventScrollReset
          aria-busy={pending}
          className="flex flex-wrap gap-2"
        >
          <input type="hidden" name="reportId" value={report.id} />
          <Button
            name="intent"
            value="discussion-dismiss-report"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            Dismiss report
          </Button>
          {!report.deleted && (
            <Button
              name="intent"
              value="discussion-hide-reported-content"
              size="sm"
              disabled={pending}
            >
              Hide content
            </Button>
          )}
          {pending && (
            <span
              role="status"
              className="self-center text-sm text-muted-foreground"
            >
              Reviewing…
            </span>
          )}
        </fetcher.Form>
      )}
      <CommandError result={fetcher.data?.discussionResult} />
    </div>
  );
}

export function CourseReports({
  view,
  courseSlug,
}: {
  view: DiscussionReportsView;
  courseSlug: string;
}) {
  const location = useLocation();
  const pageLink = (page: number) => {
    const search = new URLSearchParams(location.search);
    search.set("tab", "reports");
    if (page === 1) search.delete("reportsPage");
    else search.set("reportsPage", String(page));
    return { pathname: location.pathname, search: `?${search}` };
  };
  const pages = Math.max(1, Math.ceil(view.total / view.pageSize));
  return (
    <section
      aria-labelledby="course-reports-heading"
      className="min-w-0 space-y-4"
    >
      <div>
        <h2 id="course-reports-heading" className="text-lg font-semibold">
          Discussion reports
        </h2>
        <p className="text-sm text-muted-foreground">
          Private to the course instructor and admins. {view.total}{" "}
          {view.total === 1 ? "report" : "reports"} · Newest first
        </p>
      </div>
      {view.reports.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          {view.total
            ? "No reports on this page."
            : "No discussion reports yet."}
        </p>
      ) : (
        <ul className="space-y-4">
          {view.reports.map((report) => (
            <li key={report.id}>
              <article
                aria-labelledby={`report-${report.id}`}
                className="min-w-0 space-y-3 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-start gap-2">
                  <h3
                    id={`report-${report.id}`}
                    className="min-w-0 flex-1 break-words font-medium [overflow-wrap:anywhere]"
                  >
                    {report.replyId === null ? "Question" : "Reply"} in{" "}
                    {report.questionTitle}
                  </h3>
                  {report.hidden && (
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs">
                      Hidden
                    </span>
                  )}
                  {report.deleted && (
                    <span className="text-xs text-muted-foreground">
                      Deleted by author
                    </span>
                  )}
                  {!report.reviewedAt && (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      Awaiting review
                    </span>
                  )}
                </div>
                <p className="break-words text-xs text-muted-foreground">
                  Reported by {report.reporterName} ·{" "}
                  <time dateTime={report.createdAt}>
                    {new Date(report.createdAt).toLocaleString("en-US", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </time>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                  <span className="font-medium">Reason: </span>
                  {report.reason || "No reason provided."}
                </p>
                {report.bodyHtml === null ? (
                  <p className="text-sm italic text-muted-foreground">
                    This post was deleted by its author.
                  </p>
                ) : (
                  <div
                    className="prose prose-neutral dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:[overflow-wrap:normal]"
                    dangerouslySetInnerHTML={{ __html: report.bodyHtml }}
                  />
                )}
                <Link
                  to={`/courses/${encodeURIComponent(courseSlug)}/lessons/${report.lessonId}?question=${report.questionId}${report.replyId === null ? "" : `&reply=${report.replyId}`}`}
                  className="inline-block break-words text-sm text-primary underline"
                >
                  Open in lesson: {report.lessonTitle}
                </Link>
                <ReportReview report={report} />
              </article>
            </li>
          ))}
        </ul>
      )}
      <nav
        aria-label="Reports pages"
        className="flex flex-wrap items-center gap-4 text-sm"
      >
        {view.page > 1 && (
          <Link
            to={pageLink(view.page - 1)}
            preventScrollReset
            className="text-primary underline"
          >
            Previous reports
          </Link>
        )}
        <span>
          Page {view.page} of {pages}
        </span>
        {view.page < pages && (
          <Link
            to={pageLink(view.page + 1)}
            preventScrollReset
            className="text-primary underline"
          >
            Next reports
          </Link>
        )}
      </nav>
    </section>
  );
}
