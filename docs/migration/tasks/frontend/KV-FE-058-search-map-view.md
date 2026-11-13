# KV-FE-058 — Search map view: points, clusters, stacks, pins, camera

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval: `maplibre-gl`, `supercluster` — KV-FE-005) |
| Owner | Frontend (track: development) |
| Complexity | L |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-MAP-001 |
| Dependencies | KV-FE-057 (engine, style), KV-FE-019 (query builder), KV-FE-031 (location service); backend KV-BE-033 (API-007); decisions: Q-APP-012 (labels), SEC-REQ-018 (server side), LB-APP-008 / LB-APP-020 / LB-APP-044 fixes |

## Goal

The GL map view of the search tab (SCR-011) shows every matching listing as a price pin, groups identical coordinates
into stacks, clusters the rest, fits the camera to the drawn area or the point cloud, notes listings known only by
district, and locates the user — with pins rendered as text only and with the loading, empty and error states legacy
lacked.

## Legacy reference

- SCR-011 (`03` §2: data, pins, camera, note, locate, gestures, engine differences); `03` §3.4 «Map» constants.
- `$KVADRO_ROOT/demo/app/src/features/map/gl/MapViewGL.jsx:35-206`; `gl/useMapPoints.js:10-28` (no rejection handler);
  `gl/useClusterIndex.js:10-124` (radius 48, `maxZoom` 17, extent 512, fit padding 90/24, `maxZoom` Leaflet 14, first
  fit unanimated); `gl/useClusterMarkers.js:29-259` (pin, stack, spiderfy, cluster tap); `gl/markerElements.js:13-50`
  (stack `innerHTML`); `gl/geojson.js:10-89` (`robustBounds`, `pinClassName`, accuracy circle < 2 km);
  `gl/useLocateMe.js:14-39`; `gl/useAreaMask.js`; `pins.js:9-73` (`groupByLocation`, `spreadStackLabels`,
  `stackPinHtml`); `$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:185-228` (mask); tone classes
  `$KVADRO_ROOT/demo/app/src/styles/map.css:137-158`.
- Rules: BR-APP-062 (hidden excluded, «На карте N из M», stacks by price). Defects: LB-APP-008 (points failure blank),
  LB-APP-020 (labels as HTML), LB-APP-044 (no loading/empty/error state).
- Contract: API-007, `08` §1.7.
- Visual baselines (KV-QA-019): `gl-base` → `SCR-011-*`; `gl-pin-click` → `SCR-013-*` (pin active state).

## Implementation

1. Dependency — **PROPOSED — needs approval (dependency change)**: `supercluster` `^8.0.1` (inferred version, pin at
   approval) via KV-FE-005; MapLibre from KV-FE-057.
2. `frontend/app/app/(miniapp)/features/map/gl/MapViewGL.tsx` with hooks `useMapInit`, `useMapPoints`,
   `useClusterIndex`, `useClusterMarkers`, `useLocateMe`, `useAreaMask` (ported structure; hook order is free in the
   port).
3. Points: `GET /api/map?<FilterQuery>` on every filters change; the card closes first; a response for older filters is
   dropped. **LB-APP-008 / LB-APP-044 fix:** a points request shows a small loading pill; a failure shows the map
   error pill with «Повторить»; an empty `points[]` with `total = 0` shows «Ничего не найдено в этой области».
4. Index: drop locally hidden ids; group by coordinates rounded to 5 decimals, each group sorted by `usd` (missing
   last); Supercluster over groups (`radius 48`, `maxZoom 17`, `extent 512`, `n` summed); counts `shown = points`,
   `total = res.total − hidden`.
5. Markers (DOM, synced to the viewport + 10 % on integer-zoom changes and `moveend`; deferred 150 ms for lasso moves):
   - pin: class `pin <tone>` (+ `nego` when `priced === false`, + `active`), text = `label` via **`textContent`**;
   - stack: first (cheapest) label + count badge `pin-n`, built with DOM nodes — **LB-APP-020 fix** (legacy used
     `innerHTML`);
   - cluster: circle with the count, 32 / 38 / 44 px for `< 10` / `< 50` / more.
6. Taps: pin → select `[id]` (collapse any open stack); stack → select all ids of the group and spiderfy (labels laid
   out on a widened spiral without overlaps, `spreadStackLabels`; a dot at the centre); spiderfied pin → switch the
   card to that index; cluster → ease (500 ms) to the leaves' bounds (padding 120/130/56/56) at least to the expansion
   zoom; at max zoom → select all leaves sorted by `usd`; background tap → close the card and collapse the stack.
   The selection card is KV-FE-061.
7. Camera: on a **new** response fit the polygon bounds or `robustBounds` (3 %–97 % quantiles from 20 points),
   padding top/bottom 90, left/right 24, max zoom Leaflet-scale 14; first fit without animation, later ones 500 ms; a
   change of the hidden set rebuilds markers without moving the camera; a city change jumps to the city centre and zoom.
8. Note: when some listings have no coordinates, `map.note` with `{shown}`, `{total}` and the plural `map.missing`
   shows for 6 s after each new response; a locate error replaces it for 5 s.
9. Locate button (aria `map.locate`, `LocateFixed` icon) when not drawing, no card open and `canRequestLocation()`:
   light haptic, spinner, `requestLocation()` (KV-FE-031, ≈12 s timeout); `denied` → `map.locateDenied`, `fail` →
   `map.locateFail`; success → success haptic, «я здесь» dot plus an accuracy circle when accuracy < 2 km (source
   `me`, kept across style rebuilds), `flyTo` zoom ≥ Leaflet 15 in 600 ms.
