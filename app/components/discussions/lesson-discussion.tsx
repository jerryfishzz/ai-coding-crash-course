import { Link, useLocation, useNavigate } from "react-router";
import type { DiscussionView } from "~/lib/discussion-view.server";
import { discussionSearch } from "~/lib/discussion-location";
import { Button } from "~/components/ui/button";
import { DiscussionPost, PostMetadata, QuestionState } from "./discussion-post";
import { PostForm } from "./post-form";
import { useLessonDrafts } from "./lesson-drafts";
import { emptyPost, isDirtyDraft } from "./draft-memory";
import { useDiscussionNavigation } from "./discussion-navigation";
import { useDiscussionReadReceipt } from "./unread-activity";

export function LessonDiscussion({
  view,
  lessonId,
}: {
  view: DiscussionView;
  lessonId: number;
}) {
  useDiscussionReadReceipt(lessonId, view);
  const location = useLocation();
  const navigate = useNavigate();
  const { memory, drafts } = useLessonDrafts();
  const asking = drafts.question?.open ?? false;
  const section = useDiscussionNavigation(view);
  const questionsPage = "questionsPage" in view ? view.questionsPage : 1;
  const link = (selection: Parameters<typeof discussionSearch>[1]) => ({
    pathname: location.pathname,
    search: discussionSearch(location.search, { questionsPage, ...selection }),
  });
  const openResult = (result: { questionId: number; replyId?: number }) => {
    navigate(link(result), { preventScrollReset: true });
  };
  return (
    <section
      ref={section}
      id="lesson-discussion"
      aria-labelledby="discussion-heading"
      className="my-8 min-w-0 space-y-5 border-t pt-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="discussion-heading"
          tabIndex={-1}
          className="text-2xl font-semibold"
        >
          Lesson discussion
        </h2>
        {view.kind === "list" && view.capabilities.participate && !asking && (
          <Button
            type="button"
            onClick={() => memory.open("question", emptyPost)}
          >
            {drafts.question && isDirtyDraft(drafts.question)
              ? "Resume question"
              : "Ask a question"}
          </Button>
        )}
      </div>
      {(view.kind === "denied" || view.kind === "unavailable") &&
        Object.values(drafts).some(isDirtyDraft) && (
          <p role="status" className="text-sm text-muted-foreground">
            Your unsent discussion drafts are kept while you stay in this
            lesson.
          </p>
        )}
      {view.kind === "denied" ? (
        <p className="text-sm text-muted-foreground">{view.message}</p>
      ) : view.kind === "invalid" ? (
        <div className="space-y-2">
          <p role="alert">{view.message}</p>
          <Link
            to={link({ questionsPage: 1 })}
            preventScrollReset
            className="text-sm text-primary underline"
          >
            All questions
          </Link>
        </div>
      ) : (
        <>
          {!view.capabilities.participate && (
            <p role="status" className="rounded-lg border bg-muted p-3 text-sm">
              {view.settings.archived
                ? "This course is archived. Discussion participation is paused."
                : "Discussion participation is disabled for this lesson."}{" "}
              You can still read existing discussions.
            </p>
          )}
          {view.kind === "list" ? (
            <>
              {asking && (
                <PostForm
                  draftKey="question"
                  intent="discussion-create-question"
                  label="Post question"
                  disabled={!view.capabilities.participate}
                  onSuccess={(result) => {
                    memory.close("question");
                    openResult(result);
                  }}
                  onCancel={() => memory.close("question")}
                />
              )}
              <p className="text-sm text-muted-foreground">
                {view.total} {view.total === 1 ? "question" : "questions"} ·
                Newest first
              </p>
              {view.questions.length === 0 ? (
                <p className="rounded-lg border p-6 text-sm text-muted-foreground">
                  {view.total === 0
                    ? "No questions yet. Ask about this lesson to start the discussion."
                    : "No questions on this page."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {view.questions.map((question) => (
                    <li
                      key={question.id}
                      className="min-w-0 rounded-lg border p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-start gap-2">
                        <Link
                          id={`discussion-question-link-${question.id}`}
                          to={link({ questionId: question.id })}
                          preventScrollReset
                          className="min-w-0 flex-1 break-words font-semibold text-primary hover:underline [overflow-wrap:anywhere]"
                        >
                          {question.title}
                        </Link>
                        <QuestionState resolved={question.resolved} />
                      </div>
                      <PostMetadata post={question} />
                      {question.excerpt && (
                        <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          {question.excerpt}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        {question.replyCount}{" "}
                        {question.replyCount === 1 ? "reply" : "replies"} ·
                        Latest activity{" "}
                        <time dateTime={question.latestActivityAt}>
                          {new Date(
                            question.latestActivityAt
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </time>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination
                label="Questions"
                page={questionsPage}
                total={view.total}
                pageSize={view.pageSize}
                href={(page) => link({ questionsPage: page })}
              />
            </>
          ) : (
            <>
              <Link
                to={link({})}
                preventScrollReset
                className="inline-block text-sm text-primary hover:underline"
              >
                ← All questions
              </Link>
              {view.kind === "unavailable" ? (
                <p role="status" className="rounded-lg border p-6">
                  This discussion content is unavailable.
                </p>
              ) : (
                <>
                  <DiscussionPost
                    key={`question-${view.question.id}`}
                    post={view.question}
                    questionId={view.question.id}
                  />
                  <div className="space-y-3">
                    <h3 className="font-semibold">
                      {view.total} {view.total === 1 ? "reply" : "replies"}
                    </h3>
                    {view.linkedReplyUnavailable && (
                      <p
                        role="status"
                        className="rounded-lg bg-muted p-3 text-sm"
                      >
                        The linked reply is unavailable. You can still read this
                        question and its other replies.
                      </p>
                    )}
                    {view.replies.map((reply) => (
                      <DiscussionPost
                        key={reply.id}
                        post={reply}
                        questionId={view.question.id}
                        linked={
                          new URLSearchParams(location.search).get("reply") ===
                          String(reply.id)
                        }
                      />
                    ))}
                    {view.total === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No replies yet.
                      </p>
                    )}
                    {view.total > 0 && view.replies.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No replies on this page.
                      </p>
                    )}
                    <Pagination
                      label="Replies"
                      page={view.repliesPage}
                      total={view.total}
                      pageSize={view.pageSize}
                      href={(page) =>
                        link({
                          questionId: view.question.id,
                          repliesPage: page,
                        })
                      }
                    />
                  </div>
                  {(view.question.capabilities.reply ||
                    drafts[`reply:${view.question.id}`]) && (
                    <PostForm
                      draftKey={`reply:${view.question.id}`}
                      key={`reply-${view.question.id}`}
                      intent="discussion-create-reply"
                      questionId={view.question.id}
                      label="Post reply"
                      disabled={!view.question.capabilities.reply}
                      onSuccess={openResult}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function Pagination({
  label,
  page,
  total,
  pageSize,
  href,
}: {
  label: string;
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => { pathname: string; search: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1 && page === 1) return null;
  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <div className="flex gap-3">
        {page > 1 && (
          <Link
            to={href(page > pages ? 1 : page - 1)}
            preventScrollReset
            className="text-primary hover:underline"
          >
            {page > pages ? "First page" : "Previous"}
          </Link>
        )}
      </div>
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link
          to={href(page + 1)}
          preventScrollReset
          className="text-primary hover:underline"
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
