# KV-BE-150 — `user_action_log` partitions and the `ActionLogger`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-ANALYTICS-003 |
| Dependencies | KV-DB-035 (partition manager), KV-DB-007 (users); retention drop by KV-DB-028; DEC-12 (retention ADR, KV-BE-049) |

## Goal

One append-only action log records "what was pressed and when, without texts" for the Mini App (API-034) and the bot,
in monthly partitions that are dropped after 180 days; one `ActionLogger` service is the only writer and stores only
allow-listed event names and property keys, so the log can never hold free text, phones or `initData`.

## Legacy reference

- ENT-021 (`06:535-553`): fields user, name, props, channel, created_at; "no texts", 180 days; volume unknown
  (Q-DATA-021).
- `$KVADRO_ROOT/docs/about.md:268`, `:375-376`, `:431` (action log promise in `/privacy`); bot audit
  `04-telegram-bot-audit.md:1168` (BR-BOT-086).
- Rules: BR-API-125, BR-BOT-086, BR-DATA-004 (180 days, no texts); BR-API-123 (closed client catalogue), BR-API-124
  (client-side bounds of `app_error`).
- Defects: LB-DATA-015 (`app_error.message` is free text inside a log promised to hold no texts — fixed here by an
  error fingerprint), LB-API-047 (unbounded properties).
