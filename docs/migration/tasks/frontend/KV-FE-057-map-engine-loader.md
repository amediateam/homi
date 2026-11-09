# KV-FE-057 — Map engine selection and loader

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval: `maplibre-gl`, `pmtiles` — KV-FE-005) |
| Owner | Frontend (track: development); [PT] steps marked |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-MAP-001, F-MEDIA-002 |
| Dependencies | KV-FE-005 (dependency approval), KV-FE-027 (lite mode), KV-FE-028 (`kv-map-v2`); backend KV-BE-029 (`meta.tiles`); infrastructure KV-INF-009 (local tiles serving), KV-INF-021 (PMTiles on `cdn.*` with `Range` and CORS) **[PT]**; decisions: FD-3 of `12` §9.1 (Leaflet or GL only), Q-APP-015, Q-APP-018, Q-APP-022, Q-API-053 |

## Goal

The map of the search tab (SCR-011) loads lazily with the same engine choice as legacy — MapLibre GL by default,
Leaflet for lite mode, missing WebGL2 or an explicit override — builds its basemap from `meta.tiles` (PMTiles, a tile
template, or the OSM raster fallback) in the light or dark palette with localised labels, and never stays blank: a GL
failure falls back once per session (LB-APP-019), a vector-tile failure falls back to raster (LB-APP-008), and the
warm-up runs on intent, not during render (LB-APP-018).

## Legacy reference

- SCR-011 (`03` §2, "Engine", "Basemap", "Differences between engines"); `03` §1.8 (engine choice), §1.9 (lazy chunks),
  §1.7 (lite forces Leaflet).
- `$KVADRO_ROOT/demo/app/src/features/map/engine.js:1-115` (`kv-map-v2` `:7`, `kvosm://` protocol `:18-28`,
  `loadMaplibre` `:39-51`, `registerPmtiles` `:54-60`, `detectWebGL` `:63-72`, `getEngineOverride` `:74-87`,
  `getMapEngine` `:92-97`, `warmMaplibre` / `preloadMapView` `:100-115`); `MapScreen.jsx:10-55` (Suspense, `onFail`);
  `gl/useMapInstance.js:41-209` (init options, WebGL error → fallback, style sync on `data-scheme`/`class`/`lang`);
  `gl/style.js:19-25,495-524,562-592` (`MAX_ZOOM = 17`, `toGlZoom`, `isPmtiles`, OSM raster style, `buildMapStyle`);
  `palette.js:4-33`; `gl/fonts.js:1-65` (12 Noto Sans woff2 glyph files); `attribution.js`, `gl/GlAttribution.jsx`.
- Vendored module `/assets/maplibre-gl-6.11.2/maplibre-gl.mjs` (`$KVADRO_ROOT/demo/app/vite.config.js:18-40`).
- Contract: RES-003 (vector tiles, `Range` + CORS), RES-004 (OSM raster), `meta.tiles` (API-001); TMA-012 (`?map=`,
  `?mapdebug`).
- Defects: LB-APP-018, LB-APP-019, LB-APP-008 (tile part); open items Q-APP-002 (engine badge, dropped), Q-APP-003
  (label halo).
