import type { Locale } from "@homi/config";
import type { ExpressionSpecification, LayerSpecification, SourceSpecification, StyleSpecification } from "maplibre-gl";

import { type Palette, paletteOf } from "../palette";
import { type Basemap, OSM_TILE_URL } from "../tiles";
import type { MapScheme, MePosition } from "../types";
import { FONT_FACES, FONT_MEDIUM, FONT_REGULAR, FONT_SEMIBOLD } from "./fonts";

/**
 * The MapLibre style of the GL view (WP-27 "Basemap and tiles"), built whole for every change: scheme, lite mode,
 * locale, `tiles`, the polygon's mask and the "me" position. `setStyle(buildStyle(…), { diff: true })` diffs against
 * the live style, GeoJSON data included, so the mask and "me" data travel in the style. Coordinates are
 * `[lon, lat]` and zooms on the GL scale here. The vector layers are written by hand for the Protomaps basemap
 * schema v4 (DEC-49); its tiles end at zoom 15 and are overzoomed above.
 */

export const BACKGROUND_LAYER = "background";
export const OSM_SOURCE = "osm";
export const OSM_LAYER = "osm";
/** The vector source; a source error names it (`sourceId`), and the view falls back to the raster. */
export const BASEMAP_SOURCE = "basemap";
export const MASK_SOURCE = "mask";
export const MASK_FILL_LAYER = "mask-fill";
export const MASK_LINE_LAYER = "mask-line";
export const ME_SOURCE = "me";
export const ME_ACCURACY_LAYER = "me-accuracy";
export const ME_ACCURACY_LINE_LAYER = "me-accuracy-line";
export const ME_DOT_LAYER = "me-dot";

/** The accuracy circle is drawn only for a position more precise than this, in metres (KV-FE-031). */
export const ACCURACY_CIRCLE_MAX_M = 2000;

const OSM_MAX_ZOOM = 19;
const PROTOMAPS_MAX_ZOOM = 15;
const EARTH_RADIUS_M = 6_371_008.8;
const CIRCLE_STEPS = 64;

type Position = readonly number[];

/** The geometries the inline sources carry, in `[lon, lat]`; read-only so a frozen collection fits too. */
export type StyleGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: readonly Position[] }
  | { type: "Polygon"; coordinates: readonly (readonly Position[])[] };

export type StyleFeature = {
  type: "Feature";
  geometry: StyleGeometry;
  properties?: Readonly<Record<string, unknown>> | null;
  id?: string | number;
};

/**
 * Inline GeoJSON of a `geojson` source: the mask of `maskGeometry()` (`mask.ts`). MapLibre's own `data` type names
 * `@types/geojson`, which the app does not resolve, so this structural shape types it instead.
 */
export type StyleGeoJSON = { type: "FeatureCollection"; features: readonly StyleFeature[] };

export type StyleInput = {
  basemap: Basemap;
  scheme: MapScheme;
  lite: boolean;
  locale: Locale;
  mask: StyleGeoJSON | null;
  me: MePosition | null;
};

/**
 * The label text of the interface locale with the default name as fallback. The Protomaps tiles carry `name:ru` and
 * `name:en` but no `name:uz`, so Uzbek reads `name` alone.
 */
export function labelField(locale: Locale): ExpressionSpecification {
  return locale === "uz" ? ["get", "name"] : ["coalesce", ["get", `name:${locale}`], ["get", "name"]];
}

const IS_POLYGON: ExpressionSpecification = ["==", ["geometry-type"], "Polygon"];
const IS_LINE: ExpressionSpecification = ["==", ["geometry-type"], "LineString"];
const IS_POINT: ExpressionSpecification = ["==", ["geometry-type"], "Point"];

function kindIn(...kinds: string[]): ExpressionSpecification {
  return ["in", ["get", "kind"], ["literal", kinds]];
}

/** A place is labelled from its own `min_zoom` up (Protomaps `places`). */
const PLACE_SHOWN: ExpressionSpecification = ["<=", ["coalesce", ["get", "min_zoom"], 0], ["zoom"]];

const GREEN_LANDUSE = [
  "park",
  "garden",
  "forest",
  "wood",
  "nature_reserve",
  "protected_area",
  "national_park",
  "golf_course",
  "grass",
  "grassland",
  "scrub",
  "cemetery",
  "village_green",
  "allotments",
  "playground",
];

