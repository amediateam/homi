# KV-QA-020 — Performance baseline and budgets

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development); staging measurements with the production track |
| Complexity | L |
| Feature IDs | F-COMPAT-002, F-FEED-001, F-FILTER-005, F-MAP-001, F-MAP-002, F-LISTING-001, F-DELIVERY-001, F-DELIVERY-002, F-DELIVERY-003, F-DELIVERY-008 |
| Dependencies | KV-QA-001 (PostGIS), KV-QA-008 (burst runner); the search endpoints API-004 … API-008 and radar matching (backend tasks); Q-DATA-002 and Q-BOT-034 for real volumes |

## Goal

Measured p50/p95 latencies and query plans exist for the legacy search endpoints on a dataset of legacy size, radar
matching and outbound send rates are measured, and budgets are proposed to the developer.

## Legacy reference

- Client timing: 15 s timeout (BR-API-002, `08` §1.6); debounced live `count` (250 ms) and `flow` (500 ms); the radar
  tab sends 3 requests per radar (LB-APP-036, LB-API-038); burst budgets (CF-018, SEC-REQ-027).
- Volumes: about 1 050 new listings per day (`10` CF-004); six cities; user, radar and send volumes unknown
  (Q-DATA-002, Q-BOT-034).
- Outbound pacing: SEC-REQ-029; Telegram's documented broadcast limits (re-check the Bot API FAQ when measuring).
- Load risks: LB-API-024 (unbounded favourites and history), LB-API-052 (live recount).

## Implementation

1. Read `.claude/skills/laravel-database-optimization/`, `.ai/agents/postgis-geo-engineer.md`, `15` §2.12.
2. Dataset generator `backend/database/seeders/Testing/VolumeSeeder.php` (synthetic, deterministic) with a parameter
   table; until real volumes are known use, marked `ASSUMED`: 95 000 listings (90 days × 1 050), 20 % active; six
   cities with Tashkent at 80 %; 50 000 users; 20 000 active radars; 2 000 000 delivered-card rows; favourites and
   history 20 per user on average, one user with 500 favourites.
3. Query plans: `EXPLAIN (ANALYZE, BUFFERS)` for feed (default, heavy filters, 40-vertex polygon, each sort), count,
   flow, map (largest city, all points), listing details, favourites (500); stored as text under
   `docs/migration/data/perf/plans/`; flag sequential scans on large tables.
4. HTTP latency with the burst runner (KV-QA-008): 200 requests per endpoint at concurrency 1 and 10; p50, p95, max;
   results in `docs/migration/data/perf/results.csv` (date, commit, machine, endpoint, case, p50, p95, max).
5. Radar matching: time to evaluate one new listing against all active radars; throughput for a burst of 100 new
   listings; must not block the `ingest` queue.
6. Outbound: fan-out of 10 000 cards against `FakeBotApi` with pacing; measured sends per second overall and per chat;
   `429 retry_after` honoured (SEC-REQ-029).
7. Propose budgets to the developer (from `15` §2.12: feed, count, listing p95 ≤ 300 ms; flow ≤ 500 ms; map ≤ 1 s on
   staging hardware) and record the decision in `15` §2.12.
8. Optional, separate approvals: k6 for load profiles — needs approval (dependency change); a timing sample of the
   legacy API with the test account — needs developer approval: touches production (read-only, ≤ 1 request per second).
9. Staging: the production track repeats steps 3–6 on staging after R1/R2 data is loaded (`14` §7.4).

## Files

- `backend/database/seeders/Testing/VolumeSeeder.php` (new)
- `backend/tests/Performance/*` (new; excluded from the default run, invoked by a Composer script `test:perf`)
- `docs/migration/data/perf/plans/*.txt`, `results.csv` (new)
- `backend/composer.json` (script `test:perf`)

## API contract

API-004 … API-008, API-029, API-030 as the legacy client calls them (FilterQuery of `08` §1.7).

## Business rules

BR-API-002 (answer within 15 s), BR-BOT-100 (instant vs digest delivery).

## Acceptance criteria

- The parameter table names every volume with its source or `ASSUMED`.
- Plans and latencies are recorded for every listed case; no sequential scan on `listings` for a filtered query
  without a written reason.
- Matching and send-rate figures are recorded; budgets proposed and the decision recorded.

## Tests

`backend/tests/Performance/{SearchLatencyTest,MatchingThroughputTest,OutboundPacingThroughputTest}.php` — they record
numbers and fail only when a hard limit is broken (any legacy endpoint ≥ 15 s; pacing above the configured rate).

## Edge cases

- Cold vs warm cache: record both; the budget applies to warm.
- Aborted `count` / `flow` requests must not leave queries running (cancel on disconnect, `08` API-005).
- CI runner numbers are indicative only; budgets are judged on staging.

## Security

Synthetic data; no production endpoint is called without the separate approval in step 8.

## Definition of done

Tests green (`make ci-backend`; `composer test:perf` run recorded), parity gate items ticked (15 §4), docs and the
feature rows in 09 updated, PR reviewed by the other developer.
