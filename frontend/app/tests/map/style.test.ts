import { existsSync } from "node:fs";
import { join } from "node:path";

import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { FONT_FACES, FONT_MEDIUM, FONT_REGULAR, FONT_SEMIBOLD } from "@/features/map/gl/fonts";
import {
  ACCURACY_CIRCLE_MAX_M,
  BACKGROUND_LAYER,
  BASEMAP_SOURCE,
  buildStyle,
  labelField,
  MASK_FILL_LAYER,
  MASK_LINE_LAYER,
  MASK_SOURCE,
  ME_ACCURACY_LAYER,
  ME_DOT_LAYER,
  ME_SOURCE,
  OSM_LAYER,
  OSM_SOURCE,
  type StyleFeature,
  type StyleGeoJSON,
  type StyleInput,
} from "@/features/map/gl/style";
import { paletteOf } from "@/features/map/palette";
import { type Basemap, basemapOf, OSM_TILE_URL } from "@/features/map/tiles";

const PMTILES = "https://media.example.uz/tiles/uzbekistan.pmtiles";
const TEMPLATE = "https://tiles.example.uz/v4/{z}/{x}/{y}.mvt";

const BASEMAPS: Record<Basemap["kind"], Basemap> = {
  none: basemapOf(undefined),
  raster: basemapOf(null),
  pmtiles: basemapOf(PMTILES),
  template: basemapOf(TEMPLATE),
};

const MASK: StyleGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
          [
            [69.2, 41.3],
            [69.2, 41.4],
            [69.3, 41.4],
            [69.2, 41.3],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [69.2, 41.3],
          [69.2, 41.4],
          [69.3, 41.4],
          [69.2, 41.3],
        ],
      },
    },
  ],
};

const TASHKENT = { lat: 41.3111, lon: 69.2797 };

function style(overrides: Partial<StyleInput> = {}): StyleSpecification {
  return buildStyle({
    basemap: BASEMAPS.raster,
    scheme: "light",
    lite: false,
    locale: "ru",
    mask: null,
    me: null,
    ...overrides,
  });
}

function layer(built: StyleSpecification, id: string): LayerSpecification | undefined {
  return built.layers.find((candidate) => candidate.id === id);
}

function ids(built: StyleSpecification): string[] {
  return built.layers.map((candidate) => candidate.id);
}

function symbols(built: StyleSpecification) {
  return built.layers.flatMap((candidate) => (candidate.type === "symbol" ? [candidate] : []));
}

function textFonts(built: StyleSpecification): Set<string> {
  return new Set(symbols(built).flatMap((candidate) => candidate.layout?.["text-font"] as string[]));
}

/** Every combination the view can ask for. */
const ALL_INPUTS: StyleInput[] = Object.values(BASEMAPS).flatMap((basemap) =>
  (["light", "dark"] as const).flatMap((scheme) =>
    [false, true].flatMap((lite) =>
      (["ru", "uz", "en"] as const).flatMap((locale) =>
        [null, MASK].flatMap((mask) =>
          [null, { ...TASHKENT, accuracy: 30 }].map((me) => ({ basemap, scheme, lite, locale, mask, me })),
        ),
      ),
    ),
  ),
);

function meFeatures(built: StyleSpecification): readonly StyleFeature[] {
  const source = built.sources[ME_SOURCE];
  if (source?.type !== "geojson" || typeof source.data === "string") {
    throw new Error("no me source");
  }
  return (source.data as StyleGeoJSON).features;
}

