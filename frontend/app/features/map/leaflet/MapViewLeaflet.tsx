"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

import { useCallback, useRef, useState } from "react";

import { LassoOverlay } from "../lasso/LassoOverlay";
import { MapLoading } from "../MapLoading";
import type { MapFailReason, MapViewProps } from "../types";
import { useLassoHost } from "./lassoHandlers";
import { useListingLayer } from "./listingLayer";
import { useDeferredBasemap } from "./useDeferredBasemap";
import { useLeafletCamera, useLeafletMap } from "./useLeafletMap";
import { useLeafletMask } from "./useLeafletMask";
import { useMyLocation } from "./useMyLocation";

/**
 * The Leaflet view of the map (WP-28, SCR-011): the fallback engine, loaded by `MapScreen` through `next/dynamic`
 * with `ssr: false` when `pickEngine` says so or GL failed, so neither this chunk nor Leaflet, its plugins and their
 * CSS are in the first load of any page. It implements the view contract of `types.ts` unchanged and never fetches
 * or formats a price. Until its first map exists, and unless it failed, the centred spinner covers the library's
 * download.
 */
export default function MapViewLeaflet({
  groups,
  responseId,
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
  const handle = useLeafletMap(container, { cityView, cityKnown, onFail: fail, onBackground });
  const fitted = useLeafletCamera(handle, { responseId, groups, polygon, cityView, cityKnown });
  useDeferredBasemap(handle, { tiles, scheme, lite, locale, fitted, onBasemap });
  useLeafletMask(handle, polygon, scheme);
  useMyLocation(handle, me);
  useListingLayer(handle, { groups, selection, onSelect });
  const lasso = useLassoHost(handle, drawing);

  // Sized by its fixed parent, as the GL view: Leaflet gives a static container `position: relative`.
  return (
    <>
      <div ref={container} data-map-view="leaflet" className="size-full" />
      {handle.generation === 0 && !failed ? <MapLoading /> : null}
      {drawing && lasso !== null && onDrawn !== undefined && onTooSmall !== undefined ? (
        <LassoOverlay host={lasso} onDrawn={onDrawn} onTooSmall={onTooSmall} />
      ) : null}
    </>
  );
}
