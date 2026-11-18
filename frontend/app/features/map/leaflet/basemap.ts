import type { Locale } from "@homi/config";
import type { Layer, Map as LMap } from "leaflet";
import type { View } from "protomaps-leaflet";

import { currentNetwork, type NetworkProfile } from "@/features/feed/images";

import { paletteOf } from "../palette";
import { budgetFor, MAX_DATA_ZOOM, prefetchTilesFor, prefetchTileUrls, type TileFetcher, type TileId, tileUrl } from "../tilePrefetch";
import { isOsmUrl, OSM_TILE_URL } from "../tiles";
import type { CityView, MapScheme } from "../types";
import { basemapRules } from "./basemapRules";
import type { LeafletLibrary, LeafletModule } from "./library";

/**
 * The basemap layers of the Leaflet view (WP-28 "Basemap"): the OSM raster and the protomaps-leaflet vector layer, and
 * the in-map tile prefetch of a `{z}/{x}/{y}` template. `useDeferredBasemap` decides when and which.
 */

/** The OpenStreetMap raster tiles go up to zoom 19; the map itself stops at 18 (WP-28 "Leaflet view"). */
export const RASTER_MAX_ZOOM = 19;

/** The raster layer's container; map.css dims it in the dark scheme, as GL's raster paint does. */
export const RASTER_CLASS = "homi-raster";

/** Vector tiles never render above this pixel ratio; lite mode renders at 1 (GL's `pixelRatioOf`). */
const MAX_PIXEL_RATIO = 2;

