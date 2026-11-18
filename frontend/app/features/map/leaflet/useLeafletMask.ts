"use client";

import type { Polygon } from "@homi/search";
import type { LatLngTuple } from "leaflet";
import { useEffect, useMemo } from "react";

import { maskGeometry, type Position } from "../mask";
import { paletteOf } from "../palette";
import type { MapScheme } from "../types";
import type { LeafletHandle } from "./useLeafletMap";

function latLngOf([lon, lat]: Position): LatLngTuple {
  return [lat, lon];
}

/**
 * The area mask on the Leaflet map (WP-28 "Leaflet view", SCR-011): `maskGeometry()` of WP-27 as one polygon — the
 * world rectangle with the area as its hole, filled with the palette's dimming (its colour carries the alpha) — and
 * the area's outline, 2 px with round joins, as GL's mask layers. Neither is a tap target, so a tap inside or outside
 * the area is a background tap. Both sit at the back of the overlay pane, under the "me" circles; the scheme
 * recolours them.
 */
export function useLeafletMask({ mapRef, generation }: LeafletHandle, polygon: Polygon | null, scheme: MapScheme): void {
  const geometry = useMemo(() => (polygon === null ? null : maskGeometry(polygon)), [polygon]);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null || geometry === null) {
      return undefined;
    }
    const { map, L } = instance;
    const colors = paletteOf(scheme).mask;
    const [mask, outline] = geometry.features;
    const fill = L.polygon(
      mask.geometry.coordinates.map((ring) => ring.map(latLngOf)),
      { stroke: false, fillColor: colors.fill, fillOpacity: 1, interactive: false },
    );
    const line = L.polyline(outline.geometry.coordinates.map(latLngOf), {
      color: colors.outline,
      weight: 2,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    });
    line.addTo(map).bringToBack();
    fill.addTo(map).bringToBack();
    return () => {
      fill.remove();
      line.remove();
    };
  }, [mapRef, generation, geometry, scheme]);
}
