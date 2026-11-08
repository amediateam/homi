# Reference codebase catalogue — `app.uz`

Purpose: the list of modules in the team's existing codebase that HOMI may port, with status and a port plan, so agents reuse proven code instead of writing new code (master prompt §4). Source: `$APPUZ_ROOT` (`/…/Server/app.uz`, see `.ai/local.env.example`) — **read-only**, SVN working copy, not Git. Audited 2026-11-08 by read-only subagents; key facts spot-checked by the main session (file existence and sizes, composer constraints, auth wiring). Items under "Unverified" were not confirmed.

Rules: port single files or patterns, never folders; adapt namespaces, config keys and messages (English/i18n); never copy `.env*`, `envprod`, `key.md`, data or vendor code. All audited modules are first-party (no third-party license headers found).

Status legend: `READY` copy with trivial edits · `NEEDS_ADAPTATION` reuse with the listed changes · `NOT_PORTABLE` pattern only / product-specific.

## Overview of `app.uz`

One Laravel 13.39 / PHP 8.5 monolith serving ~19 products (Http 825 files, Services 798, Models 266, Jobs 54, Resources 136, FormRequests 263, ~1,400 route lines, 115+ migrations in per-product subdirectories). Admin UI is Inertia + Vue 3; frontends are Vue 3 SPAs except `frontend/lendo` (Next 16, static export). Auth is Sanctum bearer tokens. Queues on Redis + Horizon. i18n via a custom jsonb trait (ru default). No listings/geo domain beyond a regions/districts seeder. Three independent Telegram webhook implementations exist (Bot, Qulay, Gramir). Secrets exist on disk — never copy.

Dependency overlap with HOMI: inertia-laravel, horizon, mcp, pennant, pulse, reverb, sanctum, scout, socialite, wayfinder, boost, dusk, pest, pint, telescope. Present there but not in HOMI (→ `docs/backend/package-registry.md` §Proposed): `league/flysystem-aws-s3-v3`, `intervention/image`, `dedoc/scramble`, `spatie/laravel-permission`, `spatie/laravel-medialibrary`, `spatie/laravel-backup`, `sentry/sentry-laravel`, `danog/madelineproto`, `openai-php/laravel`, `pgvector/pgvector`.

## Summary table

| # | Module | Paths (under `backend/`) | Status | HOMI use |
|---|---|---|---|---|
| A1 | Token auth (issue/refresh/logout) | `app/Http/Controllers/Api/V1/Auth/{TokenController,LoginController}.php`, `config/cors.php` | READY / cors NEEDS_ADAPTATION | ADR-0003 bearer tokens |
| A2 | Telegram identity (Mini App initData, Login Widget) | `app/Support/Telegram/InitDataVerifier.php`, `app/Services/SmartAgent/{TelegramInitDataVerifier,TelegramAccountResolver}.php`, `Controllers/SmartAgent/App/V1/Auth/TelegramLoginController.php` | READY (core) / NEEDS_ADAPTATION (wrappers) | Telegram login |
| A3 | Next.js API client | `frontend/lendo/lib/{api,auth}.ts` | NEEDS_ADAPTATION | `frontend/packages/api-client` base |
| A4 | API envelope, exception rendering, Scramble | `Controllers/Api/V1/ApiController.php`, `bootstrap/app.php` (withExceptions), `config/scramble.php` | READY / NEEDS_ADAPTATION | ADR-0007 |
| A5 | Rate limiting set | `app/Providers/AppServiceProvider.php` (`configureRateLimiting`) | NEEDS_ADAPTATION | 5 named limiters |
| A6 | Media pipeline (hashed originals → WebP variants) | `app/Services/Media/*`, `app/Jobs/Media/GenerateImageVariantsJob.php`, `Controllers/Api/V1/Media/{PresignController,WebhookController}.php` | READY (core) / NEEDS_ADAPTATION (storage glue) | Phase 3 media |
| B1 | Telegram webhook intake + dedup | `Controllers/Bot/V1/Webhook/TelegramWebhookController.php`, `Services/Bot/WebhookDispatcher.php`, `Models/Bot/BotUpdateLog.php`, `Jobs/Bot/ProcessBotUpdateJob.php` | NEEDS_ADAPTATION (pattern) | Phase 3 webhook |
| B2–B9 | Simpler webhook variant, Telegram client, credentials vault, notification channel, i18n trait, geo seed, tests/CI shape, ops shape | see cards below | pending detail | Phases 3–6 |

