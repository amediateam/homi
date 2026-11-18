import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CLUSTER_MS,
  CLUSTER_PADDING,
  cityViewOf,
  DEFAULT_CITY_VIEW,
  FIT_MAX_ZOOM,
  FIT_MS,
  FIT_PADDING,
  fitKey,
  fromGlZoom,
  GL_MAX_ZOOM,
  LOCATE_MS,
  LOCATE_ZOOM,
  polygonBounds,
  readFit,
  robustBounds,
  toGlZoom,
  writeFit,
} from "@/features/map/camera";
import type { LatLon } from "@/features/map/types";

import { cityOf } from "../helpers/reference";

const TASHKENT: LatLon = [41.3111, 69.2797];

/** `count` points spread over central Tashkent, the same every run. */
function cluster(count: number): { lat: number; lon: number }[] {
  return Array.from({ length: count }, (_, index) => ({ lat: 41.25 + ((index * 37) % 100) / 1000, lon: 69.2 + ((index * 53) % 150) / 1000 }));
}

const FAR_NORTH_EAST = { lat: 45.1, lon: 72.9 };
const FAR_SOUTH_WEST = { lat: 37.2, lon: 60.1 };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("zoom scale and camera constants (03 §3.4)", () => {
  it("converts between the Leaflet scale and MapLibre's", () => {
    expect(toGlZoom(12)).toBe(11);
    expect(toGlZoom(14.5)).toBe(13.5);
    expect(fromGlZoom(toGlZoom(15))).toBe(15);
  });

  it("keeps the legacy limits, paddings and timings", () => {
    expect(GL_MAX_ZOOM).toBe(17);
    expect(FIT_MAX_ZOOM).toBe(14);
    expect(LOCATE_ZOOM).toBe(15);
    expect(FIT_PADDING).toEqual({ top: 90, bottom: 90, left: 24, right: 24 });
    expect(CLUSTER_PADDING).toEqual({ top: 120, bottom: 130, left: 56, right: 56 });
    expect([FIT_MS, CLUSTER_MS, LOCATE_MS]).toEqual([500, 500, 600]);
  });
});

describe("cityViewOf", () => {
  it("is the city's centre and zoom of the reference data", () => {
    expect(cityViewOf(cityOf({ code: "samarkand", center: { lat: 39.6542, lon: 66.9597 }, zoom: 13 }))).toEqual({
      center: [39.6542, 66.9597],
      zoom: 13,
    });
  });

  it("is Tashkent at zoom 12 until a city is known", () => {
    expect(DEFAULT_CITY_VIEW).toEqual({ center: [41.3111, 69.2797], zoom: 12 });
    expect(cityViewOf(null)).toEqual(DEFAULT_CITY_VIEW);
    expect(cityViewOf(undefined)).toEqual(DEFAULT_CITY_VIEW);
  });
});

describe("robustBounds (SCR-011)", () => {
  it("is null without points and a box of no size for one point", () => {
    expect(robustBounds([])).toBeNull();
    expect(robustBounds([{ lat: 41.3, lon: 69.2 }])).toEqual({ south: 41.3, west: 69.2, north: 41.3, east: 69.2 });
  });

  it("below 20 points is the plain box, outliers included", () => {
    const points = [...cluster(17), FAR_NORTH_EAST, FAR_SOUTH_WEST];

    expect(points).toHaveLength(19);
    expect(robustBounds(points)).toEqual({ south: 37.2, west: 60.1, north: 45.1, east: 72.9 });
  });

  it("from 20 points drops the outermost point on each side of each axis", () => {
    const inner = cluster(18);
    const bounds = robustBounds([...inner, FAR_NORTH_EAST, FAR_SOUTH_WEST]);

    expect(bounds).toEqual({
      south: Math.min(...inner.map((p) => p.lat)),
      west: Math.min(...inner.map((p) => p.lon)),
      north: Math.max(...inner.map((p) => p.lat)),
      east: Math.max(...inner.map((p) => p.lon)),
    });
  });

  it("for 500 points is the 3 %–97 % box: far outliers on both sides are left out", () => {
    const inner = cluster(490);
    const outliers = [...Array.from({ length: 5 }, () => FAR_NORTH_EAST), ...Array.from({ length: 5 }, () => FAR_SOUTH_WEST)];
    const bounds = robustBounds([...outliers, ...inner]);

    expect(bounds).not.toBeNull();
    expect(bounds!.south).toBeGreaterThanOrEqual(41.25);
    expect(bounds!.north).toBeLessThanOrEqual(41.35);
    expect(bounds!.west).toBeGreaterThanOrEqual(69.2);
    expect(bounds!.east).toBeLessThanOrEqual(69.35);
  });

  it("takes the sorted values from ceil(0.03 · (n − 1)) to floor(0.97 · (n − 1)) per axis", () => {
    const points = Array.from({ length: 500 }, (_, index) => ({ lat: (index * 7) % 500, lon: -index }));

    expect(robustBounds(points)).toEqual({ south: 15, west: -484, north: 484, east: -15 });
  });
});

describe("polygonBounds", () => {
  it("is the box of the vertices", () => {
    expect(
      polygonBounds([
        [41.3, 69.2],
        [41.35, 69.31],
        [41.28, 69.25],
      ]),
    ).toEqual({ south: 41.28, west: 69.2, north: 41.35, east: 69.31 });
  });
});

describe("fit memory (03 §3.2 kv-map-fit)", () => {
  it("is keyed by the city's centre with 4 decimals", () => {
    expect(fitKey(TASHKENT)).toBe("homi-map-fit:41.3111,69.2797");
    expect(fitKey([41.31111, 69.27969])).toBe("homi-map-fit:41.3111,69.2797");
  });

  it("round-trips [lat, lon, zoom] with 4 decimals, for that city only", () => {
    writeFit(TASHKENT, { center: [41.312345, 69.281234], zoom: 13.456789 });

    expect(window.localStorage.getItem("homi-map-fit:41.3111,69.2797")).toBe("[41.3123,69.2812,13.4568]");
    expect(readFit(TASHKENT)).toEqual({ center: [41.3123, 69.2812], zoom: 13.4568 });
    expect(readFit([41.31111, 69.27969])).toEqual({ center: [41.3123, 69.2812], zoom: 13.4568 });
    expect(readFit([39.6542, 66.9597])).toBeNull();
  });

  it.each(["{not json", "[41.3,69.2]", '["41.3",69.2,12]', "[41.3,69.2,null]", '{"lat":41.3,"lon":69.2,"zoom":12}', "12"])(
    "ignores a corrupt value %s",
    (raw) => {
      window.localStorage.setItem(fitKey(TASHKENT), raw);

      expect(readFit(TASHKENT)).toBeNull();
    },
  );
});
