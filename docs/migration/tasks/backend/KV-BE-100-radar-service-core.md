# KV-BE-100 — `RadarService` core: create-or-reactivate, update, limit under lock, `no_chat` first

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-RADAR-002, F-RADAR-003, F-RADAR-008, F-FILTER-006 |
| Dependencies | KV-DB-009 (radar tables, number sequence), KV-DB-007 (`users.bot_chat_state`), KV-BE-016 (`SearchFilters`, canonical hash), KV-BE-014 (enums), KV-QA-008 (concurrency kit); chat reachability of F-RADAR-008 maintained by the telegram track (`my_chat_member`, `/start`); decisions DEV-005, DEV-006, DEV-009, DEV-031 `PROPOSED`; Q-DATA-015 |

## Goal

One application service owns every state change of a radar for all adapters (legacy Mini App routes, bot wizard and
`/subs`, later v1): create, update, pause/resume, mode, delete. Each write runs in one transaction under a per-user lock,
checks bot reachability before anything else (`409 no_chat`), enforces `max_subscriptions`, de-duplicates by the
canonical filter hash and stores the 25-key legacy object together with the structured matching columns.

## Legacy reference

- `$KVADRO_ROOT/docs/api.md:76-85` (`409` limit vs `no_chat`, which calls need chat access), `:368-400` (`Subscription`,
  `SubscriptionMutationResult`), `:731-808` (POST, PUT, PATCH), `:441` (`max_subscriptions`, default 10).
- `$KVADRO_ROOT/docs/about.md:194-211` (one radar entity for bot and app, «k из 10»);
  `$KVADRO_ROOT/docs/telegram-bot.md:976-983` (`/subs`, edit, relax).
- Client: `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:94-129` (client-side twin check, `PATCH {active:true}`
  for a paused twin), `$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:27-54` (write-access request and one repeat).
