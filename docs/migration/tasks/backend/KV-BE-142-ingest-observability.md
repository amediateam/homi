# KV-BE-142 — Ingestion freshness, parse-failure and LLM-cost metrics

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); alert routing and the production monitor **[PT]** |
| Complexity | S |
| Feature IDs | F-PIPELINE-001, F-PIPELINE-002 |
| Dependencies | KV-BE-124 (ingest states, `ingest_runs`), KV-BE-129 (LLM calls); CF-007 data item 2 |

## Goal

The team can see whether ingestion keeps the legacy promise of fresh listings «within minutes» and what it costs:
per-source and per-channel freshness, post-to-publish latency, parse and rejection rates, LLM tokens and cost per day,
reader errors — exported for the production monitor and checked by one health command, with operator alerts when a
threshold is crossed.

## Legacy reference

- NFR-02 "within minutes" and CF-007 data item 2 (legacy freshness = median minutes from a channel post to a listing,
  measurable from migrated publications `published_at` vs `first_seen_at`), `10` §4.17 ("ingestion freshness (minutes
  since the last published listing per channel group); parse failures; LLM tokens and cost per day"), `17` §12
  (monitor), SEC-REQ-048 (alerts on LLM cost), agent rule 5 of `.ai/agents/intake-pipeline-engineer.md` (failure rate
  > 1 % warning, > 5 % alert).

## Implementation

1. Read `.claude/skills/pulse-development/` (custom recorders), `.ai/agents/intake-pipeline-engineer.md` rules 5, 13
   and `17` §12. Tests first.
2. `php artisan make:class Services/Ingest/IngestMetrics --no-interaction`: computes from `intake_events`,
   `ingest_runs`, `listing_publications`, `collector_cursors`, `llm_calls`:
   - freshness: minutes since the last published listing per source and per city; p50/p95 of
     `listings.first_seen_at − listing_publications.published_at` for the last hour and day;
   - reader: channels polled in the last 10 min, error rate, channels `unreachable`;
   - pipeline: events by status per hour, rejection and failure rate per source, `deferred_extraction` backlog;
   - LLM: tokens and cost today vs `AI_DAILY_SPEND_LIMIT`, extraction failure rate.
3. Pulse cards: record the counters with `Pulse::record()` (Pulse is installed) so `/pulse` shows them locally; a
   JSON endpoint is **not** added (the production monitor reads logs/metrics as `17` §12 decides **[PT]**).
4. `php artisan make:command Ingest/IngestHealth --no-interaction` → `ingest:health {--json}` prints the metrics and
   exits non-zero when a threshold in `config('ingest.alerts')` is crossed (freshness > 30 min during 08:00–23:00
   Tashkent, failure rate > 5 %, LLM spend > 80 % of cap, parse-failure spike > 3× the 7-day average); scheduled every
   5 min; crossings send an operator notification (Laravel Notification to the team channel, `10` §4.13).
5. `php artisan make:command Ingest/LegacyFreshnessBaseline --no-interaction` → `ingest:freshness-baseline`
   computes the legacy median from migrated publications (runs where migrated data lives **[PT]**) and stores it in
   config/cache for the comparison in `ingest:health` and in the KV-BE-143 side-by-side report.

## Files

- `backend/app/Services/Ingest/IngestMetrics.php`, `backend/app/Console/Commands/Ingest/{IngestHealth,LegacyFreshnessBaseline}.php`,
  `backend/app/Notifications/Ops/IngestAlert.php` (new); `backend/config/ingest.php` (alerts); `backend/routes/console.php` (shared)
- `backend/tests/Feature/Ingest/IngestMetricsTest.php`, `backend/tests/Feature/Ingest/IngestHealthTest.php` (new)

## API contract

n/a (commands, Pulse cards, notifications).

## Business rules

- BR-SEO-029 (the public methodology implies fresh data from 217 channels) — the freshness metric is the evidence.

## Acceptance criteria

- With a synthetic backlog (last publish 45 min ago at 14:00 Tashkent) `ingest:health` exits non-zero and sends one
  notification; at 03:00 Tashkent the same lag does not alert.
- Failure rate 6 % over the last hour → alert; 0.5 % → none.
- Metrics contain counts and durations only — no text, phones or handles.

## Tests

- `IngestMetricsTest`: `freshness_per_source_and_city`, `latency_percentiles`, `failure_rate_per_source`,
  `llm_spend_share`, `deferred_backlog_count`.
- `IngestHealthTest`: `lag_over_30_min_daytime_alerts`, `night_lag_does_not_alert` (frozen clock, Asia/Tashkent),
  `failure_rate_threshold`, `spend_80_percent_alerts`, `one_notification_per_crossing` (no repeat every 5 min until
  recovery), `json_output_shape`.

## Edge cases

- Reader disabled (`collectors.enabled = false`) while only collectors push: freshness measured per active source only.
- Clock skew in `posted_at` from a collector (future dates): clamped to `received_at` for latency.
- No data at all (new environment): health reports `no_data` without alerting.

## Security

- SEC-REQ-048 (monitoring and alerts), SEC-REQ-047 (metrics without PII).

## Definition of done

Tests green (`make ci-backend`), the alert thresholds listed in the PR for the production track, `09` rows
F-PIPELINE-001 and F-PIPELINE-002 updated, PR reviewed by the other developer.