## A1 — Token auth

- **Paths**: `Api/V1/Auth/TokenController.php` (34), `LoginController.php` (71), `RegisterController.php` (40); `Middleware/IdentifyProject.php` (36), `Middleware/EnsureProjectAccess.php` (45); `config/sanctum.php` (stock), `config/cors.php` (68); routes `routes/api.php:100-122`; `apiPrefix: 'api/v1'` in `bootstrap/app.php`.
- **Purpose**: password login issues a 30-day Sanctum personal access token with one ability `project:<slug>`; refresh = rotate (new token, same name + abilities, delete current); logout deletes the current token.
- **Public API**: `TokenController::refresh(Request): JsonResponse` [`POST auth/tokens/refresh`, `auth:sanctum`]; `LoginController::store(LoginRequest)` [`POST auth/login`, `throttle:api-login`], `::destroy(Request)` [`POST auth/logout`]. Conventions: token name `<project>:<device_name|default>`, one token per device/project (same-name tokens deleted on login); middleware aliases `abilities` (all) / `ability` (any); `sanctum:prune-expired --hours=48` scheduled. TTL hard-coded `now()->addDays(30)` in 5 places (config-driven only in Gramir, incl. sliding extension middleware).
- **Telegram-user token flow**: no generic one; `SmartAgent/App/V1/Auth/TelegramLoginController.php` (104) issues a token from Mini App initData (`POST app/v1/auth/telegram/verify`, body `init_data` ≤ 8192, `device_name` ≤ 64, throttle 60/min/IP).
- **CORS**: `paths` per product prefix, `allowed_origins` from env `CORS_ALLOWED_ORIGINS` (default `*` — do not copy), `allowed_headers` incl. `Authorization`, `X-App`, `Idempotency-Key`, `X-Telegram-Init-Data`; `exposed_headers` `X-RateLimit-*`; `supports_credentials=false`.
- **Depends on**: `laravel/sanctum`; internal `ApiController`, `UserResource`, `LoginRequest`, `User::normalizePhone()`.
- **Coupling**: `IdentifyProject` (19 hard-coded slugs + nginx `HTTP_APP`), `EnsureProjectAccess` (`users.projects`), `UserResource` (Spatie roles).
- **Tests**: none for the four `auth/*` endpoints; `tests/Unit/Gramir/IdentifyProjectTest.php`; indirect via SmartAgent auth tests.
- **Port plan**: copy `TokenController`, `LoginController` (if password login is ever needed) and `LoginRequest`; extract the 5-fold `createToken` block into `App\Actions\Auth\IssueApiToken` with TTL from `config('homi.auth.token_ttl_days')` and abilities from `config('homi.auth.clients')` (`app:*`, `arm:*`); skip `IdentifyProject`; register `abilities`/`ability` aliases; schedule `sanctum:prune-expired`; CORS `paths ['api/*']`, explicit origins per environment, `supports_credentials=false`; add the missing endpoint tests.

## A2 — Telegram identity