describe("buildStyle sources per tiles value (WP-27 tiles table)", () => {
  it("absent tiles: the background alone", () => {
    const built = style({ basemap: BASEMAPS.none });
    expect(built.sources).toEqual({});
    expect(ids(built)).toEqual([BACKGROUND_LAYER]);
  });

  it("null or empty tiles: the OSM raster with 256-px tiles up to zoom 19", () => {
    for (const tiles of [null, ""]) {
      const built = style({ basemap: basemapOf(tiles) });
      expect(built.sources).toEqual({
        [OSM_SOURCE]: { type: "raster", tiles: [OSM_TILE_URL], tileSize: 256, maxzoom: 19 },
      });
      expect(ids(built)).toEqual([BACKGROUND_LAYER, OSM_LAYER]);
    }
  });

  it("a .pmtiles file: the vector source of the pmtiles:// scheme", () => {
    const built = style({ basemap: BASEMAPS.pmtiles });
    expect(built.sources).toEqual({ [BASEMAP_SOURCE]: { type: "vector", url: `pmtiles://${PMTILES}` } });
  });

  it("a template: the vector tiles of the template, overzoomed above the Protomaps zoom 15", () => {
    const built = style({ basemap: BASEMAPS.template });
    expect(built.sources).toEqual({ [BASEMAP_SOURCE]: { type: "vector", tiles: [TEMPLATE], maxzoom: 15 } });
  });

  it("a vector failure rebuilt on the raster keeps the mask and the position", () => {
    const me = { ...TASHKENT, accuracy: 40 };
    const vector = style({ basemap: BASEMAPS.pmtiles, mask: MASK, me });
    const raster = style({ basemap: BASEMAPS.raster, mask: MASK, me });

    expect(raster.sources[BASEMAP_SOURCE]).toBeUndefined();
    expect(raster.sources[OSM_SOURCE]).toBeDefined();
    expect(raster.sources[MASK_SOURCE]).toEqual(vector.sources[MASK_SOURCE]);
    expect(raster.sources[ME_SOURCE]).toEqual(vector.sources[ME_SOURCE]);
  });
});

describe("buildStyle invariants over every input", () => {
  it("every layer's source exists, vector layers name a source layer, ids are unique", () => {
    for (const input of ALL_INPUTS) {
      const built = buildStyle(input);
      const label = `${input.basemap.kind} ${input.scheme} lite=${input.lite} ${input.locale}`;
      expect(new Set(ids(built)).size, label).toBe(built.layers.length);
      for (const candidate of built.layers) {
        if (candidate.type === "background") {
          continue;
        }
        expect(built.sources[candidate.source], `${label}: ${candidate.id}`).toBeDefined();
        if (built.sources[candidate.source].type === "vector") {
          const sourceLayer = "source-layer" in candidate ? candidate["source-layer"] : undefined;
          expect(sourceLayer, `${label}: ${candidate.id}`).toEqual(expect.any(String));
        }
      }
    }
  });

  it("has no glyphs URL, and font-faces declares exactly the fonts its labels use", () => {
    for (const input of ALL_INPUTS) {
      const built = buildStyle(input);
      const label = `${input.basemap.kind} lite=${input.lite}`;
      expect(built, label).not.toHaveProperty("glyphs");
      const used = textFonts(built);
      expect(new Set(Object.keys(built["font-faces"] ?? {})), label).toEqual(used);
      for (const name of used) {
        expect(built["font-faces"]?.[name], `${label}: ${name}`).toEqual(FONT_FACES[name as keyof typeof FONT_FACES]);
      }
    }
  });

  it("the raster and the empty basemap draw no labels and declare no fonts", () => {
    for (const basemap of [BASEMAPS.none, BASEMAPS.raster]) {
      const built = style({ basemap });
      expect(symbols(built)).toEqual([]);
      expect(built).not.toHaveProperty("font-faces");
    }
  });

  it("is pure: equal inputs give equal styles", () => {
    const input: StyleInput = {
      basemap: BASEMAPS.template,
      scheme: "dark",
      lite: false,
      locale: "en",
      mask: MASK,
      me: { ...TASHKENT, accuracy: 120 },
    };
    expect(buildStyle(input)).toEqual(buildStyle({ ...input }));
  });
});

