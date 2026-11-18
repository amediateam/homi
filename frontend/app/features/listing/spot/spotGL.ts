import "maplibre-gl/dist/maplibre-gl.css";

import type { ErrorEvent, GeoJSONSourceSpecification, LayerSpecification, LngLatBoundsLike, StyleSpecification } from "maplibre-gl";

import { GL_MAX_ZOOM, LOCATE_MS, type Padding, toGlZoom } from "@/features/map/camera";
import { loadMapLibre, type MapLibreModule } from "@/features/map/gl/library";
import { BASEMAP_SOURCE, buildStyle, ME_ACCURACY_LAYER } from "@/features/map/gl/style";
import { pixelRatioOf } from "@/features/map/gl/useMapInstance";
import { paletteOf } from "@/features/map/palette";
import { osmTransformRequest } from "@/features/map/tiles";
import type { MapFailReason } from "@/features/map/types";

import {
  circleRing,
  type GeoPoint,
  SPOT_FILL_OPACITY,
  SPOT_LINE_WIDTH,
  SPOT_MAX_ZOOM,
  spotBounds,
  spotPadding,
  yandexZoom,
} from "./spotGeometry";
import type { SpotEngine, SpotInput, SpotInstance } from "./useSpotMap";

/**
 * The spot map on MapLibre GL (WP-28 "Spot map"): the chunk `useSpotMap` imports when the session's engine is GL,
 * with the library's CSS. The style is the search map's (`buildStyle` of WP-27: basemap, theme, lite mode, locale)
 * with the spot's circle under the user's dot; the dot is the search map's "me" without its accuracy circle. An error
 * of the vector source is reported, as the search map does, and the hook moves the session to the raster.
 * Coordinates are `[lon, lat]` and zooms on the GL scale here.
 */

const SPOT_SOURCE = "spot";
const SPOT_FILL_LAYER = "spot-fill";
const SPOT_LINE_LAYER = "spot-line";

/** The message of MapLibre's error event when a worker cannot start (`useMapInstance`). */
const WORKER_FAILED = "Worker failed to load";

type GlMap = InstanceType<MapLibreModule["Map"]>;

function circleLayers(input: SpotInput): LayerSpecification[] {
  const { outline } = paletteOf(input.scheme).mask;
  return [
    {
      id: SPOT_FILL_LAYER,
      type: "fill",
      source: SPOT_SOURCE,
      paint: { "fill-color": outline, "fill-opacity": SPOT_FILL_OPACITY },
    },
    {
      id: SPOT_LINE_LAYER,
      type: "line",
      source: SPOT_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": outline, "line-width": SPOT_LINE_WIDTH },
    },
  ];
}

/** The style for the spot and the user: the search map's, with the circle inserted below the "me" layers. */
export function spotStyle(input: SpotInput, user: GeoPoint | null): StyleSpecification {
  const base = buildStyle({
    basemap: input.basemap,
    scheme: input.scheme,
    lite: input.lite,
    locale: input.locale,
    mask: null,
    me: user === null ? null : { lat: user.lat, lon: user.lon, accuracy: null },
  });
  const layers = [...base.layers];
  const me = layers.findIndex((layer) => layer.id === ME_ACCURACY_LAYER);
  layers.splice(me === -1 ? layers.length : me, 0, ...circleLayers(input));
  const circle = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circleRing(input.spot)] } };
  return {
    ...base,
    sources: { ...base.sources, [SPOT_SOURCE]: { type: "geojson", data: circle as GeoJSONSourceSpecification["data"] } },
    layers,
  };
}

function boundsOf(input: SpotInput, user: GeoPoint | null): LngLatBoundsLike {
  const box = spotBounds(input.spot, user);
  return [
    [box.west, box.south],
    [box.east, box.north],
  ];
}

/** The fit's options for the container's size now (`spotPadding`). */
function fitOptions(element: HTMLElement, interactive: boolean): { padding: Padding; maxZoom: number } {
  return { padding: spotPadding(interactive, { width: element.clientWidth, height: element.clientHeight }), maxZoom: toGlZoom(SPOT_MAX_ZOOM) };
}

/**
 * Makes the map. The first camera is the fit of the spot (and the user); the spot's centre at the zoom of its radius
 * stands under it, so a fit MapLibre refuses still shows the spot.
 */
function create(maplibre: MapLibreModule, element: HTMLElement, input: SpotInput, onFail: (reason: MapFailReason) => void): SpotInstance | null {
  const { spot } = input;
  let map: GlMap;
  try {
    map = new maplibre.Map({
      container: element,
      style: spotStyle(input, input.user),
      validateStyle: false,
      center: [spot.lon, spot.lat],
      zoom: toGlZoom(yandexZoom(spot.radius)),
      bounds: boundsOf(input, input.user),
      fitBoundsOptions: fitOptions(element, input.interactive),
      maxZoom: GL_MAX_ZOOM,
      interactive: input.interactive,
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
  if (input.interactive) {
    map.touchZoomRotate.disableRotation();
  }
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
  map.on("error", onError);

  return {
    showUser(user) {
      map.setStyle(spotStyle(input, user), { diff: true });
    },
    fit(user) {
      map.fitBounds(boundsOf(input, user), { ...fitOptions(element, input.interactive), duration: LOCATE_MS });
    },
    remove() {
      map.off("error", onError);
      map.remove();
    },
  };
}

/** Loads `maplibre-gl` (once per session, `gl/library.ts`); a rejection is the GL failure `chunk` of `useSpotMap`. */
export async function loadSpotEngine(): Promise<SpotEngine> {
  const maplibre = await loadMapLibre();
  return { create: (element, input, onFail) => create(maplibre, element, input, onFail) };
}
