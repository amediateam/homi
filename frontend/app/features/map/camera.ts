import type { Polygon } from "@homi/search";

import type { City } from "@/lib/reference/types";
import { storageGet, storageSet } from "@/lib/storage";

import type { CityView, LatLon } from "./types";

/**
 * The camera rules of the map (SCR-011, `03` §3.4 "Map"), shared by both engines. Zooms are on the Leaflet scale
 * (256-px tiles), as in the audit; the GL view converts with `toGlZoom` (MapLibre's 512-px world is one level lower).
 */

/** A Leaflet-scale zoom on MapLibre's scale. */
export function toGlZoom(zoom: number): number {
  return zoom - 1;
}

/** A MapLibre zoom on the Leaflet scale (what the fit memory stores). */
export function fromGlZoom(zoom: number): number {
  return zoom + 1;
}

/** The GL map's `maxZoom`, on MapLibre's scale (Leaflet 18); Supercluster's `maxZoom` is the same. */
export const GL_MAX_ZOOM = 17;

/** A fit to the points or the polygon never zooms in further than this. */
export const FIT_MAX_ZOOM = 14;

export type Padding = { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };

/** The fit on a new answer keeps the top bar and the bottom chrome clear. */
export const FIT_PADDING: Padding = { top: 90, bottom: 90, left: 24, right: 24 };

/** The ease to a tapped cluster's leaves. */
export const CLUSTER_PADDING: Padding = { top: 120, bottom: 130, left: 56, right: 56 };

/** A later fit (the first fit of a mount is not animated). */
export const FIT_MS = 500;

export const CLUSTER_MS = 500;

/** The fly to the user's position (KV-FE-031). */
export const LOCATE_MS = 600;

/** The fly to the user's position zooms to at least this. */
export const LOCATE_ZOOM = 15;

/** The view until a city view is known: Tashkent at zoom 12. */
export const DEFAULT_CITY_VIEW: CityView = { center: [41.3111, 69.2797], zoom: 12 };

/** The city's centre and zoom of the reference data; no city, or one without a usable centre, is Tashkent. */
export function cityViewOf(city: Pick<City, "center" | "zoom"> | null | undefined): CityView {
  if (!city?.center || !Number.isFinite(city.center.lat) || !Number.isFinite(city.center.lon)) {
    return DEFAULT_CITY_VIEW;
  }
  const zoom = Number.isFinite(city.zoom) ? city.zoom : DEFAULT_CITY_VIEW.zoom;
  return { center: [city.center.lat, city.center.lon], zoom };
}

export type Bounds = { south: number; west: number; north: number; east: number };

/** From this many points the fit box drops the outer 3 % on each side of each axis. */
export const ROBUST_MIN_POINTS = 20;

const LOW_QUANTILE = 0.03;
const HIGH_QUANTILE = 0.97;

function axisRange(values: number[]): [number, number] {
  values.sort((a, b) => a - b);
  const last = values.length - 1;
  if (values.length < ROBUST_MIN_POINTS) {
    return [values[0], values[last]];
  }
  return [values[Math.ceil(LOW_QUANTILE * last)], values[Math.floor(HIGH_QUANTILE * last)]];
}

/**
 * The box the camera fits on a new answer without a polygon (SCR-011): below 20 points the plain box of all points;
 * from 20 up, per axis, the sorted values from index `ceil(0.03 · (n − 1))` to `floor(0.97 · (n − 1))` — the 3 %–97 %
 * quantile box, rounded inwards, so 20 points drop the outermost one on each side and 500 drop fifteen. A single point
 * is a box of no size; no points is `null`.
 */
export function robustBounds(points: readonly { lat: number; lon: number }[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }
  const [south, north] = axisRange(points.map((point) => point.lat));
  const [west, east] = axisRange(points.map((point) => point.lon));
  return { south, west, north, east };
}

/** The box of a polygon's vertices (the fit when the filters have a polygon). */
export function polygonBounds(polygon: Polygon): Bounds {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const [lat, lon] of polygon) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lon);
    east = Math.max(east, lon);
  }
  return { south, west, north, east };
}

type FitKey = `homi-map-fit:${number},${number}`;

const FIT_DECIMALS = 4;

function round(value: number): number {
  return Number(value.toFixed(FIT_DECIMALS));
}

/** The storage key of a city's fit memory: its reference centre with 4 decimals (`03` §3.2 row `kv-map-fit`). */
export function fitKey(center: LatLon): FitKey {
  return `homi-map-fit:${center[0].toFixed(FIT_DECIMALS)},${center[1].toFixed(FIT_DECIMALS)}` as FitKey;
}

/**
 * The view saved after the first fit for the city whose reference centre is `center` (JSON `[lat, lon, zoom]`, Leaflet
 * scale); `null` when there is none or it is not three finite numbers (corrupt JSON is ignored). Local-only.
 */
export function readFit(center: LatLon): CityView | null {
  const raw = storageGet(fitKey(center));
  if (raw === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 3 || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return null;
  }
  const [lat, lon, zoom] = value as [number, number, number];
  return { center: [lat, lon], zoom };
}

/** Saves `view` (Leaflet scale) as the fit memory of the city whose reference centre is `center`, 4 decimals each. */
export function writeFit(center: LatLon, view: CityView): void {
  storageSet(fitKey(center), JSON.stringify([round(view.center[0]), round(view.center[1]), round(view.zoom)]));
}

/** The map engines, each with its own camera memory (`engine.ts` `Engine`). */
export type CameraEngine = "gl" | "leaflet";

/**
 * What one mounted view did with the camera memory of the launch (WP-37, BR-APP-111), shared by its instance hook
 * (which reads the memory for the first camera and writes it in its cleanup) and its camera hook (which skips the
 * first fit for the restored search). `restored`: the search whose remembered camera the current map opened at,
 * until its first answer; `placed`: the search the camera was last fitted or restored for. The cleanup saves the
 * camera only while `placed` is the search shown, so a search applied and left before it was fitted saves nothing,
 * neither under itself nor under the search before.
 */
export type CameraMemory = { restored: string | null; placed: string | null };

const cameras = new Map<CameraEngine, { queryKey: string; view: CityView }>();

/**
 * Remembers where `engine`'s map was left for the search `queryKey` (the map's v1 query: the filters with
 * `posted_days`, without the sort or the listings hidden in this launch). One per engine, in memory only: a reload
 * forgets it, and the fit memory per city (`readFit`) gives the first view again.
 */
export function rememberCamera(engine: CameraEngine, queryKey: string, view: CityView): void {
  cameras.set(engine, { queryKey, view: { center: [view.center[0], view.center[1]], zoom: view.zoom } });
}

/** The camera `engine`'s map was left at for the same search, else `null`. */
export function recallCamera(engine: CameraEngine, queryKey: string): CityView | null {
  const remembered = cameras.get(engine);
  return remembered !== undefined && remembered.queryKey === queryKey ? remembered.view : null;
}

/** Tests only. */
export function forgetCameras(): void {
  cameras.clear();
}
