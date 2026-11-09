# KV-BE-008 — Log and Telescope redaction

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); production log format of nginx and Telescope settings outside `local` **[PT]** |
| Complexity | S |
| Feature IDs | F-ACCESS-001, F-PRIVACY-004 |
| Dependencies | — |

## Goal

No application log, exception report or Telescope entry ever contains `initData`, an `Authorization` value, a bot
token, the webhook secret, a phone number, a shared contact or an event body — in any environment — before the first
legacy route or bot handler ships. Telescope is explicitly configurable per environment.

## Legacy reference

- `initData` (Telegram user object, `start_param`, hash) travels in `Authorization` on every request
  (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:77-78`; LB-API-020, defect fix APPROVED by policy: redact everywhere).
- Personal data promises: names, contacts, messages not stored (`$KVADRO_ROOT/docs/about.md:264-275`; BR-API-125,
  BR-API-131; BR-BOT-085); phones only masked (`+998***`).
- HOMI today: `backend/config/telescope.php:19` (`TELESCOPE_ENABLED` default `true`, not in `.env.example`);
  `backend/app/Providers/TelescopeServiceProvider.php:24-50` (outside `local` keeps failed requests, failed jobs and
  reportable exceptions with payloads; only `_token` hidden from parameters; `cookie`, `x-csrf-token` headers hidden);
  `backend/config/logging.php` (channels with `PsrLogMessageProcessor` only).
- Findings SEC-034, SEC-030 (raw update payloads), SEC-022; requirements SEC-REQ-013 (bot token pattern), SEC-REQ-047
  (logging without PII); tests `16` §5.8, `15` §3.2 row 8 (fingerprint instead of value).

## Implementation

1. Read `.claude/skills/telescope-debugging/`, `.claude/skills/laravel-owasp-security/` (logging) and
   `.ai/agents/security-reviewer.md`.
2. Tests first (below).
3. `php artisan make:class Logging/RedactSensitiveData --no-interaction`: a Monolog processor (`ProcessorInterface`)
   that walks `message`, `context` and `extra` recursively and replaces: `Authorization` header values (any scheme),
   `tma <…>` strings, `initData`/`tgWebAppData` query-string-shaped values (`(^|[?&#])(tgWebAppData|initData|hash|user)=`),
   the bot-token pattern `\d{6,12}:[A-Za-z0-9_-]{30,40}` → `bot***`, the configured webhook secret, phone numbers
   (`\+?998[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}` and local 9-digit forms) → `+998***`, keys named `contact`,
   `phone_number`, `first_name`, `last_name`, `username`, `text`, `caption` → `[redacted]`.
4. Attach the processor to every channel in `backend/config/logging.php` (`'processors' => [PsrLogMessageProcessor,
   RedactSensitiveData]`, plus `tap` for `single`/`daily`/`stack` channels) so it runs before any handler.
5. Telescope: in `TelescopeServiceProvider::hideSensitiveRequestDetails()` hide headers `authorization`,
   `x-telegram-bot-api-secret-token`, `cookie`, `set-cookie`, `x-csrf-token`, `x-xsrf-token` and parameters `_token`,
   `initData`, `tgWebAppData`, `contact`, `phone`, `text` in **every** environment (remove the local early return for
   these lists); add a `Telescope::filter` rule that drops request payloads of the `legacy` route group and
   `/telegram/webhook`, and a job-payload filter (`Telescope::tag`/`filterBatch`) that drops `ProcessTelegramUpdateJob`
   payloads.
6. Add `TELESCOPE_ENABLED` to `backend/.env.example` (separate shared-file PR), documented `false` for production unless
   SEC-034 is closed otherwise **[PT]**.
7. A one-line helper `App\Support\LogFingerprint::of(string $secret): string` (first 12 hex of SHA-256) used by
   KV-BE-007 instead of values.
8. Note for the production track in the PR: nginx log format without `Authorization`, without query strings on
   `/media`, without the token segment on `/call` (SEC-REQ-047, SEC-REQ-026) **[PT]**.

## Files

- `backend/app/Logging/RedactSensitiveData.php`, `backend/app/Support/LogFingerprint.php` (new)
- `backend/config/logging.php`, `backend/app/Providers/TelescopeServiceProvider.php`
- `backend/tests/Feature/Security/LogRedactionTest.php`, `backend/tests/Unit/Logging/RedactSensitiveDataTest.php` (new)
- `backend/.env.example` (`TELESCOPE_ENABLED`, separate PR)

## API contract

n/a — no HTTP surface; the contract is the processor's output: redacted values replaced by fixed markers (`[redacted]`,
`bot***`, `+998***`) and fingerprints in place of credentials.

## Business rules

Supports BR-API-125 (no texts), BR-API-131, BR-DATA-003 and the `/privacy` promises; LB-API-020 defect fix asserted.

## Acceptance criteria

- A captured log of: a legacy request with a valid `tma` header that fails later with a `500`, a webhook request with
  a wrong secret, a Bot API transport error, and an `app_error`-like payload contains none of the patterns of
  SEC-REQ-047 (test scans the captured records).
- With a non-local Telescope configuration (`app()->detectEnvironment(fn () => 'staging')` in the test) the stored
  request entry has no `authorization` header value and no payload for legacy routes.
- `TELESCOPE_ENABLED` is listed in `.env.example`.

## Tests

`backend/tests/Unit/Logging/RedactSensitiveDataTest.php` — dataset of inputs → expected redaction: `tma query_id=…`,
`Bearer 1|abc`, a synthetic bot token `123456789:AA…`, `+998 00 000 00 00`, `998000000000`, nested context arrays,
objects with `__toString`, a string without secrets (unchanged).
`backend/tests/Feature/Security/LogRedactionTest.php` — `Log::listen` capture across the four flows of the acceptance
criteria; `it('stores no authorization header in telescope outside local')` with `Telescope::store` faked
(`Telescope::withoutRecording` off, in-memory storage).

## Edge cases

- A phone-like number inside a price (`1 200 000`) must not be redacted: the patterns require the `998` prefix or a
  9-digit block with operator code; covered by a negative case.
- Very large contexts: the processor stops at depth 8 and replaces deeper values with `[truncated]`.
- Exceptions whose message contains the bot URL (`api.telegram.org/bot<token>/…`) are rewritten (SEC-REQ-013).

## Security

SEC-REQ-047, SEC-REQ-013, SEC-REQ-003 (fingerprints), SEC-034 (Telescope), SEC-REQ-036 (minimisation). Reviewed with
`.ai/agents/security-reviewer.md`.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint and PHPStan level 7 clean; production nginx log-format note handed to the
production track in the PR description; `TELESCOPE_ENABLED` added to `.env.example` in its own PR.
