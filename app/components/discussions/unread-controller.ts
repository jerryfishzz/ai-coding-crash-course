export interface UnreadCounts {
  notifications: number;
  discussionInbox: number;
}
export interface ReadSources {
  lessonId: number;
  questionId: number;
  replyIds: number[];
}
export const emptyUnreadCounts: UnreadCounts = {
  notifications: 0,
  discussionInbox: 0,
};

function validCounts(value: unknown): value is UnreadCounts {
  if (!value || typeof value !== "object") return false;
  const counts = value as Record<string, unknown>;
  return [counts.notifications, counts.discussionInbox].every(
    (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0
  );
}

// One controller per signed-in actor. Counts are advisory; failures keep the
// last confirmed counts. Receipt retries belong to the still-mounted view.
export function createUnreadController(
  initial: UnreadCounts,
  send: typeof fetch = (...args) => fetch(...args)
) {
  let counts = initial;
  let active = true;
  let generation = 0;
  let receiptSequence = 0;
  let pendingReceipts = 0;
  const listeners = new Set<() => void>();
  const publish = (next: UnreadCounts) => {
    if (
      next.notifications === counts.notifications &&
      next.discussionInbox === counts.discussionInbox
    )
      return;
    counts = next;
    listeners.forEach((listener) => listener());
  };
  const refresh = async () => {
    const request = ++generation;
    try {
      const response = await send("/api/discussions/unread", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const next: unknown = await response.json();
      if (
        active &&
        request === generation &&
        pendingReceipts === 0 &&
        validCounts(next)
      )
        publish(next);
    } catch {
      /* A navigation or receipt will check again. */
    }
  };
  return {
    snapshot: () => counts,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      active = true;
    },
    stop() {
      active = false;
      generation++;
      receiptSequence++;
    },
    refresh,
    async acknowledge(
      sources: ReadSources,
      stillCurrent: () => boolean
    ): Promise<boolean> {
      if (!active || !stillCurrent()) return true;
      const sequence = ++receiptSequence;
      ++generation;
      pendingReceipts++;
      let saved = false;
      let next: unknown;
      try {
        const response = await send("/api/discussions/read", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sources),
        });
        if (response.ok) {
          next = await response.json();
          saved = validCounts(next);
        }
        // Authorization/validation failures need a fresh view, not automatic retries.
        if (response.status >= 400 && response.status < 500) saved = true;
      } catch {
        /* Retry only if this detail view remains active. */
      } finally {
        pendingReceipts--;
        if (active) {
          // A GET issued before this write finished cannot restore old badges.
          ++generation;
          if (pendingReceipts === 0) {
            if (
              sequence === receiptSequence &&
              stillCurrent() &&
              validCounts(next)
            )
              publish(next);
            else void refresh();
          }
        }
      }
      return saved;
    },
  };
}
