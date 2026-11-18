import { currentNetwork, type NetworkProfile } from "@/features/feed/images";

import { readFit } from "./camera";
import type { CityView } from "./types";

/**
 * Tile prefetch from the list view (`03` §3.4 "Tile prefetch budget", KV-FE-062): a few vector tiles of the view the
 * map will open on, fetched in the background within a per-session byte budget, so the first map frame comes from the
 * HTTP cache. Only for a `{z}/{x}/{y}` template: a `.pmtiles` address gets the code warm-up only, and OpenStreetMap's
 * raster tiles are never prefetched (its tile policy). `MapWarmup` calls it; failures are silent. Leaflet's in-map
 * prefetch (WP-28) fetches through `prefetchTileUrls` too, so both share the tiles asked for and the bytes of a launch.
 */

export type PrefetchBudget = {
  /** Tiles around a stopped view (Leaflet's in-map prefetch, WP-28; MapLibre fetches its own). */
  perStop: number;
  /** Tiles of one prefetch from the list view. */
  preloadTiles: number;
  /** Bytes of one prefetch from the list view. */
  preloadBytes: number;
  /** Bytes of all prefetches of this launch. */
  sessionBytes: number;
};

const KB = 1024;
const MB = 1024 * KB;

/** The legacy budgets (`03` §3.4): nothing with Save-Data or on `2g` / `slow-2g`; smaller in lite mode. */
export const PREFETCH_BUDGET = {
  off: { perStop: 0, preloadTiles: 0, preloadBytes: 0, sessionBytes: 0 },
  lite: { perStop: 2, preloadTiles: 3, preloadBytes: 300 * KB, sessionBytes: 1.5 * MB },
  full: { perStop: 4, preloadTiles: 6, preloadBytes: 600 * KB, sessionBytes: 4 * MB },
} as const satisfies Record<string, PrefetchBudget>;

const NO_PREFETCH_CONNECTIONS: ReadonlySet<string> = new Set(["slow-2g", "2g"]);

/** The budget for a network and graphics mode; `3g` is not slow here (unlike the photo rule of BR-APP-059). */
export function budgetFor(network: Pick<NetworkProfile, "saveData" | "effectiveType">, lite: boolean): PrefetchBudget {
  if (network.saveData || NO_PREFETCH_CONNECTIONS.has(network.effectiveType ?? "")) {
    return PREFETCH_BUDGET.off;
  }
  return lite ? PREFETCH_BUDGET.lite : PREFETCH_BUDGET.full;
}

/** Protomaps basemap tiles go no deeper (`MAX_DATA_ZOOM` of legacy). */
export const MAX_DATA_ZOOM = 15;

/** Vector tiles are 512 px on MapLibre's scale, which is one level below Leaflet's 256-px scale. */
const WORLD_TILE_PX = 256;

export type TileId = { z: number; x: number; y: number };

/** Web Mercator: longitude and latitude to the unit square, `y` growing southwards. */
function unitOf(lat: number, lon: number): { x: number; y: number } {
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return { x: (lon + 180) / 360, y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) };
}

/**
 * The tiles to prefetch for `view` (KV-FE-062 step 3): data zoom `min(fitZoom − 1, 15)` (Leaflet-scale `fitZoom`, 512-px
 * tiles, whole levels), the tiles under the rectangle that reaches half a screen from the view's centre in each
 * direction — the screen the map opens on — nearest to the centre first (ties: north before south, west before east).
 * No world copies: tiles outside the world are left out.
 */
export function prefetchTilesFor(view: CityView, viewport: { width: number; height: number }, fitZoom: number = view.zoom): TileId[] {
  const z = Math.max(0, Math.floor(Math.min(fitZoom - 1, MAX_DATA_ZOOM)));
  const tiles = 2 ** z;
  const worldPx = WORLD_TILE_PX * 2 ** fitZoom;
  const center = unitOf(view.center[0], view.center[1]);
  const halfX = Math.max(0, viewport.width) / 2 / worldPx;
  const halfY = Math.max(0, viewport.height) / 2 / worldPx;
  const clamp = (value: number) => Math.max(0, Math.min(tiles - 1, value));
  const minX = clamp(Math.floor((center.x - halfX) * tiles));
  const maxX = clamp(Math.floor((center.x + halfX) * tiles));
  const minY = clamp(Math.floor((center.y - halfY) * tiles));
  const maxY = clamp(Math.floor((center.y + halfY) * tiles));

  const result: (TileId & { distance: number })[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = ((x + 0.5) / tiles - center.x) ** 2 + ((y + 0.5) / tiles - center.y) ** 2;
      result.push({ z, x, y, distance });
    }
  }
  result.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return result.map(({ z: level, x, y }) => ({ z: level, x, y }));
}

const OSM_HOST = /(^|\.)openstreetmap\.org$/i;

/** A vector tile template of the reference data: `{z}/{x}/{y}` and not OpenStreetMap's raster host. */
function isPrefetchTemplate(template: string): boolean {
  if (!template.includes("{z}/{x}/{y}")) {
    return false;
  }
  try {
    return !OSM_HOST.test(new URL(template, typeof location === "undefined" ? undefined : location.href).hostname);
  } catch {
    return false;
  }
}

/** The address of one tile of a `{z}/{x}/{y}` template. */
export function tileUrl(template: string, tile: TileId): string {
  return template.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y));
}

export type TileFetcher = (url: string, init: RequestInit) => Promise<Response>;

export type PrefetchResult = { tiles: number; bytes: number };

