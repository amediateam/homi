# KV-DB-001 — Obtain the legacy schema and counts

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy DB not available, Q-SYS-002) |
| Owner | DevOps (track: production) with the product owner |
| Complexity | S |
| Feature IDs | Technical migration task — every mapping, transformation rule and validation baseline of `14` depends on the real legacy schema (`14` §1.1 P1, P2). Unblocks the data of F-ACCESS-003, F-SETTINGS-001, F-RADAR-002, F-DELIVERY-005, F-FAV-001, F-HIDE-003, F-LISTING-001, F-MEDIA-001 |
| Dependencies | Q-DATA-001, Q-DATA-002 (product owner) |

## Goal

A redacted copy of the legacy PostgreSQL schema (DDL, sequences, extensions) and the row counts and sizes per table,
measured twice a week apart, are committed under `docs/migration/data/legacy-schema/`, and `06` gains a legacy-table
column in its entity index — so every `<legacy_…>` placeholder of `14` can be replaced by a real table.

## Legacy reference

- The legacy backend source and database are not available (`README.md` "Sources"; Q-SYS-002); the stack is
  Python/FastAPI + PostgreSQL/PostGIS 3.5.2 (`$KVADRO_ROOT/docs/about.md:396`, §3).
- Migration notes of the legacy owner: `$KVADRO_ROOT/docs/about.md:425-440` (what must migrate: users and settings,
  radars, favourites, history, hidden, votes, owner hashes, attribution, delivered-card log, PostHog id map, listing ids).
- Questions closed by this task: Q-DATA-001 (schema), Q-DATA-002 (counts, sizes, growth) in `06` §6; they feed
  Q-DATA-006 … Q-DATA-049 (one per entity, ENT-001 … ENT-059).
- Blockers: `14` §1.1 P1 (schema), P2 (counts — capacity, timing, validation baselines), P6 (schema freeze, Q-SYS-005).

## Implementation

1. Read `14` §1, `06` §1.3 ("what upgrades this document") and `.ai/agents/security-reviewer.md` (handling rules).
2. Write the request to the product owner (through the first developer): `pg_dump --schema-only --no-owner
   --no-privileges` of the legacy database, the output of `\dx` (extensions with versions), the sequences with their
   `last_value`, and `SHOW TimeZone` / `SHOW server_encoding` (also closes Q-DATA-035, Q-DATA-036 if answered).
3. Request the counts query of Q-DATA-002 (`select relname, n_live_tup, pg_total_relation_size(relid) from
   pg_stat_user_tables order by 3 desc;`) run twice, one week apart, so growth per day is known (sizes the number-gap of
   `14` §3 and the freeze window of `14` §7.4).
4. **[PT]** Receive the files through the agreed channel (KV-DB-003 decides it); they contain no rows. Remove anything
   that is not structure (default values containing secrets, function bodies with credentials, role names) before
   committing; keep a note of what was removed.
5. Commit `docs/migration/data/legacy-schema/schema.sql` (redacted), `extensions.txt`, `counts-<date>.csv` (two runs) and
   a `README.md` naming the source, date, redactions and who received the files.
6. Add a "Legacy table" column to the entity index of `06` §2.0 and mark each ENT row `CONFIRMED` where the schema proves
   it; open new `Q-DATA-…` rows for tables that match no entity.
7. Replace the `<legacy_…>` placeholders in `14` §4 and §6 by real names in a follow-up docs PR.

## Files

- `docs/migration/data/legacy-schema/{schema.sql,extensions.txt,counts-<date>.csv,README.md}` (new)
- `docs/migration/06-database-schema.md` (index column, status upgrades), `docs/migration/14-data-migration-plan.md`
  (placeholders) — follow-up docs PR

## API contract

n/a — no endpoint; the schema only explains how the legacy API outputs of `08` were produced.

## Business rules

None implemented. The task confirms or refutes the stored shape behind BR-DATA-001 (Telegram id as key), BR-DATA-002
(integer listing ids, sequence), BR-DATA-019 (merged-id storage) and BR-DATA-020 (publication key).

## Acceptance criteria

- The schema file loads into an empty PostgreSQL 18 + PostGIS database without errors (`psql -f`), proving it is
  complete.
- Every legacy table appears in `06` §2.0 with an ENT id or a new `Q-DATA-…` row.
- Two count snapshots a week apart exist; growth per day per table is stated in the README.
- No row data, credential, role password or personal identifier is in the committed files.

## Tests

- Manual check recorded in the README: `createdb legacy_schema_check && psql -d legacy_schema_check -f schema.sql`
  exits 0 on a local PostGIS database, then the database is dropped.
- `grep` over the committed files for phone patterns (`\+?998\d{9}`), long digit runs and `password` returns nothing.

## Edge cases

- The owner can share only part of the schema (e.g. no gazetteer): commit what arrives, mark the missing entities
  `UNVERIFIED` and keep Q-DATA-028 open.
- The legacy schema changes before the freeze (P6, the 2026-11-06 `zone` change shows it happens): repeat the export at
  the freeze date and diff.
- PostGIS objects (`geometry_columns`) or custom types that need extensions HOMI does not have: list them in the README.

## Security

- SEC-REQ-041: structure only; no dump with rows reaches the repository, CI artefacts or a developer laptop.
- Function bodies and defaults are reviewed for embedded secrets before commit (SEC-REQ-034: legacy secrets are never
  imported).
- No Telegram ids, phones or texts in the counts file (table names and numbers only).

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: the files and README committed, `06` updated with
the confirmed facts and Q-DATA-001 / Q-DATA-002 marked closed in `06` §6.
