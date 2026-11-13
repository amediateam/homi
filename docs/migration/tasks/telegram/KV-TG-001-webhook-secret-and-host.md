# KV-TG-001 — Webhook authenticity: secret header, hook host, body limits

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-012 |
| Dependencies | KV-QA-003 (fake updates and synthetic secrets); CF-009 (bot identity and webhook host); first part of HANDOFF T1 |

## Goal

`POST /telegram/webhook` accepts a request only when it arrives on the hook host with the environment's
`X-Telegram-Bot-Api-Secret-Token`, a JSON body of at most 1 MB, and within the webhook limiter. Everything else is
refused before the body is parsed and before any row is written. The fail-closed stub becomes a real check.

## Legacy reference

- The legacy receiver is unknown (the backend source is unavailable); one receiver per bot, switched by one `setWebhook`:
  `04` §1 row "Webhook", `04` §6.3 item 7, `$KVADRO_ROOT/docs/about.md:408-411`.
- RES-022 (bot update endpoint, `08`); F-BOT-012 in `09` §3.21.
- HOMI stubs to replace: `backend/app/Http/Middleware/VerifyTelegramSecretToken.php:20-23` (always 403),
  `backend/routes/hooks.php:15-17` (no host constraint, SEC-031), `backend/app/Providers/AppServiceProvider.php:72`
  (limiter keyed by IP only), `backend/config/telegram.php:22-35`.
- Security findings: SEC-031 (no host binding, IP-only limiter); requirement SEC-REQ-008; test plan `16` §5.3 and
  `15` §3.3 cases 1–3.

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md` (rules 2–4), `16` §4.2, `docs/reference-codebase/b-bot-i18n-geo-ops.md`
   §B1–B2 and `docs/ai/reports/phase-3-notes.md` §C. Write the tests of the Tests section first (Pest,
   `php artisan make:test --pest Bot/WebhookAuthenticityTest`).
2. `config/telegram.php`: add `webhook.host` (derived from the host of `TELEGRAM_WEBHOOK_URL`, overridable for tests)
   and `webhook.secret_previous` + `webhook.secret_previous_until` (env `TELEGRAM_WEBHOOK_SECRET_PREVIOUS`, a timestamp
   set by the rotation procedure; the previous secret is accepted for at most 5 minutes after it).
3. `VerifyTelegramSecretToken`: read the header; refuse with `403` when the configured secret is empty, the header is
   missing, or `hash_equals` fails against the current secret (and against the previous one only inside its window).
   The comparison runs before `$request->getContent()` is touched. No log line contains either secret.
4. Body guard in the same middleware (or a small `LimitTelegramBody` middleware placed before it): `Content-Length` or
   the actual length above `telegram.webhook.max_body_bytes` → `413`; `Content-Type` other than `application/json` →
   `415`. nginx enforces `client_max_body_size 1m` as well (KV-INF-015).
5. `routes/hooks.php`: wrap the route in `Route::domain(config('telegram.webhook.host'))`; any other host gets the
   framework `404` (`15` §3.3 case 2).
6. `AppServiceProvider`: key the `telegram-webhook` limiter by bot id + IP (`bot_id` = numeric token prefix, see
   KV-TG-002) instead of IP only (SEC-031, SEC-REQ-027 webhook row).
7. Keep the controller's `501` until KV-TG-002 lands; this task only guarantees that nothing unauthenticated reaches it.
8. Add the new env names to `backend/.env.example` (blank) and announce them in the PR (`docs/handoff/parallel-work.md`
   §6); KV-INF-003 lists them in `docs/infrastructure/environments.md`.

## Files

- `backend/app/Http/Middleware/VerifyTelegramSecretToken.php` (changed)
- `backend/app/Http/Middleware/LimitTelegramBody.php` (new, if split out)
- `backend/routes/hooks.php`, `backend/config/telegram.php`, `backend/app/Providers/AppServiceProvider.php` (changed)
- `backend/.env.example` (shared file: `TELEGRAM_WEBHOOK_SECRET_PREVIOUS`)
- `backend/tests/Feature/Bot/WebhookAuthenticityTest.php` (new)

## API contract

`POST https://<hook host>/telegram/webhook`, headers `X-Telegram-Bot-Api-Secret-Token: <secret>`,
`Content-Type: application/json`, body = Telegram `Update`.

| Case | Status | Body |
| ---- | ------ | ---- |
| secret missing, wrong, other environment's, or configured secret empty | 403 | framework default; no detail about which check failed |
| correct secret on another host (`api.*`) | 404 | — |
| body > 1 MB | 413 | — |
| non-JSON content type | 415 | — |
| over the limiter | 429 | — |
| accepted | passes to the controller (`501` until KV-TG-002) | — |

## Business rules

- No BR-BOT rule governs authenticity (the legacy receiver is not observable); the rules are SEC-REQ-008 and
  CF-009 (one webhook per bot, set once per environment).
- No DEV: invisible to users and to old clients.

## Acceptance criteria

- Every refused case of the API contract table leaves `telegram_updates` empty and dispatches no job.
- With the correct secret on the hook host the request reaches the controller.
- The previous secret works inside its 5-minute window and returns `403` one second after it.
- `grep` over the captured log records of the test run finds neither secret.
- `make ci-backend` exits 0.

## Tests

Feature tests (`WebhookAuthenticityTest`, synthetic secrets from KV-QA-003, `UpdateFactory::command('/start')`):

| # | Case | Expected |
| - | ---- | -------- |
| 1 | no header | 403, no row, no job (`Queue::fake()` asserts nothing pushed) |
| 2 | wrong header | 403 |
| 3 | header equal to the staging secret while the test config holds the local one | 403 |
| 4 | `TELEGRAM_WEBHOOK_SECRET` empty, request without header | 403 |
| 5 | `TELEGRAM_WEBHOOK_SECRET` empty, request with an empty header | 403 |
| 6 | correct secret, host `api.homi.test` | 404 |
| 7 | correct secret, 2 MB body | 413 |
| 8 | correct secret, `text/plain` | 415 |
| 9 | 3 001 requests in a minute from one IP for one bot | the last one 429 |
| 10 | previous secret at rotation + 4 min / + 6 min (`travelTo`) | passes / 403 |
| 11 | correct secret on the hook host | reaches the controller |

## Edge cases

- Telegram sends the header exactly as set with `setWebhook secret_token`; values use `A-Z a-z 0-9 _ -` only, so no
  normalisation is applied.
- A request whose body is still streaming when the length is unknown (`Transfer-Encoding: chunked`) is measured after
  reading at most `max_body_bytes + 1` bytes.
- Config cache: the domain binding is read at route registration; `route:cache` on servers needs the env present at
  cache time (noted for KV-INF-023).

## Security

- SEC-REQ-008 (constant-time comparison before parsing, fail-closed, host binding, size limit); SEC-031 (host and
  limiter key); SEC-REQ-013 and SEC-REQ-047 (secrets never logged; Telescope already hides the header name per
  SEC-REQ-047 — verify in KV-INF-012).
- No PII is touched before authentication; no `Authorization` header exists on this route.

## Definition of done

Tests green (`make ci-backend`), the `15` §3.3 cases 1–3 marked as covered in the parity-gate row of F-BOT-012 (G6/G7
evidence), `docs/infrastructure/telegram-webhook.md` section "Authenticity" written (with KV-TG-005), the F-BOT-012 row
in `09` updated, PR reviewed by the other developer and by the `security-reviewer` agent.
