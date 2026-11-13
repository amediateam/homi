# KV-TG-006 — Update router, actor resolution, access guard, per-user limits

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-012, F-BOT-015, F-ACCESS-003 |
| Dependencies | KV-TG-002, KV-TG-004; Telegram user resolution of F-ACCESS-003 (identity schema KV-DB-007, `14` §8); the access gate's bot guard of F-ACCESS-002; SEC-REQ-010, SEC-REQ-011 |

## Goal

`ProcessTelegramUpdateJob` hands every stored update to one router that classifies it, resolves the acting user from
`from.id` (creating the user on first contact without names), refuses blocked users, applies per-user limits, and
dispatches to exactly one registered handler — with every callback query answered exactly once.

## Legacy reference

- Handler inventory: `04` §2 (BOT-012 … BOT-084 by kind: command, free-text, scenario-step, system), `data/bot-handlers.json`.
- First contact creates the bot user (BOT-012 "Creates the bot user on first contact (implied)"); stored per user
  without name and contacts (BR-BOT-085), three profile flags and an account-age estimate (BR-BOT-087, BR-API-007).
- Every callback is answered: toast, alert or silent (BR-BOT-002, `04` §4.3).
- Private chats only; groups never tested (BOT-058, Q-BOT-013).
- Architecture: Telegram module = adapter over shared services (`10` §4.1 p.2, §4.2 row "Telegram", `04` §10);
  authorisation row "Bot" in `10` §4.8; access gate "one guard for bot handlers, `blocked` stops everything".

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md` (rules 5, 7, 12, 14), `16` §4.2–§4.3. Tests first
   (`php artisan make:test --pest Bot/UpdateRouterTest`).
2. `php artisan make:class Telegram/Updates/IncomingUpdate`: built from the decrypted payload; `kind()` →
   `php artisan make:enum Telegram/UpdateKind` (`Command`, `Text`, `Voice`, `Contact`, `Callback`, `ChatMember`,
   `OtherMessage`, `Ignored`); `command()` parses `/name@BotUsername payload` (only this bot's username, case
   insensitive); `chatType()`; `isForwarded()`.
3. `php artisan make:class Telegram/Updates/BotContext`: user, locale (KV-TG-007), chat id, message id, update id,
   callback query id, `TelegramBot`, and an `answered` flag for callbacks.
4. Actor resolution: call the Identity user resolution of F-ACCESS-003 (shared with the legacy `tma` guard) with a
   Telegram identity built from `from` — `id`, `language_code`, `is_premium`, `has_username` (from KV-TG-003);
   updates carry no photo flag, so `has_photo` keeps its stored value. One user row per Telegram id under concurrent
   first contacts (the resolver's upsert). Names are never read.
5. Chat type: anything but `private` → `GroupChatHandler` of KV-TG-020 (ignore / leave); nothing else runs.
6. Access guard: the access gate's bot decision (F-ACCESS-002); `blocked` → no handler, callbacks answered silently,
   no message sent. Other gate states (`private`, `invite`, `full`, `join`) do not restrict bot handlers here — legacy
   bot behaviour for gated users is unobserved (Q-API-006); domain writes enforce the gate in their services.
7. Per-user limits (SEC-REQ-010, values `PROPOSED`): commands + callbacks 30/min, free text 30/h, voice 10/h;
   `RateLimiter` keys `bot:{user_id}:{class}`. Over the limit: the update is dropped; the first drop in the window
   sends `bot.common.slow_down` (new text, SEC-REQ-010 "one notice"; callbacks get it as a toast); at ≥ 100 in a
   minute even the notice is skipped (agent rule 12).
8. Registry: `CommandHandler` (by command name), `CallbackHandler` (by action code of KV-TG-011), `MessageHandler` (by
   kind) interfaces; registered in a `TelegramServiceProvider`
   (`php artisan make:provider TelegramServiceProvider`). Unknown commands go to KV-TG-020; text and voice go to the
   amount wait (KV-TG-032) or the parser (KV-TG-038); contact to KV-TG-046; `my_chat_member` to KV-TG-021.
9. Callback guarantee: after the handler returns, if no answer was sent, the router answers silently; a second answer
   is never sent. `QueryTooOld` from Telegram is ignored (the queue may lag behind the 15 s window).
10. Failures: a handler exception propagates to the job (retry, KV-TG-002). Handlers are written idempotently against
    the target state (`15` §3.5); the router logs update id, kind and internal user id only (never the Telegram id or
    text, SEC-REQ-047).

## Files

- `backend/app/Telegram/Updates/{UpdateRouter,IncomingUpdate,BotContext}.php`, `backend/app/Enums/Telegram/UpdateKind.php` (new)
- `backend/app/Telegram/Handlers/Contracts/{CommandHandler,CallbackHandler,MessageHandler}.php` (new)
- `backend/app/Providers/TelegramServiceProvider.php` (new), `backend/bootstrap/providers.php` (changed)
- `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php` (calls the router)
- `backend/lang/{ru,uz,en}/bot.php` (key `common.slow_down`)
- `backend/tests/Feature/Bot/UpdateRouterTest.php`, `backend/tests/Unit/Telegram/IncomingUpdateTest.php` (new)

## API contract

Internal only. Inbound: decrypted `Update`; outbound: whatever the selected handler sends, plus at most one
`answerCallbackQuery` per callback. No HTTP route.

## Business rules

- Kept: BR-BOT-002 (every callback answered once), BR-BOT-085 and BR-BOT-087 (stored per user, no names), BR-BOT-005
  (reply keyboards only from `/owner` — enforced in KV-TG-010).
- Security rules: SEC-REQ-010, SEC-REQ-011 (actor from `from.id`, private chats only), SEC-REQ-036 (no names).
- New behaviour without a legacy counterpart: the rate-limit notice (security requirement, not a DEV; wording reviewed
  with the product owner).

## Acceptance criteria

- Each `UpdateKind` reaches its registered handler; an update with no handler is acknowledged and logged once.
- The first update from a new Telegram id creates one `users` row with no name, the three flags and a locale; ten
  concurrent first updates still create one row (`pgsql` group).
- A blocked user's `/start`, text and callback produce no outgoing message except a silent `answerCallbackQuery`.
- The 31st callback in a minute gets the slow-down toast once; the 32nd nothing.
- No callback is answered twice (asserted over every transcript of KV-QA-009 by a `FakeBotApi` counter).

## Tests

| # | Conversation / input | Expected |
| - | -------------------- | -------- |
| 1 | `conversation(user: 'A')->send('/start')` from a new id | user row created; `StartCommand` invoked |
| 2 | `send('/start@KvadroAppBot s_web')` | command `start`, payload `s_web` |
| 3 | `send('/start@OtherBot')` | not treated as this bot's command (unknown-command path) |
| 4 | text `двушка в Юнусабаде` | free-text handler invoked |
| 5 | callback with no handler-side answer | router sends one silent `answerCallbackQuery` |
| 6 | group chat message | only the group handler runs; nothing sent |
| 7 | user with access state `blocked` presses any button | silent answer only, no edit, no new message |
| 8 | 31 callbacks within a minute (frozen clock) | 31st answered with `bot.common.slow_down` toast; no handler run |
| 9 | update `from` with `username` and `is_premium: true` | flags stored; no username anywhere in the database |
| 10 | handler throws | job retried; nothing answered twice |

## Edge cases

- `from` missing (channel posts, anonymous admins): ignored.
- A user who deleted their data (KV-TG-049) and writes again is a new user (the erasure ledger prevents re-import of
  legacy data only, SEC-REQ-039).
- Commands with trailing spaces or Cyrillic lookalikes are not commands (exact `/[a-z_]+` names).
- Updates replayed after the cut-over from the Telegram buffer (KV-TG-060) go through the same router in order.

## Security

- SEC-REQ-010, SEC-REQ-011, SEC-REQ-014 (handlers resolve targets through the user's relations), SEC-REQ-036,
  SEC-REQ-047 (log context without Telegram id or text).
- The `security-reviewer` agent reviews the guard and the limits.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group for the concurrency case), F-BOT-012 / F-BOT-015 parity-gate rows updated
(G6 limits evidence), the handler registry documented in `docs/infrastructure/telegram-webhook.md`, PR reviewed by the
other developer.
