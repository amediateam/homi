"use client";

import type { Handler, Map as LMap, Point } from "leaflet";
import { useEffect, useMemo, useState } from "react";

import type { LassoHost } from "../lasso/LassoOverlay";
import { LASSO_RESYNC_MS } from "../lasso/polygon";
import type { LeafletHandle, LeafletInstance } from "./useLeafletMap";

/**
 * The lasso's hold on the Leaflet map (WP-28 "Lasso", SCR-012): the `LassoHost` of the Leaflet view, and the map's
 * own gestures off while drawing. Leaflet zoom is the app's scale, so no conversion is needed.
 */

/** The map's own gestures, off while the overlay draws: none may react around it either. */
const GESTURES = ["dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom", "boxZoom", "tapHold"] as const;

/** How Leaflet's own drag moves the map (`Map.Drag`): the pane only, with `move` and no `moveend`. */
type RawPan = { _rawPanBy(offset: Point): void };

/** A removed map has no panes. */
const live = (map: LMap) => map.getPane("mapPane") !== undefined;

/** Turns the enabled gestures off; the returned function turns them on again, unless the map was removed meanwhile. */
export function pauseGestures(map: LMap): () => void {
  const paused = GESTURES.map((name) => map[name]).filter((handler): handler is Handler => handler?.enabled() === true);
  for (const handler of paused) {
    handler.disable();
  }
  return () => {
    // A handler enabled on a removed map would listen on the container the next map reuses.
    if (!live(map)) {
      return;
    }
    for (const handler of paused) {
      handler.enable();
    }
  };
}

/** The operations of `LassoHost` on a given map, and the end of a pending move. */
export type LeafletLasso = {
  unproject(instance: LeafletInstance | null, x: number, y: number): readonly [lat: number, lon: number];
  panBy(instance: LeafletInstance | null, dx: number, dy: number): void;
  zoomAround(instance: LeafletInstance | null, x: number, y: number, scale: number): void;
  /** Ends a pending move at once: `moveend` now (on a live map), the pinch's partial step dropped. */
  settle(): void;
};

/**
 * The lasso's moves on a Leaflet map; without one, `unproject` gives `NaN` (`lassoToPolygon` then rejects the stroke)
 * and nothing moves. `unproject` is `containerPointToLatLng`. A pan moves the map as Leaflet's own drag does —
 * `movestart` once, the pane moved and `move` per frame — and `moveend` comes `LASSO_RESYNC_MS` after the last move,
 * so markercluster, the tiles and the in-map prefetch, which wait for `moveend`, re-sync once per gesture rather than
 * per frame. A pinch zooms in whole steps (WP-28 "Differences between engines"): its `log2(scale)` adds up, and when
 * the sum crosses ±1 the map steps its whole part around the point (`setZoomAround`, no animation, within its zoom
 * range), keeping the rest; the sum resets when the gesture settles.
 */
export function leafletLasso(): LeafletLasso {
  let moving: LMap | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pinch = 0;

  const settle = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pinch = 0;
    const map = moving;
    moving = null;
    if (map !== null && live(map)) {
      map.fire("moveend");
    }
  };

  const moved = (map: LMap) => {
    if (moving !== map) {
      settle();
      moving = map;
      map.fire("movestart");
    }
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(settle, LASSO_RESYNC_MS);
  };

  return {
    settle,
    unproject(instance, x, y) {
      if (instance === null) {
        return [Number.NaN, Number.NaN];
      }
      const { lat, lng } = instance.map.containerPointToLatLng([x, y]);
      return [lat, lng];
    },
    panBy(instance, dx, dy) {
      if (instance === null) {
        return;
      }
      const { map, L } = instance;
      moved(map);
      (map as LMap & RawPan)._rawPanBy(L.point(-dx, -dy));
      map.fire("move");
    },
    zoomAround(instance, x, y, scale) {
      if (instance === null || !(scale > 0)) {
        return;
      }
      const { map, L } = instance;
      moved(map);
      pinch += Math.log2(scale);
      const step = Math.trunc(pinch);
      if (step === 0) {
        return;
      }
      pinch -= step;
      const zoom = Math.min(Math.max(map.getZoom() + step, map.getMinZoom()), map.getMaxZoom());
      if (zoom !== map.getZoom()) {
        map.setZoomAround(L.point(x, y), zoom, { animate: false });
      }
    },
  };
}

/**
 * The Leaflet view's `LassoHost` while `drawing` and a map exists, else `null`; it reads the map when called. While
 * drawing, the map's own gestures are off; when drawing ends or the map goes, a pending move settles and the gestures
 * come back.
 */
export function useLassoHost({ mapRef, generation }: LeafletHandle, drawing: boolean): LassoHost | null {
  const [lasso] = useState(leafletLasso);
  const host = useMemo<LassoHost>(
    () => ({
      unproject: (x, y) => lasso.unproject(mapRef.current, x, y),
      panBy: (dx, dy) => lasso.panBy(mapRef.current, dx, dy),
      zoomAround: (x, y, scale) => lasso.zoomAround(mapRef.current, x, y, scale),
    }),
    [lasso, mapRef],
  );

  useEffect(() => {
    const instance = mapRef.current;
    if (!drawing || instance === null) {
      return undefined;
    }
    const resume = pauseGestures(instance.map);
    return () => {
      lasso.settle();
      resume();
    };
  }, [lasso, mapRef, generation, drawing]);

  return drawing && generation > 0 ? host : null;
}
