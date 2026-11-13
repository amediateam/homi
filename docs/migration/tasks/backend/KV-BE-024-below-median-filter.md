# KV-BE-024 — `below_median` predicate and market availability rule

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-FILTER-007 |
| Dependencies | KV-BE-023, KV-BE-016, KV-DB-011; decision DEV-052 (`PROPOSED`); questions Q-API-011, Q-API-021 |

## Goal

«Не дороже рынка» (`below_median=true`) selects the same listings in feed, count, flow, map and later radar matching,
from one predicate over the per-listing market comparison, and one service answers where a market comparison exists
(the `meta.cities[].median` flag, the `deal` sort and — once DEV-052 is approved — the filter itself).

## Legacy reference

- `below_median=true` keeps listings priced below the market comparison; threshold unknown (BR-API-038, `UNVERIFIED`;
  Q-API-011; `$KVADRO_ROOT/docs/api.md:157`; mock `$KVADRO_ROOT/demo/app/tools/parity/mocks-filters.mjs:57`).
- Contradiction C-08 resolution (`07` §3): three legacy metrics keep distinct names — card badge ≥ 10 % below, **filter
  = not above the usual price + 10 %**, landing bargains ≥ 20 % below.
- A city with `median: false` gets no market filter or `deal` sort (BR-API-064; `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:19-25`;
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:295`); Mini App offers it only for non-daily apartment-only searches
  (BR-APP-005, BR-APP-017); the bot for any object type on `rent_long` and `sale` in Tashkent and the region
  (BR-BOT-032) — contradiction C-07 → DEV-052 `PROPOSED`.
- `median_delta` is a fraction (`-0.12` = 12 % cheaper) (`08` §1.8); comparison data from `listing_market`
  (ENT-031, `06` §4.2), computed hourly in M6 (BR-API-057…060).

## Implementation

1. Read `07` §2.5 and §3 (C-07, C-08), `.ai/agents/postgis-geo-engineer.md` (join and index review).
2. `php artisan make:class --no-interaction Services/Pricing/MarketAvailability` — `forCity(CityEntry): bool` (city
   flag from the KV-DB-006 seed, later "medians exist" from M6), `forSearch(SearchFilters): bool` (legacy Mini App rule
   by default; the DEV-052 rule when `config('filters.market_availability_rule') === 'unified'`).
3. Implement the `below_median` predicate hook of `ListingSearchService` (KV-BE-023): inner join `listing_market`,
   `median_delta IS NOT NULL AND median_delta <= :threshold`, `threshold` from `config('filters.below_median_max_delta')`
   = `0.10` (C-08; spec-tested until Q-API-011 is answered).
4. With the DEV-052 flag on, the normaliser (KV-BE-016) calls `forSearch()` and drops `below_median` where no comparison
   exists (stored bot radars are reported at migration, KV-DB-018); with the flag off the predicate is applied as sent.
5. Expose `MarketAvailability` to KV-BE-029 (`cities[].median`) and KV-BE-031 (`sort=deal` validity).
6. Tests in the `pgsql` group with seeded `listing_market` rows.

## Files

- `backend/app/Services/Pricing/MarketAvailability.php`
- `backend/app/Services/Listings/Search/Predicates.php` (`belowMedian` implemented)
- `backend/config/filters.php` (`below_median_max_delta`, `market_availability_rule`)
- `backend/tests/Feature/Pgsql/Search/BelowMedianTest.php`, `backend/tests/Unit/Pricing/MarketAvailabilityTest.php`

## API contract

Query flag `below_median=true` on `GET /api/feed|feed/count|feed/flow|map` (`08` §1.7); absent = not applied. No new
response field; `cities[].median: boolean` in `GET /api/meta` is fed by `MarketAvailability::forCity()`. Internal:

```php
MarketAvailability::forCity(CityEntry $city): bool
MarketAvailability::forSearch(SearchFilters $filters): bool
```

## Business rules

- Kept: BR-API-026 (flag only as `=true`), BR-API-038 (meaning), BR-API-064 (cities without medians), BR-API-061
  (tones untouched by the filter).
- C-08 resolution adopted (no behaviour change): filter threshold `median_delta ≤ +0.10`; badge and landing metrics are
  not this predicate.
- DEV-052 (`PROPOSED`): one availability rule; behind `market_availability_rule`; its tests `->todo('DEV-052 PROPOSED')`.

## Acceptance criteria

- With seeded comparisons `-0.30`, `0.00`, `+0.10`, `+0.11`, `null`, the flag selects the first three only.
- The same filters give the same ids through `query()` and `count()`; KV-BE-031/033 reuse the hook unchanged.
- `forCity()` is `false` for a city seeded with `median: false`, and `GET /api/meta` emits that value (asserted in
  KV-BE-029).
- With the DEV-052 flag off, a request with `below_median=true` on a daily-rent search is still applied (legacy
  behaviour preserved); with it on, the flag is dropped (`todo`).

## Tests

- `Pgsql/Search/BelowMedianTest`: the dataset above; combined with `types` and `polygon`; listing without a comparison
  row excluded; threshold override via config.
- `MarketAvailabilityTest`: Mini App rule dataset (deal × types × city flag); DEV-052 unified rule as
  `todo('DEV-052 PROPOSED')`.
- Spec label: test names end with `(spec, Q-API-011)` where the threshold is asserted.

## Edge cases

- Comparisons are recomputed hourly (M6): a listing can enter or leave the set between two feed pages — the keyset
  cursor of KV-BE-031 tolerates it (no duplicates, possible gap, recorded).
- Before M6 produces medians, every comparison is `null`: the flag yields an empty set; the legacy client then shows
  its empty state — acceptable on staging, never at S2 (M6 is a prerequisite of S2).
- Sale comparisons are per m² (BR-API-058): `median_delta` already encodes that; the predicate does not re-derive it.

## Security

- The threshold is configuration, not input; the flag is a boolean (SEC-REQ-017).
- Labelling caution (SEC-REQ-045): this filter selects, it never labels a listing; tones stay with M6.

## Definition of done

Tests green (`make ci-backend` and the `pgsql` group), parity gate items ticked (15 §4), docs and the feature row in
09 updated, PR reviewed by the other developer. Pint and PHPStan level 7 clean; the threshold choice and Q-API-011 are
noted in `20-open-questions.md` by its owner (PR note).
