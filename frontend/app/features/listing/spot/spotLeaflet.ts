import "leaflet/dist/leaflet.css";

import type { CircleMarker, FitBoundsOptions, LatLngBounds, Layer, Map as LMap } from "leaflet";

import { LOCATE_MS } from "@/features/map/camera";
import { rasterLayer, vectorLayer } from "@/features/map/leaflet/basemap";
import { type LeafletLibrary, loadLeaflet } from "@/features/map/leaflet/library";
import { LEAFLET_MAX_ZOOM } from "@/features/map/leaflet/useLeafletMap";
import { paletteOf } from "@/features/map/palette";
import type { MapFailReason } from "@/features/map/types";

import { type GeoPoint, SPOT_FILL_OPACITY, SPOT_LINE_WIDTH, SPOT_MAX_ZOOM, spotBounds, spotPadding } from "./spotGeometry";
import type { SpotEngine, SpotInput, SpotInstance } from "./useSpotMap";

/**
 * The spot map on Leaflet (WP-28 "Spot map"): the chunk `useSpotMap` imports when the session's engine is Leaflet or
 * GL failed, with the library's CSS. The basemap layers are the search map's (`leaflet/basemap.ts`): none while
 * reference data is absent (the container's background), the OSM raster, or the Protomaps vector layer, whose tile
 * errors the hook turns into the raster. The circle and the user's dot are vector paths; Leaflet zoom is the app's zoom
 * scale (`camera.ts`).
 */

/** The user's dot: the search map's "where am I" circle marker of radius 7 (WP-28 "Mask. Locate"). */
const USER_DOT_RADIUS = 7;

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function basemapLayer(library: LeafletLibrary, { basemap, scheme, lite, locale, onVectorError }: SpotInput): Layer | null {
  switch (basemap.kind) {
    case "none":
      return null;
    case "raster":
      return rasterLayer(library.L);
    case "pmtiles":
    case "template":
      return vectorLayer(library, { url: basemap.url, scheme, lite, locale, onError: onVectorError });
  }
}

function create(library: LeafletLibrary, element: HTMLElement, input: SpotInput, onFail: (reason: MapFailReason) => void): SpotInstance | null {
  const { L } = library;
  const { interactive, spot } = input;
  const palette = paletteOf(input.scheme);
  /** The fit's options for the container's size now (`spotPadding`). */
  const fitOptions = (): FitBoundsOptions => {
    const padding = spotPadding(interactive, { width: element.clientWidth, height: element.clientHeight });
    return { paddingTopLeft: [padding.left, padding.top], paddingBottomRight: [padding.right, padding.bottom], maxZoom: SPOT_MAX_ZOOM };
  };
  const boundsOf = (user: GeoPoint | null): LatLngBounds => {
    const box = spotBounds(spot, user);
    return L.latLngBounds([box.south, box.west], [box.north, box.east]);
  };

  let map: LMap;
  try {
    map = L.map(element, {
      maxZoom: LEAFLET_MAX_ZOOM,
      zoomControl: false,
      attributionControl: false,
      keyboard: false,
      worldCopyJump: false,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: interactive,
    });
    map.fitBounds(boundsOf(input.user), { ...fitOptions(), animate: false });
  } catch {
    onFail("chunk");
    return null;
  }

  basemapLayer(library, input)?.addTo(map);
  L.circle([spot.lat, spot.lon], {
    radius: spot.radius,
    color: palette.mask.outline,
    weight: SPOT_LINE_WIDTH,
    fillColor: palette.mask.outline,
    fillOpacity: SPOT_FILL_OPACITY,
    interactive: false,
  }).addTo(map);

  let dot: CircleMarker | null = null;
  const showUser = (user: GeoPoint | null) => {
    dot?.remove();
    dot =
      user === null
        ? null
        : L.circleMarker([user.lat, user.lon], {
            radius: USER_DOT_RADIUS,
            color: palette.me.ring,
            weight: 2.5,
            fillColor: palette.me.dot,
            fillOpacity: 1,
            interactive: false,
          }).addTo(map);
  };
  showUser(input.user);

  return {
    showUser,
    fit(user) {
      if (reducedMotion()) {
        map.fitBounds(boundsOf(user), { ...fitOptions(), animate: false });
      } else {
        map.flyToBounds(boundsOf(user), { ...fitOptions(), duration: LOCATE_MS / 1000 });
      }
    },
    remove() {
      map.off();
      map.remove();
    },
  };
}

/**
 * Loads `leaflet` with its plugins (once per session, `leaflet/library.ts`); a rejection leaves the spot map without a
 * map, the box in its background colour.
 */
export async function loadSpotEngine(): Promise<SpotEngine> {
  const library = await loadLeaflet();
  return { create: (element, input, onFail) => create(library, element, input, onFail) };
}