- Mapping: `06` §4.2 row `user_action_log` (partitioned monthly, whitelisted `props`); `10` §4.2 Analytics module;
  `10` §4.11 (create next month's partition on the 25th, drop partitions older than 180 days).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 4, 6, 7: partitions, BRIN, autovacuum), the KV-DB-035 task
   (`PartitionManager::ensure()`), `.claude/skills/laravel-database-optimization/` and `.claude/skills/laravel-best-practices/`.
2. `php artisan make:migration create_user_action_log_table --no-interaction` (pgsql): parent table
   `user_action_log` `PARTITION BY RANGE (created_at)` with `id bigint generated always as identity`, `user_id bigint
   not null` (no FK — partitioned log, the erasure registry deletes by `user_id`), `channel varchar(8)` (`app`,
   `bot`), `name varchar(40)`, `props jsonb not null default '{}'`, `error_fingerprint char(16) null`,
   `created_at timestamptz not null`; primary key `(id, created_at)`; BRIN on `created_at` (`pages_per_range = 32`),
   btree `(user_id, created_at)` for erasure and support queries; autovacuum `scale_factor 0.01`. `up()` calls
   `PartitionManager::ensure('user_action_log', 3)`. SQLite fallback: a plain table with the same columns (tests on
   SQLite never assert partitions).
3. Register the table with the partition manager configuration (`config/partitions.php` or the KV-DB-035 registry):
   retention 180 days, so KV-DB-028's `DropExpiredPartitionsCommand` drops it.
4. `php artisan make:model ActionLogEntry --no-interaction` (table `user_action_log`, `$timestamps = false`,
   `CREATED_AT` only, `casts()` with `props` as `array`), factory with states `app()` and `bot()`.
5. `config/analytics.php` — the catalogue: event name → allowed property keys with a type and a cap. App events from
   BR-API-123 and `08` API-034: `app_launch {entry: link|news|menu, ms: int, v: str≤40, sdk: str≤20, js: str≤20,
   platform: str≤20}`, `app_opened {entry, listing_id: int, ms: int}`, `app_error {v, error.kind:
   boot|error|rejection|render, error.name: str≤40, error.stage: boot|app, error.screen: str≤40, error.tg: str≤10,
   error.platform: str≤20}` (no `message`, no `source`), `follow_prompt_shown|expired|closed {}`,
   `home_screen_offered|added|closed {}`, `chat_access_declined|allowed {}`, `listing_shared {listing_id}`,
   `original_opened {listing_id, src: button|video|sources|price_history|offers}`, `original_copied {listing_id}`,
   `contact_call {listing_id, via: tel|browser, src: text}`, `contact_write {listing_id}`. Bot events are added by the
   bot adapter (telegram track, F-ANALYTICS-003 bot part) under names prefixed `bot_` with enum-only properties.
6. `php artisan make:class Services/Analytics/ActionLogger --no-interaction`:
   `record(User $user, ActionChannel $channel, string $name, array $props, ?CarbonImmutable $at = null): bool` —
   returns `false` (and stores nothing) for a name outside the catalogue; keeps only allow-listed keys; drops values
   that fail their type or enum; truncates strings to their cap; computes `error_fingerprint` =
   first 16 hex of SHA-256 over `kind|name|message` for `app_error` (the message itself is discarded, LB-DATA-015);
   never accepts a property whose value matches the phone, e-mail or `tgWebAppData` patterns (reuses the patterns of
   `PiiMasker`, KV-BE-047, without calling the LLM gateway). `php artisan make:enum Enums/Analytics/ActionChannel
   --no-interaction` (`App`, `Bot`).
7. `recordMany()` for batched inserts (one `insert()` per request) so the API-034 path stays one statement.
8. Erasure: add `user_action_log` (strategy `delete`, by `user_id`) to `config/erasure.php` (KV-BE-050 registry);
   the registry scan test of KV-BE-050 must pass.
9. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/database/migrations/<date>_create_user_action_log_table.php` (new)
- `backend/app/Models/ActionLogEntry.php`, `backend/database/factories/ActionLogEntryFactory.php` (new)
- `backend/app/Services/Analytics/ActionLogger.php`, `backend/app/Enums/Analytics/ActionChannel.php` (new)
- `backend/config/analytics.php` (new), `backend/config/erasure.php` (entry), partition registry entry (KV-DB-035 file)
- `backend/tests/Unit/Analytics/ActionLoggerCatalogueTest.php`, `backend/tests/Feature/Analytics/ActionLoggerTest.php`,
  `backend/tests/Feature/Pgsql/ActionLogPartitionTest.php` (new)

## API contract

n/a — internal service. Consumers: API-034 (KV-BE-151) and the bot adapter (telegram track). Signature:
`ActionLogger::record(User, ActionChannel, string $name, array $props, ?CarbonImmutable $at): bool`.

## Business rules

- Kept: BR-API-125, BR-BOT-086, BR-DATA-004 (180 days, no texts); BR-API-123 (closed catalogue; unknown names are
  accepted by the endpoint but not stored, KV-BE-151).
- Defect fixes `APPROVED` (`09` §4.3): LB-DATA-015 (fingerprint instead of the error text; the legacy log is not
  migrated, `14` §2), LB-API-047 (allow-listed keys, capped values).
- No DEV.

## Acceptance criteria

- No row of `user_action_log` can contain a key outside the catalogue or a string longer than its cap.
- An `app_error` with a `message` stores a 16-hex fingerprint and no message or source text.
- `db:partitions:ensure` creates partitions for the current month and three ahead; KV-DB-028 drops a partition older
  than 180 days and keeps the boundary month.
- Erasing a user removes every row of that user from `user_action_log`.

## Tests

- `ActionLoggerCatalogueTest` (unit): every catalogue entry has typed keys and caps; the API-034 names of `08` are all
  present (`assertSame` against a list copied from BR-API-123).
- `ActionLoggerTest`: `unknown_name_is_not_stored_and_returns_false`, `unknown_props_are_dropped`,
  `enum_value_outside_set_is_dropped`, `string_over_cap_is_truncated`, `app_error_message_becomes_fingerprint`,
  `same_error_gives_same_fingerprint`, `phone_or_email_value_is_dropped` (synthetic `+998 90 000 00 00` style values),
  `tg_web_app_data_value_is_dropped`, `record_many_is_one_insert` (query count), `bot_channel_recorded`.
- `ActionLogPartitionTest` (`pgsql`): partitions exist after migrate; a row on the 31st 23:59:59 UTC and the 1st
  00:00:00 UTC land in two partitions; `PartitionManager` drop at 180 days (time travel) keeps the boundary month.
- Erasure registry scan of KV-BE-050 stays green with the new table.

## Edge cases

- Event at 19:00 UTC on the last day of a month (00:00 Tashkent of the 1st): partitions are by UTC `created_at`;
  retention is an instant comparison (180 days), not a Tashkent calendar day (`15` §3.10 #10).
- Partition missing for a far-future clock skew: the insert fails loudly in tests; production keeps three months
  ahead (KV-DB-035) — the logger never creates partitions itself.
- Very high event volume (Q-DATA-021 unknown): one insert per request, no per-event job.
- A user erased while a deferred insert is pending: the insert for a deleted `user_id` is harmless (no FK) but the
  erasure scan would find it — KV-BE-151 writes inside the request lifecycle (`defer`), and the scan runs after
  erasure commits; record the order in the PR.

## Security

- SEC-REQ-022 (allow-listed storage), SEC-REQ-038 (180 days, time-travel tested), SEC-REQ-039 (erasure registry),
  SEC-REQ-047 (no event bodies in logs), SEC-REQ-014 (rows written only for the authenticated actor).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (`15` §4) for F-ANALYTICS-003, docs and the
feature row in `09` updated, PR reviewed by the other developer; the PR announces the new table to the bot track (bot
events) and to KV-DB-028 (partition drop).
