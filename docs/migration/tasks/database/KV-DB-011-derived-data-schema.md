# KV-DB-011 — Derived-data schema

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-005, F-PIPELINE-007, F-LISTING-004, F-FILTER-006, F-FILTER-007, F-FILTER-004, F-SEO-002, F-SEO-006, F-SEO-008 |
| Dependencies | KV-DB-008 |

## Goal

The tables for computed and reference numbers exist: `exchange_rates`, `listing_market` (1:1 market comparison cache),
`market_medians`, `price_index_points` (with frozen published rows), `salary_references`, `seo_slices` and
`price_presets` (seeded with the legacy USD presets), so the read path (M2) can serialize `median_*`, presets and
`usd_uzs` before the pipeline (M6) computes them.

## Legacy reference

- ENT-031 (market comparison, `06:756-784`), ENT-032 (median aggregate, `06:785-805`), ENT-033 (price index,
  `06:806-828`), ENT-041 (exchange rate, `06:911-919`), ENT-051 (presets, `06:994-1000`), ENT-055 (SEO slice,
  `06:1039-1047`), ENT-056 (salary reference, `06:1048-1053`); mapping `06` §4.2 lines 1244-1246, 1253, 1255,
  1259-1260.
- `ListingDetails.median*` fields and `ListingPreview.median_delta`, `median_tone` (`08` §1.8); map `tone`, `usd`
  (API-007); `meta.price_presets`, `meta.usd_uzs` (API-001); `CityStats.presets`, `typical` (API-002).
- BR-API-057 … BR-API-064, BR-API-139, BR-API-140, BR-API-154, BR-DATA-023 (frozen index), BR-DATA-026,
  BR-DATA-038; LB-DATA-008 (place medians keyed by `place_id`); CF-005 (KV-DB-004 money ADR).
- Open: Q-API-011, Q-API-021 (thresholds), Q-API-054 (CBU rounding), Q-DATA-031 (presets computed or configured),
  Q-DATA-032 (index month boundary), Q-SEO-013.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 3, 5, 6) and the KV-DB-004 money ADR.
2. `php artisan make:model ExchangeRate -mfs --no-interaction`: `date`, `base char(3)`, `quote char(3)`,
   `rate numeric(18,6)`, `source` (`cbu`, `legacy`, `manual`), `fetched_at`; PK `(date, base, quote)` (composite;
   the model uses a surrogate `id` bigint for the `listings.exchange_rate_id` FK, so add `id` identity + unique
   `(date, base, quote)`). Add the FK `listings.exchange_rate_id → exchange_rates.id` (`NOT VALID` + `VALIDATE`).
3. `php artisan make:model ListingMarket -mfs --no-interaction`: `listing_id` PK/FK cascade, `median` boolean,
   `median_value`, `median_own`, `median_n`, `median_metric` (`month`, `m2`, `person`, `day`), `median_scope`
   (`near`, `district`, `city`), `median_rooms`, `median_near_class` (`jk`, `house`, null), `median_radius_km`,
   `median_district`, `median_place_value`, `median_note`, `median_updated` (timestamptz), `median_delta
   numeric(6,4)`, `median_tone` (`good`, `check`, `suspicious`, `same`, `mixed`, `no_repair`, `dearer`),
   `map_tone` (`good`, `high`, `check`, `suspicious`, null), `price_per_m2`, `computed_at`; USD amounts as integer
   dollars or cents per the ADR (store cents, serialize USD numbers). Index `(median_delta)` partial
   `WHERE median_delta IS NOT NULL` for `sort=deal` and `below_median` (M2 confirms with EXPLAIN).
4. `php artisan make:model MarketMedian -mfs --no-interaction`: `scope_kind` (`district`, `city`, `place`, `quarter`,
   `metro`), `scope_id`, `deal`, `rent_period`, `rooms`, `metric`, `currency` (`USD`), `median`, `n`, `total`,
   `window_start`, `computed_at`; unique `(scope_kind, scope_id, deal, rent_period, rooms, metric, window_start)`.
5. `php artisan make:model PriceIndexPoint -mfs --no-interaction`: `series` (`rent_index`, `sale_prices`),
   `period` (`month`, `week`), `start date`, `district_id` nullable, `rooms`, `median_usd`, `median_usd_m2`,
   `listings`, `published_at`, `frozen` boolean; unique `(series, period, start, district_id, rooms)`; pgsql trigger
   (or model guard + test on SQLite) refusing `UPDATE`/`DELETE` of rows with `frozen = true` (BR-DATA-023).
