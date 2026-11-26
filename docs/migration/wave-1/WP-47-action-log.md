# WP-47 — Action log, server-side analytics, retention, erasure

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-44 (and, by queue order, WP-45 and WP-46: their tables are registered here) |
| Size | about 2 600 changed lines, L |
| Behaviour reference | WP-11 (`POST /events`: body, catalogue, codes — unchanged here); `25` §3.9, §5 (action log, erasure); `24` §8.1 (DEC-47), §8.2 (Q-SEC-021); `08` row of API-034; `03` §3.3; `16` SEC-REQ-022, SEC-REQ-036, SEC-REQ-038, SEC-REQ-039, SEC-REQ-047; tasks `tasks/backend/KV-BE-150-action-log.md`, `KV-BE-151-api-events.md`, `KV-BE-152-posthog-server.md`, `KV-BE-165-retention-m4-m6-m7.md`, `KV-BE-050-erasure-service.md` (rules, edge cases, tests — not their legacy route or migration tables), and `KV-BE-049-retention-deletion-adr.md` for the proposed retention periods |
| Needs from the production track | 1. Server env on staging and production: `ERASURE_SUBJECT_KEY` (random, at least 32 bytes, per environment, never rotated without a plan); `POSTHOG_HOST`, `POSTHOG_PROJECT_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` of that environment's own PostHog project (DEC-47; separate projects for staging and production); `ANALYTICS_FORWARD_TO_POSTHOG=true` once the keys are set. 2. Approve the migrations on production: the partitioned `user_action_log` with its first partitions, and `erasure_requests`. 3. Confirm the scheduler runs, that application logs are kept at most 30 days and database backups at most 14 days (the privacy promises of the bot text and the landing rely on it). 4. Nothing for Horizon: `trim.failed` and `trim.recent_failed` are already 10 080 minutes (7 days) in `backend/config/horizon.php`; do not raise them without changing the retention registry. 5. A private disk for the erasure ledger's copy that a restore of the database does not roll back (`config('erasure.ledger_disk')`), and a step of the restore procedure (`docs/infrastructure/backup-recovery.md`) that runs `php artisan privacy:replay-erasures --since=<the dump's time>` before the restored database serves traffic (*added by the owner-cabinet plan*) |

## Goal

HOMI records what users press — never what they type — in an append-only log that forgets after 180 days, forwards
the same events to its own PostHog project under a random id, and can delete everything it holds about one user in
one call. `POST /events` stores for real. A schema test makes it impossible to add a table with a user link, or a
table that grows forever, without saying how it is erased and when it is purged.

## Scope

In: the partitioned action log and its partition manager; `ActionLogger` and the catalogue; the real `POST /events`;
the PostHog client, server-side capture and person deletion; `ErasureService` with its registry, ledger and registry
test; the retention registry, its purge command and policy test; scheduler entries. The registry gains, later, the
owner listings with their number and photos, the waitlist and the requests as seeker and as owner; WP-84, WP-85,
WP-87 and WP-89 (`bot_notices`, `SeekerNoticeEraser`) register them. The ledger also gets a copy outside the database
and a replay after a restore ("Erasure — the service the bot calls") (*added by the owner-cabinet plan*).

Out: the PostHog SDK in the Mini App (stage B); the bot's «Удалить мои данные» dialogue and the bot's own events
(WP-56 and WP-58 call the services built here); the legal texts (WP-70).

## Decisions that bind this package

- HOMI's own action log and its own PostHog projects per environment (DEC-47); the legacy event names are kept
  (`25` §3.9).
- One deletion procedure, used by the bot's «Удалить мои данные» (`25` §5); database deletion is immediate.
- Nothing in logs, events or analytics may contain `initData`, tokens, phones or listing texts (`25` §2 rule 7,
  SEC-REQ-047); PostHog never receives a Telegram id.
- No new dependency (`25` §10): PostHog is called over the HTTP client, not through an SDK.
- HOMI collects personal data from the first production deploy and the legal basis is still open (Q-SEC-021): the
  retention periods here are the proposals of task `KV-BE-049` and live in configuration.

## Design

### Action log