- **Paths**: `app/Support/Telegram/InitDataVerifier.php` (75); `Services/SmartAgent/TelegramInitDataVerifier.php` (87), `TelegramAccountResolver.php` (72); `Services/Curso/TelegramLoginVerifier.php` (126, Login Widget); `Services/Qulay/TelegramAuth.php` (105) + `Middleware/VerifyQulayInitData.php` (64); migration `2026_04_27_040001_add_telegram_user_id_to_users_table.php` (`users.telegram_user_id bigint unique null`, `telegram_username string(64) null`, `telegram_linked_at timestamptz null`).
- **Public API**: `final class InitDataVerifier { parse(string $initData): array; hashMatches(array $fields, string $botToken, bool $stripSignature): bool }` — HMAC key `HMAC('WebAppData', token)`, fail-closed on empty token, `hash_equals`, manual parser. `SmartAgent\TelegramInitDataVerifier::verify(string $initData, ?int $maxAgeSeconds = null): array{id, first_name, last_name, username, photo_url, language_code, auth_date}` (TTL default 600). `TelegramAccountResolver::resolveOrRegister(int $telegramUserId, ?string $username, ?string $firstName, ?string $lastName): array{user, created}` (race-safe). `Curso\TelegramLoginVerifier::verify(array $payload, int $maxAgeSeconds = 86400)` uses `SHA256(token)` (Login Widget algorithm).
- **Depends on**: framework only (`collect()`, `SensitiveParameter`). Config keys: `smartagent.bot.{token,username,init_data_max_age}`.
- **Coupling**: SmartAgent wrapper has Russian messages and auto-registration; Curso wrapper uses the Bot manager + `CredentialsVault`; Qulay is an island (frozen response shapes, dev bypass) — NOT_PORTABLE.
- **Tests**: no unit test of `InitDataVerifier` itself; wrappers covered by `tests/Feature/Qulay/InitDataAuthTest.php` (14, with `tests/Helpers/QulayInitData.php` signer), `tests/Feature/SmartAgent/AppTelegramAuthTest.php` (14), `tests/Feature/Curso/Crm/V1/Auth/TelegramLoginControllerTest.php` (13).
- **Port plan**: copy `InitDataVerifier.php` verbatim to `App\Support\Telegram`; write `App\Services\Auth\TelegramInitDataValidator` after the SmartAgent class with config `homi.telegram.{bot_token,bot_username,init_data_max_age=600}` and messages in lang files; `Auth\TelegramLoginController::verify` (`POST /api/v1/auth/telegram/verify`) → resolver → `IssueApiToken`; limiter `telegram-auth` 60/min/IP; migration for the three `users.telegram_*` columns; port the signer helper for tests. **Decide `stripSignature` against real initData from the HOMI dev bot** (the two wrappers disagree; see Unverified).

## A3 — Next.js API client (`frontend/lendo`)

- **Paths**: `lib/api.ts` (153), `lib/auth.ts` (87); tests `tests/auth.test.ts` (9).
- **Public API**: `class ApiError(message, status, errors, quota, data)` with `isPaywall/isConflict/isRateLimited/isForbidden`; `apiRequest<T>(path, {method, body, anonymous, signal})`; `api.{get,post,put,patch,delete}<T>`; `getToken/setToken/clearSession/isAuthenticated`; SSO helpers (`extractAuthCode`, `buildSsoUrl`).
- **Behaviour**: unwraps `{success, message, data}`; token in `localStorage` (`lendo.token`) sent as `Authorization: Bearer`; no refresh — any 401 clears the session and redirects to `/auth/login`; base URL `NEXT_PUBLIC_API_URL`; native `fetch`, no dependencies.
- **Coupling**: Id SSO helpers, `X-App`/`X-Workspace` headers, billing paywall (402/quota), Russian strings.
- **Port plan**: seed `frontend/packages/api-client` with `api.ts` (storage key `homi.token`, drop quota/paywall/X-Workspace, wrap `JSON.parse` for non-JSON 5xx, map 422 `errors` to form fields, i18n error strings) and the four token helpers from `auth.ts`; add `auth/telegram/verify`; keep the envelope types in `frontend/packages/types` (generated from OpenAPI once available).

## A4 — API conventions

- **Paths**: `Controllers/Api/V1/ApiController.php` (40); `bootstrap/app.php` `withExceptions` (default dialect L405–500); `config/scramble.php` (136); example `Controllers/Api/V1/Crm/FaqController.php::index` (pagination); `Resources/Api/V1/UserResource.php`, `Requests/Api/V1/Auth/LoginRequest.php`; `tests/Feature/ApiExceptionRenderingTest.php` (7).
- **Public API**: `abstract ApiController { success(mixed $data = null, string $message = 'Success', int $status = 200): JsonResponse; error(string $message = 'Error', int $status = 400, ?array $errors = null): JsonResponse }`. Default exception dialect: 404 `Resource not found.`, 422 `{message, errors}`, 401 `Unauthenticated.`, 429 `Too many requests.` + `Retry-After`, other → HttpException status or 500 with `Server Error` masked when not debug.
- **Pagination**: no shared helper; best example clamps `per_page` to ≤100 (default 20) and emits `{success, data: Resource::collection, meta: {current_page, last_page, per_page, total}}`; other controllers are inconsistent.
- **Scramble**: `api_path 'api/v1'`, UI `/docs/api`, JSON `/docs/api.json`; **no `viewApiDocs` Gate defined**, so docs are reachable only in `local`.
- **Status**: `ApiController` READY; exception block NEEDS_ADAPTATION; Scramble config READY; pagination NEEDS_ADAPTATION.
- **Port plan**: copy `ApiController`, add `paginated(LengthAwarePaginator $p, string $resource)` emitting the ADR-0007 `meta`/`links` shape (clamp 1..100, default 20); copy the five default renderers with `$request->is('api/*')`, add `AuthorizationException → 403` and `ModelNotFound → 404`; install Scramble (PROPOSED) with `Gate::define('viewApiDocs', …)`; port `ApiExceptionRenderingTest`.

