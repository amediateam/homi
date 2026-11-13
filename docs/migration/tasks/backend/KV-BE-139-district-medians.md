# KV-BE-139 — District and city medians for rent and sale

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-005 |
| Dependencies | KV-DB-011 (`market_medians`), KV-BE-134 (publications, price basis); Q-API-021, Q-DATA-031, Q-SEO-018 |

## Goal

Every hour HOMI recomputes the «обычная цена» of each district (or city without districts) × rooms for long-term rent
and sale with exactly the legacy rules — 60-day window, one flat counted once, channel caps, outlier and basis
exclusions, a minimum of 8 listings — and stores median, `n` (used) and `total` (all) so the market comparison, the
filters, the bot's budget step, `cities.typical`, the landing and the SEO pages read one consistent set.

## Legacy reference

- BR-API-057 / BR-SEO-011 / BR-DATA-026 (rent): slice district (or city) × rooms; last 60 days; recomputed hourly; one
  publication per flat; ≤ 3 listings per channel (no channel cap in regional cities); groups under 8 not computed
  («—»); prices below $50 or above $20 000 per month and «per person» prices dropped; caption «по 82 из 197
  объявлений» = used / all. `$KVADRO_ROOT/docs/seo-pages.md:264-275`.
- BR-API-063 / BR-SEO-016 / BR-SEO-019 (sale): price and price per m²; down payments and instalments excluded; at most
  a tenth of a group from one channel; prices below $5 000 or above $5 M excluded; per m² only listings with an area;
  groups under 8 hidden. `$KVADRO_ROOT/docs/seo-pages.md:294-298`, `:313-318`.
- BR-API-060 (3+ room flats compared per m² among 3+ rooms — per-m² medians needed for those groups), BR-API-064
  (cities with `median: false`), OPQ-2 (`10` §1.14: answered except tone thresholds), ENT-032, LB-DATA-008 (place
  medians keyed by `place_id`, not `pt:` strings), Q-DATA-031, Q-API-016 (`typical` = city median per deal?).
- `14` §6.5 "Medians — rebuilt district × rooms medians vs the legacy snapshot within §6.6 tolerance for ≥ 99 % of
  slices" (KV-DB-021 runs the comparison); `15` §3.5 #10 (scheduler overlap → one run, one result set).

## Implementation

1. Read KV-DB-011, `.ai/agents/postgis-geo-engineer.md` rules 6, 8 (EXPLAIN), `.claude/skills/laravel-database-optimization/`.
   Tests first in the `pgsql` group (window functions, `percentile_cont`).
