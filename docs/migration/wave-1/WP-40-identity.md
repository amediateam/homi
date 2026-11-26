# WP-40 — Sign-in, users, settings, access gate, limits

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | WAITING (merged in #124 on 2026-11-26 as `a987ecd`, env keys #125 `d650cac`; production track: the items of "Needs from the production track", then the checks inside Telegram) |
| Depends on | WP-33 (the Mini App runs on the stub contract of WP-11) |
| Size | about 2 600 changed lines without generated files, L |
| Behaviour reference | `25` §3.4, §5 (identity, settings); WP-11 (the contract — shapes do not change here); `16` §4.1 (SEC-REQ-001 … SEC-REQ-007), §4.6 (SEC-REQ-027), SEC-REQ-047; `15` §3.1, §3.2; tasks `tasks/backend/KV-BE-006-initdata-verifier.md`, `KV-BE-009-access-gate.md`, `KV-BE-010-legacy-rate-limits.md`, `KV-BE-045-settings.md` (rules, limits, edge cases — not their routes or serializers); ADR-0003, ADR-0018 |
| Needs from the production track | 1. Approve three migrations on production: `users` gains columns and three columns become nullable (the stub user of WP-11 and its tokens are deleted); new `user_settings`; new `access_grants`. 2. Server env on staging and production: confirm `TELEGRAM_BOT_TOKEN` is the token of that environment's HOMI bot; set `ACCESS_MODE=open` (a missing key means `private`: every user is refused); set `SANCTUM_TOKEN_PREFIX=homi_`; set `TRUSTED_PROXIES` to the addresses the Next servers reach the API from — the app host's loopback and/or its public address, and the edge's ranges if an edge (DEC-16) fronts app.* or api.* —, not the nginx of the API, which hands PHP the connecting address through FastCGI (*corrected while executing*: the Mini App's server-side calls are the hop that forwards `X-Forwarded-For`; *added while executing*: unset, every sign-in counts in one `v1-auth` bucket of 10 a minute, because the Mini App signs in from its server, and `*` or `**` is read as unset); leave `TELEGRAM_INITDATA_MAX_AGE`, `ACCESS_MAX_SEATS` and `RATE_LIMIT_LISTING_OPENS_PER_DAY` blank (defaults: 3 600 s, no seat limit, 100 cards a day — DEC-104; the last key *added while executing*); leave `ACCESS_PAUSED` unset (the pause switch stays off, DEC-60) and `SOURCES_NATIVE_STUBS` unset (the API refuses to boot with it outside `local` and `testing`); keep `TELESCOPE_RECORD_ALL` off (*added while executing*: its query entries would hold a token's hash). 3. Confirm that the nginx in front of the Next servers sets `X-Forwarded-For` (`infra/production/nginx/app.homi.conf`) and that the Laravel scheduler runs (for `sanctum:prune-expired`). 4. After the deploy, check on staging that two clients on two addresses get two buckets of `v1-auth` through `/bff/session`, that a forged `X-Forwarded-For` prefix is ignored, and that a forged `X-Forwarded-For` sent straight to `api.*` is ignored (*added while executing*). 5. Go-live conditions, not blockers of the merge, for the developer and the production track (*added while executing*: the security review; ЗРУ-547, SEC-REQ-050, Q-SEC-005): this package is the first to store real Telegram identities, so before sign-in goes live on production confirm that the app host and the database host are in Uzbekistan and register the database in the State Register; revisit `DB_SSLMODE=disable` (`require`, better `verify-full`) before the WP-40 migrations run on production. 6. Before the deploy, check `show timezone` of the databases of staging and production as the app's role on the app's database (*added while executing*, AM-114): the `pgsql` connection now sets the session zone to UTC; if a server's zone is not UTC, the rows already in the `timestamptz` columns of the earlier tables were stored shifted by its offset, and the old rows of `failed_jobs.failed_at` hold local time; they are corrected or accepted then. |

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
- Beside the modes the gate has a pause switch, off by default: the sixth reason `paused` of WP-11 (DEC-60; legacy
  since `index-CIa0Ldj2.js`). Team accounts (`users.is_team`) pass a pause; `blocked` still wins for them (DEC-106,
  *added while executing*).
- Opening listings has a per-user daily cap of HOMI's own, answered as `429 rate_limited` with `reason: "daily"`
  (DEC-59). Its threshold is open (Q-API-085). *Corrected while executing:* answered on 2026-11-26 — 100 different
  full cards per user in 24 hours, from configuration (DEC-104); the preview form is not counted (DEC-105); a card
  already counted in the window opens again for free (DEC-107).
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
   *Corrected while executing:* only `hash` is removed; `signature` stays in the string of the `hash` check. The
   Telegram documentation drops both only for the Ed25519 check of third parties, and four libraries
   (`@tma.js/init-data`, `@telegram-apps/init-data-node`, aiogram, telegram-webapp-auth) remove only `hash` here.
   An independent fixture signed by a Python script pins the mechanics; the check with a real value of the dev bot
   is still open (see "As built").
4. Secret = HMAC-SHA-256 of the bot token keyed with the string `WebAppData`; expected hash = hex HMAC-SHA-256 of the
   data-check-string keyed with the secret; compare with `hash_equals`. The signature is checked before `user` is
   decoded, so a forged value never reaches the JSON parser (*added while executing*).
5. `auth_date`: older than the window → `InitDataExpired`; more than 60 s in the future → invalid; non-numeric →
   invalid. A missing or non-numeric `auth_date` is the internal reason `bad_auth_date` (*added while executing*).
6. An empty configured token fails every input (fail closed).

The parameters that hold the raw value are marked `#[\SensitiveParameter]` (in the verifier and in
`TelegramSignIn`), so a stack trace shows none of it (SEC-REQ-047; *added while executing*: the local PHP keeps
the arguments of a trace, `zend.exception_ignore_args=Off`).

`TelegramInitData` (final readonly, `App\Services\Identity`): `telegramUserId`, `isPremium`, `hasUsername`,
`hasPhoto`, `allowsWriteToPm`, `languageCode`, `authDate`, `startParam`, `fingerprint` (first 12 hex of SHA-256 of
`hash`). It never holds a name, a username or a photo address (SEC-REQ-004). The request service of WP-85 reads the
seeker's first name from the launch data the Mini App sends with a request, verified with this verifier (DEC-76);
neither `users` nor `TelegramInitData` holds it (*added by the owner-cabinet plan*). Exceptions
`App\Exceptions\Identity\InvalidInitData` (internal reason enum `App\Exceptions\Identity\InvalidInitDataReason`:
`too_large`, `duplicate_key`, `missing_hash`, `bad_user`, `bad_signature`, `future_auth_date`, and `bad_auth_date`
*added while executing*) and `InitDataExpired`; neither message contains the raw value, and the reason never reaches
the body. They render as `401 invalid_init_data` and `401 auth_expired`. *Added while executing:* both, and
`AccessDenied`, implement `ShouldntReport`, so a refused sign-in writes only the sign-in's own log line, not an error
entry with a trace.

Configuration in `config/telegram.php`: `initdata.max_age` (`TELEGRAM_INITDATA_MAX_AGE`, default 3 600 s,
SEC-REQ-002) and `initdata.max_exchanges` (default 20).

**Replay window.** `initData` is accepted only in the JSON body of the sign-in (SEC-REQ-003). *Corrected while
executing:* `TelegramSignInRequest::validationData()` returns the JSON body, so an `init_data` in the query string
(or a form field) is never read; the form request's 4 096-byte rule stays (4 097 → `422`). The same value may be
exchanged again inside its window — the client does so on a reload and when a token expires — but at most
`max_exchanges` times, counted in the cache by fingerprint with a TTL equal to the window; beyond that the answer is
`429 rate_limited`. Logs carry the fingerprint and the internal user id, never the value.

### Users and tokens

Migration on `users`: `name`, `email`, `password` become nullable; new columns `telegram_user_id`
(`unsignedBigInteger`, unique, nullable), `is_premium`, `has_username`, `has_photo` (boolean, default false),
`language_code` (string 8, nullable), `bot_chat_state` (string 16, default `never`; values `never`, `active`,
`blocked`), `analytics_distinct_id` (uuid, unique), `is_team` (boolean, default false), `first_start_param`
(string 64, nullable), `last_seen_at` (`timestampTz`, nullable). The same migration deletes the stub user of WP-11
and its tokens (*added while executing:* the tokens are a morph relation without a foreign key, so they are deleted
first, by hand; a collector's token that shares the stub user's id is kept). `analytics_distinct_id` is added
nullable, filled with a random UUID for every remaining row, and then changed to `NOT NULL` in the same migration:
SQLite, which the tests use, refuses `ADD COLUMN … NOT NULL` without a default even on an empty table. *Added while
executing:* the model's `creating` hook gives every new user a random UUID, because `StubUser::get()` and the
factories create users without one; in `local` and `testing` the stub sign-in of `SOURCES_NATIVE_STUBS` creates the
stub user again on its next call, which it cannot do on the servers.

`App\Services\Identity\UserResolver::fromInitData(TelegramInitData): User` — `createOrFirst` on `telegram_user_id`,
then update the booleans, `language_code` and `last_seen_at`. On creation: a random `analytics_distinct_id`,
`first_start_param`, and a `user_settings` row with defaults. `allows_write_to_pm = true` sets `bot_chat_state` to
`active`; `false` never downgrades it (verify the field name in the current Telegram documentation). Two concurrent
first sign-ins create one user. *Corrected while executing:* a known user is looked up first, and `createOrFirst`
runs only when there is none, so a returning sign-in runs no INSERT that fails (see "As built");
`allows_write_to_pm = true` raises `bot_chat_state`
only from `never` to `active`; `blocked` is left to the bot's own chat-member updates (WP-52), because a launch flag
must not undo a block the bot saw. A change of the state calls `AccessGate::forget()`. `first_start_param` keeps
`start_param` only when it matches `^[A-Za-z0-9_-]{1,64}$`, and `language_code` only a tag of the form
`^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})?$` of at most 8 characters, else null; a later launch without `language_code`
keeps the last known value.

`App\Services\Identity\TokenIssuer::issue(User): NewAccessToken` — name `miniapp`, abilities `app:read` and
`app:write` only (never `media:write`, `intake:write`, `arm:*`), expiry `config('access.token_ttl_minutes')`
(default 1 440); at most `config('access.max_tokens')` (default 5) unexpired tokens per user, the oldest is revoked.
*Corrected while executing:* the cap counts and revokes only the user's unexpired `miniapp` tokens, and the issuer
locks the user's row while it issues, so two concurrent sign-ins never keep a surplus.
`sanctum.token_prefix` already reads `SANCTUM_TOKEN_PREFIX` (`config/sanctum.php`, unchanged). `routes/console.php`
schedules `sanctum:prune-expired --hours=24` daily.

### Sign-in

`TelegramAuthController` (the class of WP-11, body replaced): limiter → verify → resolve user → gate → issue token →
`SessionResource` with `meta.source = native`. A gate refusal answers `403 access_denied` with `reason` and issues no
token. *Corrected while executing:* `throttle:v1-auth` on the route (10 a minute per address), then the controller
hands the value to `App\Services\Identity\TelegramSignIn` (result `TelegramSession`): verify → the exchange counter
by fingerprint (`max_exchanges`, TTL = the window) → resolve the user → the per-user limit (5 a minute, keyed
`user:<internal id>`, never a Telegram id; applied here because only now is the user known) → the gate →
`TokenIssuer` → the profile of `GET /me` (`MeProfile`). Both in-body limits answer `429 rate_limited` with
`Retry-After` and no `reason`. Every attempt that reaches the sign-in writes one log line: on success the fingerprint
and the internal user id; on a refusal the reason, the fingerprint once the value is verified, and the user id once
the user is resolved.

### Stub mode for the end-to-end suite

The Playwright suite runs on stubs (`25` §9) and must keep doing so while stage C replaces stub controllers with
real code. `config('sources.native_stubs')` (`SOURCES_NATIVE_STUBS`, default false; a boot check in
`SourceServiceProvider` refuses it outside `local` and `testing`) switches on the middleware
`App\Http\Middleware\AnswerNativeStubs` on the `v1` group. It looks the route name up in
`App\Services\Sources\Stub\NativeStubs` — a map of route name to a callable that builds the stub answer with
`StubResponder` (fixtures, scenario header, `meta.source = stub`) — and answers without reaching the real
controller. The middleware is always attached, after `auth:sanctum` on bearer routes, and reads the switch on every
request, so a test turns it on with `config(['sources.native_stubs' => true])`. The stub contract tests of WP-11 …
WP-13 (`*ContractTest.php`) do that in a `beforeEach` from the package that replaces their controller, and keep
asserting `meta.source = stub`; the new tests of the real code run with the switch off. Rule for this and every
later package of stage C: when a stub controller body is replaced, the old body moves into this map; it is not
deleted. This package moves sign-in (with `StubUser`), `me` and settings. On staging
and production the switch cannot be on, so no stub code can answer there. If the end-to-end workflow already boots
the API, set `SOURCES_NATIVE_STUBS=true` in its environment in this PR.

*Corrected while executing:*
- **Order.** The framework sorts only the middleware of its priority list (`SortedMiddleware`), so "after
  `auth:sanctum`" is not enough: the stub would run before the request locale and the route's checks.
  `bootstrap/app.php` anchors a chain after the framework's last entry, `Authorize`, each class after the one before:
  `SetRequestLocale` → `EnsureAccessGranted` → `CheckForAnyAbility` → `CheckAbilities` → `EnsureRadarsEnabled` →
  `EnsureOwnerCabinetEnabled` → `CountListingOpens` → `AnswerNativeStubs`. So on every `api.v1.*` route the stub
  answers last, after authentication (on bearer routes), the limiter, the locale, the gate and the route's checks;
  `ApiRoutesTest` walks every route through `gatherRouteMiddleware()` and pins this order.
- **The real gate runs in stub mode too**, so the end-to-end API needs `ACCESS_MODE=open` beside
  `SOURCES_NATIVE_STUBS=true`: both API env blocks of `.github/workflows/frontend-e2e.yml` and both env lists of
  `scripts/dev/e2e-local.sh` set them, and both also pin `APP_ENV=local`, which the boot check needs
  (*corrected while executing*: the workflow's two API steps too).
- `NativeStubs` holds the scenario lists of the moved methods (`NativeStubs::ME_SCENARIOS`, `SETTINGS_SCENARIOS`);
  `MeController::SCENARIOS`, `SettingsController::SCENARIOS` and `TelegramAuthController::ABILITIES` are deleted
  (the abilities are `TokenIssuer::ABILITIES`). `OwnerRequestsContractTest` also runs in stub mode, because it reads
  the `/me` scenarios `owner_waitlisted` and `owner_pending`.

### Settings

Table `user_settings`: `user_id` (primary key, foreign key, cascade), `locale` (string 2), `locale_chosen_at`,
`currency` (string 3), `theme` (string 8), `city` (string 64, nullable), `city_chosen_at`, `quiet_start`,
`quiet_end` (`time`, both null = off), `digest_hours` (`json`, sorted unique integers), `card_style` (string 8, not
null, default `classic`; `classic` or `rich`, since the intake of legacy release `index-BnFvC-Ft.js`), timestamps.

- Defaults on creation (`config/settings.php`, `defaults`): locale `uz` when `language_code` starts with `uz`, `en` when it
  starts with `en`, else `ru` — one resolver for the Mini App and the bot (BR-APP-050 names only the `uz` and `ru`
  branches for the client; the bot of `04` also answers English users in English), not marked chosen; currency `USD`; theme `auto`; city `null`; quiet hours 23–8; digest hours
  `[9]`; card style `classic`. The last three are a specification choice: the legacy default is unknown (for the card
  style Q-API-067).
- `App\Services\Identity\SettingsService`: `get(User): UserSettingsData`; `patch(User, array $changes):
  UserSettingsData` updates only the sent keys in one `UPDATE` per key set, sets `locale_chosen_at` or
  `city_chosen_at` when `locale` or `city` is stored, and dispatches `App\Events\Identity\SettingsChanged` (user id,
  changed keys) after commit. The bot (language of its menu and texts) and the delivery planner (WP-46) listen later.
  *Corrected while executing:* the event carries the keys that were sent, in the contract's order, and is never
  dispatched after a rollback; `{}` writes nothing and dispatches nothing; a sent `locale` or `city` sets its chosen
  time even when the value is unchanged; `get()` creates the default row for a user who has none (factory users, the
  stub user). One locale rule for the app and the bot is `App\Services\Identity\LocaleResolver` (a case-insensitive
  "starts with").
- Value objects `QuietWindow` (`fromHours(?int, ?int)`, `contains()`, `endAfter()`, crossing midnight) and
  `DigestSchedule` (`fromHours(array)`, `nextSlotAtOrAfter()`), both in Asia/Tashkent wall-clock through the zone
  name, never a fixed offset.
- `SourceContext::fromRequest()` now takes the currency from the user's settings. *Corrected while executing:* the
  request context carries the stored currency (`USD` for a guest, a collector or a user without a row); no listing
  source reads it yet (the stub listing source prices in `$`), so the test shows the context changing from `USD` to
  `UZS`, not a price.
- The object of `GET /me` is built by `App\Services\Identity\MeProfile`, for `GET /me` and the sign-in alike (*added
  while executing*): `analytics.distinct_id` = `users.analytics_distinct_id`; `autocapture`, `replay` and `replay_rate`
  from a new `config/analytics.php` → `client` (`true`, `false`, `0`; no env keys yet; WP-47 extends the file), read
  leniently (a whole number, an env string such as `"0.5"` or `"1"`; anything unreadable is the default, never a
  `500`); `team` = `users.is_team`; `owner` = `{pending: 0, has_listings: false, waitlisted: false}`. An
  authenticated actor that is not a `User` (a collector's token) gets `403 forbidden` on `GET /me` and both settings
  methods (`ApiController::appUser()`).
- `PATCH /settings` stores `card_style`; `POST /settings/card-sample` (intake of `index-BnFvC-Ft.js`) is not moved
  here: it stays on its stub until the bot can send the card (WP-53 builds it, WP-57 sends it and replaces the body).

### Access gate

`config/access.php`: `mode` (`ACCESS_MODE`: `private`, `invite`, `open`; default `private`, so a missing key fails
closed), `max_seats` (`ACCESS_MAX_SEATS`, null = unlimited), `owner_telegram_ids` (list, from the comma-separated
`ACCESS_OWNER_TELEGRAM_IDS`, for `private`),
`require_chat` (default false: in open mode a user who has not started the bot is still let in; radar writes have
their own `no_chat` check), `paused` (`ACCESS_PAUSED`, boolean, default `false`). *Corrected while executing:* a
value that cannot be read is the safe default: an unknown mode is `private`; `ACCESS_MAX_SEATS` blank (or the env
word `null`) means no limit, `0` admits nobody new, and a set value that is not a whole number ≥ 0 (a word, a
fraction, a negative number) also means `0`, so a typo fails closed like the mode; `require_chat` has no env key,
as the env list of this package has none.

**Pause (DEC-60).** When `paused` is on, sign-in and every bearer route answer `403 access_denied` with
`reason: "paused"` (`AccessReason::Paused`, in the contract since the intake of `index-CIa0Ldj2.js`; `AccessState`
gains `Paused`); it is checked before the other reasons. The public methods (`GET /reference`, `GET /cities`, the
landing methods) keep answering, because the no-access screen needs the bot names. The switch is a server setting
of the production track and is off unless a pause is needed. Open point of this package: whether team accounts
(`is_team`) pass a pause. *Corrected while executing:* answered by DEC-106 — a team account passes the pause, a
blocked one does not, and `is_team` gives no other privilege. The pause is read on every call, outside the 2 s cache
of the decision, so switching it takes effect at once.

Table `access_grants`: `user_id` (primary key, foreign key, cascade), `state` (`admitted`, `blocked`),
`admitted_via` (`open`, `invite`, `owner`, `operator`), `flagged_at`, `flag_reason`, timestamps.

`App\Services\Access\AccessGate::decide(User): AccessDecision` (`App\Enums\AccessState`: `Granted`, `Private`,
`Invite`, `Full`, `Blocked`, `Join`), in this order: grant `blocked` → `Blocked`; `require_chat` and chat not active
→ `Join`; grant `admitted` or owner → `Granted`; mode `private` → `Private`; mode `invite` → `Invite`; mode `open`
with `max_seats` and no seat left → `Full`; mode `open` → `Granted` (with `max_seats` set, the admission inserts the
grant under a lock that counts seats; without it no row is written). The decision is cached per user for 2 s and
flushed when the grant or `bot_chat_state` changes: `AccessGate::forget(User $user): void` drops the cached
decision; the grant writers of this package call it, and WP-52 calls it when it changes `bot_chat_state`.
*Corrected while executing:* the order starts with the pause (unless `is_team`, DEC-106), then `blocked`;
`AccessState` gains `Paused`; the grant states and admission ways are the enums `App\Enums\Access\AccessGrantState`
and `AdmittedVia`. The seat count runs under `pg_advisory_xact_lock` inside a transaction on PostgreSQL (a plain
transaction elsewhere), re-reads the user's grant first, and inserts with `createOrFirst()`, so a block committed
meanwhile by `access:block` decides instead of a primary-key error. The decision is cached as a scalar under
`access:decision:<internal id>`.

Middleware `App\Http\Middleware\EnsureAccessGranted`, alias `access`, on every bearer route; `access:lenient` (only
`blocked` is refused) on `POST /events`. `auth:sanctum` can also authenticate an `App\Models\Source` (a collector
token; that model uses `HasApiTokens`, and the media routes accept it): the middleware lets every actor that is not
a `User` pass, and the limiter key for such an actor keeps the form of today's `actorKey()` (class and id). Commands
`access:block {user}` and `access:unblock {user}` (internal user id; `--by` and `--reason` required; one log line
without any Telegram id). *Corrected while executing:* `access:lenient` refuses `blocked` and `paused` (the pause
covers every bearer route, see above); the bearer routes sit in one inner `access` group, `POST /events` outside it
with `access:lenient`, the media routes inside it (59 of the 64 v1 routes are gated). `access:unblock` deletes a grant
that was never admitted (`admitted_via` null, a user blocked before any admission; the column is nullable for that)
and otherwise sets it back to `admitted`; both commands call `AccessGate::forget()` and log `user_id`, `by` and
`reason`. The task `KV-BE-009` differs in four places, and this specification is followed: `Join` only behind
`require_chat`; no grant row in open mode without seats; events through `access:lenient` (the task dropped a gated
user's events with `204`); an explicit `AccessGate::forget()` instead of model events.

### Rate limits

Named limiters in `AppServiceProvider::configureRateLimiting()`, values from a new `config/rate_limits.php` (starting
values of SEC-REQ-027, to be tuned on staging). The key is `user:<internal id>`, or the client address for public
routes; it never contains a Telegram id.

| Limiter | Limit | Routes |
| ------- | ----- | ------ |
| `v1-auth` | 10 per minute per address, 5 per minute per verified Telegram user | `POST /auth/telegram` |
| `v1-public` | 60 per minute per address | `GET /reference`, `GET /cities`, `GET /landing/*` |
| `v1-me` | 30 per minute | `GET /me` |
| `v1-reads` | 300 per minute | feed, count, `GET /listings/new`, flow, map, `GET /settings`, `GET /radars`, `GET /favorites`, `GET /history`, `GET /hidden`; the owner's reads `GET /owner/listings`, `GET /owner/listings/{id}`, `GET /owner/listings/{id}/requests` (*added while executing*) |
| `v1-listing` | 120 per minute | `GET /listings/{number}` |
| `v1-listing-opens` | a number per user per day, from configuration; the threshold is open (Q-API-085) | `GET /listings/{number}`; over it → `429 rate_limited` with `reason: "daily"` and `Retry-After` (`DailyLimitReached` of the contract). Counted per user, never per address. Whether the `preview=1` form counts is part of Q-API-085 (DEC-59). *Corrected while executing:* not a named limiter but the middleware `App\Http\Middleware\CountListingOpens` (alias `listing-opens`) beside `throttle:v1-listing`, with `rate_limits.listing_opens_per_day` from `RATE_LIMIT_LISTING_OPENS_PER_DAY` (default 100, DEC-104): the preview passes uncounted (DEC-105); an actor that is not a `User` passes; a card this user already opened in the window passes (a cache marker `listing-opens:user:<id>:<number>` for 24 h, DEC-107); else, when the counter `listing-opens:user:<id>` (decay 86 400 s) is at the cap, `DailyLimitReached` with `Retry-After` = the seconds until the counter starts again; else the request goes on, and only a `200` adds the marker and moves the counter |
| `v1-contact` | 30 per hour | `POST …/contact` |
| `v1-translation` | 30 per hour, counted on cache misses inside the service (WP-43) | `POST …/translation` (*corrected while executing:* on the route, per request, until WP-43 moves the count to the cache misses) |
| `v1-share` | 20 per hour | `POST …/share` |
| `v1-lists` | 60 per minute | favourites, hidden, blocked authors, `DELETE /history`, surveys (the writes; their `GET` lists are `v1-reads`); `DELETE …/reports` and `POST /listings/{number}/contact-request` until WP-85 brings the request limits of its own (*added while executing*) |
| `v1-reports` | 30 per day | `POST …/reports` |
| `v1-radars` | 30 per minute | radar writes (`DELETE /radars/{id}` included), `PATCH /settings` and `POST /settings/card-sample` (a tighter per-user limit of the sample waits for Q-API-067) |
| `v1-events` | 60 per minute; the excess is answered `204` and dropped | `POST /events` (*corrected while executing:* a normal named limiter whose `Limit::response()` answers the bare `204`, so the route keeps a real `throttle:` middleware) |
| `v1-media` | 120 per minute (*added while executing:* the value `api` gave it) | `GET /media/{media}` |
| `uploads`, `owner-writes`, `owner-publish`, `owner-place`, `owner-demand` | unchanged (WP-00, WP-80) | the media writes keep only `uploads`; the owner writes, `GET /owner/place` and `GET /owner/demand` keep only their owner limiters (*added while executing*) |

Notes: `RateLimiter::for('api')` exists today, but `bootstrap/app.php` never calls `throttleApi()`, so check with
`php artisan route:list -v` which routes carry which limiter before and after. The `throttle:api` that WP-11 put on
the `v1` group is replaced by the named limiters. The limiter runs after authentication. Trusted proxies: a new
`backend/config/trustedproxy.php` with `'proxies' => env('TRUSTED_PROXIES')` (a comma-separated string, or null).
`Illuminate\Http\Middleware\TrustProxies` is already in the global stack and falls back to
`config('trustedproxy.proxies')` when `trustProxies(at: …)` was never called (read in the installed framework), so
nothing is added to `bootstrap/app.php` and the value survives `config:cache`.

*Corrected while executing:*
- **Every `/api/v1` route carries a named limiter** and the `api` limiter's definition is removed; `ApiRoutesTest`
  pins the exact limiters of each route, so a new route without one fails. The key is `user:<internal id>` for a
  `User`, the class-and-id form of `actorKey()` for another actor, the client address for a guest. The per-user part
  of `v1-auth` is applied inside the sign-in (see "Sign-in"). Every count of `config/rate_limits.php` is read
  through `App\Services\Access\RateLimits`: a positive whole number or a string of digits is used, anything else
  (blank, zero, a negative number, a fraction, a word, `true`) is the default of `RateLimits::DEFAULTS`, never an
  error or a tiny cap. Only the daily cap has an env key; another limit changes with a release.
- **The proxy hop.** On the servers PHP never sees a proxy in nginx: the API's vhost hands PHP the connecting address
  through FastCGI. Traffic of the Mini App reaches the API from the Next servers (the BFF and server components),
  so without the client address every user would share one bucket of `v1-auth`. The nginx in front of Next sets
  `X-Forwarded-For`, the Mini App forwards it on every server-side API call (below), and `TRUSTED_PROXIES` lists the
  addresses the Next servers reach the API from. `config/trustedproxy.php` trims the value; blank, `*` and `**`
  trust nobody (the framework reads both wildcards as every caller).
  Laravel takes the rightmost address that is not a trusted proxy, so a forged prefix is ignored.

### The Mini App's side (*added while executing*)

- Every server-side API call of `frontend/app` — `serverApi()` (`lib/api/server.ts`), `runAction` (Server Actions)
  and the `/bff` route handlers (`session`, `[...path]`, `boot-error`, the owner photos route) — forwards the
  incoming `X-Forwarded-For` as it came, through `lib/api/forwarded.ts` (server-only); the browser client never sends
  it. `publicApi()` forwards none: it runs inside `"use cache"` and its answer serves every user.
- `/bff/session` passes an API `429` through as `429 {code: "rate_limited"}` with the API's `Retry-After` (KI-37),
  for the sign-in and for its `GET /me` read. The boot retry (`features/gates/useBootRetry.ts`, BR-APP-054) waits for
  the first `429` by its `Retry-After` (at most 60 s, 10 s without one) without counting it among the six failures;
  a later `429` counts on the ladder and waits at least its `Retry-After`, at most 60 s.

### Redaction

`init_data` and `Authorization` never reach a log, Telescope, Pulse or an exception context (SEC-REQ-047): add
`init_data` to the hidden request parameters in `TelescopeServiceProvider::hideSensitiveRequestDetails()`. The
headers need no change: Telescope hides `authorization` by default (`Telescope::$hiddenRequestHeaders`) and the
provider already hides `cookie`. That method returns early in `local`, so nothing is hidden there. Add `init_data`
to the `dontFlash` list in `bootstrap/app.php`; a test greps the log channel after a failed and a successful sign-in
and asserts that the three names are in Telescope's hidden lists.

*Corrected while executing:* Telescope already hid `init_data` since WP-80; this package adds `initData` (the
client's spelling), hides the sign-in's `data.token` in recorded responses, and masks those parameters in the query
string of a recorded URI outside `local` (Telescope stores the full URI). `bootstrap/app.php` had no `dontFlash`
list: `withExceptions()` gains `$exceptions->dontFlash(['init_data'])`. The refusals are not reported
(`ShouldntReport`) and the value's parameters are sensitive (see "Verifier"). `SignInRedactionTest` captures the log
after every sign-in path — `200`, the `401`s, `422`, `403`, `500` and the three `429`s — and finds neither the value,
the token nor its hash. Not covered: with `TELESCOPE_RECORD_ALL` on, Telescope's query entries could show a token's
hash in their bindings, so it stays off on the servers.

## Files

- `backend/app/Services/Identity/{TelegramInitData,TelegramInitDataVerifier,UserResolver,TokenIssuer,SettingsService,UserSettingsData,QuietWindow,DigestSchedule}.php`
- `backend/app/Exceptions/Identity/{InvalidInitData,InitDataExpired}.php` (they exist since WP-11 and render as `401 invalid_init_data` and `401 auth_expired`; this package adds the internal reason); `backend/app/Events/Identity/SettingsChanged.php`
- `backend/app/Services/Access/{AccessGate,AccessDecision}.php`, `backend/app/Enums/AccessState.php`,
  `backend/app/Http/Middleware/EnsureAccessGranted.php`, `backend/app/Console/Commands/Access/{BlockUser,UnblockUser}.php`
- `backend/app/Models/{User,UserSetting,AccessGrant}.php` with factories (`UserFactory` gains a `telegram()` state)
- `backend/database/migrations/<date>_add_telegram_identity_to_users_table.php`, `…_create_user_settings_table.php`,
  `…_create_access_grants_table.php`
- `backend/app/Http/Controllers/Api/V1/{Auth/TelegramAuthController,MeController,SettingsController}.php` (bodies
  replaced); `backend/app/Services/Sources/SourceContext.php`; `backend/app/Services/Sources/Stub/NativeStubs.php`,
  `backend/app/Http/Middleware/AnswerNativeStubs.php` (new); `backend/config/sources.php` (`native_stubs`)
- `backend/config/{telegram,access,rate_limits,settings,trustedproxy}.php`, `backend/app/Providers/{AppServiceProvider,TelescopeServiceProvider}.php`,
  `backend/bootstrap/app.php`, `backend/routes/{api,console}.php`
- `backend/tests/Unit/Identity/{TelegramInitDataVerifierTest,QuietWindowTest,DigestScheduleTest}.php`,
  `backend/tests/Feature/Api/V1/Auth/*`, `backend/tests/Feature/Access/*`, `backend/tests/Feature/Api/V1/{MeTest,SettingsTest,RateLimitTest}.php`,
  `backend/tests/Support/InitDataSigner.php` (signs synthetic values with the test token of `phpunit.xml`)
- `backend/.env.example` (`ACCESS_MODE`, `ACCESS_MAX_SEATS`, `ACCESS_OWNER_TELEGRAM_IDS`, `ACCESS_PAUSED`,
  `SANCTUM_TOKEN_PREFIX`, `TRUSTED_PROXIES`, `TELEGRAM_INITDATA_MAX_AGE`, `SOURCES_NATIVE_STUBS`, and
  `RATE_LIMIT_LISTING_OPENS_PER_DAY` *added while executing*) and `docs/infrastructure/environments.md`
  (their names) — separate shared-file PR; `docs/api/openapi.json` and generated types (regenerated; expected diff: none in shapes)
  (*corrected while executing:* the shapes are unchanged; `GET /me`, `GET /settings` and `PATCH /settings` gain a
  documented `403` — the gate, and a collector's token —, and the summary of `PATCH /settings` and the description of
  `init_data` change)
- *Added while executing:* `backend/config/analytics.php` (the `client` block of `GET /me`; WP-47 extends it);
  `backend/phpunit.xml` (`TELEGRAM_BOT_TOKEN`, `SOURCES_NATIVE_STUBS=false`, `ACCESS_MODE=open`);
  `.github/workflows/frontend-e2e.yml` and `scripts/dev/e2e-local.sh` (the e2e API's env); `frontend/app`:
  `lib/api/forwarded.ts` (new), `lib/api/server.ts`, `lib/actions/run.ts`, the four `/bff` route handlers,
  `lib/session/{bootstrap.ts,SessionProvider.tsx}`, `features/gates/useBootRetry.ts`, with their tests. The other new
  files are listed in "As built"

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
  non-blocked gated user through; `GET /reference` stays `200`. Pause on: sign-in and every bearer route answer
  `403 access_denied` with `reason: "paused"`, also for a blocked user, and `GET /reference` and `GET /cities` stay
  `200`; pause off (the default): nothing answers `paused`.
- Settings: each key; meta round-trip; `uz` stored and returned as `uz`; invalid values → `422`; `{}` → `200`;
  `SettingsChanged` carries only the changed keys; user B never sees or changes user A's settings (`15` §3.1 row 7).
- Limits: one case per limiter with small test values; `Retry-After` present; two users have two buckets; one user on
  two addresses shares one; the burst fixtures pass; behind a configured proxy two client addresses get two buckets
  and a forged `X-Forwarded-For` from elsewhere is ignored. The daily cap on opening listings, with a small test
  value: the next full card → `429 rate_limited` with `reason: "daily"` and `Retry-After`; another user is not
  affected; a `429` of `v1-listing` has no `reason`.
- Redaction: no log line contains the signed value or a token after any of the cases above.

## Acceptance checklist

- [ ] Sign-in with a value signed by the environment's bot token works; any other value is refused with the right code.
- [ ] `GET /me`, `GET /settings`, `PATCH /settings` and sign-in answer with `meta.source = native`; shapes equal WP-11.
      The `owner` object of `GET /me` answers `{pending: 0, has_listings: false, waitlisted: false}` here; its values
      come from WP-84 and WP-85 (*added by the owner-cabinet plan*).
- [ ] Tokens carry only `app:read` and `app:write`, expire, are capped at 5 per user and are pruned.
- [ ] The gate runs on every bearer route; `access:block` takes effect within 2 seconds; mode `open` lets everyone in.
- [ ] With `ACCESS_PAUSED` on every bearer route and sign-in answer `reason: "paused"` and the public methods still
      answer; the switch is off by default (DEC-60).
- [ ] Opening listings is capped per user per day with `reason: "daily"`; the threshold comes from configuration
      and Q-API-085 records how it was chosen (DEC-59).
- [ ] Every v1 route has a named limiter (`route:list -v` attached to the PR); no route uses `throttle:api`.
- [ ] `initData` and tokens never appear in logs, Telescope or Pulse.
- [ ] The stub user and its tokens are removed from the databases of staging and production; stub answers of these
      methods exist only behind `SOURCES_NATIVE_STUBS` in `local` and `testing`, and the Playwright suite passes there.
- [ ] `make ci-backend` and the `pgsql` group are green; the security review has no open finding.
- [ ] The production track set the env keys and approved the migrations.
- [ ] Inside Telegram on staging, then production (iOS, Android, Desktop, Web): the app opens and signs in; language
      and city picks survive a relaunch; cookie mode and header mode both reach the feed.

## As built

The package is built as designed, with these points decided in the code (rule 6). The corrections of the design are
marked *corrected while executing* or *added while executing* in the sections above; this list adds what the code
decided beyond them.

- **Stages.** Built on `feat/wp-40-identity` from `main` (`cabee17`) in five stages — verifier, users, tokens and
  stub mode; settings and `me`; the gate and the sign-in; limits, proxies and redaction; the Mini App, which ran
  beside the backend stages — each implemented, read by an independent reviewer and fixed. Most classes are written by hand;
  `make:*` made the migrations and the test files.
- **Files outside the specification's list** (under `backend/`).
  `app/Services/Identity/{TelegramSignIn,TelegramSession,MeProfile,LocaleResolver}.php`,
  `app/Exceptions/Identity/InvalidInitDataReason.php`, `app/Enums/Identity/BotChatState.php`,
  `app/Enums/Access/{AccessGrantState,AdmittedVia}.php`, `app/Console/Commands/Access/AccessCommand.php` (the base of
  both commands), `app/Services/Access/RateLimits.php`, `app/Http/Middleware/CountListingOpens.php`,
  `config/analytics.php`, `ApiController::appUser()`, `database/seeders/UserSettingSeeder.php`; the tests
  `tests/Feature/Identity/*`, `tests/Feature/Http/PulseCacheKeysTest.php`,
  `tests/Feature/Sources/NativeStubsTest.php`, `tests/Feature/Http/TrustedProxyTest.php`,
  `tests/Feature/Api/V1/Auth/SignInRedactionTest.php`, `tests/Feature/DatabaseSeederTest.php`,
  `tests/Unit/Identity/LocaleResolverTest.php`, six `tests/Pgsql` races and migrations,
  `tests/Support/{EnvOverride,LegacyUserRows}.php` and the Python fixture
  `tests/Fixtures/Telegram/initdata/{make.py,valid.txt}` (`python3 -I make.py` writes `valid.txt` again byte for
  byte).
- **The middleware chain** is the one of "Stub mode" above. Anchoring the new middleware after `ThrottleRequests`
  instead would have sorted `SetRequestLocale` behind the stub on all 64 routes (the stub answering without a locale
  and without `Content-Language`). A check that removed the new priority entries found no existing
  middleware moved.
- **Refusals are not reported.** `InvalidInitData`, `InitDataExpired` and `AccessDenied` implement `ShouldntReport`:
  a refused client retries every few seconds, and each refusal would otherwise be an error entry with a trace. The
  log test fails if one is reported.
- **Sensitive parameters.** Without them a probe showed the `auth_date` of an expired value, the start of a bad
  `user` JSON and the first 15 bytes of the value in the traces of the refusals. A unit test forces `zend.exception_ignore_args=0` and
  requires every argument of the verifier's frames to be `null`, an integer or a `SensitiveParameterValue`.
- **Lenient configuration reads.** A value that cannot be read is its default, never an exception or a `500`:
  `TELEGRAM_INITDATA_MAX_AGE` blank, zero, negative or a word → 3 600 (a blank value, which the production track is
  told to leave, would otherwise expire every sign-in); the counts of `rate_limits.*` through `RateLimits`; the
  `client` block of `config/analytics.php` through `MeProfile` (the strict `Config::float()` / `Config::boolean()`
  turned `replay_rate => 1` into a `500` of every `GET /me`). `TelegramSignIn` still reads `telegram.initdata.*`
  with `Config::integer()`; the config file casts both values, so only a string set at run time would throw.
- **`ACCESS_MAX_SEATS` fails closed.** A set value that is not a whole number means `0` (admit nobody new), in the
  config and in `AccessGate`; blank and the env word `null` mean no limit, and a test pins both.
- **The token cap** counts and revokes only unexpired `miniapp` tokens, under a lock of the user's row;
  `TokenIssuerRaceTest` (pgsql) issues concurrently and keeps exactly the cap. The race tests start their child
  processes behind a 2 s barrier: without it they passed with the locks removed; with it, by the implementer's
  report (the reviewer did not reproduce it), removing the advisory lock admits 20 of 20 and removing the row lock
  keeps 6 tokens. The seat race calls `decide()` in 20 processes, not 20
  HTTP requests.
- **The users migration's `down()`** drops the new columns, cannot bring back the stub user or its tokens, and makes
  `name`, `email` and `password` required again only when no row lacks them (a Telegram user has none). Its pgsql
  test runs `up()` inside a transaction with legacy rows present, as the Migrator does.
- **The factory UUID and the seeder.** `UserFactory` gives `analytics_distinct_id` a `(string) Str::uuid()`:
  `DatabaseSeeder` runs `WithoutModelEvents`, so the model's hook does not fill it there and `db:seed` failed on the
  `NOT NULL`; Faker's `uuid()` is a version 3 UUID and broke the version 4 check of `UserResolverTest`.
  `DatabaseSeederTest` pins it. `UserSettingSeeder`, called by `DatabaseSeeder` after the users, gives every user
  without a settings row the defaults of `SettingsService::createDefaults` for his last known language and leaves an
  existing row alone. `AccessGrant` has a factory and no seeder: a grant is written only by the gate and the operator
  commands (`access:block`, `access:unblock`), so a seeded grant would be an admission no gate made.
- **Settings semantics chosen here.** `QuietWindow` refuses two equal ends and one end without the other; `endAfter()`
  is the first end strictly after the moment; an empty `DigestSchedule` is allowed and has no next slot. Every
  authenticated request that builds a request context reads the settings row once (cached on the user object for the
  request).
- **The daily cap.** The window is fixed: it starts at the first counted card and lasts 24 hours (Laravel's
  `RateLimiter` decay), it does not slide, so around its reset a user can open about twice the cap within minutes;
  accepted (legacy's text says "in the past 24 hours"). The check runs before the card and the count after its `200`,
  so parallel requests of a user one below the cap overshoot it by their number, bounded by `v1-listing` (120 a
  minute); accepted. The marker uses the requested number, so a merged duplicate opened under its old number
  (`100016`) and then under its survivor (`100001`) counts twice; accepted. The env value reaches `RateLimits` as
  the environment gives it, so `true`, `1e3` or a word mean 100, not a cap of 1.
- **`v1-events`** answers its `204` through `Limit::response()`, which throws an `HttpResponseException` from the
  middleware; `ApiExceptionRenderer` now lets that exception through to the framework (`Route::run()` catches one only
  from the route's action), else the `204` became a `500`.
- **`access:unblock` and seats.** Unblocking restores `admitted` without counting seats, so in `open` mode with
  `ACCESS_MAX_SEATS` an operator's unblock may pass `max_seats` once a newcomer took the freed seat; accepted as an
  operator's act.
- **The sign-in budget.** A refused user has no token, so each re-check of the no-access screen is a new sign-in:
  a launch and its three re-checks use 4 of the 5 sign-ins a minute of one user.
- **`publicApi()` forwards no `X-Forwarded-For`.** It runs inside `"use cache"`, so the cache misses of
  `GET /reference` and `GET /cities` count against the app server's own address in `v1-public` (60 a minute); the
  entries revalidate after 600 s and there are few locales; accepted. The production track should know that this
  bucket exists. Next fills `x-forwarded-for` from the socket when a request has none, so the API always receives
  one; that matters for the staging check of `TRUSTED_PROXIES`.
- **The boot retry and BR-APP-054.** BR-APP-054 allows six attempts in all, about 56 s of waits. A boot whose first
  answer is a `429` now makes seven attempts: about 116 s of waits when only that first answer is a `429`, and up to
  about 6 minutes (60 s, then 5 × 60 s) when every attempt answers `429` with a `Retry-After` of a minute, each
  attempt also spending up to its 15 s timeout. Recorded as a deviation from BR-APP-054. `Retry-After` is read as
  seconds or as an HTTP date (the API sends seconds). The read pass-through `/bff/[...path]` and the owner photos
  route pass an API `429` on but drop its `Retry-After`; no client code reads it there.
- **The end-to-end environment.** The CI workflow and `scripts/dev/e2e-local.sh` run the API with
  `SOURCES_NATIVE_STUBS=true`, `ACCESS_MODE=open` and `APP_ENV=local`. The API refuses to boot with the stubs
  outside `local` and `testing`, and the workflow's `composer install` runs `package:discover` before `.env` exists,
  when `APP_ENV` defaults to `production`: without the pinned value that first step failed in `package:discover`
  (found by the final review); the second API step is pinned to match. A blank
  `TELEGRAM_BOT_TOKEN` there is harmless: the stub answers before the controller. `make e2e` against the Redis-backed
  local API signs every launch in from the Next server's one address and meets `v1-auth` (10 a minute) within the
  first minute: KI-71; use `scripts/dev/e2e-local.sh`. A developer's local env file needs `ACCESS_MODE=open`, and
  `SOURCES_NATIVE_STUBS=true` for `next dev` with the fake Telegram user.
- **The `signature` rule against a real value** is still open: the Python fixture builds its string the same way, so
  it checks the HMAC and the encoding, not the rule. The developer verifies one real launch value of the dev bot with
  that bot's token, outside the repository, and the result is written here.
- **Contract.** The four methods keep their shapes; `docs/api/openapi.json` gains the `403` responses of "Files".
  `POST /events` is now registered first in the bearer group (the export kept its place). `docs/api/README.md`
  describes the native methods, the limiters and the real `reason: "daily"`.
- **Existing tests changed.** The contract tests of sign-in, `me` and settings (and `OwnerRequestsContractTest`)
  run in stub mode; the rows of `NativeStubsTest` compare the stub's answer with the one built from the committed
  fixture, not with a controller; `MediaOwnershipTest` warms the gate and freezes the clock before its query-count
  probes (the gate's cache made the first request one query longer) and keeps its 120-reads case on `v1-media`;
  `ApiRoutesTest` gains the middleware order, the gate on every bearer route and the exact limiters per route; the
  unit test "a server error or 429 ends in the server kind" of the boot retry is rewritten for the new counting; the
  `next/headers` mocks of `tests/actions/*` gained a `headers` export, while the two of `tests/reference` have none on
  purpose, so they fail if the cached reads ever read request headers. Every `401` refusal test asserts that the body
  has no `reason`.
- **Edits beyond the files.** Two sentences of `frontend/app/README.md` (the forwarded address, the `429` of
  `/bff/session`) and the header comment of `scripts/dev/e2e-local.sh` ("the API's rate limiters" instead of "the
  `api` rate limiter").
- **A returning user is looked up first.** `UserResolver` reads the user by `telegram_user_id` and calls
  `createOrFirst` only when there is none: an INSERT that fails on the unique column made PostgreSQL write the
  Telegram id (`DETAIL: Key (telegram_user_id)=…`) to the database server's log on every returning sign-in
  (SEC-REQ-047). Only the loser of a race between two first contacts still runs that INSERT. `UserResolverTest`
  counts the INSERTs through `beforeExecuting`, which also sees a failing statement; a pgsql test checks that the id
  sequence does not move.
- **Wildcard proxies trust nobody.** `TRUSTED_PROXIES=*` or `**` is read as unset: the framework would believe every
  caller's `X-Forwarded-For`, so any direct caller of `api.*` could name its own address and get fresh per-address
  buckets. The list entries `REMOTE_ADDR`, `0.0.0.0/0` and `::/0` have the same effect; the config's comment names
  them, the code does not refuse them.
- **Pulse ignores the keys that name a user.** Its cache recorder stores every key it sees: `config/pulse.php`
  ignores `listing-opens:*` (which cards a user opened), `access:decision:*` and `auth:*` (the sign-in counters and
  the exchange counter of a value), with their `:timer` twins, and groups the framework's hashed `throttle` keys
  (`md5($limiterName.$limit->key)`, one per user or address, and their `:timer` twins) into one `throttle:*` record.
  `PulseCacheKeysTest` captures the keys of a real sign-in and card open and judges them with the recorder's own
  rules.
- **One sign-in bucket per address.** `v1-auth` (10 a minute) counts every sign-in, successful ones too, by client
  address. The Mini App signs in from its server, so unless `TRUSTED_PROXIES` names the addresses the Next servers
  reach the API from, every user shares one bucket; users behind one carrier NAT share one too. The production
  track sets it ("Needs from the production track", item 2).
- **Exception messages carry bindings.** A `QueryException` message holds its SQL with the values (a Telegram id, a
  token hash) and reaches the log and Telescope; framework behaviour, not changed here.
- **The user row is written before the decision.** As the design orders it, the sign-in creates or updates the user
  before the gate decides, so a person the gate refuses (`private` or `invite` mode, a pause) keeps a row and each
  retry updates `last_seen_at`; retention and erasure are WP-47's.
- **A block leaves one log line.** `access:block` and `access:unblock` record who and why in one notice log line
  only; `flagged_at` and `flag_reason` of `access_grants` stay unused until a flagging package.
- **The sign-in's own counters check before they count.** The 20 exchanges of a value and the 5 sign-ins a minute of
  a user are checked, then counted, so parallel requests pass by their number; bounded like the daily cap, and the
  token cap (5 unexpired) bounds what is kept.
- **A spent value ends in the error state.** A value whose 20 exchanges are spent answers `429` with a `Retry-After`
  of up to the window (3 600 s), like the per-minute `429`s and without a `reason`; the boot retry waits at most
  60 s an attempt and ends in its `ErrorState`. «Reopen the app» comes from `auth_expired` only. A refused user's
  re-checks of the no-access screen spend exchanges of the same value too.
- **Go-live conditions and checks after the deploy.** The security review's conditions of ЗРУ-547 (the hosts'
  location, the database's registration, `DB_SSLMODE`) and its staging checks of the client address are items 4 and
  5 of "Needs from the production track"; neither blocks the merge.
- **PHP 8.6.0.** The developer machine runs PHP 8.6.0 (KI-70); every local run above used it, while `main` and CI pin
  8.5.
- **The backend CI runs the Feature suite on PostgreSQL.** The `ci:check` step of `.github/workflows/backend.yml`
  sets `DB_CONNECTION=pgsql` and `DB_DATABASE=homi`, which override the unforced `<env>` entries of `phpunit.xml`, so
  the Unit and Feature suites run there on PostgreSQL inside the transaction of `RefreshDatabase`, and on SQLite only
  locally. A failing statement aborts that transaction on PostgreSQL, so the tests with statements expected to fail
  (`TelegramIdentityMigrationTest`) run each in its own savepoint (`DB::transaction()`); the whole suite also passes
  locally on PostgreSQL.
- **The PostgreSQL session is UTC.** Laravel writes a date as the app's UTC wall time without an offset, and
  PostgreSQL reads such a value for a `timestamptz` column in the session's zone, so on a server whose zone is not UTC
  every such instant moved by the server's offset (found by the local run on PostgreSQL, whose server is on
  `Asia/Tashkent`: `last_seen_at` and the `*_chosen_at` columns read back `+05:00`). The `pgsql` connection of
  `config/database.php` sets `timezone` to `UTC`. Rows already written into `timestamptz` columns on a server whose
  zone is not UTC read back shifted by that offset; the production track checks the servers' zone (`show timezone`).

## Handoff

**2026-11-26, development track (Claude Code).** Branch `feat/wp-40-identity` from `main` at `cabee17`, PR #124.

- **Done:** steps 1–9 and step 10 up to the env PR, and the Mini App's side: Pint, PHPStan, the pgsql group, an
  independent review of every stage, the security-reviewer pass over the whole diff (STRIDE; no high, its two mediums
  verified down to low and fixed or recorded in "As built") and a spec-compliance review (its one high, the e2e job's
  `APP_ENV`, fixed). The PR's CI runs `make ci-backend`'s gates and the e2e job.
- **Commits**, in order: `7da00ce` (verifier, users, tokens, stub mode), `def500a` (settings, `GET /me`,
  `GET|PATCH /settings`), `96a4053` (gate, sign-in, block and unblock), `8f1e2eb` (the Mini App forwards the client
  address; KI-37; the e2e env), `13e6ae1` (review of the Mini App stage), `6caf12b` (limiters, the daily cap, trusted
  proxies, redaction), `f958082` (OpenAPI and `@homi/types`), `f121fc8` (this documentation), then the fixes of the
  whole-package review (`e86d71e`) and of the final review of PR #124.
- **Verified** on the final tree (baseline on `cabee17`: 854 tests, 850 passed, 4 skipped):
  - from `backend/`: `php artisan test --compact` → 1 362 tests, 1 350 passed, 12 skipped (the pgsql group),
    6 202 assertions; the same on a local PostgreSQL as the backend CI runs it (`DB_CONNECTION=pgsql`,
    `DB_DATABASE=homi_test`) → 1 362 passed, 6 258 assertions; `vendor/bin/phpstan analyse --memory-limit=1G` →
    0 errors; `vendor/bin/pint --test` → passed; `php artisan route:list --path=api/v1 -v` → 64 routes, none on
    `throttle:api`, none without a named limiter, all 59 bearer routes behind the gate, `events.store` with
    `access:lenient`. From the root, `make test-pgsql` on a local PostgreSQL (`DB_HOST=127.0.0.1`) → 12 passed.
  - from `frontend/`: `pnpm --filter app test` → 273 files, 4 403 tests passed; `pnpm -r lint`, `pnpm -r typecheck`
    and `pnpm types:check` → exit 0.
  - Playwright through `scripts/dev/e2e-local.sh` on `f958082`, before the fixes of `e86d71e`: 927 passed
    (25.2 min); `E2E_RADARS_OFF=1` → 20 passed. CI's e2e job is the run on the final tree. Before the branch, five
    runs in a row on `main` `cabee17` (WP-33's "Handoff"): 927 passed each time.
  - `python3 scripts/migration/collect_ids.py --check` → exit 0.
- **Decisions taken here:** DEC-104 … DEC-107 (`../decisions/2026-11-26-developer-answers.md`); the rest is marked in
  the sections above or listed in "As built"; the mismatches with the facts are AM-104 … AM-112 in
  `docs/ai/reports/phase-3-notes.md` §AI.
- **Merged:** #124 as `a987ecd` and the env keys #125 as `d650cac` on 2026-11-26, on the developer's word «сливай
  #124 и #125 после зелёного CI». CI of `cca81c2`: `backend` pass (run 45845272293), `frontend` pass (45845272303),
  `frontend-e2e` pass on attempt 2 (45845272305: 927 + 20 + 10; attempt 1 failed once on the known flake KI-63).
- **Next:**
  1. every developer's local env file needs `ACCESS_MODE=open` and `SOURCES_NATIVE_STUBS=true` (the first developer's
     has both since 2026-11-26: `php artisan config:show access.mode` → `open`, `sources.native_stubs` → `true`); the
     whole local suite runs through `scripts/dev/e2e-local.sh` (KI-71);
  2. the developer checks one real launch value of the dev bot (see "As built");
  3. the production track: "Needs from the production track" above — the three migrations, the env keys of #125 with
     `TRUSTED_PROXIES` set to the addresses the Next servers reach the API from, the timezone check, the scheduler,
     the deploy, the staging check of two buckets —, then the acceptance lines inside Telegram on staging and
     production;
  4. set the status to `DONE`.
