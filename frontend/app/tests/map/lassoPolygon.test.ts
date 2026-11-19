import { normalizePolygon, type Polygon } from "@homi/search";
import { describe, expect, it } from "vitest";

import { LASSO_CLOSE_GAP_PX, LASSO_MIN_SPAN_PX, lassoToPolygon, type ScreenPoint } from "@/features/map/lasso/polygon";

/** A flat projection around Tashkent: 1 px is 1e-4°, so a screen point reads back from its vertex. */
const unproject = (x: number, y: number) => [41.3 - y * 1e-4, 69.2 + x * 1e-4] as const;
const screenOf = ([lat, lon]: readonly [number, number]): ScreenPoint => ({
  x: Math.round((lon - 69.2) * 1e4),
  y: Math.round((41.3 - lat) * 1e4),
});

const p = (x: number, y: number): ScreenPoint => ({ x, y });

/** `count` points on a circle of `diameter` px, starting and ending at its rightmost point (a closed stroke). */
function circle(diameter: number, count: number, centre = p(200, 200)): ScreenPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / (count - 1);
    return p(centre.x + (diameter / 2) * Math.cos(angle), centre.y + (diameter / 2) * Math.sin(angle));
  });
}

/** The turns of a closed outline all go the same way. */
function isConvex(points: readonly ScreenPoint[]): boolean {
  const turns = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const after = points[(index + 2) % points.length];
    return Math.sign((next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x));
  });
  return turns.every((turn) => turn === turns[0]);
}

/** A deterministic random stroke: a walk of 6 px steps that turns at random (a small linear congruential generator). */
function scribble(seed: number, count: number): ScreenPoint[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
  let heading = next() * 2 * Math.PI;
  let point = p(200, 200);
  return Array.from({ length: count }, () => {
    heading += (next() - 0.5) * 1.2;
    point = p(point.x + 6 * Math.cos(heading), point.y + 6 * Math.sin(heading));
    return point;
  });
}

