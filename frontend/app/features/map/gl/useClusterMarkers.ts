"use client";

import type { LngLatBoundsLike, MapMouseEvent, Marker, PointLike } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";

import { tg } from "@/lib/telegram";

import { CLUSTER_MS, CLUSTER_PADDING, GL_MAX_ZOOM } from "../camera";
import { LASSO_RESYNC_MS } from "../lasso/polygon";
import { SPREAD_LABEL_BOX, spreadStackLabels } from "../pins";
import type { MapGroup, MapViewProps, Selection } from "../types";
import { clusterElement, pinElement, setActive, spreadDotElement, spreadPinElement, stackElement } from "../markerElements";
import type { LASSO_MOVE } from "./GlLasso";
import { type ClusterIndex, clusterZoom, type GroupFeature, isCluster, leavesByPrice } from "./useClusterIndex";
import { type GlMap, type MapHandle, type MapInstance, markerRoot } from "./useMapInstance";

/**
 * The markers of the GL view (WP-27 "Pins, stacks, clusters" and "Actions", SCR-011): DOM elements of
 * `markerElements.ts` placed as MapLibre markers for the viewport plus 10 % on each side, synced on `moveend` and
 * when the whole zoom changes — the moves of the lasso's two-finger gesture (`LASSO_MOVE`) once, `LASSO_RESYNC_MS`
 * after the last one (WP-28 "Lasso") — and reused by key while their content stays the same. A tap is read from the
 * map's own `click` (markers live in its canvas container), so a pan that starts on a marker selects nothing. The
 * markers are pointer targets only, as in legacy: the list view is the keyboard and screen-reader path to the same
 * listings.
 */

/** Markers are kept for the viewport plus this share of its width and height on each side. */
export const VIEWPORT_MARGIN = 0.1;

type LngLat = [lon: number, lat: number];

type Select = (...args: Parameters<MapViewProps["onSelect"]>) => void;

/**
 * The stack a selection spreads: the group of several listings whose numbers are the selection's, in order (a stack
 * tap selects them cheapest first). A pin, or the listings of a cluster at maximum zoom, spread nothing.
 */
export function spreadGroupOf(groups: readonly MapGroup[], selection: Selection): MapGroup | null {
  if (selection === null || selection.numbers.length < 2) {
    return null;
  }
  const { numbers } = selection;
  return (
    groups.find(
      (group) => group.items.length === numbers.length && group.items.every((item, at) => item.number === numbers[at]),
    ) ?? null
  );
}

/** One wanted marker: `signature` names its content, a reused element must have the same. */
type Spec = {
  key: string;
  signature: string;
  lngLat: LngLat;
  /** The listings whose selection makes it active; none for a cluster or the dot. */
  numbers: readonly number[];
  build(): HTMLElement;
  tap(): void;
};

type Entry = { marker: Marker; element: HTMLElement; signature: string; numbers: readonly number[] };

type LayerView = { index: ClusterIndex; spread: MapGroup | null; active: number | null };

type MarkerLayer = { update(view: LayerView): void; destroy(): void };

/** A camera move of the lasso's two-finger gesture: MapLibre copies its event data (`LASSO_MOVE`) onto the events. */
function isLassoMove(event: object): boolean {
  return (event as Partial<typeof LASSO_MOVE>).lasso === true;
}

function viewportBox(map: GlMap): [west: number, south: number, east: number, north: number] {
  const [[west, south], [east, north]] = map.getBounds().toArray();
  const dx = (east - west) * VIEWPORT_MARGIN;
  const dy = (north - south) * VIEWPORT_MARGIN;
  return [Math.max(-180, west - dx), Math.max(-90, south - dy), Math.min(180, east + dx), Math.min(90, north + dy)];
}

