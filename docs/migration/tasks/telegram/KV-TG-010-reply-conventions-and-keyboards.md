# KV-TG-010 — Reply conventions: edit vs new, toast / alert / silent, ✅ marks, button styles

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-015 |
| Dependencies | KV-TG-004 (client), KV-TG-007 (`BotText`, `Html`); the length check of `callback_data` is shared with KV-TG-011 |

## Goal

Handlers describe what they want — a new message, an edit of the pressed message, a toast, an alert, a reaction, a
sticker — as small value objects, and one responder executes them with the legacy conventions built in: callbacks edit
their message, the chosen option carries `✅ `, primary and danger buttons are styled as in legacy, reply keyboards
exist only in `/owner`, and "message is not modified" counts as success.

## Legacy reference

- Interface conventions: `tb` §5 (`$KVADRO_ROOT/docs/telegram-bot.md:165-187`), `04` §3 preamble, `04` §4.3.
- BR-BOT-001 (callbacks edit; listed exceptions send new messages), BR-BOT-002 (toast list, one alert, 14 silent kinds),
  BR-BOT-003 (`✅ ` prefix), BR-BOT-004 (`primary`: BTN-001, BTN-035, BTN-004, BTN-034, BTN-028/BTN-056; `danger`:
  BTN-058), BR-BOT-005 (reply keyboard only in `/owner`), BR-BOT-076 (re-render even when the value did not change).
- F-BOT-015 in `09` §3.21 ("Bot interaction conventions").

## Implementation

1. Tests first (`php artisan make:test --pest --unit Telegram/KeyboardBuilderTest`, `Telegram/ResponderTest`).
2. `app/Telegram/Replies/`: readonly classes `SendMessage(text, keyboard?, parseMode = HTML, silent = false)`,
   `EditMessage(text, keyboard?)`, `EditKeyboard(keyboard?)` (null removes it), `Toast(text)`, `Alert(text)`,
   `SilentAnswer`, `SendSticker(name)`, `React(emoji)`, `SendVenue(…)`, `SendMediaGroup(…)`
   (`php artisan make:class` for each).
3. `php artisan make:class Telegram/Replies/Responder`: executes a list of replies in order for a `BotContext`; at most
   one of `Toast` / `Alert` / `SilentAnswer` per callback; `MessageNotModified` is swallowed (BR-BOT-076);
   `MessageNotFound` / `MessageCantBeEdited` on an edit falls back to nothing and is logged at `info`; `ChatUnreachable`
   is passed to KV-TG-021.
4. `php artisan make:class Telegram/Keyboards/InlineKeyboard` (builder): `row(...)`, `callback(label, data)`,
   `url(label, url)` (only allow-listed `https`, SEC-REQ-019), `webApp(label, url)` (only the configured Mini App URL),
   `primary()`, `danger()` (adds the Bot API `style` field), `selected(bool)` (prefixes `✅ `), `maxPerRow(n)`; rejects
   `callback_data` longer than 64 bytes (UTF-8) at build time.
5. `php artisan make:class Telegram/Keyboards/ReplyKeyboard`: `requestContact(label)`, `text(label)`, `remove()`; its
   constructor is only used by the `/owner` handler — an `arch()` test forbids other uses (BR-BOT-005).
6. Default policy helper `Reply::forCallback()`: returns `EditMessage` targeting the pressed message; handlers that must
   send a new message (wizard step after a typed amount, cards by number or from `/fav`, starter list, tip, venue, album,
   poll — BR-BOT-001) say so explicitly.
7. A table in `docs/infrastructure/telegram-webhook.md` "Reply conventions" lists the BR-BOT-002 answer kinds per action
   so reviewers can check handlers against it.

## Files

- `backend/app/Telegram/Replies/*.php`, `backend/app/Telegram/Keyboards/{InlineKeyboard,ReplyKeyboard}.php` (new)
- `backend/tests/Unit/Telegram/{KeyboardBuilderTest,ResponderTest}.php`, `backend/tests/Arch/TelegramArchTest.php` (new)

## API contract

Bot API methods used by the responder: `sendMessage`, `editMessageText`, `editMessageReplyMarkup`,
`answerCallbackQuery` (`text`, `show_alert`), `setMessageReaction`, `sendSticker`, `sendVenue`, `sendMediaGroup`.
Inline button JSON: `{"text": "…", "callback_data" | "url" | "web_app": {"url": …}, "style": "primary" | "danger"}`.

## Business rules

- Kept: BR-BOT-001, BR-BOT-002, BR-BOT-003, BR-BOT-004, BR-BOT-005, BR-BOT-076.
- No DEV here; DEV-035 (settings headers as text) is applied in KV-TG-045.

## Acceptance criteria

- A callback handler that returns `[EditMessage, Toast]` produces exactly `editMessageText` then one
  `answerCallbackQuery` with `text`.
- `MessageNotModified` on a re-render yields no error and still answers the callback.
- A button with 65 bytes of `callback_data` cannot be built.
- `selected(true)` labels start with `✅ `; `primary()` / `danger()` emit the `style` field.
- The arch test fails when any class other than the `/owner` handler instantiates `ReplyKeyboard`.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | keyboard with `callback('⏸ Пауза', 'k1:sb:a1:ps')` and `primary()` on another button | JSON as documented, `FakeBotApi` validators pass |
| 2 | `selected(true)` on `выкл` | label `✅ выкл` |
| 3 | `url('x', 'http://example.org')` | exception (not https / not allow-listed) |
| 4 | `[EditMessage, Alert]` on a callback | edit, then `answerCallbackQuery` with `show_alert: true` |
| 5 | two `Toast` replies in one callback | exception in tests (one answer per callback) |
| 6 | fake answers `400 message is not modified` to the edit | no exception; answer still sent |
| 7 | fake answers `403` to `sendMessage` | `ChatUnreachable` handed to the reachability handler |
| 8 | arch test | `ReplyKeyboard` only in `App\Telegram\Handlers\Owner\*` |

## Edge cases

- Clients that do not render `style` show default buttons — harmless (Bot API ignores unknown style on old clients).
- `web_app` buttons are not allowed in group chats; groups are ignored anyway (KV-TG-020).
- An edit of a message older than Telegram allows fails with `MessageCantBeEdited`: the handler's next step (if any)
  sends a new message only when the conversation needs it (wizard, KV-TG-028).

## Security

- SEC-REQ-019 (button URLs allow-listed), SEC-REQ-020 (texts escaped before they reach the replies), SEC-REQ-011
  (`callback_data` length checked at build time).

## Definition of done

Tests green (`make ci-backend`), conventions table written, F-BOT-015 parity-gate row updated, PR reviewed by the other
developer.
