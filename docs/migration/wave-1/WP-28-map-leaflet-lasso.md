# WP-28 — Map: Leaflet engine, lasso, spot map

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (merged in #84 on 2026-11-19; production track: WP-27's `CSP_TILE_HOSTS` before the deploy, then the regular deploy; then the manual checks inside Telegram on staging, one of them on a low-end Android device in lite mode) |
| Depends on | WP-27 |
| Size | ≈ 2 800 changed lines, L |
| Behaviour reference | `03` §1.2 (Back while drawing), §1.7, §1.8, §2 (SCR-011 "Differences between engines", SCR-012, SCR-021, the location part of SCR-018), §3.2, §3.4 ("Lasso", "Map", "Geolocation"), §4 (BR-APP-061, BR-APP-008), §5 (LB-APP-001, LB-APP-013, LB-APP-020); `05` (TMA-015, TMA-022, TMA-028, TMA-035); task files KV-FE-059, KV-FE-060, KV-FE-067 (spot map parts). From the task files only behaviour, texts, constants, edge cases and test ideas are taken; their file layout, navigation stack, API paths and transport are not |
| Needs from the production track | A low-end Android device (lite mode) for the pass on staging. Nothing else: `CSP_TILE_HOSTS` of WP-27 already reaches `img-src` (`lib/security/csp.ts`) and the app's `Referrer-Policy` is `strict-origin-when-cross-origin` (`proxy.ts`), so Leaflet's tile images carry the origin (checked on `next start`, AM-91) |

## Goal

Every device gets a working map: where MapLibre GL cannot run, the Leaflet view shows the same pins, stacks,
clusters, card, note, states and locate behaviour, and the temporary "map unavailable" state of WP-27 is removed.
The user can draw a search area with a finger on either engine and cancel it with Telegram's Back. The listing
shows its approximate location on a mini map and on a fullscreen map with "where am I" and links to Yandex and
Google Maps.

## Scope

**In.**

- `features/map/leaflet/MapViewLeaflet` behind the `MapViewProps` contract of WP-27, with markercluster and the
  protomaps-leaflet basemap; fallback wiring in `MapScreen`; fix of LB-APP-013; text-only icons (LB-APP-020).
- Lasso drawing (SCR-012, BR-APP-061) on both engines: the `draw` layer, the overlay, the geometry module, the
  hand-off from the filters sheet, the "too small" signal for the top bar.
- Spot map: the mini map in the listing's location section and the fullscreen overlay at
  `/listing/[number]/location` (SCR-021) in both listing trees, on both engines; fix of LB-APP-001.
- Navigation amendments settled across packages (see "Decisions"), where they are not implemented yet.

**Out.**

- GL view, points, grouping, camera maths, mask geometry, selection card, status pills, warm-up: WP-27 (reused).
- Top bar variants (lasso button, drawing hints, «Отмена», area pill and its ×), view toggle: WP-23.
- «Обвести на карте» in the filters sheet and `applyFilters`: WP-25. Follow nudge after an apply: WP-30.
- Location rows and «Рядом» of the listing: WP-26. Location service and its 12 s cap (LB-APP-009): WP-21.
- Screen name `map/draw`: WP-32 (derived by `screenNameOf` of WP-20).

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| Ref. DEC-44, `25` §3.8 | Leaflet with markercluster and protomaps-leaflet is the fallback engine, chosen by `pickEngine` of WP-27: lite mode, no WebGL2 without a performance caveat, `?map=leaflet`, or a GL failure in this session |
| Ref. DEC-36 | LB-APP-001 and LB-APP-013 are fixed without a flag; the text-only rule of LB-APP-020 covers Leaflet icons |
| Ref. DEC-46 | The engine differences listed under "Behaviour to reproduce" are accepted; states, texts and rules are the same on both engines |
| Ref. DEC-49, `25` §10 | `leaflet` 1.9.4, `leaflet.markercluster` 1.5.3 and `protomaps-leaflet` at the versions WP-03 installed; nothing is added |
| Ref. DEC-45 | This package removes a state real users see on production (`map.unavailable`), so it is taken right after WP-27 |
| `25` §3.2 "Back" | Closing order is sheet, overlay, screen. Drawing and the fullscreen spot map are layers that Back closes |
| Settled: parent of an address | `parentOf(pathname, searchParams)` in `lib/navigation/routes.ts` returns an address or `null`. With a layer parameter present (`pick`, `draw`, `pin`, `step`) the parent is the same address without it. `/filters`, `/filters/<kind>`, `/sort`, `/city` go to `/map` when `from=map`, else `/`, carrying the 25 filter keys and `sort`. `useBack()`: `canGoBack = depth > 0 \|\| parentOf(…) !== null`; `back()` is `router.back()` when `depth > 0`, else `router.replace(parentOf(…))` |
| Settled: drawing is a pushed layer | The lasso button, the «Своя область» pill and the filters hand-off all end in `useLayerState('draw').open()`, which pushes `draw=1`; the BackButton is then visible and Back cancels with `router.back()`, as legacy. The filters sheet never puts `draw` into its navigation |
| Settled: reserved parameters | `from`, `focus`, `pick`, `draw`, `pin`, `step`, `i` are never filter keys: `fromSearchParams` ignores them and `toSearchParams` never writes them |
| Settled: one apply path | A finished stroke applies through `applyFilters` of WP-25, which calls `notifyFiltersApplied`; the follow nudge of WP-30 listens there |

If `routes.ts`, `useBack()` or `@homi/search` do not implement the three "settled" navigation rows when this
package starts, implement them here with their tests and say so in the PR description (queue rule 6).

## Design

Read before coding: `01-app/02-guides/lazy-loading.md` (`ssr: false` only inside a Client Component; libraries
through `import()`), `01-app/02-guides/single-page-applications.md` ("Shallow routing": `pushState` and
`replaceState` integrate with the router), `01-app/03-api-reference/03-file-conventions/parallel-routes.md` and
`intercepting-routes.md` (the two listing trees), and
`01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md` ("Navigation with Activity": Effects of
a hidden route are cleaned up and re-created). Facts about `leaflet`,
`leaflet.markercluster` and `protomaps-leaflet` beyond the audit are **verify before use** at the installed
versions; the list is in step 1.

### Leaflet view (`features/map/leaflet/`)

- `MapViewLeaflet.tsx` implements `MapViewProps` of `features/map/types.ts` unchanged. `MapScreen` loads it with
  `next/dynamic(() => import('./leaflet/MapViewLeaflet'), { ssr: false })`. Leaflet, its plugins and their CSS are
  imported only inside this chunk. `leaflet/library.ts` `loadLeaflet()` loads `leaflet`, then `leaflet.markercluster`,
  then `protomaps-leaflet`, once per session: Leaflet 1.9.4 ships only a UMD build, which sets `window.L`, and both
  plugins read that global; every other module imports Leaflet's types only and gets the library with the map
  (AM-90).
- `MapScreen` changes: `MapUnavailable.tsx` and the key `map.unavailable` are deleted. The Leaflet view mounts when
  `pickEngine` says so, when the GL chunk fails to load, or when the GL view calls `onFail` (then `markGlFailed`
  of WP-27 runs once). A fallback during drawing closes the `draw` layer; filters are kept. If the Leaflet chunk
  fails too, the error pill of WP-27 is shown and «Повторить» retries the import. `warmMap()` warms the chunk of
  the engine `pickEngine` picks.
- Map: maximum zoom 18; no attribution control: `MapAttribution` of `MapScreen` draws «© OpenStreetMap», plus
  «· Protomaps» with vector tiles, for both engines and routes its links to `tg.openLink` (AM-88).
- Basemap (`basemap.ts`, `useDeferredBasemap.ts`): added after the first fit or after 1.2 s, whichever comes first;
  before that the palette's land colour. `tiles` empty → OSM raster layer, maximum zoom 19, tile images requested
  with an origin referrer; a string → the protomaps-leaflet vector layer with the palettes of WP-27 and label rules
  in the interface locale (`basemapRules.ts`: GL's style layers with the palette's colours, not protomaps'
  `paintRules(flavor)`, AM-89), `maxDataZoom` 15. A vector failure switches to raster and reports `map_tiles_failed`
  once per session, shared with GL (`features/map/useBasemap.ts`); protomaps-leaflet 5.1.0 reports no tile failure of
  its own, so the layer's sources are watched (`watchVectorErrors`, AM-89). The layer is re-created when the scheme,
  lite mode or locale changes.
- Listings layer (`listingLayer.ts`, `icons.ts`, `useSpiderfy.ts`): marker clusters with `maxClusterRadius` 48 and
  `spiderfyOnMaxZoom` off. Pin, stack and cluster icons come from one builder shared with GL: move
  `gl/markerElements.ts` of WP-27 to `features/map/markerElements.ts`. Icons are DOM nodes filled with
  `textContent`; no HTML string ever carries server text (the ESLint rule of WP-27 covers this folder).
- Stacks spread on tap with `spreadStackLabels` of WP-27 and collapse when a zoom starts. A cluster tap first
  collapses any spread stack, then zooms or selects (fix of LB-APP-013).
- Camera: the fit rules of WP-27 (`robustBounds`, padding 90 / 24, maximum zoom 14, first fit not animated), the
  city jump, the default view, and `homi-map-fit:<lat>,<lon>` saved after the first fit.
- Mask: `maskGeometry()` of WP-27 as a polygon with a hole. Locate: a circle marker of radius 7 and an accuracy
  circle under 2 km (`useMyLocation.ts`).
- In-map tile prefetch on `moveend`, only for a `{z}/{x}/{y}` template: tiles around the stopped view within the
  per-stop budget and the session cap of `tilePrefetch.ts` (WP-27), one cap for the list's warm-up and the map
  (`prefetchTileUrls`); nothing with Save-Data or on `2g`.

### Drawing layer (`MapScreen`, `lib/ui/shellState.ts`)

- `const draw = useLayerState('draw')`; drawing is on while the address has `draw=1`. `shellVariantOf()` of WP-23
  already maps that to `map-drawing`, so `TopBar` shows the hints and «Отмена» and the view toggle hides.
- Starting (`startDrawing()` in `MapScreen`): light haptic, `shellState.areaTooSmall = false`, selection card
  closed, `draw.open('1')`. Callers: the lasso button and the area pill of `TopBar`, and the consumer below.
- Hand-off from the filters sheet: WP-25 calls `requestDraw()` and then `closeThen(routes.map(q))` with districts
  and zones cleared. `MapScreen` calls `consumeDrawRequest()` once in its activation effect (first mount and every
  re-show) and starts drawing when it returns `true`. `requestDraw()` stores a timestamp;
  `consumeDrawRequest()` clears it and returns `true` only if it is younger than 3 s, so a failed hand-off cannot
  start drawing on a later visit. Add both functions to `shellState.ts` if they are missing, and replace the
  temporary "close at once" code of WP-27.
- Leaving: «Отмена» and Telegram Back both run `back()` of `useBack()`; a tab press, the view toggle's absence, the
  SettingsButton and any other route change end drawing because the address changes.
- Reload on `/map?draw=1` (depth 0): drawing mode stays. The BackButton is visible because `parentOf()` returns the
  same address without `draw`; Back and «Отмена» replace to it.
- Finished stroke: `applyFilters(setGeography(filters, { polygon }), { sort, target: routes.map })`.
  `setGeography` (WP-22) clears districts and zones (BR-APP-008). `applyFilters` normalises, keeps or resets the
  sort, leaves the layer with `closeThen(routes.map(q))` (or `router.replace` at depth 0; `q` never contains
  `draw`), scrolls to the top and calls `notifyFiltersApplied`.

### Lasso (`features/map/lasso/`)

- `polygon.ts` is pure and has no map import: `lassoToPolygon(screenPoints, unproject)` and the constants.
  `serializePolygon` stays in `@homi/search`; `maskGeometry` stays in WP-27's `mask.ts`.
- `LassoOverlay.tsx` covers the map between the top bar and the tab bar while drawing and talks to the engine
  through `LassoHost = { unproject(x, y), panBy(dx, dy), zoomAround(x, y, scale) }`, implemented by
  `gl/GlLasso.tsx` and `leaflet/lassoHandlers.ts`.

| Rule | Value |
| ---- | ----- |
| Drawing pointer | the first pointer, with pointer capture; a mouse works the same (Telegram Desktop) |
| Point spacing | a point closer than 4 px to the previous one is skipped; points outside the overlay clamp to its box |
| Second pointer | drops the stroke; the two pointers pan and pinch the map, applied once per animation frame; marker re-sync is deferred 150 ms (GL: camera moves tagged `LASSO_MOVE` re-sync the marker layer once; Leaflet: the host fires one `moveend` 150 ms after the last move, AM-93) |
| Stroke end | lifting the drawing pointer, or losing pointer capture |
| Rejected | fewer than 3 points, or a span under 40 px on either axis |
| Simplification | Douglas–Peucker from a 3 px tolerance, × 1.5 per pass, until at most 40 vertices |
| Closing gap | the last vertex is dropped when it is within 12 px of the first and more than 3 remain |
| Self-intersection | the outline is replaced by its convex hull |
| Output | `[lat, lon]` pairs rounded to 5 decimals, not closed, 3–40 vertices; otherwise `null` |

### Spot map (`features/listing/spot/`)

- `spotGeometry.ts`: radius = the listing's `geo_radius_m`, or 500 m when missing, zero or negative; circle ring;
  `yandexUrl()`, `googleUrl()` with 6-decimal coordinates; `yandexZoom(radius)`; bounds of spot plus user;
  distance to the user.
- `useSpotMap(containerRef, spot, { interactive, tiles, scheme, locale, lite })` is the only owner of the map
  container (fix of LB-APP-001). One effect: pick the engine with `pickEngine`, import `spotGL.ts` or
  `spotLeaflet.ts`, create the map, draw the circle (fill opacity 0.12, outline per theme) and the attribution.
  Each run has a cancellation flag: an import that resolves after cleanup creates nothing; cleanup disposes the
  instance before any new run. A GL rejection calls `markGlFailed` and continues with Leaflet in the same run.
  Returns `{ status, showUser(point), fitSpotAndUser() }`.
- `SpotMap.tsx` (mini map) replaces `sections/SpotMapSlot.tsx` of WP-26, which is deleted: a button (aria
  `listing.mapOpen`) around a 2:1 box with an expand icon; the map mounts when the box comes within 300 px of the
  viewport (`IntersectionObserver`, `rootMargin: '300px'`) and reference data is loaded; it ignores pan and zoom.
- `SpotMapRoute.tsx` is what `location/page.tsx` renders in `(main)/listing/[number]/` and in
  `(main)/@overlay/(.)listing/[number]/` (both route files replace the WP-20 placeholder and hold no logic). It
  reads the listing with `useListingRecord()` of WP-26 from the resource cache — no request of its own — and the
  screen's reported state from the listing layer's context, and renders `SpotMapFullscreen` in a `RouteOverlay` at
  z-index 100. No coordinates, or a listing error (in the cache, or a cookie-mode server failure that stays in the
  screen's first answer): `back()` (AM-92).
- `SpotMapFullscreen.tsx`: interactive map, close button, locate button, bottom card. The user's position lives in
  component state, is dropped on close and is never sent (TMA-035).

## Files

New, under `frontend/app/` (as built; the files beyond the first plan are marked ⁺):

- `features/map/leaflet/{MapViewLeaflet.tsx,useLeafletMap.ts,listingLayer.ts,icons.ts,useSpiderfy.ts}`,
  `features/map/leaflet/{basemap.ts,basemapRules.ts,useDeferredBasemap.ts,useMyLocation.ts,lassoHandlers.ts}`,
  `features/map/leaflet/library.ts`⁺ (the load order, AM-90), `features/map/leaflet/useLeafletMask.ts`⁺,
  `features/map/useBasemap.ts`⁺ (GL's basemap rule and its session failure state, moved to serve both engines)
- `features/map/lasso/{polygon.ts,LassoOverlay.tsx}`, `features/map/gl/GlLasso.tsx`
- `features/listing/spot/{SpotMap,SpotMapFullscreen,SpotMapRoute}.tsx`,
  `features/listing/spot/{useSpotMap,spotGeometry,spotGL,spotLeaflet}.ts`
- `tests/map/{lassoPolygon,leafletIcons,useSpiderfy,drawRequest}.test.ts`, `tests/map/LassoOverlay.test.tsx`,
  `tests/listing/{spotGeometry,useSpotMap}.test.ts`, `tests/listing/SpotMapFullscreen.test.tsx`;
  `tests/map/{leafletBasemap,leafletListingLayer,useClusterMarkers}.test.ts`⁺, `tests/map/leafletView.test.tsx`⁺,
  `tests/listing/spotEngines.test.ts`⁺, `tests/listing/SpotMap.test.tsx`⁺
- `e2e/{map-leaflet,map-lasso,spot-map}.spec.ts`

Changed:

- `features/map/MapScreen.tsx` (fallback, drawing, draw request), `features/map/engine.ts` (`warmMap`),
  `features/map/markerElements.ts` (moved from `gl/`), `tests/map/MapScreen.test.tsx`, `tests/map/MapScreen.chunk.test.tsx`.
- `features/map/gl/MapViewGL.tsx` (the lasso while drawing), `features/map/gl/useMapInstance.ts` (re-exports
  `useBasemap`), `features/map/gl/useClusterMarkers.ts` (the deferred re-sync, AM-93), `features/map/tilePrefetch.ts`
  (`prefetchTileUrls`, one session cap), `features/map/map.css` (the Leaflet icon box, font, dark raster), with
  `tests/map/{tilePrefetch,markerElements}.test.ts` and `tests/map/MapViewGL.test.tsx`.
- `app/[locale]/(main)/listing/[number]/location/page.tsx`,
  `app/[locale]/(main)/@overlay/(.)listing/[number]/location/page.tsx`.
- `features/listing/sections/LocationSection.tsx` (uses `SpotMap`); `features/listing/{ListingLayer.tsx,useListing.ts}`
  (the screen's reported state in the layer's context, AM-92) with the tests that build that context.
- `lib/ui/shellState.ts` (the draw request's timestamp); `tests/navigation/routes.test.ts` (the `parentOf` and
  reserved-parameter cases). `lib/navigation/routes.ts`, `lib/navigation/useBack.ts` and `@homi/search` already had
  the three settled rows and are unchanged.
- `frontend/packages/ui/src/icons/index.ts` (`Maximize2`, with its test and the dev gallery),
  `frontend/app/eslint.config.mjs` (ignores the copied MapLibre worker under `public/maplibre/`).
- `e2e/map.spec.ts` (the "unavailable" case becomes a Leaflet case, as does the `?map=` persistence case),
  `e2e/shell.spec.ts` (the lasso step now reaches drawing), `e2e/foundation.spec.ts` (a comment).

Deleted: `features/map/MapUnavailable.tsx`, `features/listing/sections/SpotMapSlot.tsx`, the key `map.unavailable`
in `frontend/packages/i18n/messages/homi/{ru,uz,en}.json` (and its row in `packages/i18n/tests/catalogue.test.ts`).

## Steps

1. Read the documents named in "Design". Verify and note in the PR description: importing Leaflet 1.9.4 and
   markercluster only on the client; whether `divIcon` accepts an element (if not, create the icon empty and fill
   its element when the marker is added); the tile layer option that sets the referrer policy of tile images; the
   protomaps-leaflet layer API, its `maxDataZoom` and label-rule options at the installed version.
2. Settled navigation rules: `parentOf(pathname, searchParams)`, `useBack()`, reserved parameters,
   `requestDraw` / `consumeDrawRequest` — add what is missing, with unit tests.
3. `lasso/polygon.ts` with `lassoPolygon.test.ts`.
4. Leaflet view base: map, raster basemap, deferred basemap, attribution, disposal in the effect cleanup.
5. Listings layer: clusters, shared icon builder, stacks, the collapse-before-cluster rule, tap rules, haptics.
6. Camera, fit memory, city jump, mask, locate.
7. Vector basemap with protomaps-leaflet, fallback to raster, in-map tile prefetch.
8. `MapScreen`: mount Leaflet by rule and on GL failure; delete `MapUnavailable` and its key; update tests.
9. `LassoOverlay`, `GlLasso`, `lassoHandlers`; `startDrawing`, the draw-request consumer, the finish and cancel
   paths; `areaTooSmall`.
10. `spotGeometry.ts` and `useSpotMap.ts` with their tests; `spotGL.ts`, `spotLeaflet.ts`.
11. `SpotMap` in the location section; delete `SpotMapSlot`.
12. `SpotMapRoute`, `SpotMapFullscreen`, both `location/page.tsx` files.
13. End-to-end specs; run the checklist on staging on a GL device and a lite device; tick it in the PR.

## Behaviour to reproduce

### Leaflet view

Same states, texts, tap rules, note, pills, card and locate behaviour as the table of WP-27 (SCR-011, SCR-013).
Differences a user may notice between the engines, all kept from legacy:

| Aspect | GL | Leaflet |
| ------ | -- | ------- |
| Label font | bundled Noto Sans glyphs | system font of the vector layer |
| Attribution | own component | Leaflet control |
| Pinch while drawing | fractional zoom | whole zoom steps |
| Spread stack on zoom | stays until a tap elsewhere | collapses when the zoom starts |
| Order in a max-zoom cluster | by price | markercluster's order |
| Basemap on open | at once | after the first fit, at most 1.2 s |
| Tile prefetch while panning | none (the library fetches its own) | within the per-stop budget |
| Theme or language change | style rebuilt in place | basemap layer re-created |

### Drawing (SCR-012)

| State | Trigger | What the user sees |
| ----- | ------- | ------------------ |
| Drawing, idle | lasso button, tap on the «Своя область» pill, or «Обвести на карте» in the filters sheet | top bar: `map.areaHint` «Обведите пальцем, где искать», `map.areaMove` «Двумя пальцами — двигать карту», `map.areaCancel` «Отмена»; BackButton visible; view toggle, locate button and card hidden; the mask of an existing area stays |
| Stroke | finger down and moving | an outline follows the finger |
| Two fingers | a second finger lands | the outline disappears; the map pans and zooms; drawing mode stays |
| Too small | stroke rejected | error haptic; outline cleared; top bar `map.areaSmall` «Обведите покрупнее» + `map.areaMove`; drawing mode stays |
| Area set | valid stroke | success haptic; drawing ends; the mask shows the area; top bar pill `map.areaOn` «Своя область» with × (aria `map.areaRemove` «Убрать область»); the feed and the map search inside it |

| Action | Result |
| ------ | ------ |
| Tap the lasso button (aria `map.area` «Обвести на карте») | light haptic; drawing starts as a pushed layer |
| «Обвести на карте» in the filters sheet | the sheet closes, the map opens with districts and zones cleared, drawing starts; one Back cancels drawing and the map stays |
| Finger down | light haptic at the start of each stroke |
| Valid stroke | `applyFilters` with the polygon, districts and zones empty; sort kept or reset to `new`; address `/map` without `draw`; scroll to top; `notifyFiltersApplied` |
| «Отмена» | light haptic; drawing ends; filters unchanged |
| Telegram Back while drawing | drawing ends; the map stays |
| Reload while drawing | drawing mode is restored; Back or «Отмена» leaves it |
| Tab press, SettingsButton | drawing ends with the route change |
| × on the area pill | light haptic; polygon removed; no nudge (WP-23 renders it; verified here) |
| GL fails while drawing | Leaflet mounts, drawing is cancelled, filters kept |

A downward stroke must not collapse the Mini App: vertical swipes are disabled by WP-21 (TMA-015).

### Spot map (SCR-021 and the mini map of SCR-018)

| State | Trigger | What the user sees |
| ----- | ------- | ------------------ |
| No coordinates | listing without `lat` / `lon` | no mini map and no hint; `/location` returns to the listing |
| Mini map waiting | box farther than 300 px from the viewport, or reference data not loaded | the box in the background colour, no spinner |
| Mini map | box near the viewport | static map with the circle of the approximate place; attribution; hint `listing.mapApprox` «Место примерное: по кварталу, ориентиру или метро из объявления» (rendered by WP-26) |
| Mini map failed | both engines failed | the box keeps the background; the tap still opens the fullscreen map, which tries again |
| Fullscreen, idle | tap on the mini map | interactive map; close button (aria `common.close`); locate button (aria `map.locate` «Где я») when location is available; bottom card with the place name in bold, the line `listing.mapApprox`, buttons `listing.openYandex` «Яндекс Карты» and `listing.openGoogle` «Google Карты» |
| Locating | locate tapped | spinner in the button; button disabled |
| Located | position received | success haptic; blue dot; the view fits spot and user; line `listing.mapFromYou` «≈ {km} км от вас — место примерное» (one decimal) |
| Locate denied | answer `denied` | line `map.locateDenied` «Нет доступа к геопозиции. Разрешить можно в настройках Telegram.» |
| Locate failed | answer `fail`, including the 12 s cap | line `map.locateFail` «Не получилось определить, где вы.» |

| Action | Result |
| ------ | ------ |
| Tap the mini map | light haptic; `router.push(routes.listingLocation(number))`; the listing stays underneath |
| Close button or Telegram Back | the fullscreen map closes; the listing is still open; a second Back closes the listing |
| Swipe on the fullscreen map | pans the map; there is no swipe-to-close and the listing's swipe-back does not fire |
| «Яндекс Карты» | light haptic; `tg.openLink('https://yandex.uz/maps/?ll=<lon>,<lat>&z=<zoom>&pt=<lon>,<lat>,pm2rdm')` with zoom 17 / 16 / 15 / 13 for a radius ≤ 250 / ≤ 600 / ≤ 1 500 m / larger |
| «Google Карты» | light haptic; `tg.openLink('https://www.google.com/maps/search/?api=1&query=<lat>,<lon>')` |
| Open and close the same listing repeatedly | exactly one map instance per mount; no «Map container is already initialized» (LB-APP-001) |

No new i18n keys. `map.unavailable` (added by WP-27) is removed.

## Tests

**Unit (Vitest).**

- `lassoPolygon.test.ts`: 2 points → `null`; 39 px span → `null`, 40 px → polygon; a 200 px circle of 300 points →
  at most 40 vertices; closing-gap drop at 11 px and not at 13 px; a figure-eight → its convex hull; rounding to 5
  decimals; never fewer than 3 or more than 40 vertices.
- `leafletIcons.test.ts`: a label with markup renders literally; tone classes; cluster sizes 32 / 38 / 44.
- `useSpiderfy.test.ts`: spread, collapse on zoom start, collapse before a cluster tap is handled.
- `drawRequest.test.ts`: consumed once; `false` without a request; `false` after 3 s (fake timers).
- `routes.test.ts` additions: `parentOf` for `/map?draw=1`, `/map?pin=7`, `/filters?from=map&city=…`,
  `/listing/5/actions?step=report`; reserved parameters dropped by `fromSearchParams` and never written.
- `spotGeometry.test.ts`: default radius for missing, 0 and negative; zoom 17 / 16 / 15 / 13 at 250 / 600 / 1 500 /
  1 501 m; link formats and 6-decimal rounding.
- `useSpotMap.test.ts` (engines mocked): StrictMode double effect → one live instance; unmount disposes; unmount
  during the import → nothing created; GL rejection → Leaflet and one `markGlFailed`.

**Component (Testing Library, map libraries mocked).**

- `LassoOverlay.test.tsx` (synthetic pointer events): 4 px skip; second pointer drops the stroke and emits pan and
  zoom; pointer-up finishes; lost capture finishes; invalid stroke → `onTooSmall`; valid → `onDrawn`.
- `MapScreen.test.tsx`: Leaflet by rule and after `onFail`; Leaflet chunk failure → error pill and retry; draw
  request consumed once on activation; `startDrawing` closes the card and hides locate; a drawn polygon calls
  `applyFilters` with empty districts and zones and `target: routes.map`; too small sets
  `shellState.areaTooSmall`; fallback during drawing closes the layer.
- `SpotMapFullscreen.test.tsx`: locate states and texts; external links per radius; close calls `back()`.

**End to end (fake Telegram, stubs, cookie mode and header mode).** Headless Chromium passes the WebGL2 probe and
picks GL (as WP-27 found, AM-84); Leaflet cases launch with `?map=leaflet` (AM-87).

- `map-leaflet.spec.ts`: the scenarios of `map.spec.ts` (pins, stack, cluster, card, error, empty, locate) on
  Leaflet; a max-zoom cluster tap with a spread stack collapses the stack first.
- `map-lasso.spec.ts`, on both engines: filters → «Обвести на карте» → map in drawing mode with the BackButton
  visible → Back cancels and the map stays; lasso button → mouse stroke of a large loop → the area pill, the
  next `/bff/listings/map` request carries `polygon` and no districts or zones, and the address keeps `polygon`
  after the toggle to the list (the feed's first page is fetched on the server in cookie mode and is not visible
  to the test); a tiny stroke →
  «Обведите покрупнее»; «Отмена»; reload on `/map?draw=1` → still drawing → Back → `/map` without `draw`; × on
  the pill removes the polygon.
- `spot-map.spec.ts`: mini map mounts on scroll; tap → fullscreen; Back closes it before the listing; locate with
  a fake position → the distance line; no request carries coordinates; ten open/close cycles without a console
  error; direct load of `/listing/<n>/location` shows the fullscreen map over the listing page.

**Not automated:** two-finger pan and pinch while drawing, whole-step versus fractional zoom, the native location
sheet, tile likeness, scrolling smoothness on a lite device.

## Acceptance checklist

Run in ru, uz, en and in light and dark; on a GL-capable profile and on a non-GL profile (lite mode or
`?map=leaflet`); in cookie mode and header mode.

- [ ] Non-GL profile: the map opens on Leaflet; the "map unavailable" state no longer exists anywhere.
- [ ] Leaflet shows the same pins, tones, stacks, clusters, card, «На карте {shown} из {total} · …» note, loading,
      empty and error pills as GL for the same search.
- [ ] Leaflet basemap appears after the first fit or within 1.2 s; «© OpenStreetMap» is in the control and opens
      outside the app.
- [ ] Tapping a max-zoom cluster while a stack is spread collapses the stack and opens the cluster's card.
- [ ] A label with markup is shown as text on Leaflet pins, stacks and clusters.
- [ ] A forced GL failure switches to Leaflet at once and for the rest of the session.
- [ ] Lasso button starts drawing: hints «Обведите пальцем, где искать» and «Двумя пальцами — двигать карту»,
      «Отмена», BackButton visible, view toggle and locate hidden, open card closed.
- [ ] «Обвести на карте» in the filters sheet closes the sheet and starts drawing on the map; the BackButton is
      visible; Back cancels drawing and the map stays.
- [ ] A large loop becomes «Своя область»: mask on the map, pill in the top bar, feed and map limited to it,
      districts and zones cleared.
- [ ] A tiny stroke shows «Обведите покрупнее» with an error haptic and drawing continues.
- [ ] A self-crossing outline still produces an area; two fingers move the map without leaving drawing.
- [ ] «Отмена», Telegram Back, a tab press and the SettingsButton each end drawing without changing filters.
- [ ] Reloading while drawing keeps drawing mode; Back then leaves it and stays on the map.
- [ ] × on the area pill removes the area; tapping the pill starts a new drawing.
- [ ] A new area offers the follow nudge under the conditions of WP-30 (once WP-30 is merged).
- [ ] Listing with coordinates: the mini map appears when scrolled near, shows the circle, does not pan.
- [ ] Listing without coordinates: no mini map, no hint.
- [ ] Tap on the mini map opens the fullscreen map; Back closes it, then the listing.
- [ ] Locate on the fullscreen map: denied text, failure text, success with the dot, both points in view and
      «≈ {km} км от вас — место примерное».
- [ ] «Яндекс Карты» and «Google Карты» open the right place outside the app; Yandex zoom follows the radius.
- [ ] Opening and closing listings repeatedly never logs «Map container is already initialized».
- [ ] Drawing, the Leaflet map and the spot map work on a listing opened over the feed and on a direct load.
- [ ] Inside Telegram on staging: iOS, Android (one lite device), Desktop (mouse drawing) and Web.

## Handoff

- **Steps 1–12 are done**, and step 13's specs; its checklist on staging waits for the production track (below). The
  branch `wp-28-map-leaflet-lasso` starts from `wp-27-map-gl` at `94a414d` (the developer's «Следующий пакет — WP-28»
  came while #83 was in review), so its PR is stacked on #83 until that merges. The orchestrator built a vertical
  slice first and checked it on `next start`; then plain subagents, at most three at a time, each owning its own
  files, in one build wave, one follow-up wave and one end-to-end wave, with two review rounds after them. What the
  slice and the builds found is written into the text above (rule 6) and recorded as AM-87 … AM-93 in the phase-3
  notes §Z.
  - `7d57dc7` slice: `leaflet/library.ts`, the map and camera, raster tiles, clusters, the engine switch in `MapScreen`,
    `MapUnavailable` and `map.unavailable` removed, `markerElements.ts` moved up. `0db8dea`: the skeleton of stub hooks.
  - `949696b` the Leaflet view; `c6dea7f` the lasso and drawing; `6b14977` the spot map.
  - `6a6d124` one prefetch cap and the GL markers' deferred re-sync; `297ca2c` the spot route's leave rule on a
    cookie-mode server failure, `Maximize2`.
  - `f4a7c5b` the end-to-end specs, and the two bugs they found (the Leaflet icon box shrank a cluster and the spread
    dot; the spot map's container was 0 px high on GL).
  - `31aa139` review round 1 fixes, `f7ba4b2` review round 2 fix.
  - Size: 81 files, +9 735 / −371 against `94a414d`, of which tests and specs are +6 365. The header's estimate was
    ≈ 2 800 changed lines.
  - The checklist lines stay unticked: each asks for ru / uz / en, light / dark and a GL and a non-GL profile, several
    for Telegram on staging.
- **Step 1, verified at the installed versions:** Leaflet 1.9.4 and markercluster are imported only on the client,
  through `loadLeaflet()` in this order (UMD and the global `L`, AM-90); `divIcon` takes an `Element` as `html` and
  appends it (`options.html instanceof Element` in `DivIcon.createIcon`), so the icon needs no empty-then-fill step;
  `TileLayer`'s option is `referrerPolicy`; protomaps-leaflet 5.1.0's layer is `leafletLayer({ url, flavor, lang,
  paintRules, labelRules, maxDataZoom, backgroundColor, attribution })`, it reads `L.GridLayer` when a layer is made,
  and pnpm installed its own `pmtiles` 3.2.1 next to the app's 4.5.0.
- **Reviews** (each finding checked by a refuting agent):
  - Round 1 (the Leaflet view, drawing, the spot map, security and regressions; 4 findings, 1 refuted), fixed in
    `31aa139`: a Leaflet pin kept for another listing at the same address with the same label; a Leaflet map removed
    during a zoom animation or a pinch threw from Leaflet's timer; a GL chunk failure while drawing ran Back twice
    under StrictMode (`next dev` only).
  - Round 2 (the fixes, cross-module flows; 1 finding), fixed in `f7ba4b2`: the wheel's debounce timer outlived the
    removal too.
- **Checks** (from `frontend/` unless marked):
  - **Slice (`7d57dc7`):** a production build and a throwaway Playwright probe against `next start` with
    `?map=leaflet&mapdebug`: four stacks drawn, one cluster of 44 at zoom 9, the stack's card opens, the icon roots
    carry no size of their own, OSM tiles requested as images with `referer: http://localhost:3001/`, no console error
    or CSP report. Repeated on the `6a6d124`/`297ca2c` build with the same result.
  - **Builders:** each ran its own tests, ESLint (0 warnings) and the app typecheck, and showed its new tests failing
    against a broken version (reported by the builders, not re-run by the orchestrator). The orchestrator showed each
    review fix's test failing against the unfixed code.
  - **`f7ba4b2`:** `make ci-frontend` — types, lint, typecheck and the build (its `prebuild` copied the MapLibre
    worker) passed; the test step failed once with `ENOENT` on `node_modules/.vitest-cache` in `@homi/search` (two
    files, no assertion), and `pnpm test` again passed: app 183 files / 2831 + 1 todo, `@homi/search` 238 + 1 todo,
    `@homi/testing` 95, `@homi/ui` 121, `@homi/i18n` 112, `@homi/api-client` 14, `@homi/utils` 2.
  - **End to end**, each of the 22 files alone against a local `next start`, with a pause between files (KI-32):
    on the `f7ba4b2` build (the `make ci-frontend` one): map 17, map-leaflet 17, map-lasso 9, spot-map 13, csp 3,
    shell 16, data 5, gates 8, foundation 19, back 11, feed 19, filters 20, listing-open 16, listing-contact 14,
    listing-actions 14, photo-viewer 6, launch 5, city 6, session 7, boot-failure 6, crash 4, smoke 2 — 237 passed,
    none failed or skipped. The same 237 passed on the `f4a7c5b` build before the reviews. While the three spec writers
    ran at once, sign-ins stuck at `booting` (KI-32) and artefact folders collided; every file then passed alone, twice.
  - **CI on #84:** `frontend` green; `frontend-e2e` on `eb9369e` failed 2 (a race in the new spot-map spec, fixed in
    `fc93076`, and the shell pull test); on `fc93076` it failed 1 (a foundation test) and passed 237 on the rerun of
    the job. Both unrelated failures are KI-63.
  - No backend change, so no `composer ci:check`.
- **Open for the reviewer:**
  - Lite mode on Leaflet keeps markercluster's animations, Leaflet's zoom and fade animations and the dark raster
    filter; the spec names no lite reduction for Leaflet beyond the basemap rules.
  - The dark raster on Leaflet is a CSS filter approximating GL's raster paint; to be compared by eye.
  - The spot circle uses the mask outline colour of the palette (the theme's text colour), fill 0.12; the palette has
    no spot colour of its own.
  - The fullscreen spot map shows no spinner while an engine loads (the spec rules one out only for the mini map).
  - A GL failure first met on the spot map moves the whole session, the search map included, to Leaflet
    (`markGlFailed`, as the spec says).
  - KI-61 (library internals at the pinned versions) and KI-62 (a template's 404 tile on Leaflet).
  - Not automated: two-finger pan and pinch while drawing, whole versus fractional zoom, a lost pointer capture, the
    native location sheet, the vector basemap and its prefetch (no tile file is hosted), the restyle on a theme or
    language change, the Leaflet chunk failing (its file name is a build hash), the spot map's "both engines failed",
    the locate failure text on the spot map (unit test only), uz / en and dark, tile likeness, scrolling on a lite
    device, the follow nudge (WP-30).
- **Needs from the production track:** nothing beyond WP-27's (`CSP_TILE_HOSTS` before the deploy; the build through
  `pnpm -r build`): `img-src` and the referrer are already right (AM-91). Then the regular deploy and the checklist
  inside Telegram on staging: iOS, Android with one lite device, Desktop (mouse drawing) and Web.
