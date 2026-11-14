# WP-40 — Sign-in, users, settings, access gate, limits

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-33 (the Mini App runs on the stub contract of WP-11) |
| Size | about 2 600 changed lines without generated files, L |
| Behaviour reference | `25` §3.4, §5 (identity, settings); WP-11 (the contract — shapes do not change here); `16` §4.1 (SEC-REQ-001 … SEC-REQ-007), §4.6 (SEC-REQ-027), SEC-REQ-047; `15` §3.1, §3.2; tasks `tasks/backend/KV-BE-006-initdata-verifier.md`, `KV-BE-009-access-gate.md`, `KV-BE-010-legacy-rate-limits.md`, `KV-BE-045-settings.md` (rules, limits, edge cases — not their routes or serializers); ADR-0003, ADR-0018 |
| Needs from the production track | 1. Approve three migrations on production: `users` gains columns and three columns become nullable; new `user_settings`; new `access_grants`. 2. Server env on staging and production: confirm `TELEGRAM_BOT_TOKEN` is the token of that environment's HOMI bot; set `ACCESS_MODE=open`; set `SANCTUM_TOKEN_PREFIX=homi_`; set `TRUSTED_PROXIES` to the addresses of the nginx that fronts the API; leave `TELEGRAM_INITDATA_MAX_AGE` and `ACCESS_MAX_SEATS` blank (defaults). 3. Confirm nginx passes `X-Forwarded-For` and that the Laravel scheduler runs (for `sanctum:prune-expired`) |

## Goal

A Telegram user of HOMI's bot signs in with `initData`, becomes a HOMI user, and gets a token with an expiry.
`GET /me`, `GET /settings` and `PATCH /settings` read and write real rows. One gate decides access on every
protected route. Every route class has its own per-user limiter. On the servers the stub user of WP-11 is gone, and
these methods answer with `meta.source = native`.

## Scope

In: the `initData` verifier; the users migration and resolver; token issuing, cap and pruning; settings storage and
service; the gate with its modes and two operator commands; named rate limiters and trusted proxies; redaction of
`initData` and tokens in logs and dashboards; the stub mode that keeps the end-to-end suite running, into which the
stub sign-in moves.

Out: the Login Widget (not used by the Mini App); invite admission and `bot_chat_state` maintenance from bot updates
(WP-52); the disclosure quota (WP-43); erasure (WP-47); ARM roles.

## Decisions that bind this package

- HOMI's own bot signs `initData`; HOMI verifies with the token of the current environment (DEC-40, `25` §3.4).
- Tokens are Sanctum personal access tokens with abilities and an expiry (ADR-0003); the Mini App keeps them in an
  `HttpOnly` cookie or in memory, never in storage (ADR-0018, SEC-REQ-007).
- Access is open to everyone, and the gate is built with all its modes (DEC-43).
- No user data comes from legacy (DEC-40): a user starts empty.
- The contract of WP-11 is binding: same routes, bodies, codes. Only `meta.source` changes, to `native`.

## Design

### Verifier

`App\Services\Identity\TelegramInitDataVerifier::verify(string $raw, ?int $maxAgeSeconds = null): TelegramInitData`,
a pure service (SEC-REQ-001):

1. Reject input over 4 096 bytes before parsing.
2. Split on `&`, `urldecode` each pair; a duplicate key is rejected. Require `hash` (64 hex) and a JSON `user` with an
   integer `id`.
