import type { Polygon } from "@homi/search";
import { describe, expect, it } from "vitest";

import { maskGeometry, type Position, ringOf } from "@/features/map/mask";

/** Twice the signed area of a closed `[lon, lat]` ring: positive counter-clockwise (RFC 7946 §3.1.6). */
function signedArea(ring: readonly Position[]): number {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sum += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return sum;
}

/** A polygon around central Tashkent; `clockwise` in the `[lon, lat]` plane or not. */
function ringPolygon(vertices: number, clockwise: boolean): Polygon {
  return Array.from({ length: vertices }, (_, index) => {
    const angle = ((clockwise ? -1 : 1) * 2 * Math.PI * index) / vertices;
    return [41.3111 + 0.03 * Math.sin(angle), 69.2797 + 0.04 * Math.cos(angle)] as const;
  });
}

const TRIANGLE: Polygon = [
  [41.3, 69.2],
  [41.3, 69.3],
  [41.36, 69.25],
];

const SHAPES: [string, Polygon][] = [
  ["a counter-clockwise triangle", TRIANGLE],
  ["a clockwise triangle", [...TRIANGLE].reverse()],
  ["a counter-clockwise 40-vertex polygon", ringPolygon(40, false)],
  ["a clockwise 40-vertex polygon", ringPolygon(40, true)],
];

describe("ringOf", () => {
  it("is the polygon in [lon, lat] order, closed", () => {
    expect(ringOf(TRIANGLE)).toEqual([
      [69.2, 41.3],
      [69.3, 41.3],
      [69.25, 41.36],
      [69.2, 41.3],
    ]);
  });

  it("does not close an already closed polygon twice", () => {
    expect(ringOf([...TRIANGLE, TRIANGLE[0]])).toHaveLength(4);
  });
});

describe("maskGeometry (SCR-011 area mask)", () => {
  it.each(SHAPES)("cuts %s out of a counter-clockwise world rectangle as a clockwise hole", (_, polygon) => {
    const [mask] = maskGeometry(polygon).features;
    const [world, hole] = mask.geometry.coordinates;

    expect(mask.properties).toEqual({ kind: "mask" });
    expect(mask.geometry.coordinates).toHaveLength(2);
    expect(signedArea(world)).toBeGreaterThan(0);
    expect(signedArea(hole)).toBeLessThan(0);
    expect(hole).toHaveLength(polygon.length + 1);
    expect(hole[0]).toEqual(hole[hole.length - 1]);
    expect(new Set(hole.map(String))).toEqual(new Set(polygon.map(([lat, lon]) => `${lon},${lat}`)));
  });

  it("dims the whole Web Mercator world", () => {
    const [mask] = maskGeometry(TRIANGLE).features;
    const [world] = mask.geometry.coordinates;

    expect(Math.min(...world.map(([lon]) => lon))).toBe(-180);
    expect(Math.max(...world.map(([lon]) => lon))).toBe(180);
    expect(Math.min(...world.map(([, lat]) => lat))).toBeLessThanOrEqual(-85.0511287798);
    expect(Math.max(...world.map(([, lat]) => lat))).toBeGreaterThanOrEqual(85.0511287798);
    expect(world[0]).toEqual(world[world.length - 1]);
  });

  it.each(SHAPES)("outlines %s with a closed LineString of its vertices", (_, polygon) => {
    const [, outline] = maskGeometry(polygon).features;
    const line = outline.geometry.coordinates;

    expect(outline.properties).toEqual({ kind: "outline" });
    expect(line).toEqual(ringOf(polygon));
    expect(line[0]).toEqual(line[line.length - 1]);
  });
});
