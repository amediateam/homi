# KV-QA-018 — Tests for the migration validators

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development); rehearsal runs with the production track |
| Complexity | M |
| Feature IDs | Technical migration task — proves the validation of `14` §6 that gates the data cut-over; covers the data of F-FAV-001, F-HISTORY-001, F-HIDE-001, F-HIDE-002, F-RADAR-002, F-DELIVERY-005, F-SETTINGS-001, F-ANALYTICS-002, F-PIPELINE-003, F-MEDIA-001 |
| Dependencies | KV-DB-013 (migration framework), KV-DB-022 (validation command), KV-QA-001 |

## Goal

Every validation check of the data migration is shown to catch the defect it exists for: each check passes on a clean
synthetic run and fails on a run with its planted defect; a repeated load writes zero rows. Validation that "always
passes" is impossible to merge.

## Legacy reference

- `14` §6.1 (V-CNT-1 … V-CNT-3), §6.2 (V-SUM-1 … V-SUM-6), §6.3 (V-RI-1 … V-RI-10), §6.4 (sampled comparison), §6.5
  (business checks), §6.6 (tolerances and stop rules), §7.2 (idempotent, restartable, repeatable).
- Data rules and defects: BR-DATA-017, BR-DATA-024, BR-DATA-025, BR-DATA-030, LB-DATA-005, LB-DATA-012 (`06`, `09`
  §4.3).
- Personal-data handling: `14` §1.2, SEC-REQ-041.

## Implementation

1. Read `14` §3–§7 and `.ai/agents/postgis-geo-engineer.md` (rule on idempotent writes).
2. `backend/tests/Feature/Pgsql/Migration/Fixtures/`: a synthetic `legacy_stage` (a handful of users, listings,
   aliases, radars, favourites, delivered cards, settings, photos, an erased subject) in the shape of `14` §4, loaded
   into a separate schema of the test database; numbers chosen to exercise sequences and aliases.
3. A `plantDefect(string $check)` helper with one mutation per check: drop a target row (V-CNT-1); shift a listing
   number (V-SUM-1, V-RI-8); swap a favourite pair (V-SUM-2); delete a delivered row (V-SUM-3); change a radar mode
   (V-SUM-4); change a digest hour (V-SUM-5); change an analytics id (V-SUM-6); point an alias to a merged listing
   (V-RI-1); make an alias equal a live number (V-RI-2); remove one filter key (V-RI-3); orphan a delivered card
   (V-RI-4); orphan a favourite (V-RI-5); a live photo without a ready media file (V-RI-6); keep a phone on a purged
   listing (V-RI-7); set a sequence below the maximum (V-RI-9); load an erased subject (V-RI-10).
4. `MigrationValidatorTest.php`: for each of the 19 SQL checks — clean run passes, planted run fails, and the report
   line names expected, actual and fail.
5. `MigrationIdempotencyTest.php`: load into an empty schema twice → identical fingerprints; a second run over unchanged
   data writes zero rows; a run interrupted after batch k resumes after k (`14` §7.2).
6. `BusinessChecksDryRunTest.php`: the re-send dry run of `14` §6.5 returns zero rows on clean data and the planted
   delivery when a delivered row is removed.
7. Document how the API-level sampled diff of `14` §6.4 is run on staging: only against staging HOMI and an approved
   recording (`15` §1.6); any call to the live legacy API in R1–R3 is **needs developer approval: touches production**,
   read-only, ≤ 1 request per second, with the owner-approved test account (`14` P14).

## Files

- `backend/tests/Feature/Pgsql/Migration/Fixtures/*` (new, synthetic)
- `backend/tests/Feature/Pgsql/Migration/{MigrationValidatorTest,MigrationIdempotencyTest,BusinessChecksDryRunTest}.php` (new)
- `docs/migration/14-data-migration-plan.md` §6 (a pointer to the tests; small edit)

## API contract

n/a (data). The sampled API diff uses API-008, API-005 and API-029 as `14` §6.4–§6.5 describe.

## Business rules

The zero-tolerance list of `14` §6.6; tolerances for derived data (medians ± max($1, 1 %)).

## Acceptance criteria

- 19 of 19 SQL checks have a clean-pass and a planted-fail test.
- The idempotency and restart tests pass.
- The dry-run test catches the planted re-send.
- The validation command (KV-DB-022) is invoked by the tests exactly as rehearsals invoke it.

## Tests

As listed.

## Edge cases

- Checks that read `migration_run_steps` (V-CNT-1) need the bookkeeping rows of the run, not only target tables.
- Time zone of naive legacy timestamps (Q-DATA-035): fixtures include one naive timestamp per zone hypothesis.
- Duplicate personal rows in legacy (LB-DATA-012) collapse to the earliest row and are counted as `merged`.

## Security

Fixtures are synthetic; no legacy sample or dump is used in tests, CI or on laptops (SEC-REQ-041, `14` §1.2).

## Definition of done

Tests green (`make ci-backend-pgsql`), parity gate items ticked (15 §4), docs updated, PR reviewed by the other
developer.
