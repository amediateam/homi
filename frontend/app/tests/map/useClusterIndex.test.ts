import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GL_MAX_ZOOM } from "@/features/map/camera";
import {
  buildClusterIndex,
  type ClusterFeature,
  clusterZoom,
  type GroupFeature,
  isCluster,
  leavesByPrice,
  useClusterIndex,
} from "@/features/map/gl/useClusterIndex";
import type { MapGroup, MapPoint } from "@/features/map/types";

const WORLD: [number, number, number, number] = [-180, -85, 180, 85];

function point(number: number, usd: number | null): MapPoint {
  return { number, lat: 41.3, lon: 69.2, label: usd === null ? "Договорная" : `$${usd}`, tone: null, priced: usd !== null, usd };
}

function group(lon: number, ...items: MapPoint[]): MapGroup {
  return { key: `41.30000,${lon.toFixed(5)}`, lat: 41.3, lon, items };
}

function clusters(features: (ClusterFeature | GroupFeature)[]): ClusterFeature[] {
  return features.filter(isCluster);
}

describe("buildClusterIndex (WP-27 'Pins, stacks, clusters')", () => {
  it("counts listings, not groups: a cluster's size is the sum of its groups' sizes", () => {
    const index = buildClusterIndex([
      group(69.2, point(1, 500), point(2, 600), point(3, 700)),
      group(69.201, point(4, 800), point(5, 900)),
      group(69.202, point(6, 400)),
    ]);

    const [cluster, ...rest] = index.getClusters(WORLD, 10);

    expect(rest).toEqual([]);
    expect(isCluster(cluster)).toBe(true);
    expect((cluster as ClusterFeature).properties).toMatchObject({ size: 6, point_count: 3 });
  });

  it("keeps a lone group a point that carries the group, with its size", () => {
    const lone = group(69.2, point(1, 500), point(2, 600));
    const [feature] = buildClusterIndex([lone]).getClusters(WORLD, 10);

    expect(isCluster(feature)).toBe(false);
    expect((feature as GroupFeature).properties).toEqual({ key: lone.key, size: 2, group: lone });
    expect(feature.geometry.coordinates).toEqual([69.2, 41.3]);
  });

  it("still clusters groups closer than 48 px at the map's maximum zoom; their leaves come cheapest first, unpriced last", () => {
    // 0.0001° of longitude is about 19 px at GL zoom 17 (512-px tiles).
    const index = buildClusterIndex([
      group(69.2, point(1, 900), point(2, null)),
      group(69.2001, point(3, 300), point(4, 900)),
      group(69.2002, point(5, null), point(6, 100)),
    ]);

    const atMax = clusters(index.getClusters(WORLD, GL_MAX_ZOOM));
    expect(atMax).toHaveLength(1);
    expect(atMax[0].properties.size).toBe(6);
    expect(index.getClusterExpansionZoom(atMax[0].properties.cluster_id)).toBeGreaterThan(GL_MAX_ZOOM);
    expect(leavesByPrice(index, atMax[0].properties.cluster_id).map((item) => item.number)).toEqual([6, 3, 1, 4, 2, 5]);

    expect(clusters(index.getClusters(WORLD, GL_MAX_ZOOM + 1))).toEqual([]);
  });

  it("is queried with the whole GL zoom below: 12.9 shows the level of 12, 13 that of 13", () => {
    // 0.005° of longitude is about 58 px at GL zoom 13 and 29 px at 12, against a 48-px radius.
    const index = buildClusterIndex([group(69.2, point(1, 500)), group(69.205, point(2, 600))]);

    expect(clusterZoom(12.9)).toBe(12);
    expect(clusterZoom(13)).toBe(13);
    expect(clusterZoom(16.999)).toBe(16);

    const below = index.getClusters(WORLD, clusterZoom(12.9));
    expect(clusters(below)).toHaveLength(1);
    expect(index.getClusterExpansionZoom(clusters(below)[0].properties.cluster_id)).toBe(13);

    const at = index.getClusters(WORLD, clusterZoom(13));
    expect(clusters(at)).toEqual([]);
    expect(at.map((feature) => (feature as GroupFeature).properties.key)).toEqual(["41.30000,69.20000", "41.30000,69.20500"]);
  });
});

describe("useClusterIndex", () => {
  it("builds the index once per groups array", () => {
    const groups = [group(69.2, point(1, 500))];
    const { result, rerender } = renderHook(({ value }) => useClusterIndex(value), { initialProps: { value: groups } });
    const first = result.current;

    rerender({ value: groups });
    expect(result.current).toBe(first);

    rerender({ value: [...groups] });
    expect(result.current).not.toBe(first);
  });
});
