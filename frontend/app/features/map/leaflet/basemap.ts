import type { Layer } from "leaflet";

import { OSM_TILE_URL } from "../tiles";
import type { LeafletModule } from "./library";

/** The OpenStreetMap raster tiles go up to zoom 19; the map itself stops at 18 (WP-28 "Leaflet view"). */
export const RASTER_MAX_ZOOM = 19;

/**
 * The OSM raster layer of the Leaflet view: the same address as GL's raster (`OSM_TILE_URL`, no `{s}` subdomains, so
 * `CSP_TILE_HOSTS` names one host for both engines), and the tile images are requested with the origin as their
 * referrer, which the tile server asks for, whatever the page's policy is (Leaflet 1.9 `referrerPolicy`).
 */
export function rasterLayer(L: LeafletModule): Layer {
  return L.tileLayer(OSM_TILE_URL, {
    maxZoom: RASTER_MAX_ZOOM,
    referrerPolicy: "strict-origin-when-cross-origin",
  });
}
