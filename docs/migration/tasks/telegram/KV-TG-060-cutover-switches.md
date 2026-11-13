# KV-TG-060 — Cut-over switches: pause update processing, send cap, ordered drain

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development); executed on staging and production by the production track (`18` §6) |
| Complexity | M |
| Feature IDs | F-BOT-012, F-DELIVERY-002 |
| Dependencies | KV-TG-002 (ledger, per-chat ordering), KV-TG-050 (`SendCap` read by the pacer); DEC-17 (pending updates at the switch: process, with the queue paused), DEC-18 (rollback window); used by KV-INF-028, KV-INF-030, KV-INF-031 |

## Goal

The production track can run the S2 runbook with application switches instead of ad-hoc commands: pause the processing
of Telegram updates while the webhook keeps storing them, cap or stop all outbound sends, export the buffered updates
for a rollback, and resume with an ordered per-chat drain that reports how many updates were received, processed and
deduplicated.

## Legacy reference

- Runbook steps `18` §6: T−30 min (`telegram` queue paused, radar delivery off — send cap 0), T0.4–T0.5 (buffered
  updates arrive while the queue stays paused), GO + 5 min (un-pause = point of no return, buffered updates processed in
  order), GO + 10 min (delivery on with a send cap), GO + 1 h (cap raised); rollback `18` §8.1 step 1 (export buffered
  update ids and types for the legacy operator), §8.2 step 1 (send cap 0); budgets `18` §5.4 ("re-sends: pause the
  notifications queue at once").
- Rehearsals R2/R3 (`18` §4): buffered updates processed exactly once. Legacy side `04` §6.3 item 7 (one webhook,
  pending updates decision), DEC-17, Q-SEC-017.

## Implementation

1. Read `18` §4–§8 and `14` §7.6. Tests first (`php artisan make:test --pest Bot/CutoverSwitchesTest`).
2. `php artisan make:command Telegram/IntakeCommand` → `telegram:intake pause|resume|status|export-buffered`:
   - `pause` sets the cache flag `telegram:intake:paused` (with operator name and time); `ProcessTelegramUpdateJob`
     checks it first and releases itself (30 s) without touching the row, so the webhook keeps answering `200` and
     storing updates (KV-TG-001/002 unchanged) while nothing is handled;
   - `status` prints paused/active, counts of `received` / `processing` / `done` / `failed` rows since the pause, the
     oldest buffered `update_id` age and the send cap — no ids of users, no payload;
   - `export-buffered` writes `storage/app/cutover/buffered-<timestamp>.csv` with `update_id`, `update_type`,
     `received_at` only (`18` §8.1 step 1; no chat ids, no payload);
   - `resume` clears the flag and drains in order: buffered rows are re-dispatched oldest first; the per-chat ordering of
     KV-TG-002 guarantees that a chat's updates run in `update_id` order; when the backlog is empty it prints the drain
     report — received, processed, failed, duplicates (rows answered as duplicates by the ledger during the pause).
3. `php artisan make:command Delivery/SendCapCommand` → `delivery:cap <n>|off|status`: `0` = no sends (all paced jobs
   released, nothing lost), `n` = at most `n` paced sends per minute, `off` = normal pacing; stored through
   `App\Services\Delivery\SendCap` (KV-TG-050). Optional `--allow-broadcast=<id>` exempts one service-news broadcast for
   the end-of-maintenance message (KV-TG-055).
4. Both commands log one line per change (operator, old → new value) and set gauges `telegram_intake_paused`,
   `delivery_send_cap` (KV-INF-011) so the war room sees the state.
5. Commands are allowed on every environment; on production they are executed only by the production track inside the
   approved runbook (needs first developer approval for each run, ADR-0011) — the commands themselves do not contact
   Telegram.
6. Document the switches in `docs/infrastructure/telegram-webhook.md` (section "Cut-over switches") for KV-INF-030.

## Files

- `backend/app/Console/Commands/Telegram/IntakeCommand.php`, `backend/app/Console/Commands/Delivery/SendCapCommand.php`
  (new)
- `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php` (pause check)
- `backend/tests/Feature/Bot/CutoverSwitchesTest.php` (new)

## API contract

Artisan only: `telegram:intake pause|resume|status|export-buffered`, `delivery:cap <n>|off|status
[--allow-broadcast=<id>]`. The webhook contract (`200` on accepted updates) does not change while paused.

## Business rules

- No BR; implements the decisions DEC-17 (process pending updates, queue paused until GO) and the runbook of `18` §6.
- No user-visible behaviour except the bot's silence while paused (`18` §9: "the bot is silent until the queue runs").

## Acceptance criteria

- While paused, 1 000 posted updates produce 1 000 `received` rows, `200` answers and zero Bot API calls.
- After `resume`, every buffered update is processed exactly once, in `update_id` order per chat; the drain report's
  numbers add up (received = processed + failed + still-pending 0).
- With `delivery:cap 0` no outbound send happens; lifting the cap sends the held items once.
- `export-buffered` contains no chat id, user id or payload field.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `telegram:intake pause`; post 3 updates for chat A and 2 for chat B | 5 rows `received`; `FakeBotApi::assertNothingSent()` |
| 2 | the same `update_id` posted twice while paused | one row; second answer `duplicate` |
| 3 | `telegram:intake resume` | A's 3 updates handled in `update_id` order, then/alongside B's; report `received 5, processed 5, failed 0, duplicates 1` |
| 4 | a buffered callback whose handler throws | row `failed`, counted in the report, others continue |
| 5 | `telegram:intake export-buffered` while paused | CSV with 5 lines: `update_id`, `update_type`, `received_at` only |
| 6 | `delivery:cap 0`, 10 radar cards due | nothing sent; jobs remain queued |
| 7 | `delivery:cap 5` then `off` | ≤ 5 sends in the first minute; the rest afterwards; each card once |
| 8 | `delivery:cap 0 --allow-broadcast=<id>` | only that broadcast's batches send |
| 9 | `telegram:intake status` | counts and flags; no ids |
| 10 | rehearsal script: pause → 200 updates → resume twice | second resume is a no-op; no double processing |

## Edge cases

- Redis flushed while paused: the flag is lost and processing resumes early — the runbook re-checks `status` before
  each step; the flag is also mirrored in the database as a global Pennant feature `telegram-intake-paused` (`features`
  table, installed package) and the job checks both.
- Horizon restarted (`horizon:terminate` at T0.3): released jobs come back; the pause still holds.
- Updates older than the ledger's prune window cannot be exported; the pause window is minutes, the prune 14 days.
- A rollback after the point of no return (`18` §8.2): `delivery:cap 0` first, then the export of HOMI-side writes
  (data track); this task supplies only the switches.

## Security

- SEC-REQ-009 (exactly-once processing across pause and resume), SEC-REQ-047 (no ids or payloads in output or logs),
  SEC-REQ-029 (cap as a safety brake). Commands require shell access on the server — no HTTP surface.

## Definition of done

Tests green (`make ci-backend`), the switches exercised in rehearsal R2 with timings recorded by the production track
(KV-INF-028, KV-INF-030), parity-gate G9 evidence for F-BOT-012 and F-DELIVERY-002, PR reviewed by the other developer
and the first developer.