function boundsOf(leaves: readonly GroupFeature[]): LngLatBoundsLike {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { properties } of leaves) {
    west = Math.min(west, properties.group.lon);
    east = Math.max(east, properties.group.lon);
    south = Math.min(south, properties.group.lat);
    north = Math.max(north, properties.group.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
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

function createMarkerLayer({ map, maplibre }: MapInstance, select: Select): MarkerLayer {
  const entries = new Map<string, Entry>();
  const spreadEntries: Entry[] = [];
  const taps = new WeakMap<HTMLElement, () => void>();
  let spreadSignature: string | null = null;
  let view: LayerView | null = null;
  let level = clusterZoom(map.getZoom());
  let resync: ReturnType<typeof setTimeout> | null = null;

  function place(element: HTMLElement, lngLat: LngLat, offset?: PointLike): Marker {
    return new maplibre.Marker({ element, anchor: "center", offset }).setLngLat(lngLat).addTo(map);
  }

  function tapCluster(index: ClusterIndex, id: number, lngLat: LngLat): void {
    if (clusterZoom(map.getZoom()) >= GL_MAX_ZOOM) {
      select(leavesByPrice(index, id).map((item) => item.number));
      return;
    }
    tg.haptic.impact();
    const expansion = index.getClusterExpansionZoom(id);
    const camera = map.cameraForBounds(boundsOf(index.getLeaves(id, Infinity)), {
      padding: CLUSTER_PADDING,
      maxZoom: GL_MAX_ZOOM,
    });
    map.easeTo({
      center: camera?.center ?? lngLat,
      zoom: Math.min(GL_MAX_ZOOM, Math.max(camera?.zoom ?? expansion, expansion)),
      duration: CLUSTER_MS,
    });
  }

  function specsOf(index: ClusterIndex): Spec[] {
    const specs: Spec[] = [];
    for (const feature of index.getClusters(viewportBox(map), clusterZoom(map.getZoom()))) {
      const [lon, lat] = feature.geometry.coordinates;
      const lngLat: LngLat = [lon, lat];
      if (isCluster(feature)) {
        const { cluster_id: id, size } = feature.properties;
        specs.push({
          key: `cluster:${id}`,
          signature: String(size),
          lngLat,
          numbers: [],
          build: () => clusterElement(size),
          tap: () => tapCluster(index, id, lngLat),
        });
        continue;
      }
      const { group } = feature.properties;
      const [first] = group.items;
      const numbers = group.items.map((item) => item.number);
      if (numbers.length === 1) {
        specs.push({
          key: `pin:${first.number}`,
          signature: JSON.stringify([first.label, first.tone, first.priced]),
          lngLat,
          numbers,
          build: () => pinElement(first),
          tap: () => select([first.number]),
        });
      } else {
        specs.push({
          key: `stack:${group.key}`,
          signature: JSON.stringify([numbers, first.label, first.tone, first.priced]),
          lngLat,
          numbers,
          build: () => stackElement(group),
          tap: () => select(numbers, 0),
        });
      }
    }
    return specs;
  }

  /** The tapped stack as labelled pins around a dot at its location, until the selection no longer names it. */
  function syncSpread(group: MapGroup | null): void {
    const signature =
      group === null ? null : JSON.stringify([group.key, group.items.map((item) => [item.number, item.label, item.tone, item.priced])]);
    if (signature === spreadSignature) {
      return;
    }
    spreadSignature = signature;
    for (const entry of spreadEntries) {
      entry.marker.remove();
    }
    spreadEntries.length = 0;
    if (group === null || signature === null) {
      return;
    }
    const lngLat: LngLat = [group.lon, group.lat];
    const numbers = group.items.map((item) => item.number);
    const dot = spreadDotElement();
    spreadEntries.push({ marker: place(dot, lngLat), element: dot, signature, numbers: [] });
    const pins = group.items.map((item, at): Entry => {
      const element = spreadPinElement(item);
      taps.set(element, () => select(numbers, at));
      return { marker: place(element, lngLat), element, signature, numbers: [item.number] };
    });
    const offsets = spreadStackLabels(group, labelBox(pins.map((pin) => pin.element)));
    pins.forEach((pin, at) => pin.marker.setOffset([offsets[at].dx, offsets[at].dy]));
    spreadEntries.push(...pins);
  }

  function sync(): void {
    if (view === null) {
      return;
    }
    const wanted = new Map(specsOf(view.index).map((spec) => [spec.key, spec]));
    for (const [key, entry] of entries) {
      if (wanted.get(key)?.signature !== entry.signature) {
        entry.marker.remove();
        entries.delete(key);
      }
    }
    for (const spec of wanted.values()) {
      const entry = entries.get(spec.key);
      if (entry === undefined) {
        const element = spec.build();
        entries.set(spec.key, { marker: place(element, spec.lngLat), element, signature: spec.signature, numbers: spec.numbers });
        taps.set(element, spec.tap);
      } else {
        entry.marker.setLngLat(spec.lngLat);
        taps.set(entry.element, spec.tap);
      }
    }
    syncSpread(view.spread);
    const { active } = view;
    for (const entry of [...entries.values(), ...spreadEntries]) {
      if (entry.numbers.length > 0) {
        setActive(entry.element, active !== null && entry.numbers.includes(active));
      }
    }
  }

  function cancelResync(): void {
    if (resync !== null) {
      clearTimeout(resync);
      resync = null;
    }
  }

  /** A lasso move restarts the deferred sync; any other stop drops it and syncs at once. */
  const onMoveEnd = (event: object) => {
    cancelResync();
    if (isLassoMove(event)) {
      resync = setTimeout(() => {
        resync = null;
        sync();
      }, LASSO_RESYNC_MS);
    } else {
      sync();
    }
  };
  /**
   * A lasso zoom only records the level: MapLibre fires it in the same call as the move's `moveend`, which syncs
   * later, so a pinch across (or around) a whole zoom does not sync every frame.
   */
  const onZoom = (event: object) => {
    const next = clusterZoom(map.getZoom());
    if (next !== level) {
      level = next;
      if (!isLassoMove(event)) {
        sync();
      }
    }
  };
  const onClick = (event: MapMouseEvent) => {
    const root = markerRoot(event.originalEvent.target);
    if (root !== null) {
      taps.get(root)?.();
    }
  };
  map.on("moveend", onMoveEnd);
  map.on("zoom", onZoom);
  map.on("click", onClick);

  return {
    update(next) {
      view = next;
      level = clusterZoom(map.getZoom());
      sync();
    },
    destroy() {
      cancelResync();
      map.off("moveend", onMoveEnd);
      map.off("zoom", onZoom);
      map.off("click", onClick);
      for (const entry of [...entries.values(), ...spreadEntries]) {
        entry.marker.remove();
      }
      entries.clear();
      spreadEntries.length = 0;
      spreadSignature = null;
      view = null;
    },
  };
}

export type ClusterMarkersInput = {
  index: ClusterIndex;
  /** The spread stack (`spreadGroupOf`), drawn at every zoom and left out of `index`. */
  spread: MapGroup | null;
  selection: Selection;
  onSelect: MapViewProps["onSelect"];
};

/**
 * Draws the pins, stacks and clusters of `index`, the spread stack and the `active` marker (the selection's current
 * listing, raised above the others), and turns taps into the contract's selections: a pin selects its listing, a
 * stack all of its listings at index 0, a spread pin the same listings at its index; a cluster below maximum zoom
 * plays a light haptic and eases (500 ms) to its leaves' box with `CLUSTER_PADDING`, at least to its expansion zoom,
 * and at maximum zoom selects its listings cheapest first. A spread stack stays open while the map zooms.
 */
export function useClusterMarkers({ mapRef, generation }: MapHandle, { index, spread, selection, onSelect }: ClusterMarkersInput): void {
  const layer = useRef<MarkerLayer | null>(null);
  const select = useEffectEvent((...args: Parameters<Select>) => onSelect(...args));
  const active = selection === null ? null : (selection.numbers[selection.at] ?? null);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null) {
      return;
    }
    const created = createMarkerLayer(instance, (...args) => select(...args));
    layer.current = created;
    return () => {
      layer.current = null;
      created.destroy();
    };
  }, [mapRef, generation]);

  useEffect(() => {
    layer.current?.update({ index, spread, active });
  }, [generation, index, spread, active]);
}
