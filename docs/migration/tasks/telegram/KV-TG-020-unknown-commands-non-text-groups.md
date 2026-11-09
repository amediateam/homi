# KV-TG-020 — Unknown commands, non-text messages and group chats

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-002, F-BOT-014 |
| Dependencies | KV-TG-006 (router), KV-TG-008 (texts); DEV-027 (`PROPOSED`); Q-BOT-013 |

## Goal

The bot behaves predictably for everything outside its scenarios: an unknown command gets a short hint (DEV-027) instead
of silence, photos, stickers, documents and other non-text messages get the existing "not understood" hint, and groups
are never served. No such message is stored beyond the redacted ledger row.

## Legacy reference

- Unknown command: BOT-022 (no reply after 13 s, `tb:107`), BR-BOT-006, LB-BOT-014 → DEV-027 (short reply listing the
  main commands).
- Non-text messages: BOT-057 (photo, sticker, location, document, forwarded post, contact outside `/owner` — not tested,
  Q-BOT-013).
- Groups: BOT-058 (never added to a group; BotFather group settings unknown, Q-BOT-013); SEC-REQ-011 "Group chats are
  ignored".
- Not-understood reply TXT-BOT-043 with BTN-030 and BTN-034 (`tb:602`), used by the free-text flow (KV-TG-038).
- Geolocation is never stored (BR-BOT-089).

## Implementation

1. Tests first (`php artisan make:test --pest Bot/OutOfScopeMessagesTest`).
2. `php artisan make:class Telegram/Handlers/UnknownCommandHandler`: while the approval flag `bot.dev027`
   (DEV-027, `backend/config/bot.php`) is off → no reply (BR-BOT-006); when on → `bot.common.unknown_command` (new text, DEV-027) listing
   `/new`, `/subs`, `/fav`, `/settings`, `/help` in the user's locale. Commands addressed to another bot
   (`/x@OtherBot`) are ignored silently in both states.
3. `php artisan make:class Telegram/Handlers/NonTextMessageHandler` for photo, sticker, animation, video, audio,
   document, location, venue, poll, dice and forwarded posts without text: reply TXT-BOT-043 with BTN-030 and BTN-034
   (spec decision under Q-BOT-013, recorded in the PR; the legacy behaviour is unobserved). Forwarded posts **with**
   text go to the free-text parser like typed text (KV-TG-038). Voice goes to KV-TG-039; contacts to KV-TG-046.
   Locations are not read or stored (BR-BOT-089); the ledger strips them after processing (KV-TG-003).
4. `php artisan make:class Telegram/Handlers/GroupChatHandler`: any update from a `group`, `supergroup` or `channel`
   chat → no reply; a `my_chat_member` update adding the bot to a group → `leaveChat` once.
5. The non-text reply is rate-limited by the per-user limits of KV-TG-006 (a burst of 20 stickers gets at most one reply
   per minute: `bot:{user}:nontext` 1/min).

## Files

- `backend/app/Telegram/Handlers/{UnknownCommandHandler,NonTextMessageHandler,GroupChatHandler}.php` (new)
- `backend/config/bot.php` (`dev027`), `backend/lang/{ru,uz,en}/bot.php`
  (`common.unknown_command`)
- `backend/tests/Feature/Bot/OutOfScopeMessagesTest.php` (new)

## API contract

Bot API: `sendMessage` (hint or TXT-BOT-043), `leaveChat {chat_id}`; nothing else.

## Business rules

- BR-BOT-006 holds until DEV-027 (`PROPOSED`) is approved; then the hint replaces silence.
- BR-BOT-089 (location never stored), BR-BOT-005 (no reply keyboards outside `/owner`).
- Non-text replies and group leaving: spec decisions (Q-BOT-013), no DEV because the legacy behaviour is unknown — the
  F-BOT-014 gate records them as spec-tested.

## Acceptance criteria

- `/foo` produces nothing while the feature is off and one hint when it is on.
- A photo, a sticker or a location produces one TXT-BOT-043 reply (at most one per minute per user).
- Adding the bot to a group produces one `leaveChat`; a message in a group produces nothing.
- No ledger row of these updates keeps a location or a file id after processing.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `conversation(user: 'A')->send('/foo')`, feature off | `FakeBotApi::assertNothingSent()` |
| 2 | same, feature on | `expectNew('bot.common.unknown_command')` listing the five commands |
| 3 | `send('/start@OtherBot')` | nothing sent |
| 4 | `UpdateFactory::photo()` | `expectNew('TXT-BOT-043')` with `➕ Новый радар` and `✉️ Написать в поддержку` |
| 5 | 20 stickers within a minute | one reply |
| 6 | forwarded post with text «2 комн Чиланзар 500$» | handed to the free-text parser (KV-TG-038) |
| 7 | location message | TXT-BOT-043; stored payload has no `location` after processing |
| 8 | `myChatMember(status: member)` in a group | one `leaveChat` |
| 9 | text message in a supergroup | nothing sent |

## Edge cases

- `edited_message` and `inline_query` are not subscribed (KV-TG-003); nothing to handle.
- A contact without an active `/owner` flow is not "non-text": KV-TG-046 accepts it when it is the sender's own
  (`04` §6.3 item 4).
- Telegram service messages (pinned, `write_access_allowed`) go to KV-TG-021 or are ignored, never answered.

## Security

- SEC-REQ-011 (groups ignored), SEC-REQ-010 (limits), SEC-REQ-036 / BR-BOT-089 (no location stored).

## Definition of done

Tests green (`make ci-backend`), DEV-027 state and the Q-BOT-013 spec decisions recorded in the F-BOT-002 / F-BOT-014
parity-gate rows, PR reviewed by the other developer.
