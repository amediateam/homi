# KV-TG-002 — Update ledger: `update_id` dedup, fast ack, `telegram` queue, atomic claim

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-012 |
| Dependencies | KV-TG-001 (authenticity); KV-QA-003 (update factory, fake Bot API); KV-QA-008 (concurrency kit, PostgreSQL burst); second part of HANDOFF T1 |

## Goal

An authenticated update is written once to `telegram_updates` keyed by (`bot_id`, `update_id`), acknowledged with
`200` immediately, and processed exactly once by `ProcessTelegramUpdateJob` on the `telegram` queue — in `update_id`
order per chat, with failures ending in a `failed` row instead of a non-2xx answer to Telegram.

## Legacy reference

- One receiver per bot, switched once; pending updates at the switch are a cut-over decision: `04` §1 row "Webhook",
  `04` §6.3 item 7, `$KVADRO_ROOT/docs/about.md:408-411`; DEC-17, Q-SEC-017.
- Users press buttons twice and Telegram re-delivers on slow answers; legacy handling is unknown (backend source
  unavailable). RES-022 in `08`; F-BOT-012 in `09` §3.21.
- HOMI stubs: `backend/app/Http/Controllers/Webhooks/TelegramWebhookController.php:18-21` (501),
  `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php:15-26` (empty), table
  `backend/database/migrations/2026_11_08_171041_create_telegram_updates_table.php` (UNIQUE `bot_id`, `update_id`),
  `backend/app/Models/TelegramUpdate.php`, `backend/app/Enums/TelegramUpdateStatus.php`.
