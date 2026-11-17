"use client";

import { useMemo } from "react";
import Supercluster from "supercluster";

import { GL_MAX_ZOOM } from "../camera";
import type { MapGroup, MapPoint } from "../types";

/**
 * The clusters of the GL view (WP-27 "Pins, stacks, clusters", SCR-011). One index point per group — a pin or a
 * stack — carrying the group's number of listings, so a cluster counts listings (`size`, the sum of its groups'
 * sizes) while Supercluster's own `point_count` counts groups. The radius is 48 px on 512-px tiles and clusters are
 * built up to zoom 17, the GL map's maximum, so groups closer than 48 px still form a cluster there; a tap on such a
 * cluster opens the card. Zooms are on MapLibre's scale.
 */

/** In CSS pixels at the GL zoom the index is queried with. */
export const CLUSTER_RADIUS = 48;

/** MapLibre's tile size: with this extent the radius is in screen pixels at the GL zoom. */
export const CLUSTER_EXTENT = 512;

export type GroupProperties = { key: string; size: number; group: MapGroup };

export type ClusterProperties = { size: number };

export type ClusterIndex = Supercluster<GroupProperties, ClusterProperties>;

export type ClusterFeature = Supercluster.ClusterFeature<ClusterProperties>;

export type GroupFeature = Supercluster.PointFeature<GroupProperties>;

export function isCluster(feature: ClusterFeature | GroupFeature): feature is ClusterFeature {
  return "cluster" in feature.properties && feature.properties.cluster === true;
}

/** The level of the index a GL zoom shows: the whole zoom below it, as MapLibre's own clustered sources do. */
export function clusterZoom(glZoom: number): number {
  return Math.floor(glZoom);
}

/** The index of the groups, built once per groups array (a new answer or a new hidden set). */
export function buildClusterIndex(groups: readonly MapGroup[]): ClusterIndex {
  const index: ClusterIndex = new Supercluster<GroupProperties, ClusterProperties>({
    radius: CLUSTER_RADIUS,
    maxZoom: GL_MAX_ZOOM,
    extent: CLUSTER_EXTENT,
    map: (properties) => ({ size: properties.size }),
    reduce: (accumulated, properties) => {
      accumulated.size += properties.size;
    },
  });
  return index.load(
    groups.map(
      (group): GroupFeature => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [group.lon, group.lat] },
        properties: { key: group.key, size: group.items.length, group },
      }),
    ),
  );
}

export function useClusterIndex(groups: readonly MapGroup[]): ClusterIndex {
  return useMemo(() => buildClusterIndex(groups), [groups]);
}

/** Cheapest first, a listing without a USD price last; equal prices keep their order. */
function byPrice(a: MapPoint, b: MapPoint): number {
  if (a.usd === null || b.usd === null) {
    return a.usd === null ? (b.usd === null ? 0 : 1) : -1;
  }
  return a.usd - b.usd;
}

/** Every listing of a cluster, cheapest first: the card of a cluster tapped at maximum zoom. */
export function leavesByPrice(index: ClusterIndex, clusterId: number): MapPoint[] {
  return index
    .getLeaves(clusterId, Infinity)
    .flatMap((leaf) => leaf.properties.group.items)
    .sort(byPrice);
}
