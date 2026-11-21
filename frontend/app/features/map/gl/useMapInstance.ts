"use client";

import type { Polygon } from "@homi/search";
import type { ErrorEvent, MapMouseEvent, StyleSpecification } from "maplibre-gl";
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from "react";

import { launchMapOptions } from "@/lib/deeplinks/launch";

import {
  type CameraMemory,
  FIT_MAX_ZOOM,
  FIT_MS,
  FIT_PADDING,
  fitKey,
  fromGlZoom,
  GL_MAX_ZOOM,
  polygonBounds,
  readFit,
  recallCamera,
  rememberCamera,
  robustBounds,
  toGlZoom,
  writeFit,
} from "../camera";
import { osmTransformRequest } from "../tiles";
import type { CityView, MapFailReason, MapGroup } from "../types";
import { resetBasemapForTests } from "../useBasemap";
import { loadMapLibre, type MapLibreModule } from "./library";
import { BASEMAP_SOURCE } from "./style";

/**
 * The MapLibre map of the GL view (WP-27 "Camera", "Basemap and tiles"): created after `loadMapLibre()`, removed in
 * the effect cleanup. With `cacheComponents` a hidden route's effects are cleaned up and re-created when it shows
 * again (`cacheComponents.md`, "Navigation with Activity"), so the map is removed on a tab switch and created anew
 * on return, at the camera it had. Dependent hooks read `mapRef` in their effects and list `generation`, which
 * changes with every new map; between a removal and the next map `mapRef` is `null`.
 */

export type GlMap = InstanceType<MapLibreModule["Map"]>;

export type MapInstance = { map: GlMap; maplibre: MapLibreModule };

export type MapHandle = { mapRef: RefObject<MapInstance | null>; generation: number };

/** The canvas never renders above this pixel ratio; lite mode renders at 1. */
export const MAX_PIXEL_RATIO = 2;

/** The message of MapLibre's error event when a worker cannot start (the copy under `public/maplibre/` is missing). */
const WORKER_FAILED = "Worker failed to load";

export function pixelRatioOf(lite: boolean): number {
  if (lite) {
    return 1;
  }
  return Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

/**
 * The marker a DOM event hit, if any. Markers live in the map's canvas container, so a tap on one is also a map
 * `click`; the background tap and the marker tap tell themselves apart by this.
 */
export function markerRoot(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".maplibregl-marker") : null;
}

type DebugWindow = Window & { homiMap?: unknown };

/** The shared basemap rule moved to `features/map/useBasemap.ts` (WP-28), so Leaflet reads the same session state. */
export { useBasemap } from "../useBasemap";

/** Forgets the session's vector failure and its report; tests only. */
export function resetMapInstanceForTests(): void {
  resetBasemapForTests();
}

export type MapInstanceInput = {
  /** The search of the points (`MapViewProps.cameraKey`): the first camera is the one remembered for it. */
  cameraKey: string;
  /** The view's camera memory, shared with `useMapCamera` (WP-37). */
  memoryRef: RefObject<CameraMemory>;
  /** The style of the current inputs (`buildStyle`); a new object is applied with a diff, never a new map. */
  style: StyleSpecification;
  cityView: CityView;
  /** `cityView` is the city's own (`MapViewProps.cityKnown`); the stand-in opens without fit memory. */
  cityKnown: boolean;
  lite: boolean;
  onFail(reason: MapFailReason): void;
  onBackground(): void;
  /** An error of the vector basemap source: the view falls back to the raster. */
  onVectorError(): void;
};

/**
 * Creates the map once per mount (and again after an Activity hide and show), maps its failures (LB-APP-019) and
 * keeps its style and pixel ratio current. Failures: the library chunk rejects or a worker cannot start → `chunk`;
 * no WebGL2 (`GPUInitializationError`, also when a lost context cannot be restored) → `webgl`; any other throw of the
 * constructor → `style`; each reported once per map. A vector source error is not a failure (`onVectorError`). A
 * map `click` whose target is not a marker is a background tap. Rotation, pitch and the keyboard are off, there are
 * no world copies and no built-in attribution (`MapAttribution` draws it); the first camera is the one the route had
 * when it was hidden, else the one this engine's map was left at for the same search in this launch (WP-37,
 * `recallCamera`), else the known city's fit memory, else the city view (the Tashkent stand-in until a city view is
 * known, WP-27 "Camera"). The cleanup saves the camera for the search it was last fitted or restored for
 * (`rememberCamera`). `?mapdebug` exposes the map as `window.homiMap` outside production (TMA-012).
 */
