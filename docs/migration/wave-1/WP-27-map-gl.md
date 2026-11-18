# WP-27 — Map: MapLibre GL engine

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (#83) |
| Depends on | WP-25 |
| Size | ≈ 3 000 changed lines without the glyph font files, L |
| Behaviour reference | `03` §1.7–§1.9, §2 (SCR-011, SCR-013), §3.2, §3.4 ("Map", "Tile prefetch budget"), §3.6 (z-index ladder), §4 (BR-APP-062), §5 and §5b (LB-APP-008, LB-APP-017 … LB-APP-020, LB-APP-024, LB-APP-044); `05` (TMA-012, TMA-035); task files KV-FE-057, KV-FE-058, KV-FE-061, KV-FE-062, KV-FE-031. From the task files only behaviour, texts, constants, edge cases and test ideas are taken; their file layout, navigation stack, API paths and transport are not |
| Needs from the production track | (1) `CSP_TILE_HOSTS` in the app's server environment of staging and production, starting with `https://tile.openstreetmap.org`, plus the origin of the PMTiles file once it is hosted (the PMTiles reader uses `fetch` with `Range`, so its origin must be in `connect-src`; the same list feeds the MapLibre worker's policy); (2) the PMTiles file on the media host with `Range` (206), CORS for the app origins with `Access-Control-Expose-Headers: ETag` (KV-INF-021) and the name of its Protomaps basemap schema version; until then `tiles` stays empty; (3) a long-lived cache rule in nginx for `/map-fonts/`; `/maplibre/<version>/` must keep going to the app, not be served by nginx from disk: the proxy answers it with the worker's policy (its cache stays Next.js's revalidated `max-age=0`, so a rollback never meets a cached 404); (4) the build goes through `pnpm` (`homi-deploy` runs `pnpm -r build`), whose `prebuild` writes `frontend/app/public/maplibre/<version>/`: a bare `next build` leaves it out and every GL device falls back to «Карта … недоступна»; the files must be readable by the Next unit's user, like `.next` |

## Goal

`/[locale]/map` shows the listings of the current search on a MapLibre GL map: price pins, stacks of equal
coordinates, clusters, the selection card, the camera rules, "where am I", and the loading, empty and error states
legacy lacked. The engine is chosen by the legacy rule and loaded on demand; a device that cannot run GL sees an
explicit "map unavailable" state until WP-28 adds the Leaflet engine. The basemap works on the raster fallback today
and on the PMTiles file as soon as the production track hosts it.

## Scope

**In.**

- Route `(main)/map/page.tsx`, `features/map/MapScreen`, the engine rule, the lazy GL view, the shared view contract
  that WP-28 implements for Leaflet.
- Points from `GET /listings/map`, hidden listings excluded, stacks, Supercluster clusters, pins and tones, tap rules,
  the "N of M" note (SCR-011, BR-APP-062).
- Camera rules, area mask for a polygon that is already in the filters, city jump, fit memory.
- Selection card with lazy previews (SCR-013).
- Locate button.
- Basemap: raster fallback, PMTiles protocol, tile template, attribution, label fonts, theme and locale re-styling.
- Code warm-up and tile prefetch from the list view.
- Defects fixed: LB-APP-008, LB-APP-017, LB-APP-018, LB-APP-019, LB-APP-020, LB-APP-044. LB-APP-024 behind
  `dev013BackClosesMapCard` (off).

**Out.**

- Leaflet engine, lasso drawing and the listing's spot map: WP-28. Drawing is a pushed `draw` layer that the lasso
  button, the «Своя область» pill and the filters hand-off (`requestDraw()` of `lib/ui/shellState.ts`) open. Until
  WP-28, `MapScreen` closes that layer as soon as it opens and discards a pending draw request with
  `consumeDrawRequest()`, so every entry point lands on the plain map and no dead drawing mode reaches production.
- Top bar (map variant), view toggle, area pill and its ×: built by WP-23; this package only feeds them.
- Filters, sort and city sheets opened from the map: WP-25. Listing opened from the card: WP-26.
- Screen tracking `search/map`: WP-32. Bundle-size gate and the pass inside Telegram: WP-33.
- Hosting the PMTiles file and the CSP header itself: production track and WP-21.

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| Ref. DEC-44, `25` §3.8 | Both engines exist; GL is the main one and is chosen by the legacy rule of `03` §1.8. Both are client-only and loaded on demand |
| Ref. DEC-36 (fixes without a `DEV` row are made; `DEV` rows ship off) | The six defects above are fixed without a flag; "Back closes the card" is DEV-013 and ships off |
| Ref. DEC-46 | Functional parity: palette, label font and animation timing may differ slightly; states, texts, tap rules and constants may not |
| Ref. DEC-49, `25` §10 | `maplibre-gl` 6.11.2, `pmtiles`, `supercluster` at the versions WP-03 installed. No other map package is added; the vector style is written by hand |
| Ref. DEC-45 | Every merge reaches production: the "map unavailable" state is visible to real users on non-GL devices until WP-28 merges, so WP-28 follows immediately |
| `25` §3.5 | Map points are a browser read through `/bff/*` in both session modes; no Server Component fetches them |
| `25` §3.8, §3.10 | `tiles` is `map.tiles_url` of `GET /reference` (WP-11, read with `useReference()`); it is `null` in Wave 1 until KV-INF-021; tile hosts are allowed by the CSP of WP-21 through `CSP_TILE_HOSTS` |
| `25` §4.1, §4.4 | `503 source_unavailable` shows the "could not load" state; a `meta.source = stub` answer raises the demo marker through `reportSource` |
| `25` §2 rule 3 | Nothing is copied from the legacy tree: style, palette and geometry are written from the audit; Noto Sans files come from the upstream release |

## Design