describe("buildStyle palette per scheme", () => {
  it("the two schemes differ, and the background is --bg2 of each", () => {
    expect(paletteOf("light")).not.toEqual(paletteOf("dark"));
    const background = (scheme: "light" | "dark") => layer(style({ scheme }), BACKGROUND_LAYER);
    expect(background("light")).toMatchObject({ paint: { "background-color": "#f2f2f7" } });
    expect(background("dark")).toMatchObject({ paint: { "background-color": "#151517" } });
  });

  it("vector labels take the scheme's text and halo colours", () => {
    for (const scheme of ["light", "dark"] as const) {
      const palette = paletteOf(scheme);
      const locality = layer(style({ basemap: BASEMAPS.pmtiles, scheme }), "places-locality");
      expect(locality, scheme).toMatchObject({
        paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
      });
    }
  });

  it("the raster is untouched in light and inverted with the hue kept in dark", () => {
    expect(layer(style({ scheme: "light" }), OSM_LAYER)).toMatchObject({
      paint: { "raster-brightness-min": 0, "raster-brightness-max": 1, "raster-hue-rotate": 0 },
    });
    const dark = layer(style({ scheme: "dark" }), OSM_LAYER);
    if (dark?.type !== "raster") {
      throw new Error("no raster layer");
    }
    expect(dark.paint?.["raster-brightness-min"] as number).toBeGreaterThan(dark.paint?.["raster-brightness-max"] as number);
    expect(dark.paint?.["raster-hue-rotate"]).toBe(180);
  });

  it("mask and position colours follow the scheme", () => {
    for (const scheme of ["light", "dark"] as const) {
      const palette = paletteOf(scheme);
      const built = style({ scheme, mask: MASK, me: { ...TASHKENT, accuracy: 50 } });
      expect(layer(built, MASK_FILL_LAYER), scheme).toMatchObject({ paint: { "fill-color": palette.mask.fill } });
      expect(layer(built, ME_DOT_LAYER), scheme).toMatchObject({ paint: { "circle-color": palette.me.dot } });
    }
  });
});

describe("buildStyle labels per locale", () => {
  it("ru and en read name:<locale> with the default name as fallback; uz reads name", () => {
    expect(labelField("ru")).toEqual(["coalesce", ["get", "name:ru"], ["get", "name"]]);
    expect(labelField("en")).toEqual(["coalesce", ["get", "name:en"], ["get", "name"]]);
    expect(labelField("uz")).toEqual(["get", "name"]);
  });

  it("every label layer of the vector style uses the field of the locale", () => {
    for (const locale of ["ru", "uz", "en"] as const) {
      for (const lite of [false, true]) {
        const labels = symbols(style({ basemap: BASEMAPS.template, locale, lite }));
        expect(labels.length, `${locale} lite=${lite}`).toBeGreaterThan(0);
        for (const candidate of labels) {
          expect(candidate.layout?.["text-field"], `${locale}: ${candidate.id}`).toEqual(labelField(locale));
        }
      }
    }
  });
});

describe("buildStyle lite mode", () => {
  it("the vector style has fewer layers, all of them also in the full style", () => {
    for (const basemap of [BASEMAPS.pmtiles, BASEMAPS.template]) {
      const full = ids(style({ basemap }));
      const lite = ids(style({ basemap, lite: true }));
      expect(lite.length).toBeLessThan(full.length);
      expect(full).toEqual(expect.arrayContaining(lite));
      expect(lite).toEqual(expect.arrayContaining(["earth", "water", "roads-major", "places-locality"]));
    }
  });

  it("lite labels use one weight, full labels all three", () => {
    expect(textFonts(style({ basemap: BASEMAPS.pmtiles }))).toEqual(new Set([FONT_REGULAR, FONT_MEDIUM, FONT_SEMIBOLD]));
    expect(textFonts(style({ basemap: BASEMAPS.pmtiles, lite: true }))).toEqual(new Set([FONT_SEMIBOLD]));
  });

  it("the raster style is the same in lite", () => {
    expect(style({ lite: true })).toEqual(style());
  });
});