3. Data-check-string: every pair except `hash`, sorted by key, `key=value` joined by `\n` (a `signature` field, if
   present, is part of it — pin this with a real `initData` of the developer's dev bot, kept out of the repository).
4. Secret = HMAC-SHA-256 of the bot token keyed with the string `WebAppData`; expected hash = hex HMAC-SHA-256 of the
   data-check-string keyed with the secret; compare with `hash_equals`.
5. `auth_date`: older than the window → `InitDataExpired`; more than 60 s in the future → invalid; non-numeric →
   invalid.
6. An empty configured token fails every input (fail closed).

`TelegramInitData` (final readonly, `App\Services\Identity`): `telegramUserId`, `isPremium`, `hasUsername`,
`hasPhoto`, `allowsWriteToPm`, `languageCode`, `authDate`, `startParam`, `fingerprint` (first 12 hex of SHA-256 of
`hash`). It never holds a name, a username or a photo address (SEC-REQ-004). Exceptions
`App\Exceptions\Identity\InvalidInitData` (internal reason enum: `too_large`, `duplicate_key`, `missing_hash`,
`bad_user`, `bad_signature`, `future_auth_date`) and `InitDataExpired`; neither message contains the raw value. They
render as `401 invalid_init_data` and `401 auth_expired`.

Configuration in `config/telegram.php`: `initdata.max_age` (`TELEGRAM_INITDATA_MAX_AGE`, default 3 600 s,
SEC-REQ-002) and `initdata.max_exchanges` (default 20).

**Replay window.** `initData` is accepted only in the JSON body of the sign-in (SEC-REQ-003). The same value may be
exchanged again inside its window — the client does so on a reload and when a token expires — but at most
`max_exchanges` times, counted in the cache by fingerprint with a TTL equal to the window; beyond that the answer is
`429 rate_limited`. Logs carry the fingerprint and the internal user id, never the value.

### Users and tokens

Migration on `users`: `name`, `email`, `password` become nullable; new columns `telegram_user_id`
(`unsignedBigInteger`, unique, nullable), `is_premium`, `has_username`, `has_photo` (boolean, default false),
`language_code` (string 8, nullable), `bot_chat_state` (string 16, default `never`; values `never`, `active`,
`blocked`), `analytics_distinct_id` (uuid, unique), `is_team` (boolean, default false), `first_start_param`
(string 64, nullable), `last_seen_at` (`timestampTz`, nullable). The same migration deletes the stub user of WP-11
and its tokens.

`App\Services\Identity\UserResolver::fromInitData(TelegramInitData): User` — `createOrFirst` on `telegram_user_id`,
then update the booleans, `language_code` and `last_seen_at`. On creation: a random `analytics_distinct_id`,
`first_start_param`, and a `user_settings` row with defaults. `allows_write_to_pm = true` sets `bot_chat_state` to
`active`; `false` never downgrades it (verify the field name in the current Telegram documentation). Two concurrent
first sign-ins create one user.

`App\Services\Identity\TokenIssuer::issue(User): NewAccessToken` — name `miniapp`, abilities `app:read` and
`app:write` only (never `media:write`, `intake:write`, `arm:*`), expiry `config('access.token_ttl_minutes')`
(default 1 440); at most `config('access.max_tokens')` (default 5) unexpired tokens per user, the oldest is revoked.
`sanctum.token_prefix` already reads `SANCTUM_TOKEN_PREFIX` (`config/sanctum.php`, unchanged). `routes/console.php` schedules `sanctum:prune-expired --hours=24` daily.

### Sign-in

`TelegramAuthController` (the class of WP-11, body replaced): limiter → verify → resolve user → gate → issue token →
`SessionResource` with `meta.source = native`. A gate refusal answers `403 access_denied` with `reason` and issues no
token.

### Stub mode for the end-to-end suite

The Playwright suite runs on stubs (`25` §9) and must keep doing so while stage C replaces stub controllers with
real code. `config('sources.native_stubs')` (`SOURCES_NATIVE_STUBS`, default false; a boot check in
`SourceServiceProvider` refuses it outside `local` and `testing`) switches on the middleware
`App\Http\Middleware\AnswerNativeStubs` on the `v1` group. It looks the route name up in
`App\Services\Sources\Stub\NativeStubs` — a map of route name to a callable that builds the stub answer with
`StubResponder` (fixtures, scenario header, `meta.source = stub`) — and answers without reaching the real
controller. Rule for this and every later package of stage C: when a stub controller body is replaced, the old body
moves into this map; it is not deleted. This package moves sign-in (with `StubUser`), `me` and settings. On staging
and production the switch cannot be on, so no stub code can answer there. If the end-to-end workflow already boots
the API, set `SOURCES_NATIVE_STUBS=true` in its environment in this PR.

### Settings

Table `user_settings`: `user_id` (primary key, foreign key, cascade), `locale` (string 2), `locale_chosen_at`,
`currency` (string 3), `theme` (string 8), `city` (string 64, nullable), `city_chosen_at`, `quiet_start`,
`quiet_end` (`time`, both null = off), `digest_hours` (`json`, sorted unique integers), timestamps.

- Defaults on creation (`config/settings.php`, `defaults`): locale `uz` when `language_code` starts with `uz`, `en` when it
  starts with `en`, else `ru` — one resolver for the Mini App and the bot (BR-APP-050 names only the `uz` and `ru`
  branches for the client; the bot of `04` also answers English users in English), not marked chosen; currency `USD`; theme `auto`; city `null`; quiet hours 23–8; digest hours
  `[9]`. The last two are a specification choice: the legacy default is unknown.
- `App\Services\Identity\SettingsService`: `get(User): UserSettingsData`; `patch(User, array $changes):
  UserSettingsData` updates only the sent keys in one `UPDATE` per key set, sets `locale_chosen_at` or
  `city_chosen_at` when `locale` or `city` is stored, and dispatches `App\Events\Identity\SettingsChanged` (user id,
  changed keys) after commit. The bot (language of its menu and texts) and the delivery planner (WP-46) listen later.
- Value objects `QuietWindow` (`fromHours(?int, ?int)`, `contains()`, `endAfter()`, crossing midnight) and
  `DigestSchedule` (`fromHours(array)`, `nextSlotAtOrAfter()`), both in Asia/Tashkent wall-clock through the zone
  name, never a fixed offset.
- `SourceContext::fromRequest()` now takes the currency from the user's settings.

### Access gate

`config/access.php`: `mode` (`ACCESS_MODE`: `private`, `invite`, `open`; default `private`, so a missing key fails
closed), `max_seats` (`ACCESS_MAX_SEATS`, null = unlimited), `owner_telegram_ids` (list, from env, for `private`),
`require_chat` (default false: in open mode a user who has not started the bot is still let in; radar writes have
their own `no_chat` check).

Table `access_grants`: `user_id` (primary key, foreign key, cascade), `state` (`admitted`, `blocked`),
`admitted_via` (`open`, `invite`, `owner`, `operator`), `flagged_at`, `flag_reason`, timestamps.

`App\Services\Access\AccessGate::decide(User): AccessDecision` (`App\Enums\AccessState`: `Granted`, `Private`,
`Invite`, `Full`, `Blocked`, `Join`), in this order: grant `blocked` → `Blocked`; `require_chat` and chat not active
→ `Join`; grant `admitted` or owner → `Granted`; mode `private` → `Private`; mode `invite` → `Invite`; mode `open`
with `max_seats` and no seat left → `Full`; mode `open` → `Granted` (with `max_seats` set, the admission inserts the
grant under a lock that counts seats; without it no row is written). The decision is cached per user for 2 s and
flushed when the grant or `bot_chat_state` changes.

Middleware `App\Http\Middleware\EnsureAccessGranted`, alias `access`, on every bearer route; `access:lenient` (only
`blocked` is refused) on `POST /events`. Commands `access:block {user}` and `access:unblock {user}` (internal user
id; `--by` and `--reason` required; one log line without any Telegram id).

### Rate limits

Named limiters in `AppServiceProvider::configureRateLimiting()`, values from a new `config/rate_limits.php` (starting
values of SEC-REQ-027, to be tuned on staging). The key is `user:<internal id>`, or the client address for public
routes; it never contains a Telegram id.

| Limiter | Limit | Routes |
| ------- | ----- | ------ |
| `v1-auth` | 10 per minute per address, 5 per minute per verified Telegram user | `POST /auth/telegram` |
| `v1-public` | 60 per minute per address | `GET /reference`, `GET /cities`, `GET /landing/*` |
| `v1-me` | 30 per minute | `GET /me` |
| `v1-reads` | 300 per minute | feed, count, flow, map, `GET /settings`, `GET /radars`, `GET /favorites`, `GET /history`, `GET /hidden` |
| `v1-listing` | 120 per minute | `GET /listings/{number}` |
| `v1-contact` | 30 per hour | `POST …/contact` |
| `v1-translation` | 30 per hour, counted on cache misses inside the service (WP-43) | `POST …/translation` |
| `v1-share` | 20 per hour | `POST …/share` |
| `v1-lists` | 60 per minute | favourites, hidden, blocked authors, `DELETE /history`, surveys |
| `v1-reports` | 30 per day | `POST …/reports` |
| `v1-radars` | 30 per minute | radar writes and `PATCH /settings` |
| `v1-events` | 60 per minute; the excess is answered `204` and dropped | `POST /events` |

Notes: `RateLimiter::for('api')` exists today, but `bootstrap/app.php` never calls `throttleApi()`, so check with
`php artisan route:list -v` which routes carry which limiter before and after. The `throttle:api` that WP-11 put on
the `v1` group is replaced by the named limiters. The limiter runs after authentication. Trusted proxies: the list
comes from `TRUSTED_PROXIES` through a config value; find with `search-docs` how `trustProxies()` takes a value that
survives `config:cache`, and do not call `env()` in `bootstrap/app.php`.

### Redaction

`init_data` and `Authorization` never reach a log, Telescope, Pulse or an exception context (SEC-REQ-047): add
`init_data` to the hidden request parameters and `authorization`, `cookie` to the hidden headers in
`TelescopeServiceProvider`; add `init_data` to the `dontFlash` list in `bootstrap/app.php`; a test greps the log
channel after a failed and a successful sign-in.

## Files

- `backend/app/Services/Identity/{TelegramInitData,TelegramInitDataVerifier,UserResolver,TokenIssuer,SettingsService,UserSettingsData,QuietWindow,DigestSchedule}.php`
- `backend/app/Exceptions/Identity/{InvalidInitData,InitDataExpired}.php`; `backend/app/Events/Identity/SettingsChanged.php`
- `backend/app/Services/Access/{AccessGate,AccessDecision}.php`, `backend/app/Enums/AccessState.php`,
  `backend/app/Http/Middleware/EnsureAccessGranted.php`, `backend/app/Console/Commands/Access/{BlockUser,UnblockUser}.php`
- `backend/app/Models/{User,UserSetting,AccessGrant}.php` with factories (`UserFactory` gains a `telegram()` state)
- `backend/database/migrations/<date>_add_telegram_identity_to_users_table.php`, `…_create_user_settings_table.php`,
  `…_create_access_grants_table.php`
- `backend/app/Http/Controllers/Api/V1/{Auth/TelegramAuthController,MeController,SettingsController}.php` (bodies
  replaced); `backend/app/Services/Sources/SourceContext.php`; `backend/app/Services/Sources/Stub/NativeStubs.php`,
  `backend/app/Http/Middleware/AnswerNativeStubs.php` (new); `backend/config/sources.php` (`native_stubs`)
- `backend/config/{telegram,access,rate_limits,settings,app}.php`, `backend/app/Providers/{AppServiceProvider,TelescopeServiceProvider}.php`,
  `backend/bootstrap/app.php`, `backend/routes/{api,console}.php`
- `backend/tests/Unit/Identity/{TelegramInitDataVerifierTest,QuietWindowTest,DigestScheduleTest}.php`,
  `backend/tests/Feature/Api/V1/Auth/*`, `backend/tests/Feature/Access/*`, `backend/tests/Feature/Api/V1/{MeTest,SettingsTest,RateLimitTest}.php`,
  `backend/tests/Support/InitDataSigner.php` (signs synthetic values with the test token of `phpunit.xml`)
- `backend/.env.example` (the five keys) and `docs/infrastructure/environments.md` (their names) — separate
  shared-file PR; `docs/api/openapi.json` and generated types (regenerated; expected diff: none in shapes)

## Steps

1. Read the four task files for rules and edge cases, `.ai/agents/security-reviewer.md`, the skills
   `laravel-owasp-security` and `laravel-best-practices`. Add a synthetic `TELEGRAM_BOT_TOKEN` to `phpunit.xml`.
2. Verifier with its unit tests and `InitDataSigner` (`php artisan make:class …`, `make:test --pest --unit …`).
3. Users migration, `UserResolver`, factories (`php artisan make:migration …`, `make:model UserSetting --factory`).
4. `TokenIssuer`, the token cap, the prefix, the prune schedule.
5. Real sign-in: controller body, the exchange counter, error mapping; feature tests.
6. `user_settings`, value objects, `SettingsService`, `MeController`, `SettingsController`.
7. `access_grants`, `AccessGate`, the middleware on the route groups, the two commands.
8. `config/rate_limits.php`, named limiters, attach them per route; trusted proxies.
9. Redaction and its test. `AnswerNativeStubs`, `NativeStubs` and the boot check; move the stub answers of sign-in,
   `me` and settings into the map; run the Playwright suite in stub mode.
10. Pint, PHPStan, `make ci-backend`; the security-reviewer agent reads the diff; the env PR; deploy and check.

## Behaviour to reproduce

- First contact creates the user without any name data; the first `GET /me` says `locale_chosen: false` and
  `city_chosen: false`, which drives the two first-launch pickers.
- A `PATCH` with `locale` makes the next `GET /me` return it with `locale_chosen: true`; the same for `city`
  (legacy rule of API-025, fix of LB-API-018: the flags are derived, never sent by the client).
- Partial updates keep untouched keys; two concurrent patches of different keys both survive (LB-API-049).
- `401` only for authentication, `403 access_denied` only for the gate (fix of LB-API-021).
- A stale `initData` is `auth_expired`, so the client can show "reopen the app" instead of looping (LB-APP-047).
- The recorded radar-tab burst and a filter session pass without a `429` (task `KV-BE-010`): 30 reads within 2 s, and
  40 count plus 20 flow requests within a minute.

## Tests

- Verifier (frozen clock): valid value; field order irrelevant; one mutation per field fails; missing, short and
  malformed `hash`; duplicate key; non-JSON `user`; string `id`; 4 097 bytes; empty string; another bot token; empty
  configured token; window boundaries (window − 1 s passes, window + 1 s expired, now + 61 s invalid); a value with
  a `signature` field; `+` and `%20` in the user JSON; no raw value in any exception message.
- Sign-in: valid → `200`, token authenticates `GET /me`, `meta.source = native`; forged → `401
  invalid_init_data`; old → `401 auth_expired`; the 21st exchange of one value → `429`; `initData` in the query string
  is ignored; a new user row has `name`, `email`, `password` null; two concurrent first sign-ins → one user (`pgsql`).
- Tokens: abilities are exactly `app:read`, `app:write`; a media write → `403 forbidden`; an expired token → `401`;
  the sixth token revokes the first; `sanctum:prune-expired` is scheduled.
- Gate (dataset over mode, grant, owner, seats, chat state): each expected state; `blocked` beats everything; with
  `max_seats = 2`, 20 concurrent first requests admit exactly 2 (`pgsql`); every bearer route answers `403
  access_denied` with `reason: "blocked"` for a blocked user (generated from the route list); `POST /events` lets a
  non-blocked gated user through; `GET /reference` stays `200`.
- Settings: each key; meta round-trip; `uz` stored and returned as `uz`; invalid values → `422`; `{}` → `200`;
  `SettingsChanged` carries only the changed keys; user B never sees or changes user A's settings (`15` §3.1 row 7).
- Limits: one case per limiter with small test values; `Retry-After` present; two users have two buckets; one user on
  two addresses shares one; the burst fixtures pass; behind a configured proxy two client addresses get two buckets
  and a forged `X-Forwarded-For` from elsewhere is ignored.
- Redaction: no log line contains the signed value or a token after any of the cases above.

## Acceptance checklist

- [ ] Sign-in with a value signed by the environment's bot token works; any other value is refused with the right code.
- [ ] `GET /me`, `GET /settings`, `PATCH /settings` and sign-in answer with `meta.source = native`; shapes equal WP-11.
- [ ] Tokens carry only `app:read` and `app:write`, expire, are capped at 5 per user and are pruned.
- [ ] The gate runs on every bearer route; `access:block` takes effect within 2 seconds; mode `open` lets everyone in.
- [ ] Every v1 route has a named limiter (`route:list -v` attached to the PR); no route uses `throttle:api`.
- [ ] `initData` and tokens never appear in logs, Telescope or Pulse.
- [ ] The stub user and its tokens are removed from the databases of staging and production; stub answers of these
      methods exist only behind `SOURCES_NATIVE_STUBS` in `local` and `testing`, and the Playwright suite passes there.
- [ ] `make ci-backend` and the `pgsql` group are green; the security review has no open finding.
- [ ] The production track set the env keys and approved the migrations.
- [ ] Inside Telegram on staging, then production (iOS, Android, Desktop, Web): the app opens and signs in; language
      and city picks survive a relaunch; cookie mode and header mode both reach the feed.

## Handoff

Empty.