export function useMapInstance(container: RefObject<HTMLElement | null>, input: MapInstanceInput): MapHandle {
  const { style, cityView, cityKnown, lite, onFail, onBackground, onVectorError, cameraKey, memoryRef } = input;
  const mapRef = useRef<MapInstance | null>(null);
  const kept = useRef<CityView | null>(null);
  const applied = useRef<StyleSpecification | null>(null);
  const [generation, setGeneration] = useState(0);

  const initial = useEffectEvent(() => {
    const recalled = kept.current === null ? recallCamera("gl", cameraKey) : null;
    if (recalled !== null) {
      memoryRef.current.restored = cameraKey;
      memoryRef.current.placed = cameraKey;
    }
    return {
      style,
      view: kept.current ?? recalled ?? (cityKnown ? readFit(cityView.center) : null) ?? cityView,
      pixelRatio: pixelRatioOf(lite),
    };
  });
  const save = useEffectEvent((view: CityView) => {
    const { placed } = memoryRef.current;
    if (placed !== null) {
      rememberCamera("gl", placed, view);
    }
  });
  const fail = useEffectEvent((reason: MapFailReason) => onFail(reason));
  const background = useEffectEvent(() => onBackground());
  const vectorError = useEffectEvent(() => onVectorError());

  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return;
    }
    let cancelled = false;
    let failed = false;
    let created: { map: GlMap; detach(): void } | null = null;
    const failOnce = (reason: MapFailReason) => {
      if (!cancelled && !failed) {
        failed = true;
        fail(reason);
      }
    };

    loadMapLibre().then(
      (maplibre) => {
        if (cancelled) {
          return;
        }
        const { style: first, view, pixelRatio } = initial();
        let map: GlMap;
        try {
          map = new maplibre.Map({
            container: element,
            style: first,
            validateStyle: false,
            center: [view.center[1], view.center[0]],
            zoom: toGlZoom(view.zoom),
            maxZoom: GL_MAX_ZOOM,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            keyboard: false,
            renderWorldCopies: false,
            pixelRatio,
            attributionControl: false,
            transformRequest: osmTransformRequest,
          });
        } catch (error) {
          failOnce(error instanceof maplibre.GPUInitializationError ? "webgl" : "style");
          return;
        }
        map.touchZoomRotate.disableRotation();
        const onError = (event: ErrorEvent) => {
          const { error } = event;
          if (error instanceof maplibre.GPUInitializationError) {
            failOnce("webgl");
          } else if (typeof error?.message === "string" && error.message.startsWith(WORKER_FAILED)) {
            failOnce("chunk");
          } else if ((event as { sourceId?: unknown }).sourceId === BASEMAP_SOURCE) {
            vectorError();
          }
        };
        const onClick = (event: MapMouseEvent) => {
          if (markerRoot(event.originalEvent.target) === null) {
            background();
          }
        };
        map.on("error", onError);
        map.on("click", onClick);
        if (launchMapOptions().debug) {
          (window as DebugWindow).homiMap = map;
        }
        created = {
          map,
          detach() {
            map.off("error", onError);
            map.off("click", onClick);
          },
        };
        applied.current = first;
        mapRef.current = { map, maplibre };
        setGeneration((value) => value + 1);
      },
      () => failOnce("chunk"),
    );

    return () => {
      cancelled = true;
      if (created === null) {
        return;
      }
      const { map, detach } = created;
      const center = map.getCenter();
      kept.current = { center: [center.lat, center.lng], zoom: fromGlZoom(map.getZoom()) };
      save(kept.current);
      if ((window as DebugWindow).homiMap === map) {
        delete (window as DebugWindow).homiMap;
      }
      mapRef.current = null;
      applied.current = null;
      detach();
      map.remove();
    };
  }, [container]);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null || applied.current === style) {
      return;
    }
    applied.current = style;
    instance.map.setStyle(style, { diff: true });
  }, [generation, style]);

  useEffect(() => {
    const instance = mapRef.current;
    const pixelRatio = pixelRatioOf(lite);
    if (instance !== null && instance.map.getPixelRatio() !== pixelRatio) {
      instance.map.setPixelRatio(pixelRatio);
    }
  }, [generation, lite]);

  return { mapRef, generation };
}

