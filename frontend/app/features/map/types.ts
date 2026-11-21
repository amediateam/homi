import type { Locale } from "@homi/config";
import type { Polygon } from "@homi/search";
import type { components } from "@homi/types";

import type { Basemap } from "./tiles";

/**
 * The view contract both map engines implement (WP-27 for MapLibre GL, WP-28 for Leaflet): `MapScreen` owns the
 * search, the points, the grouping, the selection, the note and the card; a view only draws and reports gestures.
 * Coordinates are `[lat, lon]` and zooms are on the Leaflet scale everywhere here; the GL view converts
 * (`toGlZoom`, `camera.ts`).
 */

/** A point of `GET /listings/map` (WP-12): `label` is plain text, `usd` orders a stack, `priced: false` is a `nego` pin. */
export type MapPoint = components["schemas"]["MapPointResource"];

/** The tones a pin may carry (`MapPoint.TONES` of the backend); any other value draws a plain pin. */
export const PIN_TONES = ["good", "high", "check", "suspicious"] as const;
export type PinTone = (typeof PIN_TONES)[number];

/** One pin (one item) or one stack (several items at the same rounded coordinates), cheapest first. */
export type MapGroup = { key: string; lat: number; lon: number; items: MapPoint[] };

/** The listings of the open card, in track order, and the index the track shows. */
export type Selection = { numbers: number[]; at: number } | null;

export type MapFailReason = "webgl" | "chunk" | "style";

export type MapScheme = "light" | "dark";

export type LatLon = readonly [lat: number, lon: number];

/** The city's view from reference data, else Tashkent at zoom 12 (`camera.ts`; `MapViewProps.cityKnown` tells them apart). */
export type CityView = { center: LatLon; zoom: number };

export type MePosition = { lat: number; lon: number; accuracy: number | null };

export type MapViewProps = {
  groups: MapGroup[];
  /** Changes only with a new answer of `listings/map`: the camera refits then, and only then. */
  responseId: number;
  /**
   * The map's v1 query, the search the points belong to (`useMapPoints` `queryKey`): the key of the camera memory of
   * the launch (WP-37). A mount with the search the map was left at opens there and does not fit its first answer.
   */
  cameraKey: string;
  selection: Selection;
  /** A pin, a stack, a spread pin or a cluster at maximum zoom: the numbers to select and the index to show. */
  onSelect(numbers: number[], at?: number): void;
  /** A tap on the map itself, not on a marker. */
  onBackground(): void;
  polygon: Polygon | null;
  cityView: CityView;
  /**
   * `cityView` is the searched city's own view of reference data, not the Tashkent stand-in used until one is known
   * (WP-27 "Camera"): only a known view is saved as fit memory, and replacing the stand-in is not a city change.
   */
  cityKnown: boolean;
  /** `map.tiles_url` of `GET /reference`: `undefined` while reference data is absent, `null` or `""` in Wave 1. */
  tiles: string | null | undefined;
  locale: Locale;
  scheme: MapScheme;
  lite: boolean;
  me: MePosition | null;
  /** Lasso drawing (WP-28); always `false` until then. */
  drawing: boolean;
  onDrawn?(polygon: Polygon): void;
  onTooSmall?(): void;
  onFail(reason: MapFailReason): void;
  /** The basemap the view draws: the raster after a vector failure, so the attribution follows it. */
  onBasemap?(basemap: Basemap): void;
};