Table `user_action_log`. On PostgreSQL the migration creates it with raw SQL as `PARTITION BY RANGE (created_at)`;
on SQLite (tests) as a plain table with the same columns.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `bigint generated always as identity` | primary key (`id`, `created_at`) |
| `user_id` | `bigint not null` | no foreign key (partitioned log); erased by the registry |
| `channel` | `varchar(8)` | `app`, `bot` |
| `name` | `varchar(40)` | a catalogue name |
| `props` | `jsonb not null default '{}'` | allow-listed keys only |
| `error_fingerprint` | `char(16)` null | for `app_error` |
| `created_at` | `timestamptz not null` | server receipt time |

Indexes: BRIN on `created_at`; btree (`user_id`, `created_at`). `App\Services\Analytics\PartitionManager`:
`ensure(string $table, int $monthsAhead)` creates monthly partitions named `<table>_y2026m11`;
`dropExpired(string $table, int $days)` drops a partition only when its upper bound is older than now minus `days`.
`config/partitions.php`: `user_action_log` → 3 months ahead, 180 days. Commands `partitions:ensure` (called by the
migration and daily) and `partitions:drop-expired` (daily). On SQLite both are no-ops and a row-level delete
replaces the drop. The logger never creates partitions itself.

### `ActionLogger` — the writer the app and the bot share

```php
namespace App\Services\Analytics;

final class ActionLogger {
    /** @param array<string, mixed> $props  @return bool false when the name is not in the catalogue */
    public function record(User $user, ActionChannel $channel, string $name, array $props = [], ?CarbonImmutable $at = null): bool;
    /** @param list<array{name: string, props?: array<string, mixed>}> $events */
    public function recordMany(User $user, ActionChannel $channel, array $events): int;   // one INSERT
}
```

`App\Enums\Analytics\ActionChannel`: `App`, `Bot`. The catalogue is `config/analytics.php` → `events`: name → allowed
property keys, each with a type (`int`, `bool`, `enum` with its values, `string` with a cap). It holds the names of
WP-11, the five of the return banner and the radar card in the feed included (`return_prompt_shown` with `n` as
`int` and `custom` as `bool`; `return_prompt_expired`, `return_prompt_closed`, `feed_radar_shown`,
`feed_radar_closed` with `custom`; BR-API-123); WP-58 adds the bot's names with the prefix `bot_` and enum-only
properties. Rules:

- A name outside the catalogue stores nothing and returns `false`.
- Only allow-listed keys are kept; a value of the wrong type or outside its enum is dropped; strings are cut to
  their cap.
- `app_error`: `error.message` and `error.source` are never stored. `error_fingerprint` = first 16 hex of SHA-256
  over `kind|name|message` (fix of LB-DATA-015).
- A value that matches a phone, e-mail or `tgWebAppData` pattern is dropped whatever its key.

One name is written by the server alone: `contact_disclosed` with the property `listing_id` (integer). The listener
`App\Listeners\Analytics\RecordContactDisclosure` on `ContactDisclosed` of WP-43 records it for every number HOMI
gave out (DEC-52), with the channel of the event — `app` for `POST …/contact`, `bot` for the bot's «Показать номер»
(WP-53). The row holds the listing number and never the phone. `EventIngest` treats the name as unknown when a
client posts it (`204`, nothing stored), and the row is not forwarded to PostHog.

### `POST /events` for real

`EventController` of WP-11, body replaced (the stub answer moves into `NativeStubs`, the rule of WP-40):

1. No valid token → `401 unauthenticated`, nothing stored, logged at `info` only (SEC-REQ-022).
2. A body over 8 KB → `413 payload_too_large` without reading further.
3. Over the limiter `v1-events` → `204`, dropped.
4. `App\Services\Analytics\EventIngest::ingest(User, string $name, array $props)`: empty strings become absent
   keys; `ActionLogger::record(…, ActionChannel::App, …)`; when `config('analytics.forward_to_posthog')` is on,
   `ServerEvents::capture()` with the same allow-listed properties.
5. Answer `204` at once; the write runs after the response is sent (`defer()` — verify the helper with
   `search-docs`). A failure there is reported with the request id only.

Duplicates are stored twice: the log counts presses. There is no client timestamp.

