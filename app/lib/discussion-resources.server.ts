import { getCurrentUserId } from "./session";
import { resolveCountry } from "./country.server";
import { discussionPrivateHeaders } from "./discussion-inbox.server";
import {
  acknowledgeDiscussionSources,
  DiscussionError,
  getDiscussionUnreadCounts,
} from "~/services/discussions";

function response(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
) {
  return Response.json(body, {
    status,
    headers: { ...discussionPrivateHeaders, ...extraHeaders },
  });
}

async function boundedJson(request: Request) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("Content-Type") ?? ""
    )
  )
    throw new DiscussionError("validation", "Send a JSON read receipt.", 400);
  const reader = request.body?.getReader();
  if (!reader)
    throw new DiscussionError("validation", "Invalid read receipt.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new DiscussionError(
          "validation",
          "Read receipt is too large.",
          413
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new DiscussionError("validation", "Invalid read receipt.", 400);
  }
}

export async function discussionResource(
  request: Request,
  operation: "unread" | "read"
) {
  const method = operation === "unread" ? "GET" : "POST";
  if (request.method !== method)
    return response(
      { error: { code: "method", message: `Use ${method}.` } },
      405,
      { Allow: method }
    );
  try {
    const actorId = await getCurrentUserId(request);
    if (!actorId)
      throw new DiscussionError("unauthenticated", "Please sign in.", 401);
    if (new URL(request.url).search)
      throw new DiscussionError(
        "validation",
        "This endpoint does not accept query parameters.",
        400
      );
    const origin = request.headers.get("Origin");
    if (
      operation === "read" &&
      origin &&
      origin !== new URL(request.url).origin
    )
      throw new DiscussionError(
        "forbidden",
        "This request is unavailable.",
        403
      );
    const country = await resolveCountry(request);
    return response(
      operation === "unread"
        ? getDiscussionUnreadCounts(actorId, country)
        : acknowledgeDiscussionSources(
            actorId,
            await boundedJson(request),
            country
          )
    );
  } catch (error) {
    if (!(error instanceof DiscussionError)) throw error;
    return response(
      { error: { code: error.code, message: error.message } },
      error.status
    );
  }
}
