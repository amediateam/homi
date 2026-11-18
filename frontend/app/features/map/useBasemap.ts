"use client";

import { useCallback, useMemo, useState } from "react";

import { reportError } from "@/lib/errors/report";

import { type Basemap, basemapOf } from "./tiles";

/**
 * The basemap of the map's view, shared by both engines (WP-27 "Basemap and tiles", WP-28 "Basemap"): engine-free,
 * so the GL style and the Leaflet layer read the same answer and one vector failure moves both to the raster for the
 * rest of the session.
 */

/** The vector address that failed in this session: later maps start on the raster, on either engine. */
let failedVector: string | null = null;
let tilesReported = false;

/** Forgets the session's vector failure and its report; tests only. */
export function resetBasemapForTests(): void {
  failedVector = null;
  tilesReported = false;
}

const RASTER: Basemap = { kind: "raster" };

/** A vector basemap: a `.pmtiles` file or a `{z}/{x}/{y}` template. */
export function isVector(basemap: Basemap): basemap is Extract<Basemap, { url: string }> {
  return basemap.kind === "pmtiles" || basemap.kind === "template";
}

/**
 * The basemap `tiles` asks for, or the OSM raster once its vector source failed in this session (tile half of
 * LB-APP-008: the map is never blank). The first failure is reported as `map_tiles_failed`, once per session.
 */
export function useBasemap(tiles: string | null | undefined): { basemap: Basemap; failVector(): void } {
  const [failed, setFailed] = useState(failedVector);
  const requested = useMemo(() => basemapOf(tiles), [tiles]);
  const basemap = isVector(requested) && requested.url === failed ? RASTER : requested;
  const failVector = useCallback(() => {
    if (!isVector(requested)) {
      return;
    }
    failedVector = requested.url;
    setFailed(requested.url);
    if (!tilesReported) {
      tilesReported = true;
      reportError(new Error("map_tiles_failed"), { kind: "error" });
    }
  }, [requested]);
  return { basemap, failVector };
}
