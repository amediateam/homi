# KV-DB-007 — Identity schema

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-ACCESS-002, F-ACCESS-003, F-SETTINGS-001, F-SETTINGS-004, F-SETTINGS-005, F-ONBOARD-002, F-ONBOARD-005, F-ANALYTICS-002, F-PRIVACY-002 |
| Dependencies | KV-DB-004; CF-015 |

## Goal

The identity tables exist as reviewed migrations with models, factories and seeders: `users` extended for Telegram
identity without names, `user_settings`, `access_grants`, `beta_invites`, `user_attributions` and
`erasure_requests`. Pulled forward into M0 because the `tma` guard (KV-BE-007), the access gate (KV-BE-009) and the
phone quota (KV-BE-035) need them.

## Legacy reference

- ENT-001 … ENT-007 (`06` §2.1, lines 133-277); mapping rows in `06` §4.2 (lines 1217-1222); `14` §2 (scope) and §4.2
  (identity transformation rules).
- BR-DATA-001 (one user per Telegram id, never reused), BR-DATA-003 (no name or contact), BR-DATA-007 (admitted stays
  admitted), BR-DATA-013 … BR-DATA-015 (settings, quiet/digest formats, wire codes), BR-DATA-021 (random analytics
  id), BR-DATA-031 (erasure), BR-DATA-033 (attribution grammar); BR-API-006, BR-API-007, BR-API-012, BR-API-016,
  BR-API-121, BR-API-126, BR-API-144, BR-API-145.
- Defects fixed by design (`09` §4.3, `APPROVED`): LB-API-018 (`*_chosen` derived from stored timestamps),
  LB-API-050 (structured quiet/digest), LB-DATA-014 (`uz` stored).
- Open: Q-DATA-006 … Q-DATA-010, Q-DATA-042, Q-DATA-048, Q-DATA-049, Q-API-004, Q-API-006, Q-BOT-012.
- HOMI today: `backend/database/migrations/0001_01_01_000000_create_users_table.php:14-22` (`name`, `email`,
  `password` NOT NULL); `backend/app/Models/User.php`; `backend/database/factories/UserFactory.php`.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 1–3, 5) and `.ai/agents/security-reviewer.md`; read
   `.claude/skills/laravel-database-optimization/` and `.claude/skills/laravel-best-practices/`.
2. `php artisan make:migration extend_users_for_telegram_identity --no-interaction` (additive, the table is empty in
   every environment today): `telegram_user_id bigint unique` nullable (app users always set it; staff rows created
   before may not), `name`, `email`, `password` → nullable, `is_premium`, `has_username`, `has_photo` boolean
   nullable, `account_age_estimate date` nullable, `bot_chat_state` string default `unknown` (`unknown`, `active`,
   `blocked`; `join` and `409 no_chat` read it), `bot_commands_locale` string(2) nullable (ENT-059),
   `analytics_distinct_id` string unique nullable, `is_team` boolean default false, `last_seen_at`,
   `legacy_created_at` timestamptz nullable. Internal PK stays `bigint` (`06` §4.2). The `email` unique index stays
   (nullable values allowed).
3. `php artisan make:model UserSetting -mfs --no-interaction`: `user_id` PK/FK cascade, `locale` (`ru`, `uz`, `en`),
   `locale_chosen_at`, `currency` (`USD`, `UZS`), `theme` (`auto`, `light`, `dark`), `city_id` bigint nullable
   **without FK** (cities arrive in KV-DB-006, which adds the FK), `city_chosen_at`, `quiet_start time`,
   `quiet_end time` (both null = `off`; window may cross midnight), `digest_hours` (`smallint[]` on pgsql via
   `DB::statement`, `json` on SQLite — fallback documented in the migration), `service_news` boolean default true,
   `updated_at`. Defaults per DEC-10 for currency (configured, not hard-coded).
4. `php artisan make:model AccessGrant -mfs --no-interaction`: `user_id` unique FK, `state` (`admitted`, `blocked`),
   `role` (`user`, `owner`, `team`), `admitted_at`, `admitted_via` (`owner`, `invite`, `open`, `legacy`, `command`),
   `blocked_at`, `blocked_reason`, `flagged_at`, `flag_reason` (phone-quota review flag, SEC-REQ-028); index
   `(state, admitted_at)` for seat counting.
5. `php artisan make:model BetaInvite -mfs --no-interaction`: `token_hash` (SHA-256, unique — never the raw token),
   `max_uses`, `used_count`, `expires_at`, `created_by` nullable FK users, timestamps.
6. `php artisan make:model UserAttribution -mfs --no-interaction`: `user_id` FK cascade, `raw_payload varchar(64)`,
   `source`, `tag varchar(40)`, `seo_lang`, `seo_slice`, `visit_id char(10)`, `listing_number bigint` nullable,
   `channel`, `touched_at`; index `(user_id, touched_at)`; first/last derived by query (Q-BOT-032 open).
7. `php artisan make:model ErasureRequest -mfs --no-interaction`: `id` ULID, `subject_hash bytea` (HMAC-SHA-256 of
   the Telegram id with a dedicated key, unique), `requested_at`, `db_erased_at`, `posthog_request_id`,
   `posthog_done_at`, `source` (`bot`, `legacy_replay`, `operator`); no FK to users (the row outlives the user).
