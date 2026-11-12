import { data } from "react-router";
import {
  updateDiscussionSetting,
  type SettingTarget,
} from "~/services/discussions";

export function discussionSettingResponse(
  actorId: number,
  target: SettingTarget,
  form: FormData,
  method: string
) {
  if (method !== "POST")
    return data(
      { error: "Use POST to change discussion settings." },
      { status: 405, headers: { Allow: "POST" } }
    );
  const result = updateDiscussionSetting(
    actorId,
    target,
    Object.fromEntries(form)
  );
  return result.ok
    ? data({ success: true })
    : data({ error: result.error.message }, { status: result.status });
}