export interface PrefetchUrlsOptions {
  /** The bytes of all prefetches of this launch (`PrefetchBudget.sessionBytes`). */
  sessionBytes: number;
  /** The bytes of this call; no cap of its own when not given. */
  maxBytes?: number;
  /** The tiles this call asks for, a skipped one not counted; all of them when not given. */
  maxTiles?: number;
  /** Aborts the pending tile and the rest. */
  signal?: AbortSignal;
  /** Tests inject one; the default is `fetch`. */
  fetcher?: TileFetcher;
}

/** The tiles asked for and the bytes fetched in this launch, by the list-view prefetch and the in-map one alike. */
const requested = new Set<string>();
let sessionBytes = 0;

/**
 * Fetches tiles into the HTTP cache within the budget of the launch that the list-view prefetch (`prefetchTiles`) and
 * Leaflet's in-map prefetch (`attachTilePrefetch`, WP-28) share: one at a time in order, at low priority; a tile
 * already asked for in this launch, by either, is skipped; the bytes of each response body count for the launch, and
 * the next tile is not asked for once the launch's bytes reach `sessionBytes`, this call's bytes reach `maxBytes` or
 * it asked for `maxTiles`, so the tile that crosses a byte cap is the last. A failed tile is forgotten, so a later
 * call asks for it again; an abort stops at once and forgets the pending tile. Resolves with what was fetched.
 */
export async function prefetchTileUrls(urls: readonly string[], options: PrefetchUrlsOptions): Promise<PrefetchResult> {
  const { signal, maxBytes = Infinity, maxTiles = Infinity } = options;
  const fetcher: TileFetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  const done: PrefetchResult = { tiles: 0, bytes: 0 };
  let asked = 0;
  let pending: string | null = null;
  // Forgets the pending tile at once on an abort (a new stop may ask for it again before the fetch rejects), and
  // only once: a later call may have asked for it meanwhile.
  const forget = () => {
    if (pending !== null) {
      requested.delete(pending);
      pending = null;
    }
  };
  signal?.addEventListener("abort", forget, { once: true });
  try {
    for (const url of urls) {
      if (signal?.aborted || asked >= maxTiles || done.bytes >= maxBytes || sessionBytes >= options.sessionBytes) {
        break;
      }
      if (requested.has(url)) {
        continue;
      }
      asked += 1;
      pending = url;
      requested.add(url);
      try {
        const response = await fetcher(url, { signal, priority: "low" });
        const bytes = (await response.arrayBuffer()).byteLength;
        done.tiles += 1;
        done.bytes += bytes;
        sessionBytes += bytes;
      } catch {
        forget();
      }
      pending = null;
    }
  } finally {
    signal?.removeEventListener("abort", forget);
  }
  return done;
}

export interface PrefetchOptions {
  /** `map.tiles_url` of the reference data; anything but a `{z}/{x}/{y}` template prefetches nothing. */
  template: string | null | undefined;
  /** The city's view of the reference data (`cityViewOf`); `null` skips. */
  city: CityView | null;
  /** The map's size in CSS pixels (the list view's size stands in for it). */
  viewport: { width: number; height: number };
  lite: boolean;
  /** `currentNetwork()` when not given. */
  network?: Pick<NetworkProfile, "saveData" | "effectiveType">;
  /** Aborts the pending tile and the rest (the list view unmounts). */
  signal?: AbortSignal;
  /** Tests inject one; the default is `fetch`. */
  fetcher?: TileFetcher;
}

const regions = new Set<string>();

/**
 * Prefetches the tiles of the view the map will open on for `city` (KV-FE-062): the saved fit (`readFit`) or else the
 * city's centre at `zoom − 1`; once per (template, city centre) per launch. The first `preloadTiles` of them, nearest
 * first, go through `prefetchTileUrls` within the bytes of this prefetch and of the launch (`budgetFor`), so a tile
 * the in-map prefetch already asked for is skipped and its bytes count here too. A failed tile is skipped silently.
 * An abort stops at once and forgets the region, so a later call fetches what is left. Resolves with what was fetched.
 */
export async function prefetchTiles(options: PrefetchOptions): Promise<PrefetchResult> {
  const { template, city, viewport, lite, signal } = options;
  if (!template || city === null || signal?.aborted || !isPrefetchTemplate(template)) {
    return { tiles: 0, bytes: 0 };
  }
  const budget = budgetFor(options.network ?? currentNetwork(), lite);
  const region = `${template}|${city.center[0].toFixed(4)},${city.center[1].toFixed(4)}`;
  if (budget.preloadTiles === 0 || regions.has(region) || sessionBytes >= budget.sessionBytes) {
    return { tiles: 0, bytes: 0 };
  }
  regions.add(region);

  const view = readFit(city.center) ?? { center: city.center, zoom: city.zoom - 1 };
  const urls = prefetchTilesFor(view, viewport)
    .slice(0, budget.preloadTiles)
    .map((tile) => tileUrl(template, tile));
  const forget = () => regions.delete(region);
  signal?.addEventListener("abort", forget, { once: true });
  try {
    return await prefetchTileUrls(urls, { sessionBytes: budget.sessionBytes, maxBytes: budget.preloadBytes, signal, fetcher: options.fetcher });
  } finally {
    signal?.removeEventListener("abort", forget);
  }
}

/** Forgets the regions, the requested tiles and the byte count of this launch, the in-map prefetch's included. */
export function resetPrefetchForTests(): void {
  requested.clear();
  regions.clear();
  sessionBytes = 0;
}
