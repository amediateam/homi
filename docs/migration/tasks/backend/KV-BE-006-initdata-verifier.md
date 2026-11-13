# KV-BE-006 — Telegram `initData` verifier

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-ACCESS-001 |
| Dependencies | KV-QA-003 (signer) |

## Goal

One pure service verifies Telegram Mini App `initData` exactly as SEC-REQ-001 specifies and returns a typed
`TelegramInitData`, or throws a precise reason. The legacy `tma` guard (KV-BE-007) and HANDOFF T6
(`POST /api/v1/auth/telegram`) both use it, so the HMAC is implemented once.

## Legacy reference

- Transport: `Authorization: tma <initData>` on every request (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:77-78`);
  `initData` from `Telegram.WebApp.initData` or the `tgWebAppData` hash value
  (`$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:111-125`; TMA-006, TMA-007).
- Server rule: HMAC with a key derived from the main bot token plus an `auth_date` check
  (`$KVADRO_ROOT/docs/about.md:337-338`, `:403`; BR-API-004, BR-API-005, BR-API-008); window and failure status unknown
  (Q-API-002, Q-API-003; LB-API-019).
- `initData` carries personal data in a header (LB-API-020).
- Requirements: SEC-REQ-001 (algorithm, duplicate keys, 4 KB cap, `hash_equals`), SEC-REQ-002 (window), SEC-REQ-003
  (header only, fingerprint in logs), SEC-REQ-012 (token rotation invalidates old `initData`); test plan `16` §5.1,
  §5.4; `15` §3.2 rows 1–5, 8, 9, 12. HOMI: `backend/config/telegram.php:18` (`bot.token`), ADR-0003, HANDOFF T6.

## Implementation

1. Read `.ai/agents/security-reviewer.md`, `.claude/skills/laravel-owasp-security/`, ADR-0003 and the T6 card in
   `docs/reference-codebase/a-auth-api-media.md` (algorithm description only; `app.uz` is not opened).
2. Write the unit tests first (below); until KV-QA-003 lands, sign hand-built fixtures in the test itself.
3. `php artisan make:class Domain/Identity/TelegramInitData --no-interaction` — readonly value object: `telegramUserId`
   (int), `isPremium`, `hasUsername`, `hasPhoto` (bool), `languageCode` (?string), `authDate` (`CarbonImmutable`),
   `startParam` (?string), `fingerprint` (first 12 hex of `sha256(hash)`). It never holds first/last name, username or
   photo URL values.
4. `php artisan make:class Services/Identity/TelegramInitDataVerifier --no-interaction` with
   `verify(string $raw, ?int $maxAgeSeconds = null): TelegramInitData`:
   reject input > 4096 bytes before parsing; parse the query string manually (`explode('&')`, `urldecode` per pair) so
   that duplicate keys are detected and rejected; require `hash` (64 hex) and a JSON `user` with an integer `id`; build
   the data-check-string from every other pair sorted by key (`key=value`, joined with `\n`), including `signature` if
   present (per the current Telegram documentation — pinned by a real dev-bot fixture); secret = `HMAC-SHA256(key:
   "WebAppData", data: bot token)`; compare `hex(HMAC-SHA256(key: secret, data: dcs))` with `hash` using `hash_equals`;
   check `auth_date`: older than the window → `InitDataExpired`; more than 60 s in the future → invalid.
5. Configuration in `backend/config/telegram.php`: `initdata.max_age` (`TELEGRAM_INITDATA_MAX_AGE`, default 86 400)
   and `initdata.exchange_max_age` (`TELEGRAM_INITDATA_EXCHANGE_MAX_AGE`, default 3 600, for T6). The bot token is the
   **current environment's** `telegram.bot.token`; an empty token makes every verification fail (fail closed).
6. Exceptions: `App\Exceptions\Identity\InvalidInitData` (with an internal reason enum: `too_large`, `duplicate_key`,
   `missing_hash`, `bad_user`, `bad_signature`, `future_auth_date`) and `InitDataExpired`; neither message contains the
   raw value.
7. Pint, PHPStan, tests.

## Files

- `backend/app/Domain/Identity/TelegramInitData.php` (new)
- `backend/app/Services/Identity/TelegramInitDataVerifier.php` (new)
- `backend/app/Exceptions/Identity/{InvalidInitData,InitDataExpired}.php` (new; `InitDataExpired` may already exist
  from KV-BE-005)
- `backend/config/telegram.php`
- `backend/tests/Unit/Identity/TelegramInitDataVerifierTest.php` (new),
  `backend/tests/Fixtures/Telegram/initdata/*.txt` (synthetic, signed with the test token of `phpunit.xml`)
- `backend/phpunit.xml` (synthetic `TELEGRAM_BOT_TOKEN` test value if KV-QA-003 has not added it)

## API contract

Internal: `TelegramInitDataVerifier::verify(string $raw, ?int $maxAgeSeconds = null): TelegramInitData` throws
`InvalidInitData` or `InitDataExpired`. HTTP mapping (KV-BE-007, KV-BE-005): invalid → `401 {"detail":"unauthorized"}`,
expired → `401 {"detail":"auth_expired"}` on legacy routes; T6 maps them to the v1 envelope with `code`.

## Business rules

Kept: BR-API-004, BR-API-005 (HMAC + freshness), BR-API-008 (per-environment token). DEV-002 (documented window and
`auth_expired`) is `PROPOSED`: the window is configurable, default 86 400 s, never shorter than the measured legacy
window (Q-API-002); the expiry test is written and marked `->todo('DEV-002 PROPOSED')` for the client-visible part.

## Acceptance criteria

- A fixture signed with the test token passes; reordering its fields still passes.
- One changed character in `user`, `auth_date`, `start_param` or `hash` fails; a missing `hash`, a wrong-length `hash`,
  a duplicate key, a non-JSON `user`, a non-integer `user.id`, a 4 097-byte value and a signature made with another
  token each fail with their reason.
- `auth_date` = now − window + 1 s passes; now − window − 1 s throws `InitDataExpired`; now + 61 s fails.
- An empty configured token fails every input.
- A fixture signed by an independent implementation (KV-QA-003's Python standard-library signer) passes, and its
  one-byte mutation fails.

## Tests

`backend/tests/Unit/Identity/TelegramInitDataVerifierTest.php` (frozen clock with `$this->travelTo()`):
- `it('accepts initData signed with the environment token')`, `it('ignores field order')`.
- dataset `it('rejects tampered initData', …)` with one mutation per field.
- dataset `it('rejects malformed initData', …)`: missing hash, short hash, duplicate key, non-JSON user, string id,
  oversized input, empty string, `tma`-prefixed string.
- `it('rejects initData signed with another bot token')` (SEC-REQ-012 rotation case).
- `it('enforces the auth_date window at its boundaries')`; `it('rejects auth_date in the future beyond 60 seconds')`.
- `it('verifies a payload that carries a signature field')`.
- `it('agrees with the independent signer fixture')` (KV-QA-003).
- `it('never exposes the raw value in exception messages')`.

## Edge cases

- `+` and `%20` encodings in `user` JSON must decode identically to Telegram's URL encoding.
- Unicode names inside `user` must not break JSON decoding; they are discarded after the booleans are derived.
- `auth_date` as a non-numeric string → invalid, not a PHP warning.
- Missing `language_code` → `null` (locale default decided by KV-BE-007).

## Security

SEC-REQ-001, SEC-REQ-002, SEC-REQ-003 (fingerprint only), SEC-REQ-012 (another token fails), SEC-REQ-036 (names,
username and photo URL never leave the verifier), constant-time comparison; reviewed against
`.ai/agents/security-reviewer.md` before merge.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint and PHPStan level 7 clean; `TELEGRAM_INITDATA_MAX_AGE` and
`TELEGRAM_INITDATA_EXCHANGE_MAX_AGE` announced and added to `backend/.env.example` in a separate PR; HANDOFF T6 noted in
the PR as the second consumer.
