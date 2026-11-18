"use client";

import type { LassoHost } from "../lasso/LassoOverlay";
import type { LeafletHandle } from "./useLeafletMap";

/** WP-28 skeleton: the Leaflet `LassoHost` of the map while drawing (filled in by the lasso build). */
export function useLassoHost(_handle: LeafletHandle, _drawing: boolean): LassoHost | null {
  return null;
}
