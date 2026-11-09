# 10 — Target architecture: HOMI as the landing zone for kvadro²

Part of the kvadro² → HOMI migration audit (rules, labels and ID scheme: [`README.md`](README.md)).

- **Status:** wave 1 (2026-11-09) wrote part 1 (factual baseline of HOMI) and part 2 (conflicts and gaps); wave 2
  (2026-11-09) wrote parts 3–9: decisions per conflict, backend and frontend architecture, infrastructure summary,
  reuse of existing work, decisions needed from people, proposed `HANDOFF.md` changes. Nothing here is decided: every
  decision is `PROPOSED` until the ADR or approval named in its row exists. New dependencies are `PROPOSED`.
- **Companion documents:** [`17-infrastructure-and-deployment.md`](17-infrastructure-and-deployment.md),
  [`18-release-and-rollback.md`](18-release-and-rollback.md).
- **Baseline commit:** `main` at `591ceb4` (merge of PR #7), read on branch `docs/kvadro-migration-audit`.
- **Evidence:** repo-relative `path:line`; `$KVADRO_ROOT/…` for the legacy tree; legacy items by their audit IDs
  (`API-`, `RES-`, `BR-`, `LB-`, `TMA-`, `BOT-`, `Q-`). Commands run: `php artisan route:list --json` in `backend/`
  (default `local` environment, and again with `APP_ENV=production`), `grep -o '^[A-Z_]*=' backend/.env.example`, file
  reads. No `.env` file was read.
- **Collector facts** that are not in this repository come from `docs/api/intake-sources.md` and from the
  *reference-reader report, 2026-11-09* (read-only agent, relayed by the coordinator; paths given as
  `<repo>:<path>`).
- **Local IDs:** `CF-NNN` = conflict between a HOMI decision and the legacy contract; `GAP-NNN` = legacy capability
  with no HOMI home; `DEC-NN` = decision that needs a person (§8). `CF` and `GAP` are in the README ID table; `DEC` is
  not yet — its owner should add it (this audit did not edit README).

## 1. Target baseline (what HOMI has today)

### 1.1 Summary

- Phases 0–2 are done, Phase 3 (CDN, webhook, intake) is paused work in progress, Phase 4 is partly applied
  (`HANDOFF.md:42-49`). T0 (second-machine onboarding) is done: PR #7 merged, `docs/testing/verification-log.md`.
- **Code that exists:** API envelope and exception renderer, request ids, four rate limiters, the Media module
  (tested), the schema for Telegram updates and for intake (no endpoints), a fail-closed Telegram webhook stub.
- **Not built:** every domain module — Identity, Geo, Listings, Pricing & Stats, Radar & Notifications, Bot, ARM API,
  AI. The three Next.js apps are `create-next-app` output (`docs/handoff/project-context.md:80-85`).
- **Consequence for the migration:** no shipped product behaviour collides with kvadro². The collisions are with
  **decisions** (ADRs) and with a few schema and config choices (part 2).

### 1.2 Stack and versions

| Layer | HOMI today | Evidence |
| ----- | ---------- | -------- |
| Backend runtime | PHP 8.5.12, Laravel 13.40.0 (`php ^8.5`, `laravel/framework ^13.17`) | `docs/handoff/project-context.md:27`; `backend/composer.json:12`, `:17` |
| Backend packages | `dedoc/scramble`, `inertiajs/inertia-laravel` 3, `intervention/image` 4.4, `laravel/ai` 1.3, `horizon` 5.50, `mcp`, `pennant`, `pulse`, `reverb`, `sanctum` 4, `scout`, `socialite`, `telescope`, `tinker`, `wayfinder`, `league/flysystem-aws-s3-v3` | `backend/composer.json:11-30` |
| Backend dev tooling | Pest, Larastan (level 7), Boost 2.10, Dusk, Pint, Pail, Sail | `backend/composer.json:31-41`; `docs/handoff/project-context.md:28` |
| Frozen starter UI | Inertia v3 + React 19 + Tailwind 4 + Vite+; nothing new is built there | ADR-0002 (`docs/architecture/decisions/0002-backend-frozen-inertia-stack.md:14-21`) |
| Database | PostgreSQL 18.6 locally (`DB_CONNECTION=pgsql`); tests run on in-memory SQLite | `docs/handoff/project-context.md:31`; `backend/.env.example:29`; `backend/phpunit.xml:26-27` |
| PostGIS | **Not installed, not used.** No migration enables an extension; the CI database image is `postgres:18`; adoption needs an ADR and a check with the production track | `.ai/agents/postgis-geo-engineer.md:17`; `.github/workflows/backend.yml:31-32`; `HANDOFF.md:101` |
| Queue / cache / sessions | Redis 8.10.3 + Horizon (`QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`); sessions in the database | ADR-0005; `backend/.env.example:37`, `:47-48` |
| Search | Scout installed, driver `collection` (default) | `backend/config/scout.php:19` |
| Feature flags | Pennant, `database` store (`features` table) | `backend/config/pennant.php:18` |
| LLM | `laravel/ai` installed; no provider configured; AI vendor to be chosen before the first AI feature | `backend/composer.json:16`; `docs/handoff/project-context.md:58` |
| Frontend | pnpm 11.24.0 workspace, Node `>=26 <27`, Next.js 16.4.5, React 19.3.1, TypeScript `^6` | `frontend/package.json`; `frontend/{landing,app,arm}/package.json`; ADR-0004 (`…/0004-toolchain-pins-pnpm-node-php.md:17`) |
| Local infrastructure | Homebrew nginx started by hand, php-fpm `:9000`, mkcert TLS, six `*.homi.loc` hosts, media on disk behind `cdn.homi.loc` | ADR-0008, ADR-0012; `.ai/memory/current-state.md:28` |
| Staging / production | since 2026-11-09 (PR #8): HOMI staging and production on the web host `159.253.19.121` (checkouts of `main`, `homi-deploy`, Next SSR, Horizon units), databases `homi_db` / `homi_staging_db` on `5.45.127.98`, Redis DB indexes on the host's shared instance; MinIO `s3.hc.uz` not provisioned yet (media on disk) | `docs/infrastructure/deployment.md`; `docs/infrastructure/environments.md` |
| Telegram | three bots exist (dev, staging, prod); tokens not in the repository; no webhook registered | `.ai/memory/current-state.md:31` |

Not in the stack today: map tile hosting, PostHog or any analytics client, an exchange-rate source, an LLM provider,
a Telegram channel reader, browser targets for old WebViews (`browserslist`).

### 1.3 Modules and their status

Module names follow `docs/architecture/overview.md:49-60`.

| Module | Status | What exists | Evidence |
| ------ | ------ | ----------- | -------- |
| HTTP cross-cutting | **done**, tested | `ApiController` (`success`, `error`, `paginated`, `noContent`); `ApiExceptionRenderer` (401/403/404/422/429/500 envelopes for `api/*` or JSON requests); `AssignRequestId` (accepts inbound `X-Request-Id` matching `^[A-Za-z0-9._-]{8,64}$`, else a ULID; log context + response header); limiters `api` 120/min, `uploads` 30/min, `intake` 600/min (per actor, else IP), `telegram-webhook` 3000/min per IP | `backend/app/Http/Controllers/Api/V1/ApiController.php:22-80`; `backend/app/Http/ApiExceptionRenderer.php:23-49`; `backend/app/Http/Middleware/AssignRequestId.php:17-30`; `backend/app/Providers/AppServiceProvider.php:62-83`; `backend/tests/Feature/Http/*` |
| Media | **done** on the local disk; presign works only where the tmp disk is S3 | upload, show, delete, presign + register; `HashedUploader`, `GenerateImageVariantsJob`, `MediaUrlBuilder` | `backend/routes/api.php:14-23`; `backend/app/Http/Controllers/Api/V1/Media/*`; `backend/app/Services/Media/*`; `backend/tests/Feature/Media/*` (28 cases) |
| Bot (webhook) | **stub, fail-closed** | route `POST /telegram/webhook`; the middleware always answers 403, the controller 501, the job is empty; `telegram_updates` table, model (`Prunable`), factory, `config/telegram.php` | `backend/routes/hooks.php:15-17`; `backend/app/Http/Middleware/VerifyTelegramSecretToken.php:20-23`; `backend/app/Http/Controllers/Webhooks/TelegramWebhookController.php:18-21`; `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php:15-26` |
| Intake | **schema only** (WIP) | tables, models, enums, factories, `SourceSeeder` (not called by `DatabaseSeeder`), `config/intake.php`; no routes, controllers, form requests or `intake:token` command | `backend/database/migrations/2026_11_08_171042…171045_*`; `backend/database/seeders/SourceSeeder.php:16-18`; `HANDOFF.md:86` |
| Identity | **not built** | Laravel's default `users` (name, unique email, password) and Sanctum `personal_access_tokens`; no Telegram columns; no sign-in endpoint (T6) | `backend/database/migrations/0001_01_01_000000_create_users_table.php:14-22`; `backend/app/Models/User.php:25-27` |
| Geo, Listings, Pricing & Stats, Radar & Notifications, Admin (ARM API), AI | **not built** | module boundaries exist on paper only | `docs/architecture/overview.md:49-60`; `docs/handoff/project-context.md:84` |
| Scheduler | **none** | `routes/console.php` defines only `inspire`; the `telegram_updates` prune (`model:prune`) is not scheduled | `backend/routes/console.php:6-8`; `backend/app/Models/TelegramUpdate.php:31`, `:54` |
| Localization | **not built** | no `backend/lang/`; `HasTranslations` / `LocaleRegistry` from the reference codebase are not ported | ADR-0006 (`…/0006-time-locale-i18n-currency.md:23`); `docs/reference-codebase/b-bot-i18n-geo-ops.md` B6 |
| OpenAPI | **partial** | Scramble installed with `api_path` `api/v1`, UI at `/docs/api`; no committed export, no `viewApiDocs` gate (T3) | `backend/config/scramble.php:23`; `HANDOFF.md:89-91` |

### 1.4 Routes

`php artisan route:list --json` lists **97 routes** in the `local` environment and 92 with `APP_ENV=production` (the
three Dusk routes and two Inertia devtools routes drop out). Eight of them are application routes:

| # | Method | URI | Name | Handler | Middleware | Status | Evidence |
| - | ------ | --- | ---- | ------- | ---------- | ------ | -------- |
| 1 | GET, HEAD | `/` | `home` | Inertia page `welcome` (frozen starter) | `web` | starter | `backend/routes/web.php:5` |
| 2 | GET, HEAD | `/up` | — | Laravel health check | — | done | `backend/bootstrap/app.php:23` |
| 3 | POST | `/api/v1/media` | `api.v1.media.store` | `MediaController@store` | `api`, `auth:sanctum`, `ability:media:write`, `throttle:uploads` | done | `backend/routes/api.php:19` |
| 4 | POST | `/api/v1/media/presign` | `api.v1.media.presign` | `PresignController@store` | as #3 | done (S3 disks only) | `backend/routes/api.php:20` |
| 5 | POST | `/api/v1/media/register` | `api.v1.media.register` | `PresignController@register` | as #3 | done | `backend/routes/api.php:21` |
| 6 | GET, HEAD | `/api/v1/media/{media}` | `api.v1.media.show` | `MediaController@show` | `api`, `auth:sanctum` | done | `backend/routes/api.php:16` |
| 7 | DELETE | `/api/v1/media/{media}` | `api.v1.media.destroy` | `MediaController@destroy` | as #3 | done | `backend/routes/api.php:22` |
| 8 | POST | `/telegram/webhook` | `hooks.telegram` | `TelegramWebhookController` | `hooks` (`throttle:telegram-webhook`, bindings), `VerifyTelegramSecretToken` | stub: 403 / 501 | `backend/routes/hooks.php:15-17`; `backend/bootstrap/app.php:26`, `:37-40` |

The other 89 come from packages and tooling: Telescope 44 (`/telescope/*`), Horizon 22 (`/horizon/*`), Livewire
assets for Pulse 9, Pulse 1, Scramble 3 (`/docs/api`, `/docs/api.json`, `/_scramble/dev-tools/devtools.js`), local disk
serving 2 (`GET` and `PUT /storage/{path}` — signed temporary URLs of the `local` disk, `backend/config/filesystems.php:38`,
ADR-0012), Dusk 3, Inertia devtools 2, Boost browser logs 1, `broadcasting/auth` 1, `sanctum/csrf-cookie` 1.

Facts that matter later:

- `/api/v1` is built as the default `api` prefix plus `Route::prefix('v1')` (`backend/routes/api.php:14`), not with
  `apiPrefix: 'api/v1'` as ADR-0007 states (`…/0007-api-v1-response-envelope-pagination.md:14`). The URLs are the same,
  but the `/api` segment stays free for other route groups.
- The exception renderer treats **every** `api/*` path and every `expectsJson()` request as an envelope request
  (`backend/app/Http/ApiExceptionRenderer.php:46-49`; `backend/bootstrap/app.php:48-50`).
- The webhook route has no host constraint, so `api.*` also reaches it (`HANDOFF.md:82`).

### 1.5 Tables

22 tables are created by `backend/database/migrations/*`. Six of them are HOMI domain tables:

| Table | Purpose | Key columns | Evidence |
| ----- | ------- | ----------- | -------- |
| `media_files` | content-addressed originals and their variants | `id` ULID; `disk`; `key`; `sha256`; `mime`; `ext`; `bytes`; `width`; `height`; `visibility`; `status` (`pending` / `ready` / `failed`); `variants` jsonb; `uploaded_by` → `users`; UNIQUE (`disk`, `sha256`) | `backend/database/migrations/2026_11_08_171040_create_media_files_table.php:15-32` |
| `telegram_updates` | webhook dedup ledger, raw update | `bot_id`; `update_id`; `payload` jsonb; `status` (`received` / `processing` / `done` / `failed`); `error`; `processed_at`; UNIQUE (`bot_id`, `update_id`) | `…/2026_11_08_171041_create_telegram_updates_table.php:15-26` |
| `sources` | collectors that push into HOMI | `code` UNIQUE; `name`; `trust_weight` decimal(3,2); `is_active` | `…/2026_11_08_171042_create_sources_table.php:15-21` |
| `source_listings` | one row per (source, external listing): the HOMI id a collector gets back | `id` ULID; `source_id`; `external_id`; `source_version`; `status` (`active` / `withdrawn`); `first_seen_at`; `last_event_at`; `listing_id` ULID (no FK yet); UNIQUE (`source_id`, `external_id`) | `…/2026_11_08_171043_create_source_listings_table.php:16-28` |
| `intake_requests` | idempotency ledger | `source_id`; `idempotency_key`; `status_code`; `response` jsonb; UNIQUE (`source_id`, `idempotency_key`) | `…/2026_11_08_171044_create_intake_requests_table.php:15-23` |
| `intake_events` | raw accepted payloads before normalisation | `id` ULID; `source_id`; `source_listing_id`; `intake_request_id`; `event_type`; `schema_version`; `source_version`; `payload` jsonb; `status`; `error`; `received_at`; `processed_at` | `…/2026_11_08_171045_create_intake_events_table.php:15-30` |

The other 16 are framework and package tables: `users`, `password_reset_tokens`, `sessions`
(`…/0001_01_01_000000_create_users_table.php`); `cache`, `cache_locks`; `jobs`, `job_batches`, `failed_jobs`;
`features` (Pennant); `personal_access_tokens` (Sanctum, polymorphic `tokenable`, so users and sources both hold
tokens); `telescope_entries`, `telescope_entries_tags`, `telescope_monitoring`; `pulse_values`, `pulse_entries`,
`pulse_aggregates`.

There are no tables for listings, photos of listings, users' Telegram identity, settings, subscriptions, favourites,
history, hidden items, votes, reports, geography, prices, rates or analytics.

### 1.6 Queues and background work

Horizon supervisors (`backend/config/horizon.php:205-282`):

| Supervisor | Queues | Balance | Timeout / tries | Processes (prod / staging / local) |
| ---------- | ------ | ------- | --------------- | ---------------------------------- |
| `supervisor-default` | `default`, `notifications` | simple | 60 s / 3 | 4 / 2 / 1 |
| `supervisor-telegram` | `telegram` | simple | 30 s / 3 | 4 / 2 / 1 |
| `supervisor-media` | `media` | auto | 300 s / 3 | 1–3 / 1–2 / 1 |
| `supervisor-ingest` | `ingest` | auto | 120 s / 3 | 1–3 / 1–2 / 1 |

Jobs: `GenerateImageVariantsJob` on `media` (tested), `ProcessTelegramUpdateJob` (empty). Tests run queues `sync`
(`backend/phpunit.xml:30`). No scheduled tasks exist (§1.3).

### 1.7 Media and storage

- Pipeline: validate (mime sniff; JPEG, PNG, WebP, GIF; ≤ 25 MB; ≤ 8000 px) → content-addressed original
  `originals/{sha256}.{ext}` → WebP variants `derived/{sha256}/{width}.webp` for widths 320, 640, 1024, 1920 at
  quality 80, no upscaling (`backend/config/media.php:26-44`).
- Disks: `public`, `local` (private), `tmp` locally; `s3_public`, `s3_private`, `s3_tmp` in staging and production
  (`backend/config/filesystems.php:35-72`; `backend/config/media.php:16-20`).
- URLs: public files are plain, unsigned, immutable URLs under `MEDIA_PUBLIC_URL` (`https://cdn.homi.loc` locally);
  private files get temporary URLs for 10 minutes; presigned uploads last 15 minutes
  (`backend/app/Services/Media/MediaUrlBuilder.php:41-53`; `backend/config/media.php:46-47`; ADR-0012:14-18).
- Not supported: video, a link from a photo to a listing, JPEG variants, size-specific URL signing.

### 1.8 Authentication

- Decision: Sanctum personal access tokens for every client, Telegram as the only identity, issued by
  `POST /api/v1/auth/telegram` (Mini App `initData` or Login Widget), bearer header, no cookies or CSRF
  (ADR-0003, `…/0003-auth-sanctum-bearer-tokens.md:14-19`).
- Code: every `/api/v1` route is behind `auth:sanctum` (`backend/routes/api.php:14`); ability middleware aliases are
  registered (`backend/bootstrap/app.php:42-45`); only the `media:write` ability is used. There is **no** token-issuing
  endpoint yet (T6). Sanctum has no global expiry; expiry is set per token (`backend/config/sanctum.php:53`;
  `docs/handoff/project-context.md:60`).
- CORS: explicit origins from `CORS_ALLOWED_ORIGINS` (locally `homi.loc`, `app.homi.loc`, `arm.homi.loc`); allowed
  headers `Accept`, `Accept-Language`, `Authorization`, `Content-Type`, `X-Requested-With`, `Idempotency-Key`;
  `supports_credentials` false (`backend/config/cors.php:27-37`; `backend/.env.example:94`).
- Webhook: secret-header middleware exists as a stub that always refuses (§1.3).

### 1.9 API conventions

- `/api/v1` prefix; success `{"success": true, "message"?, "data", "meta"?, "links"?}`; error
  `{"success": false, "message", "errors"?}` — the optional `code` from ADR-0007 is not emitted yet
  (`backend/app/Http/Controllers/Api/V1/ApiController.php:11-51`; `backend/app/Http/ApiExceptionRenderer.php:55-63`;
  ADR-0007:14-16).
- Page-number pagination `?page[number]=&page[size]=` with `meta {page, size, total, last_page}` and
  `links {next, prev}`; cursor pagination is allowed "for the listing feed when the first performance measurement
  requires it" (`ApiController.php:59-75`; ADR-0007:17).
- API Resources only; opaque ids (ULID/UUID), not integers (ADR-0007:18, :20; ULID keys in `media_files`,
  `source_listings`, `intake_events`).
- OpenAPI from code (Scramble) → committed `docs/api/openapi.json` → generated TypeScript client; none of the
  export, CI drift check or generator exists yet (T3, T5).
- Every response carries `X-Request-Id` (§1.3).

### 1.10 Time, locale, i18n, currency

- Time: UTC storage (`APP_TIMEZONE=UTC`, `timestamptz` columns), `Asia/Tashkent` display, ISO-8601 with offset,
  `CarbonImmutable` (ADR-0006:14; `backend/config/app.php:68`; `backend/.env.example:10`;
  `frontend/packages/config/src/index.ts:15`).
- Locales: `ru` (default and fallback), `uz` (Latin script), `en`; `APP_LOCALE=ru`, `APP_FALLBACK_LOCALE=ru` in
  `.env.example` (the config file's own default is still `en`, `backend/config/app.php:81-83`); translatable fields
  as `jsonb` per attribute; UI copy lives in the Next apps, API messages in `lang/{ru,uz,en}` — which does not exist
  yet (ADR-0006:15-18; `backend/.env.example:12-13`; `frontend/packages/config/src/index.ts:6-8`).
- Currency: integer minor units with an explicit currency in the **source** currency; display default **UZS**; a
  daily rate table whose source is chosen with the first pricing feature; market statistics per currency, never on
  mixed values (ADR-0006:17; `frontend/packages/config/src/index.ts:10-12`;
  `frontend/packages/utils/src/index.ts:7-17`). Intake accepts `UZS`, `USD`, `EUR` (`backend/config/intake.php:25`).
- Intake classification enums: deals `sale`, `rent`, `buy`, `rent_wanted`; property types `apartment`, `house`,
  `land`, `commercial`, `room` (`backend/config/intake.php:23-24`).

### 1.11 Frontend apps and shared packages

- `frontend/landing` (dev port 3000), `frontend/app` (3001), `frontend/arm` (3002): `create-next-app` pages and
  layouts (title "Create Next App", `lang="en"`, Geist fonts from `next/font/google`), scripts `dev`, `build`, `start`,
  `lint`, `typecheck` (`next typegen && tsc --noEmit`); dependencies only `next`, `react`, `react-dom`
  (`frontend/app/app/layout.tsx:15-24`; `frontend/{landing,app,arm}/package.json`).
- `next.config.ts` per app: `cacheComponents: true`, `partialPrefetching: true`, `agentFeedback: false`,
  `allowedDevOrigins` for the app's `.homi.loc` host, `images.remotePatterns` for the three CDN hosts, Tailwind via
  the turbopack loader (`frontend/app/next.config.ts:3-30`). No `browserslist`, no CSP, no middleware/proxy.
- `.env.example` keys: `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_API_URL` (`…/api/v1`), `NEXT_PUBLIC_CDN_URL`,
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (+ `NEXT_PUBLIC_APP_URL` in landing).
- Shared packages (no app imports any of them yet — `grep "@homi/"` over the apps finds nothing):
  - `@homi/config` — locales `ru`/`uz`/`en`, default `ru`; currencies `UZS`/`USD`, default `UZS`; display time zone;
    `apiVersion` `v1` (`frontend/packages/config/src/index.ts:6-21`).
  - `@homi/types` — envelope and page-pagination types (`frontend/packages/types/src/index.ts:7-40`).
  - `@homi/api-client` — `createApiClient` (fetch, bearer token, `Accept-Language`, envelope unwrapping, `ApiError`)
    (`frontend/packages/api-client/src/index.ts:10-117`).
  - `@homi/utils` — `formatPrice(minor, currency, locale)`, `formatDateTime` in `Asia/Tashkent`, `intlLocale`
    (`uz` → `uz-Latn-UZ`) (`frontend/packages/utils/src/index.ts:7-38`).
  - `@homi/ui` — `cn()` only (`frontend/packages/ui/src/index.ts:10`).
- No test runner in the Next apps (T8 gate).

### 1.12 Tests and CI gates

- 47 Pest cases: request id 4, envelope 5, exception rendering 8, media API 13, uploader 7, variants job 5, private
  media 3, example tests 2 (`backend/tests/Feature/**`, `backend/tests/Unit/ExampleTest.php`). Nothing covers
  intake, Telegram, auth, listings or any legacy contract. Dusk has one example browser test (`backend/tests/Browser`).
- Tests run on in-memory SQLite with Pulse and Telescope off (`backend/phpunit.xml:25-33`); PostgreSQL-specific SQL is
  not exercised.
- CI (`.github/workflows/`): `backend.yml` — `composer setup` against a `postgres:18` service, then `composer ci:check`
  (Vite+ check, `tsc`, Pint `--test`, PHPStan level 7, Pest) and the package-registry check (`:30-78`);
  `frontend.yml` — `pnpm install --frozen-lockfile`, `pnpm -r lint`, `typecheck`, `build`; `tooling.yml` — agent hook
  tests. Workflows run on PRs and `main` only, filtered by paths.
- Local gates: `make ci-backend`, `make ci-frontend`, `make dev-check`, `make ai-hooks-test` (`Makefile`).

### 1.13 Development plan (`HANDOFF.md` §4, T0–T11) and its gates

| Task | Content | Gate | State | Relevance to the migration |
| ---- | ------- | ---- | ----- | -------------------------- |
| T0 | Onboard, verify the environment | — | done (PR #7) | — |
| T1 | Telegram webhook pipeline (secret check, `insertOrIgnore` dedup, `telegram` queue, client, `telegram:webhook` command, prune) | live check needs an HTTPS tunnel tool → approval | open | reused as the bot's entry; must add PII redaction (CF-019) and the legacy cut-over rules (CF-009) |
| T2 | Intake accept layer `/api/v1/intake/*` | — | open | the ingestion entry for every option in CF-007; taxonomy changes (CF-016) |
| T3 | OpenAPI export + CI drift check | — | open | v1 only; the legacy contract needs its own spec (CF-020) |
| T4 | Close Phase 3; ADR-0014 "media stack and Scramble" | — | open | ADR-0014 is the natural place for listing-photo rules (CF-012) |
| T5 | Generated TypeScript client | generator = new npm dependency → approval | open | new clients only |
| T6 | Telegram sign-in `POST /api/v1/auth/telegram` | — | open | shares the `initData` verifier with the legacy `tma` guard (CF-002) |
| T7 | Domain modules: Geo → Listings → dedup → pricing → radar → ARM → AI tagging | OPQ-1…5, PostGIS, AI vendor | open | carries almost every gap in §2.3 |
| T8 | Frontend foundation | test runner = new npm dependency → approval | open | Mini App strategy (CF-011) decides its shape |
| T9 | Guard rails for Codex | first developer (Phase 4 D6) | open | — |
| T10 | Technical protection of `main` | new tools need approval | open | — |
| T11 | Remaining Phase 4–7 items | each item gated by the first developer | open | — |

Order: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 / T8; T9–T11 between features (`HANDOFF.md:38`, `:62-109`). The plan
predates the migration: it has no legacy compatibility surface, no data migration and no cut-over work.

### 1.14 HOMI open product questions and what the legacy material answers

Source of the questions: `docs/architecture/requirements.md:41-47`.

| OPQ | Question | What the legacy material says | Answered? |
| --- | -------- | ----------------------------- | --------- |
| OPQ-1 | Dedup rules and confidence thresholds | One flat = one card across channels and reposts; signals: photos, text, rooms, floor, district, price; the API returns the surviving listing for a merged id; the card lists the other sources (BR-API-047, BR-API-048; `$KVADRO_ROOT/docs/about.md:156`, `:177`). Thresholds, survivor choice and reversibility are unknown (Q-API-019). `telegram.uz` has its own provisional weights (`docs/api/intake-sources.md:16`) | **Partly** — behaviour yes, thresholds no |
| OPQ-2 | "Below market": median window and minimum sample | District (or city) × rooms, last 60 days, recomputed hourly, at least 8 listings, at most 3 per channel, outliers below $50 or above $20 000 per month dropped; "near" comparison = 12 nearest with the same rooms within 5 km (sale: 15 nearest, per m²), district if fewer than 8; a difference under 10 % is "на уровне обычной цены"; tones `good`/`check`/`suspicious`/`same`/`mixed`/`no_repair` (`$KVADRO_ROOT/docs/seo-pages.md:263-287`; BR-API-057…061) | **Mostly** — window and sample size yes. The `below_median` filter threshold (Q-API-011) and the tone thresholds (Q-API-021) are unknown. HOMI's "≈20 % below" (`docs/about.md:11`) is not a legacy rule: legacy shows the measured percentage («на 20% ниже обычного…» is an example output, BR-BOT-059) |
| OPQ-3 | Cities beyond Tashkent at launch | Tashkent, Tashkent region, Andijan, Namangan, Kokand, Fergana (`$KVADRO_ROOT/docs/about.md:50`); district pages exist for Tashkent (12) and Tashkent region (5) only (`$KVADRO_ROOT/docs/seo-pages.md:65-72`) | **Yes** — parity sets the six cities as the minimum |
| OPQ-4 | ARM roles and who moderates | No admin tooling is visible (Q-SYS-004, Q-API-058). Implied operations: beta seats and invites, user blocking, author takedowns, channel opt-outs, "service news" broadcasts (BR-API-016, BR-API-043, BR-API-068, BR-API-148) | **No** — a list of operations, no roles |
| OPQ-5 | Retention of raw payloads and deleted users (incl. backups) | Public `/privacy` promises: action log 180 days without texts; withdrawn listings 90 days, then phone, text and photos erased; support links 90 days, summaries 1 year; "delete my data" immediately from the database, from backups after about two weeks, plus a PostHog person deletion (`$KVADRO_ROOT/docs/about.md:264-275`) | **Partly** — deleted users and listing PII are answered by a public promise; raw payload retention is not stated, but it cannot outlive the 90-day PII rule (CF-019) |

## 2. Conflicts and gaps between HOMI decisions and the legacy contract

### 2.1 Conflicts

"First developer" = production track owner, who reviews every shared ADR (`docs/handoff/parallel-work.md:15`).
"Development track" = second developer. ADR numbers are taken when written (`docs/handoff/parallel-work.md:50`);
0014 is already planned for the media stack (T4). ADRs are never edited after acceptance, so "amend" below means a
new ADR that supersedes the named part (`docs/architecture/decisions/README.md:3`).

| ID | HOMI decision (ref) | Legacy requirement (ref) | Why they conflict | Options | Recommended (why) | ADR | Approval |
| -- | ------------------- | ------------------------ | ----------------- | ------- | ----------------- | --- | -------- |
| CF-001 | **API prefix, envelope, errors.** `/api/v1`, `{success, data, meta}` / `{success:false, message, errors, code}`, Resources only (ADR-0007:14-18); the renderer wraps every `api/*` path (`backend/app/Http/ApiExceptionRenderer.php:46-49`) | Bare JSON at relative `/api/*` on the Mini App origin; errors `{"detail": "<string>"}`; 403 with five access reasons, 404, `409 no_chat` vs `409` limit; no empty `200`; strictly-read keys always present (`08` §1.1, §1.4–1.5; BR-API-017…021; LB-API-003, LB-API-009; `$KVADRO_ROOT/docs/about.md:380-390`, `:402`) | Different path, body shape and error key. The old client reads only a string `detail`, so HOMI errors arrive as `null`, and any `/api/*` route would be wrapped in the envelope | (A) **Legacy-compatible surface:** its own route group at `/api/*` on the Mini App host, its own `{detail}` renderer, plain serializers, contract tests from `08`; both surfaces call the same domain services; retired with the old client. (B) Make `/api/v1` legacy-shaped (drop the ADR-0007 envelope). (C) A translating proxy in front of v1 | **A** — keeps ADR-0007 for new clients and byte parity for the old one in one codebase and one test suite; B discards the contract the Next apps and collectors were designed for; C adds a deployable and duplicates validation. The renderer must skip the legacy group | New ADR "kvadro² compatibility surface" (scope, host, error dialect, sunset rule), pointing at ADR-0007 | Development track writes; first developer reviews; product owner sets the contract freeze and sunset (Q-SYS-005) |
| CF-002 | **Auth.** Sanctum bearer token issued once by `POST /api/v1/auth/telegram`; no second auth path (ADR-0003:14-19, :30-31); all v1 routes `auth:sanctum` (`backend/routes/api.php:14`) | `Authorization: tma <initData>` on every request; stateless; no token ever; `GET /api/bot` anonymous; an empty `tma ` value rejected silently; `auth_date` window unknown (TMA-007; BR-API-004…010; LB-API-019, LB-API-020; `$KVADRO_ROOT/docs/about.md:384`, `:403`) | The old client cannot call a token endpoint; a per-request `initData` check is the second credential type ADR-0003 rejected | (A) A `tma` guard (HMAC with the bot token, `auth_date` window ≥ legacy, user by Telegram id) on the legacy surface only; v1 keeps tokens and the new Mini App exchanges `initData` once (T6). (B) Accept `tma` on v1 as well. (C) Tokens only — breaks the running Mini App | **A** — the exception stays inside the legacy group; the HMAC verifier is shared with T6. Add redaction of `Authorization` in logs and Telescope, because `initData` carries personal data (LB-API-020) | Amend ADR-0003 (or a section of the compatibility ADR): `tma` accepted on legacy routes only | First developer; security-reviewer checklist |
| CF-003 | **Opaque ids.** ULID/UUID, never integers (ADR-0007:20); ULID keys in `media_files`, `source_listings`, `intake_events`; `source_listings.listing_id` is a ULID (`…171043…:24`) | Listing `id` is a JSON integer compared with `===`; integers live in `startapp=l_<id>`, `s_<source>--l<id>`, `/media/<id>/<n>.jpg`, landing pins `l_<id>-web`, bot callbacks; a merged listing answers with the survivor's id (LB-API-011; BR-API-048, BR-API-119, BR-API-120; TMA-010; `04` §6.1) | Old links and the old client need an integer for **every** listing, including listings ingested after the cut-over; `startParam.js` accepts only `^l_(\d+)` | (A) ULID key + unique integer `number` per listing (sequence above the largest legacy id; migrated listings keep their legacy id) used by legacy routes, deep links, SEO and media URLs; v1 exposes both. (B) Integer keys exposed everywhere (drop the ADR-0007 rule for listings). (C) ULID only + a `legacy_id` map for migrated rows | **A** — internals keep ADR-0007, shared links keep working; C fails for new listings in the old client. Same pattern for radars if bot callbacks embed their ids (Q-BOT-017) | Amend ADR-0007 ids clause ("public listing numbers") | First developer; product owner if links move to a new brand (CF-008) |
| CF-004 | **Page pagination.** `page[number]` / `page[size]`, `meta {page, size, total, last_page}`; cursor only after a measurement (ADR-0007:17; `ApiController.php:59-75`; `frontend/packages/types/src/index.ts:7-25`) | Feed: opaque `cursor`, `limit=20`, `next_cursor: null` is the only end signal, items de-duplicated by id; favourites and history: whole list with `next_cursor: null` (BR-API-022…024; LB-API-004; `$KVADRO_ROOT/docs/about.md:401`) | Without `next_cursor` the old client loops forever; page numbers shift while ~1 050 listings arrive per day | (A) Keyset cursor for feeds on both surfaces (`meta.next_cursor` in the v1 envelope); page numbers for ARM lists. (B) Cursor on legacy routes, pages on v1. (C) An offset hidden inside an opaque cursor | **A** — ADR-0007 already expects a cursor feed; a stable sort with an id tie-breaker serves both clients; C reproduces the drift | Amend ADR-0007 pagination clause | Development track; first developer reviews |
| CF-005 | **Currency.** Minor units in the source currency, display default UZS, daily rate table, statistics never on mixed currencies (ADR-0006:17; `frontend/packages/config/src/index.ts:10-12`; `backend/config/intake.php:25`) | USD is the storage and filter currency; UZS posts converted at the CBU rate; UZS is display only (`meta.usd_uzs`); `price` strings formatted per user currency; radar price bounds in USD; medians and sorts on USD; SEO prices only in USD (`$KVADRO_ROOT/docs/about.md:52`, `:342`; BR-API-140, BR-API-153…156; LB-API-027; `$KVADRO_ROOT/docs/seo-pages.md:42`) | Filters, sorts, medians and `below_median` need one comparable number; ADR-0006 forbids statistics on mixed values, while legacy computes everything in converted USD | (A) Keep source amount + currency and add a normalised USD amount (CBU rate) for filters, sorts and medians; radar bounds stored as typed with their currency (LB-API-027 fix), read as USD on legacy routes. (B) USD as the canonical store (legacy model). (C) Per-currency statistics only — breaks legacy filters and medians | **A** — provenance kept, legacy behaviour reproduced; statistics on normalised USD become a stated exception. Default display currency for new users (UZS vs USD) and SEO currency are product decisions; migrated users keep theirs | Amend ADR-0006 money rules (normalised USD, CBU rate source, statistics exception) | First developer; product owner (defaults) |
| CF-006 | **Locale code `uz`.** Locales `ru`, `uz`, `en` (ADR-0006:15; `frontend/packages/config/src/index.ts:6`; `uz` → `uz-Latn-UZ` in `frontend/packages/utils/src/index.ts:30-38`) | Wire code `uz_Latn` in meta, settings and the boot script; Telegram `language_code` `uz*` → `uz_Latn`; SEO prefix `/uz/` (BR-API-143, BR-API-149; LB-API-048; TMA-008; `$KVADRO_ROOT/docs/seo-pages.md:41`) | A value mismatch: `PUT /api/settings {"locale": "uz_Latn"}` must round-trip | (A) Keep `uz` inside, map `uz_Latn` ↔ `uz` at the legacy boundary. (B) Use `uz_Latn` (or BCP 47 `uz-Latn`) inside | **A** — ADR-0006 stays; the mapping is covered by contract tests | None (record the mapping in the compatibility ADR) | Development track |
| CF-007 | **Ingestion by push.** HOMI owns listings; collection does not live in this repository; collectors push to `/api/v1/intake/*`; `geo.uz` listed as the web-source collector (ADR-0009:10-14, :22-31; `docs/api/intake-sources.md:72`; `backend/database/seeders/SourceSeeder.php:16-18`) | The legacy backend reads 217 open channels itself through their public pages without subscribing, extracts fields with Gemini after masking phones and `@handles`, converts UZS at the CBU rate, geocodes, merges, copies photos; channel admins can opt out (BR-API-042…046; `$KVADRO_ROOT/docs/about.md:167-185`, `:397`; Q-API-017: list unknown) | Parity needs the same channels, freshness and fields. Under ADR-0009 HOMI may not read channels itself, and the only candidate does not deliver: per the reference-reader report (2026-11-09), `telegram.uz` reads over MTProto user sessions with an account pool and backfill (`telegram.uz:backend/app/Services/Telegram/{MadelineTelegramClient,PoolManager,BackfillCursor}.php`), parses with rules + an **Anthropic** fallback, not Gemini (`app/Services/Parsing/HybridListingParser.php`, `app/Services/Llm/AnthropicLlmClient.php`), has small district/landmark seeders, no district polygons, no medians, no metro or centre distances, **no push** — only a pull API without phones, photos or post ids (`routes/api.php:36-39`) — and its production rollout is pending (`ROADMAP.md:15`). `geo.uz` is not a housing collector at all (elmarket.uz prices, FX, news), which contradicts ADR-0009:13. Deal taxonomy differs (`sale`/`rent`/`buy`/`rent_wanted`, `backend/config/intake.php:23`, vs `rent_long`/`rent_daily`/`sale`) | (A) Keep ADR-0009: `telegram.uz` gains an outbox and push client, a payload with text, gated phones, photos and post links, the 217-channel import and a `rent_period` → `rent_long`/`rent_daily` mapping; HOMI adds geo enrichment and medians. (B) An in-repo collector (HTTP reader of public channel pages + LLM extraction) that pushes into HOMI's own intake as one more source — breaks "collection does not live here". (C) Hybrid: B for the transition, switched to `telegram.uz` once it matches B on the same channel list (shadow comparison) | Decide with the collector owner. **A** only if `telegram.uz` can push in production before the cut-over; otherwise **C**. In every option listings enter through `/api/v1/intake/*` (T2), so the Listings pipeline does not depend on the choice. The `geo.uz` premise must be corrected either way | New ADR superseding parts of ADR-0009 (collector set, `geo.uz`, in-repo collector for B/C, deal mapping); new ADR for the LLM vendor (Gemini parity vs Anthropic in `telegram.uz`) | First developer; collector owner; product owner (channel list, opt-outs) |
| CF-008 | **Domains and brand.** `homi.uz`, `app.`, `arm.`, `api.`, `cdn.`, `hook.homi.uz` + staging (ADR-0011:10-19; `docs/infrastructure/environments.md:9-16`); API on its own host with explicit CORS origins (`backend/config/cors.php:27`); product text names `@HomiAppBot` (`docs/about.md:66`, `:103`) | `kvadro.app` (landing, SEO, `/media`), `app.kvadro.app` (Mini App + same-origin `/api`, `/media`, `/tiles`, `/call`), Cloudflare; no API host; distributed links `t.me/KvadroAppBot?start=…` / `?startapp=…`, SEO URLs, `privacy.html`; web_app buttons in old messages keep `app.kvadro.app` (`08` §1.1; `$KVADRO_ROOT/docs/about.md:380-390`; `04` §6.3 item 3; Q-SYS-006, Q-BOT-011) | The old client calls relative `/api/*`, so the legacy surface must answer on the Mini App origin, not on `api.homi.uz`; old buttons and SEO equity are bound to the kvadro hosts; the brand is undecided | (A) HOMI serves the legacy hosts during the transition: vhosts `kvadro.app` / `app.kvadro.app` → Next for pages, Laravel for `/api`, `/media`, `/tiles`, `/call`; HOMI hosts in parallel; brand move later with 301s. (B) Rebrand at the cut-over with 301s — `/api` calls from the old client cannot follow a cross-origin redirect with `Authorization` without CORS, and old buttons still open the kvadro URL. (C) Legacy surface on `app.homi.uz/api/*` with the BotFather Mini App URL moved — old messages still open `app.kvadro.app` | **A** at the cut-over (no client change, the order in `$KVADRO_ROOT/docs/about.md:437-440`), brand move as a separate, planned step. Needs Q-SYS-006 answered first and the kvadro domains, DNS and TLS under the production track | New ADR "brand and domains during the migration" amending ADR-0011's host list | Product owner; first developer (DNS, TLS, nginx) |
| CF-009 | **Bot identity and cut-over.** One bot per environment from env config; three new bots exist; webhook on `hook.*` with a secret header and dedup; staging and production bots belong to the production track (`backend/config/telegram.php:17-32`; `.ai/memory/current-state.md:31`; `docs/handoff/parallel-work.md:59-62`) | The production bot is `@KvadroAppBot`; one webhook per bot, switched once; old `callback_data` grammar unknown → catch-all «Форма устарела»; per-chat command scopes persist at Telegram; sticker `file_id`s belong to the bot; Bot API 9.x features; the delivered-card log must migrate (`$KVADRO_ROOT/docs/about.md:406-440`; `04` §1, §6.3; Q-BOT-017, Q-BOT-022) | HOMI's "production bot" is a new bot: moving users to it loses their chats, old buttons and radar delivery state | (A) HOMI production bot = `@KvadroAppBot` (token handed to the production track); cut-over = one `setWebhook` to the HOMI hook host; HOMI dev and staging bots for testing; new `callback_data` with a version prefix and a catch-all for old ones. (B) A new HOMI bot; the legacy bot kept only to send users over. (C) Both bots in parallel — splits users and radars | **A** | Part of the brand ADR (CF-008); `docs/infrastructure/telegram-webhook.md` (T1) | Product owner; first developer (every production webhook change needs explicit approval, ADR-0011:22) |
| CF-010 | **SEO surfaces.** `landing` and `app` are SSR SEO/GEO/AEO surfaces with metadata, canonical/hreflang, JSON-LD incl. `RealEstateListing`, live sitemaps, **server-rendered listing pages** (ADR-0013:17); no URL scheme yet; landing = SEO pages, indices, waitlist (`docs/architecture/overview.md:34`) | 1 008 SEO pages (336 per language) under fixed slugs (`/arenda/{city}/{district}/{N}-komnatnye/`, `/uz/ijara/…`, `/en/rent/…`), trailing-slash 308, case-sensitive 404, `noindex,follow` for thin pages and sorts, sitemap with hreflang + `x-default`, CSV files `kvadro-*.csv`, `s-maxage=300`, prices only in USD, bot links `s_seo…`; rendered by the backend; **no public per-listing pages** (`$KVADRO_ROOT/docs/seo-pages.md:44-129`, `:373-377`; `$KVADRO_ROOT/docs/about.md:522-528`; BR-API-136; RES-017…RES-020) | URLs are fixed by indexed pages and shared links. Public listing pages are a surface legacy deliberately lacks (contacts only through short-lived call links, 90-day PII erase, author takedowns "from the site") | (A) Port the scheme 1:1 into `frontend/landing` (SSR/ISR from a public statistics API) with the same slugs, rules and sitemap; public listing pages only as a `PROPOSED` deviation after a privacy review. (B) A new HOMI URL scheme with a 301 map. (C) Keep the pages in Laravel (Blade) for parity | **A** — fits ADR-0013 and keeps SEO equity and `s_seo…` attribution; B loses rankings; C contradicts ADR-0002. Brand words in CSV names depend on CF-008 | New ADR "public URL scheme" (fixed slugs); amend ADR-0013 on listing pages | Product owner (SEO, listing pages); development track; first developer (caching) |
| CF-011 | **Mini App as Next SSR.** Every app runs `next start`, primary content server-rendered, `output: 'export'` is "a design error" (ADR-0013:14-19, :26); `cacheComponents` + `partialPrefetching` (`frontend/app/next.config.ts:9-10`); no `browserslist`, so Next 16.4 targets Chrome/Edge/Firefox 111+ and Safari 16.4+ (installed Next docs `frontend/app/node_modules/next/dist/docs/03-architecture/supported-browsers.md:5-12`); CSP nonces force dynamic rendering, the hash-based SRI option is experimental (`…/01-app/02-guides/content-security-policy.md:38`, `:181`, `:456-458`, `:534-538`) | A client-only SPA (data needs `initData`); stack navigation driven by Telegram's BackButton; ES5 inline boot script, stubs and watchdog allowed by CSP sha256; prefetch before React mounts; 3 s SDK wait; build target `chrome80`/`edge80`/`firefox72`/`safari13.1`; `kv-*` storage keys and DeviceStorage; version gates (`03` §0, §1.3–1.5, §1.10; TMA-001…005; `05` §4; `$KVADRO_ROOT/docs/about.md:465`, `:497-503`) | SSR adds nothing for `initData`-gated data; Next's default targets are far newer than the legacy WebViews; the boot script and CSP models differ; URL routing vs a layer stack | (A) Transition: keep the recovered legacy Mini App (`$KVADRO_ROOT/demo/app`) as the client against HOMI's legacy surface (backend first, frontend later); the HOMI Mini App later as a client-rendered route group in `frontend/app` with lowered browser targets, polyfills, a pre-hydration boot script and a chosen CSP model. (B) A separate static SPA build for the Mini App (a fourth frontend; bundler `PROPOSED`). (C) Next SSR as configured | **A**, with a spike: does a Next 16.4 client bundle run in Chrome 80 / iOS 13 Telegram WebViews (`UNVERIFIED`)? If not, B for the Mini App only. C is not viable for old WebViews | Amend ADR-0013 for the Mini App (client rendering, browser targets, CSP); B also touches ADR-0001 and ADR-0004 | First developer (hosting); development track; product owner (minimum Telegram version) |
| CF-012 | **Media storage and URLs.** Content-addressed originals, WebP variants 320/640/1024/1920, unsigned immutable public URLs on `cdn.*`, private files via 10-minute temporary URLs; `media_files` unique by (`disk`, `sha256`) (`backend/config/media.php:28-46`; `backend/app/Services/Media/MediaUrlBuilder.php:41-53`; ADR-0012:14-18) | `/media/<listing_id>/<n>.jpg` (800 px) and `.s.jpg` (480 px) JPEG on both kvadro hosts, signed `?e=&s=` with a daily expiry (midnight UTC) bound to listing + photo number; the client derives thumbnails by regex only from the relative form; `robots.txt` disallows `/media/`; photos erased 90 days after withdrawal; landing snapshots `img/snap/<id>.webp`; video is only a flag (RES-001, RES-002, RES-013; BR-API-054…056, BR-API-065; LB-API-031, LB-API-054; `$KVADRO_ROOT/docs/seo-pages.md:379-387`) | URL shape, signing, sizes and format differ. Safari decodes WebP only from version 14, while the legacy target includes `safari13.1` (behaviour in old iOS Telegram WebViews `UNVERIFIED`). A content-addressed object can be shared by several listings, which complicates the 90-day erase; unsigned public URLs outlive a withdrawal | (A) A legacy media route `/media/{number}/{n}(.s).jpg?e&s` on the legacy hosts, signed with HOMI's own key, serving JPEG 800/480 derivatives of the stored original; the legacy algorithm is unknown (Q-API-024), but legacy URLs expire within about two days, so only HOMI-issued URLs must work; v1 clients keep ADR-0012 CDN URLs; erasure removes the listing–photo link and deletes unreferenced objects. (B) CDN WebP URLs in the legacy `photos` fields — no thumbnails, risk on old iOS. (C) nginx `secure_link` in front of the CDN | **A** (C may implement A's signing if it performs better — production-track call) | ADR-0014 (planned in T4) to cover listing photos: legacy JPEG variants, signed listing-photo URLs, erasure with reference counting | First developer (CDN); development track; security review of the signing |
| CF-013 | **Three Next apps.** `landing`, `app` ("SSR + client, PWA, Telegram Mini App"), `arm` (moderation, sources, stats, users) (ADR-0001:16-21; `docs/architecture/overview.md:32-36`); web sign-in through the Login Widget and a PWA (ADR-0003:10, :16; `docs/architecture/requirements.md:20`) | Surfaces: bot, Mini App, landing + SEO + `privacy.html`; `/call/<token>` page on the Mini App origin; backend-generated `uz/` and `en/` landing pages, `stats.js` and landing data; no web login, no PWA, no visible admin (`01` §2; RES-005, RES-009…RES-014; `$KVADRO_ROOT/docs/about.md:47`; Q-SYS-004) | HOMI plans surfaces legacy does not have (web login, PWA, ARM) and has no home for some legacy surfaces (call page, generated landing assets) | (A) Mini App → `frontend/app`; landing, SEO and privacy → `frontend/landing`; call page → a minimal no-JS route on the Mini App origin (Laravel web route or a Next route); landing data → API + ISR; web login and PWA = `PROPOSED` deviations after parity; ARM built from the operations list (GAP-023). (B) One Next app for Mini App and landing | **A** — keeps ADR-0001 unchanged; a Laravel call page must be checked against ADR-0002 (it is not an Inertia page) | None for the mapping | Development track; product owner (PWA, web login, ARM scope — OPQ-4) |
| CF-014 | **No PostGIS.** Not installed; adopting it = ADR + production-track check of the shared PostgreSQL server; tests on SQLite; CI image `postgres:18` (`HANDOFF.md:101`; `.ai/agents/postgis-geo-engineer.md:17`; `backend/phpunit.xml:26-27`; `.github/workflows/backend.yml:31-32`) | PostGIS 3.5.2; lasso polygon (3–40 vertices) on feed, count, flow and map; distances to metro and centre; nearest-12/15 within 5 km for medians; `geo_radius_m`; district and block boundaries from open data (`$KVADRO_ROOT/docs/about.md:396`; BR-API-050…053, BR-API-058; `08` §1.7) | These queries need spatial types and indexes; the test setup cannot exercise them | (A) Adopt PostGIS (ADR), a PostGIS CI image (`PROPOSED`), a PostgreSQL-only Pest group. (B) Plain lat/lng, bounding boxes, point-in-polygon and haversine in PHP. (C) Delegate geo to `datahub.uz` (no API today) | **A** — B degrades polygon and nearest-neighbour queries at ~18.6 k active listings with live counts every 250 ms | New ADR "PostGIS" | First developer (the shared server `5.45.127.98` must provide the extension, ADR-0011) |
| CF-015 | **Default users table.** `name`, unique `email`, `password` NOT NULL (`backend/database/migrations/0001_01_01_000000_create_users_table.php:14-22`; `backend/app/Models/User.php:25-27`); Identity planned as users with `telegram_id`, locale, currency (`docs/architecture/overview.md:51`) | User key = Telegram user id; no name or contacts stored; three profile flags and an account-age estimate; settings `locale`, `currency`, `theme`, `city`, `quiet`, `digest`, news; acquisition source; random PostHog id; owner phone hash; access state (`$KVADRO_ROOT/docs/about.md:155`; BR-API-006, BR-API-007, BR-API-121, BR-API-126, BR-API-144…148) | The table requires email and password and has none of the legacy fields; storing names breaks the legacy privacy promise | (A) Migration: `telegram_user_id` unique, email and password nullable (staff also sign in with Telegram), a separate settings record, no names for app users. (B) A separate `telegram_users` table; `users` for staff only | **A** (decided in T6) — one tokenable model for Sanctum; names are not stored unless the privacy text changes | None (ADR-0003 covers identity); data minimisation goes into the retention ADR (CF-019) | Development track; security-reviewer |
| CF-016 | **Intake schema and taxonomy.** `sources` = collectors (`telegram_uz`, `geo_uz`, `datahub_uz`); `source_listings` per external id; deals `sale`/`rent`/`buy`/`rent_wanted`; currencies incl. `EUR`; events `created`/`updated`/`withdrawn`/`duplicate_changed`/`media_added` (`backend/database/seeders/SourceSeeder.php:16-18`; `backend/config/intake.php:20-25`) | Deals `rent_long`/`rent_daily`/`sale`; the **channel** is the unit of the median cap (≤ 3 per channel), radar hiding rules, `sources: {url, handle}`, opt-outs; a publication (channel, post, time, text, price) feeds the price history and the days/publications/channels counters; `post_deleted` (`$KVADRO_ROOT/docs/about.md:43-58`, `:155-157`; BR-API-046, BR-API-049, BR-API-057, BR-API-067; `08` §1.8) | Collector-level sources cannot express channel rules; `rent` loses long vs daily; publications and price history are not modelled; demand posts (`buy`, `rent_wanted`) have no legacy counterpart | (A) Keep `sources` as collectors; add channel and publication entities in Listings; map `rent` + `rent_period` → `rent_long`/`rent_daily`; drop demand posts at intake. (B) One `source` row per channel — breaks one token per collector (ADR-0009:26) | **A** — `intake_requests`, `intake_events` and `source_listings` are reusable as they are | Payload contract in `docs/api/intake.md` (T2); an ADR only if CF-007 supersedes ADR-0009 | Development track; collector owner |
| CF-017 | **Formatting in the clients.** API messages from `lang/{ru,uz,en}`, UI copy in the Next apps, "no server round-trip for UI copy" (ADR-0006:18); clients format money and dates (`frontend/packages/utils/src/index.ts:7-27`); no `backend/lang` | The server returns localised, pre-formatted `price`, `age`, `title`, `status_text`, `market`, `facts[].label/value`, `district_name`, map pin `label`, option labels, `relaxed[].text`; the old client has no dictionary for them and crashes on missing keys or unknown enums (BR-API-071…074, BR-API-146; LB-API-029; LB-APP-002; `03` §0 items 3–4) | The legacy surface needs server-side catalogues and byte-exact rules for three locales × two currencies (Q-API-022), which ADR-0006 places in the clients | (A) The legacy serializer formats on the server from `backend/lang` catalogues, checked by golden fixtures; v1 returns raw values. (B) v1 returns formatted strings too | **A** — but the server-side formatter is needed anyway for bot cards (`04` §3.10), so build it once and share it between the legacy surface and the bot | None (note in the compatibility ADR); ADR-0006 unchanged | Development track |
| CF-018 | **Rate limits.** `api` limiter 120/min per user or IP on every `/api` route (`backend/app/Providers/AppServiceProvider.php:59-64`) | Debounced live `count` (250 ms) and `flow` (500 ms) on each filter change; the radar tab sends three requests per radar on each entry; duplicate prefetches; fire-and-forget `/api/events`; a 429 shows a generic error; legacy limits unknown (`08` §1.6; BR-API-002; LB-API-038; Q-API-001) | A filter session or a radar tab with 10 radars (30 requests) can hit 120/min | (A) Separate limiters for the legacy surface keyed by Telegram user, budgets from measured legacy traffic, cheap endpoints separated. (B) Keep 120/min | **A** | None (configuration) | Development track |
| CF-019 | **Raw payload storage.** `telegram_updates.payload` raw `jsonb`, 14-day prune (not scheduled); `intake_events.payload` raw `jsonb` kept indefinitely, including E.164 phones behind a PII gate; OPQ-5 open; phone stored only hashed (`backend/config/telegram.php:47-48`; ADR-0009:27, :54; `docs/architecture/requirements.md:32`, `:47`) | `/privacy` promises: action log 180 days without texts; withdrawn listings 90 days, then phone, text and photos erased; deletion immediate, backups about two weeks, PostHog erase; owner phones only as a hash; geolocation never sent (`$KVADRO_ROOT/docs/about.md:264-275`; BR-API-125, BR-API-129…132; `04` §3.16) | Raw stores keep phone numbers — owner contact shares inside Telegram updates, listing phones inside intake payloads — and texts beyond the promised windows; a user deletion must reach raw updates, the delivered-card log and events | (A) Redact contact and phone fields before a Telegram update is stored (keep a hash); purge or redact PII in `intake_events` 90 days after withdrawal; schedule every prune; one deletion procedure over all tables. (B) Keep raw data and rewrite the privacy text | **A** — answers OPQ-5 with the legacy promises as the baseline | New ADR "data retention and deletion" (closes OPQ-5) | Product owner (public promise); first developer (backups); security-reviewer |
| CF-020 | **OpenAPI and generated client for `/api/v1`.** Scramble documents `api/v1` only; the TypeScript client is generated from it (ADR-0007:19; `backend/config/scramble.php:23`; T3, T5) | The legacy contract must be fixed in OpenAPI and its open questions closed before implementation; 34 methods, strict keys and status codes (`$KVADRO_ROOT/docs/about.md:404`; `08` §2; `data/api-inventory.json`) | The legacy contract is frozen and comes from `08`, not from code; mixing it into the generated v1 spec would push legacy shapes into the new clients | (A) A hand-maintained OpenAPI document for the legacy surface, built from `08`, used by contract tests and kept out of the generated client. (B) A second Scramble document for the legacy route group | **A** — the spec is the source of truth for a contract we do not own; B documents whatever the code does, which defeats parity tests | Part of the compatibility ADR | Development track |

### 2.2 Existing HOMI work: reuse or change

| Existing artefact | Verdict | What the migration needs | CF |
| ----------------- | ------- | ------------------------ | -- |
| `ApiController` envelope, `paginated()` | reuse for v1 | a cursor helper; not used by the legacy surface | CF-001, CF-004 |
| `ApiExceptionRenderer` | change | skip the legacy route group; add a `{detail}` renderer there | CF-001 |
| `AssignRequestId` | reuse | also on legacy routes; never log `Authorization` | CF-002 |
| Rate limiters | change | legacy limiters keyed by Telegram user | CF-018 |
| Media core (`HashedUploader`, `GenerateImageVariantsJob`, `MediaUrlBuilder`, `media_files`) | reuse | listing–photo link, JPEG 800/480 legacy variants, signed listing-photo route, erasure with reference counting | CF-012 |
| `/api/v1/media*` endpoints | reuse | not used by the legacy client; useful for ARM and collectors | — |
| `telegram_updates`, `config/telegram.php`, webhook stubs | reuse (T1 completes them) | PII redaction before storage, a scheduled prune, a host-constraint decision; `allowed_updates` already includes `message`, `callback_query`, `my_chat_member` | CF-009, CF-019 |
| `sources`, `source_listings`, `intake_requests`, `intake_events`, `SourceSeeder` | reuse | channel and publication entities, deal-type mapping, corrected collector list (`geo_uz`), PII retention | CF-007, CF-016, CF-019 |
| Horizon supervisors | reuse | sizing for radar fan-out and digests on `notifications` (shares a supervisor with `default`), Telegram send-rate limits, scheduled jobs | GAP-010, GAP-022 |
| `users`, `personal_access_tokens` | change | Telegram identity, nullable email and password, settings | CF-015 |
| Scramble / T3 export | reuse for v1 | a separate legacy spec | CF-020 |
| `@homi/config` | reuse | stays `ru`/`uz`/`en`; the `uz_Latn` mapping is backend-only | CF-006 |
| `@homi/types`, `@homi/api-client` | reuse for new clients | not used by the legacy Mini App | — |
| `@homi/utils` | reuse | must agree with the server-side legacy formatter | CF-017 |
| Next apps (blank) | replace contents | per the chosen options | CF-010, CF-011, CF-013 |
| CI (`postgres:18`, SQLite tests) | change | PostGIS image (`PROPOSED`), PostgreSQL-only test group, legacy contract tests | CF-014, GAP-025 |
| Local nginx vhosts (`infra/local/nginx`) | change | local aliases for the legacy hosts to test same-origin `/api` | CF-008 |

### 2.3 Gaps (legacy capabilities with no HOMI home yet)

"HOMI home" names the module from `docs/architecture/overview.md:49-60` that would own the capability.

| ID | Legacy capability | Legacy evidence | HOMI today | Proposed home | Blocked by |
| -- | ----------------- | --------------- | ---------- | ------------- | ---------- |
| GAP-001 | Reading the 217 legacy channels (list unknown), freshness within minutes, channel opt-outs | BR-API-042, BR-API-043; Q-API-017 | nothing; ADR-0009 puts collection outside | `telegram.uz` or an in-repo collector (CF-007) | owner's channel list; CF-007 decision |
| GAP-002 | LLM extraction of listing fields with phone and `@handle` masking before the LLM | BR-API-044…046 | `laravel/ai` installed, no vendor; `telegram.uz` uses Anthropic, not Gemini (reference-reader report, 2026-11-09) | AI (or the collector) | AI vendor; CF-007 |
| GAP-003 | Free-text and voice query parsing into radar filters | `04` §3.9; BR-API-075 | nothing | AI + Radar | AI vendor |
| GAP-004 | On-demand translation of a listing, cached | API-010; BR-API-070; Q-API-025 | nothing | AI | AI vendor |
| GAP-005 | Duplicate merge, survivor redirect, «ещё N» sources, price history and counters | BR-API-047…049 | `source_listings.listing_id` placeholder only | Intake/Listings (dedup) | OPQ-1; Q-API-019 |
| GAP-006 | Gazetteer and geo enrichment: six cities, districts, zones `center`/`near_center`, 45 quarters, 35 metro stations, landmarks, ЖК, `geo_radius_m`, metro and centre distances, open-data boundaries | BR-API-050…053; `$KVADRO_ROOT/docs/seo-pages.md:65-129` | nothing; `telegram.uz` has small district/landmark seeders, no polygons, no distances (reference-reader report, 2026-11-09) | Geo | PostGIS (CF-014); gazetteer source (Q-API-020) |
| GAP-007 | Medians and market comparison (hourly district medians, nearest-12/15, tones), `below_median`, rent index, sale prices, CSV exports | BR-API-057…064, BR-API-139 | nothing; no collector computes medians | Pricing & Stats | OPQ-2 thresholds (Q-API-011, Q-API-021) |
| GAP-008 | Daily CBU USD/UZS rate (`usd_uzs`) | BR-API-140; Q-API-054 | ADR-0006 rate table "source decided later" | Pricing & Stats | CF-005 |
| GAP-009 | Search endpoints feed, count, flow, map with the 25-key filter model, polygon, sorts, clusters | API-004…API-007; `08` §1.7 | nothing | Listings (search) | PostGIS; CF-004 |
| GAP-010 | Radars: subscriptions, matching, instant and digest delivery, quiet hours in `Asia/Tashkent`, limit 10, `409 no_chat`, relax options, starter counts, delivered-card log, «Объявление снято» edits | `02` §9; `04` §3.4–3.12, §5 | `notifications` queue only | Radar & Notifications + Bot | outbound behaviour `UNVERIFIED` (`04` §11 finding 2) |
| GAP-011 | Bot conversation layer: 10 commands, wizard state with TTL, listing cards, callback router with versioned `callback_data` and a legacy catch-all, localised commands and descriptions, stickers | `04` §2–§7 | webhook stub | Bot | Q-BOT-017; T1 |
| GAP-012 | Personal lists and feedback: favourites, history, hidden listings, blocked authors, votes (rented, agent), reports, «Нашли жильё?» survey | API-011…API-016, API-026…API-033; `02` §10–11 | no tables | Listings + Identity | — |
| GAP-013 | Bootstrap and settings: `GET /api/meta` (profile, cities, presets, tiles, analytics, limits), `PUT /api/settings`, `GET /api/bot`, `GET /api/cities` | API-001…API-003, API-024, API-025 | nothing | Identity + Geo | CF-015 |
| GAP-014 | Map tiles: PMTiles or `/tiles` with `Range` and CORS; OSM fallback | RES-003, RES-004; Q-API-053 | nothing | Geo + CDN | production track |
| GAP-015 | Call page `/call/<token>` (signed, ~10 minutes), `call_url`, `contact_url`, phone formatting | RES-005; API-009; BR-API-112…116 | nothing | Listings + a web route on the Mini App origin | CF-013; Q-API-042 |
| GAP-016 | Sharing through prepared inline messages | API-017; BR-API-117, BR-API-118 | nothing | Bot | Q-API-044 |
| GAP-017 | Owner verification `/owner` (contact share, phone hash) | `02` §12; `04` §3.15 | nothing | Identity + Bot | hash scheme for migration (Q-BOT-042) |
| GAP-018 | Analytics and action log: `POST /api/events` (204), 180-day log, PostHog EU (key and host via meta, random distinct id), `stats.js`, CSP report endpoint | API-034; RES-006, RES-014, RES-015; BR-API-122…128 | Pulse/Telescope only; **no module** in `overview.md`; NFR-06 open | new Analytics module (or Identity) | PostHog account (NFR-06); Q-API-046 |
| GAP-019 | Privacy deletion and retention jobs: immediate deletion, backups ~2 weeks, PostHog person deletion, 90-day PII purge, 180-day log purge | `02` §16, §18 | nothing | Identity + Listings + ops | OPQ-5 (CF-019) |
| GAP-020 | Closed-beta access modes `private`/`invite`/`full`/`blocked`/`join`, owner list, invite links, seat limit, 403 reasons | BR-API-011…016 | Pennant installed; FR-13 says only "waitlist" (`docs/architecture/requirements.md:21`) | Identity | Q-API-006 |
| GAP-021 | Landing and SEO data: `live.json`, `pins-rent.json`, `pins-sale.json`, `img/snap/*.webp`, uz/en landing pages, `sitemap.xml`, `robots.txt` | RES-009…RES-013, RES-017…RES-020; BR-API-133…139 | nothing | landing + Pricing & Stats | CF-010 |
| GAP-022 | Scheduled work: hourly medians, digests, quiet-hours flush, rate refresh, purges, landing data, `telegram_updates` prune, `sanctum:prune-expired` | `02` §18 | no scheduled task (`backend/routes/console.php:6-8`) | each module + `routes/console.php` | — |
| GAP-023 | Operations: author takedowns, channel opt-outs, service-news broadcasts with throttling, user blocking, beta seats and invites, report and vote moderation | BR-API-043, BR-API-068; Q-API-058 | nothing | Admin (ARM API) + `frontend/arm` | OPQ-4 |
| GAP-024 | Data migration from the legacy database: users and settings, radars (incl. `zone` → `zones`), favourites, history, hidden, votes, owner hashes, attribution, delivered-card log, PostHog id map, listing ids | `$KVADRO_ROOT/docs/about.md:425-432`; Q-SYS-002 | nothing | `14-data-migration-plan.md` + import commands | legacy schema and data (Q-SYS-002) |
| GAP-025 | Legacy contract and parity testing: contract tests per `API-NNN`, golden fixtures (Q-API-022), legacy Mini App parity runs against HOMI | `$KVADRO_ROOT/demo/app/tools/parity`; `08` §2 "Tests" | 47 tests, none for listings; no Next test runner | `15-testing-strategy.md`; backend tests | T8 gate (test runner) |
| GAP-026 | Support bot `@KvadroSupportBot` (support chats, takedown requests, Gemini summaries) | Q-SYS-003; BR-API-130 | nothing | Bot (second bot) or out of scope | product owner |
| GAP-027 | Collector-side work if CF-007 option A is chosen: push client and outbox, phones/photos/post ids in the payload, the 217-channel import, ЖК normalisation, production confirmation of `telegram.uz` | reference-reader report, 2026-11-09 (`telegram.uz:routes/api.php:36-39`, `ROADMAP.md:15`); `docs/api/intake-sources.md:29-35` | outside this repository | `telegram.uz` | collector owner |

### 2.4 The conflicts that change the plan most

1. **CF-001 + CF-002 + CF-003 — a legacy compatibility surface is a new, first-class workstream.** `HANDOFF.md` §4 has
   no task for it, yet the cut-over order (backend first, old Mini App unchanged) depends on it: `/api/*` with
   `{detail}` errors, a `tma` guard, integer listing numbers.
2. **CF-007 — ingestion.** The push model has no working pusher: `telegram.uz` does not push, uses another LLM and is
   not confirmed in production, and `geo.uz` is not a housing collector. The listing pipeline is the critical path, and
   this decision is the first one needed.
3. **CF-008 + CF-009 — brand, domains and bot identity.** Keeping `@KvadroAppBot` and the kvadro hosts during the
   transition decides nginx, TLS, CORS, the same-origin `/api` and the production-track scope (Q-SYS-006).
4. **CF-011 — the Mini App cannot simply be an SSR Next app.** It decides T8, the CSP model and the browser targets,
   and possibly a fourth frontend build.
5. **CF-005 + CF-014 — money and geo foundations.** A normalised USD amount and PostGIS are prerequisites for filters,
   sorts, medians and the map; both need shared-ADR changes and a production-track check.

## 3. Decisions per conflict

Every decision in this part is `PROPOSED`. It names the option the architecture recommends; it binds only after the
ADR or approval in its row exists. Conventions:

- **DEV candidate** marks an observable change of legacy behaviour. `09-feature-parity-matrix.md` does not exist yet,
  so its owner assigns the `DEV-NNN` numbers; each candidate cites the `LB-…` item or rule that motivates it.
- **ADR proposal** gives a title only. Numbers are taken when the ADR is written (`docs/handoff/parallel-work.md:50`);
  0014 stays reserved for T4. Accepted ADRs are never edited, so "amends" means a new ADR that supersedes the named
  clause (`docs/architecture/decisions/README.md:3`).
- **Stages** `S0`…`S6` are the release stages of [`18-release-and-rollback.md`](18-release-and-rollback.md) §2:
  S1 = HOMI backend serving the unchanged legacy clients on staging, S2 = production cut-over (data, webhook, DNS),
  S4 = new HOMI frontends, S5 = sunset of the legacy surface, S6 = optional brand move.
- "Developer" = development track, "first developer" = production track (`docs/handoff/parallel-work.md`). Decisions
  that need people are collected as `DEC-NN` in §8.

### 3.1 Summary

| CF | Decision (PROPOSED) | ADR proposal | Decided by | Blocks |
| -- | ------------------- | ------------ | ---------- | ------ |
| CF-001 | A — a separate legacy compatibility surface on the legacy hosts, `{detail}` errors, retired after S5 | "kvadro² compatibility surface" (amends ADR-0007 scope) | developer writes; first developer reviews; product owner sets freeze and sunset (DEC-01) | every `API-NNN`; S1 |
| CF-002 | A — `tma` guard on the legacy surface only; one `initData` verifier shared with T6 | same ADR, section "second credential" (amends ADR-0003 scope) | first developer; security review | S1 |
| CF-003 | A — ULID key + public integer `number` (listings, radars, blocked-author entries) | "Public listing numbers and keyset cursors" (amends ADR-0007 ids and pagination clauses) | first developer (DEC-11) | schema (KV-DB-004), S1 |
| CF-004 | A — keyset cursor for feeds on both surfaces; pages for ARM lists | same ADR as CF-003 | first developer | Search |
| CF-005 | A — source amount + currency kept, normalised USD amount for filters, sorts and medians | "Money normalisation and the CBU rate" (amends ADR-0006) | first developer; product owner for defaults (DEC-10) | Listings, Pricing, Radar |
| CF-006 | A — `uz` inside, `uz_Latn` only at the legacy and bot boundary | none (recorded in the compatibility ADR) | developer | — |
| CF-007 | C — an isolated HOMI channel reader for the transition, `telegram.uz` once it matches it in a shadow run; parsing in HOMI for every source | "Listing acquisition after the migration" (supersedes parts of ADR-0009); "LLM provider and data-processing rules" | first developer; collector owner; product owner (DEC-02, DEC-03) | Listings pipeline, R2, S2 |
| CF-008 | A — HOMI serves `kvadro.app` and `app.kvadro.app` from S2; HOMI hosts run in parallel; brand move is a separate stage (S6) | "Brand, domains and bot identity during the migration" (amends ADR-0011) | product owner; first developer (DEC-04, DEC-15, DEC-16) | S2 |
| CF-009 | A — `@KvadroAppBot` becomes HOMI's production bot; one `setWebhook` at S2 with token rotation; staging bot for rehearsals | same ADR as CF-008 | product owner; first developer (DEC-05, DEC-17) | S2 |
| CF-010 | A — the legacy URL scheme 1:1 in `frontend/landing`; no public listing pages until a privacy review | "Public URL scheme for landing and SEO" (amends ADR-0013 on listing pages) | product owner; developer; first developer (caching) (DEC-14) | S2 (SEO pages), S4 |
| CF-011 | Transition: the original legacy Mini App build, unchanged. New Mini App: decided by data (Q-APP-001) and a spike — Next client route group (A) if the floor allows it, a Vite SPA in the workspace (B) otherwise | "Mini App rendering, browser floor and CSP" (amends ADR-0013; B also touches ADR-0001, ADR-0004) | product owner (floor); developer; first developer (hosting) (DEC-06, DEC-07, DEC-08) | S4 only — not S2 |
| CF-012 | A — signed legacy `/media` route serving JPEG 800/480 from private storage; listing photos never on unsigned immutable URLs | ADR-0014 (T4) extended to listing photos and media ownership | first developer (CDN); developer; security review | S1 |
| CF-013 | A — Mini App → `frontend/app`; landing and SEO → `frontend/landing`; call page = Laravel no-JS route; ARM from the operations list | none | developer; product owner (PWA, web login, ARM scope) | — |
| CF-014 | A — adopt PostGIS; PostGIS CI image; PostgreSQL-only test group | "PostGIS" | first developer (DEC-09) | Geo, Search, Pricing, data migration |
| CF-015 | A — extend `users` with `telegram_user_id`; email and password nullable; settings in their own table | none (ADR-0003 covers identity) | developer; security review | Identity |
| CF-016 | A — `sources` stay collectors; channels and publications in Listings; `rent` + `rent_period` | intake payload contract (T2); part of the CF-007 ADR | developer; collector owner | Intake, Listings |
| CF-017 | A — one server-side display formatter (`backend/lang`), shared by the legacy surface and the bot | none (note in the compatibility ADR) | developer | Legacy surface, bot cards |
| CF-018 | A — limiters per route class keyed by Telegram user (SEC-REQ-027) | none | developer | Legacy surface |
| CF-019 | A — redact before storing, schedule every purge, one deletion procedure | "Data retention and deletion" (closes OPQ-5) | product owner; first developer (backups); security review (DEC-12) | T1 completion, S2 |
| CF-020 | A — a hand-maintained OpenAPI document for the legacy surface, kept out of the generated client | part of the compatibility ADR | developer | contract tests |

### 3.2 CF-001 — legacy compatibility surface

- **Decision.** A route group in `routes/legacy.php`, prefix `/api`, served only on the legacy hosts (production
  `app.kvadro.app`; local and staging aliases in `17` §3) and refused elsewhere by a host middleware. It has its own
  middleware group (request id, `tma` guard, access gate, legacy limiters, `Cache-Control: private, no-store`), its own
  form requests, plain serializers and a `{detail}` exception renderer (§4.7). Non-API resources of the same origin
  (`/media`, `/call`, `/api/bot`, `/api/csp-report`) belong to the same surface.
- **Reasoning.** ADR-0007 stays intact for every new client and for the collectors; the old client gets byte-level
  parity; both surfaces call the same application services (§4.5), so behaviour is fixed once.
- **Alternatives.** B (reshape `/api/v1` to the legacy dialect) throws away the contract the Next apps and the intake
  API were designed for. C (a translating proxy) adds a deployable, duplicates validation and still needs every
  legacy rule.
- **Consequences.** The existing renderer (`backend/app/Http/ApiExceptionRenderer.php:46-49`) wraps every `api/*`
  path, so the legacy check must run first. An architecture test forbids `App\Http\Controllers\Legacy` from being
  used by `Api\V1` and vice versa. The surface is removed at S5, after the legacy Mini App is gone.
- **Sunset rule (proposal, DEC-01).** Retire the surface when the new Mini App has served 100 % of launches for
  30 days **and** legacy `/api/*` traffic stays below 0.5 % of Mini App sessions for 14 consecutive days.
- **Legacy behaviour changes.** None intended. The legacy `422` body was an array that the client already reads as
  `null` (`08` §1.5); a string `detail` gives the same UI. The status for a bad or expired `initData` is unknown in
  legacy (Q-API-003); HOMI answers `401` (SEC-REQ-005) — a DEV candidate only if the measured legacy status differs.
- **ADR proposal:** "kvadro² compatibility surface" — scope, hosts, error dialect, `tma` credential, `uz_Latn`
  mapping, server-side formatting, legacy OpenAPI document, artefact hosting, sunset rule.

### 3.3 CF-002 — `tma` credential on the legacy surface

- **Decision.** A request guard reads `Authorization: tma <initData>` on legacy routes only, verifies it with the one
  verifier of SEC-REQ-001 (shared with T6), applies the `auth_date` window `TELEGRAM_INITDATA_MAX_AGE` (86 400 s until
  Q-API-002 is measured, never shorter than the measured legacy window — SEC-REQ-002), and resolves or creates the user
  by Telegram id without name, username or photo (CF-015). v1 keeps Sanctum tokens; the new Mini App exchanges
  `initData` once per launch (SEC-REQ-004, SEC-REQ-007). v1 and ARM routes answer `401` to `tma`.
- **Reasoning.** The exception to ADR-0003 stays inside a group that is deleted at S5; one verifier means one place
  to get the HMAC right.
- **Alternatives.** B (`tma` on v1 too) spreads a PII-bearing per-request credential to new clients; C (tokens only)
  breaks the running Mini App.
- **Consequences.** `Authorization` is redacted in logs, Telescope and exception reports (SEC-REQ-047); the token
  rotation at S2 invalidates every open `initData` (SEC-REQ-012), so the cut-over plan expects a short `401` spike.
- **Legacy behaviour changes.** DEV candidate only if the measured legacy window is shorter than HOMI's: none
  otherwise.
- **ADR proposal:** section of the compatibility ADR ("second credential, legacy routes only").

### 3.4 CF-003 — public listing numbers

- **Decision.** Domain tables keep ULID primary keys (ADR-0007; `source_listings.listing_id` is already a ULID). Every
  listing has `number bigint unique not null`: migrated listings keep the legacy id, new ones draw from a sequence
  started above the legacy maximum plus a gap (`14` §3). Merged listings keep their number in `listing_aliases`, and
  the API answers with the survivor (BR-API-048). Radars and blocked-author entries get the same pattern because
  their ids may sit in old `callback_data` (Q-BOT-017) and in open Mini App sessions. Legacy routes, deep links, SEO,
  landing data and media paths use `number`; v1 exposes both `id` and `number`.
- **Reasoning.** Old links and the old client need an integer for every listing, including listings created after
  the cut-over; internals keep ADR-0007.
- **Alternatives.** B (integer keys everywhere) reverses ADR-0007 for the busiest table; C (ULID + a legacy id map)
  leaves new listings without an integer, which `startParam.js` rejects (`^l_(\d+)`).
- **Consequences.** One resolver (`ListingNumber` → listing, through aliases) used by every adapter. Sequential
  numbers make enumeration easy; that is already true in legacy and is contained by quotas (SEC-REQ-028), not by
  hiding numbers that are public.
- **Legacy behaviour changes.** None.
- **ADR proposal:** "Public listing numbers and keyset cursors" (amends the ids clause of ADR-0007).

### 3.5 CF-004 — cursor pagination

- **Decision.** One keyset cursor for feeds (sort key + `number` tie-breaker, base64url, validated on input) on both
  surfaces: legacy `{items, next_cursor}` with `null` as the only end signal; v1 envelope with `meta.next_cursor` and
  `links.next`. Page numbers stay for ARM lists. The legacy favourites and history lists stay whole-list responses with
  `next_cursor: null`; v1 paginates them (fixes LB-API-024 for new clients).
- **Reasoning.** ADR-0007 already expects a cursor feed; ~1 050 new listings a day make page numbers drift.
- **Alternatives.** B (cursor on legacy only) gives new clients the drift; C (offset inside a cursor) reproduces it.
- **Consequences.** Feed indexes must match each sort (partial index per `(city, deal, rent_period, sort key,
  number)`, `06` §4.2). A cap on history length is a product decision (LB-DATA-010) and a DEV candidate if adopted.
- **ADR proposal:** the CF-003 ADR (pagination clause).

### 3.6 CF-005 — money

- **Decision.** Listings keep the source amount and currency (ADR-0006) **and** `price_usd_cents`, normalised once at
  ingestion with the CBU rate of that day; the rate row id is stored, so a later rate does not move old prices. Filters,
  sorts, medians, `below_median` and SEO prices use the normalised USD amount — a stated exception to "statistics never
  on mixed values". Radar price bounds are stored as the user typed them, with their currency (fixes LB-API-027); the
  legacy surface reads and writes them in USD. Display currency: migrated users keep theirs; the default for new users
  (ADR-0006 says UZS, legacy behaviour is USD-first) and the currency of SEO pages are product decisions (DEC-10).
- **Reasoning.** Legacy filters and medians need one comparable number; keeping the source amount preserves
  provenance and allows per-currency statistics later.
- **Alternatives.** B (USD as the stored price) loses the source amount; C (per-currency statistics only) breaks
  legacy filters and medians.
- **Consequences.** A daily rate job with alerting when the rate is older than two days; conversion rules for
  `price_kind: down_payment`; whether legacy converted at ingestion or daily is unknown (Q-API-054) — if legacy
  re-converted daily, HOMI's frozen conversion is a DEV candidate.
- **ADR proposal:** "Money normalisation and the CBU rate" (amends ADR-0006 money rules).

### 3.7 CF-006 — locale code

- **Decision.** `uz` stays the internal code (ADR-0006). A `LocaleCode` value object maps `uz_Latn` ↔ `uz` at the legacy
  boundary (meta, settings, events) and maps Telegram `language_code` `uz*` → `uz`, `en*` → `en`, otherwise `ru`
  (BR-API-149). The SEO prefix `/uz/` is unchanged.
- **Consequences.** Contract tests round-trip `PUT /api/settings {"locale":"uz_Latn"}`. No legacy behaviour change.
- **ADR proposal:** none; recorded in the compatibility ADR.

### 3.8 CF-007 — where listings come from

**The problem in one line.** ADR-0009 lets HOMI accept pushed listings only, and nobody pushes: `telegram.uz` has a
pull API without phones, photos or post ids, parses with Anthropic, and is not confirmed in production; `geo.uz` is not
a housing collector (part 2, CF-007 row). The legacy system read 217 public channels through their public web pages
without subscribing and extracted fields with Gemini after masking phones and handles (`$KVADRO_ROOT/docs/about.md`
§5.1, §8.3).

**Options.**

| Option | What it is | For | Against |
| ------ | ---------- | --- | ------- |
| A. `telegram.uz` pushes (ADR-0009 as written) | `telegram.uz` gains an outbox and push client, a payload with text, gated phones, photos and post ids, the 217-channel import, `rent_period` (GAP-027) | Keeps ADR-0009; MTProto pool and backfill exist; one team-wide collector | Not in production; no push today; work outside this repository on another roadmap; MTProto user accounts can be limited or banned; parser differs from legacy (Anthropic) |
| B. In-repo channel reader | A HOMI module reads public channel pages over HTTP on a schedule (the legacy method), fetches photos, and hands posts to HOMI's intake as source `homi_channels` | Exactly the legacy acquisition method; no Telegram accounts; under the team's control; no cross-repo dependency on the critical path | Contradicts "collection does not live in this repository" (ADR-0009 context); HTML scraping breaks when Telegram changes the page; one more scheduled workload |
| C. Hybrid (B now, A later) | B for the transition; a shadow run compares `telegram.uz` with B on the same channel list; switch the active source when it matches | Unblocks the critical path; keeps ADR-0009's direction | Two code paths for a while |
| D. Sibling collector service | B's code in its own repository and deployable, pushing over `/api/v1/intake/*` | Keeps the letter of ADR-0009 | A second CI, deploy and on-call surface for ~200 lines of reader code |

**Where parsing happens (all options).** HOMI's Parsing module extracts fields from the raw post text for every
source, with phone and `@handle` masking before the LLM (SEC-REQ-042). Collectors may send parsed fields; Parsing
treats them as hints. Reasons: HOMI needs the same LLM stack for free-text radar queries and translations
(GAP-003, GAP-004); one masking path; one parser to benchmark against the legacy output.

**Data needed to decide.**

1. The 217-channel list with handles, cities and opt-outs (Q-API-017) — from the legacy owner.
2. Legacy freshness: median minutes from a channel post to a listing (NFR-02 says "within minutes"); measurable from
   migrated publications (`published_at` vs `first_seen_at`).
3. A dated commitment from the `telegram.uz` owner for push, payload fields and production (GAP-027).
4. A reachability test of public channel pages from the production web host (rate limits, blocks) — production
   track, read-only `GET`s, no accounts.
5. A golden set for parsing: migrated listings give (post text → legacy-extracted fields) pairs once the legacy
   database is available (Q-SYS-002); it scores any parser on accuracy, cost and latency.
6. The legal basis for copying third-party photos and phones from public channels (Q-SEC-007).

**Recommendation: C**, with B written as an isolated module (`App\Collectors\…`) that may call only the Intake
application service — the same entry an external collector reaches over HTTP — never Listings models, enforced by an
architecture test. Switching to `telegram.uz` (A) then means activating another source, not changing the pipeline.
If the first developer prefers to keep collection out of this repository, D is the same design in a sibling
repository. Corrections needed in every option: remove the `geo.uz` premise from the collector list
(`backend/database/seeders/SourceSeeder.php:16-18`, ADR-0009:13) and map `rent` + `rent_period` to `rent_long` /
`rent_daily` (CF-016).

**LLM vendor (sub-decision, DEC-03).** Default to **Gemini** for parity: the public privacy text names Google Gemini
as the processor (`$KVADRO_ROOT/docs/about.md` §5.11), so another vendor needs a privacy-text change and a legal check
of cross-border processing (Q-SEC-006). `laravel/ai` keeps the provider a configuration value; the golden-set benchmark
decides if Gemini loses clearly on accuracy or cost. `telegram.uz`'s Anthropic parser is compared in the same
benchmark if A is pursued.

- **Legacy behaviour changes.** None intended (same channels, same freshness target). Systematic extraction
  differences found by the benchmark become DEV candidates.
- **ADR proposals:** "Listing acquisition after the migration" (supersedes ADR-0009's collector set, the `geo.uz`
  line, "collection does not live here" for B/C, adds raw-post intake and the deal mapping); "LLM provider and
  data-processing rules" (vendor, masking, quotas, audit, retention of prompts and outputs — SEC-REQ-042…044).

### 3.9 CF-008 and CF-009 — brand, domains and bot identity

**Facts that fix the shape of any answer.** The old Mini App calls relative `/api/*`, so the legacy surface must
answer on the Mini App origin. Old bot messages keep the `web_app` URL they were sent with (`04` §6.3 item 3).
`t.me/KvadroAppBot?start=…` and `?startapp=…` links cannot be redirected (`03b` §6.1). `initData` is signed with the
token of the bot that opened the Mini App, and one bot has one webhook (`$KVADRO_ROOT/docs/about.md` §8.4). The token
holder can mint `initData` for any user (SEC-022).

**Options.**

| Option | Domains | Bot | Result |
| ------ | ------- | --- | ------ |
| A. HOMI serves the legacy hosts during the transition | `kvadro.app` and `app.kvadro.app` point to HOMI at S2; `homi.uz` hosts run in parallel and are not user-facing yet | `@KvadroAppBot` becomes HOMI's production bot (token rotated at the switch) | No client change; every old link, button and SEO URL keeps working; brand decided separately |
| B. Rebrand at the cut-over | `kvadro.app` 301 → `homi.uz` | a new bot, old bot as a forwarder | Old Mini App `/api` calls cannot follow a cross-origin redirect with `Authorization`; old `web_app` buttons open the old host; users must move to a new chat and lose radar state |
| C. Legacy surface on `app.homi.uz`, Mini App URL moved in BotFather | — | `@KvadroAppBot` | Old messages still open `app.kvadro.app`; needs the kvadro host anyway |

**Data needed.** Q-SYS-006 (brand and domains after the migration); Q-SEC-001 (who holds the bot in BotFather, the
token, the `kvadro.app` registrar, DNS and Cloudflare accounts, and whether they will be transferred); whether
BotFather ownership transfer is available for the account (to verify); Search Console access and data (94 of ~450
pages indexed, `03b` §0 item 8); legal: does the operator of the personal-data base change (Q-SEC-005).

**Recommendation: A for both.**

- HOMI's production stack serves `kvadro.app` (legacy landing mirror, SEO pages, landing data, CSV, sitemap,
  `/media`) and `app.kvadro.app` (legacy Mini App artefacts, legacy `/api`, `/media`, `/call`) from S2. `api.homi.uz`,
  `hook.homi.uz`, `cdn.homi.uz` and `arm.homi.uz` run in parallel; `homi.uz` and `app.homi.uz` stay unpublished until
  the brand decision.
- `@KvadroAppBot` is the production bot. Its webhook points to `https://hook.homi.uz/telegram/webhook` (the webhook
  host does not have to carry the brand). The token is revoked and reissued at the switch (SEC-REQ-012) and lives only
  in the production vault. The dev bots (one per developer) and the staging bot are used for everything before S2; the
  existing HOMI "production" bot stays unused until the brand decision (or becomes a forwarder at S6).
- The brand move is S6: path-for-path `301` for every `kvadro.app` URL for ≥ 12 months with Search Console change of
  address; `app.kvadro.app` keeps serving (or redirecting, behaviour inside Telegram WebViews to be tested) because old
  `web_app` buttons point at it; the bot username stays unless the product owner accepts breaking every `t.me` link.
- **Legacy behaviour changes.** None at S2. Users notice one reload (token rotation) and the maintenance window.
- **ADR proposal:** "Brand, domains and bot identity during the migration" (amends ADR-0011's host list: legacy hosts
  served by HOMI; the production bot is `@KvadroAppBot`; webhook on `hook.homi.uz`). Approval: product owner and first
  developer; every production webhook change needs explicit approval (ADR-0011:22).

### 3.10 CF-010 — public URL scheme and SEO

- **Decision.** The legacy scheme moves 1:1 into `frontend/landing`: same slugs per language, trailing-slash `308`,
  case-sensitive `404` (localised, `noindex,follow`), thin pages `200` + `noindex,follow`, sorts `noindex`, sitemap
  with hreflang and `x-default`, CSV paths and columns, `s_seo…` bot links, `s-maxage=300` caching, USD prices (until
  DEC-10 says otherwise). Pages are statically generated and revalidated every 300 s from a public statistics API (§5.13).
  The legacy landing (`/`, `/uz/`, `/en/`, `/privacy.html`) is served from the original files until S4 (§5.1).
  Public per-listing pages stay off: they would be a DEV candidate after a privacy review (contacts only through
  short-lived call links, 90-day erase, takedowns).
- **Alternatives.** B (new URL scheme with a 301 map) loses rankings for no gain; C (Blade pages in Laravel) contradicts
  ADR-0002's "backend as an API" direction.
- **Consequences.** The SEO pages have no legacy artefact to serve: they are on the S2 critical path unless the
  contingency in `18` §5.3 (HOMI proxies SEO paths to the legacy origin for a short read-only period) is accepted.
- **ADR proposal:** "Public URL scheme for landing and SEO" (fixed slugs, redirect policy if the domain changes) and an
  amendment of ADR-0013 (no per-listing pages until approved).

### 3.11 CF-011 — Mini App rendering, browser floor and CSP

**Two different questions.** (1) What runs in Telegram from S2 until S4: the legacy Mini App, unchanged — this is not
in doubt. (2) What the HOMI Mini App is built with: this is the real decision, and it is **not on the S2 critical
path**.

**Facts.**

- Next.js 16.4 supports Chrome/Edge/Firefox 111+ and Safari 16.4+ by default and accepts a `browserslist` override;
  it injects only `fetch`, `URL` and `Object.assign` polyfills, and custom polyfills go into
  `instrumentation-client.ts`, which runs before the app becomes interactive
  (`frontend/app/node_modules/next/dist/docs/03-architecture/supported-browsers.md:6-21`, `:23-33`, `:35-45`;
  `…/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`). Whether the Next 16.4 and React 19 client
  runtime actually runs on Chrome 80 or Safari 13.1 after lowering `browserslist` is **`UNVERIFIED`**.
- The legacy build target `chrome80 / edge80 / firefox72 / safari13.1` was inferred from bundle syntax and is itself
  `UNVERIFIED` (Q-APP-001; `03` §1.10).
- Nonces need dynamic rendering, because a nonce is applied during server rendering
  (`…/01-app/02-guides/content-security-policy.md:38`, `:181`); hash-based SRI keeps static generation but is
  experimental and covers build-time scripts only (`…/content-security-policy.md:456-458`, `:534-538`).
- `output: 'export'` drops Proxy, headers, rewrites and default image optimisation
  (`…/01-app/02-guides/static-exports.md:278-295`), and ADR-0013 calls it a design error.
- The legacy Mini App boots with two inline ES5 scripts allowed by sha256, waits up to 3 s for the SDK, prefetches
  `/api/meta` and the first feed page before React mounts, and has no URL router (TMA-001…005; `03` §1.2–1.5).
- In Telegram, iOS clients use the system WKWebView (so the Safari version follows the iOS version) and Android
  clients use the updatable Android System WebView; desktop and web clients use their host engines. This is general
  platform knowledge, **`UNVERIFIED`** for this audience until measured.

**Options for the HOMI Mini App.**

| Option | Browser floor | Boot / CSP | Navigation | Toolchain and ADR impact | Verdict |
| ------ | ------------- | ---------- | ---------- | ------------------------ | ------- |
| A. Client-rendered route group in `frontend/app` (own root layout, `'use client'` shell) | Next default floor; lower only if the spike passes; polyfills in `instrumentation-client.ts` | ES5 boot script inline in the group's root layout with the request nonce; `telegram-web-app.js` with `beforeInteractive`; nonce CSP from `proxy.ts`, dynamic rendering acceptable (per-user, no SEO) | In-memory layer stack driving `BackButton`, as legacy | One framework for all three apps; ADR-0013 amended for the group | **Recommended if the data allows the Next floor (or a lowered floor proven by the spike)** |
| B. Static SPA (Vite + React 19) as a fourth workspace app | Proven by legacy (Vite `build.target`) | Static `index.html`, hash CSP computed at build, like legacy | Same as A | New app type and a Vite dependency (approval); ADR-0001, ADR-0004, ADR-0013 amended; static hosting, no Node process | **Fallback if the floor must stay at Chrome 80 / Safari 13.1 and A fails the spike** |
| C. Next SSR as configured | Next default | Nonces, dynamic rendering of data that needs `initData` anyway | URL router | none | Rejected: SSR adds nothing for `initData`-gated data |
| D. Next `output: 'export'` | as A | No Proxy or headers from Next; hashes per page at deploy | as A | Contradicts ADR-0013 | Rejected: A gets the same with fewer exceptions |
| E. Keep the recovered legacy Mini App as the long-term client | legacy | legacy | legacy | Decompiled, untyped code from another repository | Rejected: transition client only (`$KVADRO_ROOT/docs/about.md` §10) |

**Data needed.**

1. **Telegram client and WebView distribution** (Q-APP-001): from the legacy PostHog project and the action log,
   30 days of Mini App sessions grouped by `platform`, Telegram `WebApp.version` and browser engine version
   (`app_launch` carries `platform`; PostHog records browser and OS versions). Output: the share of sessions below
   Chrome 111 / Safari 16.4, and below Chrome 87 / Safari 14.
2. **The minimum Telegram version the product supports** (product owner): today the boot screen asks very old clients
   to update (SCR-001).
3. **Spike result** (developer, 2–3 days, no dependency changes): a minimal Next 16.4 client route group with a
   lowered `browserslist`, the boot script and a nonce CSP, run in an Android emulator with an old WebView, iOS
   simulators for the lowest iOS versions found in item 1, and Telegram Desktop; record whether it boots, the JS size
   and time to first feed render.
4. **Legacy startup baseline**: p50/p75 of `app_launch.ms` from PostHog, to set the budget in §5.12.

**Decision rule (proposal).** If sessions below the Next default floor are under the threshold the product owner sets
(suggested 1 % of weekly active users), choose A with the default floor and show the legacy-style "update Telegram"
screen to older clients — a DEV candidate, because some users who work today would be told to update. Otherwise, if
the spike runs A on the measured floor, choose A with lowered targets. Otherwise choose B.

- **Transition client (decided here).** S1–S3 serve the **original production artefacts** of the legacy Mini App,
  byte-identical, with a SHA-256 manifest, rather than a rebuild from the decompiled sources (Q-SEC-015): the
  CSP hashes and behaviour then match what users run today. The manifest must list every lazy chunk (map, PostHog,
  PMTiles, `maplibre-gl.mjs`); missing files are fetched from production before the freeze.
- **CSP.** Legacy Mini App: a header computed from the exact served `index.html` (SEC-REQ-030). HOMI Mini App:
  nonce + `'strict-dynamic'` plus `'self'` and the SDK host as the fallback for browsers that ignore
  `'strict-dynamic'` (SEC-REQ-031; old-engine behaviour checked in the spike). Landing and SEO: §5.13 and DEC-08.
- **ADR proposal:** "Mini App rendering, browser floor and CSP" (amends ADR-0013 for the Mini App route group or, with
  B, adds the fourth app and amends ADR-0001/ADR-0004).

### 3.12 CF-012 — media for listing photos

- **Decision.** A legacy route family `/media/{number}/{n}.jpg` and `.s.jpg` with `e` and `s` on both legacy hosts:
  Laravel checks the HMAC (SEC-REQ-024: `s` over number, `n`, `e`, per-environment key, previous key accepted during
  rotation, `e` at most 48 h ahead), checks the listing status on every request, and returns `X-Accel-Redirect` to an
  internal nginx location that reads the JPEG 800/480 rendition from private storage; `Cache-Control: public,
  max-age=86400`, `ETag`, one uniform `404` for any failure. Third-party listing photos are stored in the private
  bucket and never get unsigned immutable public URLs (SEC-029, SEC-REQ-025). v1 clients use the same signed family with
  the WebP variants. User uploads (ARM, future features) keep ADR-0012 behaviour. Erasure deletes the listing–photo
  link, unreferenced objects and renditions, and asks the edge to purge.
- **Reasoning.** HOMI issues its own signatures: legacy URLs expire within about two days, so only HOMI-issued URLs
  must work after the first two days (Q-API-024 stays open but stops mattering). JPEG keeps old iOS WebViews safe until
  Q-APP-001 says otherwise.
- **Alternatives.** B (CDN WebP URLs in legacy fields) loses thumbnails (`src/lib/images.js:9-14` derives them only
  from the relative form) and risks old iOS; C (nginx `secure_link`) cannot check listing status per request — it may
  implement the signature check in front of Laravel if load requires it (production-track call).
- **Consequences.** Media gains listing photos, renditions and reference counting; ADR-0012's "public immutable" rule
  is narrowed to first-party content.
- **Legacy behaviour changes.** Legacy answered `422` without `e`/`s`; HOMI answers `404` (fixes LB-API-023) — the
  client shows a placeholder either way, so no DEV entry is needed.
- **ADR:** ADR-0014 (T4) covers listing photos, legacy renditions, signed listing-photo URLs, erasure with reference
  counting, and the ownership fix of §7.

### 3.13 CF-013 — surfaces and apps

- **Decision.** Mini App → `frontend/app` (CF-011 decides how); landing, SEO and privacy → `frontend/landing`; the call
  page `/call/<token>` → a Laravel web route on the Mini App origin returning a minimal no-JS HTML page (it needs the
  signing key and a database lookup, and must send `default-src 'none'`; it is not an Inertia page, so ADR-0002 is
  respected); landing data and CSV → backend jobs writing files served by nginx; ARM → `frontend/arm`, scoped by the
  operations list of GAP-023. Web login and a PWA are DEV candidates after parity (product owner).
- **ADR proposal:** none; the compatibility ADR records the call page.

### 3.14 CF-014 — PostGIS

- **Decision.** Adopt PostGIS: `geography(Point, 4326)` with GiST for listing locations, `geometry(MultiPolygon,
  4326)` for districts and quarters, `geography(Polygon, 4326)` for radar areas; `ST_DWithin` and KNN (`<->`) for
  nearest-12/15 medians and metro/centre distances. CI uses a PostGIS image (`PROPOSED`); tests that need PostgreSQL run
  in a `pgsql` Pest group against it, while the rest of the suite stays on SQLite.
- **Consequences.** `CREATE EXTENSION postgis` on the shared server `5.45.127.98` needs a privileged role — a
  production-track action with a compatibility check against the other products on that server.
- **ADR proposal:** "PostGIS" (extension, column conventions, test strategy).

### 3.15 CF-015 — users

- **Decision.** Extend `users`: `telegram_user_id bigint unique not null` for app users, `email` and `password`
  nullable (staff sign in with Telegram too), no name, username or photo stored; settings, access, attribution and
  analytics id in their own tables or columns (`06` §4.2). One tokenable model for Sanctum.
- **Legacy behaviour changes.** None. **ADR:** none.

### 3.16 CF-016 — intake schema and taxonomy

- **Decision.** `sources` stay collectors; Listings owns `source_channels` (with opt-outs) and `listing_publications`
  (channel, post id, time, text, price) feeding price history and the days/publications/channels counters. The intake
  payload carries `channel`, `post_id`, `posted_at`, raw text and `rent_period`; `rent` + `rent_period` map to
  `rent_long` / `rent_daily`. Demand posts (`buy`, `rent_wanted`) are accepted and stored raw but never published —
  legacy has no counterpart. A `kvadro_legacy` source with the lowest trust weight carries migrated listings (`14` §2.1).
- **ADR:** the payload contract in `docs/api/intake.md` (T2); the CF-007 ADR covers the source set.

### 3.17 CF-017 — server-side formatting

- **Decision.** One display formatter in the backend (`backend/lang/{ru,uz,en}` catalogues, currency and locale
  rules) produces the legacy pre-formatted strings (`price`, `age`, `title`, `status_text`, `market`, `facts`, map
  `label`, option labels, `relaxed[].text`) and the bot card texts; golden fixtures per locale × currency
  (Q-API-022) gate it. v1 returns raw values and the clients format with `@homi/utils`; a shared fixture set keeps both
  formatters in agreement.
- **Legacy behaviour changes.** Fixes inside the formatter (for example the 1-million UZS boundary,
  `$KVADRO_ROOT/docs/about.md` §10) are DEV candidates when the output text changes.

### 3.18 CF-018 — rate limits

- **Decision.** Limiters per route class from SEC-REQ-027, keyed by Telegram user on the legacy surface and in the bot,
  by actor on v1, by IP on anonymous routes, by bot + IP on the webhook; legacy `429 {"detail":"rate_limited"}` with
  `Retry-After`. Starting values are `PROPOSED` and tuned from measured legacy traffic; a recorded 30-request radar-tab
  burst must pass.
- **Consequences.** The client IP is derived through a trusted-proxy list matching the real edge (nginx, Cloudflare
  if kept) — a production-track input.

### 3.19 CF-019 — retention and deletion

- **Decision.** Contact and phone fields of Telegram updates are redacted before the update is stored (a keyed hash is
  kept), the payload is encrypted at rest, and the subscription list drops `edited_message` and `chat_member`
  (SEC-030, SEC-REQ-037). Intake raw payloads lose PII 90 days after withdrawal. Every purge is scheduled (§4.11).
  One deletion procedure covers users, radars, personal lists, delivered-card log, action log, raw updates,
  tokens and the PostHog person (SEC-REQ-039). Backups follow the "about two weeks" promise (production track).
- **ADR proposal:** "Data retention and deletion" — answers OPQ-5 with the legacy promises as the baseline.

### 3.20 CF-020 — contract document for the legacy surface

- **Decision.** A hand-maintained OpenAPI 3.1 document for the legacy surface (proposed path
  `docs/api/kvadro-legacy.openapi.yaml`), built from `08` and frozen at the contract freeze. Contract tests validate
  every legacy response against it; it never feeds the generated TypeScript client. Scramble keeps documenting
  `api/v1` only (`backend/config/scramble.php:23`).
- **Consequences.** A response validator for Pest is a new dependency (`PROPOSED`, DEC-23).

## 4. Backend architecture

### 4.1 Principles

1. **One Laravel application, modules as namespaces** (`docs/architecture/overview.md:47`). No microservices; the
   only optional extra deployable is the channel reader if CF-007 option D is chosen.
2. **Adapters over shared application services.** Four adapters reach the domain: the legacy surface
   (`/api/*` on legacy hosts), `/api/v1` (new clients, collectors), the Telegram bot (update handlers), and ARM
   (`/api/v1/admin/*`). Business rules live once, in application services and domain objects; adapters only translate
   input and output (`04` §10: "separate adapters over shared domain services").
3. **The legacy surface is an adapter, nothing more.** It owns routes, the `tma` guard, form requests, serializers, the
   display formatter calls and the `{detail}` renderer. It owns no tables and is deleted at S5.
4. **Follow the existing code layout.** The Media module already uses Laravel's standard folders with a module
   segment (`app/Http/Controllers/Api/V1/Media`, `app/Services/Media`, `app/Jobs/Media`; models flat in `app/Models`).
   New modules do the same so `php artisan make:* --no-interaction` keeps working; Pest `arch()` tests enforce the
   dependency rules of §4.2.
5. **Everything personal is owner-scoped by construction** (SEC-REQ-014): per-user records are loaded through the
   owner relation, never loaded and checked afterwards.

### 4.2 Module map

"Tables" use the `PROPOSED` names of `06` §4.2. "Depends on" lists allowed direct calls; anything else goes through
events (§4.12).

| Module (namespace segment) | Owns | Main application services | Depends on | Legacy items served | GAPs |
| -------------------------- | ---- | ------------------------- | ---------- | ------------------- | ---- |
| **Identity** | `users` (extended), `user_settings`, `user_attributions`, `users.analytics_distinct_id`, `personal_access_tokens` | `TelegramInitDataVerifier`, `UserResolver`, `SettingsService`, `TokenExchange` (T6) | — | API-001 (profile part), API-024, API-025; `/start` attribution (BOT-027…034) | GAP-013, part of GAP-017 |
| **Access** | `access_grants`, `beta_invites`; mode and owner list in config / Pennant | `AccessGate` (middleware + bot guard), `InviteService` | Identity | `403` reasons on API-001 and gated routes (BR-API-011…016) | GAP-020 |
| **LegacyApi** (adapter) | no tables | controllers, form requests, serializers, `{detail}` renderer, legacy limiters | every application service | API-001…API-034, RES-001, RES-002, RES-005, RES-015 | GAP-013 (transport), GAP-015 (web route), GAP-025 (contract tests) |
| **Telegram** (bot adapter + client) | `telegram_updates`, bot conversation state (Redis), `users.bot_commands_locale` | `BotApiClient`, `UpdateRouter`, command handlers, wizard conversations, `CallbackCodec` (versioned + legacy catch-all), `BotProfileSync` (commands, descriptions, menu button) | Identity, Access, application services of Radar, Listings, Engagement, Privacy | BOT-001…BOT-084, BTN-…, RES-022 | GAP-011, GAP-016, part of GAP-017; GAP-026 if the support bot is in scope |
| **Intake** (exists, schema only) | `sources`, `source_listings`, `intake_requests`, `intake_events` | `IntakeAcceptService` (T2), `IntakeEventApplier` | Listings | — | entry for GAP-001, GAP-027 |
| **Collectors** (CF-007 B/C only) | `collector_cursors` (last post id per channel) | `PublicChannelReader`, `PostPhotoFetcher` | Intake **only** | — | GAP-001 |
| **Parsing** (AI) | `listing_translations`, LLM call audit (`llm_calls`) | `ListingExtractor`, `QueryParser` (text, voice), `TranslationService`, `PiiMasker` | Geo (dictionaries for normalisation) | API-010; BOT free text and voice (`04` §3.9) | GAP-002, GAP-003, GAP-004 |
| **Geo** | `cities`, `districts`, `city_zones`, `quarters`, `metro_stations`, `places`, `pois`, `dictionary_code_aliases`, tiles config | `Gazetteer`, `GeoResolver`, `DistanceCalculator`, `PolygonFilter` | — | API-002, `meta.cities`, `meta.tiles`, RES-003 (configuration) | GAP-006, GAP-014 |
| **Listings** | `listings`, `listing_aliases`, `source_channels`, `listing_publications`, `listing_price_events`, `listing_authors`, `listing_photos`, `listing_status_events`, `takedown_requests` | `ListingIngestService` (normalise → geo → dedup → publish), `ListingSearchService` (feed, count, map), `ListingDetailsService`, `ContactDisclosure` (quota), `CallLinkService`, `ListingNumberResolver` | Geo, Media, Parsing, Pricing (read) | API-004, API-005, API-007, API-008, API-009, RES-005 | GAP-009, GAP-015 |
| **Matching** (dedup) | match candidates, merge log, review queue | `DuplicateMatcher`, `MergeService` (survivor + alias), `UnmergeService` | Listings | merged-id redirect (BR-API-048), «ещё N» sources | GAP-005 |
| **Pricing** | `exchange_rates`, `market_medians`, `listing_market`, `price_index_points`, `price_presets`, `salary_references` | `RateService`, `MedianService`, `MarketComparison`, `IndexService`, `CsvExportService` | Listings, Geo | `meta.usd_uzs`, `median_*` fields, presets, RES-018 | GAP-007, GAP-008 |
| **Engagement** (personal lists and feedback) | `favorites`, `listing_views`, `hidden_listings`, `blocked_authors`, `listing_votes`, `found_answers`, `owner_verifications` | `PersonalListService`, `VoteService`, `FoundSurveyService`, `OwnerVerificationService` | Listings, Identity | API-011…API-016, API-026…API-033; `/owner` | GAP-012, GAP-017 |
| **Radar** | `radars`, `radar_hide_rules` | `RadarService` (create, update, patch, delete, relax; limit; dedup hash), `RadarMatcher`, `FlowEstimator` | Listings, Geo, Pricing, Identity | API-006, API-018…API-023; wizard `/new`, `/subs` | GAP-010 (matching) |
| **Delivery** | `radar_deliveries`, `bot_listing_messages`, `radar_pending_items`, `broadcasts`, `broadcast_recipients` | `DeliveryPlanner` (instant, quiet hours, digests), `CardSender`, `CardEditor` («Объявление снято»), `BroadcastService`, `TelegramPacer` | Telegram (client), Radar, Listings, Identity | BOT-062, BOT-069, BOT-081…BOT-084 | GAP-010 (delivery), part of GAP-023 |
| **Media** (exists) | `media_files`, ownership references (§7) | `HashedUploader`, `GenerateImageVariantsJob`, `MediaUrlBuilder`, new `ListingPhotoStore`, `LegacyRenditions`, `SignedPhotoUrl` | — | RES-001, RES-002, RES-013 (pipeline) | CF-012 |
| **PublicData** (landing and SEO data) | `seo_slices` (materialised) | `LandingDataBuilder` (`live.json`, `pins-*.json`, snapshots), `SeoSliceService`, `SitemapData` | Listings, Pricing, Geo, Media | RES-010…RES-013, RES-017…RES-019 (data) | GAP-021 |
| **Analytics** | `user_action_log` (monthly partitions), CSP report counters | `EventIngest` (`/api/events`), `ServerEvents` (PostHog capture), `PersonEraser` (PostHog deletion) | Identity | API-034, RES-006 (configuration), RES-014, RES-015 | GAP-018 |
| **Privacy** | `erasure_requests` | `ErasureService` (one procedure over every table), `RetentionPurger`, `PiiRedactor` (updates, intake payloads) | every module through listeners | `/privacy` (BOT), «Удалить мои данные» | GAP-019 |
| **Admin** (ARM API) | admin roles, audit log | moderation, takedowns, channel opt-outs, broadcasts, user blocking, invites, vote review | all read-side + module write services | — | GAP-023 |
| **Migration** (temporary) | `legacy_id_map`, `migration_runs`, `migration_run_steps`, `migration_changes` (separate import database for raw data) | import commands, validation suite | writes every module's tables through their services or bulk upserts | — | GAP-024 |

Cross-cutting: the scheduler (GAP-022, §4.11) and the test suites (GAP-025, §4.18). The full GAP → module list is §4.19.

Dependency rules enforced by `arch()` tests: domain modules never import `App\Http\…`, `App\Telegram\Handlers\…` or
another module's controllers; `Collectors` imports only `Intake`; nothing imports `Migration` except its commands;
`LegacyApi` is imported by nothing.

### 4.3 Code layout

| Kind | Location (existing pattern) | Example |
| ---- | --------------------------- | ------- |
| Models | `app/Models` (flat, as `MediaFile`, `TelegramUpdate`) | `Listing`, `Radar`, `UserSetting` |
| Enums | `app/Enums/<Module>` | `Listings\Deal`, `Listings\RentPeriod`, `Radar\RadarMode`, `Access\AccessState` |
| Value objects | `app/Domain/<Module>` (plain readonly classes, `make:class`) | `Radar\SearchFilters`, `Pricing\UsdAmount`, `Listings\ListingNumber`, `Identity\LocaleCode` |
| Application services and actions | `app/Services/<Module>`, `app/Actions/<Module>` | `Services\Radar\RadarService`, `Actions\Privacy\EraseUser` |
| Jobs | `app/Jobs/<Module>` | `Jobs\Delivery\SendRadarCard` |
| Events and listeners | `app/Events/<Module>`, `app/Listeners/<Module>` | `Events\Listings\ListingWithdrawn` |
| v1 HTTP | `app/Http/Controllers/Api/V1/<Module>`, `app/Http/Requests/Api/V1/<Module>`, `app/Http/Resources/Api/V1/<Module>` | as Media |
| Legacy HTTP | `app/Http/Controllers/Legacy`, `app/Http/Requests/Legacy`, `app/Http/Serializers/Legacy`, `routes/legacy.php` | `Legacy\FeedController` |
| Bot | `app/Telegram/{Client,Updates,Handlers,Conversations,Keyboards,Callbacks}` | `Telegram\Handlers\StartCommand` |
| Collectors | `app/Collectors/TelegramChannels` | `PublicChannelReader` |
| Display strings | `backend/lang/{ru,uz,en}` (does not exist yet) | `lang/ru/listing.php` |

### 4.4 Domain layer

- **Value objects.** `SearchFilters` — the canonical 25-key filter (`08` §1.7) with one normaliser and validator
  shared by the legacy surface, v1 and the bot (SEC-REQ-017), a canonical hash without `posted_days` for radar
  de-duplication, and `toLegacyArray()` that always emits all 25 keys; `UsdAmount` / `Money`; `ListingNumber`;
  `LocaleCode` (`fromLegacy('uz_Latn')`, `fromTelegram('uz-…')`); `QuietWindow` and `DigestSchedule` (wall-clock
  `Asia/Tashkent`); `CallbackPayload` (versioned, ≤ 64 bytes).
- **Enums** with TitleCase keys: `Deal` (`RentLong`, `RentDaily`, `Sale`), `PropertyType`, `OwnerFilter`,
  `AccessState` (`Private`, `Invite`, `Full`, `Blocked`, `Join`, `Granted`), `RadarMode`, `MedianTone`, `ReportReason`,
  `ListingStatus`, `NearbyKind`.
- **Rules that must live in exactly one place:** radar limit (`max_subscriptions`, default 10, BR-API-076) checked
  under a per-user lock; `409 no_chat` checked before any write (BR-API-003, `$KVADRO_ROOT/docs/about.md` §7); relax
  options and flow estimation; access-gate decisions; contact-disclosure quota (SEC-REQ-028); median scope selection
  (near 12/15 within 5 km, district if fewer than 8 — OPQ-2 row in §1.14); listing status transitions and the
  90-day PII clock.

### 4.5 Application services shared by the adapters

| Service | Legacy surface | v1 | Bot | ARM | Notes |
| ------- | :------------: | :-: | :-: | :-: | ----- |
| `MetaService::forUser` | API-001 | `GET /api/v1/me/bootstrap` | `/start` | — | profile, cities, presets, tiles, analytics config, limits |
| `ListingSearchService` | API-004, API-005, API-007 | feed, count, map | starter lists | listing search | keyset cursor; count cached 30 s per normalised filter hash |
| `ListingDetailsService` | API-008 | listing details | card rendering | moderation view | alias resolution, view history, contact quota |
| `CallLinkService` | API-009, RES-005 | call link | — | — | signed token, TTL 10 min + skew (SEC-REQ-026) |
| `RadarService` | API-018…API-023, API-006 | radars | wizard, `/subs` | — | idempotent create by filter hash; limit under lock |
| `PersonalListService`, `VoteService`, `FoundSurveyService` | API-011…API-016, API-026…API-033 | lists | card buttons, `/fav`, poll | vote review | upserts per (user, listing[, reason]) |
| `SettingsService` | API-024, API-025 | settings | `/settings` | — | one profile record; `*_chosen` derived (LB-API-018) |
| `ShareService` | API-017 | share | — | — | prepared inline message cached per user × listing × locale |
| `TranslationService` | API-010 | translate | — | — | cache per listing × locale; quota |
| `QueryParser` | — | (later) | free text, voice | — | LLM; masking |
| `OwnerVerificationService` | `owner_verified` flags | — | `/owner` | — | contact must be the sender's own |
| `ErasureService` | — | delete account (later) | «Удалить мои данные» | user erase | one procedure (SEC-REQ-039) |
| `EventIngest` | API-034 | events | bot actions | — | 204; whitelisted props |

### 4.6 API architecture

| Aspect | Legacy surface | `/api/v1` |
| ------ | -------------- | --------- |
| Hosts | legacy hosts only (`app.kvadro.app`, `kvadro.app` for `/media` and `/api/csp-report`; aliases per environment, `17` §3) | `api.*` |
| Prefix | `/api/*` (no version) + `/media`, `/call` | `/api/v1` |
| Registration | `routes/legacy.php` added in `bootstrap/app.php` `withRouting(then: …)`; a host middleware refuses other hosts with `404 {"detail":"Not Found"}` | `routes/api.php` (exists) |
| Auth | `tma` guard (CF-002); `GET /api/bot`, `/media`, `/call`, `/api/csp-report` anonymous | Sanctum bearer, abilities (ADR-0003) |
| Errors | `{"detail": "<string>"}` (§4.7) | envelope (ADR-0007), `code` added |
| Pagination | `next_cursor` | `meta.next_cursor` for feeds, page numbers elsewhere |
| Ids | integer `number` as `id` | ULID `id` + `number` |
| Strings | server-formatted (CF-017) | raw values |
| Locale codes | `uz_Latn` | `uz` |
| Contract | `docs/api/kvadro-legacy.openapi.yaml` (hand-written, CF-020) | Scramble export (T3) |
| Caching | `Cache-Control: private, no-store` on every response | same for personal data |
| CORS | none (same origin; excluded from `config/cors.php` paths) | explicit origins |
| Lifetime | until S5 | permanent |

**Endpoint mapping** (`08` §2–§3). Controllers live in `App\Http\Controllers\Legacy`; limiter names refer to
SEC-REQ-027.

| Method and path | ID | Controller | Service (module) | Limiter | Notes |
| --------------- | -- | ---------- | ---------------- | ------- | ----- |
| `GET /api/meta` | API-001 | `MetaController` | `MetaService` (Identity, Access, Geo, Pricing) | meta 30/min | the only place that returns the five `403` reasons |
| `GET /api/cities` | API-002 | `CityController` | `Gazetteer` + `MarketComparison` stats (Geo, Pricing) | reads | cached per locale |
| `GET /api/bot` | API-003 | `BotInfoController` | config (Telegram) | IP 60/min | ignores `Authorization` |
| `GET /api/feed` | API-004 | `FeedController@index` | `ListingSearchService::page` (Listings) | reads | keyset cursor; never an empty `200` |
| `GET /api/feed/count` | API-005 | `FeedController@count` | `ListingSearchService::count` | reads | debounced client; short cache |
| `GET /api/feed/flow` | API-006 | `FeedController@flow` | `FlowEstimator` (Radar) | reads | relax options with `rate` |
| `GET /api/map` | API-007 | `MapController` | `ListingSearchService::mapPoints` | reads | labels from numbers only (SEC-REQ-018) |
| `GET /api/listings/:id` | API-008 | `ListingController@show` | `ListingDetailsService` | 120/min + quota | alias redirect; `404` for foreign/unknown alike |
| `GET /api/listings/:id/call` | API-009 | `ListingContactController` | `CallLinkService` | 30/h + quota | — |
| `POST /api/listings/:id/translate` | API-010 | `TranslationController` | `TranslationService` (Parsing) | 30/h | must answer inside the client's 15 s; cache hits free |
| `POST /api/listings/:id/favorite` | API-011 | `FavoriteController` | `PersonalListService::toggleFavorite` | lists 60/min | serialised per (user, listing) |
| `POST`, `DELETE /api/listings/:id/hide` | API-012, API-013 | `HiddenListingController` | `PersonalListService` | lists | upsert / delete |
| `POST`, `DELETE /api/listings/:id/block-author` | API-014, API-015 | `BlockedAuthorController` | `PersonalListService` | lists | entry `number` (CF-003) |
| `POST /api/listings/:id/report` | API-016 | `ReportController` | `VoteService` (Engagement) | 30/day | one row per (user, listing, reason) |
| `POST /api/listings/:id/share` | API-017 | `ShareController` | `ShareService` (Telegram) | 20/h | outbound Bot API call, cached |
| `GET /api/subscriptions` | API-018 | `SubscriptionController@index` | `RadarService` | reads | filters with all 25 keys |
| `POST /api/subscriptions` | API-019 | `SubscriptionController@store` | `RadarService::create` | radar 30/min | `no_chat` first, limit under lock |
| `PUT /api/subscriptions/:id` | API-020 | `SubscriptionController@update` | `RadarService::update` | radar | owner-scoped by `number` |
| `PATCH /api/subscriptions/:id` | API-021 | `SubscriptionController@patch` | `RadarService::patch` | radar | `active`, `mode`, `unhide` |
| `DELETE /api/subscriptions/:id` | API-022 | `SubscriptionController@destroy` | `RadarService::delete` | radar | — |
| `POST /api/subscriptions/:id/relax` | API-023 | `SubscriptionController@relax` | `RadarService::relax` | radar | — |
| `GET`, `PUT /api/settings` | API-024, API-025 | `SettingsController` | `SettingsService` (Identity) | reads / radar | `uz_Latn` mapping |
| `GET /api/hidden`, `DELETE /api/hidden/:id`, `DELETE /api/hidden` | API-026…API-028 | `HiddenController` | `PersonalListService` | reads / lists | — |
| `GET /api/favorites`, `GET /api/history`, `DELETE /api/history` | API-029…API-031 | `SavedController` | `PersonalListService` | reads / lists | whole list, `next_cursor: null` |
| `POST /api/found`, `POST /api/found/where` | API-032, API-033 | `FoundController` | `FoundSurveyService` | lists | — |
| `POST /api/events` | API-034 | `EventController` | `EventIngest` (Analytics) | 60/min | `204`; empty `tma` → `401`, logged at `info` only |
| `GET /media/{number}/{n}(.s).jpg` | RES-001, RES-002 | `LegacyMediaController` | `SignedPhotoUrl`, `ListingPhotoStore` (Media) | IP 1 200/min | `X-Accel-Redirect` to nginx |
| `meta.tiles` URL | RES-003 | — (static on `cdn.*`) | Geo configuration | — | PMTiles with `Range`, CORS (`17` §7) |
| `GET /call/{token}` | RES-005 | `CallPageController` (web, no JS) | `CallLinkService` | IP 30/min | `default-src 'none'`, `no-store` |
| Mini App shell | RES-008 | nginx static (legacy artefacts) | — | — | CSP from the artefact manifest |
| landing, `stats.js` | RES-009, RES-014 | nginx static (legacy mirror) until S4 | — | — | — |
| landing data, snapshots | RES-010…RES-013 | nginx static, written by `LandingDataBuilder` | PublicData, Media | — | same paths and shapes |
| `POST /api/csp-report` | RES-015 | `CspReportController` | Analytics | IP 30/min | bounded body, counters only |
| `/api/landing/*` | RES-016 | not implemented | — | — | `DEPRECATED_CANDIDATE` unless Q-API-049 says otherwise |
| SEO pages, CSV, sitemap, robots | RES-017…RES-020 | `frontend/landing` + files from `CsvExportService` | PublicData, Pricing | — | §5.13 |
| bot updates | RES-022 | `POST /telegram/webhook` on `hook.*` | Telegram | bot + IP | T1 |

### 4.7 Controllers, form requests and the `{detail}` renderer

- **Controllers** are thin: validate (form request) → call one application service → serialize. Legacy controllers
  extend a `LegacyController` base with `json(array $body, int $status)` that never emits an empty `200` and uses `204`
  only where legacy did (BR-API-019…021).
- **Form requests** under `App\Http\Requests\Legacy` parse repeated query keys (`types=…&types=…`), build
  `SearchFilters` through the shared normaliser, and override `failedValidation` to throw a `LegacyValidationException`
  carrying a string code.
- **Serializers** (`App\Http\Serializers\Legacy\*`) return arrays with every strictly-read key present (`08` §1.8: `!`
  keys), lists as arrays never `null`, and unknown enum values mapped to the closed sets the client knows
  (LB-APP-002, LB-APP-015, LB-APP-016). Golden fixtures from the legacy parity mocks pin them.
- **Renderer.** `LegacyExceptionRenderer` runs before `ApiExceptionRenderer` and applies to requests matched by the
  legacy route group (route middleware marker, not a path prefix):

  | Exception | Status | Body |
  | --------- | ------ | ---- |
  | `LegacyValidationException`, `ValidationException` | 422 | `{"detail": "invalid_<field>"}` |
  | missing or invalid `initData` | 401 | `{"detail": "unauthorized"}` |
  | expired `auth_date` | 401 | `{"detail": "auth_expired"}` |
  | `AccessDenied` from the gate | 403 | `{"detail": "private" \| "invite" \| "full" \| "blocked" \| "join"}` |
  | `ModelNotFoundException`, foreign id, unknown route | 404 | `{"detail": "Not Found"}` |
  | method not allowed | 405 | `{"detail": "Method Not Allowed"}` |
  | `NoChatException` | 409 | `{"detail": "no_chat"}` |
  | `RadarLimitReached` | 409 | `{"detail": "subscription_limit"}` (any value other than `no_chat` shows the limit toast, `08` §1.5) |
  | `ThrottleRequestsException` | 429 | `{"detail": "rate_limited"}` + `Retry-After` |
  | anything else | 500 | `{"detail": "internal_error"}`; details only in logs with the request id |

### 4.8 Authorization

| Layer | Mechanism | Requirement |
| ----- | --------- | ----------- |
| Legacy surface identity | `tma` guard, shared verifier, `auth_date` window, user auto-creation without names | SEC-REQ-001…005 |
| v1 identity | Sanctum bearer; exchange issues `app:read`, `app:write` only, 24 h expiry, ≤ 5 tokens per user, token prefix, `sanctum:prune-expired` scheduled | SEC-REQ-004, SEC-032 |
| Access gate | one middleware for legacy and v1 routes and one guard for bot handlers; `blocked` stops everything | SEC-REQ-006 |
| Ownership | relation-scoped lookups (`$user->radars()->where('number', $id)->firstOrFail()`); foreign = unknown | SEC-REQ-014 |
| Races | unique constraints + `insertOrIgnore` / upserts; radar create under a per-user advisory lock | SEC-REQ-015 |
| Bot | actor = `from.id`; targets through the actor's relations; `callback_data` decoded by a strict grammar; private chats only | SEC-REQ-011 |
| Media | policy on `show`/`destroy` (fixes SEC-026, §7) | SEC-REQ-016 |
| Capability URLs | HMAC-signed `/media` and `/call` with expiry; status checked per request | SEC-REQ-024, SEC-REQ-026 |
| ARM | Telegram sign-in + TOTP, roles (moderator, operator, admin), policies, audit log | SEC-REQ-046 (roles: DEC-22) |
| Dashboards | Horizon, Telescope, Pulse gates by ARM role or SSH tunnel only | Q-SEC-019 (production track) |

### 4.9 Models, persistence and transactions

- **Keys.** ULID primary keys for domain tables (matches `media_files`, `source_listings`, `intake_events`; the
  ULID vs UUIDv7 question in `06` §4.1 is settled in favour of the existing ULID convention); `bigint` identity for
  dictionaries; public `number` columns per CF-003; Telegram ids as `bigint`.
- **Types.** `timestamptz` everywhere; wall-clock business settings as `time` / `smallint` hours in `Asia/Tashkent`;
  `name jsonb` translations (ADR-0006); `price_amount bigint` + `price_currency char(3)` + `price_usd_cents bigint`;
  PostGIS columns per CF-014; `phone_encrypted` (encrypted cast with a dedicated key) + `phone_hmac` (keyed with the
  phone pepper); monthly partitions for `user_action_log`, `bot_listing_messages`, `listing_views`.
- **Transactions.**
  - Intake: raw payload, `source_listings` upsert and idempotency row in one transaction (T2 design); processing jobs
    dispatched `afterCommit()` (the Media pattern).
  - Radar create/update: one transaction holding a per-user advisory lock; checks `no_chat`, the limit and the filter
    hash before writing.
  - Delivery: an outbox pattern — `radar_deliveries` row claimed (`pending` → `sending`) in a transaction, Bot API call
    outside it, then `sent` with `chat_id`/`message_id` in `bot_listing_messages`; a retry never sends a card twice
    because `(user_id, listing_id)` is unique.
  - Merge: survivor selection, alias rows, re-pointing of personal-list rows and delivered-card references in one
    transaction.
  - Erasure: database deletion in one transaction; external effects (PostHog deletion, CDN purge) as queued jobs with
    status recorded on `erasure_requests`.
- **Large-table rules** follow `.ai/agents/postgis-geo-engineer.md` and `docs/handoff/parallel-work.md` §3: additive
  changes first, backfills in jobs, `CONCURRENTLY` indexes.

### 4.10 Jobs and queues

Queue names are an interface between the tracks (`docs/handoff/parallel-work.md` §1): every new name is announced in
the PR and added to `config/horizon.php`.

| Queue | Supervisor | Jobs | Limits | Status |
| ----- | ---------- | ---- | ------ | ------ |
| `telegram` | `supervisor-telegram` (exists) | `ProcessTelegramUpdateJob` (inbound updates) | 30 s / 3 tries; per-user bot limits (SEC-REQ-010) | exists |
| `notifications` | **new** `supervisor-delivery` (moved out of `supervisor-default`) | `SendRadarCard`, `SendDigest`, `EditCardWithdrawn`, `SendBroadcastBatch`, `SendFoundPoll` | global send rate below Telegram's documented bulk limit (start at 25 msg/s), 1 msg/s per chat, `retry_after` honoured, circuit breaker on repeated `429`/`5xx` (SEC-REQ-029) | change |
| `ingest` | `supervisor-ingest` (exists) | `ProcessIntakeEvent`, `ResolveGeo`, `MatchDuplicates`, `PublishListing` | 120 s / 3 | exists |
| `llm` | **new** `supervisor-llm` | `ExtractListingFields`, `ParseUserQuery`, `TranslateListing` (pre-warm) | provider rate limit; per-day spend cap (SEC-REQ-044) | new |
| `collect` | **new** `supervisor-collect` (CF-007 B/C only) | `ReadChannelPage`, `FetchPostPhotos` | per-host politeness delay; one worker per channel shard | new |
| `media` | `supervisor-media` (exists) | `GenerateImageVariantsJob`, `CopyListingPhoto`, `BuildLegacyRenditions`, `PurgeListingPhotos` | 300 s | change (new jobs) |
| `radar` | **new** `supervisor-radar` | `MatchListingAgainstRadars` (fan-in per published listing), `PlanDeliveries` | short jobs; chunked by radar id | new |
| `default` | `supervisor-default` | stats recompute, landing data, CSV, rates, purges, partitions | 60 s; long jobs chunked | exists |

Sizing (proposal, re-measured on staging): ~1 050 new listings a day (`01` §1) is ~1 per 80 s on average, with bursts
during the day; radar fan-out depends on the active-radar count, which is unknown (`$KVADRO_ROOT/docs/about.md` §11
item 17).

### 4.11 Scheduler

All entries in `routes/console.php` with `->onOneServer()->withoutOverlapping()`; wall-clock entries use
`->timezone('Asia/Tashkent')` (ADR-0006 keeps storage in UTC).

| Task | Cadence | Module | Notes |
| ---- | ------- | ------ | ----- |
| Read channel pages | every 1–2 min per shard (B/C) | Collectors | freshness target from CF-007 data item 2 |
| Exchange rate (CBU) | daily 09:30 and 12:00 Tashkent, retry hourly | Pricing | alert when the latest rate is > 2 days old |
| District and place medians, listing market cache | hourly | Pricing | as legacy (`$KVADRO_ROOT/docs/seo-pages.md`, OPQ-2 row) |
| Rent index / sale price series | monthly (index), weekly (sale) | Pricing | published rows frozen |
| Digest dispatch | at 09:00, 12:00, 19:00, 20:00 Tashkent (the hours offered by the presets, `04` §5) | Delivery | one digest job per user due |
| Quiet-hours release | every 5 min | Delivery | users whose quiet window ended get their morning digest |
| Landing data and snapshots | 02:02 and 15:00 Tashkent (observed legacy times) | PublicData | same paths and shapes |
| SEO slices and sitemap data | hourly, after medians | PublicData | — |
| Withdrawn-listing PII purge (90 days) | daily 03:30 | Privacy | phone, text, photos, snapshots, translations |
| Action-log partitions (180 days) | daily; create next month's partition on the 25th | Analytics | drop partitions older than 180 days |
| `telegram_updates` prune | daily | Telegram | `model:prune` (exists, not scheduled) |
| `sanctum:prune-expired` | daily | Identity | SEC-032 |
| `horizon:snapshot` | every 5 min | ops | Horizon metrics |
| Scheduler heartbeat | every minute | ops | pings the monitor (`17` §12) |
| Webhook health (`getWebhookInfo`) | every 5 min | Telegram | alert on `last_error_date`, pending count |

### 4.12 Events and listeners

| Event | Raised by | Listeners (queued) |
| ----- | --------- | ------------------ |
| `ListingPublished` | Listings | Radar `MatchListingAgainstRadars`; Pricing mark slice dirty; PublicData |
| `ListingPriceChanged` | Listings | price history; Radar (if price triggers are confirmed, Q-BOT-002) |
| `ListingWithdrawn` | Listings, Admin (takedown) | Delivery `EditCardWithdrawn`; Privacy schedules the 90-day purge; Media purge on takedown |
| `ListingsMerged` | Matching | Engagement re-points lists; Delivery re-points delivered log |
| `ListingPurged` | Privacy | Media deletes renditions and unreferenced objects; edge purge |
| `RadarSaved`, `RadarDeleted` | Radar | Delivery starter list; found poll (BOT-069) |
| `UserErased` | Privacy | Analytics `PersonEraser`; Identity token revocation; Telegram state reset |
| `ChatUnreachable` (Telegram `403`) | Delivery | Radar pauses delivery for the user; analytics counter |
| `AccessStateChanged` | Access, Admin | bot notice where legacy sends one |

### 4.13 Notifications

Radar cards, digests, edits and broadcasts are **not** Laravel Notifications: they need pacing, a message log with
`message_id` for later edits, and per-user quiet hours, so the Delivery module owns them. Laravel Notifications are
used only for operator alerts (a team Telegram chat or e-mail), which is where `LongWaitDetected` from Horizon and the
monitors of `17` §12 also go.

### 4.14 Integrations

| Integration | Choice (PROPOSED) | Notes |
| ----------- | ----------------- | ----- |
| Telegram Bot API | **In-house thin client** over Laravel's HTTP client (`BotApiClient`), as T1 already plans (`TelegramClient`/`TelegramBot`/`TelegramException`) | Bot API is JSON over HTTPS; new fields (button `style`, prepared inline messages, expandable blockquotes, reactions) are payload keys, so no library release is waited for; `Http::fake` makes tests simple; no dependency approval. Alternatives: `nutgram/nutgram` (conversations built in, fast Bot API updates; worth it only if the conversation layer grows), `irazasyed/telegram-bot-sdk` and `defstudio/telegraph` (slower Bot API coverage). The library choice is DEC-23 |
| LLM | `laravel/ai` (installed) with the provider from DEC-03; config published with an env-driven default provider | the package default provider is a hard-coded `openai` (`backend/vendor/laravel/ai/config/ai.php:16`), so HOMI must publish the config; masking before every call; per-day spend cap; audit rows without raw PII (SEC-REQ-042…044) |
| Voice queries | transcription through the same provider abstraction | voice files are never stored (legacy promise) |
| PostHog | HTTP capture API for server events; person-deletion API for erasure; client keys delivered through `meta.analytics` | production keeps the legacy EU project for distinct-id continuity; staging uses its own project (DEC-26) |
| CBU exchange rate | the Central Bank's published daily rates | exact endpoint and rounding to verify (Q-API-054) |
| Map tiles | a Protomaps basemap extract for Uzbekistan as one PMTiles file on object storage | licence and update cadence recorded (Q-API-053) |
| Geocoding | gazetteer first (districts, quarters, metro, places, ЖК), coordinates from posts when present; an external geocoder only if the gazetteer misses too often (`PROPOSED`) | Q-API-020 |
| Public channel pages | HTTP reader (CF-007 B/C) | politeness and blocking tested from the production host |

### 4.15 File storage

| Content | Disk / bucket | Key layout | Access | Retention |
| ------- | ------------- | ---------- | ------ | --------- |
| Listing photo originals | `media_private` (local `storage/app/private`; `homi-private` in staging/production) | `listing-photos/originals/{sha256}.{ext}` | never public | until the 90-day purge or takedown, reference-counted |
| Legacy renditions (JPEG 800 / 480) | `media_private` | `listing-photos/legacy/{sha256}/{800,480}.jpg` | through the signed `/media` route (`X-Accel-Redirect`) | as originals |
| WebP variants for new clients | `media_private` | `listing-photos/derived/{sha256}/{width}.webp` | signed URLs | as originals |
| Landing snapshots | `media_public` under `landing/snap/` | `{number}.webp` | served at `/img/snap/` on `kvadro.app` | rebuilt twice a day; removed on takedown |
| Landing data | `media_public` under `landing/data/` | `live.json`, `pins-rent.json`, `pins-sale.json` | served at `/data/` on `kvadro.app`, `max-age=1800` | overwritten |
| CSV exports | `media_public` under `exports/` | legacy file names | served at the legacy CSV paths | overwritten; published history frozen |
| Basemap tiles | `homi-public` under `tiles/` | `uzbekistan-<date>.pmtiles` | `cdn.*` with `Range` and CORS for Mini App origins | replaced on update |
| User uploads (existing Media API) | as ADR-0012 | as today | as today, with the ownership fix | as today |
| Legacy dump and import data | **not** in application storage — the separate import database host (`14` §7.1) | — | — | destroyed after the rollback window |

### 4.16 Caching

| What | Where | TTL / invalidation |
| ---- | ----- | ------------------ |
| Dictionaries, cities with stats, presets | Redis | 1 h; flushed by the median job |
| `feed/count`, `feed/flow` results | Redis, key = normalised filter hash + locale | 30–60 s |
| Bootstrap pieces of `meta` that are not per-user | Redis | 5 min |
| Translations | database (`listing_translations`) | until the listing text is purged |
| Prepared share message ids | Redis | until the Telegram expiry |
| Rate | Redis + database | daily |
| SEO pages | Next static generation, revalidate 300 s; edge `s-maxage=300` | parity with legacy |
| `/media` responses | edge (Cloudflare or nginx), 1 day per signed URL | purge on takedown |
| `/api/*` personal responses | never cached (`private, no-store`) | — |

### 4.17 Logging and observability

- Structured JSON logs with request id (exists), internal user id (never the Telegram id), route name, latency.
- A Monolog processor redacts `Authorization`, `initData`, `tgWebAppData`, bot-token patterns, the webhook secret,
  phone numbers and `contact` objects (SEC-REQ-013, SEC-REQ-047). Telescope is off in production or limited to
  non-payload watchers (SEC-034).
- Metrics exported for the production monitor (`17` §12): webhook latency and non-2xx count; updates processed per
  minute; Telegram send rate, `429` count, `403` (blocked bot) rate, delivery lag from publish to card; queue wait per
  queue; ingestion freshness (minutes since the last published listing per channel group); parse failures; LLM tokens
  and cost per day; legacy-surface `5xx` rate and p95 per endpoint; `401` rate; contact-quota trips; scheduler
  heartbeats.

### 4.18 Testing approach

Details in `15-testing-strategy.md`; the architecture needs these layers:

| Layer | What | Where it runs |
| ----- | ---- | ------------- |
| Unit | value objects, normaliser, formatter, callback codec, signature helpers | SQLite suite |
| Feature (v1, bot, ARM) | per endpoint and handler; IDOR matrix (`16` §5.2); limiter tests | SQLite suite |
| Legacy contract | every `API-NNN` and `RES-NNN` response validated against the legacy OpenAPI document and golden fixtures (from the legacy parity mocks) | `pgsql` group |
| PostgreSQL / PostGIS | search, medians, polygons, partitions, migrations | `pgsql` group on a PostGIS service in CI |
| Time travel | quiet hours, digests, retention purges, token expiry, rate staleness | both |
| Fake Bot API | `Http::fake` with recorded update fixtures; `429` and `403` behaviour; no real messages (master prompt §21) | SQLite suite |
| Architecture | module dependency rules (§4.2) | SQLite suite |
| Migration | R0 masked sample, idempotency, validation queries (`14` §6) | `pgsql` group |
| Parity runs | the legacy Mini App scenarios and landing scenarios against HOMI staging (headless Chrome), copied into this repository (location decided in `15`) | staging |

### 4.19 GAP → module

| GAP | Module | Notes |
| --- | ------ | ----- |
| GAP-001 | Collectors (or `telegram.uz`) → Intake | CF-007 |
| GAP-002 | Parsing | DEC-03 |
| GAP-003 | Parsing + Radar + Telegram | — |
| GAP-004 | Parsing | — |
| GAP-005 | Matching | OPQ-1 |
| GAP-006 | Geo | PostGIS (DEC-09) |
| GAP-007 | Pricing | OPQ-2 thresholds |
| GAP-008 | Pricing | CF-005 |
| GAP-009 | Listings (search) | — |
| GAP-010 | Radar (matching) + Delivery (sending) | outbound behaviour `UNVERIFIED` |
| GAP-011 | Telegram | Q-BOT-017 |
| GAP-012 | Engagement | — |
| GAP-013 | Identity + Geo, exposed by LegacyApi | — |
| GAP-014 | Geo (configuration) + infrastructure (`17` §7) | — |
| GAP-015 | Listings (`CallLinkService`) + LegacyApi (`/call` web route) | — |
| GAP-016 | Telegram (`ShareService`) | — |
| GAP-017 | Engagement (`OwnerVerificationService`) + Telegram (`/owner`) | Q-BOT-042 |
| GAP-018 | Analytics | — |
| GAP-019 | Privacy | CF-019 |
| GAP-020 | Access | — |
| GAP-021 | PublicData + `frontend/landing` | — |
| GAP-022 | every module, registered in `routes/console.php` (§4.11) | — |
| GAP-023 | Admin + Delivery (broadcasts) + `frontend/arm` | OPQ-4 |
| GAP-024 | Migration | `14` |
| GAP-025 | tests (§4.18) | — |
| GAP-026 | Telegram (second bot) — only if DEC-21 puts it in scope | — |
| GAP-027 | outside this repository (`telegram.uz`) | only for CF-007 A |

## 5. Frontend architecture

### 5.1 Surfaces per stage

| Surface | S1–S3 (transition) | S4 onwards | Host (production) |
| ------- | ------------------ | ---------- | ----------------- |
| Mini App | original legacy production artefacts, unchanged, served by nginx with a hash CSP from the artefact manifest (§3.11) | HOMI Mini App (CF-011 decision) | `app.kvadro.app` (brand move: S6) |
| Call page `/call/<token>` | Laravel no-JS page | same | `app.kvadro.app` |
| Landing `/`, `/uz/`, `/en/`, `/privacy.html` | original legacy files, unchanged, with HOMI-generated data files | `frontend/landing` re-implementation (fixes LB-LND-001, LB-LND-002) | `kvadro.app` |
| SEO pages, sitemap, robots, CSV | `frontend/landing` from S2 (no legacy artefact exists); contingency in `18` §5.3 | same | `kvadro.app` |
| ARM | `frontend/arm` (built when GAP-023 work starts) | same | `arm.homi.uz` |

Why the legacy files stay unchanged until S4: the cut-over order of `$KVADRO_ROOT/docs/about.md` §8.4 changes one
side at a time, the legacy parity harness can verify byte-identical clients, and their CSP hashes are already known.

### 5.2 HOMI Mini App

The option analysis and the decision rule are in §3.11 (CF-011). This section describes the shape of the recommended
option A and what changes under B.

**Option A — client-rendered route group in `frontend/app`.**

- **Route group with its own root layout:** `frontend/app/app/(miniapp)/layout.tsx` renders `<html>` with the boot
  shell; every component below it is a Client Component. Data is fetched only on the client, after `initData` is
  available. A future public `(web)` group (PWA, public pages — DEV candidates) gets a separate root layout and keeps
  SSR per ADR-0013.
- **One URL, a layer stack inside.** The app keeps the legacy model: base tabs `search | favorites | subs | settings`
  and a LIFO layer stack (listing, sheets, viewers, settings sub-pages) that drives Telegram's `BackButton`
  (TMA-022; `03` §1.2). Deep links (`start_param`, `?listing=`, `?news=`) are read once at boot. URL routing between
  screens is not used, so `history.back()` can never leave the app.
- **Boot shell (pre-hydration).** An inline ES5 script in the root layout, carrying the request nonce, reproduces
  TMA-001…TMA-005: native-callback stubs, a boot watchdog that reports `kind: boot` errors to the API and shows the
  "update Telegram" screen in three languages, the 3 s SDK wait, and an early prefetch of the bootstrap call and the
  first feed page. `telegram-web-app.js` loads with `strategy="beforeInteractive"`, which Next injects before any Next
  code (`…/01-app/03-api-reference/02-components/script.md:62-75`). Polyfills for the chosen floor go into
  `instrumentation-client.ts`.
- **Browser targets.** A `browserslist` entry in `frontend/app/package.json` only if the data and spike of §3.11 call
  for a lower floor; it then applies to the whole app, which is acceptable because the public `(web)` group does not
  exist yet.
- **CSP.** `proxy.ts` matched only to the Mini App routes generates a nonce per request and sets `script-src 'self'
  'nonce-…' 'strict-dynamic' https://telegram.org`, `connect-src` for the API, PostHog and tile hosts, `img-src 'self'
  data: blob:` plus the media and tile hosts, `worker-src blob:` for MapLibre, `frame-ancestors` allowing Telegram Web
  (Q-SEC-012), `report-uri`. Dynamic rendering of the shell is acceptable: it is small, per-user and never indexed.
- **Maps.** MapLibre GL with the Leaflet fallback and lite mode, as legacy (`03` §1.7–1.8); both loaded lazily; PMTiles
  from `meta`/bootstrap configuration.
- **What does not change from legacy:** `kv-*` local storage keys and the DeviceStorage mirror (so users keep their
  client settings when the app switches, `03` §3.2), version gates per Telegram version (TMA-042), haptics, theme
  handling (TMA-019…021).

**Option B — static SPA.** The same component code in a fourth workspace app (`frontend/miniapp`, Vite + React 19,
`build.target` from the measured floor), built to static files served by nginx on the Mini App origin; the boot script
and CSP hashes are computed at build time and written to an nginx include, exactly as legacy does. Everything else in
this section applies unchanged. Cost: a Vite dependency and an ADR change to the workspace layout (DEC-06, DEC-23).

### 5.3 Route structure

**`frontend/landing`** (`kvadro.app` until S6):

| Path | Route | Rendering |
| ---- | ----- | --------- |
| `/`, `/uz/`, `/en/` | S1–S3: legacy files via nginx; S4: `app/[lang]/page.tsx` | static |
| `/privacy.html`, `?lang=` | S4: `app/[lang]/privacy/page.tsx`, with a rewrite from `/privacy.html` and `?lang=` handled as legacy | static |
| `/{arenda,prodazha,novostrojki}/…`, `/uz/{ijara,sotuv,novostroyka}/…`, `/en/{rent,sale,new-builds}/…` | `app/[lang]/[...slug]/page.tsx`; `proxy.ts` rewrites unprefixed (ru) paths to an internal `ru` segment and refuses direct `/ru/…` requests with `404` | static (`generateStaticParams` for the indexable pages), revalidated every 300 s |
| `/arenda/indeks/kvadro-rent-index.csv`, `/prodazha/ceny/kvadro-sale-prices.csv` | nginx serves the files written by `CsvExportService` | static file |
| `/sitemap.xml`, `/robots.txt` | `app/sitemap.ts` (with `alternates.languages`), `app/robots.ts` | revalidated |
| `/data/*.json`, `/img/snap/*.webp`, `/media/*` | nginx (backend output) | — |
| `/api/csp-report` | nginx → Laravel | — |

A single path parser and builder (`parseSeoPath`, `buildSeoPath`) owns the slug tables of `03b` §2.2; the page, the
sitemap, hreflang links and the CTA links all use it, so one table defines every URL.

**`frontend/app`**: `(miniapp)` group as in §5.2; `(web)` reserved. During S1–S3 nothing from `frontend/app` is
served on the Mini App origin.

**`frontend/arm`**: `/login` (Telegram Login Widget + TOTP), `/listings` (search, moderation, takedowns), `/channels`
(opt-outs), `/votes`, `/users` (blocking, access), `/beta` (invites, seats), `/broadcasts`, `/stats`, `/audit`;
`noindex` everywhere (ADR-0013).

### 5.4 Server and Client Components

| App | Server Components | Client Components |
| --- | ----------------- | ----------------- |
| landing / SEO | every page: data from the public statistics API (`/api/v1/public/…`, no auth), metadata, JSON-LD; cached with `use cache` / `cacheLife` matching 300 s | language menu, the landing scenes, the live map, the QR, analytics loader |
| Mini App | the root layout (boot shell and nonce only) | everything else |
| ARM | layout and static chrome | data screens (the bearer token is in memory, so Server Components cannot fetch with it — ADR-0003 consequence) |

### 5.5 State

- **Mini App:** navigation state (tabs, layer stack) in a reducer-backed context; server data in a small request cache
  inside `@homi/api-client` (dedupe in-flight requests, prefetch at boot, invalidate after mutations). A query library
  (TanStack Query or SWR, as the Next guide suggests for client data) is a new dependency (`PROPOSED`, DEC-23).
  Session-only maps (favourite toggles, seen, locally hidden) follow legacy (`03` §1.11). No credentials in any storage
  (SEC-REQ-007).
- **Landing:** server data; client state only inside interactive blocks.
- **ARM:** the same request cache; table filters in the URL so links can be shared between moderators.

### 5.6 API client

`@homi/api-client` (exists: fetch, bearer, `Accept-Language`, envelope unwrapping, `ApiError`) gains: a token provider
(memory) with one automatic re-exchange on `401`; a 15 s timeout and `AbortSignal` support (legacy parity); request id
propagation; cursor helpers for `meta.next_cursor`; types generated from the v1 OpenAPI export (T3, T5). The legacy
Mini App does **not** use it — it keeps its own client against the legacy surface.

### 5.7 Authentication and session in the Mini App

1. At launch, read `initData` from `Telegram.WebApp.initData` or the `tgWebAppData` hash (TMA-006).
2. `POST /api/v1/auth/telegram` with `initData` in the JSON body (never in a URL, SEC-REQ-003) → a 24 h token with
   `app:read`, `app:write` (SEC-REQ-004), kept in memory only (SEC-REQ-007).
3. On `401`, refresh with the still-valid token (revoke + reissue, ADR-0003) or, if it has expired, re-exchange the
   current `initData`.
4. **Watch the exchange window.** `initData` is fixed when the WebView opens and `location.reload()` keeps the same
   hash, so a reload after the v1 exchange window (≤ 3 600 s, SEC-REQ-002) would fail. The new app therefore does not
   reload on locale or currency changes (legacy did, BR-API-146) — it re-fetches — and a stale-`initData` failure
   shows a "reopen the app" screen. This is a deliberate difference from legacy (DEV candidate).
5. Outside Telegram (no `initData`): the "open through the bot" screen (SCR-002), using `GET /api/v1/public/bot`.

### 5.8 Forms and validation

The server is authoritative (form requests). Clients validate for feedback only, with rules generated from the
OpenAPI types plus small hand-written checks (numeric ranges, polygon vertex count 3–40, budget input); a schema
library is optional and `PROPOSED`. v1 `422` errors map to fields through the envelope's `errors` map. Radar and
filter forms reuse one `SearchFilters` model shared with the server's normaliser through fixtures.

### 5.9 Shared UI and design tokens

- `@homi/ui` gets the legacy colour roles as CSS custom properties — `--bg`, `--bg2`, `--text`, `--hint`, `--sheet`,
  `--material`, `--dim`, `--accent`, `--sep`, `--fill`, `--good`, `--high`, `--warn`, `--heart` and the badge pairs —
  with light and dark values from `$KVADRO_ROOT/demo/app/src/styles/tokens.css` (`03` §3.6), exposed to Tailwind 4 via
  `@theme`. Brand-dependent values (the yellow accent, logos, mascots) sit in one brand layer, so the S6 brand move
  touches one file (CF-008).
- Telegram theme: only `bg`, `secondary-bg`, `text`, `hint` from `themeParams`, and only in auto + light, as legacy
  (TMA-019…021).
- Typography: the legacy system font stack; the Geist `next/font/google` imports of the `create-next-app` layouts are
  removed (no external font fetch from Telegram WebViews).
- Components shared by Mini App and ARM: buttons, chips, sheets with drag-to-close, toasts, confirm dialogs, list
  cells, skeletons, empty and error states, the price and market badges.

### 5.10 Localisation

- Locales `ru` (default), `uz` (Latin), `en` (ADR-0006). The legacy dictionaries (461 keys × 3 locales,
  `03` §3.1) are the starting catalogues of the new Mini App, keyed by `uz` instead of `uz_Latn`; plural forms through
  `Intl.PluralRules` (ru `one/few/many/other`). Catalogues live in a shared workspace package as ADR-0006 says.
- A missing key falls back to `ru`, then to the key itself, and is reported once — `t()` never throws (fixes
  LB-APP-002). Keys built from server values (`type.*`, `subs.mode.*`, `market.v3.rooms<N>`) have explicit fallbacks.
- Number formatting matches legacy (`uz` uses `ru-RU` separators, `03` §3.1) — a change here is a DEV candidate.
- Landing and SEO: language from the path; `?lang=` becomes a redirect to the prefixed URL (fixes LB-LND-002);
  `hreflang` ru/uz/en + `x-default`.

### 5.11 Responsive and mobile

The Mini App is mobile-first (320–480 px, safe areas, fullscreen on iOS/Android, lite mode on weak Android devices,
`03` §1.7) and must also work in Telegram Desktop windows. The landing keeps both display versions (v1 scroll scenes on
desktops, v2 time-driven on phones, `LND-021`…`LND-025`). SEO pages are plain responsive documents. ARM targets
desktop first.

### 5.12 Performance budgets (proposal)

| Surface | Budget | Measured by |
| ------- | ------ | ----------- |
| Mini App startup | p75 time from launch to first feed render no worse than the legacy p75 of `app_launch.ms` (§3.11 data item 4); JS before the first feed ≤ 170 KB gzip; map code lazy | `app_launch` event, bundle analyser in CI |
| Mini App API | `meta`/bootstrap and first feed page p95 ≤ 300 ms server time; `count` ≤ 150 ms; `map` ≤ 500 ms | backend metrics |
| SEO pages | LCP ≤ 2.5 s p75 on mobile, CLS ≤ 0.1, HTML ≤ 100 KB, TTFB from cache ≤ 200 ms | Lighthouse in CI (after the first page exists, ADR-0013) |
| Landing | as SEO pages; scene animations respect `prefers-reduced-motion` | Lighthouse |

### 5.13 SEO for the 1 008 pages

| Rule | Implementation |
| ---- | -------------- |
| Same URLs | slug tables from `03b` §2.2 in one parser/builder; `trailingSlash: true`, which makes Next redirect `/path` to `/path/` (`…/05-config/01-next-config-js/trailingSlash.md:8-18`) with `308` for permanent redirects (`…/05-config/01-next-config-js/redirects.md:30`) — the legacy status (URL-039) |
| Case-sensitive `404` | the parser rejects any slug not in the table; the localised `not-found` sends `noindex,follow` |
| Thin pages | `200` + `robots: noindex,follow` from the slice data; excluded from the sitemap (threshold Q-SEO-002) |
| Sorts `?sort=` | `noindex,follow`; other query parameters ignored for canonical |
| Canonical, hreflang | `generateMetadata` → `alternates.canonical`, `alternates.languages` with `x-default` = ru |
| Sitemap | `app/sitemap.ts`, 1 012 URLs (landing ×3, privacy, 1 008 SEO), `lastmod` from slice data, alternates |
| JSON-LD | as `03b` LND-057 (`BreadcrumbList`, `FAQPage` where legacy has it); no `RealEstateListing` until public listing pages exist |
| Caching | static generation + 300 s revalidation; `Cache-Control: public, max-age=0, must-revalidate, s-maxage=300` from nginx (RES-017) |
| CTA links | `t.me/KvadroAppBot?start=s_seo[_<lang>][_<slice>]` and `startapp=l_<number>-seo-<channel>-<post>` built by the same builder |
| CSP | DEC-08: start with `script-src 'self' 'unsafe-inline'` + analytics host, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'` as a recorded residual risk (no user input is rendered); move to hashes if the `experimental.sri` spike (Q-SEC-013) removes `'unsafe-inline'` for Next's inline scripts; nonces rejected for these pages because they force dynamic rendering and defeat the 300 s cache |
| Parity gate | crawl of every sitemap URL before the freeze (Q-SEO-001) compared with HOMI staging: status, canonical, hreflang, robots, title, H1, card count, CSV bytes |
| Domain change (S6) | path-for-path `301` with the query string for ≥ 12 months, new sitemap, Search Console change of address (`03b` §6.1) |

### 5.14 Error handling

- **Mini App.** An error boundary per layer (a broken listing screen closes back to the feed instead of a white
  screen); global `error` and `unhandledrejection` handlers with the legacy filtering and a cap of five reports per
  session (`03` §1.6); typed `ApiError` with distinct offline, timeout, server and access states; mutations show
  «Не получилось сохранить» only on real failures (fixes LB-APP-005); version gates degrade, never crash.
- **Landing / SEO.** Localised `not-found` and `error` pages with `noindex,follow`; data fetch failures fall back to
  the last cached render, never to an empty page.
- **ARM.** Errors shown with the request id so the backend log can be found.

## 6. Infrastructure summary

Details, variable names and the production-track checklist: [`17-infrastructure-and-deployment.md`](17-infrastructure-and-deployment.md).
Cut-over and rollback: [`18-release-and-rollback.md`](18-release-and-rollback.md).

| Need | Local | Staging | Production | Owner |
| ---- | ----- | ------- | ---------- | ----- |
| Bot | one dev bot per developer, HTTPS tunnel for live checks (tool: DEC-24) | staging bot with its own Main Mini App URL on the staging legacy-app host | `@KvadroAppBot` from S2 (CF-009) | production track for staging and production |
| Legacy hosts | aliases `kvadro.homi.loc`, `kvadro-app.homi.loc` (`PROPOSED`) | `kvadro.staging.homi.uz`, `kvadro-app.staging.homi.uz` (`PROPOSED`) | `kvadro.app`, `app.kvadro.app` | development (local); production track |
| HOMI hosts | six `*.homi.loc` (exist) | `*.staging.homi.uz` | `api.`, `hook.`, `cdn.`, `arm.homi.uz`; `homi.uz`, `app.homi.uz` unpublished until DEC-04 | production track |
| PostgreSQL | 18 + PostGIS (Homebrew) | `homi_staging_db` + PostGIS | `homi_db` + PostGIS; separate import database for the migration | production track |
| Redis / Horizon | Homebrew Redis; one supervisor process each | per-environment Redis (instance or DB index — open in ADR-0011) | same; new supervisors of §4.10 | shared (`config/horizon.php`) |
| Object storage | disk (ADR-0012) | `homi-staging-*` buckets | `homi-public`, `homi-private`, `homi-tmp`; PMTiles; private listing photos | production track |
| Edge | none | none or a staging Cloudflare zone | Cloudflare kept or dropped (DEC-16) | product owner, production track |
| LLM, PostHog | none or a developer key with a low cap | own keys, low caps, own PostHog project | production keys; legacy PostHog EU project | production track |
| Scheduler | `php artisan schedule:work` while developing | one cron entry | one cron entry on one host | production track |
| Monitoring | Pulse, Horizon, Telescope | + alerts to the team chat | Grafana/Prometheus/Alertmanager on the existing monitoring host + Pulse/Horizon | production track |
| Backups | none | nightly, restore drill before every rehearsal | pgBackRest with WAL, retention matching the privacy promise; restore drills | production track |

## 7. How existing HOMI work is reused or changed

| Artefact | Verdict | Change (who) | Ref |
| -------- | ------- | ------------ | --- |
| `ApiController` envelope | reuse for v1 | add the optional `code` (ADR-0007) and a cursor helper | CF-004 |
| `ApiExceptionRenderer` | change | skip requests of the legacy route group; `LegacyExceptionRenderer` registered before it | CF-001 |
| `AssignRequestId` | reuse | attach to the legacy group too | — |
| Rate limiters | change | the SEC-REQ-027 set; the webhook limiter keyed by bot + IP | CF-018, SEC-031 |
| **Media module** | reuse, **fix first** | (1) **ownership defect**: `MediaController::show` and `destroy` resolve any `MediaFile` by route binding with no owner check (`backend/app/Http/Controllers/Api/V1/Media/MediaController.php:46-60`; routes `backend/routes/api.php:16`, `:22`), so any token reads any file (including private temporary URLs) and any `media:write` token deletes any file; content-addressed de-duplication makes the first uploader the owner of everyone's bytes (`backend/app/Models/MediaFile.php:64-79`) — SEC-026. Fix: an ownership reference table separate from the content-addressed object (owner type + id), a `MediaFilePolicy` on `show`/`destroy`, deletion of the object only when the last reference goes, and tests for a second actor (SEC-REQ-016). (2) Owner type in upload prefixes and `uploaded_by` (SEC-027). (3) Check image header dimensions before decoding (SEC-028). (4) Third-party listing photos never on the public immutable path (SEC-029). (5) Listing photos, legacy JPEG renditions, signed URL route (CF-012). Order: (1)–(3) in T4, before any listing photo exists | CF-012 |
| `/api/v1/media*` endpoints | reuse | ARM uploads; collectors may pre-upload | — |
| Telegram webhook stub (`VerifyTelegramSecretToken`, `TelegramWebhookController`, `ProcessTelegramUpdateJob`, `telegram_updates`, `config/telegram.php`) | reuse — T1 completes it | constant-time secret check before parsing; bind the route to the `hook.*` host (SEC-031); redact contacts before storage and encrypt the payload (SEC-030, SEC-REQ-037); drop `edited_message` and `chat_member` from `allowed_updates`; schedule the prune; atomic claim of the row by the job (SEC-REQ-009); bot id from the token prefix so `@KvadroAppBot` and dev bots never share a ledger row | CF-009, CF-019 |
| Intake tables (`sources`, `source_listings`, `intake_requests`, `intake_events`) and `SourceSeeder` | reuse | T2 as planned, plus: payload fields `channel`, `post_id`, `posted_at`, raw text, `rent_period`; raw-post events for HOMI-side parsing; remove `geo_uz` from the collector list; add `kvadro_legacy` (migration) and `homi_channels` (CF-007 B/C); PII retention of payloads | CF-007, CF-016, CF-019 |
| `config/intake.php` enums | change | `rent_period`; demand deals stored, never published | CF-016 |
| Horizon supervisors | change | `notifications` moved to `supervisor-delivery`; new `llm`, `radar`, `collect` queues (§4.10) | GAP-010 |
| `users`, `personal_access_tokens` | change | Telegram identity, nullable email and password, token prefix and expiry | CF-015, SEC-032 |
| Scramble / T3 | reuse for v1 | legacy document hand-written (CF-020) | CF-020 |
| `@homi/config`, `@homi/types`, `@homi/api-client`, `@homi/utils`, `@homi/ui` | reuse | locales stay `ru`/`uz`/`en`; cursor types; token provider; formatter fixtures shared with the backend; design tokens | CF-006, CF-017 |
| Next apps (blank) | replace contents | per §5; remove Geist fonts and the template pages | CF-010, CF-011 |
| CI | change | PostGIS service image, `pgsql` test group, legacy contract tests, CSP-hash check of legacy artefacts, audits (`17` §11) | CF-014 |
| Local nginx (`infra/local/nginx`) | change | two legacy-host aliases with the same routing as production (`17` §3) | CF-008 |
| Telescope | change | off in production or payload-free watchers only; `TELESCOPE_ENABLED` in `.env.example` | SEC-034 |

## 8. Decisions needed from people

Who decides: **developer** = development track (second developer); **first developer** = production track;
**product owner** = owner of kvadro² (business, legal, brand). "Blocks" names the work that cannot finish without the
decision. All recommendations are `PROPOSED`.

| ID | Decision | Options | Recommendation | Who decides | Blocks |
| -- | -------- | ------- | -------------- | ----------- | ------ |
| DEC-01 | Contract freeze date and sunset rule for the legacy surface (Q-SYS-005) | freeze now / at S1 exit; sunset by date / by traffic | freeze 14 days before S2 (`14` §7.6); sunset by the traffic rule of §3.2 | product owner + developer | parity gate, R2, S5 |
| DEC-02 | Listing acquisition (CF-007) | A / B / C / D | C (D if collection must stay out of this repository) | first developer + collector owner; product owner for the channel list and opt-outs | Listings pipeline, R2, S2 |
| DEC-03 | LLM vendor and its legal basis (Q-SEC-006) | Gemini / Anthropic / other | Gemini for parity, benchmark on the golden set | product owner (legal) + first developer | Parsing, GAP-002…004 |
| DEC-04 | Brand and domains after the migration (Q-SYS-006) | keep kvadro / move to HOMI / both | keep the kvadro hosts at S2; decide the move (S6) separately | product owner | S6, landing copy, `homi.uz` publication |
| DEC-05 | Bot custody: transfer of `@KvadroAppBot`, token rotation at S2 (Q-SEC-001, SEC-REQ-012) | rotate at S2 / at the end of the rollback window | rotate at S2; rollback runbook hands the new token to the legacy operator only if rollback happens | product owner + first developer | S2 |
| DEC-06 | Mini App strategy and minimum supported Telegram/WebView (CF-011, Q-APP-001) | A / B by the rule of §3.11 | data + spike, then the rule | product owner (floor), developer (spike), first developer (hosting) | S4 only |
| DEC-07 | Legacy Mini App artefacts to serve (Q-SEC-015) | original production files / rebuild from decompiled code | original files with a SHA-256 manifest | developer + first developer | S1 |
| DEC-08 | CSP for landing and SEO (Q-SEC-013) | nonce + dynamic / experimental SRI / `'unsafe-inline'` with recorded risk | `'unsafe-inline'` baseline, SRI if the spike works | developer + security review | landing build |
| DEC-09 | PostGIS on the shared PostgreSQL server (CF-014) | adopt / plain lat-lng | adopt | first developer | Geo, Search, Pricing, KV-DB-005, data migration |
| DEC-10 | Money: normalised USD ADR; default display currency for new users; SEO currency (CF-005) | UZS / USD defaults | ADR as §3.6; defaults: product owner (parity = USD) | first developer (ADR) + product owner (defaults) | Listings, Pricing, Radar |
| DEC-11 | Public numbers and keyset cursors ADR (CF-003, CF-004) | as §3.4–3.5 | accept | first developer | KV-DB-004, schema |
| DEC-12 | Retention and deletion ADR incl. backups (CF-019, OPQ-5, Q-SEC-010, Q-SEC-011) | legacy promises / new text | legacy promises as the baseline | product owner + first developer (backups) + security review | T1 completion, S2 |
| DEC-13 | Legal basis for transferring personal data and hosting location (`14` P5, Q-SEC-005, Q-SEC-007…009) | — | lawyer's note before R1 | product owner (with a lawyer) | R1, S2 |
| DEC-14 | Public listing pages (CF-010) | none / after a privacy review | none during the migration | product owner | — (post-parity) |
| DEC-15 | `kvadro.app` at S2: HOMI serves landing + SEO / HOMI proxies SEO paths to the legacy origin for a short time | full / contingency | full; contingency only if the SEO crawl gate fails | first developer + product owner | S2 scope |
| DEC-16 | Cloudflare in front of the kvadro hosts (Q-SEC-006) | keep with account transfer / drop | keep through S3 if the account can be transferred; otherwise plain DNS | product owner + first developer | S2 DNS steps |
| DEC-17 | Pending updates at the webhook switch (Q-SEC-017) | drop / process | process, with the `telegram` queue paused until GO (`14` §7.6) | product owner + first developer | S2 |
| DEC-18 | Rollback window length and data written to HOMI after the point of no return | reverse sync / export report / accept loss | 72 h; export report for manual re-application, no reverse sync | product owner | S2, S3 |
| DEC-19 | Phone-disclosure quota thresholds (Q-SEC-003) | values | from legacy statistics if available | product owner | legacy listing details |
| DEC-20 | Cap on instant cards per radar per hour (SEC-REQ-029) | none / cap with overflow to digest | none at S2 (parity); revisit with data | product owner | Delivery |
| DEC-21 | `@KvadroSupportBot` in scope (GAP-026, Q-SEC-020) | migrate / keep legacy-operated / drop | decide before S2; it is outside the parity scope today | product owner | support links in texts |
| DEC-22 | ARM roles, admin list, TOTP (OPQ-4, Q-SEC-018) | — | moderator, operator, admin; TOTP mandatory | product owner | ARM, takedowns, broadcasts |
| DEC-23 | New dependencies: Telegram client library (none if in-house), legacy OpenAPI response validator, PostGIS CI image, Next test runner (T8), query library, Vite (option B only) | per item | in-house client; validator, PostGIS image and test runner approved; query library optional | first developer | T1, contract tests, CI, T8 |
| DEC-24 | HTTPS tunnel tool for live webhook checks (T1 gate) | — | any tool that forwards to `hook.homi.loc` with that `Host` header | first developer | T1 live check (optional) |
| DEC-25 | Access mode at S2 (`private` / `invite` / `full`) and seat limit | — | the mode legacy runs on the freeze date | product owner | S2 |
| DEC-26 | PostHog: production project, staging project, session replay (Q-SEC-006) | keep legacy EU project / new project | keep the legacy project for production (distinct-id continuity), new staging project | product owner | S1, S2 |
| DEC-27 | Redis per environment (ADR-0011 open item) | instance / DB index | separate instances — **answered 2026-11-09 by the production track: DB indexes on the shared instance** (`docs/infrastructure/environments.md`); eviction policy still to check (KV-INF-019) | first developer | staging |
| DEC-28 | Capacity of the web host for Next processes, Horizon workers and the channel reader | same host / extra worker host | measure on staging before S2 | first developer | S2 |
| DEC-29 | Owner verifications: legacy hash scheme and re-verification campaign (Q-BOT-042, LB-DATA-005) | migrate hashes for a window / re-verify all | migrate for a window, then re-verify (`14` KV-DB-030) | product owner | `/owner` parity |
| DEC-30 | Thin-page indexing threshold (LB-SEO-012, Q-SEO-002) | legacy threshold / new | legacy threshold at S2, review after | product owner | SEO pages |

## 9. Proposed updates to `HANDOFF.md` §4

A proposal only; `HANDOFF.md` is a shared file changed by its own small PR (`docs/handoff/parallel-work.md` §1).
The migration plan ([`21-development-master-plan.md`](21-development-master-plan.md)) becomes the plan for application work; T0–T11
stay as the foundation track.

| Task | Verdict | Change |
| ---- | ------- | ------ |
| T0 | done | — |
| T1 Telegram webhook pipeline | **stays, extended** | add: payload redaction and encryption (SEC-REQ-037), trimmed `allowed_updates`, host binding (SEC-REQ-008), bot-id per token, prune scheduled; the in-house Bot API client must cover the features in `04` §1 (button styles, prepared inline messages, expandable blockquotes, reactions, `request_contact`); `telegram:webhook` keeps refusing staging and production |
| T2 Intake accept layer | **stays, payload changed** | add `channel`, `post_id`, `posted_at`, raw text, `rent_period`; remove `geo_uz`; document raw-post events; the rest as planned. Independent of the CF-007 outcome |
| T3 OpenAPI export | stays | v1 only; a new task writes the hand-maintained legacy document (CF-020) |
| T4 Close Phase 3, ADR-0014 | **stays, extended** | ADR-0014 also covers listing photos, legacy renditions, signed photo URLs and erasure (CF-012); the Media ownership fix (§7, SEC-026…028) lands here |
| T5 Generated TypeScript client | stays, lower priority | needed by the new Mini App (S4) and ARM, not by S2 |
| T6 Telegram sign-in | **stays, extended** | the verifier follows SEC-REQ-001 and is shared with the legacy `tma` guard; token rules of SEC-REQ-004/007 |
| T7 Domain modules | **superseded** | replaced by the migration plan's module tasks in the order of §4.2: Identity + Access → Geo (after the PostGIS ADR) → Listings + Intake processing → Pricing → Search → Engagement → Radar → Delivery → Bot conversations → Legacy surface endpoints → PublicData → Analytics → Privacy → Admin. The gates move: OPQ-2 and OPQ-3 are mostly answered by the legacy material (§1.14); OPQ-1 and OPQ-4 remain |
| T8 Frontend foundation | **changed** | split: (a) `frontend/landing` SEO pages for S2 (needs the test-runner approval); (b) the Mini App after DEC-06; (c) ARM after DEC-22. Shared tokens and i18n first |
| T9, T10, T11 | stay | T10 also adds the secret scanning of SEC-REQ-035 when approved |
| **New** — legacy compatibility surface | add (P1) | routes, `tma` guard, renderer, serializers, formatter, limiters, contract tests per `API-NNN` |
| **New** — data migration | add (P1) | `14` KV-DB tasks; blocked by the legacy schema and the legal basis |
| **New** — cut-over and rollback | add (P1) | `18` runbooks; mostly production track |
| **New** — ADRs of §3.1 | add (P0) | written before the code they govern: compatibility surface, numbers and cursors, money, acquisition, LLM, brand/domains/bot, URL scheme, Mini App, PostGIS, retention |