export type MapCameraInput = {
  responseId: number;
  /** The search of the points: a first answer for the restored search keeps the remembered camera (WP-37). */
  cameraKey: string;
  memoryRef: RefObject<CameraMemory>;
  groups: readonly MapGroup[];
  polygon: Polygon | null;
  cityView: CityView;
  cityKnown: boolean;
};

/** Every shown listing's location, a stack once per listing: the robust box weighs points, not groups. */
function pointsOf(groups: readonly MapGroup[]): MapGroup[] {
  return groups.flatMap((group) => group.items.map(() => group));
}

/**
 * The camera rules of WP-27 "Camera" (SCR-011). A new answer (`responseId`) fits the polygon's box, else the robust
 * box of the points, with `FIT_PADDING` up to zoom 14 (Leaflet scale): the first fit of a mount jumps, later ones
 * ease for 500 ms. A regrouping without a new answer (a hidden listing) does not move the camera. A new city jumps
 * to its view and the next answer fits; the first fit for a city is kept as its fit memory (`writeFit`). Until the
 * city's view is known the camera shows the Tashkent stand-in, which keeps no fit memory; its replacement by the
 * first known view is not a city change: the camera opens that city (fit memory, else its view) only when no fit has
 * moved it yet, so a fit to the points is never thrown away. An Activity re-show keeps the camera the route had. A map
 * that opened at the camera remembered for its search (WP-37) takes the first answer for that search without a fit, as
 * if it had fitted it; an answer for another search fits. Reduced motion turns the eases into jumps (MapLibre,
 * non-essential).
 */
export function useMapCamera(
  { mapRef, generation }: MapHandle,
  { responseId, groups, polygon, cityView, cityKnown, cameraKey, memoryRef }: MapCameraInput,
): void {
  const fitted = useRef(0);
  const animate = useRef(false);
  /** The known city the camera was last set for. */
  const shownCity = useRef<string | null>(null);
  /** A map was shown on the stand-in before any city view was known. */
  const standIn = useRef(false);
  const savedCity = useRef<string | null>(null);
  const city = cityKnown ? fitKey(cityView.center) : null;

  const jumpToCity = useEffectEvent((map: GlMap, opening: boolean) => {
    const view = (opening ? readFit(cityView.center) : null) ?? cityView;
    map.jumpTo({ center: [view.center[1], view.center[0]], zoom: toGlZoom(view.zoom) });
  });

  const fit = useEffectEvent(({ map, maplibre }: MapInstance) => {
    const box = polygon !== null ? polygonBounds(polygon) : robustBounds(pointsOf(groups));
    if (box === null) {
      return;
    }
    const camera = map.cameraForBounds(
      [
        [box.west, box.south],
        [box.east, box.north],
      ],
      { padding: FIT_PADDING, maxZoom: toGlZoom(FIT_MAX_ZOOM) },
    );
    if (camera?.center === undefined || camera.zoom === undefined) {
      return;
    }
    const center = maplibre.LngLat.convert(camera.center);
    const { zoom } = camera;
    if (animate.current) {
      map.easeTo({ center, zoom, duration: FIT_MS });
    } else {
      map.jumpTo({ center, zoom });
    }
    animate.current = true;
    memoryRef.current.placed = cameraKey;
    if (city !== null && savedCity.current !== city) {
      savedCity.current = city;
      writeFit(cityView.center, { center: [center.lat, center.lng], zoom: fromGlZoom(zoom) });
    }
  });

  /** The first answer after a restore: `true` when it is for the restored search, which keeps the camera. */
  const keepsRestored = useEffectEvent(() => {
    const { restored } = memoryRef.current;
    memoryRef.current.restored = null;
    if (restored === null || restored !== cameraKey) {
      return false;
    }
    animate.current = true;
    return true;
  });

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null) {
      return;
    }
    if (city === null) {
      if (shownCity.current === null) {
        standIn.current = true;
      }
      return;
    }
    if (shownCity.current !== null && shownCity.current !== city) {
      jumpToCity(instance.map, false);
    } else if (shownCity.current === null && standIn.current && !animate.current && memoryRef.current.restored === null) {
      jumpToCity(instance.map, true);
    }
    shownCity.current = city;
    standIn.current = false;
  }, [mapRef, generation, city, memoryRef]);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null || responseId === fitted.current) {
      return;
    }
    fitted.current = responseId;
    if (!keepsRestored()) {
      fit(instance);
    }
  }, [mapRef, generation, responseId]);
}
