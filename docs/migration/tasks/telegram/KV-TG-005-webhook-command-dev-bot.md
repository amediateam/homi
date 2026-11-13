# KV-TG-005 — `telegram:webhook set|info|delete` for the dev bot only

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-012 |
| Dependencies | KV-TG-004 (client); KV-TG-003 (`allowed_updates` list); last part of HANDOFF T1; related: the live check through a tunnel is KV-INF-001 (DEC-24) |
## Goal

A developer can register, inspect and remove the webhook of **their own dev bot** with one artisan command; the
command refuses to run in staging and production, so those webhooks stay with the production track
(`docs/handoff/parallel-work.md` §7). The application side of `docs/infrastructure/telegram-webhook.md` is written.

## Legacy reference

- One webhook per bot, set with `setWebhook`; the switch at the cut-over is one call (`04` §1 row "Webhook", `04` §6.3
  item 7, `$KVADRO_ROOT/docs/about.md:408-411`); BotFather and webhook settings per environment: `17` §2.
- Cut-over parameters (`drop_pending_updates=false`, `allowed_updates`, `secret_token`): `18` §6 step T0.4; DEC-17.
- HOMI: HANDOFF T1 ("`php artisan telegram:webhook set|info|delete` for the local dev bot that refuses
  staging/production"); `backend/config/telegram.php:22-35`; `backend/.env.example` keys `TELEGRAM_WEBHOOK_URL`,
  `TELEGRAM_WEBHOOK_SECRET`.
- SEC-REQ-012 ("`telegram:webhook` refuses staging and production").

## Implementation

1. Tests first (`php artisan make:test --pest Bot/WebhookCommandTest`).
2. `php artisan make:command Telegram/WebhookCommand --no-interaction`, signature
   `telegram:webhook {action : set|info|delete} {--drop-pending : drop updates waiting at Telegram}`.
3. Guard first: if `app()->environment(['staging', 'production'])` → print "Webhooks of staging and production are set
   by the production track from the server (first developer approves)." and exit `1` before any call.
4. `set`: refuse when `telegram.webhook.secret` is empty (fail-closed) or `TELEGRAM_WEBHOOK_URL` is not `https`; call
   `setWebhook` with `url`, `secret_token`, `allowed_updates` (config), `max_connections` (config),
   `drop_pending_updates` (`false` unless `--drop-pending`); print the result.
5. `info`: `getWebhookInfo` → url, `pending_update_count`, `last_error_date` (Asia/Tashkent), `last_error_message`,
   `max_connections`, `allowed_updates`; never the secret, never the token.
6. `delete`: `deleteWebhook` with `drop_pending_updates` per the option.
7. Write `docs/infrastructure/telegram-webhook.md` (application side): the flow secret → ledger → queue → router, the
   env keys, the ledger states, the redaction rules (KV-TG-003), the command, the secret rotation window
   (KV-TG-001), and a short "production track" paragraph pointing to KV-INF-017 and KV-INF-031 for staging and
   production. The live-check procedure with a tunnel is added by KV-INF-001.

## Files

- `backend/app/Console/Commands/Telegram/WebhookCommand.php` (new)
- `backend/tests/Feature/Bot/WebhookCommandTest.php` (new)
- `docs/infrastructure/telegram-webhook.md` (new)

## API contract

CLI: `php artisan telegram:webhook set|info|delete [--drop-pending]`; exit `0` on success, `1` on refusal or a Bot API
error (message printed without secrets). Outbound Bot API: `setWebhook`, `getWebhookInfo`, `deleteWebhook`.

## Business rules

- SEC-REQ-012 (no webhook change for staging or production from this command), CF-009 (one webhook per environment's
  bot), DEC-17 (pending updates are kept by default: `drop_pending_updates=false`).
- No DEV.

## Acceptance criteria

- With `APP_ENV=staging` or `production` every action exits `1` and `FakeBotApi::assertNothingSent()` holds.
- `set` on `local` sends the four parameters from config; `allowed_updates` equals the KV-TG-003 list.
- `info` output contains no secret and no token (asserted on the captured output).
- The doc exists and is linked from `docs/infrastructure/local-development.md` (one line).

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `APP_ENV=production`, `telegram:webhook set` | exit 1, refusal text, nothing sent |
| 2 | `APP_ENV=staging`, `info` | exit 1, nothing sent |
| 3 | `local`, secret empty, `set` | exit 1, "secret is not configured" |
| 4 | `local`, `set` | `setWebhook` with url, `secret_token`, three `allowed_updates`, `max_connections=40`, `drop_pending_updates=false` |
| 5 | `local`, `set --drop-pending` | `drop_pending_updates=true` |
| 6 | `local`, `info` with a fake `last_error_date` | date printed in Asia/Tashkent; output has neither secret nor token |
| 7 | fake answers `401` | exit 1, message without the token |

## Edge cases

- The dev bot is personal: two developers sharing one bot overwrite each other's webhook
  (`docs/handoff/parallel-work.md` §7); the doc says so.
- `TELEGRAM_WEBHOOK_URL` pointing at a `.loc` host: Telegram cannot reach it; `set` warns and still sends (the tunnel
  forwards with `Host: hook.homi.loc`, KV-INF-001).
- `config:cache` with an old URL: the command reads the cached config; the doc tells to re-cache.

## Security

- SEC-REQ-012 (environment refusal), SEC-REQ-013 (no token or secret in output), SEC-REQ-034 (secret required).
- Production Telegram is never contacted by this command.

## Definition of done

Tests green (`make ci-backend`), `docs/infrastructure/telegram-webhook.md` reviewed by the first developer (it is read by
the production track), HANDOFF T1 can be marked done together with KV-TG-001 … KV-TG-004, PR reviewed by the other
developer.
