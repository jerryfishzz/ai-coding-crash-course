import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useMainScroll } from "~/components/main-scroll";
import { parseDiscussionSelection } from "~/lib/discussion-location";
import type { DiscussionView } from "~/lib/discussion-view.server";

type Position = { top: number; focusId?: string };

export function useDiscussionNavigation(view: DiscussionView) {
  const section = useRef<HTMLElement>(null);
  const main = useMainScroll();
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, Position>());
  const previous = useRef<string | null>(null);
  const selection = parseDiscussionSelection(
    new URLSearchParams(location.search)
  );
  const listPage = "questionsPage" in view ? view.questionsPage : 1;
  const key =
    view.kind === "list"
      ? `list:${listPage}`
      : `${view.kind}:${selection?.questionId}:${"repliesPage" in view ? view.repliesPage : 1}:${selection?.replyId}`;

  // During document hydration, the parent's main ref attaches after child
  // layout effects. Run after refs attach so an initial deep link also scrolls.
  useEffect(() => {
    const panel = main?.current;
    const region = section.current;
    if (!panel || !region) return;
    const changed = previous.current !== key;
    const initial = previous.current === null;
    previous.current = key;
    // A normal lesson visit starts at the lesson, while a direct discussion
    // link starts at its question/reply. Revalidation never steals form focus.
    if (
      changed &&
      (!initial ||
        selection?.questionId ||
        listPage > 1 ||
        view.kind === "invalid")
    ) {
      const saved = positions.current.get(key);
      const restore =
        view.kind === "list" || navigationType === "POP" ? saved : undefined;
      const target =
        (restore?.focusId && document.getElementById(restore.focusId)) ||
        (selection?.replyId &&
          document.getElementById(`reply-${selection.replyId}`)) ||
        document.getElementById("discussion-heading");
      if (target) {
        target.focus({ preventScroll: true });
        panel.scrollTop = restore
          ? restore.top
          : Math.max(
              0,
              panel.scrollTop +
                target.getBoundingClientRect().top -
                panel.getBoundingClientRect().top -
                24
            );
      }
    }
    const remember = () => {
      const active = document.activeElement;
      positions.current.set(key, {
        top: panel.scrollTop,
        focusId:
          active instanceof HTMLElement && region.contains(active)
            ? active.id || undefined
            : undefined,
      });
    };
    remember();
    panel.addEventListener("scroll", remember, { passive: true });
    region.addEventListener("focusin", remember);
    // Capture the current position before the selected view's DOM is replaced.
    region.addEventListener("click", remember, true);
    return () => {
      panel.removeEventListener("scroll", remember);
      region.removeEventListener("focusin", remember);
      region.removeEventListener("click", remember, true);
    };
  }, [
    key,
    location.key,
    main,
    navigationType,
    listPage,
    selection?.questionId,
    selection?.replyId,
    view.kind,
  ]);
  return section;
}