Read before coding: `01-app/02-guides/lazy-loading.md` (`next/dynamic` with `ssr: false` works only inside a Client
Component; libraries are loaded with `import()`), `01-app/02-guides/content-security-policy.md`,
`01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md` ("Navigation with Activity": a route that
is navigated away from is hidden, its Effects are cleaned up and re-created when it is shown again) and
`01-app/02-guides/preserving-ui-state.md`, `01-app/03-api-reference/03-file-conventions/public-folder.md`.
Facts about `maplibre-gl`, `pmtiles` and `supercluster` that are not in the audit are **verify before use** in the
package's own documentation at the installed version; the list is in step 1.

### Component tree

```text
app/[locale]/(main)/map/page.tsx          route file: <Suspense><MapScreen initialQuery=…/></Suspense>
features/map/MapScreen.tsx                'use client': engine, lazy view, points, selection, states
├── MapLoading.tsx                        the centred spinner (engine, view chunk, library)
├── gl/MapViewGL.tsx                      next/dynamic(…, { ssr: false }); this package
├── leaflet/MapViewLeaflet.tsx            WP-28; until then MapUnavailable.tsx
├── MapStatusPill.tsx  MapNote.tsx  LocateButton.tsx  MapAttribution.tsx
├── MapSelectionCard.tsx                  compact ListingCard of WP-24 per slot; useCardLayer.ts (DEV-013)
└── useLocate.ts  useDocumentLook.ts  useMapPoints.ts
features/map/MapWarmup.tsx                rendered by (main)/page.tsx (the feed): idle warm-up and tile prefetch
```

`MapScreen` owns everything that is the same on both engines: the search state (`useSearchState()`), the points
request, grouping, the selection, the note, the pills, the locate request and the card. A view only draws and
reports gestures. The contract, in `features/map/types.ts`:

```ts
type MapGroup = { key: string; lat: number; lon: number; items: MapPoint[] };   // one pin or one stack
type Selection = { numbers: number[]; at: number } | null;
type MapViewProps = {
  groups: MapGroup[]; responseId: number;            // responseId changes only with a new answer → refit
  selection: Selection; onSelect(numbers: number[], at?: number): void; onBackground(): void;
  polygon: Polygon | null; cityView: { center: [number, number]; zoom: number };
  cityKnown: boolean;                                // false while cityView is the Tashkent stand-in
  tiles: string | null | undefined; locale: Locale; scheme: 'light' | 'dark'; lite: boolean;
  me: { lat: number; lon: number; accuracy: number | null } | null;
  drawing: boolean; onDrawn?(p: Polygon): void; onTooSmall?(): void;      // used from WP-28
  onFail(reason: 'webgl' | 'chunk' | 'style'): void;
  onBasemap?(basemap: Basemap): void;                // the basemap drawn: raster after a vector failure
};
```

### Engine choice (`features/map/engine.ts`)

`pickEngine({ override, saved, webgl, webgl2NoCaveat, lite, glFailed })` is pure; browser wrappers feed it.

| Order | Condition | Result |
| ----- | --------- | ------ |
| 1 | launch address has `?map=gl` or `?map=leaflet` | store it in `homi-map-engine`, continue with it as `saved`; `?map=auto` removes the key |
| 2 | a GL failure happened in this session (`glFailed`) | Leaflet |
| 3 | saved `leaflet` | Leaflet |
| 4 | saved `gl` | GL when a WebGL2 context can be created (MapLibre 6 needs WebGL2: `new Map` throws `GPUInitializationError` without it), else Leaflet |
| 5 | nothing saved | GL when a WebGL2 context with `failIfMajorPerformanceCaveat: true` can be created **and** lite mode is off; else Leaflet |

- `?map=` is a launch parameter (TMA-012, parsed by WP-21's `lib/deeplinks/parse.ts`, with `mapDebug` for
  `?mapdebug`). The view toggle keeps only the search keys, so the map reads the query captured when
  `lib/deeplinks/launch.ts` loads, through `launchMapOptions()`. `?mapdebug` sets `window.homiMap` to the map object
  only when `NEXT_PUBLIC_APP_ENV` is not `production`.
- The probe context is released at once. The key is local-only in `lib/storage.ts`.
- `markGlFailed(reason)` sets the session flag and calls `reportError(new Error('map_gl_failed'), { kind: 'error' })`
  once (LB-APP-019). The engine never changes mid-session for any other reason.
- `warmMap()` loads the view chunk, `maplibre-gl` and `pmtiles` once (`gl/library.ts`: the worker URL, the
  `pmtiles://` protocol and `prewarm()`, which also keeps the worker alive while the route is hidden); a failed load
  may be retried. It is called only from an effect, an idle callback or a pointer event, never while rendering
  (LB-APP-018). `useEngine()` answers `null` on the server and until its first effect, so rendering never probes
  WebGL.

### Data (`features/map/useMapPoints.ts`, `pins.ts`)

- Request: `bffFetch('listings/map', { query: toApiQuery(filters), signal })` (the signature of WP-22) on every
  change of the query string (`filtersKey` ignores `posted_days`, which the map takes); no sort, no paging, no
  viewport. The previous request is aborted and an answer for older filters is dropped. `lib/api/bffAllowList.ts`
  already has `listings/map` and `listings/:number`. Points are read only while the session is ready and the engine
  is GL (WP-28 drops the engine condition).
- Answer, per the contract of WP-12: points `{ number, lat, lon, label, tone, priced, usd }` (`tone` may be `null`,
  `usd` orders a stack) and `total`. A missing `total` counts as the number of points. `bffFetch` already reports
  each answer's `meta.source` (`reportSource`), so the hook does not; it keeps the last answer's source, and
  `MapScreen` renders `<SourceReporter>` with it while the map is its own address, so the demo marker comes back when
  the map is shown again (Back from a listing, a closed sheet, a tab round trip). The filters are those of the map's
  own address, `useScreenSearchState("map")` (KI-43).
