# KV-INF-011 — Application metrics for the production monitor

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-012, F-DELIVERY-002 (and F-COMPAT-001, F-PIPELINE-001 through the legacy-surface and ingestion metrics) |
| Dependencies | KV-INF-006 (queue names); related: the bot counters come from KV-TG-059 and KV-TG-050, and the production monitor that scrapes the endpoint is KV-INF-025 |
## Goal

The application exposes the metrics of `10` §4.17 in the Prometheus text format on an internal endpoint, so the
existing Grafana/Prometheus/Alertmanager stack can alert on webhook health, delivery lag, Telegram `429`/`403`
rates, queue waits, ingestion freshness, LLM cost and legacy-surface errors — without a new Composer package.

## Legacy reference

- No legacy monitoring is visible; the signals come from `17` §12 (thresholds) and `10` §4.17 (metrics list).
- Delivery and webhook behaviours to watch: `04` §5 (outbound, never observed), `18` §5.4 (error budgets after S2),
  `18` §10 (what to watch: re-sends, `401` decay, webhook health, digest runs).

## Implementation

1. `php artisan make:class Ops/Metrics/MetricsRegistry --no-interaction`: counters and gauges stored in Redis
   (`ops:metrics:*`, one hash per metric, labels as fields), incremented by the application (`Metrics::inc('telegram_send_total', ['result' => '429'])`).
   No Prometheus client library: the text format is written by hand (≤ 150 lines) — a library would be PROPOSED — needs
   approval (dependency change).
2. Metric names (all prefixed `homi_`): `webhook_requests_total{status}`, `telegram_updates_processed_total{type,result}`,
   `telegram_send_total{method,result}` (`ok`, `429`, `403`, `400`, `5xx`), `delivery_lag_seconds` (histogram buckets
   10/60/300/900 s from publish to card), `queue_wait_seconds{queue}` (from Horizon's wait times),
   `ingest_last_published_age_seconds`, `llm_cost_usd_today`, `legacy_http_requests_total{route,status}`,
   `legacy_http_duration_seconds` (buckets), `contact_quota_trips_total`, `scheduler_heartbeat_age_seconds`.
3. `GET /internal/metrics` served on the `api.*` host only, guarded by a bearer token `METRICS_TOKEN` (new env name) or
   an allow-list from `METRICS_ALLOWED_IPS` (production track decides which); `404` on other hosts; no session, no
   PII labels (never a user id or Telegram id as a label).
4. Hooks: a middleware on the legacy route group and the webhook route records status and duration; the Bot API client
   (KV-TG-004) and pacer (KV-TG-050) record send results; the delivery sender (KV-TG-051) observes lag.
   Feature tasks call the registry; this task provides the registry, endpoint, the two middlewares and the queue-wait
   gauge.
5. Document the metric list in `docs/infrastructure/environments.md` (names section) for the production track.

## Files

- `backend/app/Ops/Metrics/{MetricsRegistry,PrometheusFormatter}.php`, `backend/app/Http/Controllers/Ops/MetricsController.php` (new)
- `backend/app/Http/Middleware/RecordHttpMetrics.php` (new), `backend/routes/ops.php` (new, registered in `bootstrap/app.php`)
- `backend/tests/Feature/Ops/MetricsEndpointTest.php` (new)
- `backend/.env.example` (`METRICS_TOKEN`, `METRICS_ALLOWED_IPS`; shared file, separate PR)

## API contract

`GET https://api.<env>/internal/metrics`, header `Authorization: Bearer <METRICS_TOKEN>` →
`200 text/plain; version=0.0.4`; wrong or missing token → `404` (do not reveal the endpoint); other host → `404`.

## Business rules

None; the metrics serve the error budgets of `18` §5.4 (delivery failures ≤ 1 %, zero re-sends, webhook non-2xx = 0).

## Acceptance criteria

- The endpoint lists every metric of step 2 with `# HELP` / `# TYPE` lines and parses with `promtool check metrics`
  (run by the production track; locally a format unit test).
- A request without the token answers 404 and writes no metrics line about itself.
- Label values never contain an id of a user, chat or listing (test greps the output for digits-only labels).
- Recording a metric costs one Redis command; the webhook p95 does not change measurably (local benchmark noted in the PR).

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `Metrics::inc('telegram_send_total', ['method' => 'sendMessage', 'result' => '429'])` twice, then GET | `homi_telegram_send_total{method="sendMessage",result="429"} 2` |
| 2 | GET without token | 404 |
| 3 | GET on `hook.*` host with token | 404 |
| 4 | legacy route returning 500 in a test | `homi_legacy_http_requests_total{route="…",status="500"} 1` |
| 5 | formatter unit test against a golden text file | identical |

## Edge cases

- Redis flush (allowed by ADR-0005) resets counters; Prometheus `rate()` handles counter resets.
- Several php-fpm workers increment the same hash atomically (`HINCRBY`); no per-process state.
- Histograms with fixed buckets only; no high-cardinality labels.

## Security

SEC-REQ-047 (no PII in metrics), SEC-REQ-048 (alerts fed by these metrics); `METRICS_TOKEN` is a secret name for
KV-INF-004's inventory; the endpoint is excluded from CORS and from Telescope recording.

## Definition of done

Tests green (`make ci-backend`), metric list handed to the production track for KV-INF-025, new env names announced,
PR reviewed by the other developer.