function pixelRatioOf(lite: boolean): number {
  return lite ? 1 : Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

/**
 * The OSM raster layer of the Leaflet view: the same address as GL's raster (`OSM_TILE_URL`, no `{s}` subdomains, so
 * `CSP_TILE_HOSTS` names one host for both engines), and the tile images are requested with the origin as their
 * referrer, which the tile server asks for, whatever the page's policy is (Leaflet 1.9 `referrerPolicy`). No world
 * copies, as GL.
 */
export function rasterLayer(L: LeafletModule): Layer {
  return L.tileLayer(OSM_TILE_URL, {
    maxZoom: RASTER_MAX_ZOOM,
    referrerPolicy: "strict-origin-when-cross-origin",
    className: RASTER_CLASS,
    noWrap: true,
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Calls `onError` for every tile of the layer's sources that fails for another reason than an abort. protomaps-leaflet
 * 5.1.0 reports nothing itself: `renderTile` logs a rejected `View.getDisplayTile` with `console.error`, paints the
 * tile without that source and calls `done()`, so Leaflet sees a loaded tile and no `tileerror`. The views are the
 * layer's own `views` (`sourcesToViews`), wrapped once here. A template source never checks the HTTP status, so a
 * 404 counts only when its body does not parse as a vector tile.
 */
export function watchVectorErrors(layer: object, onError: () => void): void {
  const views = (layer as { views?: unknown }).views;
  if (!(views instanceof Map)) {
    return;
  }
  for (const view of (views as Map<string, View>).values()) {
    const getDisplayTile = view.getDisplayTile.bind(view);
    view.getDisplayTile = (tile) =>
      getDisplayTile(tile).catch((error: unknown) => {
        if (!isAbort(error)) {
          onError();
        }
        throw error;
      });
  }
}

export type VectorLayerInput = { url: string; scheme: MapScheme; lite: boolean; locale: Locale; onError(): void };

/**
 * The protomaps-leaflet layer of a `.pmtiles` file or a `{z}/{x}/{y}` template with the palette and label rules of
 * `basemapRules.ts`, data tiles up to zoom 15 (overzoomed above), each tile filled with the land colour first. The
 * attribution is `MapAttribution`'s, so the layer's own (an HTML string) is emptied. Made after `loadLeaflet()`: the
 * library reads the global `L.GridLayer` when a layer is made.
 */
export function vectorLayer({ protomaps }: Pick<LeafletLibrary, "protomaps">, input: VectorLayerInput): Layer {
  const { url, scheme, lite, locale, onError } = input;
  const palette = paletteOf(scheme);
  const layer = protomaps.leafletLayer({
    url,
    ...basemapRules(protomaps, palette, lite, locale),
    maxDataZoom: MAX_DATA_ZOOM,
    backgroundColor: palette.land,
    devicePixelRatio: pixelRatioOf(lite),
    noWrap: true,
    attribution: "",
  });
  watchVectorErrors(layer, onError);
  return layer as unknown as Layer;
}

/** One data tile of a view at `zoom`, in CSS pixels: protomaps reads 512-px data tiles one level below the display. */
function dataTilePx(zoom: number): number {
  const dataZoom = Math.max(0, Math.floor(Math.min(zoom - 1, MAX_DATA_ZOOM)));
  return 256 * 2 ** (zoom - dataZoom);
}

/**
 * The data tiles around a stopped view (WP-28, `03` §3.4): the ring one data tile wide outside the tiles the view
 * shows, which the layer fetches itself, nearest to the centre first (`prefetchTilesFor` of the list-view prefetch).
 */
export function ringTiles(view: CityView, viewport: { width: number; height: number }): TileId[] {
  const key = ({ z, x, y }: TileId) => `${z}/${x}/${y}`;
  const shown = new Set(prefetchTilesFor(view, viewport).map(key));
  const tile = dataTilePx(view.zoom);
  const around = { width: viewport.width + 2 * tile, height: viewport.height + 2 * tile };
  return prefetchTilesFor(view, around).filter((candidate) => !shown.has(key(candidate)));
}

export type MapPrefetchOptions = {
  /** `currentNetwork()` when not given; read at every stop. */
  network?: () => Pick<NetworkProfile, "saveData" | "effectiveType">;
  /** Tests inject one; the default is `fetch`. */
  fetcher?: TileFetcher;
};

/**
 * The in-map prefetch of a `{z}/{x}/{y}` template (WP-28 "Leaflet view", KV-FE-062 step 6): when attached and on
 * every `moveend`, the ring around the stopped view, at most `perStop` tiles not asked for in this launch, through
 * `prefetchTileUrls` of the list-view prefetch, whose tiles and bytes it shares: one at a time at low priority, until
 * the launch's bytes reach `sessionBytes` (`budgetFor`: nothing with Save-Data or on `2g` / `slow-2g`, less in lite
 * mode). A new stop aborts what is left of the previous one; a failed tile is skipped silently. OpenStreetMap's tiles
 * are never prefetched. Returns the function that stops it.
 */
export function attachTilePrefetch(map: LMap, template: string, lite: boolean, options: MapPrefetchOptions = {}): () => void {
  if (!template.includes("{z}/{x}/{y}") || isOsmUrl(template)) {
    return () => undefined;
  }
  const network = options.network ?? currentNetwork;
  let controller: AbortController | null = null;

  const onMoveEnd = () => {
    controller?.abort();
    controller = null;
    const budget = budgetFor(network(), lite);
    if (budget.perStop === 0) {
      return;
    }
    const center = map.getCenter();
    const size = map.getSize();
    const urls = ringTiles({ center: [center.lat, center.lng], zoom: Math.round(map.getZoom()) }, { width: size.x, height: size.y }).map(
      (tile) => tileUrl(template, tile),
    );
    controller = new AbortController();
    void prefetchTileUrls(urls, { sessionBytes: budget.sessionBytes, maxTiles: budget.perStop, signal: controller.signal, fetcher: options.fetcher });
  };

  map.on("moveend", onMoveEnd);
  // The layer is added once the camera has settled (`useDeferredBasemap`): the view it opens on is a stop too.
  onMoveEnd();
  return () => {
    map.off("moveend", onMoveEnd);
    controller?.abort();
  };
}
