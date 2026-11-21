"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CameraMemory } from "../camera";
import { MapLoading } from "../MapLoading";
import type { MapFailReason, MapViewProps } from "../types";
import { GlLasso } from "./GlLasso";
import { buildStyle } from "./style";
import { useAreaMask } from "./useAreaMask";
import { useClusterIndex } from "./useClusterIndex";
import { spreadGroupOf, useClusterMarkers } from "./useClusterMarkers";
import { useBasemap, useMapCamera, useMapInstance } from "./useMapInstance";
import { useMeLayer } from "./useMeLayer";

/**
 * The MapLibre GL view of the map (WP-27, SCR-011, `03` §1.8): the main engine, loaded on demand by `MapScreen`
 * through `next/dynamic` with `ssr: false`, so neither this chunk nor `maplibre-gl` and its CSS are in the first load
 * of any page. It owns everything MapLibre does — the map and its failures, the style (basemap, theme, lite mode,
 * locale, area mask, "me"; rebuilt with a diff, never a new map), the markers and their taps, and the camera — and
 * reports gestures through the view contract (`types.ts`). It never fetches and never formats a price. Until its
 * first map exists, and unless it failed, the centred spinner of "Engine loading" covers the library's download.
 * While `drawing`, the lasso of WP-28 (`GlLasso`) covers the map and reports the drawn area.
 */
export default function MapViewGL({
  groups,
  responseId,
  cameraKey,
  selection,
  onSelect,
  onBackground,
  polygon,
  cityView,
  cityKnown,
  tiles,
  locale,
  scheme,
  lite,
  me,
  drawing,
  onDrawn,
  onTooSmall,
  onFail,
  onBasemap,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(
    (reason: MapFailReason) => {
      setFailed(true);
      onFail(reason);
    },
    [onFail],
  );
  const mask = useAreaMask(polygon);
  const { basemap, failVector } = useBasemap(tiles);
  useEffect(() => {
    onBasemap?.(basemap);
  }, [basemap, onBasemap]);
  const style = useMemo(
    () => buildStyle({ basemap, scheme, lite, locale, mask, me }),
    [basemap, scheme, lite, locale, mask, me],
  );
  const memoryRef = useRef<CameraMemory>({ restored: null, placed: null });
  const handle = useMapInstance(container, {
    style,
    cityView,
    cityKnown,
    lite,
    onFail: fail,
    onBackground,
    onVectorError: failVector,
    cameraKey,
    memoryRef,
  });
  useMapCamera(handle, { responseId, groups, polygon, cityView, cityKnown, cameraKey, memoryRef });
  useMeLayer(handle, me);

  const spread = useMemo(() => spreadGroupOf(groups, selection), [groups, selection]);
  const clustered = useMemo(() => (spread === null ? groups : groups.filter((group) => group !== spread)), [groups, spread]);
  const index = useClusterIndex(clustered);
  useClusterMarkers(handle, { index, spread, selection, onSelect });

  // Sized by its fixed parent: MapLibre's CSS gives the container `position: relative`, so insets would not size it.
  // The spinner is a sibling: MapLibre fills the container, which must exist before the library has loaded.
  return (
    <>
      <div ref={container} data-map-view="gl" className="size-full" />
      {handle.generation === 0 && !failed ? <MapLoading /> : null}
      {drawing && onDrawn !== undefined && onTooSmall !== undefined ? (
        <GlLasso handle={handle} onDrawn={onDrawn} onTooSmall={onTooSmall} />
      ) : null}
    </>
  );
}
