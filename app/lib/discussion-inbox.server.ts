import { data, redirect } from "react-router";
import { getCurrentUserId } from "./session";
import { resolveCountry } from "./country.server";
import { DiscussionError, getDiscussionInbox } from "~/services/discussions";
import type { DiscussionInboxKind } from "~/db/schema";

export const discussionPrivateHeaders = {
  "Cache-Control": "private, no-store",
};

export function discussionInboxError(error: unknown): never {
  if (!(error instanceof DiscussionError)) throw error;
  throw data(
    { error: { code: error.code, message: error.message } },
    {
      status: error.status,
      headers: discussionPrivateHeaders,
    }
  );
}

export async function loadDiscussionInbox(
  request: Request,
  kind: DiscussionInboxKind
) {
  const actorId = await getCurrentUserId(request);
  if (!actorId) throw redirect("/login");
  const values = new URL(request.url).searchParams.getAll("page");
  if (
    values.length > 1 ||
    (values.length === 1 && !/^[1-9]\d*$/.test(values[0]))
  )
    throw data(
      { error: { code: "validation", message: "Invalid inbox page." } },
      { status: 400, headers: discussionPrivateHeaders }
    );
  try {
    return getDiscussionInbox(
      actorId,
      kind,
      values.length ? Number(values[0]) : 1,
      await resolveCountry(request)
    );
  } catch (error) {
    discussionInboxError(error);
  }
}

export type DiscussionInboxView = Awaited<
  ReturnType<typeof loadDiscussionInbox>
>;
