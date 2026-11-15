import { useSearchParams } from "next/navigation";

import { pushEntry, stack } from "./history";
import { useBack } from "./useBack";

/** The layers that are not routes but close on Back (`25` §3.2). */
export type LayerKey = "pick" | "draw" | "pin" | "step";

/**
 * A layer kept as a search parameter: `open` appends it with `history.pushState` (shallow routing,
 * `single-page-applications.md`), `close` is Back — at depth 0 that removes the parameter through the parent address.
 */
export function useLayerState(key: LayerKey): { value: string | null; open: (value: string) => void; close: () => void } {
  const searchParams = useSearchParams();
  const { back } = useBack();
  return {
    value: searchParams?.get(key) ?? null,
    open: (value: string) => {
      stack();
      const url = new URL(window.location.href);
      url.searchParams.set(key, value);
      window.history.pushState(null, "", url.pathname + url.search);
      pushEntry(url.pathname + url.search);
    },
    close: back,
  };
}
