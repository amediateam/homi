# KV-BE-023 — Listing search predicates and per-user exclusions

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-FILTER-001, F-MAP-002, F-HIDE-001, F-HIDE-002, F-FEED-001 |
| Dependencies | KV-BE-016, KV-DB-008, KV-DB-010; KV-DB-005 (polygon) |

## Goal

One query object turns a normalised `SearchFilters` and the requesting user into the set of matching active listings,
applying every one of the 25 keys with the legacy meaning, the PostGIS lasso, and the user's hidden listings and
blocked authors server-side. Feed, count, flow, map and (in M4) radar matching all start from this query, so the same
filters always select the same set.

## Legacy reference

- The four search endpoints take the same query and must interpret it identically (`02` §7;
  `$KVADRO_ROOT/docs/api.md:1096`; `$KVADRO_ROOT/docs/about.md:191`); consistency cases `15` §3.7 #1–#3.
- Key semantics: BR-API-026 (booleans), BR-API-028/029 (deal rules), BR-API-030 (rooms, `4` = 4+), BR-API-031/153
  (USD bounds), BR-API-032 (area), BR-API-033 (`posted_days`), BR-API-034 (polygon), BR-API-035 (`owner`), BR-API-036
  (pets), BR-API-037 (`near_metro` ≈ 1 km, zones `center`/`near_center`), BR-DATA-035 (listings without a recognisable
  place never match zone or district filters).
- Exclusions: Q-API-036 (does legacy exclude hidden/blocked server-side?) → LB-API-041 defect fix: server-side
  exclusion in feed, count, flow, map and matching; taken-down listings and opted-out channels never reappear
  (BR-DATA-022, BR-API-043, BR-API-068).
- Data model: `06` §4.2 `listings` (location `geography(Point,4326)`, partial feed index), `hidden_listings`,
  `blocked_authors`, `listing_authors`; PostGIS decision CF-014 (`10` §3.14); lasso polygon 3–40 vertices
  (`$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:6`, `:149`).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 11–17, EXPLAIN review), `.claude/skills/laravel-database-optimization/`
   and the KV-DB-008/KV-DB-010 migrations; agree index usage with the postgis agent before merging.
2. `php artisan make:class --no-interaction Services/Listings/ListingSearchService` with `query(SearchFilters $f,
   ?User $user): Builder` and `count(SearchFilters $f, ?User $user): int`; `page()` is added by KV-BE-031 and
   `mapPoints()` by KV-BE-033 on the same class.
3. Base scope: `status = 'active'` (taken-down, withdrawn, merged and purged listings are never in search; opt-outs are
   applied by M6 through status), `city_id`, `(deal, rent_period)` from `LegacyDeal`.
