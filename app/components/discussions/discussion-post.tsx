import { useState } from "react";
import type { DiscussionView } from "~/lib/discussion-view.server";
import { Button } from "~/components/ui/button";
import { CommandError, PostForm, useDiscussionCommand } from "./post-form";
import { useLessonDrafts } from "./lesson-drafts";
import { ReportPost } from "./report-post";

type Thread = Extract<DiscussionView, { kind: "thread" }>;
export type DiscussionPostData = Thread["replies"][number] | Thread["question"];

export function PostMetadata({
  post,
}: {
  post: Pick<
    DiscussionPostData,
    "authorName" | "instructor" | "createdAt" | "editedAt" | "hidden"
  >;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere] [&>span]:min-w-0">
      <span className="font-medium text-foreground">{post.authorName}</span>
      {post.instructor && (
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
          Instructor
        </span>
      )}
      <time dateTime={post.createdAt} title={post.createdAt}>
        {new Date(post.createdAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "UTC",
        })}{" "}
        UTC
      </time>
      {post.editedAt && <span title={post.editedAt}>Edited</span>}
      {post.hidden && (
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
          Hidden
        </span>
      )}
    </div>
  );
}

export function QuestionState({ resolved }: { resolved: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${resolved ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
    >
      {resolved ? "Resolved" : "Open"}
    </span>
  );
}

export function DiscussionPost({
  post,
  questionId,
  linked = false,
}: {
  post: DiscussionPostData;
  questionId: number;
  linked?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { fetcher, pending, result } = useDiscussionCommand(() =>
    setConfirmDelete(false)
  );
  const question = "title" in post ? post : null;
  const { memory, drafts } = useLessonDrafts();
  const draftKey = `edit-${question ? "question" : "reply"}:${post.id}`;
  const editing = drafts[draftKey]?.open ?? false;
  const initial = { title: question?.title ?? "", body: post.body ?? "" };
  const fields = (
    <>
      <input type="hidden" name="questionId" value={questionId} />
      {!question && <input type="hidden" name="replyId" value={post.id} />}
    </>
  );
  return (
    <article
      id={question ? `question-${post.id}` : `reply-${post.id}`}
      tabIndex={-1}
      className={`min-w-0 scroll-mt-6 space-y-3 rounded-lg border p-4 ${linked ? "border-primary ring-1 ring-primary" : ""}`}
    >
      {question && (
        <div className="flex flex-wrap items-start gap-2">
          <h3 className="min-w-0 flex-1 break-words text-lg font-semibold [overflow-wrap:anywhere]">
            {question.title}
          </h3>
          <QuestionState resolved={question.resolved} />
        </div>
      )}
      <PostMetadata post={post} />
      {editing && post.body !== null ? (
        <PostForm
          draftKey={draftKey}
          intent={
            question ? "discussion-edit-question" : "discussion-edit-reply"
          }
          questionId={questionId}
          replyId={question ? undefined : post.id}
          initialTitle={question?.title}
          initialBody={post.body ?? ""}
          label="Save changes"
          disabled={!post.capabilities.edit}
          onCancel={() => memory.discard(draftKey)}
          onSuccess={() => memory.close(draftKey)}
        />
      ) : post.bodyHtml !== null ? (
        <div
          className="prose prose-neutral dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:[overflow-wrap:normal]"
          dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
        />
      ) : (
        <p className="text-sm italic text-muted-foreground">
          {post.deleted
            ? "This post was deleted by its author."
            : "This reply is hidden."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {post.capabilities.edit && !editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => memory.open(draftKey, initial)}
            disabled={pending}
          >
            Edit
          </Button>
        )}
        {post.capabilities.delete && !confirmDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
          >
            Delete
          </Button>
        )}
        {question?.capabilities.resolve && (
          <fetcher.Form method="post" preventScrollReset>
            {fields}
            <Button
              name="intent"
              value={
                question.resolved ? "discussion-reopen" : "discussion-resolve"
              }
              variant="outline"
              size="sm"
              disabled={pending}
            >
              {question.resolved ? "Reopen question" : "Resolve question"}
            </Button>
          </fetcher.Form>
        )}
        {post.capabilities.moderate && (
          <fetcher.Form method="post" preventScrollReset>
            {fields}
            <Button
              name="intent"
              value={post.hidden ? "discussion-restore" : "discussion-hide"}
              variant="outline"
              size="sm"
              disabled={pending}
            >
              {post.hidden ? "Restore" : "Hide"}{" "}
              {question ? "question" : "reply"}
            </Button>
          </fetcher.Form>
        )}
      </div>
      {post.hidden && post.bodyHtml !== null && (
        <p className="text-sm text-muted-foreground">
          Hidden from students. Only the course instructor and admins can see
          this content.
        </p>
      )}
      {post.capabilities.report && (
        <ReportPost
          questionId={questionId}
          replyId={question ? undefined : post.id}
        />
      )}
      {confirmDelete && post.capabilities.delete && (
        <fetcher.Form
          method="post"
          preventScrollReset
          className="space-y-2 rounded-md bg-muted p-3"
        >
          {fields}
          <p className="text-sm">
            Delete {question ? "this question" : "this reply"}? Its text will be
            removed permanently.{question && " Existing replies will remain."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              name="intent"
              value={
                question
                  ? "discussion-delete-question"
                  : "discussion-delete-reply"
              }
              variant="destructive"
              size="sm"
              disabled={pending}
            >
              {pending ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </fetcher.Form>
      )}
      <CommandError result={result} />
    </article>
  );
}
