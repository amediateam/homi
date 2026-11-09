# KV-BE-161 — Rent index and sale price series with frozen history

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-SEO-006 |
| Dependencies | KV-DB-011 (`price_index_points`, `salary_references`), KV-BE-134 (first-seen dates, last prices), KV-BE-019 (CBU rate); migrated published rows by KV-DB-021; Q-SEO-013, Q-DATA-032, Q-SEO-014, Q-API-054 |

## Goal

HOMI computes the Tashkent rent index (monthly and weekly medians of new listings per room count, the 2-room district
table with month-over-month change, rent in salaries) and the sale price series (per m² and per room count by
district), publishes only periods with enough data, and never changes a published past period — migrated legacy
values stay exactly as published.

## Legacy reference

- LND-052 (rent index page), LND-053 (sale prices page), LND-054 (methodology) in `03b` lines 926-972;
  `$KVADRO_ROOT/docs/seo-pages.md:300-318`, `:242-257`; ENT-033 (published values migrated + rebuilt), ENT-056
  (salary reference, manual).
- Rules: BR-API-139 and BR-DATA-023 (first-appearance month, last price, past months never change, ≥ 50 listings per
  rooms, data since 2026-10-01, rent in salaries), BR-SEO-017 (monthly median of new listings, one publication per
  flat, no channel cap, no «near» logic; weeks Monday–Sunday; district table for 2 rooms with `±0%`, `−6%`, `+8%`,
  `—`; coverage from 2026-10-01), BR-SEO-018 (month median × CBU rate ÷ Nationalstat average salary, «1 комната 49%
  зарплаты»; rounding open), BR-SEO-019 (sale: first appearance, one flat once, exclude down payments, instalments,
  `< $5 000` and `> $5 M`; per m² only with an area; channel cap ≤ 1/10 of a group; groups under 8 hidden; comparison
  with the previous month from 50 listings), BR-API-063, BR-SEO-029.
- Open: Q-SEO-013 (recompute identically or migrate the series as data — migrate and freeze), Q-DATA-032 (month and
  week boundaries UTC or Tashkent), Q-SEO-014 (salary source and rounding), Q-API-054 (CBU rate), LB-DATA-018.
- Migration check: `14` §6.5 «Index CSV — HOMI-generated CSVs for frozen periods equal the published legacy CSVs byte
  for byte».

## Implementation

1. Read the KV-DB-011 task (`price_index_points` with the `frozen` guard), the KV-BE-019 task (`RateService`) and
   `.claude/skills/laravel-database-optimization/`.
2. `php artisan make:class Services/Pricing/IndexService --no-interaction`:
   - `rentIndex(Period $period)`: population = Tashkent `rent_long` apartments whose `first_seen_at` falls in the
     period (month or Monday–Sunday week), one row per listing (merged duplicates counted once, by survivor), price =
     the listing's last known monthly USD price (`price_basis = month`; per-person and daily prices excluded); median
     per `rooms` 1, 2, 3 (and 4+ if present in the legacy CSV — follow the archive); `listings` = count; a period is
     published only with `listings ≥ 50` for that room count. Period boundaries in `config('pricing.index_timezone')`
     — default `UTC` until Q-DATA-032 is answered; DEV-014 `PROPOSED` would make them Asia/Tashkent.
   - `districtTable(month)`: 2-room median per Tashkent district with `listings` and the change against the previous
     month (rounded integer %, `±0%` for zero, `null` rendered «—» when either month is below 50).
   - `saleSeries(month)`: Tashkent sale apartments by first appearance, excluding down payments, instalments,
     `< $5 000`, `> $5 M`; `median_usd` per rooms 1–4 and `median_usd_m2` (only listings with an area) per district
     and `all`; channel cap ≤ 1/10 of a group (drop the newest surplus listings of a channel); groups under 8 hidden;
     month-over-month comparison only from 50 listings.
   - `rentInSalaries(month)`: per rooms, `round(median_usd × usd_uzs(month end) / avg_salary_uzs × 100)` with the
     latest `salary_references` row for Tashkent (rounding spec until Q-SEO-014; the rate date is the last CBU rate of
     the month, Q-API-054).
3. Persistence: upsert into `price_index_points` (`series` `rent_index`/`sale_prices`, `period` `month`/`week`,
   `start`, `district_id`, `rooms`, `median_usd`, `median_usd_m2`, `listings`); the **current** month and week are
   recomputed by every run; a period becomes `frozen = true` with `published_at` on the first run after it ends; the
   KV-DB-011 guard refuses updates of frozen rows, and the service skips them (Q-SEO-013: migrated legacy rows arrive
   frozen through KV-DB-021 and are never recomputed).
