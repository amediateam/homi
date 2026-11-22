# Project context for the second developer

Purpose: the project in one read — product, architecture, stack, every decision with its reason, the analyses already done and what is built. Written 2026-11-09 for the handoff (`/HANDOFF.md`); canon stays in the linked files, this page is the map with the "why". If something here disagrees with an ADR or with the code, the ADR/code wins — fix this page.

## 1. Product

HOMI (homi.uz) turns housing listings (rent and sale) from public Telegram channels and web sources in Uzbekistan into one deduplicated feed with filters and a map. Planned features: "radar" alerts through a Telegram bot (saved filters → notifications), owner-vs-realtor tagging with an LLM, a "below market" flag (≈20 % under the district median), price statistics. UI languages ru / uz (Latin) / en; prices in UZS (default) or USD.

- Source description (Russian, preliminary, partly guesses): `docs/about.md`.
- Requirements extracted from it, each labelled CONFIRMED / ASSUMED / OPEN: `docs/architecture/requirements.md`.
- **Open product questions** that block parts of the plan: OPQ-1 dedup rules/thresholds, OPQ-2 below-market window and sample size, OPQ-3 launch cities, OPQ-4 ARM roles/moderation, OPQ-5 retention of raw payloads (`requirements.md` §Open product questions).

## 2. Architecture (target; details in `docs/architecture/overview.md`)

- One Laravel 13 API (`backend/`, `/api/v1`, Sanctum bearer tokens) + Horizon workers on Redis; PostgreSQL 18; object storage MinIO (staging/production) / local disk (development); three Next.js 16 apps in a pnpm workspace (`frontend/landing`, `app`, `arm`) with shared packages in `frontend/packages/*`.
- Domains: `homi.uz` (landing), `app.` (user app + Telegram Mini App), `arm.` (team admin), `api.`, `cdn.` (public media), `hook.` (third-party webhooks only — the Telegram Bot API). Local: the same names under `.loc`. Full matrix and hosts: `docs/infrastructure/environments.md`.
- **Listings are pushed into HOMI.** Collectors live outside this repository — `telegram.uz` (Telegram channels, Laravel + MadelineProto), `geo.uz` (web sources), later `datahub.uz` (canonical properties) — and push through an authenticated, idempotent intake API under `/api/v1/intake/*` (ADR-0009). What the collectors store and expose, and the payload draft: `docs/api/intake-sources.md`.
- Backend modules (namespaces in one app): Identity, Geo, Listings, Intake, Media, Pricing & Stats, Radar & Notifications, Bot, Admin (ARM API), AI — dependencies between them are fixed in `overview.md` §Backend module boundaries.
- The `backend/` Inertia/React starter UI is installed but **frozen** — nothing is built there (ADR-0002).

## 3. Stack and versions

Measured on the first developer's machine on 2026-11-09; the Laravel and package versions of the two backend rows follow `composer.lock` and were last updated on 2026-11-22 after a `composer update` (the PHP version was not measured again). Pins and how they are enforced: `docs/handoff/environment.md` §1.

| Layer | Version | Pinned by |
|---|---|---|
| PHP / Laravel | 8.5.12 / 13.43.0 | `composer.json` `php ^8.5` + `config.platform.php 8.5.0`, `composer.lock` |
| Key backend packages | Sanctum 4.5, Horizon 5.52, Pest 5.3, Larastan 3.15 (level 7), Pint 1.32, Boost 2.10.4, Scramble 0.13.55, Intervention Image 4.4.1, flysystem-aws-s3-v3 3.35, Guzzle 8.5, `laravel/ai` 1.4, `laravel/mcp` 1.2 | `composer.lock`; generated registry `docs/backend/package-registry.md` |
| Node / pnpm | 26.13 / 11.24.0 | `.node-version` (major 26), `frontend/package.json` `packageManager`, `engines` |
| Next.js / React / TypeScript | 16.4.5 / 19.3.1 / ^6.0.3 (not 7, KI-4) | `frontend/pnpm-lock.yaml` |
| PostgreSQL / Redis / nginx | 18.6 / 8.10.3 / 1.31.8 (Homebrew) | `dev-check` checks reachability, not versions |
| Backend JS tooling (frozen UI) | Vite+ (`vp`) replaces ESLint/Prettier in `backend/` | `backend/package-lock.json` |

## 4. Decisions and why

### Architecture Decision Records (`docs/architecture/decisions/`, all Accepted 2026-11-08)

