"use client";

import type { Path } from "leaflet";
import { useEffect, useRef } from "react";

import { LOCATE_MS, LOCATE_ZOOM } from "../camera";
import { paletteOf } from "../palette";
import type { MapScheme, MePosition } from "../types";
import { type LeafletHandle, reducedMotion } from "./useLeafletMap";

/** The dot's radius in CSS pixels (legacy `useMyLocation`). */
export const ME_DOT_RADIUS = 7;

/** The accuracy circle is drawn only for a position more precise than this, in metres (GL's `ACCURACY_CIRCLE_MAX_M`). */
export const ACCURACY_CIRCLE_MAX_M = 2000;

/**
 * The user's position on the Leaflet map (KV-FE-031, WP-28 "Leaflet view", locate): a circle marker of radius 7 in the
 * "me" colours of the palette and, when the accuracy is under 2 km, a circle of that radius in metres, both above the
 * area mask and never tap targets, so a tap on them is a background tap. Each new position object flies there in
 * 600 ms, to zoom 15 or the current zoom when it is closer, as GL's `useMeLayer`; the same object never flies twice,
 * also when the map is made again after an Activity re-show. The position stays in component state (TMA-035).
 */
export function useMyLocation({ mapRef, generation }: LeafletHandle, me: MePosition | null, scheme: MapScheme): void {
  const flown = useRef<MePosition | null>(null);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null || me === null) {
      return undefined;
    }
    const { map, L } = instance;
    const colors = paletteOf(scheme).me;
    const center: [number, number] = [me.lat, me.lon];
    const paths: Path[] = [];
    if (me.accuracy !== null && me.accuracy > 0 && me.accuracy < ACCURACY_CIRCLE_MAX_M) {
      paths.push(
        L.circle(center, {
          radius: me.accuracy,
          color: colors.accuracyOutline,
          weight: 1,
          fillColor: colors.accuracy,
          fillOpacity: 1,
          interactive: false,
        }),
      );
    }
    paths.push(
      L.circleMarker(center, {
        radius: ME_DOT_RADIUS,
        color: colors.ring,
        weight: 2.5,
        fillColor: colors.dot,
        fillOpacity: 1,
        interactive: false,
      }),
    );
    for (const path of paths) {
      path.addTo(map).bringToFront();
    }
    return () => {
      for (const path of paths) {
        path.remove();
      }
    };
  }, [mapRef, generation, me, scheme]);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null || me === null || flown.current === me) {
      return;
    }
    flown.current = me;
    const { map } = instance;
    const zoom = Math.max(map.getZoom(), LOCATE_ZOOM);
    if (reducedMotion()) {
      map.setView([me.lat, me.lon], zoom, { animate: false });
    } else {
      map.flyTo([me.lat, me.lon], zoom, { duration: LOCATE_MS / 1000 });
    }
  }, [mapRef, generation, me]);
}
