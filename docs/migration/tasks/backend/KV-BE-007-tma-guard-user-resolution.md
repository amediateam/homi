# KV-BE-007 — `tma` guard and Telegram user resolution

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-ACCESS-001, F-ACCESS-003 |
| Dependencies | KV-BE-005, KV-BE-006, KV-DB-007 |

## Goal

Every protected legacy route authenticates its request from `Authorization: tma <initData>` alone, resolves (or
creates) the HOMI user by Telegram id without storing names, username or photo, and fails silently and correctly for
empty, malformed, expired or foreign credentials. `tma` works nowhere else; `Bearer` tokens do not work on the legacy
group.

## Legacy reference

- Header on every request (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:77-78`), stateless (BR-API-004); user key =
  Telegram `user.id`, no name or contact stored (BR-API-006, BR-DATA-001, BR-DATA-003); three profile flags and an
  account-age estimate (BR-API-007; `$KVADRO_ROOT/docs/about.md:155`, `:228`).
- `Authorization: tma ` with an empty value from React `app_error` (`$KVADRO_ROOT/demo/app/src/lib/errors.js:101-122`;
  BR-API-010; LB-API-001) must be rejected silently.
- First call creating the user or recording `start_param` is unknown (Q-API-004); attribution is recorded by the bot
  `/start` (M5), not here.
- Random PostHog id per user (BR-API-126, ENT-006); locale detection from `language_code` (BR-API-149; DEV-020).
- Requirements: SEC-REQ-003, SEC-REQ-004, SEC-REQ-005, SEC-REQ-036, SEC-REQ-047; CF-002, CF-015; tests `16` §5.1,
  `15` §3.2 rows 6, 7, 10, 11 and §3.4 #8.

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (authentication), `.claude/skills/laravel-testing/`,
   `.ai/agents/security-reviewer.md`, `.ai/agents/telegram-bot-engineer.md` (identity conventions).
2. Tests first (below).
3. `php artisan make:class Services/Identity/UserResolver --no-interaction`:
   `resolve(TelegramInitData $data): User` — `User::query()->upsert([...], ['telegram_user_id'], [flags])` then fetch, or
   `insertOrIgnore` + select inside a transaction, so concurrent first requests create one row; on creation set
   `analytics_distinct_id` (`Str::uuid()->toString()`), `account_age_estimate` (from a small id-range table in
   `config/telegram.php`, marked UNVERIFIED), and a `user_settings` row with `locale` from
   `LocaleCode::fromTelegram($data->languageCode)` (KV-BE-014; until it exists, `uz*` → `uz`, `en*` → `en`, else `ru`) and
   `locale_chosen_at = null`, `city_chosen_at = null`; update `is_premium`, `has_username`, `has_photo` on every call only
   when they changed (no write per request otherwise).
4. Register the guard: in `AppServiceProvider::boot()` `Auth::viaRequest('tma', …)` (or `php artisan make:class
   Auth/TmaGuard` implementing `Guard`), and in `backend/config/auth.php` add `'tma' => ['driver' => 'tma', 'provider'
   => 'users']`. The callback reads only the `Authorization` header: scheme must be exactly `tma` followed by one space;
   empty value → `AuthenticationException` flagged "silent"; any other scheme (`Bearer`) → `AuthenticationException`;
   `initData` in query or body is ignored (SEC-REQ-003). It calls the verifier with
   `config('telegram.initdata.max_age')`; `InitDataExpired` propagates to the renderer (`401 auth_expired`).
5. Attach `auth:tma` to the `legacy` API group in `routes/legacy.php` except the anonymous routes (`GET /api/bot`,
   `POST /api/csp-report`, `/media/*`, `/call/*`), and make sure `/api/v1` routes keep `auth:sanctum` only, so `tma` there
   gives `401` (SEC-REQ-004).
6. Logging: one `info` line per authentication failure with the reason, route name, request id and `fingerprint`;
   the empty-`tma` case is logged at `info` and never reported to the exception handler (`$exceptions->dontReport` for
   the silent flag); Telegram id never logged — the internal user id goes into the log context after success.
7. Pint, PHPStan, tests.

## Files

- `backend/app/Services/Identity/UserResolver.php` (new)
- `backend/app/Providers/AppServiceProvider.php` (guard registration), `backend/config/auth.php`,
  `backend/config/telegram.php` (account-age table)
- `backend/routes/legacy.php` (middleware on the group)
- `backend/app/Models/User.php` (casts, `settings()` HasOne, `$hidden` for `telegram_user_id` in serialisation)
- `backend/tests/Feature/Identity/{TmaGuardTest,UserResolverTest}.php` (new)

## API contract

On every protected legacy route: no header → `401 {"detail":"unauthorized"}`; `tma ` (empty) → `401
{"detail":"unauthorized"}`, nothing stored, info log only; malformed/tampered/foreign-token `initData` → `401
{"detail":"unauthorized"}`; expired → `401 {"detail":"auth_expired"}`; `Authorization: Bearer …` → `401
{"detail":"unauthorized"}`. On `/api/v1/*`: `tma` → `401` envelope. Success attaches the user; the response is the
route's own.

## Business rules

Kept: BR-API-004, BR-API-006, BR-API-007, BR-API-008, BR-API-010, BR-DATA-001, BR-DATA-003. Defect fixes asserted now:
LB-API-001 (silent `401`, nothing stored), LB-API-020 (no `Authorization` in logs — together with KV-BE-008).
`PROPOSED`: DEV-002 (`auth_expired` window, client handling is new-client only — test `->todo('DEV-002 PROPOSED')` for
the window value), DEV-020 (one language detector: `uz*` → `uz`, `en*` → `en`, else `ru`; Q-BOT-035 for the bot).

## Acceptance criteria

- The `16` §5.1 legacy column passes on a test-only protected route of the group.
- Two concurrent first requests of the same Telegram user create exactly one `users` row and one `user_settings` row
  (PostgreSQL group).
- A new user row has `name`, `email`, `password`, username and photo values empty; no column stores a name.
- The empty-`tma` request produces no error-level log line and no stored row of any kind.
- `tma` on `/api/v1/media/{id}` → `401`; `Bearer` on the legacy route → `401`.

## Tests

`backend/tests/Feature/Identity/TmaGuardTest.php` (signer from KV-QA-003, frozen clock):
- `it('authenticates a valid tma header and attaches the user')`.
- dataset `it('rejects bad credentials with 401 unauthorized', …)`: none, empty `tma `, `tma  ` + garbage, tampered,
  other token, `Bearer x`, `initData` only in `?tgWebAppData=`, only in the body.
- `it('answers auth_expired after the window')`.
- `it('logs the empty tma case at info without reporting it')` with `Log::spy()`.
- `it('refuses tma on v1 routes')`.
`backend/tests/Feature/Identity/UserResolverTest.php`:
- `it('creates a user without names on first contact')`, `it('updates profile flags only when they change')`,
  `it('creates default settings with the detected locale')` (dataset `uz`, `uz-UZ`, `en-GB`, `kk`, `null`),
  `it('generates a random analytics id that is not the telegram id')`.
- `pgsql` group (KV-QA-001, KV-QA-008): `it('creates one user under concurrent first requests')`.

## Edge cases

- `prefetch` failure plus the immediate repeat of `GET /api/meta` (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:56-60`)
  → still one user row (`15` §3.4 #8).
- A Telegram id above 2^31 (bigint column, JSON int in PHP 64-bit).
- A user previously erased (`erasure_requests` HMAC match): re-created as a new user on next contact (the ledger only
  blocks re-import of migrated data, `14` §7.9).
- `bot_chat_state` stays `unknown` until the bot (M5) observes `/start` or `my_chat_member`.

## Security

SEC-REQ-003 (header only, fingerprint logs), SEC-REQ-004 (credential per surface), SEC-REQ-005 (status semantics),
SEC-REQ-036 (minimisation), SEC-REQ-047 (no `Authorization`, no Telegram id in logs); race-safe creation (SEC-REQ-015).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint and PHPStan level 7 clean; security-reviewer checklist clean; F-ACCESS-001 and
F-ACCESS-003 gate items G3/G6 evidence linked.
