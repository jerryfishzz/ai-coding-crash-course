export type DiscussionSelection = {
  questionsPage: number;
  questionId?: number;
  repliesPage: number;
  replyId?: number;
};

const parameters = [
  "questionsPage",
  "question",
  "repliesPage",
  "reply",
] as const;

export function parseDiscussionSelection(
  search: URLSearchParams
): DiscussionSelection | null {
  const values: Partial<Record<(typeof parameters)[number], number>> = {};
  for (const name of parameters) {
    const entries = search.getAll(name);
    if (entries.length > 1) return null;
    if (!entries.length) continue;
    if (!/^[1-9]\d*$/.test(entries[0])) return null;
    const value = Number(entries[0]);
    if (!Number.isSafeInteger(value) || value > 1_000_000_000) return null;
    values[name] = value;
  }
  if (values.reply !== undefined && values.question === undefined) return null;
  return {
    questionsPage: values.questionsPage ?? 1,
    questionId: values.question,
    repliesPage: values.repliesPage ?? 1,
    replyId: values.reply,
  };
}

// Replace only discussion parameters, retaining lesson-specific query context.
export function discussionSearch(
  search: string,
  selection: Partial<DiscussionSelection>
) {
  const next = new URLSearchParams(search);
  parameters.forEach((name) => next.delete(name));
  if (selection.questionsPage && selection.questionsPage !== 1)
    next.set("questionsPage", String(selection.questionsPage));
  if (selection.questionId) {
    next.set("question", String(selection.questionId));
    if (selection.replyId) next.set("reply", String(selection.replyId));
    else if (selection.repliesPage && selection.repliesPage !== 1)
      next.set("repliesPage", String(selection.repliesPage));
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}
