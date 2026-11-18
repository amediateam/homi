"use client";

import type { Polygon } from "@homi/search";

import type { MapScheme } from "../types";
import type { LeafletHandle } from "./useLeafletMap";

/** WP-28 skeleton: the area mask on the Leaflet map (filled in by the Leaflet build). */
export function useLeafletMask(_handle: LeafletHandle, _polygon: Polygon | null, _scheme: MapScheme): void {}
