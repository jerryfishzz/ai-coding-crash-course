import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { matchPath, useBlocker, useFetcher } from "react-router";
import { AlertDialog } from "radix-ui";
import { Button } from "~/components/ui/button";
import type { DiscussionCommandResult } from "~/lib/discussion-view.server";
import {
  createDraftMemory,
  isDirtyDraft,
  type DraftRequest,
} from "./draft-memory";

const DraftContext = createContext<ReturnType<typeof createDraftMemory> | null>(
  null
);

export function useLessonDrafts() {
  const memory = useContext(DraftContext);
  if (!memory) throw new Error("Discussion drafts need a lesson provider.");
  const drafts = useSyncExternalStore(
    memory.subscribe,
    memory.snapshot,
    memory.snapshot
  );
  return { memory, drafts };
}

export function LessonDrafts({
  lessonId,
  courseSlug,
  children,
}: {
  lessonId: number;
  courseSlug: string;
  children: ReactNode;
}) {
  const [memory] = useState(createDraftMemory);
  const drafts = useSyncExternalStore(
    memory.subscribe,
    memory.snapshot,
    memory.snapshot
  );
  const dirty = Object.values(drafts).some(isDirtyDraft);
  const returnFocus = useRef<HTMLElement | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (currentLocation.pathname === nextLocation.pathname) return false;
    const next = matchPath(
      "/courses/:slug/lessons/:lessonId",
      nextLocation.pathname
    );
    const leaving =
      !next ||
      next.params.slug !== courseSlug ||
      Number(next.params.lessonId) !== lessonId;
    if (dirty && leaving)
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    return dirty && leaving;
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // Saving the last draft while the confirmation is open removes the reason
  // to block, but does not silently carry out a previously requested navigation.
  useEffect(() => {
    if (!dirty && blocker.state === "blocked") blocker.reset();
  }, [dirty, blocker]);

  return (
    <DraftContext value={memory}>
      {children}
      {Object.entries(drafts).map(
        ([key, draft]) =>
          draft.request && (
            <DraftSubmission
              key={key}
              draftKey={key}
              request={draft.request}
              memory={memory}
            />
          )
      )}
      <AlertDialog.Root
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <AlertDialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-lg border bg-background p-6 shadow-lg"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (returnFocus.current?.isConnected)
                returnFocus.current.focus({ preventScroll: true });
            }}
          >
            <AlertDialog.Title className="text-lg font-semibold">
              Leave this lesson?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground">
              You have unsent discussion text. Leaving will discard this
              lesson’s drafts.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Stay</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (blocker.state !== "blocked") return;
                    memory.clear();
                    blocker.proceed();
                  }}
                >
                  Leave
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </DraftContext>
  );
}

// Mounted for the lifetime of the lesson, even when its form is off screen.
// Each draft has its own fetcher, so one slow save cannot discard another form.
function DraftSubmission({
  draftKey,
  request,
  memory,
}: {
  draftKey: string;
  request: DraftRequest;
  memory: ReturnType<typeof createDraftMemory>;
}) {
  const fetcher = useFetcher<{ discussionResult: DiscussionCommandResult }>();
  const started = useRef(0);
  const previousData = useRef(fetcher.data);
  const submit = useEffectEvent(() => {
    previousData.current = fetcher.data;
    fetcher.submit(request.fields, {
      method: "post",
      action: request.action,
      preventScrollReset: true,
    });
  });
  useEffect(() => {
    if (started.current === request.id) return;
    started.current = request.id;
    submit();
  }, [request.id]);
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      fetcher.data !== previousData.current
    ) {
      memory.finish(draftKey, request, fetcher.data.discussionResult);
    }
  }, [draftKey, request, memory, fetcher.state, fetcher.data]);
  return null;
}