const ROAD_ZOOMS = [8, 11, 14, 17] as const;
type RoadRamp = readonly [number, number, number, number];
const ROAD_WIDTHS = {
  highway: [0.8, 2, 5, 14],
  major_road: [0.4, 1.2, 4, 11],
  minor_road: [0, 0.4, 1.8, 7],
  path: [0, 0, 0.6, 2],
  rail: [0.3, 0.6, 1, 1.5],
} as const satisfies Record<string, RoadRamp>;
type RoadKind = keyof typeof ROAD_WIDTHS;

function widthOf(widths: RoadRamp): ExpressionSpecification {
  return ["interpolate", ["exponential", 1.6], ["zoom"], ...ROAD_ZOOMS.flatMap((zoom, index) => [zoom, widths[index]])];
}

/** The casing sits in the gap of the road it outlines, for the two classes that have one. */
function casingGap(): ExpressionSpecification {
  const stops = ROAD_ZOOMS.flatMap((zoom, index): (number | ExpressionSpecification)[] => [
    zoom,
    ["match", ["get", "kind"], "highway", ROAD_WIDTHS.highway[index], ROAD_WIDTHS.major_road[index]],
  ]);
  return ["interpolate", ["exponential", 1.6], ["zoom"], ...stops];
}

const ROUND = { "line-cap": "round", "line-join": "round" } as const;

function road(id: string, kind: RoadKind, color: string, minzoom: number): LayerSpecification {
  return {
    id,
    type: "line",
    source: BASEMAP_SOURCE,
    "source-layer": "roads",
    minzoom,
    filter: ["==", ["get", "kind"], kind],
    layout: ROUND,
    paint: { "line-color": color, "line-width": widthOf(ROAD_WIDTHS[kind]) },
  };
}

function unlessLite(lite: boolean, layers: LayerSpecification[]): LayerSpecification[] {
  return lite ? [] : layers;
}

