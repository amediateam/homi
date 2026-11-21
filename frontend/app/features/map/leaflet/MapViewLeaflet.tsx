"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

import { useCallback, useRef, useState } from "react";

import type { CameraMemory } from "../camera";
import { LassoOverlay } from "../lasso/LassoOverlay";
import { MapLoading } from "../MapLoading";
import { paletteOf } from "../palette";
import type { MapFailReason, MapViewProps } from "../types";
import { useLassoHost } from "./lassoHandlers";
import { useListingLayer } from "./listingLayer";
import { useDeferredBasemap } from "./useDeferredBasemap";
import { useLeafletCamera, useLeafletMap } from "./useLeafletMap";
import { useLeafletMask } from "./useLeafletMask";
import { useMyLocation } from "./useMyLocation";
import { useSpiderfy } from "./useSpiderfy";

/**
 * The Leaflet view of the map (WP-28, SCR-011): the fallback engine, loaded by `MapScreen` through `next/dynamic`
 * with `ssr: false` when `pickEngine` says so or GL failed, so neither this chunk nor Leaflet, its plugins and their
 * CSS are in the first load of any page. It implements the view contract of `types.ts` unchanged and never fetches
 * or formats a price. Until its first map exists, and unless it failed, the centred spinner covers the library's
 * download. Every layer, listener and the map itself is removed in an effect cleanup, so a removed map leaves nothing
 * behind and StrictMode's second run, like an Activity re-show, ends with one map.
 */
export default function MapViewLeaflet({
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
  const memoryRef = useRef<CameraMemory>({ restored: null, placed: null });
  const handle = useLeafletMap(container, { cityView, cityKnown, onFail: fail, onBackground, cameraKey, memoryRef });
  const fitted = useLeafletCamera(handle, { responseId, groups, polygon, cityView, cityKnown, cameraKey, memoryRef });
  useDeferredBasemap(handle, { tiles, scheme, lite, locale, fitted, onBasemap });
  useLeafletMask(handle, polygon, scheme);
  useMyLocation(handle, me, scheme);
  const spiderfy = useSpiderfy(handle, groups, selection);
  useListingLayer(handle, { groups, selection, onSelect, spiderfy });
  const lasso = useLassoHost(handle, drawing);

  // Sized by its fixed parent, as the GL view: Leaflet gives a static container `position: relative`. The land colour
  // is the map until the deferred basemap is added, and the whole map while reference data is absent.
  return (
    <>
      <div ref={container} data-map-view="leaflet" className="size-full" style={{ backgroundColor: paletteOf(scheme).land }} />
      {handle.generation === 0 && !failed ? <MapLoading /> : null}
      {drawing && lasso !== null && onDrawn !== undefined && onTooSmall !== undefined ? (
        <LassoOverlay host={lasso} onDrawn={onDrawn} onTooSmall={onTooSmall} />
      ) : null}
    </>
  );
}
