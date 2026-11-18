"use client";

import type { Polygon } from "@homi/search";
import type { Map as LMap } from "leaflet";
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from "react";

import { launchMapOptions } from "@/lib/deeplinks/launch";

import { FIT_MAX_ZOOM, FIT_MS, FIT_PADDING, fitKey, polygonBounds, readFit, robustBounds, writeFit } from "../camera";
import type { CityView, MapFailReason, MapGroup } from "../types";
import { type LeafletLibrary, loadLeaflet, removeLeafletMap } from "./library";

/**
 * The Leaflet map of the Leaflet view (WP-28 "Leaflet view"): created after `loadLeaflet()`, removed in the effect
 * cleanup, so a container never holds two maps (with `cacheComponents` a hidden route's effects are cleaned up and
 * re-created when it shows again, `cacheComponents.md`, "Navigation with Activity"). Dependent hooks read `mapRef`
 * in their effects and list `generation`, which changes with every new map; between a removal and the next map
 * `mapRef` is `null`. Leaflet zoom is the app's zoom scale (`camera.ts`), so no conversion is needed here.
 */

export type LeafletInstance = { map: LMap } & LeafletLibrary;

export type LeafletHandle = { mapRef: RefObject<LeafletInstance | null>; generation: number };

/** The deepest zoom of the Leaflet map (the raster tiles go one further, `RASTER_MAX_ZOOM`). */
export const LEAFLET_MAX_ZOOM = 18;

type DebugWindow = Window & { homiMap?: unknown };

/** Leaflet animates whatever the system asks (MapLibre jumps by itself): the view's flights check this first. */
export function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type LeafletMapInput = {
  cityView: CityView;
  /** `cityView` is the city's own (`MapViewProps.cityKnown`); the stand-in opens without fit memory. */
  cityKnown: boolean;
  onFail(reason: MapFailReason): void;
  onBackground(): void;
};

/**
 * Creates the map once per mount (and again after an Activity hide and show). The library failing to load, or the
 * map failing to be made, is a `chunk` failure, reported once per map. A map `click` is a background tap: Leaflet
 * fires it only for the map itself, a marker's click does not bubble to it. Zoom buttons, the keyboard, the built-in
 * attribution (`MapAttribution` draws it) and world copies are off; the first camera is the one the route had when
 * it was hidden, else the known city's fit memory, else the city view. `?mapdebug` exposes the map as
 * `window.homiMap` outside production (TMA-012).
 */
export function useLeafletMap(container: RefObject<HTMLElement | null>, input: LeafletMapInput): LeafletHandle {
  const { cityView, cityKnown, onFail, onBackground } = input;
  const mapRef = useRef<LeafletInstance | null>(null);
  const kept = useRef<CityView | null>(null);
  const [generation, setGeneration] = useState(0);

  const initial = useEffectEvent(() => kept.current ?? (cityKnown ? readFit(cityView.center) : null) ?? cityView);
  const fail = useEffectEvent((reason: MapFailReason) => onFail(reason));
  const background = useEffectEvent(() => onBackground());

  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return;
    }
    let cancelled = false;
    let created: LMap | null = null;

    loadLeaflet().then(
      (library) => {
        if (cancelled) {
          return;
        }
        const view = initial();
        let map: LMap;
        try {
          map = library.L.map(element, {
            center: [view.center[0], view.center[1]],
            zoom: view.zoom,
            maxZoom: LEAFLET_MAX_ZOOM,
            zoomControl: false,
            attributionControl: false,
            keyboard: false,
            worldCopyJump: false,
          });
        } catch {
          fail("chunk");
          return;
        }
        map.on("click", () => background());
        if (launchMapOptions().debug) {
          (window as DebugWindow).homiMap = map;
        }
        created = map;
        mapRef.current = { map, ...library };
        setGeneration((value) => value + 1);
      },
      () => {
        if (!cancelled) {
          fail("chunk");
        }
      },
    );

    return () => {
      cancelled = true;
      if (created === null) {
        return;
      }
      const map = created;
      const center = map.getCenter();
      kept.current = { center: [center.lat, center.lng], zoom: map.getZoom() };
      if ((window as DebugWindow).homiMap === map) {
        delete (window as DebugWindow).homiMap;
      }
      mapRef.current = null;
      removeLeafletMap(map);
    };
  }, [container]);

  return { mapRef, generation };
}