4. One private predicate method per key, each with a dataset test:
   - `types` → `property_type IN`; `districts` → `district_id IN`; `zones` → the zone membership of the listing
     (materialised zone column if KV-DB-008 provides it, else `ST_Covers` against `city_zones` boundaries — decided
     with EXPLAIN); listings without district/zone never match those filters (BR-DATA-035);
   - `rooms_min`/`rooms_max` (`4` = 4+, `rooms_max = null` = "or more"), `area_min`/`area_max` on `area_total`,
     `price_min`/`price_max` on `price_usd_cents` (CF-005), listings without a price excluded when a bound is set;
   - `near_metro` → `metro_km <= 1.0`; `furnished` tri-state; `renovation` → `renovation_type_id IN`; `appliances` →
     `appliances @> ARRAY[…]` (all selected); `market`; `floor_not_first` → `floor > 1`; `floor_not_last` →
     `floor < floors_total` (unknown floors excluded when the flag is set — spec-tested);
   - `owner`: `no_agents` excludes `owner_status = 'agent'` and realtor-marked authors; `owners` keeps
     `owner_status = 'owner'`; `tenant`: listings with no restriction or the same restriction; `pets` excludes
     "forbidden", `pets_only` keeps "allowed";
   - `posted_days` → `first_seen_at >= now() − N × 24 h` (rolling window; Tashkent-day alternative recorded as
     spec, `15` §3.10 #6);
   - `polygon` → `ST_Covers(ST_GeogFromText(?), location)` with the WKT built from validated floats (ring closed,
     `lon lat` order) and bound as a parameter; an invalid ring is replaced by `ST_ConvexHull` as the client does
     (`14` §4.2 radar polygon rule).
   - `below_median` is a hook implemented by KV-BE-024 (no-op until then).
5. Per-user exclusions when `$user` is given: `NOT EXISTS` on `hidden_listings (user_id, listing_id)` and on
   `blocked_authors (user_id, author_id = listings.author_id)` (LB-API-041).
6. Tests on PostgreSQL + PostGIS in the `pgsql` group (KV-QA-001), seeded through factories and the KV-QA-005 coverage
   dataset; the SQLite suite only checks predicate composition with a fake builder.
7. Record `EXPLAIN (ANALYZE, BUFFERS)` of the default feed, a polygon query and a count on 20 k synthetic listings in
   the PR description.

## Files

- `backend/app/Services/Listings/ListingSearchService.php`
- `backend/app/Services/Listings/Search/Predicates.php` (per-key predicate methods)
- `backend/tests/Feature/Pgsql/Search/ListingSearchPredicatesTest.php`
- `backend/tests/Feature/Pgsql/Search/ListingSearchExclusionsTest.php`
- `backend/tests/Feature/Search/ListingSearchCompositionTest.php` (SQLite)

## API contract

No route of its own. Contract for the callers (KV-BE-030, KV-BE-031, KV-BE-032, KV-BE-033, M4 matching):

```php
ListingSearchService::query(SearchFilters $filters, ?User $user): Builder   // active listings, exclusions applied when $user given
ListingSearchService::count(SearchFilters $filters, ?User $user): int
```

`$user = null` is used only by public statistics (city counts, M7), never by a personal legacy route.

## Business rules

- Kept: BR-API-025…BR-API-037, BR-API-153, BR-DATA-022, BR-DATA-035.
- Defect fix (`APPROVED`): LB-API-041 (server-side exclusion of hidden listings and blocked authors everywhere).
- `PROPOSED`: DEV-034 (user-wide hide rules shared by bot and Mini App) — the predicate takes the user's rule set from
  one place so M4 can add radar rules; DEV-052 belongs to KV-BE-024.

## Acceptance criteria

- For each of the 25 keys, a dataset case on the coverage data selects exactly the expected listing ids (spec-tested
  where `08` marks the server logic `DOCUMENTED_ONLY`).
- `types=apartment` + `types=house` select both types; boolean flags absent select everything.
- A listing hidden by user A or authored by an author A blocked is absent from A's results and present in B's.
- Withdrawn, merged, taken-down and purged listings never appear.
- Polygons with 3 and 40 vertices work; a self-intersecting ring is handled by the convex hull; points on the edge are
  included (`ST_Covers`).
- `count()` equals the number of ids `query()` returns for the same filters and user.
- The default feed query and a count use index scans in the recorded `EXPLAIN` (no sequential scan on `listings`).

## Tests

- `Pgsql/Search/ListingSearchPredicatesTest` (`->group('pgsql')`): dataset of 25+ cases (one per key plus combinations
  from `08` API-004 "Tests"); polygon 3/40 vertices, edge point, self-intersection; `posted_days` 1/3/7 with a frozen
  clock; rooms 4+; price bounds on cents.
- `Pgsql/Search/ListingSearchExclusionsTest`: hidden and blocked exclusions for A vs B; taken-down never shown;
  `count == ids` consistency.
- `Search/ListingSearchCompositionTest` (SQLite): each key adds exactly one predicate; no predicate for absent keys.
- Consistency hand-off: the `15` §3.7 #1 case is asserted later by KV-BE-031/KV-BE-033 on top of this service.

## Edge cases

- `city = tashkent_region` selects region listings only; "whole city" semantics for regions belong to radar matching
  (BR-DATA-035, M4).
- Listings with coordinates but no district still match polygon searches.
- Price-per-person or per-m² listings: price bounds apply to `price_usd_cents` of the stated basis (recorded as spec;
  LB-DATA-019).
- 20 k active listings and live count every 250 ms: the count path must not join tables it does not need.

## Security

- SEC-REQ-017: only normalised values reach SQL, always as bindings (the polygon WKT is built from floats and bound).
- SEC-REQ-014: exclusions are evaluated for the requesting user only; no user id comes from input.
- No PII is selected by the query object (phones are read only by the details serializer, KV-BE-034).

## Definition of done

Tests green (`make ci-backend` and the `pgsql` group of KV-QA-001), parity gate items ticked (15 §4), docs and the
feature row in 09 updated, PR reviewed by the other developer. Pint and PHPStan level 7 clean; `EXPLAIN` output and
the postgis agent's index review attached to the PR.
