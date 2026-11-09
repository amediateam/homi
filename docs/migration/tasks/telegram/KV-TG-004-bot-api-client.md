# KV-TG-004 — In-house Bot API client with error classes and token redaction

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-012, F-BOT-015 |
| Dependencies | KV-QA-003 (`FakeBotApi`); DEC-23 (in-house client recommended — no dependency); log and Telescope redaction of SEC-REQ-047 (backend track) for the log side; third part of HANDOFF T1 |

## Goal

Every outbound call to the Telegram Bot API goes through one small client built on Laravel's HTTP client: typed
methods for everything the legacy bot uses, one exception hierarchy that callers can branch on (`429`, blocked bot,
"message is not modified", …), and no way for the bot token to appear in an exception message, a log record or a job
payload.

## Legacy reference

- Bot API features the legacy bot depends on: `04` §1 paragraph "Bot API features the bot depends on"
  (`$KVADRO_ROOT/docs/about.md:309-326`), BR-API-141: inline keyboards with `callback_data`, `web_app` and `url`
  buttons, button styles `primary` / `danger` (Bot API 9.x, BR-BOT-004), `editMessageText` / `editMessageReplyMarkup`,
  `answerCallbackQuery` with text and `show_alert` (BR-BOT-002), localised `setMyCommands`, descriptions in three
  languages, menu button and Main Mini App, `sendSticker`, `sendPhoto` with caption, `sendMediaGroup`, `sendVenue`, HTML
  with expandable blockquote, `setMessageReaction` (BR-BOT-052), reply keyboard with `request_contact` (BR-BOT-005).
- Prepared inline messages for sharing (API-017, BR-API-118) are built by the backend share service on this client.
- HOMI: `backend/config/telegram.php:37-43` (`base_url`, timeouts, `retries`, `max_retry_after`), HANDOFF T1 names
  `TelegramClient` / `TelegramBot` / `TelegramException`; `10` §4.14 row "Telegram Bot API".