## A5 — Rate limiting

- **Paths**: `app/Providers/AppServiceProvider.php::configureRateLimiting` (52 limiters) + Fortify/Landing providers (6 more); `throttleWithRedis()` in bootstrap.
- **Examples**: `api` 120/min by user|ip; `api-login` 10/min by ip; `uploads` 30/min by user|ip; `smartagent-tg-auth` 60/min by ip; `bot-webhook` 6000/min by ip. Note: `api` applies only where routes name `throttle:api`; the presign and MinIO-webhook routes carry no throttle (gap).
- **Port plan**: define `api`, `auth-login`, `telegram-auth`, `uploads`, `webhook`, `intake` in `AppServiceProvider::configureRateLimiting`; `throttleWithRedis()`; apply `throttle:api` on the `api` group by default.

## A6 — Media pipeline

- **Paths**: `Services/Media/HashedUploader.php` (146), `MediaUrlBuilder.php` (116), `BucketDiskFactory.php` (86), `Dto/StoredOriginal.php` (37); `Jobs/Media/GenerateImageVariantsJob.php` (101); `Controllers/Api/V1/Media/PresignController.php` (76), `WebhookController.php` (102); `config/media.php` (44); tests `tests/Feature/Media/*` (50) + `tests/Feature/Filesystems/S3ObjectDiskTest.php` (5).
- **Public API**: `HashedUploader::storeImage(UploadedFile $file, string $bucket): StoredOriginal` / `storeImageBytes(string $bytes, string $bucket)` — `StoredOriginal{sha256, mime, ext, bucket, key, bytes, width, height}`; keys `originals/{sha256}.{ext}`; `GenerateImageVariantsJob(sourceBucket, sourceKey, sourceMime, sha256, destinationBucket)`, `SIZES = [320, 640, 1024, 1920]`, tries 3, backoff 30 → `derived/{sha}/{w}.webp` (PNG lossless q100, else q80, no upscaling, idempotent); `MediaUrlBuilder::build(string $sha256, array{bucket, w?, ext?}): string`; `BucketDiskFactory::for(string $bucket, string $visibility = 'private'): Filesystem`; `PresignController` [`POST media/presign`, `auth:sanctum`] → PUT URL, 15 min, key `uploads/{userId}/{uuid7}.{ext}`; `WebhookController` [`POST media/webhook/s3`, bearer `config('media.webhook_token')`, `s3:ObjectCreated*` on `^originals/[0-9a-f]{64}\.[a-z0-9]+$`] → dispatches the variants job.
- **Validation**: mime sniff via `finfo`, jpeg/png/webp/gif only, ≤ 25 MB, ≤ 8000 px per side, EXIF stripped by GD re-encode, sha256 of the re-encoded bytes, `Cache-Control: immutable`, skip if exists.
- **Depends on**: `intervention/image ^4.1` (GD), `league/flysystem-aws-s3-v3`, Horizon. Storage glue (`BucketDiskFactory`, `MediaUrlBuilder`, `PresignController`) depends on the app.uz ObjectStorage module (DB-driven S3 clusters/buckets, `ObjectStorageState`) — replace with plain disks.
- **Gaps found**: presign accepts any bucket and any mime; the "register" step moving `uploads/…` → `originals/{sha}` is not implemented anywhere (the docblock claims the webhook does it, but it only accepts `originals/`); the webhook route has no throttle.
- **Status**: `HashedUploader`, `StoredOriginal`, `GenerateImageVariantsJob`, `WebhookController` READY; `BucketDiskFactory`, `MediaUrlBuilder`, `PresignController` NEEDS_ADAPTATION; Spatie path (`UploadController`, `HasPhotoConversions`, `PendingUpload`) NOT_PORTABLE.
- **Port plan**: install `intervention/image` + `league/flysystem-aws-s3-v3` (PROPOSED → approval); copy the four READY files; rewrite `BucketDiskFactory` to two plain `s3` disks `media_public`/`media_private` (env `S3_ENDPOINT=https://s3.hc.uz`, path-style, `MEDIA_PUBLIC_BUCKET`, `MEDIA_PRIVATE_BUCKET`); `MediaUrlBuilder` base = `config('media.public_base_url')` (CDN) without DB lookups; presign with bucket + mime allowlists, signed size, `throttle:uploads`, plus an explicit register endpoint; private reads via `Storage::disk('media_private')->temporaryUrl($key, now()->addMinutes(10))`; copy the media tests; configure MinIO `notify_webhook`.