- Audit IDs: API-018…API-023, ENT-008, BR-API-075, BR-API-076, BR-API-077, BR-API-092, BR-BOT-064, BR-BOT-099,
  BR-DATA-009, BR-DATA-010, BR-DATA-011; LB-API-013, LB-API-026, LB-API-027, LB-API-033, LB-API-034, LB-API-037,
  LB-DATA-002, LB-DATA-003, LB-DATA-011; Q-API-031, Q-API-034, Q-DATA-011, Q-DATA-015, Q-BOT-030.

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/laravel-database-optimization/` (transactions,
   locks), `.ai/agents/postgis-geo-engineer.md` (rules 1, 5, 17) and the KV-DB-009 migration notes.
2. `php artisan make:class Services/Radar/RadarService --no-interaction` with
   `create(User, SearchFilters, RadarCreateContext): RadarMutation`, `update(User, Radar, SearchFilters, ?string
   $relaxCode): RadarMutation`, `setActive(User, Radar, bool): RadarMutation`, `setMode(User, Radar, RadarMode)`,
   `delete(User, Radar): void`. `RadarCreateContext` (`app/Domain/Radar`, `make:class`) carries `entry`
   (`filters`, `empty`, `few`, `prompt`, `bot_wizard`, `bot_text`, `null`), `relaxCode` and the adapter name;
   `RadarMutation` carries the radar, the kind (`created`, `existing_active`, `reactivated`, `updated`, `resumed`,
   `paused`) and the starter window used by KV-BE-102.
3. `php artisan make:class Services/Radar/ChatReachability --no-interaction`: `canWrite(User): bool` from
   `users.bot_chat_state` (`active` → true; `blocked`, `never`, `null` → false). Throws `NoChatException` (rendered
   `409 {"detail":"no_chat"}` by the KV-BE-005 renderer). Called **first** in `create`, `update`, `setActive(true)`
   and `relax` (KV-BE-105), never in `setActive(false)`, `setMode`, unhide or `delete` (BR-API-077, `08` API-021).
4. Lock and limit: every write runs in `DB::transaction()` that first takes `pg_advisory_xact_lock(hashtext('radar:'
   || :user_id))` (pgsql; `Cache::lock("radar:{$userId}")` on SQLite). Limit `config('radar.max_subscriptions')`
   (env `RADAR_MAX_SUBSCRIPTIONS`, default 10, the same value `meta.max_subscriptions` serves in KV-BE-029) counted
   on **active** radars (`config('radar.limit_scope')` = `active`; `total` possible) — `api.md:76-77` shows the limit
   toast on `PATCH {active:true}`, which only makes sense for an active-radar limit; Q-DATA-015 confirms at R1.
   Over the limit → `RadarLimitReached` (`409 {"detail":"subscription_limit"}`, LB-API-033 fix: the old client only
   tests for `no_chat`).
5. Twins (SEC-REQ-015, LB-API-037): the canonical hash of KV-BE-016 (without `posted_days`) is looked up for the user
   before insert; the unique `(user_id, filters_hash)` of KV-DB-009 is the backstop (`insertOrIgnore` + re-read, so
   ten concurrent creates yield one row). An **active** twin → `existing_active` (no write, `200`, same id). A
   **paused** twin: `config('radar.reactivate_paused_twin')` (DEV-009 `PROPOSED`, default `false`) → when on,
   resume it and keep the new `entry`/`relaxed` (fixes LB-API-034); when off, return it unchanged with
   `existing_active`-style result (`starter` 0). An `update` whose new hash equals another radar of the user →
   `RadarDuplicate` (`409 {"detail":"duplicate"}`; the old client shows «Не получилось сохранить», spec-tested).
6. Persistence: `RadarFiltersMapper` (`app/Services/Radar`) writes `filters_v1` = `SearchFilters::toLegacyArray()`
   (all 25 keys, BR-DATA-009) and the structured columns of KV-DB-009 in one `save()`; the model guard of KV-DB-009
   refuses a 25-key mismatch. `number` from `radars_number_seq`. `posted_days`: stored as received unless
   `config('radar.drop_posted_days')` (DEV-005 `PROPOSED`) → `null`. Price bounds: `price_currency = 'USD'` for every
   legacy-route radar; `config('radar.bounds_in_entered_currency')` (DEV-006 `PROPOSED`) lets the bot store UZS bounds
   (conversion at match time in KV-BE-107). `relax_code` + `relax_matches_filters` flag are analytics only
   (LB-API-035, LB-DATA-017).
7. `update()` replaces the filters and never changes `active` (DEV-031 `PROPOSED` wording on the bot side; Q-BOT-030 for
   legacy behaviour). `setActive(false)` sets `paused_at`; `setActive(true)` clears it after the limit check.
   `delete()` deletes the radar (hide rules and pending items cascade; `radar_deliveries.first_radar_id` set null —
   the user-level dedup set stays, KV-BE-109).
8. Events dispatched `afterCommit()`: `RadarSaved` (radar id, mutation kind) and `RadarDeleted` (`php artisan
   make:event Radar/RadarSaved --no-interaction`, `Radar/RadarDeleted`). The bot (starter list, found poll) and
   KV-BE-111 listen.
9. `config/radar.php` (new): `max_subscriptions`, `limit_scope`, `reactivate_paused_twin`, `drop_posted_days`,
   `bounds_in_entered_currency`; announce the env key in the PR and add it to `backend/.env.example` in a separate PR.
10. Pint, PHPStan level 7, `make ci-backend`.

## Files

- `backend/app/Services/Radar/RadarService.php`, `RadarFiltersMapper.php`, `ChatReachability.php` (new)
- `backend/app/Domain/Radar/RadarCreateContext.php`, `RadarMutation.php` (new); `backend/app/Enums/Radar/RadarMode.php`
  (if KV-BE-014 did not create it), `RadarMutationKind.php`
- `backend/app/Exceptions/Radar/NoChatException.php`, `RadarLimitReached.php`, `RadarDuplicate.php` (new) and their
  rows in the legacy renderer map (KV-BE-005)
- `backend/app/Events/Radar/RadarSaved.php`, `RadarDeleted.php`; `backend/config/radar.php`
- `backend/tests/Feature/Radar/RadarServiceTest.php`, `backend/tests/Feature/Pgsql/Radar/RadarConcurrencyTest.php` (new)

## API contract

n/a (service). The legacy statuses it produces: `409 {"detail":"no_chat"}`, `409 {"detail":"subscription_limit"}`,
`409 {"detail":"duplicate"}`; endpoints in KV-BE-103, KV-BE-104, KV-BE-105.

## Business rules

- Kept: BR-API-075 (one entity, one limit), BR-API-076 (default 10), BR-API-077 / BR-BOT-099 / BR-DATA-010 (`no_chat`
  before any change), BR-DATA-009 (25 keys), BR-DATA-011 via the KV-BE-016 normaliser.
- Defect fixes `APPROVED` (`09` §4.3): LB-API-033 (`subscription_limit` code), LB-API-013 (the repeat after `no_chat`
  creates exactly one radar — no write happened before the `409`).
- `PROPOSED` behind config with `->todo()` tests: DEV-005 (`posted_days` null), DEV-006 (bounds in entered currency),
  DEV-009 (reactivate a paused twin, keep `entry`/`relaxed`), DEV-031 (edit keeps state, bot wording).
- Spec-tested (legacy never observed): limit on active radars (Q-DATA-015), `409 duplicate` on an edit into a twin.

## Acceptance criteria

- A user whose `bot_chat_state` is not `active` gets `NoChatException` from `create`, `update`, `setActive(true)` and no
  row changes; the same call after the state becomes `active` writes exactly once.
- With `max_subscriptions` active radars, `create` and `setActive(true)` throw `RadarLimitReached`; `setActive(false)`,
  `setMode`, `delete` still work.
- Ten concurrent identical `create` calls produce one radar and ten results naming the same `number`.
- Every stored radar has `filters_v1` with exactly 25 keys and structured columns equal to it (round-trip test).

## Tests

- `RadarServiceTest` (SQLite): `no_chat_checked_before_any_write` (dataset: `never`, `blocked`, `null`),
  `no_chat_not_checked_for_pause_mode_delete`, `limit_counts_active_radars_only`, `eleventh_active_radar_refused`,
  `resume_at_limit_refused`, `active_twin_returns_existing_without_write`, `paused_twin_returned_unchanged`,
  `->todo('DEV-009 PROPOSED: paused twin reactivated and entry kept')`, `update_into_twin_is_duplicate`,
  `update_keeps_active_state`, `posted_days_ignored_by_hash`, `->todo('DEV-005 PROPOSED')`,
  `->todo('DEV-006 PROPOSED')`, `filters_v1_has_25_keys_and_matches_columns`, `events_dispatched_after_commit`,
  `radar_saved_not_dispatched_when_transaction_rolls_back`.
- `Pgsql/Radar/RadarConcurrencyTest` (KV-QA-008): `15` §3.4 #1 (10 identical concurrent creates → one radar), §3.4 #2
  (`no_chat` then the client's single repeat → exactly one), §3.6 #2 (20 concurrent creates at 9 radars → exactly
  10, losers get the limit), §3.6 #3 (`setActive(true)` racing `create` at the limit → the limit holds).

## Edge cases

- A bot wizard save and a Mini App save of the same filters at the same moment → one radar (lock + unique hash).
- A migrated radar with `zone` instead of `zones` is normalised by KV-BE-016 before hashing (LB-DATA-004), so it is a
  twin of the same `zones` radar.
- `max_subscriptions` lowered below a user's current count → existing radars stay; only new activations are refused.
- The user is erased while a create waits on the lock → the lock holder sees no user and aborts (KV-BE-050 transaction).
- Advisory-lock key collision between users (hash collision) only serialises them; correctness is kept by the unique index.

## Security

- SEC-REQ-014: every method takes the actor and a radar loaded through `$user->radars()`; never a bare id.
- SEC-REQ-015: idempotent, race-safe create; SEC-REQ-017: only normalised `SearchFilters` reach the service.
- No Telegram ids or filter contents in logs beyond the internal user id and radar number (SEC-REQ-047).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (`15` §4) for the service part of F-RADAR-002,
F-RADAR-003 and F-RADAR-008, the `DEV` todos listed in the PR, docs and the feature rows in `09` updated, PR reviewed by
the other developer.
