import { describe, expect, it } from "vitest";

import {
  attributionOf,
  basemapOf,
  isOsmUrl,
  isTileTemplate,
  OSM_TILE_URL,
  osmTransformRequest,
} from "@/features/map/tiles";

const TEMPLATE = "https://tiles.example.uz/v4/{z}/{x}/{y}.mvt";
const PMTILES = "https://media.example.uz/tiles/uzbekistan.pmtiles";

describe("basemapOf (WP-27 tiles table)", () => {
  it("absent reference data draws the background only", () => {
    expect(basemapOf(undefined)).toEqual({ kind: "none" });
  });

  it("null, an empty or a blank string is the OSM raster of Wave 1", () => {
    for (const tiles of [null, "", "   "]) {
      expect(basemapOf(tiles), JSON.stringify(tiles)).toEqual({ kind: "raster" });
    }
  });

  it("a .pmtiles file is the vector source of the PMTiles protocol, also with a version query", () => {
    expect(basemapOf(PMTILES)).toEqual({ kind: "pmtiles", url: PMTILES });
    expect(basemapOf(`${PMTILES}?v=4`)).toEqual({ kind: "pmtiles", url: `${PMTILES}?v=4` });
    expect(basemapOf(" /tiles/uz.PMTiles ")).toEqual({ kind: "pmtiles", url: "/tiles/uz.PMTiles" });
  });

  it("a {z}/{x}/{y} address is a vector tile template", () => {
    expect(basemapOf(TEMPLATE)).toEqual({ kind: "template", url: TEMPLATE });
  });

  it("any other string falls back to the raster, so the map is never blank", () => {
    for (const tiles of ["https://tiles.example.uz/style.json", "https://tiles.example.uz/{z}/{y}/{x}.mvt", "pmtiles"]) {
      expect(basemapOf(tiles), tiles).toEqual({ kind: "raster" });
    }
  });
});

describe("attributionOf", () => {
  it("is none without a basemap, OSM on the raster and OSM · Protomaps on both vector kinds", () => {
    expect(attributionOf(basemapOf(undefined))).toBeNull();
    expect(attributionOf(basemapOf(null))).toBe("osm");
    expect(attributionOf(basemapOf(PMTILES))).toBe("osm-protomaps");
    expect(attributionOf(basemapOf(TEMPLATE))).toBe("osm-protomaps");
  });
});

describe("isTileTemplate", () => {
  it("needs {z}/{x}/{y}; a .pmtiles file, null and absent are not templates", () => {
    expect(isTileTemplate(TEMPLATE)).toBe(true);
    expect(isTileTemplate(PMTILES)).toBe(false);
    expect(isTileTemplate(null)).toBe(false);
    expect(isTileTemplate(undefined)).toBe(false);
    expect(isTileTemplate("")).toBe(false);
  });
});

describe("OSM requests (WP-27 \"Basemap and tiles\")", () => {
  it("the raster template is the public OSM tile server", () => {
    expect(OSM_TILE_URL).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(isOsmUrl(OSM_TILE_URL)).toBe(true);
  });

  it("a tile request of tile.openstreetmap.org carries the origin as referrer", () => {
    const url = "https://tile.openstreetmap.org/12/2861/1529.png";
    expect(osmTransformRequest(url)).toEqual({ url, referrerPolicy: "strict-origin-when-cross-origin" });
  });

  it("every other request is left alone, a look-alike host included", () => {
    for (const url of [
      "https://tiles.example.uz/v4/12/2861/1529.mvt",
      "https://tile.openstreetmap.org.example.uz/12/2861/1529.png",
      "http://tile.openstreetmap.org/12/2861/1529.png",
      "/map-fonts/noto-sans-latin-400.woff2",
    ]) {
      expect(isOsmUrl(url), url).toBe(false);
      expect(osmTransformRequest(url), url).toBeUndefined();
    }
  });
});
