# KV-INF-028 — Staging rehearsal environment and reset

| Field | Value |
| ----- | ----- |
| Status | TODO (production data on staging needs the legal basis DEC-13 / `14` P4, P5) |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | M |
| Feature IDs | Technical migration task — rehearsals R1–R3 (`14` §7.4, `18` §4) are the evidence for the S1 exit and the S2 GO; they exercise every P0 feature with migrated data |
| Dependencies | KV-INF-016, KV-INF-017 (staging hosts and bot), KV-INF-026 (restore drill), KV-INF-023 (deploys); KV-DB-012 (import area), KV-DB-024, KV-DB-025 (rehearsals, `14` §8); DEC-13 |

## Goal

Staging can be reset to a known state, loaded with a rehearsal dataset (R0 masked sample, then the real dump under the
`14` §1.2 controls), run through a rehearsal with the staging bot and the frozen legacy artefacts, timed, and wiped
afterwards — repeatably, within a day.

## Legacy reference

- Rehearsals R0–R3 (`14` §7.4), release additions R1–R3 (`18` §4: artefacts on `kvadro-app.staging.homi.uz`, switch
  rehearsal with `deleteWebhook`, `/revoke`, `setWebhook drop_pending_updates=false`, buffered updates, rollback before
  the point of no return); data controls `14` §1.2 (P4, P5), §7.1 (import database), §7.9 (destruction).
- SEC-REQ-041 (the dump only on production-track infrastructure, never on laptops or in agent context).

## Implementation

1. `infra/server/staging-reset.sh` (production-owned): pause Horizon and the scheduler, drop and recreate
   `homi_staging_db` (with PostGIS), run migrations, empty the staging buckets' listing-photo prefixes, flush the staging
   Redis, clear `telegram_updates`, re-enable services; logs each step with timing.
2. Import side (KV-DB-012): a separate database on the database host with `legacy_raw` / `legacy_stage` and a read-only
   role for the migration commands; reachable only from the staging app host; encrypted dump transfer channel from the
   legacy operator (`14` P4).
3. Rehearsal checklist `infra/staging/rehearsal-checklist.md`: before (restore drill ≤ 7 days, artefacts manifest
   match, staging bot webhook set by KV-INF-017), during (step timings per `18` §6 as rehearsed with the staging bot,
   pending-update behaviour across `/revoke` recorded — the R2 question of `18` §4), after (validation report of
   KV-DB-022 archived without data, destruction of the dump copy and the staging data with a dated record).
4. Staging bot token for R2: a revocable test of `/revoke` on the **staging** bot only (bot owner = production
   track's team account); production is never touched in rehearsals.
5. Access: only the production track and the migration commands touch rehearsal data; the development track sees
   reports, not data (SEC-REQ-041).

## Files

- `infra/server/staging-reset.sh`, `infra/staging/rehearsal-checklist.md` (new, production-owned)
- `docs/infrastructure/deployment.md` section "Rehearsals" (production-owned)

## API contract

n/a — operations; the staging bot's Bot API calls are those of KV-INF-017 and the runbook (KV-INF-030).

## Business rules

The migration's zero-tolerance checks (`14` §6.6) and the re-send dry-run (zero rows) are the rehearsal exit; the
rehearsal must not send messages to real users — the staging bot has only test accounts (production data's chat ids
belong to `@KvadroAppBot` and cannot be messaged by the staging bot anyway; delivery send cap stays 0 during data
rehearsals except for the test cohort).

## Acceptance criteria

- `staging-reset.sh` brings staging to an empty migrated schema in ≤ 30 minutes, timed.
- R1 runs end-to-end with the masked sample; R2 and R3 with the real dump under the controls; each leaves a dated
  destruction record.
- The pending-updates-across-revocation result is recorded (decides the order of `18` §6 T0.3).
- No rehearsal data exists on staging 24 hours after a rehearsal ends.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `infra/server/staging-reset.sh` | exit 0, timings logged |
| 2 | after reset: `select count(*) from users` on staging | 0 |
| 3 | R2 switch rehearsal with the staging bot | buffered updates processed exactly once (KV-TG-060 drain report) |
| 4 | 24 h after R3: dump file and import database | absent; record dated |
| 5 | delivery send cap during data load (`delivery:cap` of KV-TG-060) | 0 |

## Edge cases

- A rehearsal fails midway: reset and restart; partial data is destroyed like complete data.
- The legacy operator delivers a new dump format: KV-DB tasks adapt; this task only provides the environment.
- Staging users for manual checks are synthetic test accounts with owner approval (`15` §5.3).

## Security

SEC-REQ-041, SEC-019 (no copies on personal devices), `14` §1.2; access audited by the database host logs.

## Definition of done

Reset and rehearsal checklist used for R1, timings recorded, destruction records kept, `18` §4 rehearsal rows marked
ready by the first developer.
