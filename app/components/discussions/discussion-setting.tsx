import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

type Props = {
  level: "global" | "course" | "lesson";
  value: "inherit" | "enabled" | "disabled";
  inheritedEnabled?: boolean;
  canManage: boolean;
  archived?: boolean;
};

export function DiscussionSetting({
  level,
  value,
  inheritedEnabled = false,
  canManage,
  archived = false,
}: Props) {
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const id = useId();
  const [selection, setSelection] = useState<string>(value);
  useEffect(() => setSelection(value), [value]);
  const title =
    level === "global"
      ? "Discussion default"
      : level === "course"
        ? "Course discussions"
        : "Lesson discussions";
  const inheritance = level === "course" ? "global default" : "course setting";
  const enabledLabel = (enabled: boolean) => (enabled ? "Enabled" : "Disabled");
  const status =
    value === "inherit"
      ? `Using ${inheritance}: ${enabledLabel(inheritedEnabled)}`
      : enabledLabel(value === "enabled");

  return (
    <Card className="min-w-0 [overflow-wrap:anywhere]">
      <CardHeader className="px-4 sm:px-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {level === "global"
            ? "Applies to courses that use the global default. Explicit course settings take priority."
            : level === "course"
              ? "Applies to lessons that use the course setting. Individual lessons can be paused."
              : "Pause discussion participation for this lesson, or use the course setting."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 sm:px-6">
        <p className="text-sm font-medium">{status}</p>
        {archived && (
          <p className="text-sm text-muted-foreground">
            This course is archived. Discussion participation is paused.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          When participation is disabled, existing discussions remain readable
          and staff can still moderate.
        </p>
        {canManage ? (
          <fetcher.Form
            method="post"
            className="flex flex-wrap items-end gap-3"
          >
            <input
              type="hidden"
              name="intent"
              value={`discussion-set-${level}`}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={id} className="text-sm font-medium">
                {title}
              </label>
              <select
                id={id}
                name="value"
                value={selection}
                onChange={(event) => setSelection(event.target.value)}
                className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={fetcher.state !== "idle"}
              >
                {level !== "global" && (
                  <option value="inherit">Use {inheritance}</option>
                )}
                {level !== "lesson" && <option value="enabled">Enabled</option>}
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={fetcher.state !== "idle" || selection === value}
            >
              {fetcher.state !== "idle" ? "Saving…" : "Save setting"}
            </Button>
            <div className="w-full text-sm" aria-live="polite">
              {fetcher.state === "idle" && fetcher.data?.error && (
                <p role="alert" className="text-destructive">
                  {fetcher.data.error}
                </p>
              )}
              {fetcher.state === "idle" &&
                fetcher.data?.success &&
                selection === value && <p>Discussion setting saved.</p>}
            </div>
          </fetcher.Form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only admins can change discussion settings.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
