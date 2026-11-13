# KV-FE-067 — Listing: location, nearby and the fullscreen spot map

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval: `maplibre-gl`, `pmtiles` — KV-FE-005) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-LISTING-003, F-LISTING-007 |
| Dependencies | KV-FE-063, KV-FE-057, KV-FE-031, KV-FE-029; decisions: DEV-019 `PROPOSED`, FD-3 (Leaflet port), Q-APP-008 |

## Goal

The «Расположение» section shows a lazy, non-interactive mini-map with the approximate circle, the place and centre
distance rows and the «Рядом» list; a tap opens the fullscreen spot map (SCR-021) with «Где я», the distance from the
user, and hand-offs to Yandex and Google Maps. The mini-map mounts exactly once per container (LB-APP-001) and unknown
nearby kinds never crash (LB-APP-016).

## Legacy reference

- Screens: SCR-018 location section, SCR-021 (`03` §2).
- Code: `$KVADRO_ROOT/demo/app/src/features/listing/sections/LocationSection.jsx:20-36`,
  `sections/NearbySection.jsx:5-52` (metro ≤ 1.5 km + server `nearby[]`, `~` when `geo_radius_m ≥ 400`),
  `spot/SpotMap.jsx:19-127` (`useSpotMap`, IntersectionObserver with `rootMargin 300px`, attribution),
  `spot/SpotMapFullscreen.jsx:21-91`, `spot/spotGeometry.js:60-86` (external links and zoom by radius),
  `spot/spotGL.js`, `spot/spotLeaflet.js`; `format.js` `distanceLabel`, `centerDistanceLabel`, `metroLabel`.
- Rules: BR-APP-029 (metro ≤ 1.5 km, name only under 50 m), BR-APP-031 (distance wording), `03` §3.4 (default radius
  500 m, approximate from 400 m).
- Defects and deviations: LB-APP-001 (double init) → `APPROVED` fix; LB-APP-016 (unknown or duplicate kinds) →
  `APPROVED` fix; LB-APP-031 → DEV-019 (one distance formatter); LB-APP-009 (location timeout, fixed in KV-FE-031).
- Contract: API-008 fields `lat`, `lon`, `geo_radius_m`, `metro`, `metro_km`, `center_km`, `nearby[]`; RES-003 / RES-004
  tiles via `meta.tiles`.
- Visual baselines: the section in `listing-open` (`SCR-018-*.png`); SCR-021 has no baseline — compare against
  `SpotMapFullscreen.jsx` and the strings below.

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (map code loads only on demand).
2. `features/listing/location/LocationSection.tsx`: heading `listing.location`; when `lat` and `lon` exist: the
   mini-map + hint `listing.mapApprox`; rows `place` (`district_name · landmark`) and centre distance (`fmt.centerKm`,
   one decimal); the nearby list.
3. `location/SpotMapPreview.tsx`: a button (aria `listing.mapOpen`) that wraps the 2:1 map box and the expand icon;
   mount the map only after the box comes within 300 px of the viewport (IntersectionObserver) and only when
   `meta.tiles !== undefined`. One `useSpotMap(container, spot, tiles, {interactive})` hook owns the container: a
   cancellation flag per effect run and `dispose()` before any re-init (LB-APP-001); engine from KV-FE-057
   (`gl` → MapLibre with the GL-failure session memory; fallback Leaflet only if FD-3 keeps it, else the raster
   OSM style in MapLibre).
4. Circle: centre `lat/lon`, radius `geo_radius_m ?? 500` m; style from the map palette of KV-FE-057 (fill opacity
   0.12, outline per theme). Attribution «© OpenStreetMap» (+ « · Protomaps» when vector tiles are used).
5. `location/NearbySection.tsx`: metro first when `metro` is set and `metro_km ≤ 1.5`, then `nearby[]` in server order;
   icon by kind (`metro`, `park`, `school`), **default pin icon for any other kind**; React key `kind + name + index`
   (LB-APP-016); distances through the formatter of KV-FE-018 with the `~` prefix when `(geo_radius_m ?? 500) ≥ 400`;
   legacy wording `near.here` under 0.1 km, `near.m` rounded to 100 under 0.95 km, `near.km` with one decimal above;
   with the DEV-019 flag of KV-FE-018 on: the single formatter (metres below 1 km rounded to 50/100, km with one
   decimal above) on cards and here alike.
6. `location/SpotMapFullscreen.tsx`: a layer (z 100) registered in the back stack (KV-FE-025); interactive map;
   close button (aria `common.close`); locate button (aria `map.locate`, only when location is available, spinner
   while locating) using KV-FE-031 (timeout ~12 s); on success: success haptic, the blue dot, fit both spot and user,
   and the note `listing.mapFromYou` with `≈ {km}` (one decimal max); errors `map.locateDenied` / `map.locateFail` in the
   note. Bottom card: bold place name, note line (default `listing.mapApprox`), buttons `listing.openYandex` and
   `listing.openGoogle`.
7. External links (open with `openLink`, external browser): Yandex
   `https://yandex.uz/maps/?ll=<lon>,<lat>&z=<zoom>&pt=<lon>,<lat>,pm2rdm` with zoom 17 / 16 / 15 / 13 for radius
   ≤ 250 / ≤ 600 / ≤ 1 500 m / more; Google `https://www.google.com/maps/search/?api=1&query=<lat>,<lon>`; coordinates
   with 6 decimals.