describe("lassoToPolygon (WP-28 \"Lasso\", BR-APP-061)", () => {
  it("rejects 2 points", () => {
    expect(lassoToPolygon([p(0, 0), p(200, 200)], unproject)).toBeNull();
  });

  it("rejects a span of 39 px on either axis and takes 40 px", () => {
    expect(LASSO_MIN_SPAN_PX).toBe(40);
    expect(lassoToPolygon([p(0, 0), p(39, 0), p(20, 200)], unproject)).toBeNull();
    expect(lassoToPolygon([p(0, 0), p(200, 0), p(100, 39)], unproject)).toBeNull();

    const polygon = lassoToPolygon([p(0, 0), p(40, 0), p(20, 40)], unproject);
    expect(polygon).toEqual([
      [41.3, 69.2],
      [41.3, 69.204],
      [41.296, 69.202],
    ]);
  });

  it("simplifies a 200 px circle of 300 points to at most 40 vertices", () => {
    const polygon = lassoToPolygon(circle(200, 300), unproject)!;

    expect(polygon.length).toBeGreaterThanOrEqual(3);
    expect(polygon.length).toBeLessThanOrEqual(40);
    // Still the circle: every vertex within 3 px of it.
    for (const vertex of polygon) {
      const { x, y } = screenOf(vertex);
      expect(Math.abs(Math.hypot(x - 200, y - 200) - 100)).toBeLessThanOrEqual(3);
    }
  });

  it("grows the tolerance by 1.5 per pass while more than 40 vertices are left", () => {
    // A circle of 300 points with an 8 px zigzag: at 3 px every corner of the zigzag stays.
    const zigzag = circle(200, 300).map(({ x, y }, index) => {
      const out = index % 2 === 0 ? 1.08 : 0.92;
      return p(200 + (x - 200) * out, 200 + (y - 200) * out);
    });
    const polygon = lassoToPolygon(zigzag, unproject)!;

    expect(polygon.length).toBeGreaterThanOrEqual(3);
    expect(polygon.length).toBeLessThanOrEqual(40);
  });

  it("drops a last vertex 11 px from the first, keeps one 13 px away", () => {
    expect(LASSO_CLOSE_GAP_PX).toBe(12);
    const square = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)];

    expect(lassoToPolygon([...square, p(0, 11)], unproject)?.map(screenOf)).toEqual(square);
    expect(lassoToPolygon([...square, p(0, 13)], unproject)?.map(screenOf)).toEqual([...square, p(0, 13)]);
  });

  it("drops the closing vertex only while more than 3 vertices are left", () => {
    expect(lassoToPolygon([p(0, 0), p(100, 0), p(50, 100), p(5, 5)], unproject)?.map(screenOf)).toEqual([
      p(0, 0),
      p(100, 0),
      p(50, 100),
    ]);
    expect(lassoToPolygon([p(0, 0), p(100, 50), p(8, 8)], unproject)?.map(screenOf)).toEqual([
      p(0, 0),
      p(100, 50),
      p(8, 8),
    ]);
  });

  it("replaces a figure-eight by its convex hull", () => {
    const bowtie = [p(0, 0), p(100, 100), p(100, 0), p(0, 100)];
    const hull = lassoToPolygon(bowtie, unproject)!.map(screenOf);

    expect(hull).toHaveLength(4);
    expect([...hull].sort((a, b) => a.x - b.x || a.y - b.y)).toEqual([p(0, 0), p(0, 100), p(100, 0), p(100, 100)]);
    expect(isConvex(hull)).toBe(true);

    // A drawn figure-eight: two loops through the middle; its hull holds every point of the stroke.
    const eight = Array.from({ length: 200 }, (_, index) => {
      const t = (2 * Math.PI * index) / 199;
      return p(200 + 120 * Math.sin(t), 200 + 60 * Math.sin(2 * t));
    });
    const outline = lassoToPolygon(eight, unproject)!.map(screenOf);
    expect(isConvex(outline)).toBe(true);
    const xs = outline.map((point) => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(230);
  });

  it("rounds every coordinate to 5 decimals, which the address form reads back unchanged", () => {
    const precise = (x: number, y: number) => [41.3 - y * 1.234567e-5, 69.2 + x * 7.654321e-5] as const;
    const polygon = lassoToPolygon(circle(160, 120), precise)!;

    for (const [lat, lon] of polygon) {
      expect(Number(lat.toFixed(5))).toBe(lat);
      expect(Number(lon.toFixed(5))).toBe(lon);
    }
    expect(normalizePolygon(polygon)).toEqual(polygon);
  });

  it("is never fewer than 3 or more than 40 vertices, and never closed", () => {
    const results: (Polygon | null)[] = [
      ...Array.from({ length: 50 }, (_, seed) => lassoToPolygon(scribble(seed + 1, 20 + seed * 10), unproject)),
      lassoToPolygon(circle(200, 2000), unproject),
      // A straight stroke spans both axes but simplifies to its two ends.
      lassoToPolygon([p(0, 0), p(50, 50), p(100, 100), p(150, 150)], unproject),
      // Vertices that rounding makes equal: 1 px is far below 5 decimals here.
      lassoToPolygon(circle(200, 300), (x, y) => [41.3 + y * 1e-9, 69.2 + x * 1e-9]),
    ];

    expect(results.at(-2)).toBeNull();
    expect(results.at(-1)).toBeNull();
    for (const polygon of results.filter((result) => result !== null)) {
      expect(polygon.length).toBeGreaterThanOrEqual(3);
      expect(polygon.length).toBeLessThanOrEqual(40);
      expect(polygon[0]).not.toEqual(polygon[polygon.length - 1]);
    }
    expect(results.filter((result) => result !== null).length).toBeGreaterThan(25);
  });

  it("is null when the engine cannot unproject (no map)", () => {
    expect(lassoToPolygon(circle(200, 50), () => [Number.NaN, Number.NaN])).toBeNull();
  });
});