- Visual baselines (KV-QA-019): `gl-base` → `SCR-011-*` (GL), `map-view-leaflet` → `SCR-011-*` (Leaflet).

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` and
   `01-app/02-guides/package-bundling.md` (dynamic `import()` in a Client Component; the map code must stay out of the
   first-feed bundle, `10` §5.12 budget).
2. Dependencies — **PROPOSED — needs approval (dependency change)** via KV-FE-005: `maplibre-gl` `6.11.2` (the version
   legacy vendors) and `pmtiles` `^4.5.0` (inferred; pin the exact version at approval). No vendored copy in the repo.
3. `frontend/app/lib/map/engine.ts`:
   - `getMapEngine(): 'gl' | 'leaflet'` — `?map=gl|leaflet` persists to `kv-map-v2`, `?map=auto` clears it (support
     use per Q-APP-022); saved `leaflet` → Leaflet; saved `gl` → GL if WebGL2 exists; otherwise GL needs a WebGL2
     context with `failIfMajorPerformanceCaveat: true` (released at once) **and** no lite mode (KV-FE-027).
   - `loadMaplibre()` once (retry allowed after a failure) and `addProtocol('kvosm', …)` that fetches OSM raster tiles
     with `referrerPolicy: 'strict-origin-when-cross-origin'` (the page itself is `no-referrer`).
   - `registerPmtiles(maplibre)` once (`Protocol({metadata: false})`, `pmtiles://`).
   - **LB-APP-019 fix:** a session flag `glFailed`; after any GL failure `getMapEngine()` returns `leaflet` until reload,
     and the failure is reported once through KV-FE-034 (`app_error`, message `map_gl_failed`).
   - **LB-APP-018 fix:** `warmMap()` (load MapLibre, `pmtiles`, the view chunk) is called from an effect or idle
     callback on intent — the list-view idle timer of KV-FE-062 or a touch on «Карта» — never during render.
4. `frontend/app/app/(miniapp)/features/map/MapScreen.tsx`: `React.lazy` / dynamic import of the GL view
   (KV-FE-058) or the Leaflet view (KV-FE-059); a chunk-load failure of the GL view loads the Leaflet view; runtime
   `onFail` switches the current mount; Suspense fallback = centred spinner. If FD-3 decides "GL only", the Leaflet
   branch is replaced by the GL view with raster tiles and `pixelRatio: 1`, and devices without WebGL2 get the map
   error state of KV-FE-058 — record that as a DEV candidate before shipping.
5. Basemap from `meta.tiles` (`frontend/app/lib/map/style.ts`): `undefined` (meta not loaded) → background colour only;
   `null` → OSM raster (`kvosm://tile.openstreetmap.org/{z}/{x}/{y}.png`); a `.pmtiles` URL → `pmtiles://…` vector
   source; a `{z}/{x}/{y}` template → vector source. **LB-APP-008 fix (tiles):** a rejected PMTiles registration or a
   vector source error rebuilds the style with the OSM raster source instead of leaving the map blank.
6. Style: light/dark palettes (`palette.js` values, `03` §3.6 theme via `html[data-scheme]`), lite mode (simpler
   layers, `pixelRatio` 1, else `min(devicePixelRatio, 2)`), label language from the UI locale (`ru` / `uz` / `en`
   name fields), glyphs from the 12 bundled Noto Sans woff2 files (latin, latin-ext, cyrillic, cyrillic-ext × 400 /
   500 / 600; OFL assets, copied as files). Re-apply the style when `data-scheme`, the lite class or `lang` changes
   (MutationObserver, diff when the style is loaded).
7. Map options: `maxZoom` 17 (GL scale = Leaflet zoom − 1), no attribution control (own component), `dragRotate`,
   `pitchWithRotate`, `touchPitch`, `keyboard` off, rotation disabled for touch, `renderWorldCopies` false,
   `validateStyle` false; default centre Tashkent `[41.3111, 69.2797]` at zoom 12 until the city centre is known.
8. Attribution component: «© OpenStreetMap» (`https://www.openstreetmap.org/copyright`) plus «· Protomaps»
   (`https://protomaps.com`) with vector tiles; links open externally (KV-FE-029).
9. `?mapdebug` (exposes the map object) only in non-production builds — debug switch, not product behaviour.
10. **[PT]** PMTiles host: `cdn.*` must answer `Range` requests with CORS for the Mini App origin (KV-INF-021); local
    serving via KV-INF-009. CSP additions (`connect-src` tile hosts and `tile.openstreetmap.org`, `worker-src blob:`,
    `img-src blob: data:`) go to KV-FE-033.

## States and texts

| State | Shown when | Texts |
| ----- | ---------- | ----- |
| chunk loading | engine module pending | centred spinner (no text) |
| basemap pending | `meta.tiles === undefined` | background colour only |
| raster fallback | `tiles = null` or vector failure | OSM raster tiles; attribution «© OpenStreetMap» |
| vector | PMTiles or template | vector basemap; attribution «© OpenStreetMap · Protomaps» |
| GL failed | WebGL error, constructor throw, chunk failure | Leaflet view (or the GL-only alternative of FD-3) |
| error | no engine can start | map error state of KV-FE-058 |