| ADR | Decision | Why |
|---|---|---|
| 0001 | One repo: `backend/`, `frontend/`, `infra/`, `docs/`, `.ai/`, scripts at the root; canonical paths | independent toolchains, shared docs and agent config; the mandate's layout adapted to what existed |
| 0002 | Keep the Inertia/React starter **frozen**, backend = API only | the UIs are the Next apps; removing the starter would break `composer ci:check` and Boost guidelines for nothing |
| 0003 | Sanctum personal access tokens, Telegram as the only identity (initData / Login Widget), no cookies/CSRF | users sign in with Telegram only; three apps + a bot on sibling hosts; proven in the reference codebase |
| 0004 | pnpm workspace in `frontend/`, Node 26, PHP 8.5 pinned | reproducible installs; Node 26 is the Active LTS (since 2026-10-28) |
| 0005 | Redis for queue and cache, Horizon as the worker; sessions in the database | Redis already runs, Horizon consumes Redis only; the old `database` queue silently never ran jobs (KI-1) |
| 0006 | UTC storage, `Asia/Tashkent` display; locales ru (default/fallback), uz-Latn, en in `jsonb`; money in minor units with explicit currency, UZS default | product serves Uzbekistan in three languages with USD and UZS prices |
| 0007 | `/api/v1`, `{success, data, meta}` / `{success:false, message, errors, code}` envelope, Resources only, OpenAPI as the contract → generated TS client | three apps and external collectors on one API need one stable contract |
| 0008 | Local: Homebrew nginx + php-fpm, `/etc/hosts` `.loc` names, mkcert HTTPS | the first developer's machine already runs ~100 projects this way and the second was declared to use the same Homebrew stack (Phase 0, "2D"); no Docker |
| 0009 | HOMI owns the listing DB; collectors push through an idempotent intake API (`/api/v1/intake/*`, batch 1–100, `Idempotency-Key`, 202) | collection is done by sibling systems; HOMI must not read their databases |
| 0010 | Git: PRs only into `main`, branch naming, Conventional Commits, CODEOWNERS, worktrees for parallel agents | free GitHub plan has no branch protection — protection by convention and local tooling (the tooling part is not built yet, KI-19) |
| 0011 | Web/app on `159.253.19.121`, PostgreSQL on `5.45.127.98`, MinIO on `31.220.104.38` (`s3.hc.uz`); staging and production on the same hosts, strictly separated | the team's existing servers; agents never get production credentials |
| 0012 | **No MinIO locally**: media on the `public` disk behind `https://cdn.homi.loc`; S3 disks only in staging/production; `MEDIA_PUBLIC_URL` is the single URL base | the developer's decision — matches the other local projects; code never branches on the driver |
| 0013 | Next apps run as SSR (`next start`) behind nginx in production (ports 3100–3102, staging 3200–3202) | SEO / GEO / AEO need server-rendered HTML |

### Developer decisions that are not ADRs

| Date | Decision | Recorded in |
|---|---|---|
| 2026-11-08 | Phase 0 checkpoint: external CLI smoke tests yes (Phase 4), root `prompt.md` removed, `infra/` instead of `server/`, all three Telegram bots exist (dev/staging/prod), AI vendor chosen later (before the first AI feature), second developer on macOS with the same Homebrew stack, `about.md` is preliminary | `docs/ai/reports/phase-0.md` §14 |
| 2026-11-08 | nginx is started by hand (`sudo nginx`, `make dev-nginx`), never through `brew services` — macOS TCC blocks launchd daemons from `~/Documents` | KI-13, `docs/ai/reports/phase-2.md` |
| 2026-11-08 | Phase 3 packages approved: `league/flysystem-aws-s3-v3`, `intervention/image`, `dedoc/scramble`. `SANCTUM_TOKEN_EXPIRATION` dropped — a global expiry would kill collector tokens; expiry is set per token | commit `cda9303`, `docs/infrastructure/environments.md` §Environment variables |
| 2026-11-08 | Phase 3 paused: «закончи потом остановись — у нас много дел до написания кодов»; then «Пока я не скажу — не пиши код проекта» for the first developer's agent | `session-handoff.md` history |
| 2026-11-08 | Phase 4 D1–D4 yes (Tier 1 skills, root canonical `.ai/skills`, vendoring with `SOURCES.md`, `backend/.ai → ../.ai`); D7 hooks applied; D5 plugins, D6 Codex/Gemini/Grok, D8 rest of the SEO pack wait | `docs/ai/reports/phase-4-plan.md` |
| 2026-11-08 | app.uz security findings (agent-config card C0) deferred — not to be re-raised unprompted | `docs/reference-codebase/c-agent-config.md` |
| 2026-11-09 | Work split: the second developer continues development (this plan); the first developer takes the production environment | `/HANDOFF.md`, `docs/ai/reports/phase-4-plan.md` |