- `groupByLocation(points, hidden)`: drop numbers present in `useSessionMap('hidden')`; group by `lat` and `lon`
  rounded to 5 decimals; sort each group by price ascending, missing price last. `shown` = points kept;
  `total` = answer total minus hidden points.
- Status: `loading` (request pending and nothing to show), `ready`, `empty` (no points and `total = 0`), `error`
  (`UiError`). `forbidden` follows the mapping of WP-22 (`dev001AnyForbiddenShowsAccess`).

### Pins, stacks, clusters (`gl/useClusterIndex.ts`, `gl/useClusterMarkers.ts`, `gl/markerElements.ts`)

- Supercluster over the groups: radius 48, `maxZoom` 17, extent 512, queried with `Math.floor` of the GL zoom (so
  radius 48 is 48 px); one point per group with its size, summed by `map` / `reduce` (`point_count` counts groups).
- Markers are DOM elements synced to the viewport plus 10 % on `moveend` and on integer-zoom changes. Marker taps
  come from the map's own `click`; a click whose target is inside `.maplibregl-marker` is never a background tap.
  A spread stack is taken out of the index and stays open while zooming (legacy GL); it closes with the card.
- Pin: class `pin` plus the tone (`good`, `high`, `suspicious`, `check`), `nego` when the point is not priced,
  `active` when selected (z-index 1000). Stack: the cheapest label plus a count badge. Cluster: a circle with the
  count, 32 / 38 / 44 px for fewer than 10 / fewer than 50 / more.
- **Text only (LB-APP-020).** Every server string is set with `textContent` on nodes created with
  `document.createElement`. An ESLint rule scoped to `features/map/**` and `features/listing/spot/**` forbids
  `innerHTML`, `outerHTML`, `insertAdjacentHTML` and `dangerouslySetInnerHTML`.

### Camera (`features/map/camera.ts`, `mask.ts`)

- GL zoom = Leaflet zoom − 1. All numbers below are on the Leaflet scale, as in the audit; `toGlZoom()` converts.
- On a new answer (`responseId` changed): fit the polygon bounds if the filters have a polygon, else
  `robustBounds(points)` — the 3 %–97 % quantile box from 20 points up, the plain box below 20. Padding 90 top and
  bottom, 24 left and right; maximum zoom 14. The first fit is not animated, later ones take 500 ms.
- A change of the hidden set rebuilds markers and does not move the camera.
- A city change jumps to the city's centre and zoom from reference data, then the new answer fits. Until a city
  view is known: Tashkent `[41.3111, 69.2797]`, zoom 12.
- After the first fit for a city the view is saved as `homi-map-fit:<lat>,<lon>` → `[lat, lon, zoom]` (4 decimals,
  Leaflet scale); corrupt JSON is ignored. Nothing is saved, and no city jump is made, while the city view is still
  the Tashkent stand-in (`cityKnown: false`).
- Area mask: with a polygon, a dimmed world rectangle with the polygon cut out and an outline
  (`maskGeometry(polygon)`).
- Map options: maximum zoom 17 (GL scale), rotation, pitch and keyboard off, no world copies, pixel ratio
  `min(devicePixelRatio, 2)` (1 in lite), no built-in attribution control, `validateStyle: false` (the style builder
  is validated offline). MapLibre's own `trackResize` resizes the canvas.

### Basemap and tiles (`features/map/tiles.ts`, `gl/style.ts`, `palette.ts`, `gl/fonts.ts`)

| `tiles` in reference data | Source | Attribution |
| ------------------------- | ------ | ----------- |
| absent (reference data failed to load) | none: background colour only | none |
| `null` or empty string (Wave 1 today) | OpenStreetMap raster, `tile.openstreetmap.org/{z}/{x}/{y}.png` | «© OpenStreetMap» |
| a string ending in `.pmtiles` | vector source through the PMTiles protocol | «© OpenStreetMap · Protomaps» |
| a string with `{z}/{x}/{y}` | vector tile template | «© OpenStreetMap · Protomaps» |

- Raster tiles carry `referrerPolicy: 'strict-origin-when-cross-origin'` whatever the page policy is (the tile server
  asks for a referrer): the map's `transformRequest` sets it for `https://tile.openstreetmap.org/` (MapLibre fetches
  raster tiles with `fetch`, which honours it), so no custom protocol is needed. Raster source: `tileSize` 256,
  `maxzoom` 19. OSM tiles are never prefetched.
- `loadMapLibre()` registers the `pmtiles://` protocol once (`new Protocol({ metadata: false })`). A rejected read, a
  missing file or a source error of the vector source rebuilds the style on the raster source for the rest of the
  session and reports `map_tiles_failed` once (tile half of LB-APP-008); the view reports the basemap it draws
  (`onBasemap`), so the attribution follows.
- The vector style is written for the Protomaps basemap schema of the hosted file: land, water, green, roads,
  buildings, boundaries, place and road labels. Label text uses the name field of the interface locale with a
  fallback to the default name. Light and dark palettes are derived from the design tokens of WP-20 and compared
  by eye with legacy screenshots. Lite mode uses fewer layers.
- Label glyphs: 12 Noto Sans 2.015 subsets (latin, latin-ext, cyrillic, cyrillic-ext × 400, 500, 600) under OFL 1.1,
  stored in `frontend/app/public/map-fonts/` with `OFL.txt`. Upstream publishes no woff2 subsets, so they were made
  with fonttools 4.68 (`pyftsubset <ttf> --unicodes=<ranges> --flavor=woff2`, the ranges in `gl/fonts.ts`) from the
  unhinted TTFs of `notofonts.github.io` (developer, 2026-11-18: «Поставить fonttools»). MapLibre 6 takes them
  through the style's `font-faces` (`{ url, "unicode-range" }` per face, one range per element; keys equal the
  `text-font` names `Noto Sans Regular | Medium | SemiBold`; the weight comes from the file); there is no `glyphs`
  URL, a face loads only when a label needs it, and a codepoint outside the faces is drawn locally. Files in `public/`
  are served with `Cache-Control: public, max-age=0` (bundled `public-folder.md`), hence the nginx rule in the field
  table.
