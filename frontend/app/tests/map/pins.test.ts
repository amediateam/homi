import { describe, expect, it } from "vitest";

import {
  groupByLocation,
  mapCounts,
  SPREAD_DOT_RADIUS,
  SPREAD_LABEL_BOX,
  spreadStackLabels,
  type SpreadOffset,
} from "@/features/map/pins";
import type { MapGroup, MapPoint } from "@/features/map/types";

const NONE: ReadonlySet<number> = new Set();

function point(number: number, usd: number | null, lat = 41.3111, lon = 69.2797): MapPoint {
  return { number, origin: "legacy", lat, lon, label: usd === null ? "Договорная" : `$${usd}`, tone: null, priced: usd !== null, usd };
}

function stackOf(size: number): MapGroup {
  const items = Array.from({ length: size }, (_, index) => point(100001 + index, 300 + index * 10));
  return { key: "41.31110,69.27970", lat: 41.3111, lon: 69.2797, items };
}

function overlaps(a: SpreadOffset, b: SpreadOffset, box: { width: number; height: number }): boolean {
  return Math.abs(a.dx - b.dx) < box.width && Math.abs(a.dy - b.dy) < box.height;
}

describe("groupByLocation (SCR-011)", () => {
  it("groups points whose coordinates agree to 5 decimals, at the rounded coordinates", () => {
    const groups = groupByLocation(
      [point(1, 100, 41.311101, 69.279701), point(2, 200, 41.311104, 69.279699), point(3, 300, 41.31112, 69.2797)],
      NONE,
    );

    expect(groups.map((group) => [group.key, group.items.map((item) => item.number)])).toEqual([
      ["41.31110,69.27970", [1, 2]],
      ["41.31112,69.27970", [3]],
    ]);
    expect(groups[0]).toMatchObject({ lat: 41.3111, lon: 69.2797 });
  });

  it("puts the cheapest first and unpriced points last; equal prices keep the answer's order", () => {
    const [group] = groupByLocation([point(1, 300), point(2, null), point(3, 100), point(4, 200), point(5, 100), point(6, null)], NONE);

    expect(group.items.map((item) => item.number)).toEqual([3, 5, 4, 1, 2, 6]);
  });

  it("keeps the groups in the order of their first point", () => {
    const groups = groupByLocation([point(1, 100, 41.2), point(2, 100, 41.4), point(3, 50, 41.2)], NONE);

    expect(groups.map((group) => group.lat)).toEqual([41.2, 41.4]);
  });

  it("drops the hidden listings, and a stack left with one item is a pin", () => {
    const groups = groupByLocation([point(1, 100), point(2, 200), point(3, 300, 41.4)], new Set([2, 3]));

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.number)).toEqual([1]);
  });
});

describe("mapCounts (BR-APP-062, BR-API-192, WP-37)", () => {
  const points = Array.from({ length: 300 }, (_, index) => point(100000 + index, 100 + index, 41 + index / 1000));

  it("an uncut answer, 300 points of 320 with 5 hidden: 295 shown, 20 known only by district — the hidden lower shown only", () => {
    const hidden = new Set([100000, 100001, 100100, 100200, 100299]);

    expect(mapCounts(points, 320, 300, hidden)).toEqual({ shown: 295, cut: 0, missing: 20 });
    expect(groupByLocation(points, hidden).flatMap((group) => group.items)).toHaveLength(295);
  });

  it("a cut answer: 300 points of 600 located, 600 in all — 300 cut, nothing missing", () => {
    expect(mapCounts(points, 600, 600, NONE)).toEqual({ shown: 300, cut: 300, missing: 0 });
  });

  it("both at once: 300 points of 500 located, 520 in all", () => {
    expect(mapCounts(points, 520, 500, new Set([100000]))).toEqual({ shown: 299, cut: 200, missing: 20 });
  });

  it("no with_point (an older driver) counts the points; no total counts with_point", () => {
    expect(mapCounts(points, 320, undefined, NONE)).toEqual({ shown: 300, cut: 0, missing: 20 });
    expect(mapCounts(points, null, null, NONE)).toEqual({ shown: 300, cut: 0, missing: 0 });
    expect(mapCounts(points, undefined, 400, NONE)).toEqual({ shown: 300, cut: 100, missing: 0 });
  });

  it("never negative: a with_point below the points, a total below with_point; a hidden number off the map changes nothing", () => {
    expect(mapCounts(points, 250, 280, NONE)).toEqual({ shown: 300, cut: 0, missing: 0 });
    expect(mapCounts(points, 320, 300, new Set([1, 2, 3]))).toEqual({ shown: 300, cut: 0, missing: 20 });
    expect(mapCounts([], 0, 0, NONE)).toEqual({ shown: 0, cut: 0, missing: 0 });
  });
});

describe("spreadStackLabels (SCR-011, reused by WP-28)", () => {
  it.each([2, 12, 50])("spreads %i labels with no two boxes overlapping and the centre dot clear", (size) => {
    const offsets = spreadStackLabels(stackOf(size));

    expect(offsets).toHaveLength(size);
    for (let a = 0; a < offsets.length; a += 1) {
      for (let b = a + 1; b < offsets.length; b += 1) {
        expect(overlaps(offsets[a], offsets[b], SPREAD_LABEL_BOX), `labels ${a} and ${b}`).toBe(false);
      }
      const { dx, dy } = offsets[a];
      expect(
        Math.abs(dx) >= SPREAD_LABEL_BOX.width / 2 + SPREAD_DOT_RADIUS || Math.abs(dy) >= SPREAD_LABEL_BOX.height / 2 + SPREAD_DOT_RADIUS,
        `label ${a} covers the dot`,
      ).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(spreadStackLabels(stackOf(50))).toEqual(spreadStackLabels(stackOf(50)));
  });

  it("widens outwards in item order: the cheapest label is nearest, straight above the dot", () => {
    const offsets = spreadStackLabels(stackOf(50));
    const distances = offsets.map(({ dx, dy }) => Math.hypot(dx, dy));

    expect(offsets[0].dx).toBe(0);
    expect(offsets[0].dy).toBeLessThan(0);
    for (let index = 1; index < distances.length; index += 1) {
      expect(distances[index]).toBeGreaterThanOrEqual(distances[index - 1]);
    }
  });

  it("keeps a measured, larger box free of overlaps too", () => {
    const box = { width: 120, height: 40 };
    const offsets = spreadStackLabels(stackOf(12), box);

    for (let a = 0; a < offsets.length; a += 1) {
      for (let b = a + 1; b < offsets.length; b += 1) {
        expect(overlaps(offsets[a], offsets[b], box), `labels ${a} and ${b}`).toBe(false);
      }
    }
  });

  it("has no offsets for an empty group", () => {
    expect(spreadStackLabels({ ...stackOf(1), items: [] })).toEqual([]);
  });
});
