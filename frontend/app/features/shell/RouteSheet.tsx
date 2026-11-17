"use client";

import { BottomSheet, type BottomSheetProps } from "@homi/ui";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useBack } from "@/lib/navigation/useBack";
import { tg } from "@/lib/telegram";

/** How a layer address renders: intercepted into its slot over the page below, or loaded directly as the page. */
export type RoutePresentation = "layer" | "standalone";

export interface RouteSheetProps
  extends Pick<BottomSheetProps, "title" | "variant" | "header" | "leading" | "footer" | "closeLabel" | "dismissible"> {
  /** `layer` (default): the copy in the `@sheet` slot; `standalone`: the page of a sheet address loaded directly. */
  presentation?: RoutePresentation;
  /**
   * Replaces the one `back()` of the ×, the backdrop, the drag and Escape, still once per address (the actions sheet
   * of WP-26 closes all its steps at once). Telegram's BackButton keeps `back()`.
   */
  onClose?: () => void;
  children?: ReactNode;
}

/**
 * `back` once per address. A second ×, Escape or backdrop tap before the navigation has landed would step back twice
 * and close the page below as well. The guard is dropped when the copy is hidden or unmounted (a cached copy shown
 * again closes anew), and it no longer matches once the address changes under a copy that stays, as when a layer
 * parameter closes at depth 0.
 */
function useCloseOnce(back: () => void): () => void {
  const closedAt = useRef<string | null>(null);
  useEffect(
    () => () => {
      closedAt.current = null;
    },
    [],
  );
  return () => {
    const here = window.location.pathname + window.location.search;
    if (closedAt.current !== here) {
      closedAt.current = here;
      back();
    }
  };
}

/**
 * A drag slides the sheet out before it calls `back()`, and `useSheetDrag` keeps it out until it unmounts. When the
 * address then changes under a copy that stays — `back()` closed a layer parameter (`pick=city` inside the filters,
 * WP-25; `step=detail` of the report, WP-26) — the sheet is mounted anew and rises again; left out, its backdrop would
 * catch every tap and only BackButton would still work. A copy hidden with its cached route forgets the mark (a layout
 * effect cleanup, as `preserving-ui-state.md` does it), so its first address change after it is shown again keeps it.
 */
function useRiseAfterDrag(): { generation: number; slidOut: () => void } {
  const here = `${usePathname()}?${useSearchParams()?.toString() ?? ""}`;
  const [out, setOut] = useState<{ at: string | null; generation: number }>({ at: null, generation: 0 });
  if (out.at !== null && out.at !== here) {
    setOut({ at: null, generation: out.generation + 1 });
  }
  useLayoutEffect(
    () => () => setOut((current) => (current.at === null ? current : { at: null, generation: current.generation })),
    [],
  );
  const slidOut = () => setOut((current) => ({ at: here, generation: current.generation }));
  return { generation: out.generation, slidOut };
}

/**
 * A sheet address as a bottom sheet (WP-23, `03` §1.2, `25` §3.2): `BottomSheet` of `@homi/ui`, open while mounted,
 * closed through `back()` of `useBack()`. Telegram's BackButton is not bound here: `TelegramButtons` drives it with
 * the same `back()`, so the ×, Escape and BackButton always agree.
 *
 * - `layer`, the copy in the `@sheet` slot over the page below: the ×, a backdrop tap, a drag down from the header
 *   and Escape all end in `back()`; a drag that closes the sheet plays a light impact (TMA-025). A non-dismissible
 *   sheet keeps only its ×.
 * - `standalone`, the page of a sheet address loaded directly (`/filters`, `/sort`, …): no page lies below, so a
 *   backdrop tap and the drag do nothing. The × and Escape still close it, like BackButton: a direct load starts at
 *   depth 0, where `back()` replaces the address with `parentOf(pathname, searchParams)` — `/map` with `from=map`,
 *   else `/`, the search state kept. Escape follows the × because it is the keyboard's way to close a dialog, not a
 *   gesture that needs a page below; a non-dismissible sheet ignores it, as in the layer. The sheet renders in place,
 *   not in a portal, so the server HTML of the direct load already holds it; the content area around it must not
 *   carry a transform.
 */
export function RouteSheet({ presentation = "layer", dismissible = true, onClose, children, ...sheet }: RouteSheetProps) {
  const { back } = useBack();
  const close = useCloseOnce(onClose ?? back);
  const { generation, slidOut } = useRiseAfterDrag();
  const layer = presentation === "layer";

  return (
    <BottomSheet
      key={generation}
      {...sheet}
      open
      onClose={close}
      dismissible={layer && dismissible}
      closeOnEscape={dismissible}
      portal={layer}
      onDragCommit={() => {
        slidOut();
        tg.haptic.impact();
      }}
    >
      {children}
    </BottomSheet>
  );
}
