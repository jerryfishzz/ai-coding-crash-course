import { data } from "react-router";
import { getLessonById } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import {
  DiscussionError,
  executeDiscussionCommand,
  getLessonDiscussion,
} from "~/services/discussions";
import { parseDiscussionSelection } from "./discussion-location";
import { renderDiscussionMarkdown } from "./discussion-markdown.server";

export type DiscussionCommandResult = ReturnType<
  typeof executeDiscussionCommand
>;

export async function loadDiscussionView(
  actorId: number | null,
  lessonId: number,
  search: URLSearchParams,
  country: string | null
) {
  try {
    const selection = parseDiscussionSelection(search);
    // Authorize even malformed selections before returning any discussion state.
    const view = getLessonDiscussion(
      actorId,
      lessonId,
      selection ?? {},
      country
    );
    if (!selection)
      return {
        kind: "invalid" as const,
        message: "This discussion link is invalid.",
      };
    if (view.kind !== "thread") return view;
    return {
      ...view,
      question: {
        ...view.question,
        bodyHtml:
          view.question.body === null
            ? null
            : renderDiscussionMarkdown(view.question.body),
      },
      replies: view.replies.map((reply) => ({
        ...reply,
        bodyHtml:
          reply.body === null ? null : renderDiscussionMarkdown(reply.body),
      })),
    };
  } catch (error) {
    if (!(error instanceof DiscussionError)) throw error;
    if (error.status !== 401 && error.status !== 403 && error.status !== 404)
      throw error;
    return {
      kind: "denied" as const,
      message:
        actorId === null
          ? "Sign in and enroll in this course to join the discussion."
          : "Discussion content is unavailable. You need access to this lesson to view it.",
    };
  }
}

export type DiscussionView = Awaited<ReturnType<typeof loadDiscussionView>>;

export function discussionCommandResponse(
  actorId: number | null,
  courseId: number,
  lessonId: number,
  formData: FormData,
  method: string,
  country: string | null
) {
  const failure = (
    status: number,
    code: string,
    message: string,
    headers?: HeadersInit
  ) =>
    data(
      { discussionResult: { ok: false as const, error: { code, message } } },
      { status, headers }
    );
  if (method !== "POST")
    return failure(405, "method", "Use POST for discussion actions.", {
      Allow: "POST",
    });
  const lesson = getLessonById(lessonId);
  const module = lesson && getModuleById(lesson.moduleId);
  if (!module || module.courseId !== courseId)
    return failure(
      404,
      "unavailable",
      "This discussion content is unavailable."
    );
  const input: Record<string, unknown> = Object.fromEntries(formData);
  for (const name of ["questionId", "replyId"]) {
    if (name in input) input[name] = Number(input[name]);
  }
  const result = executeDiscussionCommand(actorId, lessonId, input, country);
  return data(
    { discussionResult: result },
    {
      status: result.ok ? 200 : result.status,
      headers:
        !result.ok && result.retryAfter
          ? { "Retry-After": String(result.retryAfter) }
          : undefined,
    }
  );
}
