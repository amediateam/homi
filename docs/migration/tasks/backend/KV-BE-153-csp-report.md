# KV-BE-153 — RES-015 `POST /api/csp-report`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-LANDING-007 |
| Dependencies | KV-BE-005 (legacy route group, site hosts); DEC-08 (CSP of the new landing); Q-API-050 |

## Goal

The `report-uri /api/csp-report` of the landing, privacy and SEO pages keeps working on `kvadro.app` after the
cut-over: browser CSP reports (legacy `report-uri` and the newer Reporting API format) are accepted anonymously,
bounded, sampled and stored only as daily counters without query strings, so a CSP regression is visible and the
endpoint cannot be used as a write sink.

## Legacy reference

- RES-015 (`08` lines 1411-1419): `POST /api/csp-report`, browser-generated `application/csp-report` JSON; behaviour,
  response and storage unknown (Q-API-050).
- Landing CSP with `report-uri /api/csp-report`: LND-034 (`03b` lines 595-613), `$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:56-57`,
  `$KVADRO_ROOT/docs/seo-pages.md:376-377`, `$KVADRO_ROOT/docs/about.md:304`; BR-API-138.
- ENT-057 (not migrated, operational data only); SEC-025 (unauthenticated write sink); LB-LND-009 (keep a report
  endpoint, add `report-to`).

## Implementation

1. Read `.claude/skills/laravel-best-practices/` and `16` SEC-REQ-022 (CSP report part).
2. Route in `routes/legacy.php` on the legacy **site** hosts (`LEGACY_SITE_HOSTS`, KV-BE-005), anonymous (no `tma`),
   `throttle:csp-report` (30/min per IP, SEC-REQ-027), the `LimitLegacyBody:16384` middleware of KV-BE-151.
3. `php artisan make:controller Legacy/CspReportController --invokable --no-interaction`: accepts
   `application/csp-report` (`{"csp-report": {...}}`), `application/reports+json` (array of `{type: "csp-violation",
   body: {...}}`) and `application/json`; anything unparsable → `204` (never `4xx` storms into browser consoles,
   never `5xx`).
4. `php artisan make:class Services/Analytics/CspReportIngest --no-interaction`: normalises each report to
   (`day` UTC date, `document_path` without query and fragment, truncated to 200, `effective_directive` from a closed
   list, `blocked` reduced to scheme + host or the keywords `inline`, `eval`, `data`, `blob`), drops everything else
   (no `sample`/`script-sample`, no full URLs, no user agent, no IP), samples at `config('analytics.csp.sample_rate')`
   (1.0 by default; lower under load) and upserts a counter.
5. `php artisan make:migration create_csp_report_counters_table --no-interaction` (no database-track task owns it):
   `day date`, `host varchar(100)`, `document_path varchar(200)`, `effective_directive varchar(40)`,
   `blocked varchar(120)`, `count bigint`, unique (`day`, `host`, `document_path`, `effective_directive`, `blocked`);
   `php artisan make:model CspReportCounter --factory --no-interaction`. Retention 30 days (KV-BE-165).
6. Metric for the monitor: reports per hour; a burst above `config('analytics.csp.alert_per_hour')` sends one operator
   notification per hour (SEC-REQ-048).
7. Response `204`, `Cache-Control: no-store`.

## Files

- `backend/app/Http/Controllers/Legacy/CspReportController.php`, `backend/app/Services/Analytics/CspReportIngest.php`
- `backend/database/migrations/<date>_create_csp_report_counters_table.php`, `backend/app/Models/CspReportCounter.php`,
  factory
- `backend/routes/legacy.php`; `backend/config/analytics.php` (`csp` block); limiter registration
- `backend/tests/Feature/LegacyApi/Res015CspReportTest.php` (new)

## API contract

- `POST /api/csp-report` on `kvadro.app` (and its environment aliases), no auth; bodies as above, ≤ 16 KB.
- `204` always for well-formed or malformed reports; `413 {"detail":"payload_too_large"}` above 16 KB;
  `429 {"detail":"rate_limited"}` + `Retry-After` above the IP limit. Never `5xx`.
- On `app.kvadro.app` and `api.*` the path answers `404 {"detail":"Not Found"}` (host binding of KV-BE-005).

## Business rules

- Kept: BR-API-138 (pages send reports to this path).
- Defect fix `APPROVED`: LB-LND-009 (keep a report endpoint; `report-to` support added). SEC-025 closed by bounds,
  sampling and counters only.
- No DEV; storage form is new (legacy unknown, Q-API-050) — spec-tested.

## Acceptance criteria

- A valid legacy report and a Reporting API batch each increase exactly one counter row per violation.
- No stored value contains a query string, a fragment, a script sample or an IP address.
- 17 KB body → `413`; 31st request within a minute from one IP → `429`; garbage → `204`; never `5xx`.

## Tests

- `Res015CspReportTest`: `legacy_csp_report_counted`, `reporting_api_batch_counted_per_item`,
  `query_and_fragment_stripped_from_document_path`, `blocked_url_reduced_to_origin`,
  `inline_and_eval_keywords_kept`, `script_sample_never_stored`, `garbage_body_is_204`,
  `oversized_body_is_413`, `ip_limiter_429`, `wrong_host_is_404`, `sample_rate_zero_stores_nothing`,
  `burst_sends_one_alert_per_hour` (`Notification::fake()`, time travel).

## Edge cases

- Reports for pages served by the new `frontend/landing` (after S4) arrive at the same path — host binding keeps
  accepting them on `kvadro.app`.
- Browser extensions generate violations for `chrome-extension://` sources: reduced to the scheme, counted, never
  alerted (filtered from the burst metric).
- Counter upsert races under a burst: `insert … on conflict do update set count = count + 1` (PostgreSQL), tested in
  the `pgsql` group.

## Security

- SEC-REQ-022 (≤ 16 KB, sampled, no query strings), SEC-REQ-027 (IP limiter), SEC-REQ-048 (CSP burst alert),
  SEC-REQ-033 (headers), SEC-REQ-047 (no report bodies in logs).

## Definition of done

Tests green (`make ci-backend`), RES-015 rows of `08` covered, parity gate items ticked (`15` §4) for the report part of
F-LANDING-007, docs and the feature row in `09` updated, PR reviewed by the other developer.
