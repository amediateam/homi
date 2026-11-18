"use client";

import type { Polygon } from "@homi/search";

/**
 * What the lasso overlay asks of the engine below it (WP-28 "Lasso"): screen point → `[lat, lon]`, a pan by pixels
 * and a zoom by a scale around a screen point. `gl/GlLasso.tsx` and `leaflet/lassoHandlers.ts` implement it.
 */
export type LassoHost = {
  unproject(x: number, y: number): readonly [lat: number, lon: number];
  panBy(dx: number, dy: number): void;
  zoomAround(x: number, y: number, scale: number): void;
};

export type LassoOverlayProps = {
  host: LassoHost;
  onDrawn(polygon: Polygon): void;
  onTooSmall(): void;
};

/** WP-28 skeleton: the overlay of SCR-012 (filled in by the lasso build). */
export function LassoOverlay(_props: LassoOverlayProps) {
  return null;
}