2. `php artisan make:class Services/Pricing/MedianService --no-interaction`:
   `recompute(CarbonImmutable $now): MedianRun` builds the set for `window_start = now − 60 days`:
   - **Population**: listings of `property_type = apartment` with at least one publication in the window
     (`listing_publications.published_at ≥ window_start`), status active or withdrawn (a flat rented inside the window
     still describes the market — `PROPOSED`, legacy wording «за 60 дней» covers both), not `taken_down`, not `merged`;
     one row per listing (one publication per flat — the listing's latest price inside the window).
   - **Rent long** (`deal = rent`, `rent_period = long`, `price_basis = month`): drop `per_person` basis, drop
     `price_usd < 50` or `> 20 000`; channel cap: per (slice, channel of the latest publication) keep the 3 most recent
     — applied only for cities with `cities.median_channel_cap = true` (Tashkent and Tashkent region `PROPOSED`;
     Andijan, Namangan, Kokand, Fergana uncapped — "regional cities", BR-API-057).
   - **Sale** (`deal = sale`, `price_basis = total`): drop `price_kind ∈ {down_payment, instalment}`, drop `< 5 000` or
     `> 5 000 000` USD; channel cap: no channel may supply more than `floor(group_size / 10)` listings (at least 1),
     most recent kept; per-m² metric only where `area_total` is set (`price_usd / area_total`).
   - **Groups**: scope `district` (cities with districts) and `city` (always, for `typical` and cities without
     districts) × rooms bucket `0` (studio), `1`, `2`, `3`, `4` (= 4+); metrics `month` (rent), `total` and `m2`
     (sale), plus `m2` for rent rooms ≥ 3 (BR-API-060 comparisons).
   - **Median**: `percentile_cont(0.5)` rounded to whole dollars (m²: 2 decimals); computed only when `n ≥ 8`;
     `total` = slice size before outlier and cap filtering (the «из M» number); groups with `n < 8` are stored with
     `median = null` so readers can show «—».
3. Atomicity: write the run into `market_medians` with a new `computed_at`, then flip
   `pricing.current_median_run` (one row/Redis key) in a transaction; readers always query the current run; old runs
   kept 7 days for comparison then pruned.
4. Command and schedule: `php artisan make:command Pricing/RecomputeMedians --no-interaction` (`pricing:medians`),
   hourly at minute 5 `->onOneServer()->withoutOverlapping()` on the `default` queue as a job; after the run:
   `MediansRecomputed` event (KV-BE-140 recomputes `listing_market`; caches of KV-BE-030 and M7 flushed).
5. Comparison helper for KV-DB-021: `pricing:medians-compare {legacy-snapshot.json}` → per slice difference and the
   share within tolerance (`14` §6.6).
6. City availability: `cities.median` flag for `meta`/filters (BR-API-064) = "the city has at least one district or
   city group with a median" from the latest run, unless the seed forces `false` (KV-BE-024 `MarketAvailability`).

## Files

- `backend/app/Services/Pricing/MedianService.php`, `backend/app/Domain/Pricing/{MedianRun,MedianGroupKey}.php`,
  `backend/app/Jobs/Pricing/RecomputeMediansJob.php`, `backend/app/Events/Pricing/MediansRecomputed.php`,
  `backend/app/Console/Commands/Pricing/{RecomputeMedians,CompareMedians}.php` (new)
- migration `add_median_channel_cap_to_cities_table` (if KV-DB-006 lacks it); `backend/config/pricing.php` (new);
  `backend/routes/console.php` (shared)
- `backend/tests/Feature/Pgsql/Pricing/MedianServiceTest.php`, `backend/tests/Feature/Pricing/RecomputeMediansCommandTest.php` (new)

## API contract

n/a (internal). Consumers: API-002 `typical`, API-008 `median_*` (via KV-BE-140), landing `medians` (KV-BE-155), SEO
slices (KV-BE-157).

## Business rules

- BR-API-057, BR-API-063, BR-DATA-026, BR-SEO-011, BR-SEO-016, BR-SEO-019, BR-API-060, BR-API-064, LB-DATA-008 fix
  (place medians keyed by id — produced by KV-BE-140).
- `PROPOSED` (no legacy evidence, spec-tested and named so): withdrawn-in-window listings included; studio bucket `0`;
  which 3 per channel are kept (most recent); `percentile_cont` interpolation for even `n`.

## Acceptance criteria

- A slice with 7 eligible listings has `median = null`, `n = 7`; with 8 it has a median.
- A channel with 5 listings in a capped rent slice contributes 3; in an uncapped regional city all 5.
- Rent prices $49 and $20 001 and a per-person price are excluded and counted only in `total`.
- Sale: a down payment and a $4 999 listing are excluded; 30 listings from one channel in a 100-listing group
  contribute at most 10.
- Two overlapping scheduler invocations produce one run (`15` §3.5 #10).

## Tests

- `MedianServiceTest` (`pgsql`, frozen clock): `n7_no_median_n8_median`, `window_is_60_days_edges` (59 d 23 h in, 60 d
  1 s out), `one_listing_counted_once_with_latest_price`, `rent_channel_cap_three_most_recent`,
  `regional_city_uncapped`, `rent_outliers_and_per_person_dropped_but_in_total`, `sale_down_payment_and_instalment_excluded`,
  `sale_bounds_5000_and_5m`, `sale_channel_cap_one_tenth`, `sale_m2_only_with_area`, `rooms_4_plus_bucket`,
  `even_n_interpolates_and_rounds`, `city_scope_always_computed`, `taken_down_and_merged_excluded`,
  `daily_rent_not_in_long_medians`, `houses_excluded`.
- `RecomputeMediansCommandTest`: `overlapping_runs_single_result` (`withoutOverlapping`), `current_run_flipped_atomically`,
  `old_runs_pruned_after_7_days`, `event_dispatched_after_flip`, `compare_reports_share_within_tolerance`.

## Edge cases

- A district whose listings are all from one channel: capped to 3 → `n < 8` → no median even with 50 listings —
  correct by the rule; reported in the run summary.
- No rate for a UZS listing's date: its `price_usd_cents` is flagged `rate_stale` but still used (KV-BE-131).
- A merge between runs: the merged listing disappears, the survivor counts once.
- Clock: the window boundary is an instant (UTC), not a Tashkent calendar day — `PROPOSED`; Q-DATA-032 covers the
  index series only.

## Security

- SEC-REQ-045 (price tones label listings; medians are their basis — reproducible runs, stored inputs counts, kill
  switch via KV-BE-140), SEC-REQ-038 (purged listings keep price, district and area for statistics — BR-API-065 — so
  medians are unaffected by the PII purge).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), EXPLAIN of the run query in the PR, `09` row F-PIPELINE-005 updated,
PR reviewed by the other developer; the comparison command handed to KV-DB-021.
