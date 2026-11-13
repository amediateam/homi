# KV-QA-021 — CI integration: gates, nightly suite, quarantine, denominators

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development); the first developer reviews workflow changes |
| Complexity | M |
| Feature IDs | Technical migration task — CI for every feature's G8 (`15` §4.1) |
| Dependencies | KV-QA-001, KV-QA-004; KV-QA-006 (`test:tz`); KV-QA-010 decision for the reference-client job; approvals for `pcov` (needs approval (CI tool change)) and any runner dependency |

## Goal

The suites of `15` §5.4 run where they belong: fast and deterministic ones gate every PR, slow and environment-heavy
ones run nightly; flaky tests are quarantined by rule; the nightly summary prints the parity denominators of `15` §5.6.

## Legacy reference

- The legacy project has no CI; its parity runs were manual (`$KVADRO_ROOT/CLAUDE.md:23`).
- HOMI today: `.github/workflows/backend.yml` (`composer ci:check`, `postgres:18` service), `frontend.yml`,
  `tooling.yml`; Make targets `ci-backend`, `ci-frontend`.
- Ownership: non-deploy workflows belong to the development track (`docs/handoff/parallel-work.md` §1).

## Implementation

1. Read `15` §5.4–§5.6 and `.github/workflows/backend.yml`.
2. `backend.yml`: keep `composer ci:check` as the PR gate; make the `pgsql` job of KV-QA-001 gating after two weeks
   green nightly; exclude the `quarantine` group from PR runs (`--exclude-group=quarantine`).
3. New `.github/workflows/qa-nightly.yml` (`schedule` + `workflow_dispatch`, pinned action SHAs like `backend.yml`):
   jobs `pgsql-full` (whole suite on PostgreSQL + PostGIS once approved, random order), `tz-matrix` (`composer
   test:tz`), `race-bursts` (concurrency tests with larger N), `quarantine` (the quarantined tests, report-only),
   `smoke-urls` (backend and landing started in the job; `composer test:smoke` against them), `reference-client`
   (after the KV-QA-010 decision and approvals), `perf-smoke` (weekly, `composer test:perf`, indicative only).
4. Quarantine: document the rule of `15` §5.5 in `docs/development/workflows.md`; quarantined tests carry
   `->group('quarantine')` and a `KI-…` entry in `.ai/memory/known-issues.md` with owner and a 7-day deadline.
5. `scripts/qa/denominators.py` (Python standard library): reads `docs/migration/data/{ids.csv,features.csv,
   public-urls.json,reference-client-results.csv,landing-scenario-results.csv,parity-gate.csv}` and the Pest JUnit
   report; prints the `15` §5.6 table as numerator / denominator with the date; the nightly job writes it to
   `$GITHUB_STEP_SUMMARY`.
6. Line coverage: after approval, `coverage: pcov` in `setup-php` for the nightly `pgsql-full` job only; the report is
   an artefact, never a gate.
7. Add Make targets `qa-nightly` (runs the nightly set locally where possible) and keep `ci-backend` / `ci-frontend`
   unchanged.

## Files

- `.github/workflows/backend.yml`, `.github/workflows/qa-nightly.yml` (new)
- `scripts/qa/denominators.py` (new)
- `Makefile` (`qa-nightly`)
- `docs/development/workflows.md`

## API contract

n/a.

## Business rules

n/a.

## Acceptance criteria

- PR gate unchanged in speed (± 10 %) apart from the `pgsql` job.
- `qa-nightly.yml` runs green on a manual dispatch for the jobs whose suites exist; the others are skipped with a
  reason.
- The job summary shows the denominator table with today's date.
- The quarantine rule is documented and the PR gate excludes the group.

## Tests

A dry run of `scripts/qa/denominators.py` against the current data files (denominators 34 API, 144 features, 49
must-keep URLs, 50 SEC-REQ…) recorded in the PR.

## Edge cases

- Nightly jobs must never use repository secrets of staging or production; they need none.
- Scheduled workflows on GitHub run only on the default branch; document how to trigger them for a branch.
- Chrome and SwiftShader availability on the runner image for the reference-client job.

## Security

Pinned action SHAs (SEC-REQ-049); no secret in workflow logs; artefacts contain synthetic data only.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`, nightly dispatch recorded), parity gate items ticked (15 §4),
docs updated, PR reviewed by the other developer (workflow changes by the first developer as well).
