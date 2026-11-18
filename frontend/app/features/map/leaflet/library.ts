import type * as Leaflet from "leaflet";
import type * as ProtomapsLeaflet from "protomaps-leaflet";

export type LeafletModule = typeof Leaflet;

export type LeafletLibrary = { L: LeafletModule; protomaps: typeof ProtomapsLeaflet };

let loading: Promise<LeafletLibrary> | null = null;

/**
 * `leaflet`, `leaflet.markercluster` and `protomaps-leaflet`, loaded once per session and in this order: Leaflet
 * 1.9.4 ships only a UMD build, which sets `window.L` when it runs, and both plugins read that global —
 * markercluster when it runs (`L.MarkerClusterGroup = L.FeatureGroup.extend(…)`), protomaps-leaflet when a layer is
 * made (`class extends L.GridLayer`). A failed load clears the promise, so the next call retries.
 */
export function loadLeaflet(): Promise<LeafletLibrary> {
  loading ??= import("leaflet")
    .then(async (leaflet) => {
      const L = (leaflet as { default?: LeafletModule }).default ?? leaflet;
      await import("leaflet.markercluster");
      const protomaps = await import("protomaps-leaflet");
      return { L, protomaps };
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
