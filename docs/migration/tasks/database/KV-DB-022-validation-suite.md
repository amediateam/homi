# KV-DB-022 — Validation suite

| Field | Value |
| ----- | ----- |
| Status | TODO (synthetic data first) |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | Technical migration task — proves the carried-over data of every migrated feature (F-ACCESS-003, F-SETTINGS-001, F-FAV-001, F-HISTORY-001, F-HIDE-001 … F-HIDE-003, F-REPORT-001, F-RADAR-001, F-DELIVERY-005, F-LISTING-001, F-LISTING-006, F-MEDIA-001, F-ANALYTICS-002) |
| Dependencies | KV-DB-013 |

## Goal

One command, `php artisan migration:validate --run=<id> [--subset=fast]`, runs every SQL check of `14` §6.1–§6.3
against HOMI and the staged legacy data, and writes a run report that lists each check with expected value, actual
value and pass/fail; the zero-tolerance checks decide `NO-GO`.

## Legacy reference

- Checks: `14` §6.1 V-CNT-1 (every step balances), V-CNT-2 (HOMI counts per entity), V-CNT-3 (listings by deal, term,
  status vs `legacy_stage`); §6.2 V-SUM-1 … V-SUM-6 and the analogous fingerprints for hidden listings, blocked authors
  (with entry numbers), votes (with reason), publications (`handle:post_id:number`), photos (`number:n:sha256`),
  aliases (`alias_number:survivor number`); §6.3 V-RI-1 … V-RI-10.
- Tolerances and stop rules: `14` §6.6 (zero tolerance for V-CNT-1, V-RI-*, V-SUM-*, re-send dry-run, PII checks).
- Runs: `14` §7.2 (repeatable: identical fingerprints from the same dump), §7.4 (R0 in CI, R1–R3 on staging), §7.6
  (fast subset inside the freeze window, ≤ 45 min budget).
- Rules behind the checks: BR-DATA-002, BR-DATA-006, BR-DATA-009, BR-DATA-019, BR-DATA-021, BR-DATA-022; ENT-007
  (V-RI-10 erasure ledger).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md`, `.claude/skills/laravel-database-optimization/`,
   `.claude/skills/testing-best-practices/`.
2. `php artisan make:class --no-interaction Services/Migration/Validation/ValidationCheck` (interface: `id()`,
   `zeroTolerance()`, `inFastSubset()`, `run(MigrationRun): CheckResult`), and one class per check under
   `app/Services/Migration/Validation/Checks/` (`VCnt1StepsBalance`, `VCnt2EntityCounts`, `VCnt3ListingsByDealStatus`,
   `VSum1ListingNumbers` … `VSum6AnalyticsIds`, `VSumHidden`, `VSumBlockedAuthors`, `VSumVotes`, `VSumPublications`,
   `VSumPhotos`, `VSumAliases`, `VRi1AliasTargets` … `VRi10ErasedSubjects`).
3. Fingerprints are computed with the same canonical string on HOMI (default connection) and on `legacy_stage` (the
   read-only `legacy_import` connection), each as `count(*)` + `md5(string_agg(… ORDER BY …))`; legacy-side SQL lives
   next to the HOMI SQL in the same class so a reviewer sees both.
4. V-RI-10 uses `hmac()` from `pgcrypto` with the erasure-log key passed as a binding from config (never logged);
   if `pgcrypto` is not enabled the check computes the HMAC in PHP over the ids streamed in batches.
5. `php artisan make:command --no-interaction Migration/ValidateCommand`: runs all checks (or `--subset=fast`), stores
   each result in `migration_run_steps` (entity = check id) and writes the report as JSON and Markdown to the run's
   storage directory on the import host (never into the repository); exit code non-zero when any zero-tolerance check
   fails.
6. Timing: each check records its duration; the fast subset must fit the freeze budget measured in R2.
7. Coordinate with KV-QA-018, which owns the planted-defect tests for every check (this task ships the checks and a
   happy-path test per check).

## Files

- `backend/app/Services/Migration/Validation/{ValidationCheck,CheckResult,ValidationReport}.php` (new)
- `backend/app/Services/Migration/Validation/Checks/*.php` (new, one per check, ~25 files)
- `backend/app/Console/Commands/Migration/ValidateCommand.php` (new)
- `backend/tests/Feature/Migration/ValidationSuiteTest.php` (new, `pgsql` group)

## API contract

n/a — database-level checks; the API-level comparison is KV-DB-037.

## Business rules

The checks encode BR-DATA-002 (numbers never reused, V-RI-2, V-RI-9), BR-DATA-006 and BR-DATA-022 (no PII on purged or
taken-down listings, V-RI-7), BR-DATA-009 (25-key filters, V-RI-3), BR-DATA-019 (aliases, V-RI-1), BR-DATA-021
(analytics ids byte-equal, V-SUM-6). No DEV applies; checks never "pass with warnings".

## Acceptance criteria

- On R0 synthetic data every check passes, and two full runs into an empty schema from the same stage data give
  identical fingerprints (`14` §7.2).
- The report lists every check id of `14` §6.1–§6.3 (19 SQL checks plus the six analogous fingerprints) with expected,
  actual, pass/fail and duration; a missing check fails a coverage test.
- A failing zero-tolerance check makes the command exit non-zero and the report say `NO-GO`.
- The fast subset excludes no zero-tolerance check of `14` §7.6.

## Tests

- `each check passes on a clean synthetic run` (dataset per check).
- `report contains every check id of 14 §6` (coverage test against a list kept in the test).
- `zero-tolerance failure sets exit code and NO-GO`.
- `fingerprints equal across two fresh loads of the same stage data`.
- `V-RI-10 finds a planted erased subject using the configured key` (key from test config, never printed).
- `report and logs contain no telegram id, phone pattern or text` (scan of the generated JSON).
- Planted-defect failures per check: KV-QA-018.

## Edge cases

- Empty entity on both sides (e.g. no pending deliveries): fingerprint of the empty set is equal, check passes.
- `legacy_stage` contains rows excluded at extract (erased, purged): the legacy-side query applies the same documented
  exclusions so both sides compare like with like.
- Large tables: fingerprints use `string_agg` over ordered keys only (no texts) to stay inside memory; EXPLAIN reviewed.
- Sequences checked after the final delta only (V-RI-9 is meaningless before `setval`).

## Security

SEC-REQ-041 (the suite runs only against the import database on production-track hosts or synthetic data; the command
refuses `APP_ENV=local` unless the stage data carries the sanitised marker); SEC-REQ-039 (V-RI-10); reports contain
counts, ids and hashes only (`14` §1.2).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4), docs and the feature rows in 09
updated, PR reviewed by the other developer. The suite runs in CI on R0 data.
