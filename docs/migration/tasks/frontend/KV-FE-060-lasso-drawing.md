# KV-FE-060 — Lasso area drawing

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval: map packages via KV-FE-005, through KV-FE-058) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-MAP-002 |
| Dependencies | KV-FE-058 (GL map view, area mask); entry points in KV-FE-045 (lasso button, area pill) and KV-FE-053 («Обвести на карте»); back handling via KV-FE-025 |

## Goal

The user draws a free-hand search area with one finger on the map (SCR-012); two fingers move and zoom the map without
leaving drawing; a valid outline becomes a polygon of at most 40 vertices that replaces districts and zones in the
search; an outline that is too small is rejected with «Обведите покрупнее».

## Legacy reference

- SCR-012 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/map/LassoOverlay.jsx:16-171` (pointer capture, 4 px point
  skip, second finger → pinch/pan via `onMove`, haptics); `gl/GlLasso.jsx:10-49` (`unproject`, `panBy`/`zoomTo` with
  event data `draw`); `$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:1-235` (`lassoToPolygon` `:115-151`, mask
  `:185-228`, `serializePolygon` `:235`); `$KVADRO_ROOT/demo/app/src/app/App.jsx:325-345` (`startDrawing`, `onDrawn`,
  `clearArea`), `:393-402` (draw from the sheet); `useTelegramButtons.js:37-44` (Back cancels drawing).
- Rules: BR-APP-061 (≤ 40 vertices, 5 decimals, convex hull for self-intersection, < 40 px rejected, `polygon=lat,lon;…`),
  BR-APP-008 (polygon clears districts and zones).
- Constants `03` §3.4 «Lasso | ≥ 3 points, ≥ 40 px span, ≤ 40 vertices, close gap 12 px, 5 dp».
- Visual baseline (KV-QA-019): `gl-lasso` → `SCR-012-*.png`.

## Implementation

1. Pure geometry in `frontend/packages/search/src/polygon.ts` (also used by KV-FE-019's query builder):
   `lassoToPolygon(screenPoints, toLatLon)` — fewer than 3 points or a span under 40 px on either axis → `null`;
   Douglas–Peucker simplification starting at 3 px, tolerance × 1.5 per step until ≤ 40 vertices; drop the last vertex
   when within 12 px of the first (if > 3 remain); self-intersection → convex hull; < 3 vertices → `null`; vertices
   `[lat, lon]` rounded to 5 decimals. Plus `polygonBounds`, `serializePolygon` (`lat,lon;lat,lon;…`, not closed) and
   the mask geometry.
2. `frontend/app/app/(miniapp)/features/map/LassoOverlay.tsx` over the map: pointer events with capture; first finger
   draws (light haptic at stroke start), points closer than 4 px skipped, live SVG path; a second finger drops the
   stroke and turns into pan/pinch, accumulated per animation frame and applied with `panBy` / `zoomTo(around)` tagged
   `draw` (marker resync deferred 150 ms, KV-FE-058); lifting the drawing finger finishes the stroke.
3. Finish: valid polygon → success haptic → `onDrawn(polygon)` → leave drawing and apply
   `{...filters, polygon, districts: [], zones: []}` (scroll to top, nudge candidate, sort fallback); invalid → error
   haptic, clear the stroke, set `areaTooSmall` (top-bar hint `map.areaSmall`), stay in drawing.
4. Entry points: lasso button on the map bar and the area pill (`startDrawing`: light haptic, reset `areaTooSmall`),
   «Обвести на карте» from the filters sheet (switch to the map, start drawing, KV-FE-050/KV-FE-053).
5. Exits: «Отмена» (`map.areaCancel`, light haptic), Telegram Back (a layer pushed while drawing, TMA-022), leaving the
   map view or the tab, a successful stroke. The selection card closes on entering drawing (KV-FE-061).
6. Clearing an area: × on the area pill (aria `map.areaRemove`) → light haptic, `polygon: null` (legacy sets the filters
   directly, without the nudge candidate).
7. While drawing: view toggle hidden, locate button hidden (KV-FE-045, KV-FE-058); the mask of an existing polygon stays
   until replaced.
8. Report `$pageview map/draw` (KV-FE-035).

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| drawing hint | drawing, no failed attempt | `map.areaHint` «Обведите пальцем, где искать» + `map.areaMove` «Двумя пальцами — двигать карту» |
| too small | last stroke rejected | `map.areaSmall` «Обведите покрупнее» + `map.areaMove` |
| cancel | drawing | `map.areaCancel` «Отмена» |
| area set | polygon in filters | pill `map.areaOn` «Своя область», aria `map.areaRemove` «Убрать область»; mask over the map |
| stroke | finger down | SVG outline following the finger |
| pinching | two fingers | stroke cleared, map moves and zooms |

## Interaction

- Gestures: one-finger draw with pointer capture; two-finger pan and pinch (fractional zoom on GL; whole-step on the
  Leaflet variant, KV-FE-059).
- Haptics: light at stroke start, success on a valid polygon, error on a rejected one, light on cancel and clear.
- Swipe-back and pull-to-refresh are inactive on the map (KV-FE-013, KV-FE-046).
- Responsive: the overlay covers the map area between the top bar and the tab bar; works with a mouse in Telegram
  Desktop (pointer events), where pinch is unavailable.

## Telegram integration

TMA-022 (Back cancels drawing through the layer stack), TMA-015 (vertical swipes disabled, so a downward stroke does
not collapse the Mini App), TMA-025 (haptics).

## Storage and analytics

- Storage: none (the polygon lives in the filters; it is saved with a radar only through KV-FE-074).
- Analytics: `$pageview map/draw`.

## Files

- `frontend/packages/search/src/polygon.ts` (new)
- `frontend/app/app/(miniapp)/features/map/{LassoOverlay,GlLasso}.tsx` (new)
- `frontend/packages/search/tests/polygon.test.ts`, `frontend/app/tests/map/LassoOverlay.test.tsx`

## API contract

`polygon=lat,lon;lat,lon;…` (3–40 vertices, 5 decimals, not closed) in `FilterQuery` of API-004…API-007 (`08` §1.7);
the server rejects 2 or 41 vertices with `422` (KV-BE-031) — the client never produces them.

## Business rules

- Kept: BR-APP-061, BR-APP-008.

## Acceptance criteria

- A 30 × 200 px stroke is rejected with «Обведите покрупнее» and an error haptic; a 200 × 200 px circle yields a polygon
  of ≤ 40 vertices with 5-decimal coordinates; a figure-eight yields its convex hull.
- After a valid stroke the feed and map requests carry `polygon=` and no `districts`/`zones`.
- Back while drawing leaves drawing and stays on the map; «Отмена» does the same.
- Visual: side by side with the `gl-lasso` baseline (`SCR-012`) — hint bar, cancel button, stroke and mask equal.

## Tests

- Unit (`polygon.test.ts`): < 3 points, 39 px span, 40 px span, simplification to ≤ 40, closing-gap drop, convex hull,
  rounding, serialisation; mask geometry.
- Component (`LassoOverlay.test.tsx`, synthetic pointer events): 4 px skip, second finger cancels the stroke and emits
  moves, finish → callback, invalid → too-small callback.
- E2E: KV-QA-012 `gl-lasso` scenario on the contract mocks.

## Edge cases

- Pointer capture lost (system gesture): finish the stroke as on pointer up (legacy `onLostPointerCapture`).
- A stroke crossing the top bar: points are local to the overlay; outside points clamp to the overlay box.
- Drawing while the GL map falls back to Leaflet: drawing restarts on the new mount (KV-FE-059).

## Security

n/a — local geometry; coordinates of the drawn area are search parameters, not personal location.

## Definition of done

`make ci-frontend` green; unit, component and E2E tests green (or added when KV-FE-010 lands); side-by-side review of
the SCR-012 baseline recorded in the PR; parity gate G4 for F-MAP-002 ticked with KV-FE-053 (`15` §4); the `09` row
updated; PR reviewed by the other developer.
