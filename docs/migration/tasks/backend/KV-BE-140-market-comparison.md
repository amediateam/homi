# KV-BE-140 — Near medians and the per-listing market comparison (`listing_market`, tones)

| Field | Value |
| ----- | ----- |
| Status | TODO (tone thresholds `PROPOSED` until Q-API-021; PostGIS per DEC-09) |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-PIPELINE-005, F-LISTING-004 |
| Dependencies | KV-BE-139 (district/city medians), KV-BE-132 (anchor points, house class), KV-BE-024 (`below_median` reads `median_delta`); Q-API-011, Q-API-021, Q-SEO-018 |

## Goal

Every active listing has an up-to-date market comparison in `listing_market`: the «near» median of the 12 nearest
comparable listings (sale: 15 nearest, per m²) within 5 km of the place named in the listing, falling back to the
district when fewer than 8 are found, the listing's own value, `median_delta`, the verdict tone and the map tone — plus
place-level near medians for the landing and SEO pages — computed with one function that the Mini App, the bot and the
SEO pages all read.

## Legacy reference

- BR-API-058 / BR-SEO-013 (near: 12 nearest with the same rooms; sale 15 nearest per m²; measured from the place named
  in the listing; within 5 km; ≤ 3 per channel; caption with radius reached and house class «по 12 ближайшим в обычных
  домах, до ~0,7 км»; fewer than 8 → district), BR-API-059 / BR-SEO-014 (under 10 % → «на уровне обычной цены»
  without percentage; nearest cheaper but district dearer → no "below market" claim, both numbers shown — `mixed`),
  BR-API-060 (3+ rooms with unusual area per m² among 3+ rooms; 1–2 rooms by room count; very small flats never
  «подозрительно дёшево»), BR-API-061 (tones `good`, `check`, `suspicious`, `same`, `mixed`, `no_repair`, anything
  else = dearer; map tones `good`, `high`, `check`, `suspicious`), BR-API-062 (block shown only with `median`,
  `median_value` and `median_delta !== null`; own value `median_own` else `price_per_m2` else `price_usd`), BR-BOT-059
  (bot `📊` line), BR-APP-027 / BR-APP-028 (client wording and scale ±40 %), BR-SEO-033 / Q-SEO-018 (SEO badge = same
  calculation), LB-DATA-008 (place medians keyed by place id), Q-API-011 (`below_median` threshold), Q-API-021 (tone
  thresholds, `jk`/`house` classes, `median_reason`).
