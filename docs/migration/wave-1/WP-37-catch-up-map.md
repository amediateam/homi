# WP-37 — Catch-up: map

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (#102) |
| Depends on | intake `index-CIa0Ldj2` (`with_point` in the answer of `GET /listings/map`, the stub scenario `map_cut`, the text `map.cut`), WP-28 |
| Size | about 245 changed lines with tests, M |
| Behaviour reference | `03` §2 (SCR-011), §4 (BR-APP-062, BR-APP-111); `02` (BR-API-192); `wave-1/baseline.md`, built code behind the pin, rows 33, 34, 35 |
| Needs from the production track | the regular deploy; then the manual checks inside Telegram on staging that the acceptance checklist names |

## Goal

A map answer that the source cut says «На карте — N самых свежих. Остальные — в списке», and only an uncut answer
with listings known by district alone keeps «На карте N из M · …». A render error of either map view stays inside
the map: a local «Не загрузилось» with «Повторить», not the app's crash screen. Leaving the map and coming back with
the same search keeps the camera on both engines; a changed search fits again.

## Scope

In (sizes are the estimates of `baseline.md`; paths under `frontend/app/`):

- Row 33, about 120 lines: `with_point`, the counts, the cut note.
- Row 34, about 45: an error boundary around the engine view.
- Row 35, about 80: the camera memory of the launch, on GL and on Leaflet.

Out:

- The cap and the order of HOMI's own map answer (which listings are "the newest", how many): WP-42, an open
  question (`24` Q-API-086). On stubs the scenario `map_cut` answers the first half of the points with `with_point`
  and `total` unchanged.
- The points error banner and the selection card's error slot: built already (`baseline.md`, "Not in the table").
- A failed GL chunk that falls back to Leaflet: built by WP-28 (`MapScreen.chunk` tests); unchanged.
- The fit memory per city (`features/map/camera.ts:124-145`, `homi-map-fit:*`): stays as WP-27 built it.

## Decisions that bind this package

- No decision of the developer binds this package.
- Default of the intake of `index-CIa0Ldj2.js`, not a decision of the developer (listed in that PR for the reviewer):
  the cap and the order of HOMI's own map answer are left to WP-42 as an open question; on stubs the scenario
  `map_cut` produces a cut answer. This package reads only `with_point`, whatever the cap.
- The contract (WP-12 "`GET /listings/map`", `docs/api/README.md`): `points`, `total` and `with_point` are always
  present and `count(points) ≤ with_point ≤ total`; fewer points than `with_point` means the source cut the answer.

## Design

### Counts and note

- `features/map/useMapPoints.ts:19,76-77`: the state keeps `with_point` beside `points` and `total`; an answer
  without it (an older driver) takes the number of points.
- `features/map/pins.ts:70-87`: `mapCounts(points, total, withPoint, hidden)` → `{ shown, cut, missing }`:
  `shown` = the points not hidden in this launch; `cut = max(0, withPoint − points.length)`;
  `missing = max(0, total − withPoint)`. The hidden listings are no longer subtracted from `total`.
- `features/map/MapScreen.tsx:178-187,278-283`: when a new answer arrives, `cut > 0` → the note `map.cut` with
  `n = shown`; else `missing > 0` → `map.note` with `shown`, `total = shown + missing` and `map.missing` of
  `missing`; else no note. Never both. The note stays 6 s (`NOTE_MS`), on both engines.

### Render error

- A class component `MapViewBoundary` in `features/map/` wraps the engine view (`MapScreen.tsx:289-309`). A throw
  while rendering `MapViewGL` or `MapViewLeaflet` shows the existing `MapStatusPill` in its error state with
  «Повторить» (`common.loadFailed`, `error.retry`) and calls `reportError(error, { kind: "render" })`
  (`lib/errors/report.ts:17`). «Повторить» gives a light haptic and remounts the view with a new key.
- The boundary sits inside the map screen, so the tab bar, the view toggle and the list stay usable;
  `app/[locale]/error.tsx` is no longer reached by a map view's render error.

### Camera memory

- `features/map/camera.ts`: a module memory of the launch, `{ queryKey, view }` per engine, with
  `rememberCamera(engine, queryKey, view)`, `recallCamera(engine, queryKey)`. In memory only; lost on a reload.
- The key is the map's v1 query (`useMapPoints.ts:116`, `toApiQuery(filters)`), passed to the views through their
  props (`features/map/types.ts:38-67`). The sort and the listings hidden in this launch are not part of it;
  `posted_days` is.
- Written by each view's cleanup (`gl/useMapInstance.ts:197`, `leaflet/useLeafletMap.ts:112`) once a fit or a
  restore has happened; read as the first camera (`gl/useMapInstance.ts:103-107`, `leaflet/useLeafletMap.ts:57`)
  before the fit memory per city and the city's view.
- `useMapCamera` (`gl/useMapInstance.ts:251-326`) and `useLeafletCamera` (`leaflet/useLeafletMap.ts:146-236`) skip
  the first fit when the memory was used; later answers of the same mount fit as before.

## Files

New, under `frontend/app/`: `features/map/MapViewBoundary.tsx`.

Changed, under `frontend/app/`:

- `features/map/{useMapPoints,pins,camera,types}.ts`, `features/map/MapScreen.tsx`,
  `features/map/gl/useMapInstance.ts`, `features/map/leaflet/useLeafletMap.ts`, the two views that pass the key
- tests: `tests/map/{pins,useMapPoints,camera}.test.ts`, `tests/map/{MapScreen,MapViewGL,leafletView}.test.tsx`
- end to end: `e2e/map.spec.ts`, `e2e/map-leaflet.spec.ts`

In `docs/migration/wave-1/baseline.md`, built code behind the pin: rows 33, 34 and 35 are marked closed.

## Steps

1. `with_point` in `useMapPoints`; `mapCounts` with `cut`; the note's choice in `MapScreen`; unit tests.
2. `MapViewBoundary` with the pill, the report and the remount; its test with a throwing view.
3. The camera memory in `camera.ts`; the key through the views; the first camera and the skipped fit on both
   engines; unit tests.
4. End-to-end cases on both engines; the acceptance checklist on staging; tick the rows in `baseline.md`.

## Behaviour to reproduce

### Note (BR-APP-062; BR-API-192; row 33)

- Cut answer (`with_point` above the number of points): «На карте — {n} самых свежих. Остальные — в списке» with
  `n` the points shown, 6 s after the answer, on GL and on Leaflet.
- Uncut answer with `total` above `with_point`: «На карте {shown} из {total} · у N объявлений известен только
  район», with `total = shown + (total − with_point)`.
- Otherwise no note. A listing hidden in this launch lowers `shown` only.

### Render error (SCR-011; row 34)

- A view that throws while rendering shows «Не загрузилось» with «Повторить» inside the map; «Повторить» remounts
  the view; the error is reported with kind `render`. The rest of the app keeps working.

### Camera (BR-APP-111; row 35)

- Map → list → map, or map → another tab → map, with the same search: the map opens where it was left and the first
  answer does not move it. A changed search (filters, area, `posted_days`) fits to its points as before.
- Each engine keeps its own memory; GL saves only after a fit or a restore, Leaflet only once its basemap is on.
- A reload forgets the camera; the fit memory per city still gives the first view of a city.

## Tests

Unit (Vitest):

- `tests/map/pins.test.ts`: `mapCounts` for a cut answer, an uncut answer with listings without a point, both at
  once (cut wins), no `with_point`, hidden points (only `shown` drops), and values that would go negative.
- `tests/map/useMapPoints.test.ts`: `with_point` is kept; a missing one takes the number of points.
- `tests/map/camera.test.ts`: remember and recall per engine and key; another key recalls nothing.

Component (Vitest + Testing Library):

- `tests/map/MapScreen.test.tsx`: which note shows for each count; never both; the note goes after 6 s; a view that
  throws shows the pill and «Повторить», which remounts it, and the error is reported with kind `render`.
- `tests/map/MapViewGL.test.tsx` (`:397-416`) and `tests/map/leafletView.test.tsx`: a remount with the remembered
  key opens at the remembered view and does not fit on the first answer; another key fits; nothing is remembered
  before the first fit (GL) or before the basemap (Leaflet).

End to end (Playwright, fake Telegram, stubs; cookie mode and header mode):

- `e2e/map.spec.ts` (`:441-459`, GL) and `e2e/map-leaflet.spec.ts` (`:298`, `:508-526`): with the stub scenario
  `map_cut` (cookie `homi_stub_scenario`) the note reads «На карте — N самых свежих. Остальные — в списке» with N the
  points shown; the existing "N из M" cases still pass.
- Both specs: pan and zoom the map, go to the list and back: the camera is where it was and no fit follows; change a
  filter and return: the map fits again.
- `tests/map/camera.test.ts`: a new module instance (a document reload) recalls no camera; the fit memory per city
  still gives the first view.

## Acceptance checklist

Run in ru, uz and en, light and dark, in Telegram on staging, on the GL engine and on Leaflet (`?map=leaflet`).

- [ ] A cut answer says «На карте — N самых свежих. Остальные — в списке».
- [ ] An uncut answer with listings without a point says «На карте N из M · …».
- [ ] The two notes never show together, and each goes after 6 s.
- [ ] A render error of the map shows «Не загрузилось» with «Повторить» inside the map and does not reach the app's
      crash screen.
- [ ] Leaving the map and returning with the same search keeps the camera on both engines.
- [ ] A changed search fits the map again.
- [ ] Every new or changed case of `e2e/map.spec.ts` and `e2e/map-leaflet.spec.ts` passes in cookie mode and in
      header mode.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, unit, component and end-to-end suites are green.
- [ ] Rows 33, 34 and 35 of `baseline.md` (built code behind the pin) are marked closed.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web.

## As built

The package is built as designed, with these points decided in the code (rule 6).

- **The counts.** `useMapPoints` gives `shown`, `cut`, `missing` and `queryKey` (the old `total` is gone; the
  «N из M» note computes `shown + missing`). A cut answer whose every point was hidden in this launch is `empty`, and
  the cut note needs at least one point shown: the map has nothing to draw then.
- **The boundary** leaves the map's area empty and tells `MapScreen`, which shows the error pill in the one pill
  slot, before the Leaflet failure's and the points' pills. Its «Повторить» plays the light haptic and remounts the
  boundary with a new key. The loaders of `next/dynamic` still turn a failed chunk into the GL fallback or the
  Leaflet retry: those never throw (`MapScreen.chunk` tests unchanged).
- **The camera memory.** `rememberCamera` / `recallCamera` keep one camera per engine, for one search. Each view
  holds a `CameraMemory` ref shared by its instance hook and its camera hook: `restored` is the search the map opened
  at, consumed by the first answer (kept only when that answer is for the same search, so a search changed in between
  fits), and `placed` is the search last fitted or restored, which the cleanup saves under — a search applied and left
  before its answer never takes the camera of the one before. A restore counts as a fit: the stand-in → city jump does
  not overwrite it, the next answer eases, and on Leaflet the deferred basemap goes on at once.
- **The end-to-end camera case** leaves the map through four routes (the list, the saved, radar and settings tabs) so
  that Next drops the map's route, which it keeps for up to three (`preserving-ui-state.md`); the case checks that
  the route was rendered fresh. With the memory switched off it fails (checked once by hand): while Next keeps the
  route, `<Activity>` keeps the camera without it.
- **WP-31's feed epoch** re-reads the map with the same `responseId` (no fit, no note); WP-37's notes follow only a
  new `responseId`.

## Handoff

Finished: every step, with unit, component and end-to-end tests; rows 33, 34 and 35 of `baseline.md` are marked
closed. The checks and the CI runs are in the description of PR #102. Nothing is half-done. Next: the production
track's deploy and the acceptance checklist on staging.
