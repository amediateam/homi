# KV-FE-059 — Leaflet fallback map

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (Q-APP-018 / FD-3: port Leaflet or GL only; approval of `leaflet`, `leaflet.markercluster`, `protomaps-leaflet` — KV-FE-005) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-MAP-001 |
| Dependencies | KV-FE-057 (engine choice, palettes, attribution), KV-FE-058 (shared pins, stacks, note, states), KV-FE-001 (GL / Leaflet / lite session shares, Q-APP-018); decisions: FD-3 of `12` §9.1 |

## Goal

Devices in lite mode, without WebGL2, with a runtime GL failure or with `?map=leaflet` get the Leaflet version of the
search map (SCR-011) with the same data, pins, stacks, card, lasso and locate behaviour as the GL view, the
Leaflet-specific details users notice, and the LB-APP-013 defect fixed — **if** FD-3 keeps Leaflet. If FD-3 decides
"GL only", this task becomes `DROPPED` and KV-FE-057 records the replacement (GL with raster tiles, `pixelRatio` 1).

## Legacy reference

- SCR-011 (`03` §2, "Differences between engines a user notices": label font, attribution, whole-step vs fractional
  pinch while drawing, stack collapse on zoom, max-zoom cluster sort order, basemap delay up to 1.2 s, in-map tile
  prefetch, theme re-styling); `03` §1.7 (lite forces Leaflet).
- `$KVADRO_ROOT/demo/app/src/features/map/leaflet/MapView.jsx` (points `:90-145`, fit `maxZoom: 14` and `saveMapFit`
  `:137-142`, cluster tap with an open stack `:108-110`, note `:200-222`); `listingLayer.js:43-44`
  (`maxClusterRadius: 48`, `spiderfyOnMaxZoom: false`); `icons.js:9-61` (`innerHTML` labels); `useSpiderfy.js:16-98`;
  `useLeafletMap.js:30-35` (`maxZoom: 18`, attribution control); `basemap.js:1-92` (protomaps-leaflet vector layer,
  `maxDataZoom` 15, OSM raster fallback `maxZoom` 19, tile prefetch attach); `useDeferredBasemap.js:13-33` (basemap after
  the first fit or 1.2 s); `lassoHandlers.js`; `useMyLocation.js`; `basemapRules.js` (paint and label rules).
- Defects: LB-APP-013 (max-zoom cluster tap with an open stack), LB-APP-020 (`innerHTML` labels), LB-APP-008 /
  LB-APP-044 (shared states with KV-FE-058).
- Visual baseline (KV-QA-019): `map-view-leaflet` → `SCR-011-*.png` (Leaflet).

## Implementation

1. Gate: implement only after FD-3 = "keep Leaflet", based on the session shares of KV-FE-001 (Q-APP-018).
2. Dependencies — **PROPOSED — needs approval (dependency change)** via KV-FE-005: `leaflet` `1.9.4`,
   `leaflet.markercluster` `1.5.3`, `protomaps-leaflet` `^5.1.0` (inferred; pin at approval). Leaflet CSS imported only
   in the lazy chunk.
3. `frontend/app/app/(miniapp)/features/map/leaflet/MapViewLeaflet.tsx` with the same props as the GL view; reuse
   `groupByLocation`, `spreadStackLabels`, the note, loading/empty/error pills and the selection card from
   KV-FE-058 / KV-FE-061.
4. Map: `maxZoom` 18, no attribution prefix; basemap mounted after the first fit or after 1.2 s (no tiles for a
   start view that changes at once); vector basemap via `protomaps-leaflet` with the shared palettes and localised
   label rules (`maxDataZoom` 15); `tiles = null` → OSM raster (`maxZoom` 19); recreated on theme, lite or language
   change.
5. Listings layer: marker clusters (`maxClusterRadius` 48, `spiderfyOnMaxZoom` false); pins, stack pins and cluster
   icons built with DOM nodes and `textContent` (**LB-APP-020 fix**); stacks spiderfy on tap and collapse on zoom
   start (legacy Leaflet behaviour).
6. **LB-APP-013 fix:** a cluster tap first collapses any spiderfied stack, then selects or zooms.
7. Camera: fit polygon or points with `maxZoom: 14` (first fit) and `saveMapFit(cityCenter, lat, lon, zoom)` into
   `kv-map-fit:<lat>,<lon>` (consumed by KV-FE-062); city change jumps the centre.
