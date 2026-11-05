import { useEffect, useId, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { CommandError, useDiscussionCommand } from "./post-form";

export function ReportPost({
  questionId,
  replyId,
}: {
  questionId: number;
  replyId?: number;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current)
      trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  const { fetcher, pending, result } = useDiscussionCommand(() => {
    setOpen(false);
    setReason("");
    setSent(true);
  });
  const reasonErrors =
    result && !result.ok ? result.error.fields?.reason : undefined;
  return (
    <div className="space-y-2">
      {!open && (
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(true);
            setSent(false);
          }}
        >
          Report
        </Button>
      )}
      {sent && (
        <p role="status" className="text-sm text-muted-foreground">
          Report sent to the course moderators.
        </p>
      )}
      {open && (
        <fetcher.Form
          method="post"
          preventScrollReset
          aria-busy={pending}
          className="space-y-3 rounded-md border p-3"
        >
          <input type="hidden" name="intent" value="discussion-report" />
          <input type="hidden" name="questionId" value={questionId} />
          {replyId !== undefined && (
            <input type="hidden" name="replyId" value={replyId} />
          )}
          <label htmlFor={id} className="block text-sm font-medium">
            Report {replyId === undefined ? "question" : "reply"}: reason
            (optional)
          </label>
          <Textarea
            id={id}
            name="reason"
            maxLength={2000}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={pending}
            aria-invalid={!!reasonErrors}
            aria-describedby={`${id}-help${reasonErrors ? ` ${id}-error` : ""}`}
            autoFocus
          />
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            Up to 2,000 characters. Only the course instructor and admins can
            see your report.
          </p>
          {reasonErrors && (
            <p id={`${id}-error`} className="text-sm text-destructive">
              {reasonErrors.join(" ")}
            </p>
          )}
          <CommandError result={result} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Sending…" : "Send report"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel report
            </Button>
          </div>
        </fetcher.Form>
      )}
    </div>
  );
}
