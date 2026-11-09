# KV-FE-062 — Map tile prefetch and preload

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval: map packages via KV-FE-005, through KV-FE-057) |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-MAP-001, F-MEDIA-002 |
| Dependencies | KV-FE-057 (engine, `warmMap`), KV-FE-048 (list view as the idle trigger); uses lite mode of KV-FE-027 and storage of KV-FE-028; decisions: Q-APP-015 (`meta.tiles` form), Q-API-053 |

## Goal

Opening the map feels instant: 2.5 s after the search list settles, the map code is warmed and the vector tiles of one
screen around the city's last fitted view are fetched within a per-session byte budget that respects Save-Data, slow
networks and lite mode — and the warm-up happens by intent, outside render (LB-APP-018).

## Legacy reference

- `03` §1.9 («After 2.5 s on the list view, `preloadMapView()` and a tile prefetch run»), §3.4 «Tile prefetch budget»;
  `$KVADRO_ROOT/demo/app/src/app/useMapTilePrefetch.js:1-27` (delay 2 500 ms, default zoom 12);
  `$KVADRO_ROOT/demo/app/src/features/map/tilePrefetch.js:1-251` (budgets `:21-41`, `MAX_DATA_ZOOM = 15`, Leaflet in-map
  prefetch, `kv-map-fit:` `:186-224`, `prefetchMapTiles` `:225-251`); `engine.js:100-115` (`warmMaplibre`,
  `preloadMapView`).
- Defect: LB-APP-018 (warm-up in render; fixed together with KV-FE-057).
- Contract: RES-003 (`{z}/{x}/{y}` template or `.pmtiles`), `meta.tiles` (API-001), `CityMeta.center`, `zoom`.
- Visual baseline: none (performance behaviour); measured in KV-FE-173.

## Implementation

1. `frontend/app/lib/map/tilePrefetch.ts` and `frontend/app/app/(miniapp)/features/map/useMapTilePrefetch.ts`.
2. Trigger: search tab, list view, `meta.tiles` truthy and the city has a centre → after 2 500 ms of the list being
   shown (timer reset on change, cancelled on leaving) call `prefetchMapTiles(tiles, center, zoom ?? 12)`; touching
   «Карта» triggers `warmMap()` at once (KV-FE-057).
3. `prefetchMapTiles`: once per (template, city centre) per session; calls `warmMap()` (map chunk + MapLibre +
   `pmtiles`); prefetches tiles only for `{z}/{x}/{y}` templates (a `.pmtiles` URL gets only the code warm-up, legacy);
   view = saved fit `kv-map-fit:<lat>,<lon>` → `[lat, lon, zoom]`, else city centre at `zoom − 1`; data zoom
   `min(fitZoom − 1, 15)`; the tiles covering half a screen (512 px data tiles) around the view, nearest first.
4. Budget (`getPrefetchBudget`): none with Save-Data or `2g`/`slow-2g`; lite → 2 per stop, 3 preload, 300 KB preload, 1.5
   MB per session; full → 4, 6, 600 KB, 4 MB. A shared set of already requested tile URLs avoids duplicates with the
   map layer; bytes are counted from responses.
5. Fit memory: after the first camera fit for a city (GL view of KV-FE-058, Leaflet view of KV-FE-059) save
   `kv-map-fit:<city centre>` = `[lat, lon, zoom]` rounded to 4 decimals. Legacy saved it from Leaflet only; saving it
   from GL too is an internal improvement with no visible change.
6. In-map prefetch around the stopped view on `moveend` stays Leaflet-only (MapLibre fetches its own tiles); it uses the
   `perStop` budget.

## States and texts

n/a — no UI. Failures are silent (prefetch errors ignored, legacy).

## Interaction

n/a — runs in the background; never delays the feed (starts after 2.5 s, lowest fetch priority, aborted when the list
unmounts).

## Telegram integration

n/a (uses only browser `navigator.connection` and lite mode, TMA-041 via KV-FE-027).

## Storage and analytics

- Storage: `kv-map-fit:<lat>,<lon>` → JSON `[lat, lon, zoom]` (not mirrored to DeviceStorage).
- Analytics: none; prefetched bytes per session can be logged in development only.

## Files

- `frontend/app/lib/map/tilePrefetch.ts`, `frontend/app/app/(miniapp)/features/map/useMapTilePrefetch.ts` (new)
- `frontend/app/tests/map/tilePrefetch.test.ts`

## API contract

RES-003 tile template `{z}/{x}/{y}` on the tile host (`Range` not needed for templates; PMTiles needs `Range` and CORS,
KV-INF-021). No API calls.

## Business rules

- Kept: the legacy prefetch timing and budgets (`03` §3.4).
- Defect fix `APPROVED` (policy): LB-APP-018 (with KV-FE-057).

## Acceptance criteria

- With a template `tiles`, the list view idle for 2.5 s fetches at most 6 tiles / 600 KB (full) or 3 / 300 KB (lite);
  with Save-Data nothing is fetched; a second visit to the list in the same session fetches nothing new for that city.
- With a `.pmtiles` URL only the map code is warmed.
- Opening the map after the prefetch issues no duplicate tile request for the prefetched tiles.
- The feed's first page and photos are never delayed (network waterfall in KV-FE-173 shows prefetch after them).

## Tests

- Unit (`tilePrefetch.test.ts`): budget table (Save-Data, 2g, lite, full), tile set for a known centre and zoom, once per
  region, session byte cap, fit save/read round trip with corrupt JSON.

## Edge cases

- `meta.tiles` undefined (meta not loaded) or `null` (OSM raster): no tile prefetch; OSM tiles are never prefetched.
- City without `center`: skipped.
- The user switches tabs before 2.5 s: timer cancelled.

## Security

- SEC-REQ-031: prefetch requests go only to the tile host already allowed in `connect-src` (KV-FE-033).

## Definition of done

Approval recorded; `make ci-frontend` green; unit tests green (or added when KV-FE-010 lands); network trace attached to
the PR; parity gate G4 for F-MAP-001 / F-MEDIA-002 ticked with the other map tasks (`15` §4); the `09` rows updated; PR
reviewed by the other developer.