10. Area mask: when a polygon is set, a dimmed world rectangle with the polygon cut out and an outline.
11. Gestures: pan and pinch; rotation, pitch and keyboard disabled (KV-FE-057 options). Report `$pageview search/map`
    through the shell.

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| loading points | request pending | spinner pill (new, no text) |
| success | points | pins, stacks, clusters |
| note | `total > shown` | `map.note` «На карте {shown} из {total} · {missing} известен только район», `map.missing` «у {n} объявления» / «у {n} объявлений» (6 s) |
| empty | `total = 0` | new key (not in legacy) `map.empty` «Ничего не найдено в этой области»; uz/en to be translated, product owner review |
| error | API-007 failed | `common.loadFailed` «Не загрузилось» + `error.retry` «Повторить» |
| locate | button | aria `map.locate` «Где я»; spinner while locating |
| locate denied | `denied` | `map.locateDenied` «Нет доступа к геопозиции. Разрешить можно в настройках Telegram.» (5 s) |
| locate failed | `fail` / timeout | `map.locateFail` «Не получилось определить, где вы.» (5 s) |
| disabled | drawing mode | locate hidden, taps on pins ignored by the lasso overlay (KV-FE-060) |

## Interaction

- Constants: cluster radius 48, GL max zoom 17, fit max zoom 14 (Leaflet scale), note 6 s, locate error 5 s, ease 500 ms,
  fly 600 ms.
- Haptics: light on pin/stack/cluster taps and locate; success on locate.
- Pins: active pin raised (`z-index` 1000 ladder, `03` §3.6).
- Responsive: full-screen under the top bar; padding respects the top bar and the tab bar; `ResizeObserver` resizes the
  canvas (Telegram Desktop window resizes).

## Telegram integration

TMA-035 (location), TMA-025 (haptics). No Back handler for the map itself (base layer, TMA-022); the selection card's
Back is DEV-013 in KV-FE-061.

## Storage and analytics

- Storage: none in the GL view (`kv-map-fit` is written by KV-FE-062).
- Analytics: `$pageview search/map`; the map sends no events of its own (legacy).

## Files

- `frontend/app/app/(miniapp)/features/map/gl/{MapViewGL.tsx,useMapInit.ts,useMapPoints.ts,useClusterIndex.ts,
  useClusterMarkers.ts,useLocateMe.ts,useAreaMask.ts,markerElements.ts}` (new)
- `frontend/app/lib/map/{pins,geojson}.ts` (new: `groupByLocation`, `spreadStackLabels`, `robustBounds`)
- `frontend/app/tests/map/{pins,geojson,markerElements}.test.ts`, `frontend/app/e2e/map.spec.ts`

## API contract

- API-007 `GET /api/map?<FilterQuery>` (no viewport or paging) → `200 {"points": [{"id", "lat", "lon", "label", "tone"?:
  "good"|"high"|"check"|"suspicious"|null, "priced"?: boolean, "usd"?: number|null}], "total"?: number}`; `lat`/`lon`
  mandatory; `label` plain text (SEC-REQ-018 on the server); errors now shown (step 3).

## Business rules

- Kept: BR-APP-062; SCR-011 camera, cluster and stack behaviour.
- Defect fixes `APPROVED` (policy): LB-APP-008 (points), LB-APP-020, LB-APP-044.

## Acceptance criteria

- 300 points with 12 sharing one coordinate: one stack pin showing the cheapest label and «12»; tapping it opens the
  card at the cheapest listing and spreads 12 labelled pins without overlap.
- A cluster at max zoom opens the card with all its listings sorted by price; below max zoom it zooms in until it
  splits.
- `total: 320`, 300 points, 5 hidden → note «На карте 295 из 315 · у 20 объявлений известен только район» for 6 s.
- A label containing `<b>x</b>` renders literally (no HTML) in pins and stacks.
- A 500 on `/api/map` shows the error pill; «Повторить» refetches; `total: 0` shows the empty pill.
- Visual: side by side with `gl-base` (`SCR-011`) and `gl-pin-click` (`SCR-013`) — pins, tones, clusters, attribution
  and the locate button equal.

## Tests

- Unit: `pins.test.ts` (grouping at 5 dp, price order with nulls, spiral layout non-overlap), `geojson.test.ts`
  (`robustBounds` < 20 and ≥ 20 points, accuracy circle cut-off), `markerElements.test.ts` (no `innerHTML` with server
  text, tone classes).
- E2E (`map.spec.ts`, contract mocks; KV-QA-012 `gl-parity` scenarios as cases): base render, pin click, stack click,
  cluster zoom, locate denied, points 500, empty result.

## Edge cases

- A response arrives after the user left the map: ignored (unmounted).
- Points without `usd`: stacks keep them last; `priced: false` pins styled `nego`.
- `total` missing: note not shown (`total` treated as `points.length`).
- Very dense city (thousands of points): marker sync limited to the padded viewport; measured in KV-FE-173.

## Security

- SEC-REQ-021 / LB-APP-020: every server string is set with `textContent`; no `innerHTML` anywhere in the map code
  (lint rule).
- F-PRIVACY-004 / TMA-035: the user's location stays in the map source on the device.

## Definition of done

Approval recorded; `make ci-frontend` green; unit and E2E tests green (or added when KV-FE-010 lands); side-by-side
review of the SCR-011 / SCR-013 baselines recorded in the PR; parity gate G4 for F-MAP-001 ticked with KV-FE-057,
KV-FE-059…KV-FE-062 (`15` §4); the `09` row updated; PR reviewed by the other developer.