No i18n keys in this task; attribution strings are not translated in legacy.

## Interaction

- None of its own; gestures belong to the views (KV-FE-058, KV-FE-059). The engine never changes mid-session except to
  fall back.

## Telegram integration

TMA-012 (`?map=gl|leaflet|auto`, `?mapdebug`), TMA-041 (Android performance class feeds lite mode via KV-FE-027).

## Storage and analytics

- Storage: `kv-map-v2` (`gl` / `leaflet`, not mirrored to DeviceStorage).
- Analytics: no events in legacy; the one-time `app_error` for a GL failure is new (LB-APP-019 fix). The engine and lite
  share needed for FD-3 is read from PostHog by KV-FE-001 (Q-APP-018).

## Files

- `frontend/app/lib/map/{engine,style,palette,fonts,attribution}.ts` (new)
- `frontend/app/app/(miniapp)/features/map/{MapScreen,MapAttribution}.tsx` (new)
- `frontend/app/public/map-fonts/*.woff2` (12 glyph files)
- `frontend/app/package.json`, `frontend/pnpm-lock.yaml` (after approval)
- `frontend/app/tests/map/{engine,style}.test.ts`

## API contract

- `meta.tiles: string | null` (API-001); RES-003 PMTiles / template with `Range` and CORS; RES-004 OSM raster tiles
  (`tile.openstreetmap.org`, Referer required — hence the `kvosm` protocol).

## Business rules

- Kept: engine choice of `03` §1.8; lite mode forces Leaflet (`03` §1.7); basemap rules of SCR-011.
- Defect fixes `APPROVED` (policy): LB-APP-018, LB-APP-019, LB-APP-008 (tile fallback).
- FD-3 decides whether the Leaflet branch exists (KV-FE-059).

## Acceptance criteria

- With WebGL2 and full graphics the GL view loads; `?map=leaflet` persists Leaflet across launches; `?map=auto` clears
  it; lite mode yields Leaflet.
- A forced WebGL error switches to Leaflet and the next map open in the same session goes straight to Leaflet with one
  `app_error` sent.
- `tiles: null` shows OSM raster; a 404 on the PMTiles file shows OSM raster instead of a blank map.
- Opening the map from the feed loads no MapLibre code before intent (bundle analysis of KV-FE-173).
- Visual: side by side with the `gl-base` and `map-view-leaflet` baselines (`SCR-011`) — basemap colours, labels and
  attribution equal in light and dark.

## Tests

- Unit (`engine.test.ts`): override table (`gl`/`leaflet`/`auto`/none × WebGL × lite), session failure flag, single
  protocol registration, warm-up not triggered by render.
- Unit (`style.test.ts`): source per `tiles` value, palette per scheme, label field per locale, raster rebuild on vector
  failure.
- E2E (with KV-FE-058): `gl-base` against contract mocks with a fixture PMTiles file.

## Edge cases

- PMTiles host without CORS (Q-API-053): vector source errors → raster fallback, reported once.
- `meta.tiles` changes after a settings reload: the style rebuilds without remounting the map.
- Telegram Desktop with software rendering: `failIfMajorPerformanceCaveat` rejects it → Leaflet.

## Security

- SEC-REQ-031 / SEC-REQ-033: tile hosts and OSM in `connect-src`/`img-src`, `worker-src blob:` (KV-FE-033); no other
  origins.
- SEC-REQ-032: the tile host's CORS allows only the Mini App origins.
- SEC-REQ-049: the two new packages pass the approval and audit rule.

## Definition of done

Approval recorded; `make ci-frontend` green; unit tests green (or added when KV-FE-010 lands); side-by-side review of
the SCR-011 baselines recorded in the PR; parity gate G4 for F-MAP-001 (with KV-FE-058…KV-FE-062) and F-MEDIA-002
ticked (`15` §4); the `09` rows updated; PR reviewed by the other developer.
