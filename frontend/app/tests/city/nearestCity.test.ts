import { describe, expect, it } from "vitest";

import { type CityPlace, distanceKm, MAX_DISTANCE_KM, NEAR_TOWN_KM, nearestCity } from "@/features/city/nearestCity";

/** The stub reference cities (`backend/resources/fixtures/v1/reference/default.ru.json`). */
const TASHKENT: CityPlace = { code: "tashkent", center: { lat: 41.3111, lon: 69.2797 }, is_region: false };
const REGION: CityPlace = { code: "tashkent_region", center: { lat: 41.2213, lon: 69.8597 }, is_region: true };
const ANDIJAN: CityPlace = { code: "andijan", center: { lat: 40.7821, lon: 72.3442 }, is_region: false };
const CITIES = [TASHKENT, REGION, ANDIJAN];

/** A point `km` kilometres due north of `from` (along a meridian the haversine distance is exact). */
function north(from: { lat: number; lon: number }, km: number) {
  return { lat: from.lat + km / (12_742 / 2) / (Math.PI / 180), lon: from.lon };
}

describe("distanceKm", () => {
  it("is the haversine distance: one degree of latitude is about 111.2 km", () => {
    expect(distanceKm({ lat: 41, lon: 69 }, { lat: 42, lon: 69 })).toBeCloseTo(111.19, 1);
    expect(distanceKm(TASHKENT.center!, REGION.center!)).toBeCloseTo(49.4, 0);
  });
});

describe("nearestCity (BR-APP-056)", () => {
  it("picks a town within 16 km, even with a region in range", () => {
    expect(nearestCity(north(TASHKENT.center!, 5), CITIES)?.code).toBe("tashkent");
    expect(nearestCity(north(TASHKENT.center!, NEAR_TOWN_KM - 0.01), CITIES)?.code).toBe("tashkent");
  });

  it("prefers a region within 110 km over a town beyond 16 km, even a closer one", () => {
    // 20 km north of Tashkent: the town is ~20 km away, the region ~55 km.
    const point = north(TASHKENT.center!, 20);
    expect(distanceKm(point, TASHKENT.center!)).toBeLessThan(distanceKm(point, REGION.center!));

    expect(nearestCity(point, CITIES)?.code).toBe("tashkent_region");
  });

  it("takes a town within 110 km when no region is in range", () => {
    expect(nearestCity(north(ANDIJAN.center!, 60), CITIES)?.code).toBe("andijan");
    expect(nearestCity(north(TASHKENT.center!, 60), [TASHKENT, ANDIJAN])?.code).toBe("tashkent");
  });

  it("answers null when nothing is within 110 km", () => {
    expect(nearestCity({ lat: 55.7558, lon: 37.6173 }, CITIES)).toBeNull();
    expect(nearestCity(north(ANDIJAN.center!, MAX_DISTANCE_KM + 1), [ANDIJAN])).toBeNull();
  });

  it("draws the lines at 16 and 110 km (BR-APP-056)", () => {
    expect(NEAR_TOWN_KM).toBe(16);
    expect(MAX_DISTANCE_KM).toBe(110);
    // The region stays about 50 km away on both sides of the town's 16 km line.
    expect(nearestCity(north(TASHKENT.center!, 15.9), CITIES)?.code).toBe("tashkent");
    expect(nearestCity(north(TASHKENT.center!, 16.1), CITIES)?.code).toBe("tashkent_region");
    expect(nearestCity(north(ANDIJAN.center!, 109.9), [ANDIJAN])?.code).toBe("andijan");
    expect(nearestCity(north(ANDIJAN.center!, 110.1), [ANDIJAN])).toBeNull();
    expect(nearestCity(north(REGION.center!, 109.9), [REGION])?.code).toBe("tashkent_region");
    expect(nearestCity(north(REGION.center!, 110.1), [REGION])).toBeNull();
  });

  it("counts a city without the region mark as a town", () => {
    const unmarked: CityPlace = { code: "unmarked", center: north(TASHKENT.center!, 40) };
    const farRegion: CityPlace = { code: "far_region", center: north(TASHKENT.center!, 90), is_region: true };

    // As a region the unmarked city (40 km) would beat the region (90 km); as a town it comes after every region.
    expect(nearestCity(TASHKENT.center!, [unmarked, farRegion])?.code).toBe("far_region");
    expect(nearestCity(north(TASHKENT.center!, 30), [unmarked])?.code).toBe("unmarked");
    expect(nearestCity(north(TASHKENT.center!, 38), [unmarked, farRegion])?.code).toBe("unmarked");
  });

  it("answers null for an empty list", () => {
    expect(nearestCity(TASHKENT.center!, [])).toBeNull();
  });

  it("takes the closest of several and, on a tie, the first in the server's order", () => {
    const south: CityPlace = { code: "south", center: { lat: 40.9, lon: 69 }, is_region: false };
    const northern: CityPlace = { code: "north", center: { lat: 41.1, lon: 69 }, is_region: false };
    const closer: CityPlace = { code: "closer", center: { lat: 41.05, lon: 69 }, is_region: false };
    const point = { lat: 41, lon: 69 };

    expect(nearestCity(point, [south, northern])?.code).toBe("south");
    expect(nearestCity(point, [northern, south])?.code).toBe("north");
    expect(nearestCity(point, [south, northern, closer])?.code).toBe("closer");
  });

  it("skips cities without a usable centre", () => {
    const noCentre: CityPlace = { code: "no_centre", center: null, is_region: false };
    const missing: CityPlace = { code: "missing", is_region: false };
    const broken: CityPlace = { code: "broken", center: { lat: Number.NaN, lon: 69.28 }, is_region: true };

    expect(nearestCity(TASHKENT.center!, [noCentre, missing, broken])).toBeNull();
    expect(nearestCity(TASHKENT.center!, [noCentre, broken, ANDIJAN, TASHKENT])?.code).toBe("tashkent");
  });

  it("returns the city object itself, so a caller keeps its other fields", () => {
    const cities = [{ ...TASHKENT, name: "Ташкент" }];
    expect(nearestCity(TASHKENT.center!, cities)).toBe(cities[0]);
  });
});
