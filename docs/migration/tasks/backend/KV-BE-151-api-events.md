# KV-BE-151 — API-034 `POST /api/events`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-ANALYTICS-001 |
| Dependencies | KV-BE-150, KV-BE-005, KV-BE-007, KV-BE-010; Q-API-045, Q-API-046; related: KV-BE-152 adds the PostHog forward |
## Goal

The legacy Mini App's fire-and-forget telemetry from both producers (React `fetch` with `keepalive` and the boot
`XMLHttpRequest`) is accepted on the legacy surface with `204`, bounded (8 KB body, per-user limiter), stored through
the allow-list of `ActionLogger` and optionally forwarded to PostHog under the user's random id; empty `initData`
answers `401` silently and stores nothing.

## Legacy reference

- API-034 (`08` lines 1157-1197): body `{"name": string, …props}` with properties at the top level; unknown fields
  tolerated; recommended `204`; never read by the client.
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/events.js:9-35` (fetch, `keepalive: true`, errors swallowed),
  `$KVADRO_ROOT/demo/app/index.html:69-90` (boot script, XHR, only with `initData`),
  `$KVADRO_ROOT/demo/app/src/lib/errors.js:10`, `:68-94` (≤ 5 distinct errors per session; the boot script always
  sends 7 keys, empty = `""`); parity excludes the endpoint (`$KVADRO_ROOT/demo/app/tools/parity/README.md:28-29`).
- Docs: `$KVADRO_ROOT/docs/api.md:137`, `:970-1046`; `$KVADRO_ROOT/docs/about.md:268`, `:375-376`, `:431`.
- Rules: BR-API-122, BR-API-123, BR-API-124, BR-API-125; LB-API-001 (empty `tma `), LB-API-047 (unbounded),
  LB-DATA-015; SEC-006; open Q-API-045 (size, rate, retention), Q-API-046 (server-side PostHog capture).

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (form requests, middleware), `.ai/agents/security-reviewer.md` and
   `16` SEC-REQ-022.
2. Route in `routes/legacy.php`: `POST api/events` → `App\Http\Controllers\Legacy\EventController` with `auth:tma`,
   the access middleware in a mode that lets every non-`blocked` state through (events of users still in `private`,
   `invite` or `full` are funnel data; `blocked` → `403 {"detail":"blocked"}`, SEC-REQ-006), `throttle:legacy-events`
   (60/min per user — add the named limiter to KV-BE-010's set).
3. Size cap before parsing: a middleware `LimitLegacyBody:8192` rejects `Content-Length > 8192` and reads at most 8 KB
   from the input stream; above the cap → `413 {"detail":"payload_too_large"}` (SEC-REQ-022 allows `413` or drop; the
   client never reads it). nginx `client_max_body_size` for the legacy location stays the outer bound
   **[PT/INF: nginx]**.
4. Body parsing independent of `Content-Type` (the XHR producer may send `text/plain`): decode the raw body as JSON
   once; non-object or invalid JSON → `204` and nothing stored (never `422` — the client cannot react and the old
   boot script would retry nothing; log a counter, not the body).
5. `php artisan make:class Services/Analytics/EventIngest --no-interaction`: `ingest(User $user, array $body): void` —
   takes `name`, moves the remaining top-level keys into `props` (React omits empty keys, the boot script sends
   `""`: normalise `""` to absent), scrubs `error.source` (drop query and hash, remove any `tgWebAppData` fragment),
   hands the event to `ActionLogger::record(..., ActionChannel::App, ...)`; an unknown name is dropped silently
   (LB-API-047 compatibility: `204` either way); then, when `config('analytics.forward_to_posthog')` is on, queues
   `ServerEvents::capture()` (KV-BE-152) with the same allow-listed props (never `app_error` message text).
6. The write runs after the response is sent (`defer()` of Laravel 13) so the endpoint answers `204` fast; failures
   inside the deferred callback are reported with the request id only (no body).
7. Empty `Authorization: tma ` is rejected by the `tma` guard of KV-BE-007 with `401 {"detail":"unauthorized"}`
   logged at `info` (SEC-REQ-005); this task adds a test that no `user_action_log` row and no `error` log line appear.
8. Response: always `204` with an empty body on success paths (BR-API-019 rule: `204` only where legacy used it —
   here it is the documented recommendation); `Cache-Control: private, no-store` from the legacy group.
9. Contract test file for API-034 in the KV-QA-004 harness (fixture from KV-QA-002).

## Files

- `backend/app/Http/Controllers/Legacy/EventController.php`, `backend/app/Http/Middleware/LimitLegacyBody.php` (new)
- `backend/app/Services/Analytics/EventIngest.php` (new); `backend/routes/legacy.php`; limiter in
  `backend/app/Providers/AppServiceProvider.php` (or the KV-BE-010 limiter class)
- `backend/config/analytics.php` (`forward_to_posthog`, `events.max_body_bytes` = 8192)
- `backend/tests/Feature/LegacyApi/Api034EventsTest.php` (new)

## API contract

- `POST /api/events`, `Authorization: tma <initData>`, body `{"name": "<event>", "<prop>": …}` (≤ 8 KB).
- `204` (stored, dropped as unknown, or unparsable); `401 {"detail":"unauthorized"}` (missing, empty or invalid
  `initData`, logged at `info`); `403 {"detail":"blocked"}`; `413 {"detail":"payload_too_large"}`;
  `429 {"detail":"rate_limited"}` + `Retry-After`. Never `5xx` for client input.

## Business rules

- Kept: BR-API-122 (two producers, unknown fields tolerated, `204`), BR-API-123 (catalogue), BR-API-125 (log, no
  texts).
- Defect fixes `APPROVED` (`09` §4.3): LB-API-001 (empty `tma ` → silent `401`, nothing stored), LB-API-047 (cap,
  allow-list, limiter; unknown names `204`), LB-DATA-015 (fingerprint).
- Server-side PostHog forward follows `about.md` (DOCUMENTED_ONLY); whether legacy forwarded each event is Q-API-046 —
  the flag defaults to on in production, off in local and test.

## Acceptance criteria

- Each of the 15 catalogue events with its `08` properties → `204` and one allow-listed row.
- `app_error` from the boot-script shape (7 keys, empty strings) and from the React shape (empty keys omitted) both
  store one row with the same fingerprint for the same error.
- A 1 MB body → `413` without reading past 8 KB; an unknown event name → `204`, no row.
- `Authorization: tma ` → `401`, no row, no `error`-level log entry.
- A `source` containing `#tgWebAppData=` is never stored (it is not an allowed key) and never logged.

