# KV-INF-026 — Backups and restore drills

| Field | Value |
| ----- | ----- |
| Status | TODO (retention value from DEC-12) |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | M |
| Feature IDs | F-PRIVACY-002, F-PRIVACY-003 (backups must forget deleted users within the promised window) |
| Dependencies | DEC-12 (retention and deletion ADR incl. backups), Q-SEC-011 (legacy backups), Q-SEC-005 (hosting location); KV-INF-018 (the shared PostgreSQL server), KV-INF-020 (buckets); stage S1 exit (`17` §15 item 9), `18` §5.1 Operations, `14` §7.5 |

## Goal

PostgreSQL of staging and production is backed up with continuous WAL archiving and point-in-time recovery, object
storage is versioned, **nothing older than 14 days survives in any backup** (the public promise «из резервных копий —
примерно через две недели»), and a timed restore drill succeeds monthly and before R2, R3 and S2.

## Legacy reference

- Promise: data deleted from the bot DB at once, from backups in about two weeks (BR-BOT-094, TXT-BOT-083,
  `$KVADRO_ROOT/docs/about.md` §5.11); listing PII erased after 90 days (BR-BOT-093) — photo versions must not outlive it.
- `17` §13 (pgBackRest + WAL into a private versioned MinIO bucket, off-host copy, 14-day expiry, object versions
  expired within 14 days, monthly drills, GO requires a drill ≤ 7 days old), `14` §7.5, SEC-019, SEC-REQ-038.

## Implementation

1. pgBackRest on the database host (`5.45.127.98`, ADR-0011) for `homi_staging_db` and `homi_db`: weekly full,
   daily differential, continuous WAL to a private versioned bucket; repository encrypted (key in the vault); an
   off-host copy on a second controlled host in the approved jurisdiction (Q-SEC-005) — never a personal device.
2. Retention: `repo1-retention-full` / `-diff` and WAL expiry set so that no backup or WAL segment older than 14 days
   exists (the exact setting depends on the full-backup cadence — documented with the arithmetic in
   `backup-recovery.md`).
3. Object storage: versioning on `homi-private` (and staging), lifecycle rule expiring non-current versions after
   ≤ 14 days; `homi-tmp` lifecycle 24 h (already planned).
4. Restore drill script `infra/server/restore-drill.sh`: restore the latest production backup to an isolated database
   on the staging server (not reachable by the staging app), run row counts and a checksum query, record duration and
   result in `docs/infrastructure/backup-recovery.md` (no data, only numbers), destroy the restored copy.
5. Exporter for KV-INF-025: last successful backup time and WAL archive lag as metrics.
6. Redis is not backed up (ADR-0005).

## Files

- `infra/server/pgbackrest/*.conf`, `infra/server/restore-drill.sh` (new, production-owned)
- `docs/infrastructure/backup-recovery.md` (new, production-owned)

## API contract

n/a — server operations.

## Business rules

BR-BOT-094 (≈ 2 weeks in backups), BR-BOT-093 (90-day PII erase also in object versions), BR-BOT-085 (what is stored at
all); a longer retention needs a changed privacy text first (`17` §13).

## Acceptance criteria

- `pgbackrest info` shows no backup and no WAL older than 14 days on both repositories.
- A restore drill completes with recorded duration, row counts equal to the source at the restore point, and the copy
  destroyed afterwards.
- A user erased on staging at day 0 is absent from every backup restorable after day 14 (tested once with a synthetic
  user).
- Backup-age and WAL-lag alerts exist (KV-INF-025).

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `pgbackrest --stanza=homi_staging_db info` | oldest backup ≤ 14 days |
| 2 | `infra/server/restore-drill.sh staging` | exit 0, duration recorded |
| 3 | synthetic user created, erased via the bot flow (KV-TG-049) on staging, restore at day 15 | no row for the user |
| 4 | `mc ilm rule ls <alias>/homi-staging-private` | non-current expiry ≤ 14 days |
| 5 | stop WAL archiving for 20 min (staging drill) | WAL-lag alert |

## Edge cases

- The 14-day limit means PITR beyond two weeks is impossible — accepted by the privacy promise; recorded in DEC-12.
- During the S2 window, the legacy dump and rehearsal copies follow `14` §1.2 and §7.9, not this policy (KV-INF-028,
  KV-INF-033).
- Erasure replay after a restore: a restored backup may contain users erased after its timestamp; the erasure ledger of
  SEC-REQ-039 is replayed after every real restore (runbook step).

## Security

SEC-019, SEC-REQ-038, SEC-REQ-041; encrypted repositories, keys in the vault, access limited to the production track.

## Definition of done

Backups running on staging and production, the first drill recorded, `17` §15 item 9 ticked by the first developer,
the restore-after-erasure check recorded, `backup-recovery.md` written.
