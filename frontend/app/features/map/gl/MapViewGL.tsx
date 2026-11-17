"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef } from "react";

import type { MapViewProps } from "../types";
import { loadMapLibre } from "./library";

/** SLICE: the MapLibre GL view on the OSM raster source only; WP-27's waves replace this body. */
export default function MapViewGL({ cityView, onFail }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: InstanceType<Awaited<ReturnType<typeof loadMapLibre>>["Map"]> | null = null;
    loadMapLibre().then(
      (maplibre) => {
        if (cancelled || container.current === null) {
          return;
        }
        try {
          map = new maplibre.Map({
            container: container.current,
            center: [cityView.center[1], cityView.center[0]],
            zoom: cityView.zoom - 1,
            attributionControl: false,
            style: {
              version: 8,
              sources: {
                osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 },
              },
              layers: [{ id: "osm", type: "raster", source: "osm" }],
            },
            transformRequest: (url) => ({ url, referrerPolicy: "strict-origin-when-cross-origin" }),
          });
          map.on("error", (event) => console.warn("[map] error", String(event.error?.message ?? event.error)));
          map.on("load", () => console.warn("[map] load"));
          map.on("idle", () => console.warn("[map] idle"));
        } catch (error) {
          console.warn("[map] throw", String(error));
          onFail(error instanceof maplibre.GPUInitializationError ? "webgl" : "style");
        }
      },
      () => onFail("chunk"),
    );
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [cityView, onFail]);

  return <div ref={container} data-map-view="gl" className="absolute inset-0" />;
}
