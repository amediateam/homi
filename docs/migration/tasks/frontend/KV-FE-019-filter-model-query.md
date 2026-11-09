# KV-FE-019 — Filter model and query builder (`@homi/search`)

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-FILTER-001, F-FILTER-003 |
| Dependencies | KV-QA-002 (golden fixtures: `SearchFilters` model, query strings of API-004…API-007); mirrors the server normaliser KV-BE-016 / KV-BE-017; fixes LB-APP-007; DEV-005 `PROPOSED` (radars without `posted_days`) |

## Goal

A new workspace package `@homi/search` owns the 25-key `SearchFilters` model: defaults, one `normalizeFilters()` used
for state, API calls and comparison (LB-APP-007 fix), the stable `filtersKey` that ignores `posted_days`, the
custom-filters and active-count rules, room picking, the polygon serialiser and the query builder that produces the
exact legacy `FilterQuery` strings for `/api/feed`, `/api/feed/count`, `/api/feed/flow` and `/api/map`.

## Legacy reference

- Model: `$KVADRO_ROOT/demo/app/src/features/filters/model.js:1-180` — `defaultFilters(deal = 'rent_long', city =
  'tashkent')` (all 25 keys; `types: ['apartment']`, `owner: 'any'`, lists empty, the rest `null`/`false`);
  `filtersKey` (defaults merged, keys and array values sorted, `undefined` → `null`, city default `tashkent`,
  `posted_days` ignored); `sameFilters`; `isCustomFilters` (against the base deal's defaults); `countActiveFilters`;
  `isApartmentSearch`; `baseDeal` (daily counts as `rent_long`); `pickRooms`; `isRoomPicked`; `NO_ROOMS_TYPES`
  (`room`, `commercial`, `land`).
- Options: `$KVADRO_ROOT/demo/app/src/features/filters/options.js:1-30` (`ZONE_OPTIONS` canonical order `center,
  near_center`; `TYPES_BY_DEAL`; `ROOM_OPTIONS` 1–4; owner, tenant, furnished, market, posted days, pets options).
- Query: `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:10-85` and `08` §1.7 — key order `city`, `deal`, `owner`, repeated
  `types`, `districts`, `renovation`, `appliances`, then `rooms_min`, `rooms_max`, `price_min`, `price_max`,
  `area_min`, `area_max`, `posted_days`, `furnished`, `floor_not_first`, `floor_not_last`, `market`, repeated `zones`,
  `near_metro`, `below_median`, `tenant`, `pets`, `pets_only`, `polygon`; feed adds `limit=20`, `sort` (never `new`),
  `cursor`.
- Polygon: `$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:6-8,115-151,235` — `lat,lon;…`, 5 decimals, 3–40 vertices,
  not closed (BR-APP-061; validation is KV-FE-060).
- Rules: BR-APP-001, BR-APP-007, BR-APP-011, BR-APP-012, BR-APP-013; contract history `zone` → `zones` (`08` §1.7,
  Q-API-013); defect LB-APP-007 (`undefined` booleans after a city change make filters "custom").

## Implementation

1. Create `frontend/packages/search` (`@homi/search`), announce the lockfile change; types `SearchFilters`, `Deal`
   (`rent_long | rent_daily | sale`), `PropertyType`, `Owner`, `Tenant`, `Market`, `Zone`, `Polygon` in `src/types.ts`
   (or re-exported from `@homi/types/legacy` once KV-FE-021 adds the legacy models — one source).
2. `src/defaults.ts`: `defaultFilters(deal, city)` identical to legacy; `baseDeal`, `isApartmentSearch`,
   `NO_ROOMS_TYPES`, option tables.
3. `src/normalize.ts`: `normalizeFilters(input): SearchFilters` — fills missing keys from the defaults of the input's
   deal, coerces booleans (`Boolean(x)` for `near_metro`, `below_median`, `pets`, `pets_only`, `floor_not_*`),
   `furnished` to `true | false | null`, numbers to finite integers or `null`, arrays to arrays (sorted zones in canonical
   order), accepts a legacy `zone` string as `zones: [zone]`, drops unknown keys. Used for every state update
   (LB-APP-007 fix: no `undefined` can reach `filtersKey`).
4. `src/compare.ts`: `filtersKey`, `sameFilters`, `isCustomFilters`, `countActiveFilters` (groups exactly as
   BR-APP-011: daily, non-apartment types, rooms, price, geography, metro, below-median, owner, tenant, pets not for
   sale, furnished, renovation, floor, area, market, appliances, posted days).
5. `src/rooms.ts`: `pickRooms`, `isRoomPicked` (BR-APP-007: second tap on another value makes a range; `4` = "4+",
   `rooms_max: null`; `null` clears).
6. `src/query.ts`: `buildFilterParams(filters)` returning `URLSearchParams` in the legacy key order;
   `feedUrl(filters, cursor, sort)`, `countUrl`, `flowUrl`, `mapUrl`; never emits the string `undefined` (legacy sent it
   for missing keys, `08` §1.7 — a client defect the normaliser removes). `serializePolygon` with 5 decimals.
7. `src/radar.ts`: `toRadarFilters(filters)` — with `dev005RadarPostedDaysNull` on (`frontend/app/lib/deviations.ts`)
   sets `posted_days: null` before radar mutations; off keeps the legacy body.
8. Golden checks: for each query fixture of KV-QA-002 (API-004 … API-007 cases), building the URL from the fixture's
   filters gives the fixture's query string byte for byte (order matters for the prefetch-cache match, `08` §1.6).

## States and texts

n/a — model library. (Summaries and labels are KV-FE-020.)

## Interaction

n/a.

## Telegram integration

n/a.

## Storage and analytics

`kv-city` (read by KV-FE-028) seeds `defaultFilters(deal, savedCity)` at boot (BR-APP-001). Filter hashes for the
follow nudge (`kv-nudge.asked`) use `filtersKey` (KV-FE-080).

## Files

- `frontend/packages/search/{package.json,tsconfig.json}`, `src/{index,types,defaults,normalize,compare,rooms,query,radar}.ts` (new)
- `frontend/pnpm-lock.yaml`
- `frontend/packages/search/tests/*.test.ts` (after KV-FE-010)

## API contract

`FilterQuery` of `08` §1.7 for API-004 `GET /api/feed`, API-005 `GET /api/feed/count`, API-006 `GET /api/feed/flow`,
API-007 `GET /api/map`; `SearchFilters` object (25 keys) for API-019 / API-020 bodies and API-018 responses.

## Business rules

- Kept: BR-APP-001, BR-APP-007, BR-APP-011, BR-APP-012 (posted days ignored in comparison), BR-APP-013.
- LB-APP-007 fix `APPROVED` (policy).
- DEV-005 `PROPOSED` (flag; test `todo('DEV-005 PROPOSED')`); the server normaliser DEV-004 (KV-BE-016) is mirrored,
  not replaced — the server stays authoritative.

## Acceptance criteria

- `defaultFilters()` deep-equals the legacy default object (25 keys).
- `filtersKey` of `{...f, posted_days: 7}` equals `filtersKey(f)`; `{near_metro: undefined}` normalises to `false`
  and is not custom.
- Every KV-QA-002 query fixture round-trips byte for byte; no URL contains `undefined`.
- `countActiveFilters` matches the legacy count on the filter fixtures of `mocks-filters.mjs` scenarios used by
  KV-QA-012.

## Tests

Unit: defaults; normaliser table (missing keys, `undefined`, strings for numbers, legacy `zone`, unknown keys, zones
order); `filtersKey` equality cases; active-count per group; `pickRooms` sequences (1→3 = 1–3; 4→2 = 2–4+; 2→2 = 2);
query builder order and repeated keys; polygon 3 and 40 vertices, rounding to 5 decimals.

## Edge cases

- City codes outside `meta.cities` (stale `kv-city`): kept; the bootstrap replaces them with `meta.city` (BR-APP-010,
  KV-FE-040).
- `types` empty after a bad server radar: normalised to `['apartment']` for display only; the stored radar is not
  rewritten by the client.
- `polygon` with fewer than 3 points: dropped by the normaliser (server would answer `422`).

## Security

Client normalisation is for feedback only; the server normaliser is authoritative (SEC-REQ-017). No personal data in
filters (location never sent, F-PRIVACY-004).

## Definition of done

`make ci-frontend` green; unit and golden tests green (after KV-FE-010); PR reviewed by the other developer.
