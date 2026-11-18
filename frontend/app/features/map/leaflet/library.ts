import type * as Leaflet from "leaflet";
import type { Map as LMap } from "leaflet";
import type * as ProtomapsLeaflet from "protomaps-leaflet";

export type LeafletModule = typeof Leaflet;

export type ProtomapsModule = typeof ProtomapsLeaflet;

export type LeafletLibrary = { L: LeafletModule; protomaps: ProtomapsModule };

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

type ZoomInternals = {
  _animatingZoom?: boolean;
  touchZoom?: { _animRequest?: number; _zooming?: boolean };
  scrollWheelZoom?: { _timer?: ReturnType<typeof setTimeout> };
};

/**
 * Removes a map with its listeners. Leaflet 1.9.4's `remove()` leaves three callbacks of a zoom in flight: the 250 ms
 * timer that ends a zoom animation (`_onZoomTransitionEnd`), a pinch's animation frame (`touchZoom._animRequest`) and
 * the wheel's debounce timer (`scrollWheelZoom._timer`, kept pending by a trackpad's momentum); on a removed map each
 * reads the deleted map pane and throws. They are cleared first, so none runs or each returns at once (private fields
 * of the pinned version, re-checked on an upgrade, KI-61); a pinch's document listeners then stay until the page
 * unloads, doing nothing.
 */
export function removeLeafletMap(map: LMap): void {
  const internals = map as unknown as ZoomInternals;
  internals._animatingZoom = false;
  const pinch = internals.touchZoom;
  if (pinch !== undefined) {
    if (pinch._animRequest !== undefined) {
      cancelAnimationFrame(pinch._animRequest);
    }
    pinch._zooming = false;
  }
  clearTimeout(internals.scrollWheelZoom?._timer);
  map.off();
  map.remove();
}
