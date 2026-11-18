import type { LeafletEvent, Marker, MarkerCluster, MarkerClusterGroup } from "leaflet";
import { useEffect, useEffectEvent, useRef } from "react";

import { tg } from "@/lib/telegram";

import { CLUSTER_MS, CLUSTER_PADDING } from "../camera";
import { setActive } from "../markerElements";
import { SPREAD_LABEL_BOX, spreadStackLabels } from "../pins";
import type { MapGroup, MapViewProps, Selection } from "../types";
import { clusterIcon, elementIcon, groupIcon, spreadDotIcon, spreadPinIcon } from "./icons";
import { LEAFLET_MAX_ZOOM, type LeafletHandle, type LeafletInstance, reducedMotion } from "./useLeafletMap";
import type { Spiderfy } from "./useSpiderfy";

/**
 * The listings of the Leaflet view (WP-28 "Listings layer", SCR-011): one marker per location group — a pin for one
 * listing, a stack for several — in a markercluster group with `maxClusterRadius` 48 and no spiderfy, reused by key
 * while their content stays the same; a cluster counts listings, not groups. The spread stack leaves the clusters and
 * is drawn as labelled pins around its dot, above the other markers. The markers are pointer targets only, as on GL:
 * the list view is the keyboard and screen-reader path to the same listings.
 */

/** The pixel radius within which markercluster joins markers (legacy). */
export const MAX_CLUSTER_RADIUS = 48;

/** Leaflet stacks markers by their screen `y`; a spread stack sits above every clustered marker. */
export const SPREAD_Z_OFFSET = 100_000;

/** The selected pin or stack sits above everything, spread pins included (`03` §3.6, active pin). */
export const ACTIVE_Z_OFFSET = 200_000;

type Select = (...args: Parameters<MapViewProps["onSelect"]>) => void;

export type ListingCallbacks = {
  select: Select;
  /** A stack was tapped (`Spiderfy.open`). */
  spread(group: MapGroup): void;
  /** Collapses any spread stack (`Spiderfy.collapse`). */
  collapse(): void;
};

export type ListingView = {
  groups: readonly MapGroup[];
  /** The spread stack, drawn out of the clusters. */
  spread: MapGroup | null;
  /** The selection's current listing. */
  active: number | null;
};

export type ListingLayer = { update(view: ListingView): void; destroy(): void };

type Entry = { marker: Marker; element: HTMLElement; numbers: readonly number[]; z: number };

type GroupEntry = Entry & { signature: string };

/**
 * A group's listings and content: a reused marker must show the same. Groups are keyed by location only, so the
 * numbers belong to the signature even for one listing — another listing at the same address with the same label is
 * a new marker, whose tap selects it (GL keys a pin by its number).
 */
function signatureOf(group: MapGroup): string {
  const [first] = group.items;
  return JSON.stringify([group.items.map((item) => item.number), first.label, first.tone, first.priced]);
}

/** The largest laid-out label of a spread, or the default box when nothing is laid out (no layout engine). */
function labelBox(elements: readonly HTMLElement[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const element of elements) {
    width = Math.max(width, element.offsetWidth);
    height = Math.max(height, element.offsetHeight);
  }
  return width > 0 && height > 0 ? { width, height } : SPREAD_LABEL_BOX;
}

/**
 * The layer of one map. Taps: a pin selects its listing; a stack spreads and selects all its listings at index 0; a
 * spread pin selects the same listings at its index; a cluster first collapses any spread stack (LB-APP-013), then
 * below the maximum zoom plays a light haptic and zooms to its listings with `CLUSTER_PADDING`, and at the maximum
 * zoom selects its listings in markercluster's order (GL: by price). A marker's tap never reaches the map's `click`.
 */
