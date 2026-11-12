import { data } from "react-router";
import {
  DiscussionError,
  getCourseDiscussionReports,
  reviewDiscussionReport,
} from "~/services/discussions";
import { renderDiscussionMarkdown } from "./discussion-markdown.server";

export function loadDiscussionReports(
  actorId: number | null,
  courseId: number,
  search: URLSearchParams
) {
  const values = search.getAll("reportsPage");
  if (
    values.length > 1 ||
    (values.length === 1 && !/^[1-9]\d*$/.test(values[0]))
  )
    throw data("Invalid reports page.", { status: 400 });
  try {
    const view = getCourseDiscussionReports(
      actorId,
      courseId,
      values.length ? Number(values[0]) : 1
    );
    return {
      ...view,
      reports: view.reports.map(
        ({ report, question, reply, reporterName, lessonTitle }) => {
          const post = reply ?? question;
          return {
            id: report.id,
            reporterName,
            reason: report.reason,
            createdAt: report.createdAt,
            outcome: report.outcome,
            reviewedAt: report.reviewedAt,
            lessonId: question.lessonId,
            lessonTitle,
            questionId: question.id,
            questionTitle: question.deletedAt
              ? "Deleted question"
              : question.title,
            replyId: reply?.id ?? null,
            hidden: !!post.hiddenAt,
            deleted: !!post.deletedAt,
            bodyHtml: post.deletedAt
              ? null
              : renderDiscussionMarkdown(post.body),
          };
        }
      ),
    };
  } catch (error) {
    if (!(error instanceof DiscussionError)) throw error;
    throw data(error.message, { status: error.status });
  }
}

export type DiscussionReportsView = ReturnType<typeof loadDiscussionReports>;
export type DiscussionReportResult = ReturnType<typeof reviewDiscussionReport>;

export function discussionReportResponse(
  actorId: number | null,
  courseId: number,
  formData: FormData,
  method: string
) {
  if (method !== "POST")
    return data(
      {
        discussionResult: {
          ok: false as const,
          error: { code: "method", message: "Use POST to review reports." },
        },
      },
      { status: 405, headers: { Allow: "POST" } }
    );
  const result = reviewDiscussionReport(actorId, courseId, {
    intent: formData.get("intent"),
    reportId: Number(formData.get("reportId")),
  });
  return data(
    { discussionResult: result },
    { status: result.ok ? 200 : result.status }
  );
}