## 5. Analyses already done (do not repeat them)

| Analysis | Result lives in |
|---|---|
| Phase 0 discovery: repository, tools, stack, risks, assumption mismatches AM-1 … AM-16 | `docs/ai/reports/phase-0.md` (AM-17 … AM-34 in `phase-1.md` and `phase-2.md`) |
| Reference codebase `app.uz` — modules worth porting (auth, API, media, bot, i18n, geo, ops) with port plans | `docs/reference-codebase.md`, cards `docs/reference-codebase/a-*.md`, `b-*.md` |
| `app.uz` agent configuration (hooks, personas, settings) → what HOMI adopted | `docs/reference-codebase/c-agent-config.md` |
| `telegram.uz` collector audit: data model, public API, lifecycle, what it must add to push to HOMI | `docs/api/intake-sources.md` |
| Production CDN/MinIO host and web host conventions (nginx, TLS, buckets, onboarding script) | `docs/ai/reports/phase-3-notes.md` (input for the production track) |
| Skills / plugins / MCP market survey (skills.laravel.cloud, skills.sh) and the chosen set | `docs/ai/reports/phase-4-plan.md` §1–§3, `.ai/skills/SOURCES.md` |
| Composer package capabilities (what is installed, what not to reinvent) | `docs/backend/package-registry.md`, compact `.ai/memory/package-capabilities.md` |

Assumption mismatches are numbered `AM-<n>` inside the phase reports (latest AM-36 in `phase-4-plan.md`); open problems are `KI-<n>` in `.ai/memory/known-issues.md`.

## 6. What exists in code (2026-11-09)

- **Backend (Phase 3 WIP, tested):** `AssignRequestId` middleware (`X-Request-Id`), `ApiController` envelope + `paginated()`, `ApiExceptionRenderer` (401/403/404/422/429/500 envelopes for `api/*`); Media module — `HashedUploader` (sniff → decode → orient → re-encode → `originals/{sha256}.{ext}`), `GenerateImageVariantsJob` (`derived/{sha}/{w}.webp`, queue `media`), `MediaUrlBuilder`, `MediaController` + `PresignController` (`/api/v1/media`, `/presign`, `/register`, `/{media}`), rate limiters `api|uploads|intake|telegram-webhook`, Horizon queues `default+notifications|telegram|media|ingest`; tables `media_files`, `telegram_updates`, `sources`, `source_listings`, `intake_requests`, `intake_events` with models, factories, enums, `SourceSeeder`. 47 Pest tests.
- **Stubs (fail-closed):** `POST /telegram/webhook` (meant for `hook.*`, but the route has no domain constraint, so `api.*` reaches it too — T1 decides) → `VerifyTelegramSecretToken` answers 403, `TelegramWebhookController` 501, `ProcessTelegramUpdateJob` empty.
- **Not built:** intake endpoints, the Telegram pipeline, auth (`/api/v1/auth/telegram`), every domain module except Media, OpenAPI export, the generated TS client, any UI in the Next apps (they are `create-next-app` output plus env/config), frontend tests.
- **Frontend packages:** `@homi/config`, `@homi/types`, `@homi/utils`, `@homi/api-client`, `@homi/ui` — skeletons with lint/typecheck, no consumers yet.

## 7. Known problems worth knowing on day one

- KI-13 (high): never `brew services` for nginx.
- KI-19: pushes to `main` are not blocked technically yet — PRs only, by convention.
- KI-20: `.ai/memory/session-handoff.md` is one file overwritten per session — with two tracks it conflicts; rule in `docs/handoff/parallel-work.md` §5.
- KI-11/KI-12: Next typecheck needs `next typegen` first (built into `pnpm typecheck`); PHPStan needs `--memory-limit=1G` (built into `composer types:check`).
- Tests run on in-memory SQLite (`phpunit.xml`) — PostgreSQL-specific SQL behaves differently there; check such code against the real database.
- GitHub runs the backend/frontend workflows only on PRs and on `main`: phases 1–2 ran through PRs #2/#3, the phase 3/4 code through PR #4 (backend + tooling green, 2026-11-09).
