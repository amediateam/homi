"use client";

import type { Locale } from "@homi/config";
import { type RefObject, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { currentEngine, type Engine, markGlFailed } from "@/features/map/engine";
import type { Basemap } from "@/features/map/tiles";
import type { MapFailReason, MapScheme } from "@/features/map/types";
import { useBasemap } from "@/features/map/useBasemap";

import type { GeoPoint, Spot } from "./spotGeometry";

export type SpotMapOptions = {
  /** The fullscreen map pans and zooms; the mini map ignores both. */
  interactive: boolean;
  /** `map.tiles_url` of reference data, read as the search map reads it (`MapViewProps.tiles`). */
  tiles: string | null | undefined;
  scheme: MapScheme;
  locale: Locale;
  lite: boolean;
};

/** What an engine draws a map from: the basemap `tiles` resolves to, the look, the spot and the user if known. */
export type SpotInput = Omit<SpotMapOptions, "tiles"> & {
  basemap: Basemap;
  spot: Spot;
  user: GeoPoint | null;
  /** A tile of the vector basemap failed: the session moves to the raster (`useBasemap`) and the map is re-created. */
  onVectorError(): void;
};

/** One live map of an engine. */
export type SpotInstance = {
  /** Draws the user's dot, or removes it for `null`. */
  showUser(user: GeoPoint | null): void;
  /** Fits the spot's circle and, when given, the user's position. */
  fit(user: GeoPoint | null): void;
  /** Removes the map from its container; the container can hold a new one at once. */
  remove(): void;
};

/**
 * An engine whose library has loaded (`spotGL.ts`, `spotLeaflet.ts`). `create` makes the map synchronously, so the
 * hook holds every map it made and its cleanup removes it before the next run. A failure while creating is reported
 * through `onFail` and answers `null`; a failure afterwards (a lost GL context, a worker that cannot start) is
 * reported through `onFail` later.
 */
export type SpotEngine = {
  create(element: HTMLElement, input: SpotInput, onFail: (reason: MapFailReason) => void): SpotInstance | null;
};

/** `idle`: nothing to draw yet (no spot, or the mini map is waiting); `failed`: both engines failed. */
export type SpotMapStatus = "idle" | "loading" | "ready" | "failed";

export type SpotMap = {
  status: SpotMapStatus;
  /** The basemap drawn: the raster after a vector failure, so the attribution follows it (`attributionOf`). */
  basemap: Basemap;
  /** The user's position on the map (kept for a map created later); `null` removes it. Never leaves the page. */
  showUser(user: GeoPoint | null): void;
  /** Fits the spot and the user's position shown, if any. */
  fitSpotAndUser(): void;
};

function loadEngine(engine: Engine): Promise<SpotEngine> {
  return engine === "gl"
    ? import("./spotGL").then((module) => module.loadSpotEngine())
    : import("./spotLeaflet").then((module) => module.loadSpotEngine());
}

/**
 * The listing's spot map in `containerRef` (WP-28 "Spot map"), the only owner of that container (fix of LB-APP-001,
 * «Map container is already initialized»). One effect per spot and look: it takes the session's engine
 * (`currentEngine`), imports `spotGL.ts` or `spotLeaflet.ts` — each loads its library and CSS only then — and creates
 * the map with the circle. Every run has its own cancellation flag: an import that resolves after the cleanup creates
 * nothing, and the cleanup removes the map before the next run creates one. With `cacheComponents` a hidden route's
 * effects are cleaned up and re-created when it shows again (`cacheComponents.md`, "Navigation with Activity"), so a
 * hidden listing holds no map. A GL failure — the chunk or the library rejecting, the map failing to be made or
 * failing later — calls `markGlFailed` (the rest of the session is Leaflet) and the same run continues with Leaflet;
 * Leaflet failing too is `failed`. The basemap is the search map's (`useBasemap`: per `tiles`, the raster for the
 * rest of the session once a vector tile failed); a change of basemap, theme, lite mode or locale re-creates the map.
 * `spot: null` creates nothing.
 */
export function useSpotMap(containerRef: RefObject<HTMLElement | null>, spot: Spot | null, options: SpotMapOptions): SpotMap {
  const { interactive, tiles, scheme, locale, lite } = options;
  const [status, setStatus] = useState<Exclude<SpotMapStatus, "idle">>("loading");
  const { basemap, failVector } = useBasemap(tiles);
  const instanceRef = useRef<SpotInstance | null>(null);
  const userRef = useRef<GeoPoint | null>(null);
  const lat = spot?.lat ?? null;
  const lon = spot?.lon ?? null;
  const radius = spot?.radius ?? null;
  const vectorFailed = useEffectEvent(() => failVector());

  useEffect(() => {
    const found = containerRef.current;
    if (found === null || lat === null || lon === null || radius === null) {
      return undefined;
    }
    const element: HTMLElement = found;
    let cancelled = false;
    let instance: SpotInstance | null = null;
    let vectorReported = false;
    const input: SpotInput = {
      spot: { lat, lon, radius },
      basemap,
      interactive,
      scheme,
      locale,
      lite,
      user: null,
      onVectorError() {
        if (!cancelled && !vectorReported) {
          vectorReported = true;
          vectorFailed();
        }
      },
    };

    function drop(): void {
      instance?.remove();
      instance = null;
      instanceRef.current = null;
    }

    function fallBack(engine: Engine, reason: MapFailReason): void {
      if (engine === "gl") {
        markGlFailed(reason);
        start("leaflet");
      } else {
        setStatus("failed");
      }
    }

    function start(engine: Engine): void {
      loadEngine(engine).then(
        (loaded) => {
          if (cancelled) {
            return;
          }
          let failed = false;
          const onFail = (reason: MapFailReason) => {
            if (cancelled || failed) {
              return;
            }
            failed = true;
            drop();
            setStatus("loading");
            fallBack(engine, reason);
          };
          const created = loaded.create(element, { ...input, user: userRef.current }, onFail);
          if (created === null || failed) {
            created?.remove();
            return;
          }
          instance = created;
          instanceRef.current = created;
          setStatus("ready");
        },
        () => {
          if (!cancelled) {
            fallBack(engine, "chunk");
          }
        },
      );
    }

    start(currentEngine());
    return () => {
      cancelled = true;
      drop();
      setStatus("loading");
    };
  }, [containerRef, lat, lon, radius, basemap, interactive, scheme, locale, lite]);

  const showUser = useCallback((user: GeoPoint | null) => {
    userRef.current = user;
    instanceRef.current?.showUser(user);
  }, []);

  const fitSpotAndUser = useCallback(() => {
    instanceRef.current?.fit(userRef.current);
  }, []);

  return { status: spot === null ? "idle" : status, basemap, showUser, fitSpotAndUser };
}
