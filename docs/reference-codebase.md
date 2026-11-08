# Reference codebase catalogue — `app.uz`

Purpose: the index of modules in the team's existing codebase that HOMI may port, with status, HOMI use and a link to the detailed card (port plan, signatures, tests). Agents must check this list before writing anything that smells like auth, Telegram, media, i18n, geo, webhooks or ops glue (master prompt §4, §22 step 4).

Source: `$APPUZ_ROOT` (`/…/Server/app.uz`, see `.ai/local.env.example`) — **read-only**, SVN working copy (no Git history; freshness by mtime, newest 2026-11-02). Audited 2026-11-08 by read-only subagents; key facts spot-checked by the main session (file existence/sizes, composer constraints, auth wiring). "Unverified" items were not confirmed.

Rules: port single files or patterns, never folders; adapt namespaces, config keys and messages (English + ru/uz/en lang files); never copy `.env*`, `envprod`, `key.md`, data or vendor code. All audited modules are first-party (no third-party license headers found in any audited path).

Status legend: `READY` copy with trivial edits · `NEEDS_ADAPTATION` reuse with the listed changes · `NOT_PORTABLE` pattern only / product-specific.

## Overview of `app.uz`

One Laravel 13.39 / PHP 8.5 monolith serving ~19 products (Http 825 files, Services 798, Models 266, Jobs 54, Resources 136, FormRequests 263, ~1,400 route lines, 115+ migrations in per-product subdirectories; 813 test files, ~6,800 Pest cases — not run). Admin UI is Inertia + Vue 3; frontends are Vue 3 SPAs except `frontend/lendo` (Next 16, static export). Auth is Sanctum bearer tokens. Queues on Redis + Horizon (15 supervisors). i18n via a custom jsonb trait (ru default). No listings/geo domain beyond a regions/districts seeder. Three independent Telegram webhook implementations (Bot, Qulay, Gramir). No PHPStan/Rector; CI matrix is stale (PHP 8.3/8.4 vs `^8.5`). Secrets exist on disk — never copy.

Dependency overlap with HOMI: inertia-laravel, horizon, mcp, pennant, pulse, reverb, sanctum, scout, socialite, wayfinder, boost, dusk, pest, pint, telescope. Present there but not in HOMI (→ `docs/backend/package-registry.md` §Proposed): `league/flysystem-aws-s3-v3`, `intervention/image`, `dedoc/scramble`, `spatie/laravel-permission`, `spatie/laravel-medialibrary`, `spatie/laravel-backup`, `sentry/sentry-laravel`, `danog/madelineproto`, `openai-php/laravel`, `pgvector/pgvector`.

## Module index

Detailed cards: [A — auth, API, media](reference-codebase/a-auth-api-media.md) · [B — bot, i18n, geo, tests, ops](reference-codebase/b-bot-i18n-geo-ops.md).