## B1 — Telegram webhook intake (Bot variant)

- **Paths**: `Controllers/Bot/V1/Webhook/TelegramWebhookController.php` (25); `Services/Bot/WebhookDispatcher.php` (187); `Models/Bot/BotUpdateLog.php` (62); migrations `bots/2026_04_22_150005_create_bot_updates_log_table.php` (+ `2026_04_27_090010_add_ai_response_text…`); `Jobs/Bot/ProcessBotUpdateJob.php` (655); limiter `AppServiceProvider.php:238`; route `routes/bot/v1.php`.
- **Flow**: `POST /bot/v1/webhook/telegram/{username}` (`throttle:bot-webhook` 6000/min/IP) → resolve bot → `TelegramChannel::verifyWebhook` compares header `X-Telegram-Bot-Api-Secret-Token` with the bot's `webhook_secret` via `hash_equals` (fail-closed) → INSERT raw update into `bot_updates_log` → queue `ProcessBotUpdateJob($logId)` → 200. Unique violation (23505) → 200 (idempotent ack). Bad secret → 403; unknown bot → 404.
- **Table `bot_updates_log`**: `id, bot_id FK, external_update_id bigint null, event_type varchar(40), headers jsonb, body jsonb, ip varchar(45), signature_valid bool, processing_time_ms, processed bool, processing_error varchar, created_at` (+ AI response columns); indexes `(bot_id, created_at)`, `(bot_id, processed)`, partial UNIQUE `(bot_id, external_update_id) WHERE external_update_id IS NOT NULL`. Retention: `bots:prune` deletes rows older than 14 days.
- **Job**: `$timeout = 30`, `$tries = 3`, `$backoff = 10`, queue `bot-handler`; exits early if `processed`; on exception rolls back, `report($e)`, writes `processing_error`, rethrows (→ `failed_jobs`). Handler resolution is an `if` chain over ~20 product handlers (NOT_PORTABLE); `answerCallbackQuery` is called synchronously to stop button spinners.
- **Status**: NEEDS_ADAPTATION (pattern + table + dispatcher skeleton; drop product handlers).
- **Port plan**: one table `telegram_updates` with the same columns minus AI fields; dispatcher = verify secret (per-environment bot from config, not DB) → insert → `ProcessTelegramUpdate` job on queue `bot`; keep the partial unique index and idempotent 200; add `ShouldBeUnique` by log id; `telegram:webhook:set|info|delete` commands with a production guard (master prompt §8.6); prune command with TTL from config.

## B2–B9 — pending detail

Cards for the simpler Gramir webhook variant, `TelegramClient`/`TelegramChannel`, `CredentialsVault`, the Telegram notification channel, `HasTranslations`/`LocaleRegistry`, SmartAgent geo seed, test/CI scaffolding and ops shape (Horizon supervisors, schedule, logging, backup) are being completed by the second audit; this section is replaced when they land.

## Unverified (from the audits)

- Whether real Telegram initData `hash` covers the `signature` field (wrappers disagree; only self-signed tests exist) — test with the HOMI dev bot.
- `config/media-library.php` 10 MB cap vs 20/50 MB request caps (Spatie path, not ported).
- Whether the GD re-encode flattens animated GIFs.
- Production MinIO bucket policy and `notify_webhook` setup are not in the repo.
- Whether the `api` limiter is applied globally (no `throttleApi()` seen).
- No tests were executed in `app.uz`; vendor state assumed to match its lock file.