### PostHog

- `App\Services\Analytics\PostHogClient` over Laravel's HTTP client: `capture(list $events)` (batch; each event
  carries a UUID generated once, so a retry does not duplicate) and `deletePerson(string $distinctId):
  DeletionResult` ("not found" counts as done). Verify the endpoint paths and the smallest sufficient scope of the
  personal key in the PostHog documentation when implementing; nothing about them is assumed here. Keys and bodies
  never reach a log.
- `App\Services\Analytics\ServerEvents::capture(User, string $name, array $props)` queues
  `App\Jobs\Analytics\CapturePostHogEvents` (queue `default`, 5 tries, back-off 10 s, 60 s, 300 s, 900 s). The
  distinct id is `users.analytics_distinct_id`; properties are the stored ones plus `$lib = homi-server`. A job whose
  user no longer exists drops itself.
- `config/analytics.php` → `posthog` (host, project key, project id, personal key, timeout 5 s),
  `forward_to_posthog` (`ANALYTICS_FORWARD_TO_POSTHOG`, default false), and the `client` block that `GET /me`
  reports (`autocapture`, `replay`, `replay_rate`). *Corrected by WP-40:* the file exists since WP-40 with the
  `client` block only (`true`, `false`, `0`, no env keys; `MeProfile` reads it leniently); this package adds the
  other keys, and any env keys of the `client` block, to it. A boot check refuses to start staging with the production
  project id (`analytics.posthog.forbidden_project_ids` per environment).

### Erasure — the service the bot calls

```php
namespace App\Services\Privacy;

final class ErasureService {
    /** @param 'bot'|'operator'|'api' $source */
    public function erase(User $user, string $source): ErasureReceipt;   // subjectHash, erasedAt, tables => rows
}
```

`config/erasure.php` is an ordered registry; each entry names a table and a strategy:

| Strategy | Meaning | Tables in Wave 1 |
| -------- | ------- | ---------------- |
| `delete` | delete by `user_id` | `user_settings`, `access_grants`, `favorites`, `listing_views`, `hidden_listings`, `blocked_authors`, `found_answers`, `radars` (rules cascade), `radar_deliveries`, `radar_outbox`, `user_action_log` |
| `recount` | delete, then recompute aggregates | `listing_votes` (through `VoteService`, so marks that lose their majority are removed) |
| `tokens` | delete by morph owner | `personal_access_tokens` |
| `references` | reference-counted delete | `media_file_references` of the user (WP-00 rules decide about the object) |
| `custom` | a named callback | `telegram_updates` rows of the user's Telegram id (WP-50 owns the ledger and updates this entry; today the table has only `bot_id`, `update_id` and `payload`, and the webhook is a fail-closed stub, so the callback registered here does nothing) |
| `last` | the row itself | `users` |

`erase()`:

1. Read the Telegram id and the analytics id; compute `subject_hash` = HMAC-SHA-256 of the Telegram id with
   `ERASURE_SUBJECT_KEY`.
2. One transaction: walk the registry in order, then upsert `erasure_requests` (`subject_hash` unique, `source`,
   `requested_at`, `db_erased_at`, `posthog_status`, `posthog_done_at`). The ledger holds no Telegram id.
3. After commit: forget the user's cache keys whose full name can be built — `found:asked:<id>`, `contact:<id>:<day>`
   for today and yesterday in Tashkent, `radar:<radar id>:options` for the user's radar ids (read before the
   transaction deletes them), the named limiter buckets. The `Cache` facade cannot delete by pattern, so `share:<id>:<number>:<locale>` entries are left
   to expire with their prepared message; they hold a Telegram prepared-message id under an internal id that is never
   reused. Then queue `App\Jobs\Privacy\RequestPostHogPersonDeletion` (retried with back-off for up
   to 7 days, then status `posthog_failed` and one operator alert); queue a delayed second pass over
   `user_action_log` 60 seconds later for rows a deferred write may have added; dispatch
   `App\Events\Privacy\UserErased` (subject hash only).
4. Erasing an erased subject is harmless. The same Telegram user signing in later is a new user with nothing.

