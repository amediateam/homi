# KV-TG-059 — Scheduled webhook health check and bot metrics

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-012 |
| Dependencies | KV-TG-004 (client), KV-TG-002 (update job to instrument), KV-INF-007 (scheduler), KV-INF-011 (metrics registry); related: alert rules are in KV-INF-025 |
## Goal

The bot can never stop silently: `php artisan telegram:health` reads `getWebhookInfo` and `getMe` (read-only, no
secrets), compares them with the environment's configuration, and publishes gauges every 5 minutes; the update
pipeline and the sender count what they do. The production monitor alerts from these metrics, and the cut-over runbook
uses the same command to check the webhook switch.

## Legacy reference

- No legacy monitoring is visible; one webhook per bot (`04` §1 row "Webhook", `04` §6.3 item 7).
- Scheduler entry "Webhook health (`getWebhookInfo`) — every 5 min — alert on `last_error_date`, pending count"
  (`10` §4.11); metrics list `10` §4.17; alert rows "Webhook errors" and "Webhook latency" (`17` §12); cut-over checks
  `18` §5.2 ("`getWebhookInfo` shows the HOMI URL, no `last_error_date`, pending count falling") and `18` §6 T0.5,
  GO + 30 min; error budget "Webhook: zero non-2xx; pending count < 100" (`18` §5.4).
- Requirement SEC-REQ-048 (alerts incl. webhook `403`s), SEC-REQ-013 (no token in output).

## Implementation

1. Tests first (`php artisan make:test --pest Bot/TelegramHealthTest`).
2. `php artisan make:command Telegram/HealthCommand` → `telegram:health [--json]`, allowed on **every** environment
   (read-only: `getMe`, `getWebhookInfo`; never `setWebhook`):
   - prints bot username and id (from `getMe`), webhook URL, `pending_update_count`, `last_error_date` (as age),
     `last_error_message` (truncated, token-free), `max_connections`, `allowed_updates`, `ip_address`;
   - checks: URL equals `TELEGRAM_WEBHOOK_URL`; `allowed_updates` equals `telegram.webhook.allowed_updates` (KV-TG-003
     list); `last_error_date` older than the previous run; `pending_update_count` < 100; `getMe.username` equals
     `TELEGRAM_BOT_USERNAME`;
   - exit code 0 when all checks pass, 1 otherwise (usable by the runbook scripts of KV-INF-030 and smoke tests of
     KV-INF-023); `--json` prints the same fields for automation.
3. Schedule `telegram:health` every 5 minutes (`->onOneServer()->withoutOverlapping()`) in `routes/console.php`; each
   run sets gauges through the KV-INF-011 registry: `telegram_webhook_pending_updates`,
   `telegram_webhook_last_error_age_seconds`, `telegram_webhook_url_ok` (0/1), `telegram_webhook_allowed_updates_ok`,
   `telegram_health_last_run_timestamp`.
4. Instrument the pipeline: `ProcessTelegramUpdateJob` increments `telegram_updates_processed_total{type,result}`
   (`result` = `done`, `failed`, `ignored`, `duplicate`); the webhook middleware already records
   `webhook_requests_total{status}` (KV-INF-011). No user or chat ids as labels.
5. When the command runs during a paused intake (KV-TG-060) it reports the pause state as information, not as a failure;
   the pending count still counts.
6. Document the command and the meaning of each check in `docs/infrastructure/telegram-webhook.md` (section "Health").

## Files

- `backend/app/Console/Commands/Telegram/HealthCommand.php` (new)
- `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php` (instrumentation)
- `backend/routes/console.php` (schedule)
- `backend/tests/Feature/Bot/TelegramHealthTest.php` (new)

## API contract

Bot API `getMe`, `getWebhookInfo` (read-only). Artisan `telegram:health [--json]`, exit 0 / 1. Metrics exposed by the
KV-INF-011 endpoint.

## Business rules

- No BR: operational. Serves the S2 checks of `18` §5.2 and §5.4.

## Acceptance criteria

- On a correctly configured environment the command exits 0 and sets `telegram_webhook_url_ok 1`.
- A changed `last_error_date`, a pending count ≥ 100, a wrong URL or wrong `allowed_updates` each exit 1 and set the
  matching gauge.
- Output, JSON and logs never contain the token or the webhook secret.
- Running the command on staging or production performs no write call to the Bot API.

## Tests

| # | Case (`FakeBotApi` programmed `getWebhookInfo`) | Expected |
| - | ------------------------------------------------ | -------- |
| 1 | URL = config, pending 0, no error | exit 0; gauges url_ok 1, pending 0 |
| 2 | URL = another host | exit 1; url_ok 0 |
| 3 | `last_error_date` 2 minutes ago, previous run saw none | exit 1; `last_error_age_seconds` 120 |
| 4 | pending 150 | exit 1 |
| 5 | `allowed_updates` contains `edited_message` | exit 1; allowed_updates_ok 0 |
| 6 | `--json` | valid JSON with the listed fields, no token |
| 7 | `APP_ENV=production` | only `getMe` and `getWebhookInfo` called (`FakeBotApi::calls()`) |
| 8 | update job processes 3 updates, 1 fails | `telegram_updates_processed_total{type="message",result="done"} 2`, `result="failed"` 1 |
| 9 | scheduled run twice concurrently | one run (`withoutOverlapping`) |

## Edge cases

- No webhook set (dev bot without tunnel): URL empty → exit 1 with a hint; locally the scheduled run is skipped when
  `TELEGRAM_WEBHOOK_URL` is the `.loc` default and no tunnel is configured (`telegram.health.enabled`).
- Bot API unreachable: exit 1, gauge `telegram_health_last_run_timestamp` not updated → scheduler/health alert.
- During a token rotation (`18` §6 T0.3) the old token answers `401`: reported as `token_invalid`, exit 1.

## Security

- SEC-REQ-013 (no token in output or logs), SEC-REQ-048 (webhook alerts), SEC-REQ-034 (reads only this environment's
  token). Read-only on production, so it may run there without an approval per run.

## Definition of done

Tests green (`make ci-backend`), the command used in KV-INF-030 / KV-INF-031 checks, alert rules wired in KV-INF-025,
parity-gate G9 evidence for F-BOT-012 prepared, PR reviewed by the other developer (new scheduled task and metrics
announced to the production track).