/** The Protomaps v4 layers; lite keeps land, water, the three road classes, boundaries and town names. */
function vectorLayers(palette: Palette, lite: boolean, locale: Locale): LayerSpecification[] {
  const source = BASEMAP_SOURCE;
  const text = labelField(locale);
  const halo = { "text-halo-color": palette.labelHalo, "text-halo-width": 1.25, "text-halo-blur": 0.5 };
  return [
    {
      id: "earth",
      type: "fill",
      source,
      "source-layer": "earth",
      filter: IS_POLYGON,
      paint: { "fill-color": palette.land },
    },
    ...unlessLite(lite, [
      {
        id: "landcover",
        type: "fill",
        source,
        "source-layer": "landcover",
        maxzoom: 8,
        filter: kindIn("forest", "grassland", "scrub"),
        paint: { "fill-color": palette.green, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 1, 7, 0] },
      },
      {
        id: "landuse-green",
        type: "fill",
        source,
        "source-layer": "landuse",
        filter: kindIn(...GREEN_LANDUSE),
        paint: { "fill-color": palette.green, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 11, 1] },
      },
    ]),
    {
      id: "water",
      type: "fill",
      source,
      "source-layer": "water",
      filter: IS_POLYGON,
      paint: { "fill-color": palette.water },
    },
    ...unlessLite(lite, [
      {
        id: "water-line",
        type: "line",
        source,
        "source-layer": "water",
        minzoom: 9,
        filter: ["all", IS_LINE, kindIn("river", "canal", "stream")],
        layout: ROUND,
        paint: {
          "line-color": palette.water,
          "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 9, 0.5, 17, 6],
        },
      },
      {
        id: "buildings",
        type: "fill",
        source,
        "source-layer": "buildings",
        minzoom: 14,
        filter: kindIn("building", "building_part"),
        paint: { "fill-color": palette.buildings },
      },
      {
        id: "roads-casing",
        type: "line",
        source,
        "source-layer": "roads",
        minzoom: 10,
        filter: kindIn("highway", "major_road"),
        layout: ROUND,
        paint: { "line-color": palette.roads.casing, "line-width": 1, "line-gap-width": casingGap() },
      },
      road("roads-path", "path", palette.roads.path, 14),
    ]),
    road("roads-minor", "minor_road", palette.roads.minor, 11),
    road("roads-major", "major_road", palette.roads.major, 7),
    road("roads-highway", "highway", palette.roads.highway, 5),
    ...unlessLite(lite, [
      {
        id: "roads-rail",
        type: "line",
        source,
        "source-layer": "roads",
        minzoom: 11,
        filter: ["==", ["get", "kind"], "rail"],
        paint: { "line-color": palette.roads.rail, "line-width": widthOf(ROAD_WIDTHS.rail), "line-dasharray": [3, 3] },
      },
    ]),
    {
      id: "boundaries",
      type: "line",
      source,
      "source-layer": "boundaries",
      filter: ["<=", ["to-number", ["get", "kind_detail"], 99], 4],
      paint: { "line-color": palette.boundaries, "line-width": 1, "line-dasharray": [3, 2] },
    },
    ...unlessLite(lite, [
      {
        id: "roads-label",
        type: "symbol",
        source,
        "source-layer": "roads",
        minzoom: 13,
        filter: kindIn("highway", "major_road", "minor_road"),
        layout: { "symbol-placement": "line", "text-field": text, "text-font": [FONT_REGULAR], "text-size": 11 },
        paint: { "text-color": palette.labelMuted, ...halo },
      },
      {
        id: "places-neighbourhood",
        type: "symbol",
        source,
        "source-layer": "places",
        minzoom: 11,
        filter: ["all", kindIn("macrohood", "neighbourhood"), PLACE_SHOWN],
        layout: { "text-field": text, "text-font": [FONT_MEDIUM], "text-size": 12, "text-max-width": 7 },
        paint: { "text-color": palette.labelMuted, ...halo },
      },
    ]),
    {
      id: "places-locality",
      type: "symbol",
      source,
      "source-layer": "places",
      filter: ["all", ["==", ["get", "kind"], "locality"], PLACE_SHOWN],
      layout: {
        "text-field": text,
        "text-font": [FONT_SEMIBOLD],
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 11, 12, 14, 16, 16],
        "text-max-width": 8,
        "symbol-sort-key": ["coalesce", ["get", "sort_key"], 0],
      },
      paint: { "text-color": palette.label, ...halo },
    },
    ...unlessLite(lite, [
      {
        id: "places-region",
        type: "symbol",
        source,
        "source-layer": "places",
        maxzoom: 9,
        filter: kindIn("country", "region"),
        layout: { "text-field": text, "text-font": [FONT_MEDIUM], "text-size": 12, "text-max-width": 8 },
        paint: { "text-color": palette.labelMuted, ...halo },
      },
    ]),
  ];
}

function osmLayer(palette: Palette): LayerSpecification {
  const { brightnessMin, brightnessMax, saturation, contrast, hueRotate } = palette.raster;
  return {
    id: OSM_LAYER,
    type: "raster",
    source: OSM_SOURCE,
    paint: {
      "raster-brightness-min": brightnessMin,
      "raster-brightness-max": brightnessMax,
      "raster-saturation": saturation,
      "raster-contrast": contrast,
      "raster-hue-rotate": hueRotate,
    },
  };
}

function basemapSource(basemap: Basemap): Record<string, SourceSpecification> {
  switch (basemap.kind) {
    case "none":
      return {};
    case "raster":
      return { [OSM_SOURCE]: { type: "raster", tiles: [OSM_TILE_URL], tileSize: 256, maxzoom: OSM_MAX_ZOOM } };
    case "pmtiles":
      // The file's header gives the zoom range; `loadMapLibre()` registers the scheme.
      return { [BASEMAP_SOURCE]: { type: "vector", url: `pmtiles://${basemap.url}` } };
    case "template":
      return { [BASEMAP_SOURCE]: { type: "vector", tiles: [basemap.url], maxzoom: PROTOMAPS_MAX_ZOOM } };
  }
}

function basemapLayers(basemap: Basemap, palette: Palette, lite: boolean, locale: Locale): LayerSpecification[] {
  switch (basemap.kind) {
    case "none":
      return [];
    case "raster":
      return [osmLayer(palette)];
    case "pmtiles":
    case "template":
      return vectorLayers(palette, lite, locale);
  }
}