4. `php artisan make:command Pricing/RefreshPriceIndex --no-interaction` (`pricing:index`): monthly series daily at
   04:30 Tashkent, weekly series on Mondays — both `onOneServer()->withoutOverlapping()`, after the medians
   (`10` §4.11 lists "monthly (index), weekly (sale)"; this task runs both daily so the live period stays current).
5. `php artisan make:command Pricing/SetSalaryReference --no-interaction` (`pricing:salary {region} {period_end}
   {amount_uzs} {source_url} {--label-ru=} {--label-uz=} {--label-en=}`) — the manual entry the legacy also used
   (ENT-056); no admin UI before ARM.
6. Read service for KV-BE-159 and KV-BE-162: `IndexSeries::forPage()` returns monthly and weekly rows, the district
   table, rent in salaries, `temporalCoverage` (2026-10-01 → last published period) and `dateModified` (latest
   `published_at`).

## Files

- `backend/app/Services/Pricing/{IndexService,IndexSeries}.php`, `backend/app/Domain/Pricing/Period.php` (new)
- `backend/app/Console/Commands/Pricing/{RefreshPriceIndex,SetSalaryReference}.php` (new); `backend/config/pricing.php`
  (`index_timezone`, thresholds 50 and 8, sale bounds); `backend/routes/console.php`
- `backend/tests/Feature/Pricing/{RentIndexTest,SalePriceSeriesTest,RentInSalariesTest}.php` (new)

## API contract

n/a — rows in `price_index_points`; served by KV-BE-159 (`GET /api/v1/public/stats/rent-index`, `…/sale-prices`) and
exported by KV-BE-162.

## Business rules

- Kept: BR-API-139, BR-DATA-023, BR-SEO-017, BR-SEO-018, BR-SEO-019, BR-API-063, BR-SEO-029 (methodology statements
  stay true).
- DEV-014 `PROPOSED` (Tashkent calendar for index months and weeks) behind `pricing.index_timezone`; test
  `->todo('DEV-014 PROPOSED')`. Published legacy periods are not affected either way (frozen).
- No other DEV; salary rounding and the channel-cap tie rule are spec-tested.

## Acceptance criteria

- A frozen period never changes: a re-run after new data, a merge or a price change leaves every frozen row
  byte-identical (`updated_at` unchanged).
- A month with 49 two-room listings publishes no 2-room value; with 50 it does.
- The weekly series starts on Mondays; the first published period is not earlier than 2026-10-01.
- Sale groups under 8 are hidden; per-m² medians use only listings with an area; the channel cap holds.
- Rent in salaries uses the latest salary reference and the month's last CBU rate.

## Tests

- `RentIndexTest`: `month_population_by_first_seen_with_last_price`, `repost_later_is_not_new`,
  `merged_duplicates_counted_once`, `threshold_49_vs_50_per_rooms`, `weeks_are_monday_to_sunday`,
  `coverage_starts_2026_10_01`, `current_month_recomputed_past_month_frozen`, `frozen_row_never_updated`
  (attempted update throws, service skips), `month_boundary_dataset` (listing first seen 31 Jan 21:00 UTC: January in
  UTC mode, February in Tashkent mode — `15` §3.10 #9), `district_table_change_and_dash`,
  `->todo('DEV-014 PROPOSED')`.
- `SalePriceSeriesTest`: `excludes_down_payment_instalment_and_outliers` (4 999 / 5 000 / 5 000 000 / 5 000 001),
  `per_m2_only_with_area`, `channel_cap_one_tenth`, `groups_under_8_hidden`, `mom_comparison_from_50`,
  `rooms_0_means_all`.
- `RentInSalariesTest`: `ratio_with_latest_salary_and_month_end_rate`, `rounding_spec`,
  `no_salary_reference_hides_block`.

## Edge cases

- Late ingestion of a post first published inside a frozen month: by definition it belongs to that month but the month
  is frozen — it is not added (past months never change, BR-SEO-017); the listing counts nowhere in the index.
- A listing's price changes after its month froze: no effect; the "last price" is taken until the freeze.
- No CBU rate for the month end (rate outage): use the latest earlier rate and record its date (KV-BE-019 staleness
  alert covers the outage).
- Small samples in a new district: hidden, never estimated.
- Migrated rows and HOMI rows for the same period: the migrated frozen row wins; the service never writes a period that
  already has a frozen row.

## Security

- No personal data in the series; SEC-REQ-021 for the downstream CSV and pages.

## Definition of done

Tests green (`make ci-backend`), the `14` §6.5 index check passes on the rehearsal data (KV-DB-037), parity gate items
ticked (`15` §4) for the series part of F-SEO-006, docs and the feature row in `09` updated, PR reviewed by the other
developer.
