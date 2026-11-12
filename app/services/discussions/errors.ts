export class DiscussionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryAfter?: number,
    public fields?: Record<string, string[] | undefined>
  ) {
    super(message);
  }
}

export function unavailable(): never {
  throw new DiscussionError(
    "unavailable",
    "This discussion content is unavailable.",
    404
  );
}

export function forbidden(): never {
  throw new DiscussionError(
    "forbidden",
    "You do not have access to this action.",
    403
  );
}

export function commandResult<T extends object>(run: () => T) {
  try {
    return { ok: true as const, ...run() };
  } catch (error) {
    if (!(error instanceof DiscussionError)) throw error;
    return {
      ok: false as const,
      status: error.status,
      retryAfter: error.retryAfter,
      error: { code: error.code, message: error.message, fields: error.fields },
    };
  }
}
