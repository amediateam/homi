# KV-INF-006 — Horizon supervisors per workload

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: development) — `config/horizon.php` is a shared file: separate small PR, reviewed by the first developer |
| Complexity | S |
| Feature IDs | F-DELIVERY-002, F-BOT-012 (and F-PIPELINE-002, F-DELIVERY-001 through the new queues) |
| Dependencies | ADR-0005 (Redis queues, Horizon); `10` §4.10 queue table; queue names are an interface between the tracks (`docs/handoff/parallel-work.md` §1) |

## Goal

`config/horizon.php` has one supervisor per workload of `10` §4.10 — `notifications` moved out of
`supervisor-default` into a new `supervisor-delivery`, and new `supervisor-radar` and `supervisor-llm` (plus a
commented, disabled `supervisor-collect` for CF-007 B/C) — with per-environment process counts and `waits` thresholds,
so paced Telegram sends never starve inbound updates and long LLM calls never block matching.

## Legacy reference

- Legacy volumes: ~1 050 new listings a day (`01` §1); radar fan-out and send volumes unknown (Q-BOT-034); Telegram
  limits (≈30 msg/s overall, 1 msg/s per chat) in `.ai/agents/telegram-bot-engineer.md` rule 1 and SEC-REQ-029.
- HOMI today: four supervisors, `notifications` shares `supervisor-default` (`backend/config/horizon.php:205-282`),
  `waits` only for `redis:default` (`:99-101`); proposal of `17` §6 table "Supervisors".

## Implementation

1. Read the `configuring-horizon` and `laravel-queues` skills (`.claude/skills/`).
2. `config/horizon.php` defaults block:
   - `supervisor-default`: queue `default` only;
   - `supervisor-delivery` (new): `notifications`, `balance` `auto`, timeout 30 s, tries 5 (pacing releases jobs, so
     `maxExceptions` 3 and `backoff` from the job, not the supervisor);
   - `supervisor-radar` (new): `radar`, `auto`, timeout 60 s, tries 3;
   - `supervisor-llm` (new): `llm`, `auto`, timeout 120 s, tries 3;
   - `supervisor-collect`: present but commented with the CF-007 note.
3. Environments block from `17` §6: production default 2–4, telegram 4, delivery 2–6, radar 2–4, ingest 1–3, llm 1–4,
   media 1–3; staging about half; local one process each.
4. `waits`: `redis:telegram` 10, `redis:notifications` 60, `redis:ingest` 300, `redis:radar` 120, `redis:llm` 600
   (thresholds of `17` §12 "Queue wait per queue"), feeding `LongWaitDetected` (operator notification route of
   `10` §4.13 is configured with KV-INF-025).
5. Config test (`tests/Unit/Config/HorizonQueuesTest.php`): every queue name used by a job class's `$queue` /
   `onQueue()` in `app/Jobs` is consumed by exactly one supervisor in every environment; `notifications` is not in
   `supervisor-default`.
6. PR description: new queue names and supervisor names for the production track (systemd units unchanged — one
   Horizon master; KV-INF-019 sizes memory).

## Files

- `backend/config/horizon.php` (changed)
- `backend/tests/Unit/Config/HorizonQueuesTest.php` (new)

## API contract

n/a — worker configuration; Horizon dashboard routes unchanged.

## Business rules

Supports BR-BOT-100 (instant delivery «сразу») by isolating the delivery queue; SEC-REQ-029 (pacing is enforced by
the limiter of KV-TG-050, not by process counts).

## Acceptance criteria

- `php artisan horizon:list` (local) shows the six active supervisors; `horizon:supervisors` lists their queues.
- The config test passes and fails when a job is put on a queue no supervisor consumes.
- `make dev-start` starts Horizon with the new supervisors without changes to `scripts/dev/services.sh`.
- `make ci-backend` exits 0.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `HorizonQueuesTest` with a fake job on queue `missing` | fails naming the queue |
| 2 | local `make dev-start`, Horizon dashboard | supervisors default, telegram, delivery, radar, media, ingest, llm |
| 3 | dispatch 200 `notifications` jobs and one `telegram` job locally | the `telegram` job runs within a second (separate supervisor) |
| 4 | `config('horizon.waits')` | keys for the five queues |

## Edge cases

- Jobs already queued on `notifications` while the supervisor changes: Horizon picks them up from the same Redis list;
  no migration needed.
- `auto` balancing with `minProcesses` 1 keeps one worker per queue even when idle — acceptable on the shared host
  (KV-INF-019 measures).
- `collect` stays disabled until CF-007 chooses B or C; enabling it is a one-line PR.

## Security

No secrets; dashboard access is gated separately (KV-INF-012). Queue payloads never carry the bot token
(SEC-REQ-013) — the config test does not change that, KV-TG-004 does.

## Definition of done

Tests green (`make ci-backend`), queue and supervisor names announced to the production track in the PR, the first
developer reviewed the shared file, `docs/infrastructure/environments.md` queue list updated by KV-INF-003.
