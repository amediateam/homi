# KV-BE-016 — `SearchFilters` value object, normaliser and canonical hash

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-FILTER-001, F-FILTER-006 |
| Dependencies | KV-BE-014, KV-BE-015; decisions DEV-004, DEV-005, DEV-017, DEV-025 (all `PROPOSED`); Q-API-007, Q-API-013, Q-API-014 |

## Goal

The 25-key filter model of the legacy contract exists once, as an immutable value object with one normaliser and
validator used by the legacy surface, `/api/v1` and the bot (SEC-REQ-017): any input is either rejected with a field
code or normalised to a consistent filter; output for legacy routes always carries all 25 keys; a canonical hash
identifies "the same search" for radar de-duplication (M4) and the count/flow cache (KV-BE-032).

## Legacy reference

- The 25 keys, their types and defaults (`types: ['apartment']`, `owner: 'any'`, arrays `[]`, booleans `false`,
  scalars `null`): `08` §1.7; `$KVADRO_ROOT/demo/app/src/features/filters/model.js:12-39`; `$KVADRO_ROOT/docs/api.md:145-172`.
- Per-deal validity and exclusions: BR-API-028, BR-API-029 (`$KVADRO_ROOT/docs/api.md:177-182`), rooms semantics
  BR-API-030 (`model.js:145-166`), area 1–10 000 (BR-API-032), `posted_days ∈ {1, 3, 7}` (BR-API-033), polygon 3–40
  vertices, 5 decimals, not closed, convex hull for self-intersections (BR-API-034;
  `$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:6`, `:108-149`, `:235`).
