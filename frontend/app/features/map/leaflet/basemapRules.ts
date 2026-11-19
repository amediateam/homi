import type { Locale } from "@homi/config";
import type { Feature, LabelRule, PaintRule } from "protomaps-leaflet";

import type { Palette } from "../palette";
import type { ProtomapsModule } from "./library";

/**
 * The paint and label rules of the Leaflet vector basemap (WP-28 "Basemap"): the layers of GL's `vectorLayers`
 * (`gl/style.ts`) for the Protomaps basemap schema v4, drawn by protomaps-leaflet on canvas tiles with the same
 * palette, the same lite reduction and labels in the interface locale. Zooms here are on the Leaflet scale, so every
 * GL zoom is one higher; a rule's `maxzoom` is inclusive (GL's is exclusive). Labels use the system sans-serif font
 * of the canvas (engine difference "Label font"). The library module is passed in: it is loaded with Leaflet.
 */

export type BasemapRules = { paintRules: PaintRule[]; labelRules: LabelRule[] };

const GREEN_LANDUSE: ReadonlySet<string> = new Set([
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
]);

/** GL's road ramp zooms (8, 11, 14, 17) on the Leaflet scale. */
const ROAD_ZOOMS = [9, 12, 15, 18] as const;
type RoadRamp = readonly [number, number, number, number];
const ROAD_WIDTHS = {
  highway: [0.8, 2, 5, 14],
  major_road: [0.4, 1.2, 4, 11],
  minor_road: [0, 0.4, 1.8, 7],
  path: [0, 0, 0.6, 2],
  rail: [0.3, 0.6, 1, 1.5],
} as const satisfies Record<string, RoadRamp>;
type RoadKind = keyof typeof ROAD_WIDTHS;

/** GL's `text-halo-width`; protomaps strokes text with twice this width, centred on the outline. */
const HALO_WIDTH = 1.25;

function kindOf(feature: Feature): string {
  const kind = feature.props.kind;
  return typeof kind === "string" ? kind : "";
}

function kindIn(...kinds: string[]): (zoom: number, feature: Feature) => boolean {
  const set = new Set(kinds);
  return (_zoom, feature) => set.has(kindOf(feature));
}

function numberProp(feature: Feature, name: string, fallback: number): number {
  const value = Number(feature.props[name]);
  return Number.isFinite(value) ? value : fallback;
}

/** A place is labelled from its own `min_zoom` up (GL's `PLACE_SHOWN`, whose zoom is one lower). */
function placeShown(zoom: number, feature: Feature): boolean {
  return numberProp(feature, "min_zoom", 0) <= zoom - 1;
}

/** The label fields of a locale: the tiles carry `name:ru` and `name:en` but no `name:uz` (GL's `labelField`). */
export function labelProps(locale: Locale): string[] {
  return locale === "uz" ? ["name"] : [`name:${locale}`, "name"];
}

/**
 * The rules for one palette, graphics mode and locale; lite keeps land, water, the three road classes, boundaries
 * and town names, as GL's lite style does.
 */
