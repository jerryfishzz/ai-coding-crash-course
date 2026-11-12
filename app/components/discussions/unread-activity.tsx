import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLocation, useNavigation } from "react-router";
import {
  createUnreadController,
  emptyUnreadCounts,
  type ReadSources,
  type UnreadCounts,
} from "./unread-controller";
import type { DiscussionView } from "~/lib/discussion-view.server";

const UnreadContext = createContext<ReturnType<
  typeof createUnreadController
> | null>(null);

export function UnreadActivity({
  initialCounts,
  enabled = true,
  children,
}: {
  initialCounts: UnreadCounts;
  enabled?: boolean;
  children: ReactNode;
}) {
  const [controller] = useState(() => createUnreadController(initialCounts));
  const location = useLocation();
  const navigation = useNavigation();
  const destination = location.pathname + location.search;
  const previous = useRef(destination);
  useLayoutEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  useEffect(() => {
    if (
      !enabled ||
      navigation.state !== "idle" ||
      previous.current === destination
    )
      return;
    previous.current = destination;
    void controller.refresh();
  }, [controller, destination, navigation.state, enabled]);
  return (
    <UnreadContext value={enabled ? controller : null}>
      {children}
    </UnreadContext>
  );
}

export function useUnreadCounts() {
  const controller = useContext(UnreadContext);
  return useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.snapshot ?? emptySnapshot,
    controller?.snapshot ?? emptySnapshot
  );
}
const noopSubscribe = () => () => {};
const emptySnapshot = () => emptyUnreadCounts;

export function useDiscussionReadReceipt(
  lessonId: number,
  view: DiscussionView
) {
  const controller = useContext(UnreadContext);
  const location = useLocation();
  const navigation = useNavigation();
  // Only original content actually projected into this committed detail view.
  const sources: ReadSources | null =
    view.kind === "thread"
      ? {
          lessonId,
          questionId: view.question.id,
          replyIds: view.replies
            .filter((reply) => reply.bodyHtml !== null)
            .map((reply) => reply.id),
        }
      : null;
  const signature = sources ? JSON.stringify(sources) : null;
  useEffect(() => {
    if (!controller || !signature || navigation.state !== "idle") return;
    let current = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function acknowledge() {
      const saved = await controller!.acknowledge(
        JSON.parse(signature!),
        () => current
      );
      // Idempotent and bounded; never retry once the view has changed/unmounted.
      if (!saved && current && ++attempts < 3)
        retry = setTimeout(acknowledge, 1500 * attempts);
    }
    void acknowledge();
    return () => {
      current = false;
      clearTimeout(retry);
    };
  }, [
    controller,
    signature,
    location.pathname,
    location.search,
    navigation.state,
  ]);
}
