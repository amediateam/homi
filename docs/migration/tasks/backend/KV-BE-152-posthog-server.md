# KV-BE-152 — PostHog server capture and person deletion

| Field | Value |
| ----- | ----- |
| Status | TODO (production keys BLOCKED by DEC-26) |
| Owner | Backend (track: development); key custody **[PT]** |
| Complexity | M |
| Feature IDs | F-ANALYTICS-002, F-PRIVACY-002 |
| Dependencies | KV-BE-050 (`PersonEraser` contract, `RequestPostHogPersonDeletion` job), KV-BE-151; KV-BE-007 (random `analytics_distinct_id`); DEC-26, Q-API-046, Q-SEC-006 |

## Goal

HOMI talks to PostHog in exactly two ways, both under the user's random distinct id and never under a Telegram id:
server-side capture of the allow-listed product events (API-034 forward, bot events if enabled), and the person
deletion that «Удалить мои данные» promises — retried until PostHog confirms and recorded on `erasure_requests`.

## Legacy reference

- `$KVADRO_ROOT/docs/about.md:268`, `:375-376`, `:431` (PostHog EU, random id, erase on deletion);
  bot `/privacy` text (`04-telegram-bot-audit.md:1157`, BR-BOT-090).
- RES-006 (PostHog ingestion from the client); `meta.analytics` (API-001, KV-BE-029); ENT-006 (distinct id, migrated
  byte-for-byte by KV-DB-014).
- Rules: BR-API-126 (random per-user id via `meta.analytics.id`), BR-API-127 (no `initData` to PostHog), BR-API-128
  (person deletion on «Удалить мои данные»), BR-DATA-021 (random, stable, never the Telegram id).
- Open: Q-API-046 (which events legacy captured server-side, where the mapping lives), Q-LND-008 (dashboards that
  depend on property names), Q-SEC-006 (legal basis for PostHog EU), DEC-26 (production keeps the legacy EU project;
  staging gets its own).

## Implementation

1. Read `.claude/skills/laravel-queues/` (retries, backoff), `.ai/agents/security-reviewer.md`, the KV-BE-050 task
   (contract and job) and the PostHog API documentation for the capture (`/batch/`) and person-deletion endpoints —
   verify the exact paths and the minimal personal-API-key scope at implementation time; nothing here is assumed.
2. `config/analytics.php` → `posthog` block from env: `POSTHOG_HOST` (EU ingestion host), `POSTHOG_PROJECT_KEY`
   (public project key, also delivered to clients by `meta.analytics`), `POSTHOG_PROJECT_ID`,
   `POSTHOG_PERSONAL_API_KEY` (secret, deletion only), `POSTHOG_TIMEOUT` (5 s). Env keys announced in the PR and added
   to `backend/.env.example` in a separate small PR (shared file); values only in the server `.env` **[PT]**; staging
   and production use different projects (DEC-26).
3. `php artisan make:class Services/Analytics/PostHogClient --no-interaction` over Laravel's HTTP client: `capture(array
   $events)` (batch, each event with a client-generated UUID so retries dedupe), `deletePersonByDistinctId(string
   $distinctId): DeletionResult` (lookup + delete as the API requires; idempotent: "not found" counts as done).
   The client never logs request bodies or keys (SEC-REQ-013 style redaction of the key in exceptions).
4. `php artisan make:class Services/Analytics/ServerEvents --no-interaction`: `capture(User $user, string $name, array
   $props)` → queues `php artisan make:job Analytics/CapturePostHogEvents --no-interaction` (queue `default`,
   batched per request, tries 5, backoff `[10, 60, 300, 900]`); `distinct_id` = `users.analytics_distinct_id`; a user
   without one is skipped (logged as a counter). Properties are the allow-listed ones of `ActionLogger` plus
   `$lib = homi-server`; never `telegram_user_id`, names, phones or `initData` (BR-API-127).
5. `php artisan make:class Services/Analytics/PostHogPersonEraser --no-interaction` implements
   `App\Contracts\Analytics\PersonEraser` (KV-BE-050) and is bound in `AppServiceProvider` when the keys are set;
   otherwise `NotConfiguredPersonEraser` records `posthog_status = skipped_not_configured` (local, tests). The
   `RequestPostHogPersonDeletion` job of KV-BE-050 calls it, writes `posthog_request_id` and `posthog_done_at` on the
   `erasure_requests` row, retries with backoff for up to 7 days, then raises an operator alert (Laravel Notification
   to the team channel, `10` §4.13) and leaves the row `posthog_failed` for a manual re-run
   (`php artisan privacy:retry-posthog`).
6. Feature switch: `config('analytics.forward_to_posthog')` (used by KV-BE-151) — on in production, off locally and in
   CI; the Pest suite fakes HTTP (`Http::preventStrayRequests()`).
7. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/app/Services/Analytics/{PostHogClient,ServerEvents,PostHogPersonEraser,NotConfiguredPersonEraser}.php`
- `backend/app/Jobs/Analytics/CapturePostHogEvents.php`; `backend/app/Console/Commands/Privacy/RetryPostHogDeletions.php`
- `backend/config/analytics.php` (`posthog` block); `backend/app/Providers/AppServiceProvider.php` (binding)
- `backend/tests/Feature/Analytics/{PostHogCaptureTest,PostHogPersonEraserTest}.php` (new)