`App\Services\Privacy\Contracts\PersonEraser` has two implementations: `PostHogPersonEraser`, and
`NotConfiguredPersonEraser` (status `skipped_not_configured`) when the keys are missing. Commands:
`privacy:erase {user} --by= --reason=` for support requests, `privacy:retry-posthog` for failed deletions;
`privacy:replay-erasures --since=` after a restore (below) (*added by the owner-cabinet plan*).

Queued jobs that carry a user id (matching, delivery, capture) load the user and stop when it is gone, so nothing
is recreated after an erasure (`15` §3.6 row 9).

After a restore: with DEC-72 a dump holds owners' numbers in plain text and the dumps are not encrypted (`16`
SEC-REQ-038), so an erasure made after a dump's time must not come back with that dump.
`App\Services\Privacy\ErasureLedger::record(string $kind, string $hash, string $mode)` writes, after commit, one
object per erasure (kind, hash, mode, time; no id, no number, no text) to `config('erasure.ledger_disk')`, a private
disk that a restore of the database does not roll back:
`erase()` records kind `user` with the `subject_hash` beside its `erasure_requests` row, and WP-84 records kind
`owner_listing` (the HMAC-SHA-256 of the listing's ULID with `ERASURE_SUBJECT_KEY`, mode `delete` or `purge`).
`php artisan privacy:replay-erasures --since=<the dump's time>` reads the objects from that time on and repeats each
on the restored database: the user whose Telegram id hashes to a `user` entry is erased with source `replay` (a
fourth value of `$source`), the owner listing whose ULID hashes to an `owner_listing` entry is deleted or purged
through WP-84; a second run changes nothing, and the replay writes no new object. The production track's restore
procedure runs it before the restored database serves traffic (default 12 of the owner-cabinet plan, *integrator
default, listed for the reviewer*) (*added by the owner-cabinet plan*).

### Retention

`config/retention.php`: per table either a rule `{column, age, action}` (`delete`, `null_columns`,
`drop_partition`) or `{kept: "<reason>"}`. `privacy:purge-operational` (daily 04:30 Asia/Tashkent, `onOneServer`,
batches of 10 000 by an indexed age column) applies the rules.

| Table | Rule |
| ----- | ---- |
| `user_action_log` | partitions dropped after 180 days |
| `listing_votes` | `detail` set to null after 180 days |
| `radar_outbox` | deleted 30 days after `sent_at` or `failed_at` (`radar:prune` of WP-46 is registered as the executor) |
| `listing_refs` | rows with `gone_at` older than 90 days deleted |
| `personal_access_tokens` | `sanctum:prune-expired` (WP-40) |
| `telegram_updates` | the model's `Prunable` rule after `telegram.updates_retention_days`; nothing schedules `model:prune` today (`routes/console.php` holds only `inspire`), WP-50 adds the schedule entry |
| `radar_deliveries`, `listing_views`, `favorites`, `hidden_listings`, `blocked_authors`, `found_answers`, `radars` | kept while the user exists: they are the user's own lists; erasure removes them |
| `erasure_requests`, `vote_decisions`, `listing_marks`, `author_marks`, `source_flag_changes` | kept: audit or aggregates without a user link |
| framework and dashboard tables (`cache`, `jobs`, `failed_jobs`, `sessions`, `features`, Pulse, Telescope) | kept with the reason "pruned by its own tool", naming the tool |

The periods are proposals (task `KV-BE-049`, DEC-12 open); changing one is a configuration change.

### Guards against forgetting

- `backend/tests/Feature/Privacy/ErasureRegistryTest.php`: lists every table and column through the schema builder
  and fails when a table with `user_id`, `tokenable_id` or `owner_id` is neither in `config/erasure.php` nor in its
  allow-list with a reason. Of today's tables, `sessions` (`user_id`, framework sessions of the frozen web UI) goes
  into the allow-list; `media_files.uploaded_by` needs no entry, its foreign key is `nullOnDelete`.
- `backend/tests/Feature/Privacy/RetentionRegistryTest.php`: fails when a table has neither a rule nor a `kept`
  reason.
- A database-wide scan after `erase()` in a test: no row in any table references the user id.

## Files

- `backend/database/migrations/<date>_create_user_action_log_table.php`, `…_create_erasure_requests_table.php`
- `backend/app/Models/{ActionLogEntry,ErasureRequest}.php` with factories; `backend/app/Enums/Analytics/ActionChannel.php`
- `backend/app/Services/Analytics/{PartitionManager,ActionLogger,EventIngest,PostHogClient,ServerEvents,DeletionResult}.php`
- `backend/app/Services/Privacy/{ErasureService,ErasureReceipt,PostHogPersonEraser,NotConfiguredPersonEraser}.php`,
  `backend/app/Services/Privacy/Contracts/PersonEraser.php`; `backend/app/Services/Privacy/ErasureLedger.php` and
  `backend/app/Console/Commands/Privacy/ReplayErasures.php` (*added by the owner-cabinet plan*)
- `backend/app/Jobs/Analytics/CapturePostHogEvents.php`, `backend/app/Jobs/Privacy/{RequestPostHogPersonDeletion,PurgeLateActionRows}.php`,
  `backend/app/Events/Privacy/UserErased.php`, `backend/app/Listeners/Analytics/RecordContactDisclosure.php`
- `backend/app/Console/Commands/{Partitions/EnsurePartitions,Partitions/DropExpiredPartitions,Privacy/EraseUser,Privacy/RetryPostHog,Privacy/PurgeOperationalData}.php`
- `backend/config/{analytics,partitions,erasure,retention}.php` (`analytics.php` exists since WP-40 and is extended);
  `backend/routes/console.php`; `backend/app/Http/Controllers/Api/V1/EventController.php`; `backend/app/Providers/AppServiceProvider.php`
- `backend/tests/Feature/Analytics/{ActionLoggerTest,ActionLoggerCatalogueTest,EventsTest,PostHogClientTest,ServerEventsTest}.php`,
  `backend/tests/Feature/Privacy/{ErasureServiceTest,ErasureRegistryTest,RetentionRegistryTest,PurgeOperationalDataTest}.php`,
  `backend/tests/Pgsql/ActionLogPartitionTest.php`
- `backend/.env.example` (the six keys) and `docs/infrastructure/environments.md` — separate shared-file PR.
  `backend/config/horizon.php` is not changed (`trim.failed` is already 7 days)

## Steps

1. Read the five task files for rules, edge cases and test names; `.ai/agents/security-reviewer.md` and
   `.ai/agents/postgis-geo-engineer.md` (partitions, BRIN); the skills `laravel-queues` and `laravel-testing`.
   Every test file fakes HTTP and prevents stray requests.
2. `PartitionManager`, the migration, the two partition commands; the `pgsql` partition test.
3. The catalogue and `ActionLogger` with its tests (`php artisan make:class Services/Analytics/ActionLogger …`);
   the listener for `ContactDisclosed`.
4. `EventIngest` and the real `EventController`.
5. `PostHogClient`, `ServerEvents`, the capture job, the boot check.
6. `config/erasure.php`, `ErasureService`, the ledger, `PersonEraser` and its two implementations, the jobs, the
   commands; `ErasureRegistryTest` and the database-wide scan; `ErasureLedger`, `privacy:replay-erasures` and
   `ErasureReplayTest` (*added by the owner-cabinet plan*).
7. `config/retention.php`, `privacy:purge-operational`, `RetentionRegistryTest`; the schedule.
8. Pint, PHPStan, `make ci-backend`; the security-reviewer agent reads the diff; the env PR; deploy.

## Behaviour to reproduce

- The log answers "what was pressed and when", never "what was written": 180 days, no texts (legacy promise in its
  privacy text; task `KV-BE-150`).
- An unknown event name or extra fields never produce an error for the client (fix of LB-API-047); an event without
  a session is never stored (fix of LB-API-001).
- Every phone number HOMI gives out leaves a row: who asked, for which listing, when, from the app or the bot —
  never the number itself (DEC-52; legacy sends numbers with every card and records nothing).
- PostHog sees a random id per user, not a Telegram id, and the person is deleted when the user asks.
- «Удалить мои данные» removes everything at once from the database; a returning user starts empty.
- Erasure during traffic: late writes and queued jobs for the erased user leave nothing behind.

## Tests

- Catalogue: every name of WP-11 is present with typed keys and caps; `return_prompt_shown {n: 12, custom: true}`
  is stored as given; `n: "12"` and `custom: "yes"` are dropped and the rest of the event is kept.
- Disclosures: a `200` of `POST …/contact` → one `contact_disclosed` row with `listing_id` and channel `app`; the
  event with channel `bot` → channel `bot`; `contact_unavailable` → no row; the name posted to `POST /events` →
  `204`, no row; no capture job is queued for it; the row holds no digit run of the listing's phone.
- Logger: unknown name → `false`, no row; unknown properties dropped; enum value outside its set dropped; string
  over its cap cut; `app_error` stores a fingerprint and no message or source; the same error gives the same
  fingerprint; a synthetic phone, an e-mail and a `tgWebAppData` value are dropped; `recordMany` is one insert;
  channel `bot` recorded.
- Events route: each catalogue event → `204` and one row; unknown name → `204`, no row; no token → `401`, no row, no
  `error` log line; 9 KB body → `413`; the 61st event in a minute → `204`, no row; forward queued only when the
  switch is on; a property named `source` with `#tgWebAppData=` is never stored or logged.
- PostHog (HTTP fake): batch payload has the distinct id and no Telegram id, name, phone pattern or `initData`
  fragment; a retry reuses the event UUIDs; deletion success, "not found" and `5xx` with retry; unconfigured → no
  request and status `skipped_not_configured`; staging with the production project id fails the boot check.
- Erasure: a factory user with every relation of Wave 1 (settings, grant, token, favourite, view, hidden listing,
  blocked author, vote, survey answer, radar with a rule, delivery, outbox row, log rows, a media reference) →
  after `erase()` the database-wide scan finds nothing; one ledger row with a hash and no Telegram id; votes
  recounted (a mark that depended on the user is gone); one PostHog deletion queued; erasing twice is harmless; a
  queued capture job for the erased user sends nothing; a log row written 10 seconds after the erasure is removed
  by the second pass.
- Registry tests: a temporary table with `user_id` that is not registered fails `ErasureRegistryTest`; a table
  without a retention entry fails `RetentionRegistryTest`.
- Replay (`ErasureReplayTest`, fake ledger disk): copy the test database, erase a user, put the copy back, run
  `privacy:replay-erasures --since=` the copy's time → the database-wide scan finds nothing; a second run changes
  nothing and writes no object; the objects hold no Telegram id, user id or number (*added by the owner-cabinet
  plan*).
- Retention (time travel): each rule leaves data at age − 1 s and removes or redacts it at age + 1 s.
- `pgsql` group: partitions exist after migrate for the current month and three ahead; rows at 23:59:59 and
  00:00:00 UTC of a month boundary land in two partitions; a partition is dropped only when wholly older than 180
  days.

## Acceptance checklist

- [ ] `POST /events` stores catalogue events through the allow-list and answers as WP-11 specifies.
- [ ] No row of the action log can hold a key outside the catalogue, a string over its cap, or an error text.
- [ ] `ActionLogger::record()` accepts the `Bot` channel; `ErasureService::erase($user, 'bot')` is callable by the bot.
- [ ] Each disclosed phone number has one `contact_disclosed` row with the listing number and no phone.
- [ ] Erasure leaves no row with the user's id anywhere, writes the ledger, and queues one PostHog deletion.
- [ ] An erasure made after a dump is repeated by `privacy:replay-erasures` on the restored copy (*added by the
      owner-cabinet plan*).
- [ ] Both registry tests fail on an unregistered table and pass on the current schema.
- [ ] Partitions are created ahead and dropped after 180 days; the purge command and both partition commands are
      scheduled.
- [ ] No PostHog payload contains a Telegram id, a name, a phone or `initData` (asserted on the faked requests).
- [ ] The PR names the migrations, the six env keys, the retention periods as proposals, and the shared-file PR.
- [ ] `make ci-backend` and the `pgsql` group are green; the security review has no open finding.
- [ ] On staging: an event sent from the Mini App appears in `user_action_log` and, with forwarding on, in the
      staging PostHog project; `php artisan privacy:erase` on a test user empties its data.

## Handoff

Empty.