8. Lasso: the same overlay as KV-FE-060 with Leaflet handlers (whole-step zoom while pinching during drawing).
9. Locate: the same button and texts as KV-FE-058; Leaflet circle markers for the dot (radius 7) and the accuracy
   circle.
10. In-map tile prefetch on `moveend` with the session budgets of KV-FE-062 (Leaflet only, as legacy).
11. Attribution through the Leaflet control: «© OpenStreetMap» (+ «· Protomaps» with vector tiles).

## States and texts

Same states and keys as KV-FE-058 (`map.note`, `map.missing`, `map.locate`, `map.locateDenied`, `map.locateFail`, the
new `map.empty`, `common.loadFailed` + `error.retry`), plus:

| State | Shown when | Texts |
| ----- | ---------- | ----- |
| basemap deferred | before the first fit, ≤ 1.2 s | background colour (`palette.land`) |
| raster basemap | `tiles = null` | OSM raster, «© OpenStreetMap» |
| vector basemap | tiles URL | protomaps layer, «© OpenStreetMap · Protomaps» |

## Interaction

- Pan, pinch (fractional), double-tap zoom (Leaflet default); stacks collapse when zoom starts; cluster tap zooms to
  bounds; at max zoom a cluster opens the card (Leaflet sort order of the leaves kept, the GL order is by price — a
  noticed difference recorded in `03`).
- Haptics as in KV-FE-058.
- Lite mode: no glass blur on map controls, `pixelRatio` 1 equivalent (no retina tiles).

## Telegram integration

TMA-035 (location), TMA-025 (haptics).

## Storage and analytics

- Storage: `kv-map-fit:<lat>,<lon>` → JSON `[lat, lon, zoom]` (4 decimals), not mirrored; `kv-map-v2` read via
  KV-FE-057.
- Analytics: `$pageview search/map` (same name as GL).

## Files

- `frontend/app/app/(miniapp)/features/map/leaflet/{MapViewLeaflet.tsx,listingLayer.ts,icons.ts,useSpiderfy.ts,
  basemap.ts,basemapRules.ts,useDeferredBasemap.ts,lassoHandlers.ts,useMyLocation.ts}` (new)
- `frontend/app/tests/map/leaflet/{icons,useSpiderfy}.test.ts`; E2E case `map-view-leaflet` in `map.spec.ts`

## API contract

API-007 as in KV-FE-058; RES-003 (protomaps vector source), RES-004 (OSM raster).

## Business rules

- Kept: BR-APP-062 and the SCR-011 Leaflet behaviour list.
- Defect fixes `APPROVED` (policy): LB-APP-013, LB-APP-020; LB-APP-008 / LB-APP-044 shared with KV-FE-058.

## Acceptance criteria

- `?map=leaflet` (or lite mode) renders this view with the same pins, counts and note as the GL view for the same
  fixture.
- Tapping a max-zoom cluster while a stack is spiderfied collapses the stack and shows the cluster's listings.
- No `innerHTML` with server text (labels with `<`, `&` render literally).
- The basemap appears after the first fit or at 1.2 s, not before.
- Visual: side by side with the `map-view-leaflet` baseline (`SCR-011`) — tiles, pins, clusters, attribution equal.

## Tests

- Unit: `icons.test.ts` (text-only labels, tone classes, cluster sizes 32/38/44), `useSpiderfy.test.ts` (expand, collapse
  on zoom start, collapse before cluster tap).
- E2E: `map-view-leaflet` scenario of KV-QA-012 against the contract mocks.

## Edge cases

- GL fails at runtime after the user started drawing: the Leaflet mount starts fresh (drawing cancelled), filters kept.
- `kv-map-fit` corrupt JSON: ignored (default city view).
- Basemap language switch while the map is open: layer recreated.

## Security

- SEC-REQ-021 / LB-APP-020: text-only labels; lint forbids `innerHTML` in the map code.
- SEC-REQ-049: three new packages through the approval and audit rule.

## Definition of done

FD-3 recorded; approval recorded; `make ci-frontend` green; tests green (or added when KV-FE-010 lands); side-by-side
review of the Leaflet baseline recorded in the PR; parity gate G4 for F-MAP-001 ticked with the other map tasks
(`15` §4); the `09` row updated; PR reviewed by the other developer. If FD-3 = GL only: status `DROPPED (FD-3)` with the
reason, and KV-FE-057 updated.
