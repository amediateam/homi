"use client";

import { useEffect, useRef } from "react";

import { LOCATE_MS, LOCATE_ZOOM, toGlZoom } from "../camera";
import type { MePosition } from "../types";
import type { MapHandle } from "./useMapInstance";

/**
 * The user's position on the GL map (KV-FE-031, WP-27 "Actions", locate). The dot and the accuracy circle travel in
 * the style (`buildStyle`, `me`); this hook moves the camera: each new position object flies there in 600 ms, to
 * zoom 15 (Leaflet scale) or the current zoom when it is closer. The same object never flies twice, also when the
 * map is created again after an Activity re-show. The position stays in component state (TMA-035).
 */
export function useMeLayer({ mapRef, generation }: MapHandle, me: MePosition | null): void {
  const flown = useRef<MePosition | null>(null);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null || me === null || flown.current === me) {
      return;
    }
    flown.current = me;
    const { map } = instance;
    map.flyTo({ center: [me.lon, me.lat], zoom: Math.max(map.getZoom(), toGlZoom(LOCATE_ZOOM)), duration: LOCATE_MS });
  }, [mapRef, generation, me]);
}