- Prices are integer USD on the legacy wire (BR-API-031, BR-API-153; `$KVADRO_ROOT/demo/app/src/lib/money.js:91-101`).
- `zone` → `zones` contract change of 2026-11-06 (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:46-54`; LB-API-028,
  Q-API-013).
- Returned filter objects must have all 25 keys, arrays non-null (BR-API-039, BR-DATA-009; LB-API-005 — a missing key
  is sent back as the string `undefined` or crashes `forEach`, `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:13-19`).
- Duplicate detection ignores `posted_days` (BR-API-092, BR-APP-012); radars should not store it (DEV-005, LB-API-026).
- Combination rules enforced only by the UI (LB-API-025 → DEV-004; contradictions C-01, C-12, C-24 in `07` §3).

## Implementation

1. Read `.claude/skills/php-best-practices/`, `.claude/skills/laravel-testing/`, `16` SEC-REQ-017 and `07` §2.2.
2. `php artisan make:class --no-interaction Domain/Radar/SearchFilters` — final readonly, typed properties for the 25
   keys (internal representation: `LegacyDeal`, `list<PropertyType>`, district/zone/renovation/appliance **codes**
   (canonical), `?UsdAmount` bounds plus `priceCurrency` (`USD` for every legacy input, DEV-006 later),
   `?list<array{float, float}>` polygon); named constructor `fromNormalised()` only (no public constructor use outside
   the normaliser).
3. `php artisan make:class --no-interaction Services/Search/SearchFiltersNormaliser` with `normalise(array $raw,
   NormaliseContext $ctx): SearchFilters`; `NormaliseContext` (make:class) carries the surface (`legacy`, `v1`, `bot`)
   and `forRadar` (strips `posted_days` when DEV-005 is enabled). Steps, in order:
   1. drop unknown keys; map legacy `zone` (string|null) into `zones` (LB-API-028), canonical order `center`, `near_center`;
   2. enums: `deal` (required), `owner` (default `any`), `tenant`, `market`, `posted_days` → `FilterRejected('deal')`
      etc. on an unknown value (legacy literal validation, BR-API-018);
   3. codes through `Gazetteer::resolveMany()` (city, districts within the city, zones within the city, renovation per
      deal, appliances) — unknown → `FilterRejected('districts')` …;
   4. ranges: rooms 0–10 (UI 1–4/1–3; `4` = 4+), price 1 … 2^53−1 USD, area 1–10 000, polygon 3–40 vertices with
      valid lat/lon (`NaN`, out of range → reject), rounded to 5 decimals, opened if closed;
   5. combinations (DEV-004/DEV-017 behind `config('filters.strict_combinations')`, default `false` until approved):
      `types` invalid for the deal are removed (empty → `['apartment']`), irrelevant keys stripped (`tenant`/`pets`/
      `pets_only` outside the deal rule, `area_*`/`market` outside sale, `appliances` on sale), `pets` + `pets_only` →
      keep `pets_only`, several geography modes → keep `polygon`, else `zones`, else `districts` (`14` §4.2);
      with the flag on, impossible combinations raise `FilterRejected` instead;
   6. `min > max` for rooms, price, area: swap (default) or reject per `config('filters.inverted_range')` (DEV-025
      `PROPOSED`).
4. `toLegacyArray(): array` — exactly the 25 keys in the `model.js` order, codes as `Gazetteer::legacyCode()`, prices
   as `UsdAmount::wholeDollars()`, `polygon` as `[[lat, lon], …]` or `null`.
5. `canonicalHash(): string` — SHA-256 (raw 32 bytes, hex accessor) of the canonical JSON of `toLegacyArray()` without
   `posted_days`: keys sorted, arrays sorted, `null` for absent; documented so the migration (KV-DB-018) computes the
   same value.
6. `toQueryParts(): array` for KV-BE-023 (structured predicates, ids instead of codes) and `toStructuredColumns()` for
   the radar table of KV-DB-009 (city id, district ids, zones, price bounds + currency, booleans).
7. `config/filters.php` (new, application config — development track) with the two DEV flags and the limits.

## Files

- `backend/app/Domain/Radar/SearchFilters.php`, `backend/app/Domain/Radar/NormaliseContext.php`
- `backend/app/Services/Search/SearchFiltersNormaliser.php`, `backend/app/Services/Search/FilterRejected.php`
- `backend/config/filters.php`
- `backend/tests/Unit/Search/SearchFiltersTest.php`, `backend/tests/Feature/Search/SearchFiltersNormaliserTest.php`,
  `backend/tests/Feature/Search/CanonicalHashTest.php`

## API contract

Internal:

```php
SearchFiltersNormaliser::normalise(array $raw, NormaliseContext $ctx): SearchFilters  // throws FilterRejected(field)
SearchFilters::toLegacyArray(): array{city: string, deal: string, types: list<string>, districts: list<string>, rooms_min: ?int, rooms_max: ?int, price_min: ?int, price_max: ?int, zones: list<string>, near_metro: bool, below_median: bool, owner: string, tenant: ?string, pets: bool, pets_only: bool, furnished: ?bool, renovation: list<string>, floor_not_first: bool, floor_not_last: bool, area_min: ?int, area_max: ?int, market: ?string, appliances: list<string>, posted_days: ?int, polygon: ?list<array{0: float, 1: float}>}
SearchFilters::canonicalHash(): string   // hex SHA-256, posted_days excluded
FilterRejected::$field                   // the legacy layer renders 422 {"detail": "invalid_<field>"}
```

## Business rules

- Kept: BR-API-025…BR-API-036, BR-API-039, BR-DATA-009, BR-DATA-011 (as legacy defaults), BR-API-092 (hash ignores
  `posted_days`), BR-API-153 (USD on the legacy wire).
- Defect fixes (`APPROVED`): LB-API-005 (always 25 keys), LB-API-006 (outputs only known codes per deal), LB-API-028
  (`zone` accepted and mapped).
- `PROPOSED`, behind config, tests `->todo()`: DEV-004 (impossible combinations → 422), DEV-005 (radars store
  `posted_days: null`), DEV-017 (tenant for both rents, pets rent_long only), DEV-025 (inverted ranges rejected instead
  of swapped). DEV-006 (bounds in the entered currency) is carried by `priceCurrency` but applied in M4.

## Acceptance criteria

- The Q-API-007 probe set (SEC-REQ-017: `deal=x`, `rooms_min=-1`, `area_min=0`, 2- and 41-vertex polygons, `NaN`
  coordinates, unknown district, `' OR 1=1--`, 10 000-character strings) yields `FilterRejected(<field>)` or a
  normalised value — never an uncaught exception.
- `toLegacyArray()` has exactly 25 keys for every accepted input, arrays never `null`, key order of `model.js`.
- `normalise(['deal' => 'rent_long', 'zone' => 'center'])` gives `zones: ['center']` and no `zone` key.
- Two inputs differing only in `posted_days`, key order or array order have the same `canonicalHash()`.
- With both DEV flags off, every request the legacy Mini App can build (`08` §1.7) is accepted unchanged in meaning.

## Tests

- Unit `SearchFiltersTest`: defaults, `toLegacyArray` key list and order, polygon rounding and opening, `UsdAmount`
  bounds → whole dollars.
- Feature `SearchFiltersNormaliserTest` (gazetteer seeded): dataset per BR-API-028 type × deal; per BR-API-029 key ×
  deal (stripped); geography exclusivity; `pets` + `pets_only`; inverted ranges swapped (and
  `todo('DEV-025 PROPOSED')` for rejection); `strict_combinations` on → rejections (`todo('DEV-004 PROPOSED')`);
  `tenant` on `rent_daily` (`todo('DEV-017 PROPOSED')`); unknown city/district/zone/renovation per deal; the probe set
  above.
- Feature `CanonicalHashTest`: hash equality dataset; a fixture hash computed by an independent canonicalisation in
  the test (sorted `json_encode`) equals the service's (so the migration can reproduce it).
- Enum safety: every emitted code ⊆ KV-QA-007 keys.

## Edge cases

- `rooms_max: null` with `rooms_min` set = "or more"; `rooms_min = rooms_max = 4` = "4+".
- `furnished: false` is a real filter (tri-state), unlike the other booleans.
- A polygon with a repeated closing vertex (closed) is opened, not counted as an extra vertex.
- `city` absent on input → `tashkent` (BR-API-027, client fallback) only on the legacy surface; v1 requires it.
- Region "city" (Tashkent region) accepts districts of the region seed only.

## Security

- SEC-REQ-017 is implemented here: closed enums, numeric ranges, polygon validity, ids < 2^53, unknown keys dropped,
  irrelevant keys stripped; codes reach SQL only as resolved ids.
- No user text is stored in filters except codes; free-text queries (M5) are parsed elsewhere and never stored
  (SEC-REQ-036).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; the canonicalisation rule of step 5 is copied into
`14` §4.2's radar row by the KV-DB-018 owner (note in the PR); the two DEV flags are listed in the PR description.
