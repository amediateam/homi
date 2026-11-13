# KV-QA-003 — Telegram test kit: initData signer, update factory, fake Bot API

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | M |
| Feature IDs | F-ACCESS-001, F-BOT-012, F-BOT-015 (and every bot and Mini App feature through the suites that use the kit) |
| Dependencies | none (the verifier of T6 and the webhook of T1 consume it later) |

## Goal

Tests can sign synthetic `initData`, build any Telegram update, and capture and validate every outbound Bot API call
without touching the network. The signer is cross-checked against an independent implementation.

## Legacy reference

- `initData` transport and validation: `08` §1.2, TMA-006, TMA-007, BR-API-004 … BR-API-010.
- Algorithm and acceptance: SEC-REQ-001, SEC-REQ-002, SEC-REQ-005 (`16` §4.1).
- Webhook and bot: SEC-REQ-008 … SEC-REQ-011, SEC-REQ-013, SEC-REQ-019, SEC-REQ-020, SEC-REQ-029 (`16` §4.2–§4.6).
- Legacy fake Telegram object: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:7-60` (shape of `WebApp`; its
  `hash=deadbeef` is not a valid signature and is not reused).
- HOMI: `backend/config/telegram.php`, `backend/routes/hooks.php:15-17`,
  `backend/app/Http/Middleware/VerifyTelegramSecretToken.php`.

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md`, `16` §4.1–§4.2 and the current Telegram documentation on validating
   Mini App data (including the `signature` field) — record the date checked in the PR.
2. `backend/tests/Support/Telegram/InitDataFactory.php`: builder for user (id, `language_code`, flags), `auth_date`,
   `start_param`, `query_id`, extra fields; `signedWith(string $token)` computes the hash per SEC-REQ-001 (secret =
   HMAC-SHA-256 of the token keyed with `WebAppData`; data-check-string = sorted `key=value` lines without `hash`);
   `tamper(string $field)`, `withDuplicateKey()`, `oversized()`, `asHeader()` → `tma <query string>`.
3. `scripts/qa/sign_init_data.py`: an independent signer (Python standard library `hmac`, `hashlib`). Run it once to
   produce `backend/tests/Fixtures/Telegram/initdata-crosscheck.json` (three synthetic cases with the expected hash).
4. `backend/tests/Support/Telegram/UpdateFactory.php`: `command('/start', payload)`, `text()`, `callback(data,
   messageId)`, `contact(userId, phone)` (phone `+998000000001`), `forwardedContact()`, `voice()`, `photo()`,
   `myChatMember(status)`, group-chat variants, `editedMessage()`, `inlineQuery()`; `update_id` increases
   monotonically per factory instance; `from.id` values are synthetic (`10_000_001` …).
5. `backend/tests/Support/Telegram/FakeBotApi.php`: installs `Http::fake()` for `https://api.telegram.org/bot*/*`,
   records `[method, params]`, and validates every call: text ≤ 4 096 and caption ≤ 1 024 characters,
   `callback_data` ≤ 64 bytes (UTF-8), HTML well formed with only Telegram's allowed tags, `url` and `web_app` buttons
   `https` on the allow-list. Programmable answers: ok, `429` with `retry_after`, `403` (bot blocked), `400` (message
   is not modified). Assertions: `assertSent()`, `assertSentInOrder()`, `assertNothingSent()`, `calls()`.
6. In `backend/tests/TestCase.php`, call `Http::preventStrayRequests()` in `setUp()`; adjust any existing test that
   relied on a real request (none expected).
7. Synthetic token and webhook secret for tests in `backend/phpunit.xml` under the keys `config/telegram.php` reads
   (format-valid, obviously fake values such as `123456:TEST…`).
8. Self-tests for the factory, the cross-check fixture and the fake.

## Files

- `backend/tests/Support/Telegram/{InitDataFactory,UpdateFactory,FakeBotApi}.php` (new)
- `backend/tests/Fixtures/Telegram/initdata-crosscheck.json` (new)
- `backend/tests/Unit/Telegram/{InitDataFactoryTest,FakeBotApiTest}.php` (new)
- `backend/tests/TestCase.php`, `backend/phpunit.xml`
- `scripts/qa/sign_init_data.py` (new)

## API contract

n/a (test support). The `tma` header format is `08` §1.2.

## Business rules

BR-API-004 (every request authenticated from its own `initData`), BR-API-008 (bound to the bot token), BR-API-010
(empty `tma ` rejected silently).

## Acceptance criteria

- The PHP factory reproduces the three hashes of `initdata-crosscheck.json` byte for byte.
- Reordering fields does not change the hash; tampering any field does.
- `FakeBotApi` rejects a 65-byte `callback_data`, a 4 097-character text, `<script>`, an unclosed `<b>` and an
  `http://` button, each with a clear message.
- A test that makes a real HTTP request fails because of `preventStrayRequests()`.
- `make ci-backend` stays green.

## Tests

`InitDataFactoryTest` (cross-check, order independence, tamper, duplicate key, oversized), `FakeBotApiTest` (each
validator, programmable answers, ordering assertions), `UpdateFactoryTest` (unique ascending `update_id`, contact
belongs to `from.id` unless forwarded).

## Edge cases

- Telegram may add fields to `initData` (`signature`); the data-check-string rules must follow the current docs.
- `callback_data` length is counted in bytes: Cyrillic labels are not in `callback_data`, but ids are.
- `parse_mode` absent → plain text; the validator must not apply HTML rules then.

## Security

- Only synthetic tokens and secrets; the dev, staging and production bot tokens are never read (SEC-REQ-034).
- The kit never logs the token; a test asserts the token does not appear in captured log records (SEC-REQ-013).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated where they
cite the kit, PR reviewed by the other developer.