| # | Module | Key paths (under `backend/`) | Status | HOMI use (phase) |
|---|---|---|---|---|
| A1 | Token auth (issue / refresh / logout) | `Http/Controllers/Api/V1/Auth/{TokenController,LoginController}.php`, `config/cors.php` | READY · cors NEEDS_ADAPTATION · `IdentifyProject` NOT_PORTABLE | ADR-0003 bearer tokens (3) |
| A2 | Telegram identity (Mini App initData, Login Widget) | `Support/Telegram/InitDataVerifier.php`; `Services/SmartAgent/{TelegramInitDataVerifier,TelegramAccountResolver}.php`; `Controllers/SmartAgent/App/V1/Auth/TelegramLoginController.php` | core READY · wrappers NEEDS_ADAPTATION · Qulay NOT_PORTABLE | Telegram login (3) |
| A3 | Next.js API client | `frontend/lendo/lib/{api,auth}.ts` | NEEDS_ADAPTATION | `frontend/packages/api-client` (2–3) |
| A4 | API envelope, exception rendering, Scramble | `Controllers/Api/V1/ApiController.php`; `bootstrap/app.php` withExceptions; `config/scramble.php` | `ApiController` READY · renderers/pagination NEEDS_ADAPTATION | ADR-0007 (3) |
| A5 | Rate limiter set | `Providers/AppServiceProvider.php::configureRateLimiting` | pattern READY, names NEEDS_ADAPTATION | 6 named limiters (3) |
| A6 | Media pipeline (hashed originals → WebP variants, presign, MinIO webhook) | `Services/Media/*`; `Jobs/Media/GenerateImageVariantsJob.php`; `Controllers/Api/V1/Media/{PresignController,WebhookController}.php` | core READY · storage glue NEEDS_ADAPTATION · Spatie path NOT_PORTABLE | CDN/media (3) |
| B1 | Telegram webhook intake, Bot variant (dispatcher + log table + job) | `Controllers/Bot/V1/Webhook/TelegramWebhookController.php`; `Services/Bot/WebhookDispatcher.php`; `Models/Bot/BotUpdateLog.php` | controller/dispatcher/model/migration READY · job NOT_PORTABLE | reference for B2 (3) |
| B2 | Telegram webhook intake, Gramir variant (middleware + insertOrIgnore + job) — **preferred pattern** | `Controllers/Gramir/Webhooks/TelegramBotWebhookController.php`; `Middleware/Gramir/VerifyTelegramBotSecret.php`; `Models/Gramir/WebhookEvent.php`; `Jobs/Gramir/Channels/ProcessTelegramBotUpdateJob.php` | NEEDS_ADAPTATION (~150 lines) | `hook.homi.uz` webhook (3) |
| B3 | Telegram Bot API client + webhook set/delete | `Services/Bot/Channels/Telegram/{TelegramClient,TelegramException,TelegramChannel}.php` | client/exception READY · channel layer NEEDS_ADAPTATION | Bot module (3) |
| B4 | Credentials vault (dedicated-key encryption) | `Services/Bot/CredentialsVault.php`; `Console/Commands/Bots/GenerateKeyCommand.php` | READY | bot tokens per env (3) |
| B5 | Telegram notification channel | `Notifications/Channels/TelegramChannel.php` (+ `Services/Telegram/TelegramBotService.php`) | channel READY (re-implement 27 lines) · service NOT_PORTABLE | Radar notifications (3+) |
| B6 | i18n: jsonb translations + locale registry | `Support/Localization/{HasTranslations,LocaleRegistry}.php`; `Services/Landing/LanguageResolver.php` | READY | ADR-0006 (3) |
| B7 | Geo: regions/districts + enums + seeder | `Models/SmartAgent/{Region,District}.php`; `database/migrations/smartagent/*100001*,*100002*`; `database/seeders/SmartAgent/SmartAgentGeoSeeder.php`; `Enums/SmartAgent/{DealType,PropertyType}.php` | READY (data incomplete: 14 regions ru/uz, 12 Tashkent districts) | Geo module (3) |
| B8 | Testing & tooling shape (Pest bindings, arch test, pint, CI) | `tests/Pest.php`; `tests/Unit/Arch/ProductBoundariesTest.php`; `pint.json`; `.github/workflows/*.yml` | pint READY · CI NEEDS_ADAPTATION · arch test pattern · helpers NOT_PORTABLE | Phase 6 |
| B9 | Ops shape (Horizon supervisors, schedule, logging, Sentry, backup) | `config/horizon.php`; `routes/console.php`; `config/{logging,sentry,backup}.php` | structure NEEDS_ADAPTATION · product wiring NOT_PORTABLE | Phases 3, 6 |

## Gaps in `app.uz` worth not inheriting

- Token TTL hard-coded in five places; `/api/v1/auth/*` endpoints have no tests.
- Presign accepts any bucket/mime; the `uploads/…` → `originals/{sha}` register step does not exist; the MinIO webhook route has no throttle.
- No request-id/correlation middleware; Sentry not explicitly wired in `bootstrap/app.php`; `pint` runs without `--test` in CI (never fails); no PHPStan.
- Gramir `webhook_events` has no prune; Bot variant's 655-line job routes 20 product handlers.
- `config/app.php` locale defaults to `en` while the registry default is `ru`; no `lang/en`.
- Two different Telegram hash algorithms (Mini App `HMAC('WebAppData')` vs Login Widget `SHA256(token)`) and two wrappers that disagree on stripping `signature`.

## Unverified (from the audits)

- Whether real Telegram initData `hash` covers the `signature` field — test with the HOMI dev bot before choosing `stripSignature`.
- `config/media-library.php` 10 MB cap vs 20/50 MB request caps (Spatie path, not ported); whether GD re-encode flattens animated GIFs.
- Production MinIO bucket policy and `notify_webhook` setup (not in repo).
- Whether the `api` limiter is applied globally; how Sentry receives exceptions; `ScheduleSmokeTest` content; `laravel/dusk` presence in `app.uz`'s composer; Horizon production vs local differences beyond names.
- No tests were executed in `app.uz`; vendor state assumed to match its lock file.

Process note: one subagent ran a single `grep` on `app.uz/backend/.env.example` (template, not `.env`); it output one comment line and no values. Recorded here for transparency; the Phase 6 hook will block even that.
