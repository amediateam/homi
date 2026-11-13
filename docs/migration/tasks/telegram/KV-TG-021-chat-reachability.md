# KV-TG-021 — Chat reachability: `my_chat_member`, blocked bot, `409 no_chat` source

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-RADAR-008, F-DELIVERY-002 |
| Dependencies | KV-TG-006 (router); `users.bot_chat_state` of the identity schema (KV-DB-007, `14` §8); consumers: the access gate's `join` reason (F-ACCESS-002) and the legacy `409 no_chat` check of radar writes (F-RADAR-002 … F-RADAR-006); Q-BOT-012 |

## Goal

HOMI always knows whether the bot can write to a user: `/start`, any message, unblocking and granting write access mark
the chat `active`; blocking the bot or a `403` on a send mark it `blocked`; users who never started the bot stay `never`.
The access gate and the Mini App's `409 no_chat` read this state, and deliveries stop for unreachable chats.

## Legacy reference

- `409 {"detail":"no_chat"}` before any radar write when the bot cannot write to the user; the client asks for write
  access and retries once: BR-BOT-099, BR-API-003, BR-API-021, TMA-033 (`$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:11-51`).
- Access reason `join` = the user has not started the bot (BR-API-012); the gate must open within seconds after
  «Старт» (BR-API-013).
- Blocked bot during delivery: handling unknown (Q-BOT-012); delivery pipeline `04` §5 (`Sent --> Blocked : 403`).
- Event `ChatUnreachable` (`10` §4.12); `06` §4.2 users row (`bot_chat_state`).

## Implementation

1. Tests first (`php artisan make:test --pest Bot/ChatReachabilityTest`).
2. `php artisan make:enum Telegram/BotChatState`: `Never`, `Active`, `Blocked` (string values `never`, `active`,
   `blocked` — the column the access gate reads).
3. `php artisan make:class Services/Telegram/ChatReachability`: `markActive(User)`, `markBlocked(User, reason)` — writes
   only on change, raises `App\Events\Telegram\ChatReachabilityChanged` (`php artisan make:event`) and, on block,
   `ChatUnreachable` (`10` §4.12); the access gate flushes its cached decision on the change (its model events).
4. Inputs:
   - every private message or callback from the user → `markActive` (cheap: compares in memory first);
   - `my_chat_member` with `new_chat_member.status = kicked` → `markBlocked('user_blocked')`; `member` → `markActive`;
   - service message `write_access_allowed` (sent when the user grants write access from the Mini App) → `markActive`
     (verify the field name against the current Bot API docs; record the date);
   - `ChatUnreachable` from any send (KV-TG-010 responder, KV-TG-050 pacer) → `markBlocked('send_403')`.
5. Effects: delivery planning skips `blocked` and `never` users (KV-TG-051); radars stay active (they resume when the
   user returns) — spec decision for Q-BOT-012, recorded in the PR; a `never` user created by the Mini App gets
   `409 no_chat` on radar writes (implemented by the backend radar services, which read this state).
6. `StartCommand` (KV-TG-014) calls `markActive` before replying so the access gate opens immediately.

## Files

- `backend/app/Enums/Telegram/BotChatState.php`, `backend/app/Services/Telegram/ChatReachability.php` (new)
- `backend/app/Events/Telegram/{ChatReachabilityChanged,ChatUnreachable}.php` (new)
- `backend/app/Telegram/Handlers/ChatMemberHandler.php` (new)
- `backend/tests/Feature/Bot/ChatReachabilityTest.php` (new)

## API contract

Inbound: `my_chat_member` updates, `message.write_access_allowed`, any private message or callback. Outbound: none.
Contract consumed by others: `users.bot_chat_state ∈ {never, active, blocked}`; legacy `409 {"detail":"no_chat"}` is
returned when the state is not `active` (backend radar routes).

## Business rules

- Kept: BR-BOT-099, BR-API-021, BR-API-012 (`join`), BR-API-013 (gate opens within seconds).
- Spec decisions (Q-BOT-012): a blocked user's radars stay active but nothing is sent; unblocking resumes delivery
  without re-sending what was missed (the delivered-card log decides, KV-TG-051).

## Acceptance criteria

- A Mini App-only user (never started) is `never`; after `/start` `active` within the same update.
- `my_chat_member` `kicked` → `blocked`; `member` → `active`; each change raises one event.
- A `403` on any send flips the state to `blocked` exactly once, even under parallel sends.
- With state `blocked`, a radar write through the legacy API answers `409 {"detail":"no_chat"}` (backend contract test
  fed by this state).

## Tests

| # | Conversation / input | Expected |
| - | -------------------- | -------- |
| 1 | user created through `initData` only | `bot_chat_state = never` |
| 2 | `conversation(user: 'A')->send('/start')` | `active`; access gate no longer `join` |
| 3 | `UpdateFactory::myChatMember(status: 'kicked')` | `blocked`; `ChatUnreachable` raised |
| 4 | then `myChatMember(status: 'member')` | `active` |
| 5 | `FakeBotApi` answers `403` to a card send | `blocked` once; delivery job not retried for that chat |
| 6 | message with `write_access_allowed` | `active` |
| 7 | 10 parallel `403`s (`pgsql` group) | one state change, one event |

## Edge cases

- `my_chat_member` arrives late (after a newer message): the state follows the newest information by update order
  (per-chat ordering of KV-TG-002).
- A deactivated Telegram account (`403 user is deactivated`) → `blocked`; erasure is not automatic.
- Migrated users: the legacy reachability flag (if the dump has one) seeds the column; otherwise migrated users who have
  a delivered-card log are `active` (an input for the identity load, KV-DB-014).

## Security

- SEC-REQ-011 (state changes only from the user's own updates or Telegram's answers), SEC-REQ-036 (no names).
- No personal data besides the state.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group for case 7), Q-BOT-012 spec decision recorded in the F-RADAR-008 and
F-DELIVERY-002 parity-gate rows, PR reviewed by the other developer.
