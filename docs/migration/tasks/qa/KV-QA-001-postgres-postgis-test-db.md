# KV-QA-001 — PostgreSQL + PostGIS test database for feature tests

| Field | Value |
| ----- | ----- |
| Status | TODO (steps 7–8 BLOCKED until the CF-014 ADR, KV-DB-005 and the CI image approval) |
| Owner | QA (track: development); CI image change reviewed by the first developer |
| Complexity | M |
| Feature IDs | Technical migration task — test infrastructure. Needed by F-FILTER-001, F-MAP-002, F-PIPELINE-004, F-PIPELINE-005, F-RADAR-002 and by every race and migration test (`15` §2.3, §3.6, §2.10) |
| Dependencies | none for the PostgreSQL part; the PostGIS part is finished in KV-DB-005 (CF-014 PostGIS ADR, approval of the CI image — needs approval (dependency change)) |

## Goal

The whole Feature suite runs on PostgreSQL 18 locally and in CI; tests that need PostgreSQL live in
`backend/tests/Feature/Pgsql/` and skip themselves on SQLite; once approved, the same run has PostGIS.

## Legacy reference

- The legacy backend runs PostgreSQL + PostGIS 3.5.2 (`$KVADRO_ROOT/docs/about.md:396`; `10` CF-014).
- Geography in the contract: lasso polygon with 3–40 vertices on feed, count, flow and map (`08` §1.7, BR-API-034);
  `metro_km`, `center_km`, `geo_radius_m`; nearest-12/15 medians within 5 km (BR-API-057).
- Migration validation is PostgreSQL SQL (`14` §6, V-RI-3 uses `jsonb_object_keys`).
- HOMI today: tests on in-memory SQLite (`backend/phpunit.xml:26-28`); CI starts `postgres:18` only for
  `composer setup` (`.github/workflows/backend.yml:28-44`).

## Implementation

1. Read `.claude/skills/laravel-testing/`, `.claude/skills/testing-best-practices/` and
   `.ai/agents/postgis-geo-engineer.md`.
2. Add `backend/phpunit.pgsql.xml`: the suites of `phpunit.xml`, `DB_CONNECTION=pgsql`, `DB_DATABASE=homi_test`,
   host, port, user and password taken from the environment (CI: `127.0.0.1`, `homi`), the other `<env>` values as in
   `phpunit.xml` (Pulse and Telescope off, queues `sync`, cache `array`).
3. In `backend/tests/Pest.php`, give `tests/Feature/Pgsql/` a `beforeEach` that skips with the reason
   "needs PostgreSQL" when `DB::getDriverName() !== 'pgsql'`; keep `RefreshDatabase` for `Feature`.
4. Add the Composer script `test:pgsql` (`config:clear`, then `vendor/bin/pest --configuration=phpunit.pgsql.xml`)
   and the Make target `ci-backend-pgsql`.
5. Local setup: `createdb homi_test` (no sudo); one paragraph in `docs/infrastructure/local-development.md`.
6. CI: a `pgsql` job in `.github/workflows/backend.yml` using the existing `postgres:18` service and
   `composer test:pgsql`. It is report-only until it has been green in the nightly run for two weeks (`15` §5.4), then
   it gates PRs.
7. After approval: replace the service image with a `postgis/postgis` tag for PostgreSQL 18, pinned by digest; local
   PostGIS through Homebrew on both developer machines (a machine dependency — needs approval).
8. Write `tests/Feature/Pgsql/DatabaseCapabilitiesTest.php`: a `jsonb` containment query, a partial unique index
   violation, `SELECT … FOR UPDATE SKIP LOCKED`, and — in group `postgis`, skipped when the extension is missing —
   `postgis_full_version()` and an `ST_DWithin` query on `geography`. The extension itself is created by the KV-DB-005
   migration, not by this task.
9. Run the existing 47 cases on PostgreSQL. Fix SQLite-only assumptions in tests (never in app code) and list them in
   the PR.

## Files

- `backend/phpunit.pgsql.xml` (new)
- `backend/tests/Pest.php`
- `backend/tests/Feature/Pgsql/DatabaseCapabilitiesTest.php` (new)
- `backend/composer.json` (script `test:pgsql`)
- `Makefile` (target `ci-backend-pgsql`)
- `.github/workflows/backend.yml` (job `pgsql`)
- `docs/infrastructure/local-development.md`

## API contract

n/a.

## Business rules

None directly. Enables the tests of BR-API-034 (polygon), BR-API-057 (medians) and BR-DATA-017 (per-user uniqueness).

## Acceptance criteria

- `make ci-backend` is unchanged and green (SQLite).
- `make ci-backend-pgsql` runs the whole Feature suite on PostgreSQL 18 and is green on both developer machines.
- Tests in `tests/Feature/Pgsql/` are reported as skipped, with the reason, on SQLite, and pass on PostgreSQL.
- The CI `pgsql` job runs on PRs that touch `backend/**`.
- After the approval: the `postgis` capability test passes in CI; without the extension it is skipped, not failed.
- No test or script reads `backend/.env`.

## Tests

- `DatabaseCapabilitiesTest` (jsonb, partial unique index, row locking, PostGIS).
- The existing `Feature/Http/*` and `Feature/Media/*` suites pass on both drivers.

## Edge cases

- `RefreshDatabase` migrates once per process on PostgreSQL; record the first-test time in the PR.
- `--parallel` needs one database per process (`homi_test_test_N`); not enabled here.
- Race tests need `DatabaseTruncation`, not the transaction wrapper (KV-QA-008).
- A migration with SQLite-only syntax fails here first — expected and useful; report it to the migration's owner.

## Security

- The test database holds synthetic data only, never a legacy dump or sample (SEC-REQ-041).
- CI images are pinned by digest (SEC-REQ-049).

## Definition of done

Tests green (`make ci-backend` and `make ci-backend-pgsql`), parity gate items ticked (15 §4), docs and the feature
rows in 09 updated where they cite this infrastructure, PR reviewed by the other developer.