- Requirements SEC-REQ-013 (token never in logs), SEC-REQ-019 (button URLs allow-listed), SEC-REQ-029 (pacing —
  KV-TG-050 builds on this client).

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md`, `.claude/skills/laravel-best-practices/` and the current Bot API
   documentation (record the version and the date checked in the PR; confirm the button `style` field and the
   `expandable_blockquote` entity). Tests first (`php artisan make:test --pest --unit Telegram/TelegramClientTest`).
2. `php artisan make:class Telegram/Client/TelegramClient`: `call(string $method, array $params = [], array $files =
   []): array` — builds `{base_url}/bot{token}/{method}` internally, JSON body (multipart when `$files` is set),
   `timeout` / `connectTimeout` from config, returns `result` on `ok: true`. Retries (`http.retries`) only on
   connection errors and `5xx`; never sleeps on `429`.
3. `php artisan make:class Telegram/Client/TelegramException` (base) and subclasses: `TooManyRequests` (carries
   `retry_after`), `ChatUnreachable` (`403` bot blocked, user deactivated, kicked), `MessageNotModified`,
   `MessageNotFound` / `MessageCantBeEdited` (`400` variants), `QueryTooOld` (stale `answerCallbackQuery`),
   `BadRequest`, `ServerError`, `TransportError`. Messages are built from the method name and Telegram's
   `description` only; a transport exception is caught and rethrown with the URL rewritten to `/bot***/`.
4. `php artisan make:class Telegram/Client/TelegramBot`: typed wrappers — `sendMessage`, `sendPhoto`,
   `sendMediaGroup`, `sendSticker`, `sendVenue`, `editMessageText`, `editMessageCaption`, `editMessageReplyMarkup`,
   `deleteMessage`, `answerCallbackQuery`, `setMessageReaction`, `setMyCommands` / `getMyCommands` /
   `deleteMyCommands` (scope + `language_code`), `setMyDescription` / `getMyDescription`, `setMyShortDescription` /
   `getMyShortDescription`, `getMyName`, `setChatMenuButton` / `getChatMenuButton`, `setWebhook` / `getWebhookInfo` /
   `deleteWebhook`, `getMe`, `getFile` (voice, KV-TG-039), `getStickerSet` (KV-TG-013), `leaveChat` (KV-TG-020),
   `savePreparedInlineMessage` (backend share service). Parameters are arrays shaped exactly as the Bot API expects;
   keyboards come from KV-TG-010.
5. `max_retry_after` (config) is the threshold for interactive replies: a `429` with a longer wait is not retried by
   handlers (the reply would be stale); bulk senders release their job instead (KV-TG-050).
6. One client per bot configuration (`TelegramBot::fromConfig()`); the token is read at call time, never stored in a
   job property or serialised into a queue payload.
7. The Monolog / Telescope redaction of the bot-token pattern and the webhook secret is part of the backend log
   redaction (SEC-REQ-047, SEC-REQ-013); this task adds the client-side test that proves nothing token-shaped leaves
   the client.
8. Library alternative (`nutgram/nutgram` and others, `10` §4.14): not used; any of them is `PROPOSED — needs approval
   (dependency change)` under DEC-23.

## Files

- `backend/app/Telegram/Client/{TelegramClient,TelegramBot,TelegramException}.php` (new)
- `backend/app/Telegram/Client/Exceptions/*.php` (new: the subclasses of step 3)
- `backend/config/telegram.php` (comments for `retries`, `max_retry_after`)
- `backend/tests/Unit/Telegram/{TelegramClientTest,TelegramBotTest,TelegramExceptionMappingTest}.php` (new)

## API contract

Outbound only: `POST {TELEGRAM_API_BASE_URL}/bot<token>/<method>` with JSON (or multipart) parameters; response
`{"ok": true, "result": …}` or `{"ok": false, "error_code": n, "description": "…", "parameters": {"retry_after": n}}`.

| Telegram answer | Exception |
| --------------- | --------- |
| `429` with `retry_after` | `TooManyRequests` |
| `403` "bot was blocked by the user" / "user is deactivated" / "bot was kicked" | `ChatUnreachable` |
| `400` "message is not modified" | `MessageNotModified` |
| `400` "message to edit not found" / "message can't be edited" | `MessageNotFound` / `MessageCantBeEdited` |
| `400` "query is too old" | `QueryTooOld` |
| other `400` | `BadRequest` |
| `5xx` after retries | `ServerError` |
| connection failure after retries | `TransportError` |

## Business rules

- BR-API-141 (the feature set the client must cover), BR-BOT-002 (toast vs alert through `answerCallbackQuery`),
  BR-BOT-004 (button styles), BR-BOT-052 (reaction).
- No DEV; no user-visible behaviour of its own.

## Acceptance criteria

- Every method of step 4 sends the documented method name and parameters (asserted with `FakeBotApi`).
- The mapping table above holds for each Telegram answer.
- A forced connection error against a fake host produces exception messages, log records and Telescope entries
  without the token (SEC-REQ-013 acceptance).
- A serialised job that holds a `TelegramBot` contains no token string.
- `Http::preventStrayRequests()` (KV-QA-003) stays green: no test reaches the network.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `sendMessage` with `parse_mode: HTML` and an inline keyboard with `style: primary` | captured params match; `FakeBotApi` validators pass |
| 2 | fake answers `429 retry_after=3` | `TooManyRequests` with `retryAfter() === 3`; no second request |
| 3 | fake answers `500` twice then `200` with `retries = 2` | result returned after 3 requests |
| 4 | fake answers `403` "Forbidden: bot was blocked by the user" | `ChatUnreachable` |
| 5 | fake answers `400` "message is not modified" | `MessageNotModified` |
| 6 | connection exception to `https://api.telegram.test` | `TransportError`; message contains `/bot***/`, not the synthetic token |
| 7 | `setMyCommands` with `scope: {type: chat, chat_id}` and `language_code: uz` | params as documented |
| 8 | `sendPhoto` with an uploaded file | multipart request, caption and `parse_mode` present |
| 9 | `serialize()` of a job holding the bot | no token substring |

## Edge cases

- Bot API adds fields (for example a new button property): parameters are plain arrays, so no client release is
  needed; unknown response fields are ignored.
- Telegram answers `200` with `ok: false` in rare cases: treated like the matching error code.
- `retry_after` larger than the queue timeout: the job is released, never slept (`.ai/agents/telegram-bot-engineer.md`
  rule 8).

## Security

- SEC-REQ-013 (token never in messages, logs, Telescope, job payloads), SEC-REQ-034 (token read from config only),
  SEC-REQ-019 (URL buttons validated by KV-TG-010 before they reach the client).
- No dependency added (DEC-23); a library would need approval.

## Definition of done

Tests green (`make ci-backend`), the Bot API version checked is written in the PR and in
`docs/infrastructure/telegram-webhook.md`, the F-BOT-012 parity-gate row cites the token-redaction test, PR reviewed by
the other developer.
