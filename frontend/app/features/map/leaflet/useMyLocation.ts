"use client";

import type { MePosition } from "../types";
import type { LeafletHandle } from "./useLeafletMap";

/** WP-28 skeleton: the user's dot and accuracy circle on the Leaflet map (filled in by the Leaflet build). */
export function useMyLocation(_handle: LeafletHandle, _me: MePosition | null): void {}
