# KV-BE-107 — Inverse matching predicate: the radars one listing matches

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-DELIVERY-001, F-HIDE-001, F-HIDE-002 |
| Dependencies | KV-BE-023 (forward predicate, the reference semantics), KV-BE-016 (`SearchFilters`), KV-DB-009 (structured radar columns, GiST/GIN indexes), KV-DB-005 (PostGIS), KV-QA-001 (PostgreSQL + PostGIS tests), KV-QA-005 (coverage dataset); DEV-005, DEV-006 `PROPOSED`; Q-API-014, Q-API-027 |

## Goal

Given one newly published listing, one indexed query returns exactly the active radars whose filters the listing
satisfies — the same answer, radar by radar, that the feed search (KV-BE-023) gives in the forward direction — fast
enough to run once per new listing (~1 050 a day, bursts) against every active radar.

## Legacy reference

- Filter semantics: `08` §1.7 (`FilterQuery`, 25 keys), BR-API-026…BR-API-037 as implemented by KV-BE-023.
- `$KVADRO_ROOT/docs/about.md:198-207` (radar delivers new matching listings); `$KVADRO_ROOT/docs/telegram-bot.md:775-777`
  (digest and quiet hours apply after matching).
- Audit IDs: ENT-008, BR-API-081, BR-BOT-033 (listings without a usual price are not delivered by «Не дороже рынка»
  radars), BR-BOT-101, BR-DATA-035 (no recognisable place → never matches zone or district radars; «Весь <город>»
  matches every listing of the city), BR-DATA-008 (USD bounds); LB-API-026, LB-API-041; GAP-010.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 6, 8, 12, 17) and KV-BE-023 (every predicate and its constants:
   `near_metro` → `metro_km ≤ 1.0`, `below_median` → KV-BE-024).
2. `php artisan make:class Services/Radar/RadarCandidateQuery --no-interaction`: `forListing(Listing): Builder` over
   `radars` `WHERE active` with, for the listing's values bound as parameters:
   - `city_id = :city` — for regions, the region's cities per the KV-BE-023 city rule (BR-DATA-035);
   - `deal = :deal AND rent_period IS NOT DISTINCT FROM :period`; `:type = ANY(types)`;
   - rooms: `(rooms_min IS NULL OR :rooms >= rooms_min) AND (rooms_max IS NULL OR :rooms <= rooms_max OR (rooms_max = 4
     AND :rooms >= 4))` — `4` = «4+»; a listing without rooms matches only radars without rooms bounds (KV-BE-023 rule);
   - price: `price_currency = 'USD'` → compare `price_usd_cents` with `price_min/price_max` (whole dollars × 100);
     DEV-006 radars with `UZS` bounds → compare with the listing's UZS value at today's rate (`RateService`, KV-BE-019);
     listings without a price match only radars without price bounds;
   - place: `cardinality(district_ids) = 0 OR :district = ANY(district_ids)`; `cardinality(zones) = 0 OR :zone =
     ANY(zones)`; `area IS NULL OR ST_Covers(area, :point::geography)`; a listing without district/zone/point never
     matches a radar that constrains that dimension (BR-DATA-035);
   - booleans and enums exactly as the forward predicate: `near_metro`, `below_median` (`listing_market.median_delta ≤
     +0.10`; no median → no match, BR-BOT-033), `owner`, `tenant`, `pets`/`pets_only`, `furnished` tri-state,
     `renovation`, `floor_not_first`/`floor_not_last`, `area_min`/`area_max` (sale), `market`, `appliances` (every
     selected appliance present);
   - `posted_days`: applied against the listing's `posted_at` only when stored (Q-API-014 open; DEV-005 `PROPOSED`
     stores `null`, which disables it).
3. One semantics, two directions: each predicate lives in a small `FilterClause` class (`app/Services/Listings/Criteria/*`)
   with `forward(Builder $listings, SearchFilters)` (used by KV-BE-023 — refactor its body into these classes in this
   task, behaviour unchanged) and `inverse(Builder $radars, ListingFacts)`. `ListingFacts` (`app/Domain/Radar`) is the
   listing's matching projection (city, deal, period, type, rooms, price cents, district, zone, point, metro_km, owner
   flag, tenant, pets, furnished, renovation, floors, area, market, appliances, median delta, posted_at).