export function basemapRules(protomaps: ProtomapsModule, palette: Palette, lite: boolean, locale: Locale): BasemapRules {
  const { CenteredTextSymbolizer, GeomType, LineLabelSymbolizer, LineSymbolizer, PolygonSymbolizer, exp, linear } = protomaps;
  const unlessLite = <T>(rules: T[]): T[] => (lite ? [] : rules);
  const isPolygon = (_zoom: number, feature: Feature) => feature.geomType === GeomType.Polygon;
  const width = (ramp: RoadRamp) => exp(1.6, ROAD_ZOOMS.map((zoom, index) => [zoom, ramp[index]]));
  const road = (kind: RoadKind, color: string, minzoom: number): PaintRule => ({
    dataLayer: "roads",
    minzoom,
    filter: kindIn(kind),
    symbolizer: new LineSymbolizer({ color, width: width(ROAD_WIDTHS[kind]), lineCap: "round", lineJoin: "round" }),
  });
  // GL draws the casing in the road's gap; on canvas it is a line one pixel wider on each side, under the road.
  const casing = (kind: "highway" | "major_road"): PaintRule => {
    const roadWidth = width(ROAD_WIDTHS[kind]);
    return {
      dataLayer: "roads",
      minzoom: 11,
      filter: kindIn(kind),
      symbolizer: new LineSymbolizer({ color: palette.roads.casing, width: (zoom) => roadWidth(zoom) + 2, lineCap: "round", lineJoin: "round" }),
    };
  };
  const text = labelProps(locale);
  const halo = { stroke: palette.labelHalo, width: HALO_WIDTH };

  const paintRules: PaintRule[] = [
    { dataLayer: "earth", filter: isPolygon, symbolizer: new PolygonSymbolizer({ fill: palette.land }) },
    ...unlessLite<PaintRule>([
      {
        dataLayer: "landcover",
        maxzoom: 8,
        filter: kindIn("forest", "grassland", "scrub"),
        symbolizer: new PolygonSymbolizer({ fill: palette.green, opacity: linear([[6, 1], [8, 0]]) }),
      },
      {
        dataLayer: "landuse",
        filter: (_zoom, feature) => GREEN_LANDUSE.has(kindOf(feature)),
        symbolizer: new PolygonSymbolizer({ fill: palette.green, opacity: linear([[7, 0], [12, 1]]) }),
      },
    ]),
    { dataLayer: "water", filter: isPolygon, symbolizer: new PolygonSymbolizer({ fill: palette.water }) },
    ...unlessLite<PaintRule>([
      {
        dataLayer: "water",
        minzoom: 10,
        filter: (zoom, feature) => feature.geomType === GeomType.Line && kindIn("river", "canal", "stream")(zoom, feature),
        symbolizer: new LineSymbolizer({ color: palette.water, width: exp(1.6, [[10, 0.5], [18, 6]]), lineCap: "round", lineJoin: "round" }),
      },
      {
        dataLayer: "buildings",
        minzoom: 15,
        filter: kindIn("building", "building_part"),
        symbolizer: new PolygonSymbolizer({ fill: palette.buildings }),
      },
      casing("major_road"),
      casing("highway"),
      road("path", palette.roads.path, 15),
    ]),
    road("minor_road", palette.roads.minor, 12),
    road("major_road", palette.roads.major, 8),
    road("highway", palette.roads.highway, 6),
    ...unlessLite<PaintRule>([
      {
        dataLayer: "roads",
        minzoom: 12,
        filter: kindIn("rail"),
        symbolizer: new LineSymbolizer({ color: palette.roads.rail, width: width(ROAD_WIDTHS.rail), dash: [3, 3] }),
      },
    ]),
    {
      dataLayer: "boundaries",
      filter: (_zoom, feature) => numberProp(feature, "kind_detail", 99) <= 4,
      symbolizer: new LineSymbolizer({ color: palette.boundaries, width: 1, dash: [3, 2] }),
    },
  ];

  const labelRules: LabelRule[] = [
    ...unlessLite<LabelRule>([
      {
        dataLayer: "roads",
        minzoom: 14,
        filter: kindIn("highway", "major_road", "minor_road"),
        symbolizer: new LineLabelSymbolizer({ labelProps: text, fill: palette.labelMuted, font: "400 11px sans-serif", ...halo }),
      },
      {
        dataLayer: "places",
        minzoom: 12,
        filter: (zoom, feature) => kindIn("macrohood", "neighbourhood")(zoom, feature) && placeShown(zoom, feature),
        symbolizer: new CenteredTextSymbolizer({ labelProps: text, fill: palette.labelMuted, font: "500 12px sans-serif", ...halo }),
      },
    ]),
    {
      dataLayer: "places",
      filter: (zoom, feature) => kindOf(feature) === "locality" && placeShown(zoom, feature),
      sort: (a, b) => (Number(a.sort_key) || 0) - (Number(b.sort_key) || 0),
      symbolizer: new CenteredTextSymbolizer({
        labelProps: text,
        fill: palette.label,
        font: (zoom) => `600 ${Math.round(linear([[7, 11], [13, 14], [17, 16]])(zoom))}px sans-serif`,
        ...halo,
      }),
    },
    ...unlessLite<LabelRule>([
      {
        dataLayer: "places",
        maxzoom: 9,
        filter: kindIn("country", "region"),
        symbolizer: new CenteredTextSymbolizer({ labelProps: text, fill: palette.labelMuted, font: "500 12px sans-serif", ...halo }),
      },
    ]),
  ];

  return { paintRules, labelRules };
}