- `08` §1.8 `ListingDetails.median_*`; KV-DB-011 `listing_market` columns; `$KVADRO_ROOT/docs/seo-pages.md:277-287`.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` rules 11, 12 (KNN with `<->` on geometry, `ST_DWithin` on geography),
   KV-DB-011, KV-BE-139. Tests first (`pgsql` group).
2. `php artisan make:class Services/Pricing/MarketComparison --no-interaction`:
   `forListing(Listing, MedianRun): ListingMarketValues`.
   - **Own value**: rent long → `price_usd` per month (`median_metric = month`); sale → `price_usd / area_total`
     (`m2`); rent with rooms ≥ 3 and unusual area (outside `config('pricing.unusual_area_ratio')` = ×/÷ 1.35 of the
     district's median area for that bucket, `PROPOSED`) → per m² among 3+ room listings (BR-API-060). Per-person,
     daily, down-payment and instalment prices → no comparison (`median = false`, `median_reason = basis`).
   - **Near set** (listing has a point): same city, `deal`/`rent_period`, same rooms bucket (sale: any rooms, per m²),
     same house class when the anchor place has one (`jk` vs `house`, `median_near_class`; `PROPOSED`, Q-API-021),
     eligible as in KV-BE-139 (window, exclusions, outliers), excluding the listing itself and its merge partners;
     `ST_DWithin(location, anchor, 5000)` then `ORDER BY location::geometry <-> anchor::geometry`, ≤ 3 per channel
     (window function over channel), take 12 (sale 15). With ≥ 8 → `median_scope = near`, `median_value` = median of
     the set, `median_n` = its size, `median_radius_km` = distance of the farthest used neighbour rounded to 0.1.
   - **Fallback**: fewer than 8 near → district group of KV-BE-139 (`median_scope = district`, `median_district` =
     district name key), then city group for cities without districts (`median_scope = city`); no group with a median
     → `median = false`.
   - **Delta**: `median_delta = round((own − reference) / reference, 4)` (fraction; −0.12 = 12 % cheaper).
   - **Tone** (`config('pricing.tones')`, all `PROPOSED` until Q-API-021, spec-tested):
     `|delta| < 0.10` → `same`; `mixed` when the near comparison says cheaper by ≥ 10 % but the listing is at or
     above the district median, or the reverse (BR-API-059 — both numbers kept: `median_value` = primary scope,
     `median_place_value` = the other scope); renovation code in `config('pricing.no_repair_codes')` and
     `delta ≤ −0.10` → `no_repair`; `delta ≤ −0.45` → `suspicious` unless `area_total < 30` m²
     (`small_flat_m2`, BR-API-060 → then `check`); `−0.45 < delta ≤ −0.30` → `check`; `−0.30 < delta ≤ −0.10` →
     `good`; `delta ≥ 0.10` → `dearer` (internal; the legacy serializer emits the value the old client reads as
     "pricier", KV-BE-034).
   - **Map tone**: `good` → `good`; `check` → `check`; `suspicious` → `suspicious`; `delta ≥ 0.10` → `high`; else
     `null`.
   - `median_rooms`, `median_note` (caption data: «по N из M», radius, class), `median_updated` = run time,
     `price_per_m2` when area is known.
3. Place medians (LB-DATA-008): for every `places`, `quarters` and `metro_stations` row with listings, the near median
   around its point per rooms bucket → `market_medians` with `scope_kind` `place`/`quarter`/`metro`, `scope_id`, radius
   in `median_radius_km` (extra column if KV-DB-011 lacks it) — inputs for KV-BE-155 and KV-BE-158.
4. Jobs: `php artisan make:job Pricing/RecomputeListingMarket --no-interaction` per listing (on `ListingPublished`,
   `ListingPriceChanged`, `ListingGeoChanged`, `ListingsMerged`) and a chunked full pass on `MediansRecomputed`
   (`default` queue, chunks of 500, `withoutOverlapping`); writes `listing_market` with `INSERT … ON CONFLICT DO UPDATE …
   WHERE … IS DISTINCT FROM` (postgis rule 5).
5. Kill switch: Pennant `market-tones` (`php artisan pennant:feature --no-interaction MarketTones`) — off → tones and
   map tones `null`, values kept (SEC-REQ-045 detector rule).
6. Consistency hook for M7: `MarketComparison::badge(ListingMarketValues): ?SeoBadge` (BR-SEO-014 «на N% дешевле
   рынка» only for `good`) so SEO cards and the Mini App never disagree (BR-SEO-033).

## Files

- `backend/app/Services/Pricing/MarketComparison.php`, `backend/app/Domain/Pricing/{ListingMarketValues,ToneThresholds}.php`,
  `backend/app/Jobs/Pricing/{RecomputeListingMarket,RecomputeAllListingMarket,RecomputePlaceMedians}.php`,
  `backend/app/Features/MarketTones.php` (new); `backend/config/pricing.php` (tones)
- migration `add_radius_to_market_medians_table` if needed
- `backend/tests/Feature/Pgsql/Pricing/MarketComparisonTest.php`, `backend/tests/Unit/Pricing/ToneThresholdsTest.php` (new)

## API contract

n/a (internal). Feeds API-004/API-008 `median_delta`, `median_tone`, `median_*` (KV-BE-028, KV-BE-034), API-007 map
`tone` (KV-BE-033), `below_median` and `sort=deal` (KV-BE-024, KV-BE-031).

## Business rules

- BR-API-058…062, BR-SEO-013, BR-SEO-014, BR-SEO-033, BR-BOT-059, LB-DATA-008 fix (`09` §4.3).
- C-08 / Q-API-011: the `below_median` filter threshold stays in KV-BE-024 (`median_delta ≤ +0.10`), independent of
  the tone thresholds here; Q-LND-010 (landing «≥ 20 %» bargains) is applied in KV-BE-155.

## Acceptance criteria

- With 12 comparable neighbours within 5 km: `median_scope = near`, `median_n = 12`, radius = farthest used.
- With 7 near neighbours: scope `district` (or `city`) with that group's median and `n`.
- A neighbour beyond 5 km is never used; a channel never supplies more than 3 near neighbours.
- `delta = −0.0999` → `same`; `−0.10` → `good`; a 25 m² flat at −0.60 → `check`, not `suspicious`.
- Every row with `median = true` has `median_value` and a non-null `median_delta` (so the old client never shows
  `$NaN`, BR-API-062).

## Tests

- `MarketComparisonTest` (`pgsql`, synthetic grid of listings): `near_12_within_5km`, `near_sale_15_per_m2`,
  `seven_near_falls_back_to_district`, `city_without_districts_uses_city`, `beyond_5km_excluded`,
  `channel_cap_three_in_near_set`, `same_house_class_only`, `unusual_area_3plus_rooms_per_m2`, `per_person_no_comparison`,
  `delta_rounding_4_places`, `mixed_when_near_and_district_disagree`, `no_repair_tone`, `small_flat_never_suspicious`,
  `map_tone_mapping`, `kill_switch_nulls_tones_keeps_values`, `place_medians_keyed_by_id`, `upsert_writes_only_changes`,
  `recomputed_after_price_change_event`.
- `ToneThresholdsTest`: boundary dataset at −0.45, −0.30, −0.10, ±0.0999, +0.10.
- Consistency: `seo_badge_equals_listing_tone_for_same_listing` (BR-SEO-033).

## Edge cases

- A listing without a point (district only): no near set → district scope directly; `median_radius_km = null`.
- Ties at the 12th neighbour distance: ordered by distance then `number` (deterministic).
- A listing whose own price is an outlier (excluded from medians, e.g. $30 000/month): still compared — tone `dearer`.
- A full pass during a merge: the merged listing has no row (status `merged` → row deleted).

## Security

- SEC-REQ-045 (price tones label sellers' listings: thresholds in config, inputs reproducible, kill switch, audit via
  stored `median_note`), SEC-REQ-018 (map tone is an enum or `null`).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), EXPLAIN of the near query with the GiST index in the PR, thresholds
listed with Q-API-021 in the PR, `09` rows F-PIPELINE-005 and F-LISTING-004 updated, PR reviewed by the other
developer.