8. Update `App\Models\User`: fillable/casts (booleans, dates, `CarbonImmutable`), relations `settings()`,
   `accessGrant()`, `attributions()`; `password` cast `hashed` only when set; remove the assumption that `name` is
   required. Update `UserFactory`: default = Telegram app user (no name/email/password, random `telegram_user_id`
   from a synthetic range, random `analytics_distinct_id`); states `staff()`, `blocked()`, `owner()`, `neverStarted()`
   (`bot_chat_state = unknown`), `withSettings()`. Seeders: `IdentitySeeder` creating one owner and one admitted test
   user with synthetic ids; wire into `DatabaseSeeder`.
9. Run `vendor/bin/pint --dirty --format agent`, `composer types:check`, `php artisan test --compact`; ask before
   `migrate:fresh` on the local database (destructive, `parallel-work.md` §3).

## Files

- `backend/database/migrations/<ts>_extend_users_for_telegram_identity.php`, `<ts>_create_user_settings_table.php`,
  `<ts>_create_access_grants_table.php`, `<ts>_create_beta_invites_table.php`,
  `<ts>_create_user_attributions_table.php`, `<ts>_create_erasure_requests_table.php` (new)
- `backend/app/Models/{User,UserSetting,AccessGrant,BetaInvite,UserAttribution,ErasureRequest}.php`
- `backend/database/factories/*Factory.php`, `backend/database/seeders/IdentitySeeder.php`, `DatabaseSeeder.php`
- `backend/tests/Feature/Database/IdentitySchemaTest.php`, `backend/tests/Feature/Pgsql/IdentitySchemaPgsqlTest.php`

## API contract

n/a for endpoints — the columns must be able to produce: `MetaResponse.locale` (`uz` → `uz_Latn` at the boundary),
`locale_chosen` (`locale_chosen_at IS NOT NULL`), `currency`, `theme`, `city`, `city_chosen`, `analytics.id`,
`analytics.team`, the five `403` reasons (API-001); `SettingsResponse.quiet` (`off` or `HH-HH`) and `digest` (`HH` or
`HH,HH`) as strings (API-024); `bot_chat_state` for `403 join` and `409 {"detail":"no_chat"}` (BR-API-021,
BR-API-077).

## Business rules

Keep BR-DATA-001, BR-DATA-003, BR-DATA-007, BR-DATA-013, BR-DATA-014, BR-DATA-015, BR-DATA-021, BR-DATA-031,
BR-DATA-033, BR-API-016 (mode and owner list are configuration; owners live in `access_grants.role`). Apply
LB-API-018, LB-API-050, LB-DATA-014 (defect fixes, `APPROVED`). No DEV changes this schema; DEV-020 (`PROPOSED`) only
affects how the initial `locale` is chosen (KV-BE-007).

## Acceptance criteria

- `users` has no required name, email or password; a Telegram user row can be created with only `telegram_user_id`.
- `telegram_user_id` and `analytics_distinct_id` are unique; `erasure_requests.subject_hash` is unique.
- `user_settings` is 1:1 with users (cascade delete); `access_grants` is 1:1 (cascade delete); attributions cascade.
- Quiet `off` is representable (both times null) and a window crossing midnight (`23-08`) round-trips.
- Every new model has a factory and a seeder; `php artisan migrate:fresh --seed` succeeds on SQLite and PostgreSQL.

## Tests

- `IdentitySchemaTest` (SQLite): `it('creates a telegram user without name email or password')`,
  `it('rejects a duplicate telegram_user_id')`, `it('rejects a duplicate analytics_distinct_id')`,
  `it('cascades settings, grant and attributions when a user is deleted')`, `it('keeps erasure_requests after the
  user is deleted')`, `it('stores quiet off as two nulls and 23-08 as a crossing window')`, factory states
  `staff`, `blocked`, `owner`, `neverStarted`.
- `IdentitySchemaPgsqlTest` (`pgsql` group): `digest_hours` is `smallint[]`; `telegram_user_id` accepts
  `9007199254740991`; `migrate:rollback` of each migration succeeds.
- Schema minimisation test (SEC-REQ-036): `Schema::getColumnListing('users')` contains no `username`, `first_name`,
  `last_name`, `photo_url`, `phone`; `name` is nullable and never filled by the factory default.

## Edge cases

- Telegram ids above 2^31 and up to 2^53 − 1 (bigint everywhere).
- A staff user without `telegram_user_id` must still authenticate through Sanctum (nullable unique column).
- Existing local rows created by the starter kit: the additive migration keeps them; the PR states the local
  `migrate:fresh` need only for developers who want the seed.
- `digest_hours` empty array vs null: null = legacy default applied by the service (`14` §4.2).

## Security

SEC-REQ-036 (no names, usernames, photos, phones on users), SEC-REQ-039 (erasure ledger keyed by HMAC, no Telegram id
in clear), SEC-REQ-041 (seeds synthetic only). Invite tokens are stored hashed. The HMAC key for `subject_hash` is a
new per-environment secret named in the PR (`ERASURE_SUBJECT_KEY`, `.env.example` in a separate small PR).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist; data-impact note (users table altered,
additive) in the PR.
