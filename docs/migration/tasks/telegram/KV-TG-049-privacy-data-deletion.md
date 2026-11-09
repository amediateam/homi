# KV-TG-049 — «Удалить мои данные» with confirmation

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-PRIVACY-002 |
| Dependencies | KV-TG-048 (button), KV-TG-012 (state kind `privacy_delete`), KV-TG-011, KV-TG-057 (chat command-scope reset helper); the one deletion procedure of F-PRIVACY-002 (`ErasureService`, erasure ledger `erasure_requests` in KV-DB-007) and the retention ADR (DEC-12); Q-BOT-001, Q-DATA-042, Q-SEC-016 |

## Goal

`🗑 Удалить мои данные` under `/privacy` asks for a confirmation, then runs the single deletion procedure for the user
(every table, raw updates, delivered-card log, tokens, PostHog person) and tells the user what was deleted and that
backups age out in about two weeks. The bot's own state for the user (conversation, held deliveries, command scope) is
reset too.

## Legacy reference

- Step: BOT-080 (never pressed on legacy; confirmation, reply and scope unknown); button BTN-076; text TXT-BOT-084
  (never captured); `04` §3.16.
- Promises: BR-BOT-094 (gone from the bot DB at once, from backups in ~2 weeks), BR-BOT-090 (PostHog erase requested,
  asynchronous), BR-API-128, BR-API-129, BR-DATA-031; deletion scope questions Q-BOT-001, Q-DATA-042, Q-API-048; votes
  of deleted users Q-SEC-016.
- Requirement SEC-REQ-039 (confirmation, one procedure, PostHog deletion, erasure ledger), finding SEC-018.

## Implementation

1. Read `16` §4.9 (SEC-REQ-039), `14` §7.9 (erasure during the migration window) and the deletion procedure task of
   F-PRIVACY-002 in `docs/migration/tasks/backend/`. Tests first (`php artisan make:test --pest Bot/PrivacyDeleteTest`).
2. `php artisan make:class Telegram/Handlers/PrivacyDeleteCallback`:
   - `pv:dl` → edit the policy message's keyboard into the confirmation `bot.privacy.delete_confirm` (new text for
     TXT-BOT-084, written here and approved by the product owner): what will be deleted (radars, favourites, settings,
     marks, owner verification, history of received cards) and what stays (nothing; backups age out in ~2 weeks);
     buttons `🗑 Да, удалить всё` (`danger`) · `✖️ Отмена`; store state kind `privacy_delete` with the message id;
   - `pv:dln` → restore the `🗑 Удалить мои данные` keyboard; state cleared;
   - `pv:dly` → only when the state matches this message (a stale confirmation → stale alert of KV-TG-011): call
     `ErasureService::erase($user, source: 'bot')`; edit the message to `bot.privacy.deleted` (TXT-BOT-084 result)
     without buttons.
3. Bot-side cleanup inside the same handler, after the erasure transaction committed:
   - forget the conversation state (`ConversationStore::forget`);
   - cancel held deliveries — they are rows of the user and disappear with the erasure; send jobs already queued check
     that the user still exists and drop silently (KV-TG-051);
   - reset the chat's command scope (`deleteMyCommands` for `BotCommandScopeChat`) through the KV-TG-057 helper so the
     default menu shows;
   - emit no action-log event containing the Telegram id (KV-TG-061 skips erased users).
4. The current update's `telegram_updates` row is deleted by the erasure procedure (rows by `chat_id`); the job's final
   status write tolerates a missing row.
5. A later `/start` from the same Telegram account creates a new user (erasure ledger prevents migration re-import,
   not new contact — behaviour defined by the Telegram user resolution of F-ACCESS-003).

## Files

- `backend/app/Telegram/Handlers/PrivacyDeleteCallback.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`privacy.delete_confirm`, `privacy.deleted`, button labels)
- `backend/tests/Feature/Bot/PrivacyDeleteTest.php` (new); transcript `privacy-delete.json` (new)

## API contract

Bot API: `editMessageReplyMarkup`, `editMessageText`, `answerCallbackQuery`, `deleteMyCommands` (chat scope). Internal:
`ErasureService::erase(User $user, string $source): ErasureReceipt` (backend, F-PRIVACY-002).

## Business rules

- Kept: BR-BOT-094, BR-BOT-090, BR-API-128, BR-API-129, BR-DATA-031.
- Added by security requirement (no DEV: legacy behaviour unknown): the confirmation step (SEC-REQ-039). The texts are
  new and need the product owner (user-visible wording).
- Vote handling of deleted users follows Q-SEC-016 as decided in the retention ADR (DEC-12).

## Acceptance criteria

- Nothing is deleted before `🗑 Да, удалить всё`.
- After confirmation a DB-wide search (factory user with every relation, KV-QA-017 helper) finds no row and no jsonb
  payload with the user's id or Telegram id, except the keyed hash in `erasure_requests`.
- The PostHog fake received exactly one person-deletion request (retried by the backend job if it fails).
- Conversation state gone; queued cards for the user are not sent; the chat command scope was deleted.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `send('/privacy')` → `press('🗑 Удалить мои данные')` | same message: keyboard → `🗑 Да, удалить всё` (danger) · `✖️ Отмена`; text `bot.privacy.delete_confirm` |
| 2 | → `press('✖️ Отмена')` | keyboard back to `🗑 Удалить мои данные`; data intact |
| 3 | → `press('🗑 Да, удалить всё')` | `bot.privacy.deleted`, no buttons; `ErasureService` called once; `deleteMyCommands` sent with chat scope |
| 4 | #3 twice (double tap, two `callback_query` ids) | one erasure; the second press answers the stale alert (state gone) |
| 5 | user with a radar, favourites, owner verification, delivered cards, a held quiet-hours item | all gone; `SendRadarCard` for the held item sends nothing |
| 6 | press `🗑 Да, удалить всё` on a confirmation message older than the current state | stale alert TXT-BOT-039, nothing deleted |
| 7 | `send('/start')` after #3 | new user, default settings, welcome as for a first contact |
| 8 | forged `k1:pv:dly` without a confirmation state | stale alert, nothing deleted (SEC-REQ-011) |

## Edge cases

- PostHog unreachable: the database erasure still completes; the PostHog request is retried and recorded on
  `erasure_requests` (backend job); the user message does not wait for it (BR-BOT-090 "asynchronous").
- The user blocks the bot between confirmation and result: erasure completes; the final edit fails with `403` and is
  ignored.
- Erasure during the migration window (`14` §7.9): the ledger entry is replayed by KV-DB-027 (`14` §8).

## Security

- SEC-REQ-039 (confirmation, one procedure, ledger keyed by HMAC), SEC-REQ-038 (backups ≤ 14 days, KV-INF-026),
  SEC-REQ-047 (no Telegram id in logs after erasure), SEC-REQ-011 (actor only).
- Review by the `security-reviewer` agent and the product owner (public promise) is mandatory.

## Definition of done

Tests green (`make ci-backend`), KV-QA-017 deletion cases green for the bot path, parity-gate cells of F-PRIVACY-002
updated (Q-BOT-001 recorded as answered by specification), `09` row F-PRIVACY-002 updated, PR reviewed by the other
developer and the `security-reviewer` agent.