- The style is rebuilt without re-creating the map when `html[data-scheme]`, `html.lite` or the locale changes
  (`MutationObserver` on `<html>`), and when the polygon, the "me" position or the basemap changes:
  `setStyle(buildStyle(…), { diff: true })`. A diff also compares GeoJSON data set at runtime, so the mask and "me"
  sources travel in the built style.
- Worker: MapLibre 6 ships its worker as an ES module that imports a shared module, and Turbopack emits the worker
  without that sibling. `scripts/copy-maplibre-worker.mjs` (`predev`, `prebuild`) copies both into
  `public/maplibre/<version>/` (gitignored) and `loadMapLibre()` calls `setWorkerUrl`. MapLibre 6 has no CSP build and
  needs neither `'unsafe-eval'` nor WebAssembly.
- `MapAttribution` renders the two links (`https://www.openstreetmap.org/copyright`, `https://protomaps.com`) and
  opens them with `tg.openLink`. The strings are not translated, as in legacy. The link allow-list of WP-21
  (`lib/telegram/links.ts`) names neither host, so `tg.openLink` would refuse both: this package adds
  `www.openstreetmap.org` and `protomaps.com` to the constant, with a case in `tests/telegram/links.test.ts`.
- CSP (WP-21 reads the keys; this package documents them in `frontend/app/.env.example`): `CSP_TILE_HOSTS`, a
  space-separated list of origins added to `connect-src` and `img-src`. The page policy of WP-21 already has what
  MapLibre needs (`worker-src 'self' blob:`, `img-src … data: blob:`). The worker is a same-origin file, so it takes
  the policy of its own response: the proxy answers `/maplibre/` with a worker policy whose `connect-src` carries
  the same tile hosts (vector template tiles are fetched inside the worker).

### Selection card (`features/map/MapSelectionCard.tsx`)

- Selection is state of `MapScreen`. One number: one glass card with the compact `ListingCard` (one photo, short
  verdict, no badges, no "viewed" eye) and a × (aria `common.close`). Several numbers: header `map.stackOf` and a
  horizontal scroll-snap track with one slot per number; only slots within ±1 of the current index render content;
  slots are 85–90 % wide so neighbours peek. Z-index 31, above the tab bar and the bottom inset. The track follows the
  selection's index: a spread-pin tap scrolls it, a swipe reports the new index, new numbers start it again.
- Preview per slot: `GET /listings/{number}?preview=1` — the preview form of WP-12, which returns the preview
  object only and records no view — through `bffFetch('listings/' + number, { query: { preview: 1 } })` and
  `useResource('listing-preview:' + number, …)`, for the current and adjacent slots, once each.
- A failed slot shows an inline retry for that slot (LB-APP-017).
- With `dev013BackClosesMapCard` on, the selection is mirrored into `useLayerState('pin')` (`useCardLayer`): opening
  pushes `pin=<number>`, Back closes the card and collapses the stack, a card closed another way pops the entry, and
  an address replaced under the card (the deal switch, a filters apply) steps back over the entry first, so the root
  map tab gets no Back. A direct load with `pin` strips the parameter. Off (default): the card is not a history
  layer.
- Because the map route stays mounted under an intercepted listing, returning from the listing shows the same card.
  When the route is hidden and shown again by a tab switch, the view effect re-creates the map; `MapScreen` clears
  the selection in that effect so no card survives without its pin.

### Warm-up and tile prefetch (`features/map/MapWarmup.tsx`, `tilePrefetch.ts`)

