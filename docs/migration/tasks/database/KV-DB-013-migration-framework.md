# KV-DB-013 — Migration framework

| Field | Value |
| ----- | ----- |
| Status | TODO (synthetic data first) |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | Technical migration task — idempotent, restartable, repeatable runs with bookkeeping are the precondition of every load, validation and rehearsal (`14` §7.1–§7.3). Unblocks the data of F-ACCESS-003, F-RADAR-001, F-DELIVERY-005, F-FAV-001, F-LISTING-001, F-MEDIA-001 |
| Dependencies | KV-DB-007…011 (code); KV-DB-012 (runs) |

## Goal

The bookkeeping tables `migration_runs`, `migration_run_steps`, `migration_changes` and `legacy_id_map`, a batch-runner
base class and the driver command `php artisan migration:run {--kind=rehearsal|final|delta} {--only=}` exist; a
synthetic entity loads from synthetic stage tables, restarts after a forced failure from the last committed batch and a
re-run over unchanged data writes zero rows.

## Legacy reference

- `14` §3 (`legacy_id_map` shape: `entity text, legacy_key text, homi_key text, run_id bigint, first_seen_run bigint,
  row_checksum bytea`, unique `(entity, legacy_key)`), §4 (`migration_changes(run_id, entity, legacy_key, rule,
  before_hash, after_hash)`), §7.1 (`migration_runs`, `migration_run_steps` columns), §7.2 (idempotent, restartable,
  repeatable, deterministic), §7.3 (load order), §6.1 V-CNT-1 (read = written + merged + excluded).
- `10` §4.2 module **Migration** (temporary; nothing imports it except its commands).
- `$KVADRO_ROOT/docs/about.md:425-440` (what must migrate).

## Implementation

1. Read `14` §3, §4, §6.1, §7, `.ai/agents/postgis-geo-engineer.md` (rule 5 idempotent upserts) and
   `.claude/skills/laravel-best-practices/`, `.claude/skills/laravel-testing/`.
2. `php artisan make:migration create_migration_bookkeeping_tables --no-interaction`: `migration_runs(id bigint identity,
   kind text check in ('rehearsal','final','delta'), dump_sha256 text, legacy_watermark timestamptz, started_at
   timestamptz, finished_at, status text, config jsonb)`, `migration_run_steps(run_id, entity, batch_from text,
   batch_to text, rows_read, rows_written, rows_merged, rows_excluded int, excluded_by_reason jsonb, checksum bytea,
   started_at, finished_at)` with unique `(run_id, entity, batch_from)`, `migration_changes`, `legacy_id_map`. These are
   ordinary HOMI tables, dropped after KV-DB-031 by a later migration.
3. Models with factories (`php artisan make:model MigrationRun -f --no-interaction`, likewise for the others) under
   `App\Models\Migration\…`; a `RunConfig` value object (`app/Domain/Migration/RunConfig.php`, `make:class`) holding the
   run start time (the only clock transforms may read), feature flags for `PROPOSED` rules, batch size.
4. `App\Services\Migration\BatchLoader` (abstract, `make:class`): `entity()`, `sourceQuery()` on the `legacy_import`
   connection (ordered by legacy key, keyset batches), `transform(row, RunConfig): TransformResult` (target rows, map
   rows, change rows, exclusion reason), `upsert()` building `INSERT … ON CONFLICT (<key>) DO UPDATE SET … WHERE
   (<target>) IS DISTINCT FROM (EXCLUDED…)`; one transaction per batch writing target rows, `legacy_id_map`,
   `migration_changes` and its `migration_run_steps` row; `rows_written` counts only rows actually changed.
5. Restart: before a batch, skip ranges already committed for this run (`migration_run_steps`); a crashed run is resumed
   with `--resume=<run_id>`.
6. `php artisan make:command Migration/RunMigration --no-interaction` → `migration:run`: creates the run row, runs the
   registered loaders in the order of `14` §7.3 (dictionaries → users → listings → photos → radars → personal lists →
   erasure replay → derived rebuild → sequences/validation), `--only=` restricts to named entities, `--kind=delta` passes
   the watermark to loaders that support it (KV-DB-023).
