import { describe, expect, it } from "vitest";

import { normalizePolygon, parsePolygon, POLYGON_MAX_VERTICES, serializePolygon } from "../src/polygon";
import type { PolygonVertex } from "../src/types";

const triangle: PolygonVertex[] = [
  [41.3, 69.2],
  [41.31, 69.25],
  [41.29, 69.3],
];

/** A regular polygon of `n` vertices around central Tashkent, with more than 5 decimals. */
const ring = (n: number): PolygonVertex[] =>
  Array.from({ length: n }, (_, i) => [
    41.3111 + 0.05 * Math.sin((2 * Math.PI * i) / n),
    69.2797 + 0.05 * Math.cos((2 * Math.PI * i) / n),
  ]);

describe("serializePolygon / parsePolygon", () => {
  it("writes lat,lon pairs separated by semicolons, each coordinate with 5 decimals", () => {
    expect(serializePolygon(triangle)).toBe("41.30000,69.20000;41.31000,69.25000;41.29000,69.30000");
    expect(serializePolygon([[-1.234564, 179.999996], [0, 0], [1, -2]])).toBe(
      "-1.23456,180.00000;0.00000,0.00000;1.00000,-2.00000",
    );
  });

  it("reads the wire form back", () => {
    expect(parsePolygon("41.30000,69.20000;41.31000,69.25000;41.29000,69.30000")).toEqual(triangle);
  });

  it("round-trips 3 and 40 vertices at 5 decimals", () => {
    for (const n of [3, POLYGON_MAX_VERTICES]) {
      const text = serializePolygon(ring(n));
      const parsed = parsePolygon(text);
      expect(parsed).toHaveLength(n);
      expect(serializePolygon(parsed ?? [])).toBe(text);
      for (const [lat, lon] of parsed ?? []) {
        expect(Math.round(lat * 1e5) / 1e5).toBe(lat);
        expect(Math.round(lon * 1e5) / 1e5).toBe(lon);
      }
    }
  });

  it("drops fewer than 3 or more than 40 vertices", () => {
    expect(parsePolygon("41.3,69.2;41.31,69.25")).toBeNull();
    expect(parsePolygon(serializePolygon(ring(41)))).toBeNull();
    expect(parsePolygon("")).toBeNull();
  });

  it("opens a closed polygon", () => {
    expect(parsePolygon("41.3,69.2;41.31,69.25;41.29,69.3;41.3,69.2")).toEqual(triangle);
  });

  it("drops malformed text and coordinates out of range", () => {
    expect(parsePolygon("41.3,69.2;41.31;41.29,69.3")).toBeNull();
    expect(parsePolygon("41.3,69.2;41.31,abc;41.29,69.3")).toBeNull();
    expect(parsePolygon("91,69.2;41.31,69.25;41.29,69.3")).toBeNull();
    expect(parsePolygon("41.3,181;41.31,69.25;41.29,69.3")).toBeNull();
    expect(parsePolygon("1e1,69.2;41.31,69.25;41.29,69.3")).toBeNull();
  });

  it("accepts the vertex pairs of a radar's filters", () => {
    expect(normalizePolygon(triangle)).toEqual(triangle);
    expect(normalizePolygon([[41.3, 69.2], [41.31], [41.29, 69.3]])).toBeNull();
    expect(normalizePolygon({ 0: [41.3, 69.2] })).toBeNull();
    expect(normalizePolygon([[Number.NaN, 69.2], ...triangle])).toBeNull();
  });
});
