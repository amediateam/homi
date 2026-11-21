import "maplibre-gl/dist/maplibre-gl.css";

import type { ErrorEvent } from "maplibre-gl";

import { GL_MAX_ZOOM, toGlZoom } from "@/features/map/camera";
import { loadMapLibre, type MapLibreModule } from "@/features/map/gl/library";
import { BASEMAP_SOURCE, buildStyle } from "@/features/map/gl/style";
import { pixelRatioOf } from "@/features/map/gl/useMapInstance";
import { osmTransformRequest } from "@/features/map/tiles";
import type { MapFailReason } from "@/features/map/types";

import type { PickEngine, PickInput, PickInstance, UserPosition } from "./usePickerMap";

const WORKER_FAILED = "Worker failed to load";
/** A tap eases the centre to the tapped point (SCR-051). */
const TAP_EASE_MS = 300;
const FLY_MS = 800;

function styleOf(input: PickInput, user: UserPosition | null) {
  return buildStyle({
    basemap: input.basemap,
    scheme: input.scheme,
    lite: input.lite,
    locale: input.locale,
    mask: null,
    me: user === null ? null : { lat: user.lat, lon: user.lon, accuracy: user.accuracy },
  });
}

/**
 * The picker on MapLibre GL (WP-81, SCR-051): the search map's style without the mask, no rotation, pitch, keyboard or
 * world copies, the pixel ratio of lite graphics; a tap eases the centre to the tapped point in 300 ms.
 */
function create(maplibre: MapLibreModule, element: HTMLElement, input: PickInput, onFail: (reason: MapFailReason) => void): PickInstance | null {
  let map: InstanceType<MapLibreModule["Map"]>;
  try {
    map = new maplibre.Map({
      container: element,
      style: styleOf(input, null),
      validateStyle: false,
      center: [input.start.lon, input.start.lat],
      zoom: toGlZoom(input.start.zoom),
      maxZoom: GL_MAX_ZOOM,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      keyboard: false,
      renderWorldCopies: false,
      pixelRatio: pixelRatioOf(input.lite),
      attributionControl: false,
      transformRequest: osmTransformRequest,
    });
  } catch (error) {
    onFail(error instanceof maplibre.GPUInitializationError ? "webgl" : "style");
    return null;
  }
  map.touchZoomRotate.disableRotation();
  const onError = (event: ErrorEvent) => {
    const { error } = event;
    if (error instanceof maplibre.GPUInitializationError) {
      onFail("webgl");
    } else if (typeof error?.message === "string" && error.message.startsWith(WORKER_FAILED)) {
      onFail("chunk");
    } else if ((event as { sourceId?: unknown }).sourceId === BASEMAP_SOURCE) {
      input.onVectorError();
    }
  };
  const center = () => {
    const point = map.getCenter();
    return { lat: point.lat, lon: point.lng };
  };
  const onMoveStart = () => input.onMoveStart();
  const onMoveEnd = () => input.onMoveEnd(center());
  const onClick = (event: { lngLat: { lng: number; lat: number } }) => map.easeTo({ center: [event.lngLat.lng, event.lngLat.lat], duration: TAP_EASE_MS });
  map.on("error", onError);
  map.on("movestart", onMoveStart);
  map.on("moveend", onMoveEnd);
  map.on("click", onClick);
  return {
    center,
    flyTo(point, zoom) {
      map.flyTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), toGlZoom(zoom)), duration: FLY_MS });
    },
    showUser(user) {
      map.setStyle(styleOf(input, user), { diff: true });
    },
    remove() {
      map.off("error", onError);
      map.off("movestart", onMoveStart);
      map.off("moveend", onMoveEnd);
      map.off("click", onClick);
      map.remove();
    },
  };
}

export async function loadPickEngine(): Promise<PickEngine> {
  const maplibre = await loadMapLibre();
  return { create: (element, input, onFail) => create(maplibre, element, input, onFail) };
}
