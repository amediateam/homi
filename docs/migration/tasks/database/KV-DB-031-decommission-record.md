# KV-DB-031 — Decommission and destruction record

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (rollback window) |
| Owner | DevOps (track: production) with the product owner |
| Complexity | S |
| Feature IDs | Technical migration task — closes the personal-data obligations of the migration (F-PRIVACY-002, F-PRIVACY-003) |
| Dependencies | KV-DB-026; Q-DATA-044 |

## Goal

At the end of the rollback window (S3) every legacy and migration copy of personal data — legacy database, final dump,
rehearsal databases, the import database, transfer buckets and media copies — is destroyed, the legacy operator confirms
that legacy backups aged out, and a dated destruction record without personal data is committed.

## Legacy reference

- `14` §7.9 "Decommissioning" (destroy and record; legacy backups age out in about two weeks — the owner confirms,
  Q-DATA-044), §7.5 (final dump kept encrypted and immutable until the rollback window closes), §1.2 (isolation and
  destruction of rehearsal copies).
- `18` §2 row S3, §7 (decommissioning is a one-way door), §11 items 1–6 (legacy stopped, copies destroyed, legacy
  secrets rotated or revoked, owner hashes expire on their own window, support bot per DEC-21, records kept).
- Rules: BR-DATA-031, BR-API-129 (backups ≈ 2 weeks); decisions DEC-18 (rollback window 72 h proposed), DEC-21;
  questions Q-DATA-044, Q-SEC-001, Q-SEC-011.

## Implementation

1. **[PT]** Confirm with the product owner that the rollback window is closed (`18` §10, GO + 72 h review) and that the
   SEO contingency of DEC-15 has ended, if it was used.
2. **[PT]** Inventory every copy from the run registry (`migration_runs.dump_sha256`, rehearsal records of KV-DB-024 and
   KV-DB-025): import database, `legacy_raw`/`legacy_stage` schemas, dump files, staging bucket `homi-tmp` transfer
   prefixes, photo manifests, delta files, rollback exports.
3. **[PT]** Destroy each copy with the method fitting the storage (drop database and remove its data directory, object
   deletion with versioning purge, secure delete of files); record date, method, operator and the SHA-256 of the
   destroyed dump.
4. Legacy operator: stops the legacy backend and bot receiver, destroys the legacy database and media store, confirms in
   writing when legacy backups have aged out; rotates or revokes the secrets listed in `18` §11 item 3 **[PT]** with
   the product owner.
5. Write `docs/migration/decommission-record.md`: one row per copy (location class, not hostnames with credentials;
   destroyed at; method; by role), plus the owner's backup confirmation date — no personal data, no secret values.
6. Remove the `LEGACY_IMPORT_DB_*` keys from the production environment **[PT]** and the import connection from the
   deployed configuration (application change in a small PR by the development track).
7. Keep the records listed in `18` §11 item 6 (frozen spec, artefact manifests, SEO archive).

## Files

- `docs/migration/decommission-record.md` (new)
- `backend/config/database.php` (remove the `legacy_import` connection; small follow-up PR)
- `backend/.env.example` (remove `LEGACY_IMPORT_DB_*`; separate shared-file PR)

## API contract

n/a — operational task; no endpoint changes.

## Business rules

BR-DATA-031 and BR-API-129 (deletion promise including backups), BR-API-132 (the public `/privacy` promise holds after
the migration).

## Acceptance criteria

- The destruction record lists every copy in the inventory with a date, method and role; none is missing.
- The legacy operator's confirmation that backups aged out is recorded with its date.
- The import database and its credentials no longer exist in any environment.

## Tests

- A configuration test fails if the `legacy_import` connection or `LEGACY_IMPORT_DB_*` keys are still referenced after
  the removal PR.
- Checklist review: the inventory from the run registry equals the list in the record (performed by the developer).

## Edge cases

- An erasure request arrives during the window: it also covers the retained dump (destroy early or delete the subject,
  `14` §7.9) — recorded in the same file.
- The rollback window is extended by the product owner: the record waits; nothing is destroyed early except on an
  erasure request.
- A copy cannot be destroyed (provider retention): record the retention end date and re-check.

## Security

SEC-REQ-041 (dump handling record and destruction), SEC-REQ-038 (backups ≤ 14 days), SEC-REQ-034 (legacy-held secrets
rotated), SEC-REQ-050 (records as compliance evidence); the record holds no personal data or secret values.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR reviewed
by the other developer. Destruction record committed and countersigned by the product owner.