/** A circle of `radius` metres around the position, counter-clockwise in `[lon, lat]` (RFC 7946), closed. */
function circleRing(lat: number, lon: number, radius: number): [number, number][] {
  const degrees = (radius / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonScale = 1 / Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let step = 0; step < CIRCLE_STEPS; step += 1) {
    const angle = (2 * Math.PI * step) / CIRCLE_STEPS;
    ring.push([lon + degrees * lonScale * Math.cos(angle), lat + degrees * Math.sin(angle)]);
  }
  ring.push(ring[0]);
  return ring;
}

function meData(me: MePosition): StyleGeoJSON {
  const features: StyleFeature[] = [];
  if (me.accuracy !== null && me.accuracy > 0 && me.accuracy < ACCURACY_CIRCLE_MAX_M) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [circleRing(me.lat, me.lon, me.accuracy)] },
    });
  }
  features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [me.lon, me.lat] } });
  return { type: "FeatureCollection", features };
}

function maskLayers(palette: Palette): LayerSpecification[] {
  return [
    {
      id: MASK_FILL_LAYER,
      type: "fill",
      source: MASK_SOURCE,
      filter: IS_POLYGON,
      paint: { "fill-color": palette.mask.fill },
    },
    {
      id: MASK_LINE_LAYER,
      type: "line",
      source: MASK_SOURCE,
      filter: IS_LINE,
      layout: ROUND,
      paint: { "line-color": palette.mask.outline, "line-width": 2 },
    },
  ];
}

function meLayers(palette: Palette): LayerSpecification[] {
  return [
    {
      id: ME_ACCURACY_LAYER,
      type: "fill",
      source: ME_SOURCE,
      filter: IS_POLYGON,
      paint: { "fill-color": palette.me.accuracy },
    },
    {
      id: ME_ACCURACY_LINE_LAYER,
      type: "line",
      source: ME_SOURCE,
      filter: IS_POLYGON,
      paint: { "line-color": palette.me.accuracyOutline, "line-width": 1 },
    },
    {
      id: ME_DOT_LAYER,
      type: "circle",
      source: ME_SOURCE,
      filter: IS_POINT,
      paint: {
        "circle-radius": 6,
        "circle-color": palette.me.dot,
        "circle-stroke-color": palette.me.ring,
        "circle-stroke-width": 2.5,
      },
    },
  ];
}

/** The names of `FONT_FACES` the symbol layers use; `font-faces` declares exactly these. */
function fontsUsed(layers: LayerSpecification[]): Set<string> {
  const used = new Set<string>();
  for (const layer of layers) {
    const fonts = layer.type === "symbol" ? layer.layout?.["text-font"] : undefined;
    if (Array.isArray(fonts)) {
      for (const name of fonts) {
        if (typeof name === "string" && Object.prototype.hasOwnProperty.call(FONT_FACES, name)) {
          used.add(name);
        }
      }
    }
  }
  return used;
}

/**
 * The whole style for one state of the view. Raster: background, the OSM raster, mask, "me". Vector (`.pmtiles` or a
 * template): background, the Protomaps layers (fewer in lite), mask, "me", and the `font-faces` its labels use. None
 * (reference data absent): background, mask, "me". Pure: equal inputs give equal styles.
 */
export function buildStyle({ basemap, scheme, lite, locale, mask, me }: StyleInput): StyleSpecification {
  const palette = paletteOf(scheme);
  const sources: Record<string, SourceSpecification> = { ...basemapSource(basemap) };
  const layers: LayerSpecification[] = [
    { id: BACKGROUND_LAYER, type: "background", paint: { "background-color": palette.background } },
    ...basemapLayers(basemap, palette, lite, locale),
  ];
  if (mask !== null) {
    sources[MASK_SOURCE] = { type: "geojson", data: mask };
    layers.push(...maskLayers(palette));
  }
  if (me !== null) {
    sources[ME_SOURCE] = { type: "geojson", data: meData(me) };
    layers.push(...meLayers(palette));
  }
  const style: StyleSpecification = { version: 8, sources, layers };
  const fonts = fontsUsed(layers);
  if (fonts.size > 0) {
    style["font-faces"] = Object.fromEntries(Object.entries(FONT_FACES).filter(([name]) => fonts.has(name)));
  }
  return style;
}