- Requirements SEC-REQ-009, SEC-REQ-010; test plan `15` §3.3 cases 4–8, `15` §3.5, `16` §5.3.

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md` (rules 3–4), `.claude/skills/laravel-queues/`,
   `.claude/skills/configuring-horizon/`. Tests first (`php artisan make:test --pest Bot/WebhookLedgerTest`,
   `Bot/ProcessUpdateJobTest`).
2. `php artisan make:class Telegram/Client/TelegramBotIdentity`: `id()` = numeric prefix of `TELEGRAM_BOT_TOKEN`
   (before `:`), so the dev bots, the staging bot and `@KvadroAppBot` never share ledger rows (`10` §7).
3. `php artisan make:migration add_type_and_chat_to_telegram_updates_table`: `update_type varchar(32) null`,
   `chat_id bigint null`, index (`bot_id`, `chat_id`, `update_id`). Additive; the table has no production data yet.
4. Controller: decode the body; not a JSON object, or `update_id` missing / not a positive integer → `400
   {"ok":false}` with no row (only authenticated requests reach this point, so this is a bug or a forgery with the
   secret; it is logged with the request id only). Derive `update_type` (the first key other than `update_id`) and
   `chat_id` (`message.chat.id`, `callback_query.message.chat.id`, `my_chat_member.chat.id`). A type outside
   `telegram.webhook.allowed_updates` → `200 {"ok":true}` and nothing stored.
5. `TelegramUpdate::query()->insertOrIgnore([...])`; inserted → dispatch `ProcessTelegramUpdateJob($id)` on queue
   `telegram` with `afterCommit()` and answer `200 {"ok":true}`; ignored (duplicate) → `200
   {"ok":true,"duplicate":true}`, no dispatch. The payload is stored through the redaction and encryption of
   KV-TG-003 once that lands; until then only the developer's own dev bot may be pointed at a machine.
6. Job: `$tries` unlimited, `retryUntil()` = 10 minutes, `maxExceptions = 3`, `timeout = 25` (the supervisor has
   30 s). Order of `handle()`:
   1. per-chat ordering — if a row of the same `bot_id` + `chat_id` with a smaller `update_id` is still `received` or
      `processing`, `release(1)` (releases do not consume the exception budget);
   2. atomic claim — `UPDATE … SET status = 'processing' WHERE id = ? AND status = 'received'`; 0 rows → return;
   3. hand the update to `UpdateRouter` (KV-TG-006; a no-op until then);
   4. `status = 'done'`, `processed_at = now()`.
   On an exception the row goes back to `received` and the exception is rethrown; `failed()` sets `failed` and
   stores the exception class and a short message without payload data in `error`.
7. Keep the queue name and supervisor as they are (`backend/config/horizon.php:219-221`); KV-INF-006 owns
   supervisor changes.
8. Remove the "501" note from the controller docblock; update `docs/infrastructure/telegram-webhook.md` (KV-TG-005)
   with the ledger states.

## Files

- `backend/app/Http/Controllers/Webhooks/TelegramWebhookController.php`, `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php` (changed)
- `backend/app/Telegram/Client/TelegramBotIdentity.php` (new)
- `backend/database/migrations/<date>_add_type_and_chat_to_telegram_updates_table.php` (new)
- `backend/app/Models/TelegramUpdate.php`, `backend/database/factories/TelegramUpdateFactory.php` (changed)
- `backend/tests/Feature/Bot/{WebhookLedgerTest,ProcessUpdateJobTest}.php` (new)

## API contract

| Case | Status | Body | Side effect |
| ---- | ------ | ---- | ----------- |
| new update of an allowed type | 200 | `{"ok":true}` | one row `received`, one job |
| same (`bot_id`, `update_id`) again | 200 | `{"ok":true,"duplicate":true}` | none |
| type outside `allowed_updates` | 200 | `{"ok":true}` | none |
| body not an object / no valid `update_id` | 400 | `{"ok":false}` | none |
| handler throws later | 200 (already answered) | — | row `failed` after the budget |

## Business rules

- SEC-REQ-009 (idempotency, atomic claim), SEC-REQ-010 (fast ack, failures never become non-2xx).
- BR-BOT-001 and every scenario rule depend on one application per update; double taps produce two different
  `update_id`s and are handled by the handlers (`15` §3.4 case 7), not here.
- No DEV: invisible to users.

## Acceptance criteria

- `15` §3.3 cases 4–8 pass: one row, one job, one side effect for a repeated update, sequential and concurrent.
- Two updates of one chat are processed in `update_id` order even when the later job is picked first.
- A handler exception yields a `200` to Telegram and, after three exceptions, a `failed` row with no payload text in
  `error`.
- The webhook answers within 1 s at p95 locally with the queue stopped (no work in the request).
- `make ci-backend` exits 0; the burst test runs in the `pgsql` group of KV-QA-001.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `UpdateFactory::command('/start')` posted once | 200 `{"ok":true}`, one row `received`, one job on `telegram` |
| 2 | the same update posted twice in sequence | second answer `duplicate:true`; one row; one job |
| 3 | the same update posted 10 times concurrently (KV-QA-008 burst, `pgsql`) | one row, one job, one `sendMessage` captured by `FakeBotApi` |
| 4 | same `update_id`, other `bot_id` (second synthetic token) | two rows, both processed |
| 5 | `edited_message` / `inline_query` update | 200, no row |
| 6 | body `[]`, body without `update_id`, `update_id: -1` | 400, no row |
| 7 | job run twice for one row (worker crash simulation) | the second run claims nothing and returns |
| 8 | jobs for updates 11 and 10 of one chat, 11 first | 11 releases until 10 is `done` |
| 9 | router throws three times | row `failed`, `error` holds the class name only; webhook already answered 200 |
| 10 | row of another chat still `received` | does not block this chat |

## Edge cases

- `afterCommit()` keeps a job from running before its row is visible.
- A row stuck in `processing` after a worker kill: the job's retry finds `processing`, not `received`; a daily check
  (KV-TG-059) reports rows older than 10 minutes in `processing`; recovery sets them back to `received`.
- Updates buffered at Telegram during the cut-over arrive in a burst with the queue paused (KV-TG-060); ordering and
  dedup hold for the backlog.
- A callback re-delivered after its row was pruned (14 days) is a new row; handlers must be idempotent on the target
  state (KV-TG-011, `15` §3.3 case 9).

## Security

- SEC-REQ-009, SEC-REQ-010; the `400` path logs only the request id (SEC-REQ-047).
- Until KV-TG-003 merges, the payload is stored raw (SEC-030): no shared or staging bot points at a branch with this
  task alone.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group for case 3), `15` §3.3 cases 4–8 recorded as evidence in the F-BOT-012
parity-gate row, `docs/infrastructure/telegram-webhook.md` ledger section written, PR reviewed by the other developer;
the migration is announced in the PR description (`docs/handoff/parallel-work.md` §3).
