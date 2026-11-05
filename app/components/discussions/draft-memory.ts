import type { DiscussionCommandResult } from "~/lib/discussion-view.server";

export type PostText = { title: string; body: string };
export type DraftRequest = {
  id: number;
  text: PostText;
  fields: Record<string, string>;
  action: string;
};
export type PostDraft = {
  text: PostText;
  baseline: PostText;
  open: boolean;
  pending: boolean;
  request?: DraftRequest;
  result?: DiscussionCommandResult;
  savedWithNewText?: boolean;
};
type Success = Extract<DiscussionCommandResult, { ok: true }>;
export const emptyPost: PostText = { title: "", body: "" };
const sameText = (a: PostText, b: PostText) =>
  a.title === b.title && a.body === b.body;
export const isDirtyDraft = (draft: PostDraft) =>
  !sameText(draft.text, draft.baseline);

// One instance per mounted lesson/actor. Nothing is persisted across reloads.
export function createDraftMemory() {
  let drafts: Record<string, PostDraft> = {};
  let sequence = 0;
  const subscribers = new Set<() => void>();
  const completions = new Map<string, (result: Success) => void>();
  const write = (key: string, draft: PostDraft) => {
    drafts = { ...drafts, [key]: draft };
    subscribers.forEach((notify) => notify());
  };
  const get = (key: string, initial: PostText): PostDraft =>
    drafts[key] ?? {
      text: initial,
      baseline: initial,
      open: false,
      pending: false,
    };
  return {
    subscribe(notify: () => void) {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
    snapshot: () => drafts,
    change(key: string, initial: PostText, patch: Partial<PostText>) {
      const draft = get(key, initial);
      write(key, {
        ...draft,
        text: { ...draft.text, ...patch },
        open: true,
        savedWithNewText: false,
      });
    },
    open(key: string, initial: PostText) {
      const draft = get(key, initial);
      write(
        key,
        !isDirtyDraft(draft) && !draft.pending
          ? { text: initial, baseline: initial, open: true, pending: false }
          : { ...draft, open: true }
      );
    },
    close(key: string) {
      if (drafts[key]) write(key, { ...drafts[key], open: false });
    },
    discard(key: string) {
      const draft = drafts[key];
      if (!draft || draft.pending) return;
      write(key, {
        text: draft.baseline,
        baseline: draft.baseline,
        open: false,
        pending: false,
      });
    },
    submit(
      key: string,
      initial: PostText,
      fields: Record<string, string>,
      action: string
    ) {
      const draft = get(key, initial);
      if (draft.pending) return;
      write(key, {
        ...draft,
        open: true,
        pending: true,
        result: undefined,
        savedWithNewText: false,
        request: { id: ++sequence, text: { ...draft.text }, fields, action },
      });
    },
    finish(
      key: string,
      request: DraftRequest,
      result: DiscussionCommandResult
    ) {
      const draft = drafts[key];
      if (!draft || draft.request?.id !== request.id || !draft.pending) return;
      const unchanged = sameText(draft.text, request.text);
      const creating = request.fields.intent.startsWith("discussion-create-");
      write(key, {
        ...draft,
        pending: false,
        result,
        text: result.ok && unchanged && creating ? emptyPost : draft.text,
        baseline: result.ok
          ? creating
            ? emptyPost
            : request.text
          : draft.baseline,
        savedWithNewText: result.ok && !unchanged,
      });
      // A form that was navigated away from must not redirect the active view.
      if (result.ok && unchanged) completions.get(key)?.(result);
    },
    onSuccess(key: string, callback: (result: Success) => void) {
      completions.set(key, callback);
      return () => {
        if (completions.get(key) === callback) completions.delete(key);
      };
    },
    clear() {
      drafts = {};
      subscribers.forEach((notify) => notify());
    },
  };
}
