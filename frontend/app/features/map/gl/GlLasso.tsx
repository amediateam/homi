"use client";

import type { Polygon } from "@homi/search";
import { useEffect, useMemo } from "react";

import { type LassoHost, LassoOverlay } from "../lasso/LassoOverlay";
import type { GlMap, MapHandle } from "./useMapInstance";

/**
 * The event data of the camera moves a two-finger gesture makes while drawing (`map.panBy` and `map.zoomTo` pass it
 * to their `move…` and `zoom…` events), so a listener can tell them from the user's own moves.
 */
export const LASSO_MOVE = { lasso: true } as const;

/** The map's own gestures, off while the overlay draws: none may react around it either. */
const GESTURES = ["dragPan", "touchZoomRotate", "scrollZoom", "doubleClickZoom", "boxZoom"] as const;

/** Turns the enabled gestures off; the returned function turns them on again. */
export function pauseGestures(map: GlMap): () => void {
  const paused = GESTURES.map((name) => map[name]).filter((handler) => handler.isEnabled());
  for (const handler of paused) {
    handler.disable();
  }
  return () => {
    for (const handler of paused) {
      handler.enable();
    }
  };
}

/** `LassoHost.unproject` on the map; `NaN` without one, which `lassoToPolygon` rejects. */
function unprojectOn(map: GlMap | undefined, x: number, y: number): readonly [lat: number, lon: number] {
  if (map === undefined) {
    return [Number.NaN, Number.NaN];
  }
  const { lat, lng } = map.unproject([x, y]);
  return [lat, lng];
}

/** `LassoHost.panBy`: MapLibre moves the view by its argument; the content follows the fingers at the opposite sign. */
function panOn(map: GlMap | undefined, dx: number, dy: number): void {
  map?.panBy([-dx, -dy], { animate: false }, LASSO_MOVE);
}

/** `LassoHost.zoomAround`: a fractional zoom by `log2(scale)` levels that keeps the point where it is. */
function zoomOn(map: GlMap | undefined, x: number, y: number, scale: number): void {
  if (map === undefined || !(scale > 0)) {
    return;
  }
  map.zoomTo(map.getZoom() + Math.log2(scale), { animate: false, around: map.unproject([x, y]) }, LASSO_MOVE);
}

export type GlLassoProps = {
  handle: MapHandle;
  onDrawn(polygon: Polygon): void;
  onTooSmall(): void;
};

/**
 * The lasso on the GL view while drawing (SCR-012): `LassoOverlay` over the current map, whose own gestures are off
 * meanwhile, so only the overlay's two-finger pan and pinch move it (fractional zoom, WP-28 "Differences between
 * engines"). Rendered by `MapViewGL` only while `drawing`; nothing until the first map exists.
 *
 * Marker re-sync: every camera call fires `moveend` at once (MapLibre's camera is read-only in its typings); the moves
 * carry `LASSO_MOVE`, so the marker layer (`useClusterMarkers`) re-syncs once, `LASSO_RESYNC_MS` after the last of
 * them, and a lasso zoom only records its whole level.
 */
export function GlLasso({ handle, onDrawn, onTooSmall }: GlLassoProps) {
  const { mapRef, generation } = handle;
  // Read the map when called: the overlay calls from its pointer handlers and its animation frames.
  const host = useMemo<LassoHost>(
    () => ({
      unproject: (x, y) => unprojectOn(mapRef.current?.map, x, y),
      panBy: (dx, dy) => panOn(mapRef.current?.map, dx, dy),
      zoomAround: (x, y, scale) => zoomOn(mapRef.current?.map, x, y, scale),
    }),
    [mapRef],
  );

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null) {
      return undefined;
    }
    // Also run after the view removed the map (its effects clean up first): enabling a handler only sets a flag.
    return pauseGestures(instance.map);
  }, [mapRef, generation]);

  return generation > 0 ? <LassoOverlay host={host} onDrawn={onDrawn} onTooSmall={onTooSmall} /> : null;
}
