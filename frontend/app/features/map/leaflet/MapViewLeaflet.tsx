"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { MapLoading } from "../MapLoading";
import type { MapFailReason, MapViewProps } from "../types";
import { rasterLayer } from "./basemap";
import { createListingLayer, type ListingLayer } from "./listingLayer";
import { useLeafletCamera, useLeafletMap } from "./useLeafletMap";

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
  onSelect,
  onBackground,
  polygon,
  cityView,
  cityKnown,
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
  useLeafletCamera(handle, { responseId, groups, polygon, cityView, cityKnown });

  useEffect(() => {
    const instance = handle.mapRef.current;
    if (instance === null) {
      return undefined;
    }
    const layer = rasterLayer(instance.L).addTo(instance.map);
    onBasemap?.({ kind: "raster" });
    return () => {
      layer.remove();
    };
  }, [handle.mapRef, handle.generation, onBasemap]);

  const select = useEffectEvent((numbers: number[], at?: number) => onSelect(numbers, at));
  const layer = useRef<ListingLayer | null>(null);
  useEffect(() => {
    const instance = handle.mapRef.current;
    if (instance === null) {
      return undefined;
    }
    const created = createListingLayer(instance, (numbers, at) => select(numbers, at));
    layer.current = created;
    return () => {
      layer.current = null;
      created.destroy();
    };
  }, [handle.mapRef, handle.generation]);
  useEffect(() => {
    layer.current?.update(groups);
  }, [handle.generation, groups]);

  // Sized by its fixed parent, as the GL view: Leaflet gives a static container `position: relative`.
  return (
    <>
      <div ref={container} data-map-view="leaflet" className="size-full" />
      {handle.generation === 0 && !failed ? <MapLoading /> : null}
    </>
  );
}
