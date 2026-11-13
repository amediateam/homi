# KV-TG-050 — Outbound send pacing: global and per-chat limits, `retry_after`, circuit breaker

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-002, F-DELIVERY-008 |
| Dependencies | KV-TG-004 (client and exception classes), KV-INF-006 (`supervisor-delivery` on queue `notifications`), KV-TG-021 (`ChatUnreachable` on `403`); DEC-20 (per-radar cap, not at S2); Q-BOT-034 (legacy rates and volumes); related: uses the metrics registry of KV-INF-011 when present |
## Goal

Every bulk Bot API send (radar cards, digests, «Объявление снято» edits, broadcasts, command-scope resets) goes through
one pacer that keeps the bot inside Telegram's limits: a global rate per bot, at most one message per second per chat,
`retry_after` honoured on `429`, a circuit breaker on repeated `429`/`5xx`, and an operator send cap (0 = nothing is
sent). No job ever sleeps; it is released instead.

## Legacy reference

- The legacy send rate, retry policy and volumes are unknown (Q-BOT-034, `$KVADRO_ROOT/docs/about.md:590-591`); the
  outbound messages themselves were never observed (`04` §5). Bot behaviour that depends on pacing: BOT-081 (instant
  push), BOT-082, BOT-083 (digests), BOT-062 (edits), BOT-084 (service news).
- Telegram limits as used by HOMI: ~30 messages/s per bot, 1 message/s per chat (`.ai/agents/telegram-bot-engineer.md`
  rules 1 and 8); `10` §4.10 row `notifications` (start at 25 msg/s, 1 msg/s per chat, `retry_after`, circuit breaker).
- Requirement SEC-REQ-029 (pacing, `retry_after`, breaker, resumable broadcasts, optional per-radar cap); threat model
  `16` TB-2 "D" row; alert thresholds `17` §12 (`429` storm > 20 per minute).

## Implementation

1. Read `.claude/skills/laravel-queues/`, `.claude/skills/configuring-horizon/` and the agent rule 8. Tests first
   (`php artisan make:test --pest Delivery/TelegramPacerTest`).
2. Config `config/telegram.php` → `pacing`: `global_per_second` (`TELEGRAM_SEND_RATE_GLOBAL`, default 25 — 5/s of
   headroom stays for interactive replies, which do not go through the pacer), `per_chat_per_second`
   (`TELEGRAM_SEND_RATE_PER_CHAT`, default 1), `breaker_threshold` (20 failures of kind `429`/`5xx` in 60 s),
   `breaker_open_seconds` (60), `max_release_seconds` (60).
3. `php artisan make:class Services/Delivery/TelegramPacer`: `reserve(int $chatId): PaceDecision` using Laravel's
   `RateLimiter` on the Redis cache store with keys `tg:pace:global:{bot_id}` (per second) and
   `tg:pace:chat:{bot_id}:{chat_id}`; returns `allowed` or `retryIn(seconds)`. Also reads:
   - `tg:pause_until:{bot_id}` set after a `429` (global back-off for `retry_after` seconds);
   - the breaker state `tg:breaker:{bot_id}`;
   - the operator send cap through `App\Services\Delivery\SendCap` (cache key `delivery:send_cap`; `null` = off,
     `0` = no sends, `n` = at most `n` sends per minute; the command that sets it is KV-TG-060).
4. `php artisan make:class Jobs/Middleware/PaceTelegramSends` (job middleware): asks the pacer; when not allowed calls
   `$job->release($seconds)` (never `sleep()`); wraps the send to classify the outcome:
   - success, or `400 message is not modified` → done;
   - `TelegramException` too-many-requests → set `tg:pause_until` to now + `retry_after`, count a breaker failure,
     release the job for `retry_after`;
   - `403` (bot blocked, user deactivated) → dispatch `ChatUnreachable` (KV-TG-021) and finish without retry;
   - other `400` (bad request, message to edit not found) → mark the item failed, no retry, metric `400`;
   - `5xx` or transport error → breaker failure, release with exponential back-off (5, 15, 60 s), at most the job's tries.
5. All bulk send jobs (`SendRadarCard`, `SendDigest`, `EditCardWithdrawn`, `SendBroadcastBatch`, the scope reset job of
   KV-TG-057) use this middleware and run on queue `notifications`; tries 5, `maxExceptions` 3, `retryUntil` 6 h.
6. Breaker: when open, every paced job is released until it closes; one log line and one metric per opening (alert in
   KV-INF-025); a half-open probe sends one job before closing.
