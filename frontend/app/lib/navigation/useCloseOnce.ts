import { useLayoutEffect, useRef } from "react";

/**
 * `close` once per address. A second ×, Escape, backdrop tap or swipe before the navigation has landed would step
 * back twice and close the page below as well. The guard is dropped when the copy is hidden or unmounted (a layout
 * effect cleanup, as `preserving-ui-state.md` does it: a cached copy shown again closes anew), and it no longer
 * matches once the address changes under a copy that stays, as when a layer parameter closes at depth 0.
 */
export function useCloseOnce(close: (() => void) | undefined): () => void {
  const closedAt = useRef<string | null>(null);
  useLayoutEffect(
    () => () => {
      closedAt.current = null;
    },
    [],
  );
  return () => {
    const here = window.location.pathname + window.location.search;
    if (closedAt.current !== here) {
      closedAt.current = here;
      close?.();
    }
  };
}
