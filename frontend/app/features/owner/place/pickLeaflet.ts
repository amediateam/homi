import "leaflet/dist/leaflet.css";

import type { Circle, CircleMarker, Layer, Map as LMap } from "leaflet";

import { rasterLayer, vectorLayer } from "@/features/map/leaflet/basemap";
import { type LeafletLibrary, loadLeaflet, removeLeafletMap } from "@/features/map/leaflet/library";
import { LEAFLET_MAX_ZOOM } from "@/features/map/leaflet/useLeafletMap";
import { paletteOf } from "@/features/map/palette";
import type { MapFailReason } from "@/features/map/types";

import type { PickEngine, PickInput, PickInstance, UserPosition } from "./usePickerMap";

const USER_DOT_RADIUS = 7;

function basemapLayer(library: LeafletLibrary, { basemap, scheme, lite, locale, onVectorError }: PickInput): Layer | null {
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

/** The picker on Leaflet (WP-81, SCR-051): `zoomSnap: 0.25`, the search map's basemap, the "me" dot and its circle. */
function create(library: LeafletLibrary, element: HTMLElement, input: PickInput, onFail: (reason: MapFailReason) => void): PickInstance | null {
  const { L } = library;
  const palette = paletteOf(input.scheme);
  let map: LMap;
  try {
    map = L.map(element, {
      maxZoom: LEAFLET_MAX_ZOOM,
      zoomSnap: 0.25,
      zoomControl: false,
      attributionControl: false,
      keyboard: false,
      worldCopyJump: false,
    });
    map.setView([input.start.lat, input.start.lon], input.start.zoom, { animate: false });
  } catch {
    onFail("chunk");
    return null;
  }
  basemapLayer(library, input)?.addTo(map);
  const center = () => {
    const point = map.getCenter();
    return { lat: point.lat, lng: point.lng };
  };
  map.on("movestart", () => input.onMoveStart());
  map.on("moveend", () => {
    const point = center();
    input.onMoveEnd({ lat: point.lat, lon: point.lng });
  });
  map.on("click", (event: { latlng: { lat: number; lng: number } }) => map.panTo([event.latlng.lat, event.latlng.lng], { duration: 0.3 }));
  let dot: CircleMarker | null = null;
  let ring: Circle | null = null;
  return {
    center() {
      const point = center();
      return { lat: point.lat, lon: point.lng };
    },
    flyTo(point, zoom) {
      map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), zoom), { duration: 0.8 });
    },
    showUser(user: UserPosition | null) {
      dot?.remove();
      ring?.remove();
      dot = null;
      ring = null;
      if (user === null) {
        return;
      }
      if (user.accuracy !== null) {
        ring = L.circle([user.lat, user.lon], { radius: user.accuracy, color: palette.me.ring, weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
      }
      dot = L.circleMarker([user.lat, user.lon], { radius: USER_DOT_RADIUS, color: palette.me.ring, weight: 2.5, fillColor: palette.me.dot, fillOpacity: 1, interactive: false }).addTo(map);
    },
    remove() {
      removeLeafletMap(map);
    },
  };
}

export async function loadPickEngine(): Promise<PickEngine> {
  const library = await loadLeaflet();
  return { create: (element, input, onFail) => create(library, element, input, onFail) };
}
