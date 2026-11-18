import type { LeafletEvent, Marker, MarkerCluster, MarkerClusterGroup, MarkerOptions } from "leaflet";
import { useEffect, useEffectEvent, useRef } from "react";

import { tg } from "@/lib/telegram";

import { CLUSTER_PADDING } from "../camera";
import type { MapGroup, MapViewProps, Selection } from "../types";
import { clusterIcon, pinIcon, stackIcon } from "./icons";
import { LEAFLET_MAX_ZOOM, type LeafletHandle, type LeafletInstance } from "./useLeafletMap";

/**
 * The listings of the Leaflet view (WP-28 "Listings layer", SCR-011): one marker per location group — a pin for one
 * listing, a stack for several — in a markercluster group with `maxClusterRadius` 48 and no spiderfy. A cluster
 * counts listings, not groups. A cluster tap below the maximum zoom zooms to its listings; at the maximum zoom it
 * selects them in markercluster's order (WP-28 "Differences between engines").
 */

/** The pixel radius within which markercluster joins markers (legacy). */
export const MAX_CLUSTER_RADIUS = 48;

type Select = MapViewProps["onSelect"];

type GroupMarker = Marker & { options: Marker["options"] & { group: MapGroup } };

export type ListingLayer = { update(groups: readonly MapGroup[]): void; destroy(): void };

function groupOf(marker: Marker): MapGroup {
  return (marker as GroupMarker).options.group;
}

function sizeOf(cluster: MarkerCluster): number {
  return cluster.getAllChildMarkers().reduce((sum, marker) => sum + groupOf(marker).items.length, 0);
}

export function createListingLayer({ map, L }: LeafletInstance, select: Select): ListingLayer {
  const clusters: MarkerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: MAX_CLUSTER_RADIUS,
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    iconCreateFunction: (cluster) => clusterIcon(L, sizeOf(cluster)),
  });

  clusters.on("clusterclick", (event: LeafletEvent) => {
    const cluster = (event as LeafletEvent & { layer: MarkerCluster }).layer;
    if (map.getZoom() >= LEAFLET_MAX_ZOOM) {
      select(cluster.getAllChildMarkers().flatMap((marker: Marker) => groupOf(marker).items.map((item) => item.number)));
      return;
    }
    tg.haptic.impact();
    cluster.zoomToBounds({
      paddingTopLeft: [CLUSTER_PADDING.left, CLUSTER_PADDING.top],
      paddingBottomRight: [CLUSTER_PADDING.right, CLUSTER_PADDING.bottom],
    });
  });

  clusters.addTo(map);

  function markerOf(group: MapGroup): Marker {
    const [first] = group.items;
    const icon = group.items.length > 1 ? stackIcon(L, group) : pinIcon(L, first);
    const marker = L.marker([group.lat, group.lon], { icon, keyboard: false, group } as MarkerOptions);
    marker.on("click", () => select(group.items.map((item) => item.number)));
    return marker;
  }

  return {
    update(groups) {
      clusters.clearLayers();
      clusters.addLayers(groups.map(markerOf));
    },
    destroy() {
      clusters.off();
      clusters.clearLayers();
      clusters.remove();
    },
  };
}

export type ListingLayerInput = {
  groups: readonly MapGroup[];
  selection: Selection;
  onSelect: Select;
};

/** The listings layer of the current map: made with each map, given each new grouping. */
export function useListingLayer({ mapRef, generation }: LeafletHandle, { groups, onSelect }: ListingLayerInput): void {
  const select = useEffectEvent((numbers: number[], at?: number) => onSelect(numbers, at));
  const layer = useRef<ListingLayer | null>(null);
  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null) {
      return undefined;
    }
    const created = createListingLayer(instance, (numbers, at) => select(numbers, at));
    layer.current = created;
    return () => {
      layer.current = null;
      created.destroy();
    };
  }, [mapRef, generation]);
  useEffect(() => {
    layer.current?.update(groups);
  }, [generation, groups]);
}
