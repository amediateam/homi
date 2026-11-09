# KV-INF-007 — Scheduler foundation and heartbeat

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: development) |
| Complexity | S |
| Feature IDs | Technical migration task — GAP-022: the scheduler every purge, digest, quiet-hours release and data job depends on (F-DELIVERY-003, F-DELIVERY-004, F-PRIVACY-003, F-PIPELINE-007 through their own tasks) |
| Dependencies | —; related: cron on servers is KV-INF-022, the missing-heartbeat alert is KV-INF-025 |
## Goal

`routes/console.php` gets the conventions every scheduled task must follow (`onOneServer()`, `withoutOverlapping()`,
explicit `timezone('Asia/Tashkent')` for wall-clock tasks), a one-minute heartbeat, and a test that enforces the
conventions; `make dev-start` runs `schedule:work` locally so digests and purges can be watched on a laptop.

## Legacy reference

- Legacy scheduled behaviour: digests at 09/12/19/20 Tashkent, quiet-hours release, purges at 90 and 180 days, landing
  data at 02:02 and 15:00 (`04` §5, BR-BOT-077, BR-BOT-078, BR-BOT-086, BR-BOT-093; `10` §4.11).
- HOMI today: `routes/console.php` defines only `inspire`; the `telegram_updates` prune is not scheduled
  (`10` §1.3 row Scheduler; `backend/routes/console.php:6-8`).
- Cron and heartbeat on servers: `17` §10; alert "missing heartbeat for 5 min" `17` §12.

## Implementation

1. `php artisan make:command Ops/SchedulerHeartbeat --no-interaction` (`ops:heartbeat`): writes the current UTC time
   to the cache key `ops:scheduler:heartbeat` and, when `OPS_HEARTBEAT_URL` is set (new env name, blank locally),
   pings it with a 3-second timeout; failures are logged at `warning`, never thrown.
2. `routes/console.php`: remove `inspire`; schedule `ops:heartbeat` every minute; add a short comment block naming the
   conventions; leave the business tasks to their own KV tasks (for example KV-TG-003 adds the `telegram_updates`
   prune, KV-TG-052 the quiet-hours release).
3. `tests/Feature/Ops/ScheduleConventionsTest.php`: iterate `Schedule::events()` and assert every event except the
   heartbeat uses `onOneServer` and `withoutOverlapping`, and every event whose expression has a fixed hour declares a
   timezone (`Asia/Tashkent`).
4. `scripts/dev/services.sh`: add a `scheduler` service running `php artisan schedule:work` (log
   `infra/local/logs/scheduler.log`); `make dev-status` shows it.
5. `scripts/dev/check.sh`: WARN when the heartbeat cache key is older than 3 minutes while the scheduler service runs.
6. `.env.example`: `OPS_HEARTBEAT_URL=` (shared file, separate PR; KV-INF-003 lists it).

## Files

- `backend/routes/console.php`, `backend/app/Console/Commands/Ops/SchedulerHeartbeat.php` (new)
- `backend/tests/Feature/Ops/ScheduleConventionsTest.php` (new)
- `scripts/dev/services.sh`, `scripts/dev/check.sh`, `backend/.env.example` (changed)

## API contract

Outbound only: `GET <OPS_HEARTBEAT_URL>` once a minute when configured (the monitor of KV-INF-025 defines the URL).

## Business rules

Business times are Asia/Tashkent while the server clock stays UTC (BR-API-150, ADR-0006); the convention test makes
this mechanical for BR-BOT-077, BR-BOT-078 and the retention rules.

## Acceptance criteria

- `php artisan schedule:list` shows `ops:heartbeat` every minute with `onOneServer`.
- A scheduled event without `onOneServer` added in a test branch makes `ScheduleConventionsTest` fail.
- `make dev-start` starts the scheduler; `make dev-check` reports a fresh heartbeat.
- `make ci-backend` exits 0.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `ScheduleConventionsTest` with a fixture event `->dailyAt('09:00')` and no timezone | fails |
| 2 | `ops:heartbeat` with `OPS_HEARTBEAT_URL` faked (`Http::fake`) | one GET, cache key set |
| 3 | `ops:heartbeat` with the URL answering 500 | exit 0, one warning log line |
| 4 | `make dev-check` after stopping the scheduler for 4 minutes | WARN line |

## Edge cases

- Daylight saving does not exist in Asia/Tashkent; the timezone is still explicit so a server timezone change cannot
  shift digests.
- `onOneServer` needs a cache store with locks — Redis (ADR-0005); the test suite's array store supports locks.
- `schedule:work` locally and a cron on a server never run against the same Redis (ADR-0011).

## Security

`OPS_HEARTBEAT_URL` may contain a token of the monitor: treated as a secret name in KV-INF-004's inventory, never
logged (the warning logs the status code only).

## Definition of done

Tests green (`make ci-backend`), the convention documented in `docs/infrastructure/local-development.md` and announced
to the production track (the server cron is KV-INF-022), PR reviewed by the other developer.