7. Guard: refuse to run when `app()->environment('local')` unless `legacy_stage._sanitised` exists (SEC-REQ-041);
   refuse when the run start time is not given for `final`.
8. Report: `php artisan migration:report {run}` prints per entity read / written / merged / excluded by reason and the
   V-CNT-1 balance; no personal values.
9. Synthetic stage: `backend/tests/Fixtures/Migration/stage.sql` creates two tiny stage tables (`stage_widgets`,
   `stage_widget_tags`) used only by the framework tests; a test-only loader writes into a test table.

## Files

- `backend/database/migrations/*_create_migration_bookkeeping_tables.php`
- `backend/app/Models/Migration/{MigrationRun,MigrationRunStep,MigrationChange,LegacyIdMap}.php` + factories
- `backend/app/Domain/Migration/RunConfig.php`, `backend/app/Services/Migration/{BatchLoader,TransformResult,LoaderRegistry}.php`
- `backend/app/Console/Commands/Migration/{RunMigration,MigrationReport}.php`
- `backend/tests/Feature/Migration/Framework/*Test.php`, `backend/tests/Fixtures/Migration/stage.sql`

## API contract

n/a — command-line only.

## Business rules

`14` §7.2: idempotent writes, restartable batches, repeatable fingerprints, deterministic transforms (no `now()`, no
randomness). V-CNT-1: every step balances. `PROPOSED` rules (DEV-004, DEV-005, DEV-009, DEV-017, LB-DATA-011 twin
merge) are switched by `RunConfig` flags and always write `migration_changes`, so their volume is reported.

## Acceptance criteria

- A synthetic run loads both stage tables; a second run writes 0 rows and identical checksums.
- A run killed after batch 2 of 5 and resumed writes batches 3–5 only; final state equals an uninterrupted run.
- `migration:report` shows read = written + merged + excluded for every entity (V-CNT-1 returns zero rows).
- On `APP_ENV=local` without the sanitised marker the command exits non-zero before touching data.
- An architecture test proves nothing outside `App\Console\Commands\Migration` imports `App\Services\Migration`.

## Tests

`backend/tests/Feature/Migration/Framework/` (`pgsql` group, `DatabaseTruncation`, KV-QA-001):
- `IdempotentRerunTest` — second run: `rows_written = 0`, `legacy_id_map` unchanged, `row_checksum` unchanged.
- `RestartTest` — loader throws on batch 3 → run status `failed`; `--resume` completes; fingerprint equals a clean run.
- `ChangeLogTest` — a transform that rewrites a value writes one `migration_changes` row with before/after hashes; a
  re-run adds none.
- `BalanceTest` — exclusions with reasons `orphan`, `invalid`, `duplicate` make V-CNT-1 pass; a planted miscount fails
  (validator tests themselves: KV-QA-018).
- `DeterminismTest` — two runs with the same `RunConfig` start time into empty schemas give equal V-SUM-style
  fingerprints; a transform calling `now()` is caught by an `arch()` rule (no `now(`/`Carbon::now` in loaders).
- `SanitisedGuardTest` — local environment without the marker → exit code 1.

## Edge cases

- Legacy keys that are strings vs integers (radars, Q-DATA-022): `legacy_key` is `text`; batching orders by the stage
  column's natural type.
- A batch whose transform excludes every row still writes a step row (balance stays provable).
- Two concurrent `migration:run` invocations: a PostgreSQL advisory lock per run kind; the second exits.
- A delta run touching rows loaded by the bulk run updates `run_id` and `row_checksum` only when the transformed row changed.

## Security

- SEC-REQ-041: sanitised-marker guard; the `legacy_import` connection is read-only.
- No PII in logs or reports: reports carry counts, ids and hashes only; `migration_changes` stores hashes, never values.
- SEC-REQ-039: the erasure replay step (KV-DB-027) is a registered step of the driver, run after every load.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: an R0 run of the framework on the masked sample
(once KV-DB-002 delivers it) green, the run report reviewed, `14` §7.1 updated with the final table and command names.