export function createListingLayer({ map, L }: LeafletInstance, callbacks: ListingCallbacks): ListingLayer {
  const { select, spread, collapse } = callbacks;
  const entries = new Map<string, GroupEntry>();
  const spreadEntries: Entry[] = [];
  const groupOf = new WeakMap<Marker, MapGroup>();
  let spreadSignature: string | null = null;

  const sizeOf = (cluster: MarkerCluster) =>
    cluster.getAllChildMarkers().reduce((sum, marker) => sum + (groupOf.get(marker)?.items.length ?? 1), 0);

  const clusters: MarkerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: MAX_CLUSTER_RADIUS,
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    iconCreateFunction: (cluster) => clusterIcon(L, sizeOf(cluster)),
  });
  const spreadLayer = L.layerGroup();

  clusters.on("clusterclick", (event: LeafletEvent) => {
    collapse();
    const cluster = (event as LeafletEvent & { layer: MarkerCluster }).layer;
    if (map.getZoom() >= LEAFLET_MAX_ZOOM) {
      select(cluster.getAllChildMarkers().flatMap((marker: Marker) => groupOf.get(marker)?.items.map((item) => item.number) ?? []));
      return;
    }
    tg.haptic.impact();
    cluster.zoomToBounds({
      paddingTopLeft: [CLUSTER_PADDING.left, CLUSTER_PADDING.top],
      paddingBottomRight: [CLUSTER_PADDING.right, CLUSTER_PADDING.bottom],
      animate: !reducedMotion(),
      duration: CLUSTER_MS / 1000,
    });
  });

  clusters.addTo(map);
  spreadLayer.addTo(map);

  function build(group: MapGroup): GroupEntry {
    const numbers = group.items.map((item) => item.number);
    const { icon, element } = groupIcon(L, group);
    const marker = L.marker([group.lat, group.lon], { icon, keyboard: false });
    marker.on("click", () => {
      if (numbers.length > 1) {
        spread(group);
        select(numbers, 0);
      } else {
        select(numbers);
      }
    });
    groupOf.set(marker, group);
    return { marker, element, numbers, z: 0, signature: signatureOf(group) };
  }

  /** The stack as labelled pins around a dot at its location, until it is no longer the spread one. */
  function syncSpread(group: MapGroup | null): void {
    // Every label of a spread is shown, so all of them name its content.
    const signature =
      group === null ? null : JSON.stringify([group.key, group.items.map((item) => [item.number, item.label, item.tone, item.priced])]);
    if (signature === spreadSignature) {
      return;
    }
    spreadSignature = signature;
    spreadLayer.clearLayers();
    spreadEntries.length = 0;
    if (group === null) {
      return;
    }
    const at: [number, number] = [group.lat, group.lon];
    const numbers = group.items.map((item) => item.number);
    spreadLayer.addLayer(L.marker(at, { icon: spreadDotIcon(L), interactive: false, keyboard: false, zIndexOffset: SPREAD_Z_OFFSET }));
    const pins = group.items.map((item, index): Entry => {
      const { icon, element } = spreadPinIcon(L, item);
      const marker = L.marker(at, { icon, keyboard: false, zIndexOffset: SPREAD_Z_OFFSET });
      marker.on("click", () => select(numbers, index));
      spreadLayer.addLayer(marker);
      return { marker, element, numbers: [item.number], z: SPREAD_Z_OFFSET };
    });
    // Measured once laid out in the marker pane, as GL does.
    const offsets = spreadStackLabels(group, labelBox(pins.map((pin) => pin.element)));
    pins.forEach((pin, index) => pin.marker.setIcon(elementIcon(L, pin.element, offsets[index])));
    spreadEntries.push(...pins);
  }

  return {
    update({ groups, spread: spreadGroup, active }) {
      const wanted = new Map<string, MapGroup>();
      for (const group of groups) {
        if (group.key !== spreadGroup?.key) {
          wanted.set(group.key, group);
        }
      }
      const stale: Marker[] = [];
      for (const [key, entry] of entries) {
        const group = wanted.get(key);
        if (group === undefined || signatureOf(group) !== entry.signature) {
          stale.push(entry.marker);
          entries.delete(key);
        } else {
          groupOf.set(entry.marker, group);
        }
      }
      const added: Marker[] = [];
      for (const [key, group] of wanted) {
        if (!entries.has(key)) {
          const entry = build(group);
          entries.set(key, entry);
          added.push(entry.marker);
        }
      }
      if (stale.length > 0) {
        clusters.removeLayers(stale);
      }
      if (added.length > 0) {
        clusters.addLayers(added);
      }
      syncSpread(spreadGroup);
      for (const entry of [...entries.values(), ...spreadEntries]) {
        const on = active !== null && entry.numbers.includes(active);
        setActive(entry.element, on);
        entry.marker.setZIndexOffset(on ? ACTIVE_Z_OFFSET : entry.z);
      }
    },
    destroy() {
      clusters.off();
      clusters.clearLayers();
      clusters.remove();
      spreadLayer.clearLayers();
      spreadLayer.remove();
      entries.clear();
      spreadEntries.length = 0;
      spreadSignature = null;
    },
  };
}

export type ListingLayerInput = {
  groups: readonly MapGroup[];
  selection: Selection;
  onSelect: MapViewProps["onSelect"];
  spiderfy: Spiderfy;
};

/**
 * The listings layer of the current map: made with each map and given each new grouping, spread stack and selection;
 * the selection's current listing is `active` — the accent colour, raised above every other marker through Leaflet's
 * own z-index offset.
 */
export function useListingLayer({ mapRef, generation }: LeafletHandle, { groups, selection, onSelect, spiderfy }: ListingLayerInput): void {
  const layer = useRef<ListingLayer | null>(null);
  const select = useEffectEvent((...args: Parameters<Select>) => onSelect(...args));
  const spread = useEffectEvent((group: MapGroup) => spiderfy.open(group));
  const collapse = useEffectEvent(() => spiderfy.collapse());
  const active = selection === null ? null : (selection.numbers[selection.at] ?? null);
  const { spread: spreadGroup } = spiderfy;

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null) {
      return undefined;
    }
    const created = createListingLayer(instance, {
      select: (...args) => select(...args),
      spread: (group) => spread(group),
      collapse: () => collapse(),
    });
    layer.current = created;
    return () => {
      layer.current = null;
      created.destroy();
    };
  }, [mapRef, generation]);

  useEffect(() => {
    layer.current?.update({ groups, spread: spreadGroup, active });
  }, [generation, groups, spreadGroup, active]);
}
