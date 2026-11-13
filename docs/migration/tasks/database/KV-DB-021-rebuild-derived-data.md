# KV-DB-021 — Rebuild derived data and compare

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (M6, dump) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-005, F-LISTING-004, F-LISTING-007, F-SEO-006, F-LANDING-003 |
| Dependencies | KV-DB-011, KV-DB-016, KV-DB-017, KV-BE-019; M6 medians |

## Goal

After the listings, publications and photos are loaded, HOMI recomputes every derived data set with its own services
(medians, per-listing market comparison, nearby links, price presets, index series, SEO aggregates, landing snapshot),
imports the published index values as frozen, and compares the result with the legacy snapshot within the
tolerances of `14` §6.6.

## Legacy reference

- Scope: `14` §2 rows ENT-031 (market comparison: rebuild + compare), ENT-032 (medians: rebuild + compare), ENT-033
  (index: migrate published values frozen + rebuild + compare), ENT-036 (nearby: rebuild), ENT-051 (presets: rebuild),
  ENT-054 (landing snapshot: rebuild), ENT-055 (SEO slices: rebuild); §4.2 row "Index series"; §7.3 step 8.
- Rules: BR-DATA-026 (60-day window, ≤ 3 per channel, groups < 8 not shown, outliers), BR-DATA-023 (index frozen by
  month of first appearance, ≥ 50 listings), BR-DATA-027 (`nearby` park/school only), BR-API-057 … BR-API-064,
  BR-API-139.
- Defects: LB-DATA-008 (place medians keyed by `pt:` strings → `place_id`), LB-DATA-016 (snapshots regenerated through
  the media pipeline), LB-DATA-018 (index months in Asia/Tashkent, published values frozen).
- Questions: Q-DATA-031 (where medians live, tone thresholds), Q-DATA-032 (index storage and month boundaries),
  Q-DATA-046 (snapshots and aggregates stored or generated), Q-API-021 (tones).
- Comparison oracle: the legacy snapshot of `listing_market`/medians captured at the freeze (`legacy_stage`), the
  published CSVs (RES-018) and the landing data files (RES-010 … RES-012).

## Implementation

1. Preconditions: the M6 `MedianService` and `MarketComparison` and the M7 SEO-aggregate and landing-snapshot builders
   exist. Read `.ai/agents/postgis-geo-engineer.md` (KNN, `ST_DWithin`, EXPLAIN review) and
   `.claude/skills/laravel-queues/`.
2. `php artisan make:command --no-interaction Migration/RebuildDerivedDataCommand` (`migration:rebuild-derived`):
   calls, in order, the M6/M7 services — `MedianService::recomputeAll()`, `MarketComparison::refreshAll()`,
   nearby recomputation from `pois`, `price_presets` derivation, `IndexService::recompute()`, SEO slice refresh,
   landing snapshot build — as queued batches on `default`, chunked by city; it never reimplements their rules.
3. Index import: `migration:import-index-csv <file>` reads each published legacy CSV (RES-018, provided by the owner
   or the frozen SEO archive of `18` §3) into `price_index_points` with `frozen = true`, `published_at`; HOMI's
   recomputation is stored in separate rows (`frozen = false`) and never overwrites frozen ones (constraint test from
   KV-DB-011).
4. Comparison: `migration:compare-derived --run=<id>` computes per slice (district/city × rooms × deal × metric) the
   difference against the legacy snapshot and writes `migration_run_steps` rows with pass/fail by the tolerance
   `± max($1, 1 %)`; tones may differ only where the median crossed a tone threshold (listed per listing).
5. CSV check: HOMI-generated CSVs for frozen periods must be byte-equal to the published files (the CSV writer belongs
   to M7; this step only diffs).
6. Report: counts of slices compared, within tolerance, outside tolerance (with slice keys, never listing texts); the
   developer reviews every out-of-tolerance slice before R2.
7. Exchange-rate history (ENT-041; `14` §2 row "Exchange rate", §7.3 step 1 — runs **first**, before the listings
   load, because it is reference data): `php artisan make:command --no-interaction Migration/LoadExchangeRatesCommand`
   (`migration:rates`) imports the legacy rate history from `legacy_stage` when it exists, otherwise backfills the CBU
   daily rates for the whole listing date range through `App\Services\Pricing\RateService` (KV-BE-019) in backfill mode
   (`Http::fake` in tests); idempotent upsert on (`date`, `base`, `quote`); BR-DATA-008, Q-API-054.

## Files

- `backend/app/Console/Commands/Migration/{RebuildDerivedDataCommand,ImportIndexCsvCommand,CompareDerivedCommand,LoadExchangeRatesCommand}.php` (new)
- `backend/app/Services/Migration/DerivedDataComparator.php` (new)
- `backend/tests/Feature/Migration/RebuildDerivedDataTest.php` (new, `pgsql` group)

## API contract

The rebuilt data must reproduce, within tolerance, what legacy routes serve: `median_*` keys and `median_delta`/
`median_tone` of `GET /api/listings/:id` (API-008, all strict keys present), `CityStats.presets`/`typical` of
`GET /api/cities` (API-002), `meta.price_presets` (API-001), map `tone`/`usd` (API-007), the landing files RES-010 …
RES-012 and the CSV exports RES-018 (byte-equal for frozen periods).

## Business rules

Keep BR-DATA-023, BR-DATA-026, BR-DATA-027 and BR-API-057 … BR-API-064, BR-API-139; apply LB-DATA-008, LB-DATA-016 and
LB-DATA-018 (`APPROVED` defect fixes). DEV-014 (Tashkent calendar for aggregates) is `PROPOSED`: frozen published
values are never recomputed regardless.

## Acceptance criteria

- `14` §6.5 rows "Medians" (≥ 99 % of slices within `± max($1, 1 %)`) and "Index CSV" (byte-equal for frozen periods)
  pass on R1 data.
- No frozen `price_index_points` row changes across two runs.
- Every listing with `median = true` in the legacy snapshot has a `listing_market` row or an explained exclusion.

## Tests

- `frozen index rows survive a recompute` (planted change attempt is rejected).
- `comparison passes inside tolerance and fails at $1.01 and 1.01 %` (synthetic slices).
- `tone difference allowed only when the median crossed a threshold`.
- `point medians keyed by place_id map back to pt: keys only for the legacy landing feed` (LB-DATA-008).
- `CSV diff reports the first differing byte offset` (synthetic files).
- `rebuild is idempotent: second run gives identical fingerprints`.
- `migration:rates imports legacy history or backfills CBU days without gaps and re-runs with zero writes` (faked CBU
  responses, `Http::preventStrayRequests()`).

## Edge cases

- Cities without enough listings (groups < 8): legacy shows «—»; HOMI must also produce no median, not a zero.
- Legacy snapshot taken before the final delta: compare against the snapshot of the same watermark only.
- Regional cities have no channel cap (BR-API-057); a cap applied there is a failure, not a tolerance issue.
- Index months crossing the Tashkent midnight (`15` §3.10 #9): published values stay; recomputation per Q-DATA-032.

## Security

Derived data contains no PII; the landing snapshot and CSVs pass SEC-REQ-021 (no phone pattern, no listing text,
CSV formula neutralisation is the M7 writer's job and is checked here only by diff). Reports carry slice keys and
numbers only.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4), docs and the feature rows in 09
updated, PR reviewed by the other developer. The R1 comparison report is attached to the rehearsal record (KV-DB-024).
