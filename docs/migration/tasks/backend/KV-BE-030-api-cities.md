# KV-BE-030 — API-002 `GET /api/cities`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-FILTER-004, F-ONBOARD-003, F-FILTER-006 |
| Dependencies | KV-BE-015, KV-BE-023, KV-DB-011 (and the `legacy-reads` limiter of KV-BE-010; medians from M6 for `typical`) |

## Goal

`GET /api/cities` returns one `CityStats` entry per city of `meta.cities` with live listing counts per deal, USD price
presets and the typical (median) price per deal, so the city picker and the price section of the legacy Mini App work.

## Legacy reference

- API-002 (`08` §2): `$KVADRO_ROOT/docs/api.md:105`, `:468-487`.
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/meta.js:8`, `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:125` (after
  meta, errors ignored), `$KVADRO_ROOT/demo/app/src/app/App.jsx:166-171` (each filters open), `:254`, `:431`,
  `$KVADRO_ROOT/demo/app/src/features/city/CityPicker.jsx:99-117`,
  `$KVADRO_ROOT/demo/app/src/features/filters/PriceSection.jsx:33-35`; hint text `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:137-139`.
- Mock: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:117`.
- Rules: BR-API-154, BR-API-155; LB-APP-035 → DEV-023; Q-API-016.

## Implementation

1. Read `.claude/skills/laravel-database-optimization/` (aggregate queries, caching).
2. `php artisan make:class Services/Listings/CityStatsService --no-interaction`: one grouped query over active listings
   (`city_id`, `deal`, `rent_period`) reusing the base predicate of `ListingSearchService::query()` without per-user
   exclusions (counts are city-wide, `15` §3.7 #2 compares with default filters); presets from `price_presets`
   (KV-DB-011); `typical` = the city × deal median from `market_medians` when present (Q-API-016 spec), otherwise the
   key is omitted.
3. Cache the whole response for 60 s in Redis (not per user — the body does not depend on the user); flushed by the
   hourly median job of M6.
4. `php artisan make:controller Legacy/CityController --invokable --no-interaction`; `GET api/cities` with `auth:tma`,
   `legacy.access`, `throttle:legacy-reads`.
5. Every city of the gazetteer gets an entry, also with zero listings: `counts` all `0`, `presets` and `typical` as
   empty objects (`{}`, never missing — the client reads them without optional chaining).
6. DEV-023 (daily rent included in the counts that the picker shows) is a client-side label question: the legacy
   `counts` object already has three keys; keep three keys, compute `rent_daily` honestly; mark the client wording part
   `PROPOSED`.

## Files

- `backend/app/Services/Listings/CityStatsService.php` (new)
- `backend/app/Http/Controllers/Legacy/CityController.php` (new); `backend/routes/legacy.php`
- `backend/tests/Feature/LegacyApi/Api002CitiesTest.php` (new)

## API contract

`200` JSON array of `CityStats`: `code: string`, `counts: {rent_long: number, rent_daily: number, sale: number}`
(object and all three keys always present), `presets: Partial<Record<deal, number[]>>` (USD integers; object always
present, possibly `{}`), `typical: Partial<Record<deal, number>>` (USD; object always present). Not read by the client
and not emitted: `name`, `center`. Errors are ignored by the client; the surface still answers `401`, `403 <reason>`,
`429` in the `{detail}` dialect. `Cache-Control: private, no-store` (edge must not cache although the body is shared).

## Business rules

- Kept: BR-API-154 (presets and typical are USD numbers regardless of the user's currency), BR-API-155 (UZS presets are
  computed by the client from these USD values), one entry per `meta.cities` code.
- DEV-023 `PROPOSED` (picker counts include daily rent) — affects only the new client; legacy keeps three keys.
- Q-API-016 spec-tested: `typical` = city median per deal.

## Acceptance criteria

- The array contains exactly the city codes of `meta.cities`, in the same order.
- Each entry has `counts` with three numeric keys, `presets` and `typical` objects (possibly empty).
- `counts[deal]` equals `GET /api/feed/count` for that city with default filters and that deal on the same data
  (`15` §3.7 #2).
- Values are identical for a USD user and a UZS user.

## Tests

`backend/tests/Feature/LegacyApi/Api002CitiesTest.php`:

- `one_entry_per_meta_city_in_order`; `shape_matches_CityStats_model` (`assertLegacyShape`).
- `city_without_listings_has_zero_counts_not_missing_entry`.
- `counts_equal_feed_count_with_default_filters` (coverage dataset, KV-QA-005; `semantic` mode).
- `presets_and_typical_are_usd_independent_of_user_currency`.
- `typical_omitted_when_no_median`; `response_cached_for_60_seconds` (frozen clock).
- Auth/access: `no_auth_401`, dataset of gate states → `403 <reason>`.
- `withdrawn_and_taken_down_listings_not_counted`.

## Edge cases

- Region entry (Tashkent region, `zoom < 11`) counted separately from Tashkent city.
- A city added to the gazetteer without presets → `presets: {}`.
- Listings with `rent_period` unknown (migrated stubs) are not counted under any rent key.

## Security

- SEC-REQ-006 (gate), SEC-REQ-027 (`legacy-reads`), SEC-REQ-033 (`no-store`). No personal data in the response.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for F-FILTER-004, docs and the feature rows in 09
updated, PR reviewed by the other developer.
