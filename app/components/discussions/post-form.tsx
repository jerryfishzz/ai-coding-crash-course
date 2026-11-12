import { useEffect, useEffectEvent, useId, useRef } from "react";
import { useFetcher, useLocation } from "react-router";
import type { DiscussionCommandResult } from "~/lib/discussion-view.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useLessonDrafts } from "./lesson-drafts";

type Success = Extract<DiscussionCommandResult, { ok: true }>;

export function useDiscussionCommand(onSuccess?: (result: Success) => void) {
  const fetcher = useFetcher<{ discussionResult: DiscussionCommandResult }>();
  const handled = useRef<DiscussionCommandResult | undefined>(undefined);
  const complete = useEffectEvent((result: Success) => onSuccess?.(result));
  const result = fetcher.data?.discussionResult;
  useEffect(() => {
    if (fetcher.state !== "idle" || !result || result === handled.current)
      return;
    handled.current = result;
    if (result.ok) complete(result);
  }, [fetcher.state, result]);
  return { fetcher, pending: fetcher.state !== "idle", result };
}

export function CommandError({
  result,
}: {
  result?: { ok: true } | Extract<DiscussionCommandResult, { ok: false }>;
}) {
  if (!result || result.ok) return null;
  return (
    <div role="alert" className="text-sm text-destructive">
      <p>{result.error.message}</p>
      {result.retryAfter && <p>Try again in {result.retryAfter} seconds.</p>}
    </div>
  );
}

export function PostForm({
  draftKey,
  intent,
  questionId,
  replyId,
  initialTitle,
  initialBody = "",
  label,
  onSuccess,
  onCancel,
  disabled = false,
}: {
  draftKey: string;
  intent:
    | "discussion-create-question"
    | "discussion-create-reply"
    | "discussion-edit-question"
    | "discussion-edit-reply";
  questionId?: number;
  replyId?: number;
  initialTitle?: string;
  initialBody?: string;
  label: string;
  onSuccess: (result: Success) => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  const location = useLocation();
  const { memory, drafts } = useLessonDrafts();
  const initial = { title: initialTitle ?? "", body: initialBody };
  const draft = drafts[draftKey];
  const { title, body } = draft?.text ?? initial;
  const pending = draft?.pending ?? false;
  const result = draft?.result;
  const complete = useEffectEvent(onSuccess);
  useEffect(
    () => memory.onSuccess(draftKey, (result) => complete(result)),
    [memory, draftKey]
  );
  const hasTitle = intent.endsWith("question");
  const fields = result && !result.ok ? result.error.fields : undefined;
  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || pending) return;
        const fields = Object.fromEntries(
          new FormData(event.currentTarget)
        ) as Record<string, string>;
        memory.submit(
          draftKey,
          initial,
          fields,
          location.pathname + location.search
        );
      }}
      aria-busy={pending}
      className="space-y-3 rounded-lg border p-4"
    >
      <input type="hidden" name="intent" value={intent} />
      {questionId !== undefined && (
        <input type="hidden" name="questionId" value={questionId} />
      )}
      {replyId !== undefined && (
        <input type="hidden" name="replyId" value={replyId} />
      )}
      <h3 className="font-medium">{label}</h3>
      {hasTitle && (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-title`} className="text-sm font-medium">
            Question title
          </label>
          <Input
            id={`${id}-title`}
            name="title"
            required
            maxLength={160}
            value={title}
            onChange={(event) =>
              memory.change(draftKey, initial, { title: event.target.value })
            }
            disabled={disabled}
            aria-invalid={!!fields?.title}
            aria-describedby={fields?.title ? `${id}-title-error` : undefined}
          />
          {fields?.title && (
            <p id={`${id}-title-error`} className="text-sm text-destructive">
              {fields.title.join(" ")}
            </p>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor={`${id}-body`} className="text-sm font-medium">
          {hasTitle ? "Question details" : "Reply"}
        </label>
        <Textarea
          id={`${id}-body`}
          name="body"
          required
          maxLength={10000}
          rows={5}
          value={body}
          onChange={(event) =>
            memory.change(draftKey, initial, { body: event.target.value })
          }
          disabled={disabled}
          aria-invalid={!!fields?.body}
          aria-describedby={`${id}-help${fields?.body ? ` ${id}-body-error` : ""}`}
          className="min-h-32 resize-y"
        />
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          Markdown, links, and code blocks are supported. Up to 10,000
          characters.
        </p>
        {fields?.body && (
          <p id={`${id}-body-error`} className="text-sm text-destructive">
            {fields.body.join(" ")}
          </p>
        )}
      </div>
      <CommandError result={result} />
      {draft?.savedWithNewText && (
        <p role="status" className="text-sm text-muted-foreground">
          Saved. The text you changed while saving is still in this draft.
        </p>
      )}
      {disabled && (
        <p className="text-sm text-muted-foreground">
          Your draft is kept. Posting is currently unavailable.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={
            disabled || pending || !body.trim() || (hasTitle && !title.trim())
          }
        >
          {pending ? "Saving…" : label}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            {intent.startsWith("discussion-edit-")
              ? "Discard changes"
              : "Close draft"}
          </Button>
        )}
      </div>
    </form>
  );
}