## Tests

- `Api034EventsTest`: dataset `each_catalogue_event_returns_204_and_stores_one_row` (15 events);
  `boot_script_app_error_with_empty_strings`; `react_app_error_with_omitted_keys`; `same_error_same_fingerprint`;
  `unknown_event_name_is_204_and_not_stored`; `extra_unknown_fields_are_dropped`; `text_plain_content_type_accepted`;
  `invalid_json_is_204_and_not_stored`; `body_over_8kb_is_413`; `content_length_lies_stream_capped`;
  `empty_tma_header_is_401_silent` (`Log::spy()` asserts no `error` call); `blocked_user_is_403`;
  `private_mode_user_event_is_stored`; `limiter_returns_429_after_60_per_minute`;
  `posthog_forward_queued_when_enabled` (`Queue::fake()`), `no_forward_when_disabled`;
  `response_has_no_store_header`; contract shape check through KV-QA-004.
- Security (KV-QA-015 / KV-QA-017 rows): oversized and garbage bodies never `5xx`.

## Edge cases

- Duplicate events (keepalive retries, double sends after a reconnect): stored twice — the log is a counter of
  presses, not an idempotent ledger; PostHog dedups by its own `uuid` (KV-BE-152 sends one per event).
- Out-of-order arrival (a `keepalive` request delivered after a later event): `created_at` is the server receipt
  time; the client sends no timestamp, so order is not reconstructed.
- Events sent while the user is being erased: the deferred write may land after the erasure transaction — the
  KV-BE-050 scan runs after commit; a late row is removed by a follow-up delete keyed on the erased user id held in
  memory by the erasure job (record in the PR) or accepted as an orphan without identity (no Telegram id is stored).
- Clock skew of the client irrelevant (no client timestamps stored).

## Security

- SEC-REQ-022 (≤ 8 KB, allow-list, scrubbing, unauthenticated events never stored), SEC-REQ-005 (silent `401`),
  SEC-REQ-006 (`blocked`), SEC-REQ-027 (limiter), SEC-REQ-047 (no bodies in logs), SEC-REQ-048 (metric for `401`
  spikes on this route).

## Definition of done

Tests green (`make ci-backend`), API-034 green in the contract harness (KV-QA-004), parity gate items ticked (`15` §4)
for F-ANALYTICS-001, docs and the feature row in `09` updated, PR reviewed by the other developer.
