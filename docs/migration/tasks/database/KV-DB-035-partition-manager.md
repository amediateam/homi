# KV-DB-035 — Monthly partition manager

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-DELIVERY-005, F-DELIVERY-006, F-ANALYTICS-003. Technical migration task — append-only logs (`bot_listing_messages` in M1, `user_action_log` in M7) are range-partitioned by month and need partitions created ahead |
| Dependencies | KV-QA-001 |

## Goal

One service and one command create monthly range partitions ahead of time for any registered partitioned table, run
by the scheduler on the 25th of every month, so inserts never hit a missing partition; detaching or dropping old
partitions is not done here but only by the explicit retention command of KV-DB-028.

## Legacy reference

- Partitioned logs: ENT-010 delivered-card log (`06:354-380`; `06` §4.2 line 1225, monthly by `sent_at`), ENT-021
  action log (`06:532-550`; line 1236, 180-day retention by dropping partitions).
- `10` §4.9 (monthly partitions for `user_action_log`, `bot_listing_messages`), §4.11 (scheduler entry "create next
  month's partition on the 25th"), `17` §5 ("Partitions: created by migrations and the monthly scheduler task").
- `.ai/agents/postgis-geo-engineer.md` rule 7 (time series partitioned monthly, partitions created ahead,
  `premake = 3` or a scheduled command, retention by partition drop).
- BR-API-125 / BR-DATA-004 (action log 180 days), BR-DATA-016 (delivered log addressable until purge).
- HOMI: `backend/routes/console.php` has no schedule today (`10` §1.3); `listing_views` is deliberately not
  partitioned (KV-DB-010).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 2, 7, 10) and `.claude/skills/laravel-best-practices/`; no
   `pg_partman` (it would be a server dependency needing approval) — a plain PHP command.
2. `php artisan make:class Services/Database/PartitionManager --no-interaction`: `ensure(string $table, int $months =
   3, ?CarbonImmutable $from = null): array` creates `<table>_YYYYMM` partitions `FOR VALUES FROM ('YYYY-MM-01') TO
   (next month)` in UTC for the current month plus N ahead, idempotently (`CREATE TABLE IF NOT EXISTS … PARTITION
   OF …`), copying no indexes by hand (PostgreSQL propagates partitioned indexes); returns created names.
   `list(string $table)` reads `pg_inherits`. Registered tables live in `config/database.php` key
   `partitioned_tables` (`bot_listing_messages` now; `user_action_log` added by M7). On non-pgsql drivers the
   service is a no-op returning `[]`.
3. `php artisan make:command DbPartitionsEnsure --no-interaction` → `db:partitions:ensure {table?} --months=3`:
   without an argument it ensures every registered table; refuses an unregistered table name (no SQL built from
   arbitrary input); prints created partitions.
4. Schedule in `backend/routes/console.php`: `Schedule::command('db:partitions:ensure')->monthlyOn(25, '03:00')
   ->onOneServer()->withoutOverlapping()` (UTC; `10` §4.11), plus a daily run as a cheap safety net (idempotent).
   Announce the new scheduled command in the PR (`parallel-work.md` §8; production cron **[PT]** already runs
   `schedule:run`).
5. KV-DB-009 calls `PartitionManager::ensure('bot_listing_messages')` in its migration `up()` so a fresh database
   has partitions immediately.
6. Pint, PHPStan, tests.

## Files

- `backend/app/Services/Database/PartitionManager.php` (new)
- `backend/app/Console/Commands/DbPartitionsEnsure.php` (new)
- `backend/config/database.php` (`partitioned_tables` key)
- `backend/routes/console.php` (schedule)
- `backend/tests/Feature/Pgsql/PartitionManagerTest.php`, `backend/tests/Feature/Database/PartitionCommandTest.php`

## API contract

n/a — internal maintenance; no endpoint or legacy field changes. It guarantees that delivered-card rows needed for
«Объявление снято» edits (BOT-062) and action-log rows behind `POST /api/events` (API-034, M7) can always be written.

## Business rules

Supports BR-DATA-016 (delivered cards stay addressable) and BR-API-125 / BR-DATA-004 (180-day action log, dropped by
partition in KV-DB-028). No DEV involved.

## Acceptance criteria

- `db:partitions:ensure` on a fresh PostgreSQL database creates partitions for the current month and the next three
  for every registered table; a second run creates nothing.
- An insert dated in the third month ahead succeeds; the scheduler entry exists with `onOneServer()`.
- Passing an unregistered table name exits non-zero without executing SQL.
- On SQLite the command is a no-op and exits zero.

## Tests

- `PartitionManagerTest` (`pgsql`): `it('creates current plus three monthly partitions')`, `it('is idempotent')`,
  `it('creates the right bounds across a year boundary')` (frozen clock at 2026-12-25 → 202612 … 202703),
  `it('routes an insert to its month partition')`.
- `PartitionCommandTest` (SQLite + pgsql): `it('refuses an unregistered table')`, `it('is a no-op on sqlite')`,
  `it('is scheduled monthly on the 25th on one server')` (inspect `Schedule` events).

## Edge cases

- Clock in another time zone: bounds are computed in UTC (`APP_TIMEZONE=UTC`, ADR-0006); the TZ matrix of `15` §3.10
  #11 must give the same names.
- A missed month (scheduler down): the daily safety run and `--months=3` cover a gap of up to three months.
- A partition created manually with a different name: `list()` reports it; `ensure()` does not duplicate the range
  (catches the overlap error and reports it).

## Security

Table names come only from configuration (no SQL injection surface); the command runs under the migration role, not
superuser (rule 9). Retention-related drops are excluded here so no data is deleted by accident (SEC-REQ-038 is
enforced in KV-DB-028).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; reviewed against the
postgis-geo-engineer checklist (rule 7); the new scheduled command announced in the PR.