4. Per-user exclusions (hidden listings, blocked authors, hide rules, delivered set) are **not** in this query; KV-BE-108
   applies them per candidate user in bulk.
5. Indexes: confirm with `EXPLAIN (ANALYZE, BUFFERS)` on 10 000 synthetic active radars that the plan uses the partial
   `(active, mode)` / `(city_id, deal)` indexes, GIN on `district_ids` and `types`, GiST on `area`; add a missing index
   in a separate migration (`CONCURRENTLY`, comment with the served query) if needed. Target p95 ≤ 50 ms (KV-QA-020).
6. `RadarMatcher::radarsFor(Listing): LazyCollection<Radar>` (chunked by id, 1 000) on top of the query.

## Files

- `backend/app/Services/Radar/RadarCandidateQuery.php`, `RadarMatcher.php` (new)
- `backend/app/Services/Listings/Criteria/*.php` (new, one per clause; `ListingSearchService` refactored to use them)
- `backend/app/Domain/Radar/ListingFacts.php` (new)
- `backend/tests/Feature/Pgsql/Radar/RadarCandidateQueryTest.php`, `RadarMatchEquivalenceTest.php` (new)
- `backend/database/migrations/*_add_radar_matching_indexes.php` (only if EXPLAIN shows a gap)

## API contract

n/a.

## Business rules

- Kept: BR-API-081 / BR-BOT-101 (matching against active radars), BR-DATA-035, BR-BOT-033, BR-DATA-008 (USD bounds on
  legacy radars).
- Defect fix `APPROVED`: LB-API-041 (exclusions are server-side — applied in KV-BE-108 with the same rules as the feed).
- `PROPOSED`: DEV-005 (`posted_days` null in radars), DEV-006 (UZS bounds compared at today's rate) → `->todo()`.
- Unknown: whether legacy applied `posted_days` (Q-API-014), triggers beyond new listings (Q-API-027 — KV-BE-108).

## Acceptance criteria

- For the KV-QA-005 coverage dataset and 2 000 generated radars (all filter keys, polygons, «4+», tri-states, regions),
  `radar ∈ radarsFor(listing)` ⇔ `listing ∈ ListingSearchService::query(radar.filters)` for every pair, ignoring
  per-user exclusions.
- The KV-BE-023 feature tests stay green after the clause refactor (behaviour unchanged).
- p95 of `forListing` ≤ 50 ms on 10 000 active radars locally, plan recorded in the PR.

## Tests

- `Pgsql/Radar/RadarMatchEquivalenceTest`: `forward_and_inverse_agree_on_coverage_dataset` (property test, seeded),
  `failure_prints_the_disagreeing_clause`.
- `Pgsql/Radar/RadarCandidateQueryTest`: datasets per clause — `rooms_four_plus`, `rooms_unknown_listing`,
  `price_without_listing_price`, `usd_bounds_compare_cents`, `district_radar_skips_listing_without_place`,
  `whole_city_radar_matches_listing_without_place`, `region_radar_matches_region_cities`, `polygon_covers_point`,
  `polygon_boundary_point_included` (`ST_Covers`), `near_metro_threshold_1_km`, `below_median_requires_median`,
  `below_median_tolerance_plus_ten_percent`, `tenant_and_pets_rent_long_only`, `furnished_tri_state`,
  `appliances_all_required`, `paused_radar_never_returned`, `posted_days_applied_only_when_stored`,
  `->todo('DEV-005 PROPOSED')`, `->todo('DEV-006 PROPOSED: UZS bounds at today rate')`, `explain_uses_indexes`
  (asserts no Seq Scan on `radars` above 1 000 rows).

## Edge cases

- Listing exactly on a polygon edge → included (`ST_Covers`, same as the feed).
- Listing with price in UZS only and no rate for the day → the latest rate (KV-BE-019 staleness alert applies).
- Daily-rent listing vs `rent_long` radar → never (deal + period).
- Radar with `types` empty (corrupt migrated row) → treated as the legacy default `['apartment']` by the normaliser, and
  logged.

## Security

- SEC-REQ-017 (only normalised filters are stored, so the inverse query never sees free-form values); all values bound,
  no string-built SQL.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), EXPLAIN plans pasted in the PR, parity gate items ticked (`15` §4) for
the matching part of F-DELIVERY-001, docs and the feature row in `09` updated, PR reviewed by the other developer.
