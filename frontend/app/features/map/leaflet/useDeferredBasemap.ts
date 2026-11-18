"use client";

import type { Locale } from "@homi/config";
import { useEffect, useEffectEvent, useState } from "react";

import type { Basemap } from "../tiles";
import type { MapScheme } from "../types";
import { useBasemap } from "../useBasemap";
import { attachTilePrefetch, rasterLayer, vectorLayer } from "./basemap";
import type { LeafletHandle } from "./useLeafletMap";

/** The longest a new map waits for its first fit before the basemap is added (legacy `useDeferredBasemap`). */
export const BASEMAP_DELAY_MS = 1200;

export type DeferredBasemapInput = {
  tiles: string | null | undefined;
  scheme: MapScheme;
  lite: boolean;
  locale: Locale;
  /** The first fit of this map happened (`useLeafletCamera`). */
  fitted: boolean;
  onBasemap?(basemap: Basemap): void;
};

/**
 * The basemap of the Leaflet map (WP-28 "Basemap", SCR-011 "Differences between engines"): added after the map's
 * first fit or 1.2 s after the map was made, whichever comes first, so no tiles are fetched for a start view that
 * changes at once; until then the container shows the palette's land colour (`MapViewLeaflet`). `tiles` picks the
 * layer through the session's shared rule (`useBasemap`): absent → none, empty → the OSM raster, a `.pmtiles` file or
 * a template → the protomaps-leaflet vector layer, whose first failing tile moves the session to the raster and
 * reports `map_tiles_failed` once, shared with GL. The layer is made anew when the scheme, lite mode or locale
 * changes (canvas tiles keep their colours and labels); a template also prefetches around each stopped view. The
 * basemap drawn is reported through `onBasemap`, so the attribution follows it.
 */
export function useDeferredBasemap({ mapRef, generation }: LeafletHandle, input: DeferredBasemapInput): void {
  const { tiles, scheme, lite, locale, fitted, onBasemap } = input;
  const { basemap, failVector } = useBasemap(tiles);
  const [waited, setWaited] = useState(0);
  const ready = generation > 0 && (fitted || waited === generation);
  const vectorFailed = useEffectEvent(() => failVector());

  useEffect(() => {
    onBasemap?.(basemap);
  }, [basemap, onBasemap]);

  useEffect(() => {
    if (mapRef.current === null) {
      return undefined;
    }
    const timer = setTimeout(() => setWaited(generation), BASEMAP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mapRef, generation]);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null || !ready || basemap.kind === "none") {
      return undefined;
    }
    let live = true;
    const layer =
      basemap.kind === "raster"
        ? rasterLayer(instance.L)
        : vectorLayer(instance, {
            url: basemap.url,
            scheme,
            lite,
            locale,
            onError: () => {
              if (live) {
                vectorFailed();
              }
            },
          });
    layer.addTo(instance.map);
    const stopPrefetch = basemap.kind === "template" ? attachTilePrefetch(instance.map, basemap.url, lite) : null;
    return () => {
      live = false;
      stopPrefetch?.();
      layer.remove();
    };
  }, [mapRef, generation, ready, basemap, scheme, lite, locale]);
}
