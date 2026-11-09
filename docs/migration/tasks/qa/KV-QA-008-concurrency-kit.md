# KV-QA-008 — Concurrency and idempotency kit

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | M |
| Feature IDs | F-FAV-001, F-RADAR-002, F-REPORT-003, F-HIDE-001, F-BOT-012, F-DELIVERY-005 |
| Dependencies | KV-QA-001 |

## Goal

Race and duplicate-request tests can be written deterministically on PostgreSQL: one helper interleaves two database
connections step by step, another fires bursts of parallel HTTP requests at a locally served app. Both use only tools
that are already installed.

## Legacy reference

- Duplicate and race risks: LB-API-037 (→ DEV-009), LB-API-039, LB-API-043 (defect fixes, `09` §4.3), LB-API-013
  (`409 no_chat` repeat), Q-API-034, Q-API-038.
- Requirements: SEC-REQ-009 (update dedup under concurrency), SEC-REQ-015 (idempotent, race-safe per-user writes; 10
  concurrent creates → 1 radar; 20 creates at 9 → 10).
- Cases: `15` §3.4–§3.6.

## Implementation

1. Read `.claude/skills/laravel-database-optimization/`, `.claude/skills/laravel-testing/`, `15` §3.6.
2. `backend/tests/Support/Concurrency/Interleave.php`: clones the default `pgsql` connection config as `pgsql_b`;
   `Interleave::steps([...])` runs closures on connection A or B in the given order, each step in its own statement;
   B's statements run with `SET lock_timeout = '200ms'` so "B is blocked" is asserted through a lock-timeout error,
   never through `sleep()`.
3. `backend/tests/Support/Concurrency/Burst.php`: starts the app with `Process::start()` as
   `php -S 127.0.0.1:<free port> -t public` (port found by binding to port 0; never `php artisan serve`, never ports
   8000/8001) with environment pointing at the PostgreSQL test database and the synthetic Telegram secrets; waits for
   `/up`; sends N requests through `Process::pool()` with `curl` (`-w '%{http_code}'`), collects statuses and bodies;
   stops the server in `finally`.
4. Tests in `backend/tests/Feature/Pgsql/Concurrency/` use `DatabaseTruncation` (an open test transaction would hide
   rows from the second connection or process).
5. Validate the kit before any domain code exists: a test-only table `qa_counters` created in the test; with
   `Interleave` show the classic lost update (A reads, B reads, A writes, B writes) and show that `lockForUpdate()` turns
   B's read into a lock timeout; show a unique-index violation for two inserts. Validate `Burst` with 50 requests to
   `/up` (all `200`) and record the run time.
6. Add the rows of `15` §3.6 and the concurrent rows of §3.3–§3.4 as `todo` tests named after their feature and case
   number, to be enabled by the backend and bot tasks.

## Files

- `backend/tests/Support/Concurrency/{Interleave,Burst}.php` (new)
- `backend/tests/Feature/Pgsql/Concurrency/{KitSelfTest,RaceCasesTest}.php` (new)

## API contract

n/a (test support). Burst tests call the legacy routes exactly as the contract harness does (KV-QA-004 client
helpers for headers).

## Business rules

The tests it enables check SEC-REQ-015, SEC-REQ-009, BR-DATA-017.

## Acceptance criteria

- `KitSelfTest` demonstrates the lost update without a lock and the lock timeout with it, deterministically (100
  consecutive runs green, recorded in the PR).
- `Burst` starts and stops the server cleanly even when a test fails (no orphan process; checked with `pgrep` in the
  self-test).
- The `todo` list covers every row of `15` §3.6 and the concurrent cases of §3.3–§3.4.

## Tests

`KitSelfTest`; `RaceCasesTest` (`todo` rows).

## Edge cases

- CI runners are small: bursts use N ≤ 20 in the PR job and larger N only nightly.
- PostgreSQL `serialization_failure` vs `unique_violation`: the helpers expose the SQLSTATE so tests assert the right
  one.
- A server that fails to start must fail the test with its stderr, not hang.

## Security

The served app runs with synthetic secrets and the test database only; it listens on `127.0.0.1`.

## Definition of done

Tests green (`make ci-backend`, `make ci-backend-pgsql`), parity gate items ticked (15 §4), docs updated, PR reviewed
by the other developer.
