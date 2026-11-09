# KV-TG-012 — Server-side conversation state with TTL and staleness

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-003, F-BOT-013 |
| Dependencies | KV-TG-006 (router), KV-TG-011 (stale handler); ADR-0005 (Redis); Q-BOT-018 (what makes a wizard outdated) |

## Goal

Multi-step flows (the radar wizard, the typed-amount wait, `/owner`, the deletion confirmation) keep their state on the
server, one active conversation per user, with a TTL and a short random `sid` that every wizard button carries — so a
button from an older or expired conversation is recognised and answered with the outdated-form alert.

## Legacy reference

- Wizard state is server-side; buttons of an earlier wizard get alert TXT-BOT-039 and lose the keyboard; what makes a
  wizard "earlier" (superseded or TTL) is unknown: BOT-023, BOT-036 (`tb:172–173`), `04` §3.4 row "TTL / outdated",
  Q-BOT-018.
- Typed-amount wait: BOT-042 (all text goes to the amount parser while waiting).
- Entity: ENT-012 (bot conversation state — not migrated; after the cut-over every legacy wizard button is stale,
  `04` §6.3 item 6); `06` §4.2 row "Redis keys or `bot_conversations`".
- `.ai/agents/telegram-bot-engineer.md` rule 5 (Redis, one key per Telegram user, TTL 1 800 s).

## Implementation

1. Tests first (`php artisan make:test --pest --unit Telegram/ConversationStoreTest`).
2. `php artisan make:enum Telegram/ConversationKind`: `WizardNew`, `WizardEdit`, `AmountWait`, `Owner`,
   `PrivacyDelete`.
3. `php artisan make:class Telegram/Conversations/ConversationStore` over a configurable cache store
   (`telegram.conversation.store`, default `redis`; `array` in tests): key `bot:conv:{bot_id}:{telegram_user_id}`,
   value JSON `{kind, sid, message_id, step, data, edit_radar, updated_at}`.
   - `begin(kind, messageId, data = [], editRadar = null): Conversation` — new 6-character random `sid`; replaces any
     current conversation (one per user).
   - `current(): ?Conversation`, `update(Conversation)` (refreshes TTL), `forget()`.
   - `matches(sid): bool` — false when there is no state, the TTL ran out, or the `sid` differs.
4. TTL: `telegram.conversation.ttl` from `TELEGRAM_CONVERSATION_TTL`, default 1 800 s (agent rule 5); the value is
   revisited when Q-BOT-018 is answered on a test account. Every accepted step refreshes it.
5. Concurrency: two presses of one user are serialised by the per-chat ordering of KV-TG-002, so read-modify-write is
   safe without locks; the store still writes with `put` atomically.
6. Starting another flow (for example `/owner` during a wizard) replaces the wizard; its buttons become stale. Plain
   commands without state (`/subs`, `/settings`, `/fav`) do not touch the conversation.
7. `forget()` is part of the erasure procedure (KV-TG-049). `/start` does not call it: an open wizard keeps working
   after a repeated `/start` (BR-BOT-011 "resets nothing").
8. Add `TELEGRAM_CONVERSATION_TTL` to `backend/.env.example` with the default (announced for KV-INF-003).

## Files

- `backend/app/Telegram/Conversations/{ConversationStore,Conversation}.php`, `backend/app/Enums/Telegram/ConversationKind.php` (new)
- `backend/config/telegram.php` (`conversation.store`, `conversation.ttl`), `backend/.env.example` (changed)
- `backend/tests/Unit/Telegram/ConversationStoreTest.php` (new)

## API contract

n/a — internal store. Redis key and JSON shape as in step 3; no personal data besides the Telegram id in the key and the
draft filters.

## Business rules

- Kept: BR-BOT-009 (outdated wizard → alert), BR-BOT-011 (`/start` resets nothing), BR-BOT-016 (each wizard start is a
  new message — the `message_id` is stored).
- Decision recorded (spec, Q-BOT-018): superseded **or** expired conversations are outdated.

## Acceptance criteria

- `begin()` twice → the first `sid` no longer matches.
- After `ttl + 1` seconds (`travel`) `current()` is null and `matches()` false.
- The stored JSON contains no name, phone or message text.
- A Redis flush makes all open wizards stale and nothing else breaks (ADR-0005: Redis holds nothing that must survive).

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `begin(WizardNew, 100)` then `matches(sid)` | true |
| 2 | second `begin(WizardNew, 200)` | first `sid` false, `message_id` 200 |
| 3 | `update()` at 1 700 s, check at 3 000 s | still current (TTL refreshed) |
| 4 | no update, check at 1 801 s | null |
| 5 | `begin(Owner)` during a wizard | wizard `sid` false; `kind` `Owner` |
| 6 | two bots (different `bot_id`), same user | independent keys |
| 7 | `forget()` | `current()` null |
| 8 | conversation test: `send('/new')`, wait 31 min, press `🔑 Снять надолго` | alert TXT-BOT-039, keyboard removed |

## Edge cases

- Clock skew between workers is irrelevant: TTL is Redis-side.
- A user with two Telegram clients presses buttons on both: the last write wins; the per-chat ordering keeps steps
  consistent.
- A very large draft (district lists): the JSON stays small (ids only); no cap needed.

## Security

- SEC-REQ-011 (`sid` binds wizard callbacks to the actor's own conversation), SEC-REQ-036 (no names or texts stored),
  SEC-REQ-039 (state cleared on erasure).

## Definition of done

Tests green (`make ci-backend`), new env key announced, F-BOT-003 / F-BOT-013 parity-gate rows updated, PR reviewed by
the other developer.
