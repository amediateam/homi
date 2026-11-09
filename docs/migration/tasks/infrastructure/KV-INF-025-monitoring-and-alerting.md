# KV-INF-025 — Monitoring and alerting

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | M |
| Feature IDs | F-BOT-012, F-DELIVERY-002 (and F-DELIVERY-003, F-DELIVERY-006, F-COMPAT-001, F-PIPELINE-001 through their signals) |
| Dependencies | KV-INF-011 (metrics endpoint), KV-TG-059 (webhook health check), KV-INF-022 (heartbeat), KV-INF-006 (queue `waits`); the existing Grafana/Prometheus/Alertmanager on the monitoring host (`docs/ai/reports/phase-3-notes.md` §A); stage S1 exit (`17` §15 item 8) |

## Goal

Every signal of `17` §12 has a dashboard panel and an alert routed to the operations chat, each alert has been fired
from a scripted trigger on staging, and nothing personal appears in any alert text — the "alerts firing in a test"
criterion of `18` §5.1 and the watch list of `18` §10.

## Legacy reference

- No legacy monitoring is visible; the outbound bot behaviour was never observed (`04` §5), so HOMI needs its own
  evidence that deliveries happen.
- Signals and thresholds `17` §12 (queue waits per queue, failed jobs, Telegram delivery failures and `429` storms,
  blocked-bot rate, webhook errors and latency, legacy surface `5xx`/p95/`401`, ingestion freshness, LLM spend,
  contact quota, scheduler, exchange rate, backups, storage, TLS, CSP reports); error budgets `18` §5.4; SEC-REQ-048.

## Implementation

1. Prometheus scrape job for `https://api.<env>/internal/metrics` with the bearer token of KV-INF-011 (vault), 30 s
   interval; staging and production as separate jobs with an `env` label.
2. Alert rules (`infra/server/monitoring/alerts.yml`, production-owned) — one rule per row of `17` §12 with the
   `PROPOSED` thresholds, for example: `homi_queue_wait_seconds{queue="telegram"} > 10 for 2m`;
   `increase(homi_telegram_send_total{result="429"}[1m]) > 20`; non-`403` send failures > 1 % over 10 min;
   `homi_webhook_requests_total{status!~"2.."}` increase > 0; webhook health from KV-TG-059 (`last_error_date` changed,
   `pending_update_count` > 100); `homi_scheduler_heartbeat_age_seconds > 300`; certificate expiry < 14 days (blackbox
   probe on every host incl. the kvadro hosts after S2); backup age > 26 h (from KV-INF-026's exporter); bucket usage
   > 80 %.
3. Routing: Alertmanager → operations chat (team Telegram chat through an operator bot or e-mail — never the
   production `@KvadroAppBot`); severity `page` for webhook, delivery and legacy-surface `5xx`, `ticket` for the rest.
4. Dashboards: "Bot and delivery" (updates/min, send results, delivery lag p50/p95, blocked-bot rate, queue waits),
   "Legacy surface" (requests, `5xx`, p95 per route, `401` rate — with an annotation for the planned S2 spike),
   "Pipeline" (freshness, LLM cost), "Ops" (heartbeat, backups, TLS, storage).
5. Scripted triggers on staging for each alert (`infra/server/monitoring/fire-drills.md`): stop Horizon's telegram
   supervisor and post updates; point the staging bot API base URL at a stub answering `429` (staging only, by
   approval); stop cron; post an unsigned webhook burst; expire a test certificate on a throwaway name.
6. Breach-runbook link from SEC-REQ-048 placed in the alert annotations (the runbook itself is the product owner's).

## Files

- `infra/server/monitoring/{prometheus-scrape.yml,alerts.yml,dashboards/*.json,fire-drills.md}` (new, production-owned)

## API contract

Scrapes `GET /internal/metrics` (KV-INF-011); blackbox probes `GET /up` and TLS handshakes on every host.

## Business rules

The thresholds encode `18` §5.4 (delivery failures ≤ 1 %, zero re-sends, webhook non-2xx = 0, `401` back to baseline
within 2 h after S2).

## Acceptance criteria

- Every `17` §12 row maps to a rule; each rule fired once on staging from its drill, with the timestamp recorded.
- Alert texts contain host, metric and value only — no user id, Telegram id, phone or message text.
- The dashboards show staging data for 7 consecutive days before R2.

## Tests

| # | Drill (staging) | Expected alert |
| - | --------------- | -------------- |
| 1 | `php artisan horizon:pause-supervisor supervisor-telegram`, post 20 updates | `telegram` queue wait > 10 s |
| 2 | Bot API stub answering `429 retry_after=3` (staging, approved) | `429` storm |
| 3 | cron disabled 6 min | scheduler heartbeat missing |
| 4 | 50 unsigned POSTs to `hook.staging…/telegram/webhook` | webhook 403 spike (SEC-REQ-048) |
| 5 | blackbox probe against a host with a certificate expiring in 10 days (test name) | TLS expiry |
| 6 | `promtool check rules alerts.yml` | exit 0 |

## Edge cases

- The planned `401` spike right after the token rotation (`18` §5.4) is silenced for 2 hours by the runbook, not by
  editing rules.
- If the operations chat is a Telegram chat, its bot is separate from `@KvadroAppBot` and from the staging bot, so an
  outage of the product bot never hides its own alerts.
- Metrics reset on a Redis flush: alert rules use `increase()` / `rate()`.

## Security

SEC-REQ-047 (no PII in alerts and metrics), SEC-REQ-048 (alerts and rehearsed breach runbook); scrape token in the vault.

## Definition of done

All drills recorded, `17` §15 item 8 ticked by the first developer, the Operations row of `18` §5.1 has the alert
evidence, dashboards linked from `docs/infrastructure/deployment.md`.
