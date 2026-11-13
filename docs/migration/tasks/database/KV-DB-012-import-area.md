# KV-DB-012 — Import area

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (KV-DB-001, KV-DB-003) |
| Owner | DevOps (track: production) |
| Complexity | M |
| Feature IDs | Technical migration task — every load step reads the legacy data from an isolated import database, never from the HOMI application database (`14` §1.2, §7.1). Unblocks the loads of F-ACCESS-003, F-SETTINGS-001, F-RADAR-001, F-DELIVERY-005, F-FAV-001, F-LISTING-001, F-MEDIA-001 |
| Dependencies | KV-DB-001, KV-DB-003 |

## Goal

A separate PostgreSQL 18 + PostGIS database (not `homi_staging_db` / `homi_db`) on the HOMI database host holds the
schemas `legacy_raw` (the restored, encrypted-in-transit dump) and `legacy_stage` (typed, profiled, alias-resolved
copies), with a read-only role used by the migration commands, an audited access list and a restore script; a dump
restores on staging with that role.

## Legacy reference

- `14` §1.2 (isolation, encryption, minimum necessary, no PII in logs), §7.1 (tooling: separate import database, second
  read-only connection), §7.5 (backups: the final dump kept encrypted and immutable until the rollback window closes),
  §7.9 (destruction).
- `17` §5 (import database row), §4 (`LEGACY_IMPORT_DB_HOST`, `_PORT`, `_DATABASE`, `_USERNAME`, `_PASSWORD`).
- Blockers: `14` §1.1 P1 (schema), P4 (handling agreement), P5 (legal basis) — KV-DB-001, KV-DB-003.
- Legacy dump format: PostgreSQL + PostGIS 3.5.2 (`$KVADRO_ROOT/docs/about.md:396`); migration notes
  `$KVADRO_ROOT/docs/about.md:425-440`.

## Implementation

1. Read `14` §1.2, §7, `17` §5, `.ai/agents/postgis-geo-engineer.md` (rule 9 backups) and
   `.ai/agents/security-reviewer.md`.
2. **[PT]** Create the database `homi_legacy_import` on the staging database host (and later on production for the
   final run), PostGIS at the legacy major version, schemas `legacy_raw`, `legacy_stage`; roles `legacy_loader`
   (restore, owns `legacy_raw`), `legacy_stager` (writes `legacy_stage` only), `legacy_reader` (SELECT on `legacy_stage`
   only — the role the Laravel `legacy_import` connection uses).
3. **[PT]** Encryption: the dump arrives GPG-encrypted (or over the replica channel agreed in KV-DB-003); its SHA-256 is
   recorded before decryption; decrypted only on the database host into a tmpfs or an encrypted volume; the encrypted
   file is kept immutable until KV-DB-031.
4. **[PT]** `scripts/migration/restore-legacy-dump.sh` (repository, no secrets): verifies the checksum, restores into
   `legacy_raw` with `pg_restore --no-owner --role=legacy_loader`, applies the extract-time exclusions of `14` §4.1
   (erasure list, PII of listings withdrawn > 90 days, takedowns) while copying into `legacy_stage`, and prints counts.
5. Development track: add the second connection `legacy_import` to `backend/config/database.php` reading
   `LEGACY_IMPORT_DB_*` (blank in `.env.example`, shared-file PR), `read_only` enforced by role and by
   `SET default_transaction_read_only = on` in the connection options.
6. **[PT]** Access audit: `log_connections` and `pgaudit`-style statement logging are not added as packages — use
   PostgreSQL `log_statement = 'ddl'` and connection logging for this database; the access list (names of roles, not
   people) goes into `docs/migration/data/import-area.md`.
7. Document the destruction procedure (drop database, shred the decrypted files, keep the destruction record for
   KV-DB-031) in the same file.

## Files

- `scripts/migration/restore-legacy-dump.sh` (new; parameters only, no hosts or credentials)
- `backend/config/database.php` (connection `legacy_import`), `backend/.env.example` (blank `LEGACY_IMPORT_DB_*`, separate
  PR)
- `docs/migration/data/import-area.md` (new: roles, access rules, restore and destruction steps)

## API contract

n/a — infrastructure for the load tasks.

## Business rules

BR-DATA-006 (90-day erase applied at extract), BR-DATA-022 (takedowns as stubs), BR-DATA-031 (erasures done on legacy
excluded at extract, `14` §7.9).

## Acceptance criteria

- A dump (first a schema-only file from KV-DB-001 plus synthetic rows, then the real one) restores on staging with the
  script; the checksum is verified before restore.
- The `legacy_reader` role cannot write (`INSERT` fails) and cannot read `legacy_raw`.
- The HOMI application role has no access to `homi_legacy_import`.
- `php artisan tinker` on staging can `DB::connection('legacy_import')->select('select 1')`; a write through that
  connection fails.
- `import-area.md` lists roles, the audit settings and the destruction steps.

## Tests

- `backend/tests/Feature/Migration/LegacyImportConnectionTest.php` (`pgsql` group, KV-QA-001): with a local
  `legacy_import` database created by the test setup, a write through the connection throws; `default_transaction_read_only`
  is `on`.
- Script dry-run on a synthetic dump in CI is not done (no dumps in CI); a local run on synthetic data is recorded in
  the PR.

## Edge cases

- The legacy PostGIS version is newer or older than HOMI's: restore into the import database at the legacy major
  version; only `legacy_stage` (plain types + PostGIS geometry) is read by HOMI.
- A restore fails half-way: the script drops and recreates `legacy_raw`; `legacy_stage` is rebuilt from scratch.
- Dump larger than the free disk on the database host: size it from KV-DB-001 counts before R1.

## Security

- SEC-REQ-041: production data only on production-track infrastructure; never in the repository, CI artefacts, agent
  context or laptops; destruction recorded (KV-DB-031).
- SEC-REQ-034: import credentials exist only on the host running the import; agents never see them.
- No PII in logs: statement logging limited to DDL; the restore script prints counts only.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: a restore with the read-only role demonstrated on
staging, `import-area.md` reviewed by the development track, `14` §7.1 updated with the confirmed facts.
