# KV-DB-023 — Delta extraction

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (Q-DATA-043) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | Technical migration task — keeps the data of every migrated feature current between the bulk load and the cut-over (F-ACCESS-003, F-SETTINGS-001, F-FAV-001, F-RADAR-001, F-DELIVERY-005, F-LISTING-001) |
| Dependencies | KV-DB-013; Q-DATA-043 |

## Goal

Inside the freeze window only the rows that changed in legacy since the bulk-load watermark `W1` — including deletions
— are extracted, staged and loaded with the same transformation steps, so the window stays within its budget
(≤ 60 minutes proposed, confirmed by R2).

## Legacy reference

- `14` §1.1 P8 (change tracking or a short full re-dump decides the window length), §7.2 (idempotent, restartable),
  §7.6 rows T−1 d (bulk load at `W1`) and T0 + 2 min (final delta after legacy jobs stopped, then erasure replay),
  §7.4 R2 (simulated delta) and R3 (timings).
- `18` §6 (T−24 h bulk load; T0 + 2 min delta; T0 + ≤ 45 min go/no-go).
- Question: Q-DATA-043 (is there `updated_at` on every table, soft deletes, `wal_level` for logical replication).
- Entities: all `migrate` rows of `14` §2 (ENT-001 … ENT-020, ENT-023 … ENT-027, ENT-030, ENT-037, ENT-040).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` and `.claude/skills/laravel-database-optimization/`.
2. Decide the mechanism per table from the KV-DB-001 schema and record it in the task PR:
   (a) `updated_at > W1` plus a key-set diff for deletions (keys present at `W1` and missing now);
   (b) logical replication slot or `pg_dump` of changed partitions if `wal_level = logical` **[PT]** with the owner;
   (c) full re-dump of a table when it is small enough to load inside the budget.
3. `php artisan make:command --no-interaction Migration/ExtractDeltaCommand` (`migration:delta --since=<W1>`):
   writes changed rows into `legacy_stage` with a `delta_run_id`, and deleted keys into a `legacy_stage.deleted_keys`
   table (entity, legacy key); runs `migration_runs.kind = 'delta'` with `legacy_watermark = W2`.
4. Loading: the KV-DB-013 driver re-runs only the steps whose entities have delta rows, in the order of `14` §7.3;
   upserts are already idempotent, so an unchanged row writes nothing.
5. Deletions: for each deleted legacy key the owning step removes the HOMI row (or its link) through the same service a
   user deletion would use (favourite removed, radar deleted, listing → status from legacy, never a hard delete of a
   listing number — numbers stay reserved, BR-DATA-002); each deletion writes `migration_changes`.
6. Erasure replay (KV-DB-027) runs right after the delta load; then the fast validation subset (KV-DB-022).
7. Timing record per step (`step | rows | duration | rows/s | peak DB load`) feeds the window budget in R2 and R3.

## Files

- `backend/app/Console/Commands/Migration/ExtractDeltaCommand.php` (new)
- `backend/app/Services/Migration/DeltaPlan.php` (new; per-entity mechanism a/b/c)
- `backend/database/migrations/<import-connection>/…_create_legacy_stage_deleted_keys_table.php` (new, import database only — see KV-DB-012)
- `backend/tests/Feature/Migration/DeltaExtractionTest.php` (new, `pgsql` group)

## API contract

After the delta load, legacy routes on HOMI answer with the state legacy had at `W2`: a favourite added after `W1`
appears in `GET /api/favorites` (API-029), a radar deleted after `W1` is gone from `GET /api/subscriptions`
(API-018), a settings change is visible in `GET /api/settings` (API-024).

## Business rules

BR-DATA-002 (listing numbers never reused — deletions never free a number), BR-DATA-016 (deliveries made by legacy
after `W1` are included so radars do not re-send), BR-DATA-019, BR-DATA-022 (takedowns after `W1` applied), BR-DATA-031
(erasures replayed after the delta). No DEV.

## Acceptance criteria

- A simulated delta on R2 data (inserts, updates and deletes in every migrated entity) loads within the window budget
  and the full validation suite passes afterwards.
- A delta with zero changes writes zero rows.
- A delivery sent by legacy after `W1` is present in `radar_deliveries` after the delta (re-send dry-run = 0).

## Tests

- `updated row after W1 is reloaded; unchanged row writes nothing`.
- `deleted favourite key removes the HOMI favourite and writes migration_changes`.
- `deleted listing key keeps the number reserved (status from legacy, tombstone if gone)`.
- `delivery logged after W1 is included; dry-run finds no re-send`.
- `takedown after W1 forces taken_down and strips PII`.
- `delta restart after a mid-run failure resumes from the last committed batch`.
- `delta run records W2 and kind=delta in migration_runs`.

## Edge cases

- Tables without `updated_at`: key-set diff plus row checksum comparison, or full re-dump (mechanism c).
- Clock skew between legacy and the watermark: `W1` is taken from the legacy server's clock at dump time and the delta
  overlaps it by a safety margin; idempotent upserts make the overlap harmless.
- A user erased after `W1`: excluded by the erasure replay, never re-imported (V-RI-10).
- Merges done by legacy after `W1`: new alias rows flattened again (V-RI-1).

## Security

SEC-REQ-041 (delta files encrypted, processed only on production-track hosts **[PT]**, destroyed with the dump);
SEC-REQ-039 (erasure replay after the delta); no PII in the delta report.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4), docs and the feature rows in 09
updated, PR reviewed by the other developer. The per-entity mechanism is recorded and the R2 delta timing is inside
the budget.