- On the list view, 2.5 s after it settles (timer reset when the address changes, cancelled on leaving): `warmMap()`
  for the engine `pickEngine` would choose. A pointer-down on «Карта» in the view toggle calls `warmMap()` at once
  (`ViewToggle`'s `onIntent`, passed by `AppShell`). Nothing runs with Save-Data or on `2g` / `slow-2g`. With no saved
  fit the view is the city centre at `zoom − 1`, so the data zoom is two below the city's (Tashkent 12 → z10).
- Tile prefetch only for a `{z}/{x}/{y}` template: once per (template, city centre) per session; view = the saved
  fit, else the city centre at `zoom − 1`; data zoom `min(fitZoom − 1, 15)`; the tiles covering half a screen
  (512 px tiles), nearest first; a shared set of requested URLs prevents duplicates; bytes are counted from the
  responses. A `.pmtiles` address gets the code warm-up only.

| Mode | Tiles per stop | Preload tiles | Preload bytes | Bytes per session |
| ---- | -------------- | ------------- | ------------- | ----------------- |
| Save-Data, `2g`, `slow-2g` | 0 | 0 | 0 | 0 |
| lite | 2 | 3 | 300 KB | 1.5 MB |
| full | 4 | 6 | 600 KB | 4 MB |

## Files

New, under `frontend/app/`:

- `app/[locale]/(main)/map/page.tsx` (replaces the placeholder of WP-20; the route marker is `display: contents`).
- `features/map/{MapScreen,MapLoading,MapUnavailable,MapStatusPill,MapNote,LocateButton,MapAttribution}.tsx`,
  `features/map/{MapSelectionCard,MapWarmup}.tsx`, `features/map/map.css` (the markers, imported by
  `styles/app.css`).
- `features/map/{types,engine,useMapPoints,pins,camera,mask,tiles,palette,tilePrefetch,useLocate}.ts`,
  `features/map/{useCardLayer,useDocumentLook}.ts`
- `features/map/gl/{MapViewGL.tsx,library.ts,useMapInstance.ts,style.ts,fonts.ts,useClusterIndex.ts}`,
  `features/map/gl/{useClusterMarkers.ts,markerElements.ts,useAreaMask.ts,useMeLayer.ts}`
- `scripts/copy-maplibre-worker.mjs` (run by `predev` and `prebuild`; its output `public/maplibre/` is gitignored).
- `public/map-fonts/*.woff2` (12 files) and `public/map-fonts/OFL.txt`.
- `tests/map/{engine,pins,camera,mask,tiles,tilePrefetch,style,markerElements,useMapPoints,useClusterIndex}.test.ts`,
  `tests/map/{MapScreen,MapScreen.chunk,MapSelectionCard,MapWarmup,MapViewGL}.test.tsx`, `e2e/map.spec.ts`.

Changed:

- `app/[locale]/(main)/page.tsx`: renders `<MapWarmup />`.
- `features/shell/ViewToggle.tsx` (`onIntent`; its address from the screen state of its view) and
  `features/shell/AppShell.tsx` (passes it); `features/shell/TopBar.tsx`: `MapBar` reads `useScreenSearchState("map")`,
  so under a listing opened from the card it keeps the map's deal, badge and area (KI-43);
  `features/shell/SearchProof.tsx` and `SearchProofServer.tsx` (the WP-22 proof on the placeholder) are deleted.
- `lib/deeplinks/parse.ts` (`mapDebug`) and `lib/deeplinks/launch.ts` (`launchMapOptions()`). The allow-list, the
  storage keys, `requestDraw()` / `consumeDrawRequest()` and `tg.location.available()` were already there.
- `lib/telegram/links.ts` (the two attribution hosts) and `tests/telegram/links.test.ts`.
- `proxy.ts` and `lib/security/csp.ts` (the worker's policy on `/maplibre/`).
- `eslint.config.mjs` (the HTML-injection rule, also `setHTML`), `.env.example` (`CSP_TILE_HOSTS`), `package.json`
  (`predev`, `prebuild`), `.gitignore`, `styles/app.css`.
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json`: the new keys of "Behaviour to reproduce".
- `frontend/packages/testing/src/playwright.ts`: the guard answers a tile of the OSM raster with a blank PNG (the map
  shows that basemap while `tiles` is `null`); `frontend/playwright.config.ts` and
  `.github/workflows/frontend-e2e.yml`: `CSP_TILE_HOSTS` for the end-to-end server.
- `e2e/data.spec.ts` (the WP-22 checks re-hosted on the map and the feed), `e2e/gates.spec.ts` (the header-mode
  refusal on the map's read), `e2e/shell.spec.ts` (the lasso lands on the plain map until WP-28),
  `e2e/csp.spec.ts` (the worker's policy).

## Steps

1. Read the documents named in "Design". Then verify and write down in the PR description: how MapLibre 6.11.2 is
   imported in a lazy client chunk and how its CSS is loaded only there; its worker under the CSP of WP-21;
   `addProtocol`; the PMTiles protocol class; how label fonts are supplied; the Supercluster options used.
2. `types.ts` and `engine.ts` with `engine.test.ts`.
3. `pins.ts`, `camera.ts`, `mask.ts`, `tiles.ts` with their unit tests.
4. `useMapPoints.ts` with its test; allow-list entries.
5. `MapScreen`, the route file, `MapUnavailable`, `MapStatusPill`, `MapNote`; engine pick and lazy load with a
   centred spinner fallback; `onFail` handling. The screen works end to end with a stub view in tests.
6. `gl/useMapInstance.ts` and `gl/style.ts` on the raster source; `MapAttribution`; theme and locale re-styling;
   disposal in the effect cleanup.
7. Cluster index, markers, tap rules, haptics; the ESLint rule.
8. Camera rules, city jump, fit memory, area mask.
9. `useLocate`, `LocateButton`, the "me" dot and accuracy circle.
10. `MapSelectionCard` with previews, the failed-slot retry and the `dev013BackClosesMapCard` branch.
11. Vector path: PMTiles registration, template source, the vector style, fonts, fallback to raster.
12. `MapWarmup`, `tilePrefetch.ts`, the toggle intent.
13. New i18n keys, `.env.example`, `e2e/map.spec.ts`.
14. Run the checklist on staging with the production track's `CSP_TILE_HOSTS`; tick it in the PR.

## Behaviour to reproduce

### States

| State | Trigger | What the user sees |
| ----- | ------- | ------------------ |
| Engine loading | view chunk or library pending | centred spinner, no text |
| Map unavailable (until WP-28) | the rule picks Leaflet, or GL failed | new key `map.unavailable` «Карта на этом устройстве пока недоступна» and a button with the list label of the view toggle that goes to `routes.feed(q)` |
| Points loading | request pending, nothing drawn yet | small spinner pill over the map, accessible name from new key `map.loading` «Загружаем объявления…» (fix of LB-APP-044) |
| Ready | points arrived | pins, stacks, clusters; camera fitted |
| Note | `total > shown` after a new answer | `map.note` «На карте {shown} из {total} · {missing} известен только район» with plural `map.missing` («у {n} объявления» / «у {n} объявлений»), 6 s |
| Empty | no points and `total = 0` | pill with new key `map.empty` «Ничего не найдено в этой области» |
| Error, server | request failed, `source_unavailable`, timeout | pill `common.loadFailed` «Не загрузилось» + button `error.retry` «Повторить» (fix of LB-APP-008) |
| Error, offline | `UiError` `offline` | pill `error.offline` «Нет связи» + `error.retry` |
| Basemap pending | `tiles` absent | background colour, pins still shown |
| Raster basemap | `tiles` empty, or a vector failure | OSM tiles, «© OpenStreetMap» |
| Vector basemap | PMTiles file or template | vector map, «© OpenStreetMap · Protomaps» |
| Card, single | pin tapped | compact card with × |
| Card, stack | stack or max-zoom cluster tapped | `map.stackOf` «{n} из {total}» and the track |
| Card slot loading | preview pending | centred spinner in the slot |
| Card slot failed | preview request failed | `feed.retry` «{error} — повторить» with `common.loadFailed` (fix of LB-APP-017) |
| Locating | locate tapped | spinner in the button, button disabled |
| Locate denied | answer `denied` | `map.locateDenied` «Нет доступа к геопозиции. Разрешить можно в настройках Telegram.» in the note, 5 s |
| Locate failed | answer `fail`, including the 12 s cap of WP-21 | `map.locateFail` «Не получилось определить, где вы.» in the note, 5 s |
| Area set | filters have a polygon | mask over the map; the top bar shows «Своя область» (`map.areaOn`) and its × |

New keys (HOMI layer; uz wording to be confirmed by the reviewer):

| Key | ru | uz | en |
| --- | -- | -- | -- |
| `map.empty` | «Ничего не найдено в этой области» | «Bu hududda hech narsa topilmadi» | «Nothing found in this area» |
| `map.loading` | «Загружаем объявления…» | «Eʼlonlar yuklanmoqda…» | «Loading listings…» |
| `map.unavailable` (removed by WP-28) | «Карта на этом устройстве пока недоступна» | «Bu qurilmada xarita hozircha ishlamaydi» | «The map is not available on this device yet» |

### Actions

| Action | Result |
| ------ | ------ |
| Tap a pin | light haptic; any open stack collapses; the card opens for that listing; the pin becomes `active` |
| Tap a stack | light haptic; all listings of the group are selected, cheapest first; the stack spreads into labelled pins on a spiral without overlaps, with a dot at the centre |
| Tap a spread pin | the card track scrolls to that listing |
| Swipe the card track | light haptic per slot (`tg.haptic.impact()`; the facade has no selection haptic); the matching spread pin becomes `active` |
| Tap a cluster below maximum zoom | light haptic; the camera eases (500 ms) to the bounds of its leaves, at least to the expansion zoom, padding 120 / 130 / 56 / 56 |
| Tap a cluster at maximum zoom | the card opens with all its listings sorted by price |
| Tap the map background | the card closes and the stack collapses |
| Tap × on the card | the card closes |
| Tap the card | the listing opens over the map through `ListingCard`'s own handler (`routes.listing(number)`); the listing is added to the `seen` map |
| Tap the heart on the card | favourite toggle of WP-24 |
| Tap «Повторить» in the pill or a slot | the request is repeated |
| Tap locate | light haptic; `tg.location.get()`; on success a success haptic, the blue dot, an accuracy circle when accuracy is under 2 km, and a fly (600 ms) to zoom 15 or closer |
| Change filters, deal, city | the card closes; the previous request is aborted; a new answer refits the camera |
| Tap the filters button of the top bar | `routes.filters({ …q, from: 'map' })`; applying returns to the map |
| Telegram Back with a card open | flag off: nothing changes for the card (legacy); flag on: the card closes |

Rules and limits: pan and pinch only; the locate button is shown when the adapter reports that location is
available (add `tg.location.available()` to the facade if WP-21 has no such query), no card is open and drawing is
off; the position stays in component state and is never sent anywhere (TMA-035); a new answer, a hidden listing in
the selection, or entering drawing mode closes the card; the map sends no analytics events of its own.

## Tests

**Unit (Vitest, `frontend/app/tests/map/`).**

- `engine.test.ts`: the full table override × saved × WebGL × caveat × lite × `glFailed`; `?map=auto` clears;
  `markGlFailed` reports once; `warmMap` is single-flight and retries after a rejection.
- `pins.test.ts`: grouping at 5 decimals; price order with missing prices last; hidden numbers dropped and
  `shown` / `total` adjusted (300 points, total 320, 5 hidden → 295 of 315, 20 missing); the spiral layout
  (`spreadStackLabels(group)` in `pins.ts`, reused by WP-28 under this name) without overlapping boxes for 2, 12
  and 50 labels.
- `camera.test.ts`: `robustBounds` for 1, 19, 20 and 500 points with outliers; zoom conversion; padding;
  fit-memory round trip and corrupt JSON.
- `mask.test.ts`: ring orientation and the cut-out for a triangle and a 40-vertex polygon.
- `tiles.test.ts`, `style.test.ts`: source per `tiles` value; palette per scheme; label field per locale; rebuild
  on vector failure; no layer refers to a missing source.
- `tilePrefetch.test.ts`: budget table; tile set for a known centre and zoom; once per region; session byte cap.
- `markerElements.test.ts`: a label `<b>x</b>` renders literally in pins and stacks; tone classes; cluster sizes.
- `useMapPoints.test.ts`: abort on change; stale answer dropped; each status; the answer's source kept, no second
  `reportSource`.

**Component (Testing Library, map library mocked).**

- `MapScreen.test.tsx`: engine → view; `onFail` switches to the fallback, the second mount goes straight to it and
  one error is reported; pills for loading, empty, error and retry; note timing with fake timers; card closes on
  new filters; selection cleared when the view effect re-runs; an opened `draw` layer is closed at once and a
  pending draw request is discarded (replaced by WP-28).
- `MapSelectionCard.test.tsx`: single and stack layouts; a 7-listing stack requests indexes 0 and 1, then 2, 3, 4
  after a swipe to 3, and nothing twice; failed slot retry; external index scroll; both branches of
  `dev013BackClosesMapCard` with `withDevFlags`.
- `MapWarmup.test.tsx`: nothing during render; one warm-up under StrictMode; cancelled on unmount before 2.5 s;
  skipped with Save-Data.

**End to end (`e2e/map.spec.ts`, fake Telegram, stubs, cookie mode and header mode).** Headless Chromium renders
WebGL2 in software (SwiftShader) and passes the caveat probe (checked on the first run), so GL is the default pick
and the unavailable state is launched with `?map=leaflet`. The CSP checks a tile request before any route sees it,
so the end-to-end server gets `CSP_TILE_HOSTS`; the guard of `@homi/testing/playwright` answers OSM tiles with a
blank PNG, and a spec's own `page.route` runs before it (`allowHosts` already existed). The default stub search draws
four stacks of eleven on the fitted camera (45 points; repeats keep their base's location).

- Open the map from the toggle: pins from the stub answer are visible; the demo marker shows.
- Pin → card → listing → Back: the map and the same card are still there.
- Stack → header «1 из N» → swipe → header updates.
- `listings/map` answered 500 → error pill → «Повторить» → pins; answered with no points → `map.empty`.
- Preview answered 500 → slot retry → card.
- Locate with a fake LocationManager: denied text; success moves the camera; no request carries coordinates.
- Launch with `?map=leaflet` → `map.unavailable` and the button returns to the list (changed by WP-28).

**Not automated:** real GPU rendering and performance, pinch on devices, the native permission sheet, the vector
basemap until a file is hosted (checked on staging when `tiles` is first set), palette likeness.

## Acceptance checklist

Run in ru, uz, en and in light and dark; on a GL-capable profile and on a non-GL profile (lite mode or
`?map=leaflet`); in cookie mode and header mode.

- [ ] The toggle opens the map; a spinner shows while the engine loads; no map code is in the first load of `/`.
- [ ] Pins show the price label with the right tone; an unpriced listing has the `nego` style.
- [ ] Listings at one address form a stack with the cheapest label and a count; tapping spreads it without overlaps.
- [ ] A cluster zooms in on tap; at maximum zoom it opens the card with its listings, cheapest first.
- [ ] A background tap and × close the card; the active pin is raised above the others.
- [ ] The card shows one photo, price with its price-kind label (WP-24), short verdict, no badges and no eye; the
      heart toggles; a tap opens the listing and Back returns to the same card.
- [ ] A stack card shows «{n} из {total}» and swipes; only neighbouring previews are requested.
- [ ] A failed preview shows «Не загрузилось — повторить» and recovers.
- [ ] «На карте {shown} из {total} · …» appears for 6 s when some listings have no coordinates, with the right
      plural in each language.
- [ ] Hiding a listing (from the listing's actions) removes its pin without moving the camera.
- [ ] Loading pill, `map.empty`, server error with «Повторить» and offline error each appear in their case.
- [ ] A new search fits the camera (polygon first, else the robust box); changing the city jumps there.
- [ ] A polygon in the filters shows the mask and the «Своя область» pill; × removes both.
- [ ] Locate: denied text, failure text (5 s each), success with the dot and accuracy circle; hidden while a card
      is open.
- [ ] `tiles` empty: OSM raster with «© OpenStreetMap»; the links open outside the app.
- [ ] A broken vector address falls back to raster; the map is never blank.
- [ ] Theme switch and language switch restyle the basemap without a reload.
- [ ] A forced GL failure is reported once and the next map open in the session does not retry GL.
- [ ] Non-GL profile: `map.unavailable` with a working button back to the list.
- [ ] `?map=gl`, `?map=leaflet`, `?map=auto` persist and clear the choice across launches.
- [ ] After 2.5 s on the list the map opens without a chunk request; with Save-Data nothing was preloaded.
- [ ] A label containing markup is shown as text; the ESLint rule fails on `innerHTML` in the map folders.
- [ ] With `dev013BackClosesMapCard` on (test build), Back closes the card; off, Back is unchanged.
- [ ] Inside Telegram on staging: iOS, Android, Desktop and Web each show the map or the unavailable state.

## Handoff

- **Steps 1–13 are done** on `wp-27-map-gl` (from `main` = `d4c0d88`, after #82); step 14, the checklist on staging,
  waits for the production track (below). The orchestrator built a vertical slice first and checked it on
  `next start` (the worker and its shared module load under the nonce CSP, `load` and `idle` fire, the OSM tiles
  carry the origin-only referrer, headless Chromium passes the caveat probe); then plain subagents, at most three at
  a time, each owning its own files, in two build waves and one end-to-end wave, with two review rounds after them.
  The facts the slice and the research verified are written into "Design" above (rule 6) and recorded as AM-80 …
  AM-86 in the phase-3 notes §Y.
  - `bca55ab` slice: the worker copy script, `gl/library.ts`, `types.ts`, the twelve label fonts with `OFL.txt`.
  - `bcd58f8` wave 1: the engine rule and launch options; basemap, palette, fonts and the style builder; pins,
    camera, mask and prefetch; `useMapPoints`; the marker DOM and `map.css`; the ESLint rule; the link hosts; the
    three keys.
  - `aa60ff3` wave 2: the screen, the GL view, the card with `useCardLayer`, the warm-up and `onIntent`; the e2e guard
    and the end-to-end server's `CSP_TILE_HOSTS`. `c8ec053`: the GL container sized by its parent (MapLibre's CSS made
    it `position: relative`, 0 px high) and the route marker `display: contents`.
  - `d4e077c` the end-to-end specs: `map.spec.ts`, and `data.spec.ts` / one `gates.spec.ts` test re-hosted.
  - `c11aefd` review round 1 fixes, `f7100dc` the worker's cache, `782216a` review round 2 fixes, `192f285` two map
    tests wait for what they assert.
  - Size of the code commits: 96 files, +9 559 / −175 against `main`, of which tests are +5 536; the twelve fonts are
    296 KB. The header's estimate was 3 000 lines without the fonts.
  - The checklist lines stay unticked: each asks for ru / uz / en, light / dark and a GL and a non-GL profile, several
    for Telegram on staging.
- **Reviews** (each finding checked by a refuting agent):
  - Round 1 (behaviour, security, conformance; 11 findings, 5 refuted), fixed in `c11aefd`: a `draw=1` layer opened
    again at the same address was never closed (now once per opening); no spinner while `maplibre-gl` loaded; the
    Tashkent stand-in wrote fit memory and caused a city jump before the city view was known (`cityKnown`); DEV-013
    left a Back after a replace under the card (KI-59); the worker had no CSP of its own (SEC-1); the lasso step of
    `shell.spec.ts`. `f7100dc`: the worker keeps Next.js's revalidated cache, because a one-year header also landed on
    the 404 of a missing version.
  - Round 2 (the fixes, cross-module flows; 3 findings), fixed in `782216a`: the map bar under a listing showed the
    default search (KI-43's map part); the demo marker did not come back with the map; DEV-013's lasso over an open
    card left a Back that did nothing.
- **Checks** (from `frontend/` unless marked):
  - **Slice (`bca55ab`):** a production build and a throwaway Playwright probe against `next start` (started with the
    mkcert CA and `CSP_TILE_HOSTS`): the worker and `maplibre-gl-shared.mjs` load from `/maplibre/6.11.2/`, the map
    fires `load` and `idle`, six OSM tiles requested with `referer: http://localhost:3001/`, and
    `getContext("webgl2", { failIfMajorPerformanceCaveat: true })` is non-null under SwiftShader.
  - **Waves 1 and 2:** each builder ran its own test files, ESLint and the app typecheck; the orchestrator's gate:
    app typecheck exit 0, `tests/map`, `tests/shell`, `tests/deeplinks`, `tests/telegram` 47 files / 639 tests, ESLint
    clean (on `aa60ff3`). A build plus a probe of `/ru/map` showed four stacks of eleven, the spread and the card.
  - **Mutation checks** (reported by the builders, not re-run by the orchestrator): every new test of the fixes fails
    against the broken version (the builders' reports list each break: the draw close per address, the spinner, the
    stand-in's fit memory and jump, the card layer's step-over and lasso pop, the worker policy, the matcher, the
    unknown-city prefetch, the bar's screen state, the re-reported source).
  - **`c11aefd`:** `make ci-frontend` clean — app 168 files / 2600 + 1 todo, `@homi/search` 238 + 1 todo,
    `@homi/testing` 95, `@homi/ui` 121, `@homi/i18n` 112, `@homi/api-client` 14, `@homi/utils` 2.
  - **`782216a`** (the final code): `make ci-frontend` clean — app 168 files / 2608 + 1 todo, the packages as above.
  - **End to end**, each of the 19 files alone against a local `next start` of the `782216a` build, with a pause
    between files (KI-32): map 17, csp 3, shell 16, data 5, gates 8, foundation 19, back 11, feed 19, filters 20,
    listing-open 16, listing-contact 14, listing-actions 14, photo-viewer 6, launch 5, city 6, session 7,
    boot-failure 6, crash 4, smoke 2 — 198 passed. In the batch two map tests failed under machine load (load average
    up to 36): the first map's stacks after the default 5 s, and the locate zoom read before the flight ended
    (13.9999); `192f285` makes them wait for what they assert, and the whole `map.spec.ts` then passed alone, 17 of
    17. An earlier batch on
    the `c11aefd` build, while a second machine load was running, left several sign-ins at `booting` in csp, shell,
    data, gates, back and launch; all passed in the final batch.
  - No backend change, so no `composer ci:check`.
- **Open for the reviewer:**
  - The uz texts of `map.empty`, `map.loading`, `map.unavailable` (the spec's wording, U+02BC in «Eʼlonlar»).
  - The palette: background, land, labels, halo and the mask come from the tokens; water, green, roads, buildings,
    boundaries and the "me" blue are designed (DEC-46), not compared with legacy screenshots — the vector basemap
    cannot be seen before a file is hosted.
  - The prefetch view without a saved fit is the city centre at `zoom − 1` and its data zoom `fitZoom − 1`, so two
    below the city's zoom, as written in `KV-FE-062`.
  - The fit takes the 3–97 % box, so in the default stub search one listing is outside the first view.
  - KI-59 (`history.ts` matches a `popstate` by address; worked around in the card layer) and KI-60 (a spread-pin tap
    during the card's snap).
  - Not automated: real GPU rendering, pinch, the native permission sheet, the vector basemap and palette likeness,
    a cluster at maximum zoom (no stub listings are that close), the theme and language restyle on a live map, a
    forced GL failure in a browser, the DEV-013 branch (unit tests only), hiding a listing from the card, the mask and
    the camera rules beyond "the stacks are on screen".
- **Needs from the production track** (the field above): `CSP_TILE_HOSTS=https://tile.openstreetmap.org` in the app's
  environment of staging and production before this deploys, or the map shows pins on an empty background; later the
  PMTiles file with `Range`, CORS and `ETag` exposed, and its origin added to `CSP_TILE_HOSTS`; the nginx cache rule for
  `/map-fonts/`; `/maplibre/<version>/` keeps going to the app (served as `application/javascript` by Next.js, checked
  locally); the build through `pnpm -r build` as `homi-deploy` does (its `prebuild` writes `public/maplibre/<version>/`,
  checked in the local `make ci-frontend` log), never a bare `next build`. Then the regular deploy and the checks inside
  Telegram on staging (iOS, Android, Desktop, Web: the map or the unavailable state).
