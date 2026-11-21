"use client";

import type { Locale } from "@homi/config";
import { type RefObject, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { currentEngine, type Engine, markGlFailed } from "@/features/map/engine";
import type { Basemap } from "@/features/map/tiles";
import type { MapFailReason, MapScheme } from "@/features/map/types";
import { useBasemap } from "@/features/map/useBasemap";

export type GeoPoint = { lat: number; lon: number };
export type UserPosition = GeoPoint & { accuracy: number | null };

/** Where the picker opens: a saved point at zoom 17, else a city's centre at its zoom + 1 (app zoom scale). */
export type PickStart = GeoPoint & { zoom: number };

export type PickInput = {
  start: PickStart;
  basemap: Basemap;
  scheme: MapScheme;
  locale: Locale;
  lite: boolean;
  onVectorError(): void;
  /** The map started moving (the pin lifts). */
  onMoveStart(): void;
  /** The map stopped at `center`. */
  onMoveEnd(center: GeoPoint): void;
};

export type PickInstance = {
  center(): GeoPoint;
  /** Flies to `point` at `zoom` at least (never zooming out). */
  flyTo(point: GeoPoint, zoom: number): void;
  showUser(user: UserPosition | null): void;
  remove(): void;
};

export type PickEngine = {
  create(element: HTMLElement, input: PickInput, onFail: (reason: MapFailReason) => void): PickInstance | null;
};

export type PickerStatus = "loading" | "ready" | "failed";

function loadEngine(engine: Engine): Promise<PickEngine> {
  return engine === "gl" ? import("./pickGL").then((module) => module.loadPickEngine()) : import("./pickLeaflet").then((module) => module.loadPickEngine());
}

/**
 * The picker's map (WP-81, SCR-051): the one owner of its container on the session's engine — the pattern of
 * `useSpotMap` — a GL failure marks the session and the same run goes on with Leaflet; both failing is `failed`.
 * `moving` while the map moves; `center` after each stop.
 */
export function usePickerMap(
  containerRef: RefObject<HTMLElement | null>,
  start: PickStart,
  options: { tiles: string | null | undefined; scheme: MapScheme; locale: Locale; lite: boolean },
) {
  const { tiles, scheme, locale, lite } = options;
  const [status, setStatus] = useState<PickerStatus>("loading");
  const [moving, setMoving] = useState(false);
  const [center, setCenter] = useState<GeoPoint>({ lat: start.lat, lon: start.lon });
  const { basemap, failVector } = useBasemap(tiles);
  const instanceRef = useRef<PickInstance | null>(null);
  const vectorFailed = useEffectEvent(() => failVector());
  const { lat, lon, zoom } = start;

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) {
      return undefined;
    }
    let cancelled = false;
    let vectorReported = false;
    const input: PickInput = {
      start: { lat, lon, zoom },
      basemap,
      scheme,
      locale,
      lite,
      onVectorError() {
        if (!cancelled && !vectorReported) {
          vectorReported = true;
          vectorFailed();
        }
      },
      onMoveStart() {
        if (!cancelled) {
          setMoving(true);
        }
      },
      onMoveEnd(point) {
        if (!cancelled) {
          setMoving(false);
          setCenter(point);
        }
      },
    };
    const drop = () => {
      instanceRef.current?.remove();
      instanceRef.current = null;
    };
    const fallBack = (engine: Engine, reason: MapFailReason) => {
      if (engine === "gl") {
        markGlFailed(reason);
        begin("leaflet");
      } else {
        setStatus("failed");
      }
    };
    function begin(engine: Engine): void {
      loadEngine(engine).then(
        (loaded) => {
          if (cancelled) {
            return;
          }
          let failed = false;
          const created = loaded.create(element!, input, (reason) => {
            if (cancelled || failed) {
              return;
            }
            failed = true;
            drop();
            setStatus("loading");
            fallBack(engine, reason);
          });
          if (created === null || failed) {
            created?.remove();
            return;
          }
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
    begin(currentEngine());
    return () => {
      cancelled = true;
      drop();
      setStatus("loading");
    };
  }, [containerRef, lat, lon, zoom, basemap, scheme, locale, lite]);

  const flyTo = useCallback((point: GeoPoint, minZoom: number) => instanceRef.current?.flyTo(point, minZoom), []);
  const showUser = useCallback((user: UserPosition | null) => instanceRef.current?.showUser(user), []);
  const read = useCallback(() => instanceRef.current?.center() ?? null, []);

  return { status, basemap, moving, center, flyTo, showUser, read };
}
