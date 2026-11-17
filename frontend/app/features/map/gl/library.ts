import type * as MapLibre from "maplibre-gl";

export type MapLibreModule = typeof MapLibre;

let loading: Promise<MapLibreModule> | null = null;

/**
 * `maplibre-gl` and `pmtiles`, loaded once per session with the worker pointed at the copy that
 * `scripts/copy-maplibre-worker.mjs` puts under `public/maplibre/<version>/` (the bundler cannot serve it, see there).
 * `prewarm()` starts the worker now and keeps it alive while the route is hidden and shown again, when the map is
 * removed and re-created (`cacheComponents.md`, "Navigation with Activity"). A failed load clears the promise, so the
 * next call retries.
 */
export function loadMapLibre(): Promise<MapLibreModule> {
  loading ??= Promise.all([import("maplibre-gl"), import("pmtiles")])
    .then(([maplibre, pmtiles]) => {
      maplibre.setWorkerUrl(`/maplibre/${maplibre.getVersion()}/maplibre-gl-worker.mjs`);
      maplibre.addProtocol("pmtiles", new pmtiles.Protocol({ metadata: false }).tile);
      maplibre.prewarm();
      return maplibre;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
