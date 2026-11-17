"use client";

import type { Polygon } from "@homi/search";
import { useMemo } from "react";

import { type MaskGeometry, maskGeometry } from "../mask";

/**
 * The area mask of a polygon in the filters (WP-27 "Camera", SCR-011): the dimmed world with the polygon cut out and
 * its outline, as the GeoJSON `buildStyle` puts in the mask source; `null` without a polygon. Built once per polygon,
 * so the style only changes when the area does.
 */
export function useAreaMask(polygon: Polygon | null): MaskGeometry | null {
  return useMemo(() => (polygon === null ? null : maskGeometry(polygon)), [polygon]);
}
