# KV-BE-033 — API-007 `GET /api/map`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-MAP-001, F-MAP-002 |
| Dependencies | KV-BE-023, KV-BE-020 (and the `legacy-reads` limiter of KV-BE-010; PostGIS per KV-DB-005 for the lasso) |

## Goal

`GET /api/map` returns every matching listing with coordinates as a map point in one response, with a plain-text price
label that cannot carry markup, a map tone, the negotiable flag and the USD price used to order stacks.

## Legacy reference

- API-007 (`08` §2): `$KVADRO_ROOT/docs/api.md:110`, `:558-585`.
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:119`, `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapPoints.js:15-22`
  (no rejection handler), `$KVADRO_ROOT/demo/app/src/features/map/leaflet/MapView.jsx:154`; label inserted as HTML in
  `$KVADRO_ROOT/demo/app/src/features/map/leaflet/icons.js:13` and `$KVADRO_ROOT/demo/app/src/features/map/gl/markerElements.js:40`;
  `ApiError` filtered from `app_error` `$KVADRO_ROOT/demo/app/src/lib/errors.js:118`.
- Mocks: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:86`, `:130`.
- Rules: BR-API-041, BR-API-061, BR-API-154, BR-DATA-029; LB-API-008, LB-APP-020; SEC-001; Q-API-015.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` and `.claude/skills/laravel-database-optimization/` (select only the needed
   columns; no model hydration for thousands of points).
2. `ListingSearchService::mapPoints(SearchFilters, User): MapResult` over `query()` (KV-BE-023) with
   `location IS NOT NULL`, selecting `number`, `ST_Y(location::geometry)`, `ST_X(location::geometry)`, `price_usd_cents`,
   `price_basis`, `listing_market.median_delta` and the market tone; returns a lightweight array.
3. `php artisan make:class Services/Display/MapLabelFormatter --no-interaction`: builds `label` only from the USD (or the
   user's currency) amount, digits, the locale's group separator and the fixed currency/unit tokens of the price format
   (`$`, `сум`, `k`, `млн`…) — never from listing text; afterwards a guard strips `<`, `>`, `&`, `"`, `'` and asserts a
   whitelist regex; no HTML entities.
4. `php artisan make:enum Enums/Pricing/MapTone --no-interaction`: `Good`, `High`, `Check`, `Suspicious`; mapping from
   the listing tone (`good` → `good`, dearer → `high`, `check`, `suspicious`; `same`/`mixed`/`no_repair`/unknown →
   `null`) — mapping spec-tested (Q-API-021).
5. `priced` = `false` when the price is negotiable/absent (no `price_usd_cents`), else `true`; `usd` = whole USD or
   `null`; `total` = number of matching listings including those without coordinates (Q-API-015 spec: no cap, so
   `total ≥ points.length`).
6. `php artisan make:controller Legacy/MapController --invokable --no-interaction`; `GET api/map` with `auth:tma`,
   `legacy.access`, `throttle:legacy-reads`; `LegacyFilterRequest`.
7. Performance: measure Tashkent rent with default filters on the coverage dataset scaled to ~18.6 k active listings
   (KV-QA-020); response must fit the 15 s client timeout with margin; consider a 30 s Redis cache keyed like
   KV-BE-032 if p95 is high.

## Files

- `backend/app/Services/Listings/ListingSearchService.php` (`mapPoints()`)
- `backend/app/Services/Display/MapLabelFormatter.php`, `backend/app/Enums/Pricing/MapTone.php` (new)
- `backend/app/Http/Controllers/Legacy/MapController.php` (new); `backend/routes/legacy.php`
- `backend/tests/Feature/LegacyApi/Api007MapTest.php`, `backend/tests/Unit/Display/MapLabelFormatterTest.php` (new)

## API contract

`GET /api/map?<FilterQuery>` (no viewport, zoom or paging) → `200 {"points": [{"id": number, "lat": number, "lon": number,
"label": string, "tone": "good"|"high"|"check"|"suspicious"|null, "priced": boolean, "usd": number|null}], "total":
number}`. `id` is the listing `number` (JSON integer, the same id as in `/api/feed`); `lat`/`lon` are mandatory numbers;
`label` is plain text without `<` or `&`. Errors are never shown by the client (an error leaves an empty map); the
surface answers `401`, `403 <reason>`, `422 {"detail":"invalid_<field>"}`, `429` in the `{detail}` dialect.
`Cache-Control: private, no-store`.

## Business rules

- Kept: BR-API-041 (all points in one response, plain-text label, tone set, `priced`, `usd`), BR-API-061 (map tones),
  BR-API-154 (`usd` is USD regardless of the user's currency), BR-DATA-029 (labels without markup).
- Defect fixes `APPROVED`: LB-API-008 (labels from numbers only, no entities), LB-APP-020 (server side of the same fix).

## Acceptance criteria

- Every point has numeric `lat`/`lon`, an integer `id` present in `/api/feed` for the same query, and `total ≥
  points.length`.
- A listing whose text, district, landmark and price text contain `<img src=x onerror=…>` and `x" onmouseover="…` yields
  a label made only of digits, separators and the fixed currency/unit tokens (SEC-REQ-018), and an allow-listed tone.
- Listings without coordinates are absent from `points` but counted in `total`; the polygon filter is respected.

## Tests

`backend/tests/Feature/LegacyApi/Api007MapTest.php`:

- `points_have_numeric_coordinates_and_integer_ids` (`assertLegacyShape('MapResponse')`).
- `ids_match_feed_ids_for_same_filters` (`15` §3.7 #1, `set` mode).
- `label_never_contains_markup` (injection fixture of `15` §5.5 / `16` §5.5); `tone_is_allowlisted_or_null`.
- `listings_without_coordinates_absent_but_counted`; `negotiable_price_has_priced_false_and_null_usd`.
- `usd_is_usd_for_uzs_user`; `label_uses_user_currency_and_locale_grouping` (KV-QA-006 fixture).
- `pgsql` group: `polygon_filter_respected`; `large_city_answers_within_budget` (Performance, not in the default run).
- Auth/access dataset; `deal_foo_is_422`.
- Unit `MapLabelFormatterTest`: dataset of amounts × currencies × locales → expected labels; regex whitelist.

## Edge cases

- Several listings at identical coordinates (stacks): all returned, ordered by `usd` (`null` last as the client treats
  missing `usd` as Infinity).
- Polygon covering no listing → `{"points": [], "total": 0}`.
- Coordinates outside Uzbekistan from bad data are excluded (they are `null` after normalisation, `14` §4.1).

## Security

- SEC-REQ-018 (safe labels and tones — the main point of this task), SEC-REQ-017 (filters), SEC-REQ-006,
  SEC-REQ-027, SEC-REQ-033.
- Coordinates are the listing's (block/landmark precision), never a user's location (BR-API-131).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4) for F-MAP-001 and F-MAP-002, the label
security test listed under SEC-REQ-018 in the security suite (KV-QA-016), docs and the feature rows in 09 updated, PR
reviewed by the other developer.
