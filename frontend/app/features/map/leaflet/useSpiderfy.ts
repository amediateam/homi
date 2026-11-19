"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MapGroup, Selection } from "../types";
import type { LeafletHandle } from "./useLeafletMap";

/** The tapped stack, its key and its listings in the order a stack tap selects them. */
function spreadOf(groups: readonly MapGroup[], selection: Selection, key: string | null): MapGroup | null {
  if (key === null || selection === null) {
    return null;
  }
  const group = groups.find((candidate) => candidate.key === key);
  if (group === undefined || group.items.length !== selection.numbers.length) {
    return null;
  }
  return group.items.every((item, at) => item.number === selection.numbers[at]) ? group : null;
}

export type Spiderfy = {
  /** The spread stack: drawn as labelled pins around a dot, out of the clusters. */
  spread: MapGroup | null;
  /** A stack was tapped: it spreads while the selection names its listings. */
  open(group: MapGroup): void;
  /** Collapses any spread stack. */
  collapse(): void;
};

/**
 * The spread stack of the Leaflet view (WP-28 "Listings layer", SCR-011 "Differences between engines"): a tapped stack
 * spreads with `spreadStackLabels` and stays spread while the selection names its listings — a spread-pin tap or a
 * swipe of the card only moves the index — and collapses when a zoom starts (Leaflet's `zoomstart`, any zoom: a pinch,
 * a cluster tap, a fit, a locate), when the card closes or another pin is selected, and when the listings layer
 * collapses it before handling a cluster tap (LB-APP-013). GL keeps a spread stack open while zooming.
 */
export function useSpiderfy({ mapRef, generation }: LeafletHandle, groups: readonly MapGroup[], selection: Selection): Spiderfy {
  const [key, setKey] = useState<string | null>(null);
  const spread = useMemo(() => spreadOf(groups, selection, key), [groups, selection, key]);
  const open = useCallback((group: MapGroup) => setKey(group.key), []);
  const collapse = useCallback(() => setKey(null), []);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null) {
      return undefined;
    }
    const { map } = instance;
    map.on("zoomstart", collapse);
    return () => {
      map.off("zoomstart", collapse);
    };
  }, [mapRef, generation, collapse]);

  return useMemo(() => ({ spread, open, collapse }), [spread, open, collapse]);
}