7. Metrics through `Metrics::inc('telegram_send_total', ['method' => …, 'result' => …])` (KV-INF-011); no user or chat
   ids as labels.
8. DEC-20 (cap on instant cards per radar per hour, overflow into the next digest) is not a pacer concern: the backend
   delivery planner applies it when the item is planned (`null` = off, parity at S2); turning it on needs the product
   owner.

## Files

- `backend/app/Services/Delivery/{TelegramPacer,PaceDecision,SendCap}.php` (new)
- `backend/app/Jobs/Middleware/PaceTelegramSends.php` (new)
- `backend/config/telegram.php` (`pacing` block), `backend/.env.example` (`TELEGRAM_SEND_RATE_GLOBAL`,
  `TELEGRAM_SEND_RATE_PER_CHAT`; shared file, announced in the PR)
- `backend/tests/Feature/Delivery/TelegramPacerTest.php`, `backend/tests/Unit/Telegram/PaceDecisionTest.php` (new)

## API contract

No HTTP endpoint. Bot API error handling follows Telegram's `ResponseParameters.retry_after` on `429`. Internal:
`TelegramPacer::reserve(int $chatId): PaceDecision`; `SendCap::current(): ?int`.

## Business rules

- Kept: BR-BOT-007 (the bot writes on its own only for pushes, digests, news, the poll) — pacing never adds messages;
  BR-BOT-100 (instant = one card per listing at once, subject to limits).
- No DEV at S2; DEC-20 (per-radar cap) stays off until the product owner decides.

## Acceptance criteria

- Against `FakeBotApi` answering `429 retry_after=3`, no request reaches the fake for 3 seconds (frozen clock), then
  sending resumes.
- A simulated 10 000-recipient broadcast never exceeds `global_per_second` in any one-second window and never sends two
  messages to one chat within a second.
- `403` leads to exactly one `ChatUnreachable` and no retry; `400 not modified` counts as success.
- With `delivery:send_cap = 0` nothing is sent and every paced job is released, not failed.
- No job calls `sleep()` (architecture test over `app/Jobs`).

## Tests

| # | Case (`FakeBotApi`, `travelTo`) | Expected |
| - | ------------------------------- | -------- |
| 1 | 30 card jobs for 30 chats in one second, global 25 | 25 sent, 5 released by ~1 s; all sent by second 2 |
| 2 | 3 cards for one chat at the same second | sent at t, t+1, t+2 (per-chat limit) |
| 3 | fake answers `429 {"retry_after":3}` once | `tg:pause_until` = now + 3; the next send attempt only at ≥ 3 s |
| 4 | fake answers `403 bot was blocked by the user` | `ChatUnreachable` dispatched once; job finished; no retry |
| 5 | fake answers `400 message is not modified` for an edit | treated as success, metric `result=400_not_modified` |
| 6 | fake answers `400 message to edit not found` | item failed, no retry |
| 7 | 21 `5xx` answers within 60 s | breaker open; queued jobs released; one breaker log line |
| 8 | breaker open, 60 s later | one probe send; success closes the breaker |
| 9 | send cap 0 | `FakeBotApi::assertNothingSent()`; jobs still on the queue |
| 10 | send cap 10/min, 50 due cards | 10 sent per minute (frozen clock over 5 minutes) |
| 11 | interactive reply in a webhook job while bulk sending | not delayed by the pacer (separate path) |

## Edge cases

- Redis flushed (ADR-0005): limiter counters reset — at most one second of overshoot; Telegram's own `429` then applies.
- Several workers on several hosts later: the limiter keys are global in Redis, so the rate holds across hosts.
- A job released many times reaches `retryUntil`: it fails visibly (failed jobs alert), the delivery row stays
  `pending` for the outbox re-planner of KV-TG-051.
- Clock skew between hosts: limiter windows use Redis time through the cache store's TTLs, not host clocks.

## Security

- SEC-REQ-029 (pacing, back-off, breaker, resumable broadcasts); SEC-REQ-013 (exceptions from the client carry no
  token); SEC-REQ-047 (no chat ids or texts in logs; internal user id only).
- The send cap is an operator safety switch for incidents (`18` §5.4 "re-sends: pause the notifications queue at once").

## Definition of done

Tests green (`make ci-backend`), the delivery-pacing performance case of KV-QA-020 green, parity-gate G7/G8 cells of
F-DELIVERY-002 and F-DELIVERY-008 updated, `09` rows updated, PR reviewed by the other developer (the production track
reads the new env names and queue in the PR description).