## API contract

Outbound only (PostHog HTTP API, exact paths verified at implementation). No HOMI endpoint.

## Business rules

- Kept: BR-API-126, BR-DATA-021 (random, stable distinct id — the migrated value is reused, never regenerated),
  BR-API-127, BR-API-128, BR-BOT-090 (deletion completes asynchronously).
- No DEV. Server-side capture of the API-034 events is DOCUMENTED_ONLY legacy behaviour (Q-API-046); double counting
  with the client SDK is avoided by forwarding only the API-034 events, which the client does not send to PostHog
  itself (verify against Q-LND-008 before enabling in production).

## Acceptance criteria

- No outbound PostHog payload contains a Telegram id, a name, a phone pattern or an `initData` fragment (asserted on
  the faked requests across the whole test suite).
- An erasure produces exactly one deletion request for the user's distinct id; a `5xx` is retried; success sets
  `posthog_done_at`; "person not found" is treated as success.
- With PostHog unconfigured, erasure still completes in the database and the row says `skipped_not_configured`.
- Capture retries do not duplicate events (same UUID per event across tries).

## Tests

- `PostHogCaptureTest`: `capture_uses_random_distinct_id_not_telegram_id`, `props_are_allow_listed_only`,
  `batch_one_request_per_ingest`, `retry_keeps_event_uuid`, `user_without_distinct_id_skipped`,
  `no_request_when_forward_disabled`, `api_key_never_in_logs_or_exception_message`.
- `PostHogPersonEraserTest`: `deletion_requested_once_for_erased_user` (end-to-end with KV-BE-050's service),
  `server_error_retried_with_backoff`, `not_found_counts_as_done`, `done_timestamp_recorded`,
  `gives_up_after_window_and_alerts` (time travel 7 days, `Notification::fake()`), `retry_command_requeues_failed`,
  `not_configured_records_skip`.
- KV-QA-017 privacy row: the PostHog fake received one deletion per erased user.

## Edge cases

- Migrated users whose legacy distinct id is unknown (Q-API-046): no deletion target — record `skipped_no_distinct_id`
  and list them in the erasure ledger for the operator.
- Erasure while capture jobs for the same user are queued: capture jobs check that the user still exists and drop
  themselves; a capture already sent before deletion is removed by the person deletion.
- PostHog EU outage for days: the database part of erasure is unaffected; deletions retry; the alert fires once.
- Staging pointing at the production project by mistake: a boot check refuses `APP_ENV=staging` with the production
  project id (configured list) **[PT]**.

## Security

- SEC-REQ-039 (PostHog deletion retried and recorded), SEC-REQ-034 (separate keys per environment), SEC-REQ-047
  (no bodies or keys in logs), SEC-REQ-049 (no SDK package — plain HTTP client, so no dependency approval),
  Q-SEC-006 (legal basis before production keys are set).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (`15` §4) for F-ANALYTICS-002 (server part) and the PostHog
part of F-PRIVACY-002, docs (`docs/infrastructure/environments.md` env list) and the feature rows in `09` updated, PR
reviewed by the other developer.
