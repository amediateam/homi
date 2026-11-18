import { describe, expect, it } from "vitest";

import {
  circleRing,
  DEFAULT_SPOT_RADIUS_M,
  distanceKm,
  FULLSCREEN_PADDING,
  googleUrl,
  MINI_PADDING,
  type Spot,
  spotBounds,
  spotOf,
  spotPadding,
  spotRadius,
  yandexUrl,
  yandexZoom,
} from "@/features/listing/spot/spotGeometry";

const SPOT: Spot = { lat: 41.36512, lon: 69.28431, radius: 500 };

/** Metres between two points, through the module's own distance. */
const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => distanceKm(a, b) * 1000;

describe("radius (03 §3.4: geo_radius_m, else 500 m)", () => {
  it("is the listing's radius when it is a positive number", () => {
    expect(spotRadius(300)).toBe(300);
    expect(spotRadius(0.5)).toBe(0.5);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["zero", 0],
    ["negative", -200],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("is the 500 m default when %s", (_, value) => {
    expect(spotRadius(value)).toBe(DEFAULT_SPOT_RADIUS_M);
    expect(DEFAULT_SPOT_RADIUS_M).toBe(500);
  });

  it("builds the spot of a location, or none without coordinates", () => {
    expect(spotOf({ lat: 41.3, lon: 69.2 }, 0)).toEqual({ lat: 41.3, lon: 69.2, radius: 500 });
    expect(spotOf({ lat: 41.3, lon: 69.2 }, 250)).toEqual({ lat: 41.3, lon: 69.2, radius: 250 });
    expect(spotOf(null, 250)).toBeNull();
    expect(spotOf(undefined, 250)).toBeNull();
  });
});

describe("Yandex zoom by radius (SCR-021)", () => {
  it.each([
    [1, 17],
    [250, 17],
    [251, 16],
    [600, 16],
    [601, 15],
    [1500, 15],
    [1501, 13],
    [5000, 13],
  ])("radius %i m → zoom %i", (radius, zoom) => {
    expect(yandexZoom(radius)).toBe(zoom);
  });
});

describe("external links (SCR-021, SEC-REQ-019)", () => {
  it("opens Yandex at the spot with a red pin, coordinates with 6 decimals and the radius's zoom", () => {
    expect(yandexUrl({ lat: 41.3651234567, lon: 69.2843111111, radius: 500 })).toBe(
      "https://yandex.uz/maps/?ll=69.284311,41.365123&z=16&pt=69.284311,41.365123,pm2rdm",
    );
    expect(yandexUrl({ lat: 41.3, lon: 69.2, radius: 200 })).toBe("https://yandex.uz/maps/?ll=69.200000,41.300000&z=17&pt=69.200000,41.300000,pm2rdm");
    expect(yandexUrl({ lat: 41.3, lon: 69.2, radius: 1200 })).toContain("&z=15&");
    expect(yandexUrl({ lat: 41.3, lon: 69.2, radius: 3000 })).toContain("&z=13&");
  });

  it("searches Google for the coordinates, lat first, 6 decimals rounded", () => {
    expect(googleUrl({ lat: 41.3651239, lon: 69.2843115 })).toBe("https://www.google.com/maps/search/?api=1&query=41.365124,69.284312");
    expect(googleUrl({ lat: 41, lon: 69 })).toBe("https://www.google.com/maps/search/?api=1&query=41.000000,69.000000");
  });
});

describe("circle and bounds", () => {
  it("draws a closed counter-clockwise ring whose every vertex is the radius away", () => {
    const ring = circleRing(SPOT);

    expect(ring).toHaveLength(65);
    expect(ring[64]).toEqual(ring[0]);
    for (const [lon, lat] of ring) {
      expect(metres(SPOT, { lat, lon })).toBeCloseTo(500, -1);
    }
    // East first, then north: counter-clockwise.
    expect(ring[0][0]).toBeGreaterThan(SPOT.lon);
    expect(ring[16][1]).toBeGreaterThan(SPOT.lat);
  });

  it("boxes the circle alone without a user", () => {
    const box = spotBounds(SPOT);

    expect(metres(SPOT, { lat: box.north, lon: SPOT.lon })).toBeCloseTo(500, -1);
    expect(metres(SPOT, { lat: box.south, lon: SPOT.lon })).toBeCloseTo(500, -1);
    expect(metres(SPOT, { lat: SPOT.lat, lon: box.east })).toBeCloseTo(500, -1);
    expect(metres(SPOT, { lat: SPOT.lat, lon: box.west })).toBeCloseTo(500, -1);
  });

  it("grows the box to the user's position, and keeps the circle when the user is inside it", () => {
    const circle = spotBounds(SPOT);
    const far = spotBounds(SPOT, { lat: 41.2, lon: 69.4 });

    expect(far).toEqual({ south: 41.2, west: circle.west, north: circle.north, east: 69.4 });
    expect(spotBounds(SPOT, { lat: SPOT.lat, lon: SPOT.lon })).toEqual(circle);
  });
});

describe("fit padding", () => {
  it("is the mini map's or the fullscreen map's when there is room", () => {
    expect(spotPadding(false, { width: 390, height: 195 })).toEqual(MINI_PADDING);
    expect(spotPadding(true, { width: 390, height: 800 })).toEqual(FULLSCREEN_PADDING);
    expect(FULLSCREEN_PADDING).toEqual({ top: 90, bottom: 240, left: 32, right: 32 });
  });

  it("shrinks in proportion to half of a short map, axis by axis", () => {
    const padding = spotPadding(true, { width: 100, height: 300 });

    expect(padding.top + padding.bottom).toBeCloseTo(150);
    expect(padding.top / padding.bottom).toBeCloseTo(90 / 240);
    expect(padding.left + padding.right).toBeCloseTo(50);
    expect(padding.left).toBeCloseTo(25);
  });

  it("is none in a map without a size", () => {
    expect(spotPadding(true, { width: 0, height: 0 })).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

describe("distance to the user", () => {
  it("is the great-circle distance in kilometres", () => {
    // One degree of latitude is about 111.2 km.
    expect(distanceKm({ lat: 41, lon: 69 }, { lat: 42, lon: 69 })).toBeCloseTo(111.19, 1);
    expect(distanceKm(SPOT, SPOT)).toBe(0);
    // Tashkent centre to the stub listing: about 6 km.
    expect(distanceKm({ lat: 41.3111, lon: 69.2797 }, SPOT)).toBeCloseTo(6.0, 0);
  });
});