describe("buildStyle mask and position", () => {
  it("the mask source and its two layers exist only with a polygon, above the basemap", () => {
    for (const basemap of Object.values(BASEMAPS)) {
      const without = style({ basemap });
      expect(without.sources[MASK_SOURCE], basemap.kind).toBeUndefined();
      expect(layer(without, MASK_FILL_LAYER), basemap.kind).toBeUndefined();

      const withMask = style({ basemap, mask: MASK });
      expect(withMask.sources[MASK_SOURCE], basemap.kind).toEqual({ type: "geojson", data: MASK });
      expect(ids(withMask).slice(-2), basemap.kind).toEqual([MASK_FILL_LAYER, MASK_LINE_LAYER]);
    }
  });

  it("the mask fill draws the cut-out polygon and the outline only the line", () => {
    const built = style({ mask: MASK });
    expect(layer(built, MASK_FILL_LAYER)).toMatchObject({ type: "fill", filter: ["==", ["geometry-type"], "Polygon"] });
    expect(layer(built, MASK_LINE_LAYER)).toMatchObject({ type: "line", filter: ["==", ["geometry-type"], "LineString"] });
  });

  it("the position source and its layers exist only with a position, on top of the mask", () => {
    expect(style().sources[ME_SOURCE]).toBeUndefined();
    expect(layer(style(), ME_DOT_LAYER)).toBeUndefined();

    const built = style({ mask: MASK, me: { ...TASHKENT, accuracy: null } });
    expect(ids(built).at(-1)).toBe(ME_DOT_LAYER);
    expect(ids(built).indexOf(ME_ACCURACY_LAYER)).toBeGreaterThan(ids(built).indexOf(MASK_LINE_LAYER));
    expect(meFeatures(built)).toEqual([
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [TASHKENT.lon, TASHKENT.lat] } },
    ]);
  });

  it("draws the accuracy circle only for an accuracy under 2000 m", () => {
    const polygons = (accuracy: number | null) =>
      meFeatures(style({ me: { ...TASHKENT, accuracy } })).filter((feature) => feature.geometry.type === "Polygon");

    expect(ACCURACY_CIRCLE_MAX_M).toBe(2000);
    expect(polygons(25)).toHaveLength(1);
    expect(polygons(1999)).toHaveLength(1);
    for (const accuracy of [2000, 5000, 0, null]) {
      expect(polygons(accuracy), String(accuracy)).toEqual([]);
    }
  });

  it("the circle is a closed counter-clockwise ring at the accuracy's distance from the position", () => {
    const accuracy = 500;
    const [circle] = meFeatures(style({ me: { ...TASHKENT, accuracy } })).filter(
      (feature) => feature.geometry.type === "Polygon",
    );
    if (circle.geometry.type !== "Polygon") {
      throw new Error("no circle");
    }
    const ring = circle.geometry.coordinates[0];
    expect(ring.at(-1)).toEqual(ring[0]);

    let doubledArea = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      doubledArea += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
    }
    expect(doubledArea).toBeGreaterThan(0);

    const metresPerDegree = 111_195;
    for (const [lon, lat] of ring) {
      const dx = (lon - TASHKENT.lon) * metresPerDegree * Math.cos((TASHKENT.lat * Math.PI) / 180);
      const dy = (lat - TASHKENT.lat) * metresPerDegree;
      expect(Math.hypot(dx, dy)).toBeCloseTo(accuracy, -1);
    }
  });
});

describe("FONT_FACES", () => {
  const publicDir = join(import.meta.dirname, "../../public");

  it("names the three weights, each with the four subsets in lookup order, from files that exist", () => {
    expect(Object.keys(FONT_FACES)).toEqual(["Noto Sans Regular", "Noto Sans Medium", "Noto Sans SemiBold"]);
    for (const [name, faces] of Object.entries(FONT_FACES)) {
      expect(faces.map((face) => face.url.replace(/-\d{3}\.woff2$/, "")), name).toEqual([
        "/map-fonts/noto-sans-latin",
        "/map-fonts/noto-sans-latin-ext",
        "/map-fonts/noto-sans-cyrillic",
        "/map-fonts/noto-sans-cyrillic-ext",
      ]);
      for (const face of faces) {
        expect(existsSync(`${publicDir}${face.url}`), face.url).toBe(true);
      }
    }
    expect(FONT_FACES[FONT_REGULAR][0].url).toBe("/map-fonts/noto-sans-latin-400.woff2");
    expect(FONT_FACES[FONT_MEDIUM][0].url).toBe("/map-fonts/noto-sans-latin-500.woff2");
    expect(FONT_FACES[FONT_SEMIBOLD][0].url).toBe("/map-fonts/noto-sans-latin-600.woff2");
  });

  it("gives one range per unicode-range element, covering the Uzbek apostrophes and Russian", () => {
    const ranges = Object.values(FONT_FACES).flatMap((faces) => faces.flatMap((face) => face["unicode-range"]));
    for (const range of ranges) {
      expect(range).toMatch(/^U\+[0-9A-F]{1,6}(-[0-9A-F]{1,6})?$/);
    }
    const covers = (codepoint: number) =>
      FONT_FACES[FONT_REGULAR].some((face) =>
        face["unicode-range"].some((range) => {
          const [from, to = from] = range.slice(2).split("-");
          return codepoint >= parseInt(from, 16) && codepoint <= parseInt(to, 16);
        }),
      );
    for (const char of ["ʻ", "ʼ", "Ж", "ё", "Ғ", "ҳ", "Қ", "Ў", "№", "€"]) {
      expect(covers(char.codePointAt(0)!), char).toBe(true);
    }
  });
});
