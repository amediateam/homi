/**
 * The basemap a `tiles` value of reference data asks for (`map.tiles_url` of `GET /reference`, WP-11; `25` §3.8,
 * §3.10). Engine-free: the GL style (`gl/style.ts`) and the Leaflet view of WP-28 read the same answer.
 */

/** The public OpenStreetMap raster tiles: the Wave 1 basemap until KV-INF-021 hosts a file. Never prefetched. */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const OSM_ORIGIN = "https://tile.openstreetmap.org/";

export type Basemap =
  | { kind: "none" }
  | { kind: "raster" }
  | { kind: "pmtiles"; url: string }
  | { kind: "template"; url: string };

/** The attribution `MapAttribution` shows: «© OpenStreetMap», «© OpenStreetMap · Protomaps» or none. */
export type AttributionKind = "osm" | "osm-protomaps";

export function isOsmUrl(url: string): boolean {
  return url.startsWith(OSM_ORIGIN);
}

/**
 * The tile server asks for a referrer, so an OSM request carries the origin whatever the page policy is; every
 * other request is left alone. Shaped for MapLibre's `transformRequest`.
 */
export function osmTransformRequest(url: string): { url: string; referrerPolicy: ReferrerPolicy } | undefined {
  return isOsmUrl(url) ? { url, referrerPolicy: "strict-origin-when-cross-origin" } : undefined;
}

/** A vector tile template: the address names `{z}/{x}/{y}`. Only a template is prefetched (`tilePrefetch.ts`). */
export function isTileTemplate(tiles: string | null | undefined): tiles is string {
  return typeof tiles === "string" && tiles.includes("{z}/{x}/{y}");
}

/** A `.pmtiles` file, also with a query or a fragment (a version for the long cache). */
const PMTILES_FILE = /\.pmtiles(?:[?#].*)?$/i;

/**
 * The table of `tiles` values (WP-27 "Basemap and tiles"): absent (reference data did not load) draws the background
 * only; `null` or `""` (Wave 1) the OSM raster; a `.pmtiles` file or a `{z}/{x}/{y}` template the Protomaps vector
 * basemap. Any other string is not a basemap HOMI can read and falls back to the raster, so the map is never blank.
 */
export function basemapOf(tiles: string | null | undefined): Basemap {
  if (tiles === undefined) {
    return { kind: "none" };
  }
  const url = tiles?.trim() ?? "";
  if (url === "") {
    return { kind: "raster" };
  }
  if (PMTILES_FILE.test(url)) {
    return { kind: "pmtiles", url };
  }
  if (isTileTemplate(url)) {
    return { kind: "template", url };
  }
  return { kind: "raster" };
}

export function attributionOf(basemap: Basemap): AttributionKind | null {
  switch (basemap.kind) {
    case "none":
      return null;
    case "raster":
      return "osm";
    case "pmtiles":
    case "template":
      return "osm-protomaps";
  }
}