6. `php artisan make:model SalaryReference -mfs --no-interaction`: `region`, `period_label jsonb`, `period_end date`,
   `avg_salary_uzs bigint`, `source_url`, `published_at`.
7. `php artisan make:model SeoSlice -mfs --no-interaction`: `lang`-independent slice key (`section`, `city_id`,
   `district_id`, `quarter_id`, `metro_station_id`, `rooms`, `owners_only`, `deal`), `listings_count`,
   `new_7d`, `median_usd`, `indexable` boolean, `data_snapshot_id`, `computed_at` (one snapshot for all three
   languages, LB-SEO-003).
8. `php artisan make:model PricePreset -mfs --no-interaction`: `city_id` nullable (null = deal-level
   `meta.price_presets`), `deal`, `rent_period`, `rooms` nullable, `amounts_usd int[]` (pgsql; json fallback),
   `source` (`legacy_spec`, `computed`); seeder with the legacy USD presets per deal from the parity mocks /
   `$KVADRO_ROOT/docs/api.md:450` marked `legacy_spec` (values are shape examples until R1, `15` §1.3 O4).
9. Factories for every model (`ListingMarket` states `good()`, `noMedian()`, `mixed()`), Pint, PHPStan, tests.

## Files

- `backend/database/migrations/<ts>_create_exchange_rates_table.php`, `…_create_listing_market_table.php`,
  `…_create_market_medians_table.php`, `…_create_price_index_points_table.php`,
  `…_create_salary_references_table.php`, `…_create_seo_slices_table.php`, `…_create_price_presets_table.php`,
  `…_add_exchange_rate_fk_to_listings.php` (new)
- `backend/app/Models/{ExchangeRate,ListingMarket,MarketMedian,PriceIndexPoint,SalaryReference,SeoSlice,PricePreset}.php`
- `backend/database/factories/*`, `backend/database/seeders/PricePresetSeeder.php`
- `backend/tests/Feature/Database/DerivedDataSchemaTest.php`, `backend/tests/Feature/Pgsql/DerivedDataSchemaPgsqlTest.php`

## API contract

n/a for endpoints — the columns must produce `MetaResponse.usd_uzs: number`, `price_presets: Record<deal, number[]>`
(USD), `CityStats.presets`/`typical` (USD), every `ListingDetails.median_*` key (present even when null,
LB-API-009), `ListingPreview.median_delta` (fraction, `-0.12` = 12 % cheaper) and `median_tone`, map `points[].tone`,
`priced`, `usd` (`08` §1.8, API-007), the CSV columns of RES-018 (`price_index_points`).

## Business rules

Keep BR-API-061 (tone sets), BR-API-062, BR-API-154 and BR-DATA-038 (USD numbers), BR-DATA-023 (published index never
changes), BR-DATA-026. Apply LB-DATA-008 (place medians by `place_id`) — defect fix `APPROVED`. DEV-052 (`PROPOSED`,
availability rule) and the `below_median` threshold (`07` C-08, Q-API-011) are applied by KV-BE-024, not stored.

## Acceptance criteria

- One `listing_market` row per listing at most; deleting a listing removes it.
- A frozen `price_index_points` row cannot be updated or deleted (trigger on pgsql, guard elsewhere).
- `exchange_rates` holds one rate per (date, base, quote); `listings.exchange_rate_id` references it.
- `price_presets` seeds return the legacy USD arrays per deal; seeding twice is idempotent.

## Tests

- `DerivedDataSchemaTest`: `it('keeps one market row per listing')`, `it('refuses to update a frozen index point')`,
  `it('rejects a second rate for the same date and pair')`, `it('seeds deal-level presets in USD')`,
  `it('stores all median fields as nullable')`.
- `DerivedDataSchemaPgsqlTest` (`pgsql`): the frozen-row trigger raises; `amounts_usd` is `int[]`; EXPLAIN of
  `ORDER BY median_delta, number` on 5 000 synthetic rows uses the partial index; FK `exchange_rate_id` validated.

## Edge cases

- Listings without a comparison: no `listing_market` row → the serializer emits every `median_*` key as `null`
  (LB-API-009).
- `median_delta` exactly `0.10` (filter boundary of C-08) — numeric precision kept to 4 decimals.
- Rates on non-business days: stored for the publication date the CBU uses; lookups take the latest rate ≤ date.

## Security

No personal data; derived numbers only (SEC-REQ-041). CSV-bound text columns (`period_label`) are neutralised at export
(SEC-REQ-021, M7).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist; data-impact note (new FK on `listings`)
in the PR.
