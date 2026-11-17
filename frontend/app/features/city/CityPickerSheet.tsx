"use client";

import { BottomSheet } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type ReactNode, useLayoutEffect, useRef } from "react";

import { type RoutePresentation, RouteSheet } from "@/features/shell/RouteSheet";
import { useCitiesStats, useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import { CityList } from "./CityList";

export interface CityPickerSheetProps {
  /** `header`: the `/city` address (a `RouteSheet`, closed through `useBack`); `nested`: the `pick=city` layer over the
   *  filters sheet (a `stacked` `BottomSheet` in a portal, closed through `onClose`). */
  variant: "header" | "nested";
  /** `header` only: how the address renders (`layer` in `@sheet`, `standalone` on a direct load). */
  presentation?: RoutePresentation;
  /** The city with ✓. */
  current: string;
  onPick: (code: string) => void;
  /** `nested` only: ×, backdrop, drag and Escape ask here (the `pick` layer's `close`, i.e. Back). */
  onClose?: () => void;
}

/**
 * `onClose` once per address: a second ×, Escape or backdrop tap before Back has landed would step back twice and
 * close the filters sheet below too. Forgotten when the layer is hidden or left, and stale once the address changes.
 */
function useCloseOnce(onClose: (() => void) | undefined): () => void {
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
      onClose?.();
    }
  };
}

function NestedSheet({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose?: () => void; children: ReactNode }) {
  const close = useCloseOnce(onClose);
  return (
    <BottomSheet open stacked variant="compact" title={title} closeLabel={closeLabel} onClose={close} onDragCommit={() => tg.haptic.impact()}>
      <div data-slot="city-picker-nested">{children}</div>
    </BottomSheet>
  );
}

/**
 * The city sheet (SCR-017, WP-25): «Город», ×, and WP-23's `CityList` of the reference cities with their counts
 * (`useCitiesStats`, none while they load or failed), ✓ on `current` and the location row where the device can ask for
 * a position. It decides nothing about a pick: `onPick` gets the code (`useCityPick` of the same folder), and the
 * row's light haptic and the position's success haptic are `CityList`'s. A position that arrives after the sheet was
 * left is dropped by `CityList`.
 *
 * - `header`: a compact `RouteSheet` — as tall as its rows, as legacy's city sheet, which is not the full-height
 *   filters frame; ×, backdrop, drag, Escape and Telegram's Back close it through `useBack`. Its content carries
 *   `data-route="city"` (and `data-layer="sheet"` for the copy in `@sheet`), which the end-to-end specs select; the
 *   direct load renders in place, so the server HTML holds it.
 * - `nested`: the `pick=city` layer over the filters sheet, a compact `stacked` `BottomSheet` in a portal (60 over 50,
 *   `03` §3.6); ×, backdrop, drag and Escape ask `onClose` once, and a closing drag plays the light impact every sheet
 *   plays (TMA-025). It carries no `data-route` and no `data-layer`: the address is still `filters`.
 */
export function CityPickerSheet({ variant, presentation = "layer", current, onPick, onClose }: CityPickerSheetProps): ReactNode {
  const t = useTranslations();
  const { cities } = useReference();
  const { stats } = useCitiesStats();
  const list = <CityList cities={cities} stats={stats} current={current} showCheck showLocate onPick={onPick} />;

  if (variant === "nested") {
    return (
      <NestedSheet title={t("city.title")} closeLabel={t("common.close")} onClose={onClose}>
        {list}
      </NestedSheet>
    );
  }
  return (
    <RouteSheet presentation={presentation} variant="compact" title={t("city.title")} closeLabel={t("common.close")}>
      <div data-route="city" data-layer={presentation === "layer" ? "sheet" : undefined}>
        {list}
      </div>
    </RouteSheet>
  );
}
