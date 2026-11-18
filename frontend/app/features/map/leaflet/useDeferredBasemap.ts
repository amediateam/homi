"use client";

import type { Locale } from "@homi/config";
import { useEffect } from "react";

import type { Basemap } from "../tiles";
import type { MapScheme } from "../types";
import { rasterLayer } from "./basemap";
import type { LeafletHandle } from "./useLeafletMap";

export type DeferredBasemapInput = {
  tiles: string | null | undefined;
  scheme: MapScheme;
  lite: boolean;
  locale: Locale;
  /** The first fit of this map happened (`useLeafletCamera`). */
  fitted: boolean;
  onBasemap?(basemap: Basemap): void;
};

/** WP-28 skeleton: the raster at once; the deferred, vector and prefetch rules are filled in by the Leaflet build. */
export function useDeferredBasemap({ mapRef, generation }: LeafletHandle, { onBasemap }: DeferredBasemapInput): void {
  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null) {
      return undefined;
    }
    const layer = rasterLayer(instance.L).addTo(instance.map);
    onBasemap?.({ kind: "raster" });
    return () => {
      layer.remove();
    };
  }, [mapRef, generation, onBasemap]);
}