export type LeafletCameraInput = {
  responseId: number;
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
 * The camera rules of WP-27 "Camera" on Leaflet, the same as `useMapCamera` of GL: a new answer fits the polygon's
 * box, else the robust box of the points, with `FIT_PADDING` up to zoom 14 — the first fit of a mount jumps, later
 * ones fly for 500 ms; a regrouping without a new answer does not move the camera; a new city jumps to its view; the
 * first fit for a city is its fit memory; the Tashkent stand-in keeps none and is replaced by the first known city
 * only while no fit has moved the camera. Leaflet snaps to whole zooms, so a fit's zoom is a whole one. Reduced
 * motion turns the flights into jumps. Answers whether the current map has had its first fit — also a map made again
 * after an Activity re-show once an earlier map was fitted, since it opens at that camera.
 */
export function useLeafletCamera(
  { mapRef, generation }: LeafletHandle,
  { responseId, groups, polygon, cityView, cityKnown }: LeafletCameraInput,
): boolean {
  const fitted = useRef(0);
  // The first fit of the current map: the deferred basemap waits for it (WP-28 "Basemap").
  const [firstFit, setFirstFit] = useState(0);
  const animate = useRef(false);
  const shownCity = useRef<string | null>(null);
  const standIn = useRef(false);
  const savedCity = useRef<string | null>(null);
  const city = cityKnown ? fitKey(cityView.center) : null;

  const jumpToCity = useEffectEvent((map: LMap, opening: boolean) => {
    const view = (opening ? readFit(cityView.center) : null) ?? cityView;
    map.setView([view.center[0], view.center[1]], view.zoom, { animate: false });
  });

  const fit = useEffectEvent(({ map, L }: LeafletInstance) => {
    const box = polygon !== null ? polygonBounds(polygon) : robustBounds(pointsOf(groups));
    if (box === null) {
      return false;
    }
    const bounds = L.latLngBounds([box.south, box.west], [box.north, box.east]);
    const topLeft = L.point(FIT_PADDING.left, FIT_PADDING.top);
    const bottomRight = L.point(FIT_PADDING.right, FIT_PADDING.bottom);
    const zoom = Math.min(map.getBoundsZoom(bounds, false, topLeft.add(bottomRight)), FIT_MAX_ZOOM);
    // A container smaller than the padding has no zoom that fits (Leaflet answers NaN): the camera stays.
    if (!Number.isFinite(zoom)) {
      return false;
    }
    // The centre `fitBounds` would pick, so the fit memory holds the camera the map ends at.
    const middle = map
      .project(bounds.getSouthWest(), zoom)
      .add(map.project(bounds.getNorthEast(), zoom))
      .divideBy(2)
      .add(bottomRight.subtract(topLeft).divideBy(2));
    const center = map.unproject(middle, zoom);
    if (animate.current && !reducedMotion()) {
      map.flyTo(center, zoom, { duration: FIT_MS / 1000 });
    } else {
      map.setView(center, zoom, { animate: false });
    }
    animate.current = true;
    if (city !== null && savedCity.current !== city) {
      savedCity.current = city;
      writeFit(cityView.center, { center: [center.lat, center.lng], zoom });
    }
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
    } else if (shownCity.current === null && standIn.current && !animate.current) {
      jumpToCity(instance.map, true);
    }
    shownCity.current = city;
    standIn.current = false;
  }, [mapRef, generation, city]);

  useEffect(() => {
    const instance = mapRef.current;
    if (instance === null) {
      return;
    }
    if (responseId === fitted.current) {
      // A map made again after an Activity re-show opens at the camera of the earlier fit: it is settled.
      if (animate.current) {
        setFirstFit(generation);
      }
      return;
    }
    fitted.current = responseId;
    if (fit(instance)) {
      setFirstFit(generation);
    }
  }, [mapRef, generation, responseId]);

  return generation > 0 && firstFit === generation;
}
