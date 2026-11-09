# KV-INF-022 — Scheduler cron and heartbeat on staging and production

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | S |
| Feature IDs | Technical migration task — GAP-022 on servers: digests, quiet-hours release, purges and data jobs (F-DELIVERY-003, F-DELIVERY-004, F-PRIVACY-003, F-PIPELINE-007) run only if the scheduler runs |
| Dependencies | KV-INF-007 (heartbeat command and conventions), KV-INF-015 (app user and release layout), KV-INF-019 (Redis for `onOneServer` locks); stage S0/S1 (`18` §2), `17` §10; related: the monitor URL is configured in KV-INF-025 |
## Goal

Exactly one `schedule:run` cron entry per environment, on one host, as the application user, with the heartbeat of
KV-INF-007 pinging the monitor every minute, so that a stopped scheduler is noticed within five minutes — before the
first digest hour after any deploy.

## Legacy reference

- Scheduled behaviour HOMI must reproduce: digests at 09/12/19/20 Asia/Tashkent and the morning release after quiet
  hours (BOT-082, BOT-083, BR-BOT-077, BR-BOT-078), retention purges (BR-BOT-086, BR-BOT-093), landing data at 02:02
  and 15:00 (`10` §4.11).
- `17` §10 (one cron entry, `onOneServer()`, heartbeat), `17` §12 row "Scheduler" (missing heartbeat 5 min; any task
  failing twice), `18` §10 (watch the first digest hour after GO and the next morning's quiet-hours release).

## Implementation

1. On the staging host (and later production): `* * * * * cd <current release> && php artisan schedule:run >> /dev/null 2>&1`
   as the application user — in the user's crontab or a systemd timer (first developer's choice, ADR-0013 conventions).
   The path uses the `current` symlink so a release switch needs no cron change.
2. Server `.env`: `OPS_HEARTBEAT_URL` pointing at the monitor's push endpoint (value in the vault), `APP_TIMEZONE=UTC`
   unchanged (business times come from `->timezone('Asia/Tashkent')` in the code).
3. Monitor: an alert when no heartbeat arrives for 5 minutes, routed to the operations chat (KV-INF-025).
4. Deploy (KV-INF-023): `php artisan schedule:interrupt` after the symlink switch so a long-running task of the old
   release stops cleanly; `horizon:terminate` as already planned.
5. Production: the same, enabled only after the first production deploy; the cron is **off** during the S2 freeze
   window until GO (`18` §6: legacy jobs stopped, HOMI's scheduler must not start digests before the data is loaded);
   the runbook (KV-INF-030) has the enable step.

## Files

- `infra/staging/cron/homi.cron`, `infra/production/cron/homi.cron` (or systemd timer units under `infra/*/systemd/`) — production-owned
- `docs/infrastructure/deployment.md` section "Scheduler" (production-owned)

## API contract

Outbound only: the heartbeat ping of KV-INF-007 to `OPS_HEARTBEAT_URL`.

## Business rules

BR-API-150 (business time Asia/Tashkent) is kept by the code; the server clock stays UTC so storage and logs agree
(ADR-0006).

## Acceptance criteria

- `php artisan schedule:list` on staging shows the tasks of the merged features; `crontab -l` (or `systemctl
  list-timers`) shows exactly one HOMI entry.
- The monitor receives a heartbeat every minute; stopping cron for 6 minutes fires the alert.
- After a deploy, the next heartbeat comes from the new release (log line with the release id).
- Production cron stays disabled until the runbook's GO step and is enabled by it.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `crontab -l -u <app user> \| grep -c schedule:run` on staging | `1` |
| 2 | disable the entry for 6 minutes (staging) | heartbeat alert in the operations chat |
| 3 | `php artisan schedule:test --name=ops:heartbeat` | exit 0 |
| 4 | deploy a release, wait 2 minutes | heartbeat continues; `schedule:interrupt` logged |
| 5 | frozen-time check on staging: digest job ran at 09:00 Asia/Tashkent (04:00 UTC) | job log line at 04:00 UTC |

## Edge cases

- Two hosts later (DEC-28): `onOneServer()` with the shared Redis keeps single execution; only then may a second cron
  entry exist.
- A task that overruns a minute: `withoutOverlapping()` (KV-INF-007 convention) prevents pile-ups.
- Redis flush during maintenance clears scheduler mutexes; harmless.

## Security

The cron runs as the unprivileged app user, never root; `OPS_HEARTBEAT_URL` may embed a token and is a vault secret
(SEC-REQ-034); output is discarded, logs go through the application's redacting logger (SEC-REQ-047).

## Definition of done

Staging scheduler running with the heartbeat alert proven, production entry prepared and referenced by the S2 runbook,
`17` §15 item 6 (scheduler part) ticked by the first developer.