8. The user's position never leaves the device (F-PRIVACY-004): no request carries it.

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| section | `listing.location` «Расположение»; `fmt.centerKm` «{km} км до центра» |
| no coordinates | no mini-map and no hint; place, centre and nearby rows only |
| mini-map loading | the box shows the background colour until the map mounts (no spinner, legacy) |
| mini-map failed | GL failure → fallback engine; both failing → the box keeps the background and the tap still opens the fullscreen map (which retries) |
| hint | `listing.mapApprox` «Место примерное: по кварталу, ориентиру или метро из объявления» |
| nearby | `listing.nearby` «Рядом»; rows with `near.here` «рядом», `near.m` «{m} м», `near.km` «{km} км», `~` prefix when approximate |
| fullscreen, idle | note `listing.mapApprox`; buttons `listing.openYandex` «Яндекс Карты», `listing.openGoogle` «Google Карты» |
| locating (disabled) | locate button shows a spinner and is disabled |
| located | `listing.mapFromYou` «≈ {km} км от вас — место примерное» |
| locate error | `map.locateDenied` «Нет доступа к геопозиции. Разрешить можно в настройках Telegram.» / `map.locateFail` «Не получилось определить, где вы.» |

## Interaction

- Mini-map tap: light haptic, opens the fullscreen layer. The mini-map itself ignores pan and zoom.
- Fullscreen: pan and pinch; × or Telegram Back closes; no swipe gesture (legacy).
- Locate: light haptic on tap, success haptic on a fix.
- External map buttons: light haptic, `openLink` (1.5 s same-URL debounce).
- Responsive: the mini-map keeps a 2:1 ratio within the 608 px column; the fullscreen layer is `inset: 0` with
  safe-area padding for the buttons and the bottom card.

## Telegram integration

TMA-035 (LocationManager / browser geolocation via KV-FE-031), TMA-028 (`openLink`), TMA-022 (Back closes the
fullscreen map), TMA-025 (haptics), SCR-044 (the permission prompt is native).

## Storage and analytics

- Storage: none (`kv-map-v2` is read through the engine choice of KV-FE-057).
- Analytics: none in legacy; no position or distance is ever sent.

## Files

- `frontend/app/app/(miniapp)/features/listing/location/{LocationSection,SpotMapPreview,SpotMapFullscreen,NearbySection}.tsx` (new)
- `frontend/app/app/(miniapp)/features/listing/location/{useSpotMap,spotGeometry}.ts` (new)
- Tests: `frontend/app/tests/listing/{spotGeometry,NearbySection,useSpotMap}.test.ts(x)`, `frontend/app/e2e/spot-map.spec.ts`

## API contract

API-008 fields: `lat`, `lon` (both or neither), `geo_radius_m` (default 500 m client-side), `metro`, `metro_km!`,
`center_km!`, `nearby: {kind, name, km, note?}[]` (legacy promises `park` and `school` only, Q-APP-008), `district_name`,
`landmark`. Tiles: `meta.tiles` (`undefined` before meta, `null` → OSM raster RES-004, a `.pmtiles` URL or template →
RES-003). No request of its own besides tiles.

## Business rules

- Kept: BR-APP-029, BR-APP-031, the `~` rule and the 500 m default (`03` §3.4).
- LB fixes `APPROVED` (policy): LB-APP-001 (single owner of the map container), LB-APP-016 (default icon, stable keys).
- DEV-019 `PROPOSED`: one distance formatter (flag of KV-FE-018; test `todo('DEV-019 PROPOSED')`).

## Acceptance criteria

- Opening and closing the same listing ten times in a row creates and disposes exactly one map instance per mount
  (no «Map container is already initialized»).
- A `nearby` entry with kind `hospital` renders with the default icon; two `school` entries both render.
- Distances: 0.05 km → «рядом», 0.34 → «300 м» (legacy), 1.26 → «1,3 км»; `~` added with `geo_radius_m` 500, not with 300.
- Yandex zoom is 17 / 16 / 15 / 13 for radius 200 / 500 / 1 200 / 3 000 m.
- Denied location shows `map.locateDenied`; a hanging LocationManager resolves to `map.locateFail` within ~12 s.
- Visual: the section matches the `listing-open` baseline (mini-map box, hint, rows, «Рядом» list).

## Tests

- Unit `spotGeometry.test.ts`: zoom thresholds, link formats, 6-decimal rounding.
- Unit `NearbySection.test.tsx`: metro inclusion at 1.5 / 1.51 km; unknown kind; duplicate kinds; approximate flag;
  DEV-019 `todo`.
- Unit `useSpotMap.test.ts` (engine mocked): StrictMode double effect → one live instance; unmount disposes; GL
  rejection → fallback.
- E2E `spot-map.spec.ts` (after KV-FE-010; tiles blocked, engine stub): open fullscreen, Back closes it before the
  listing; locate with a mocked position shows the distance note.

## Edge cases

- `tiles === undefined` (meta not loaded yet): the mini-map waits; it mounts when meta arrives.
- `geo_radius_m` 0 or negative: treat as the 500 m default for the circle and the `~` rule.
- Coordinates outside Uzbekistan (bad data): still rendered; no client correction.
- Telegram Desktop without geolocation: the locate button is hidden (`canRequestLocation()` false).

## Security

- F-PRIVACY-004 / TMA-035: the user's coordinates stay in memory of the layer and are dropped on close.
- SEC-REQ-021: `nearby[].name`, `note`, `district_name`, `landmark` rendered as text.
- SEC-REQ-019: external map links are built from numbers only; hosts fixed (`yandex.uz`, `www.google.com`).

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review recorded in the PR; parity
gate G4 for F-LISTING-003 and F-LISTING-007 ticked (`15` §4); the feature rows in `09` updated; PR reviewed by the other
developer.
