"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef } from "react";

import type { MapViewProps } from "../types";
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
 * reports gestures through the view contract (`types.ts`). It never fetches and never formats a price.
 */
export default function MapViewGL({
  groups,
  responseId,
  selection,
  onSelect,
  onBackground,
  polygon,
  cityView,
  tiles,
  locale,
  scheme,
  lite,
  me,
  onFail,
  onBasemap,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mask = useAreaMask(polygon);
  const { basemap, failVector } = useBasemap(tiles);
  useEffect(() => {
    onBasemap?.(basemap);
  }, [basemap, onBasemap]);
  const style = useMemo(
    () => buildStyle({ basemap, scheme, lite, locale, mask, me }),
    [basemap, scheme, lite, locale, mask, me],
  );
  const handle = useMapInstance(container, { style, cityView, lite, onFail, onBackground, onVectorError: failVector });
  useMapCamera(handle, { responseId, groups, polygon, cityView });
  useMeLayer(handle, me);

  const spread = useMemo(() => spreadGroupOf(groups, selection), [groups, selection]);
  const clustered = useMemo(() => (spread === null ? groups : groups.filter((group) => group !== spread)), [groups, spread]);
  const index = useClusterIndex(clustered);
  useClusterMarkers(handle, { index, spread, selection, onSelect });

  return <div ref={container} data-map-view="gl" className="absolute inset-0" />;
}
