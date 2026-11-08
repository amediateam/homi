# Phase 0 — Discovery Report

```text
PHASE:        0 — DISCOVERY
STATUS:       COMPLETE — checkpoint reached; awaiting human decisions (section 8) before Phase 1/2
DATE:         2026-11-08
SESSION:      Claude Code 2.1.319, main session on Claude Fable 5.1
```

Mandate: `docs/ai/master-prompt.md` (v3.1). Phase 0 is overview-depth by design (master prompt §23.0); full audits (§3.1, §4) are Phase 1 work.

---

## 1. Repository state (verified)

| Item | Finding |
|---|---|
| Root | this checkout (`…/Server/local/homi.uz` on the developer machine; absolute paths live only in `.ai/local.env`) — confirmed |
| Git | 1 commit (`f8f9564 Initial commit`, README.md only). Branch `main`. Remote `github.com/amediateam/homi` (private) |
| Index | `docs/about.md` and `prompt.md` are **staged** (A) and modified since (M) |
| Untracked | `backend/`, `frontend/`, `.idea/`, `CLAUDE.md` |
| Root `.gitignore` | **missing** (added in this phase: `.idea/`, `.vscode/`, `.DS_Store`, `.ai/local.env`) |
| `server/` | empty dirs `server/{local,staging,production}/host` — purpose unknown, not in master-prompt layout (which uses `infra/`) |
| GitHub branch protection | **unavailable**: free plan + private repo → API returns 403 "Upgrade to GitHub Pro or make this repository public" |

## 2. Environment & tools (verified by `which` / `--version`)

| Tool | State |
|---|---|
| macOS | 27.0.1, arm64 |
| PHP | 8.5.12 (Homebrew, `/opt/homebrew/bin/php`), php-fpm running on `127.0.0.1:9000`. Extensions: pdo_pgsql pgsql redis gd imagick intl bcmath exif pcntl sodium zip |
| Composer | 2.11.1 |
| PostgreSQL | 18.6 (Homebrew service, running on 5432, extensions pg_cron + pg_partman loaded) |
| Redis | running on 6379 (Homebrew service) |
| Node / npm / pnpm | v26.13.0 / 11.20.0 / 11.24.0. No corepack. yarn present, bun absent |
| nginx | 1.31.8 installed (Homebrew), **not running**; config includes `sites-enabled/*.conf`; ~100 local vhosts for other projects |
| MinIO | `minio` + `mc` installed (RELEASE.2025-09-06), **not running**, data dir `~/minio-data` (empty); local convention elsewhere: MinIO on `127.0.0.1:9500` behind `s3.app.loc` — port 9500 currently free |
| imagemagick | installed |
| Docker | `docker` CLI absent; `colima` installed but not running → Sail not usable |
| mkcert / dnsmasq / caddy / herd / valet / tree / task / gitleaks | **absent** (`nss` is installed, so `mkcert` is a one-line brew install) |
| DNS | no `/etc/resolver/*`; local domains are managed via `/etc/hosts` (many `*.loc` entries; **no `homi` entries yet**) |
| Local HTTPS | **none** — every local vhost is `listen 80`; no `ssl_certificate` anywhere |
| Ports | 8000/8001 taken by **HTTP Toolkit** (so `php artisan serve` default port collides); 3000/3001/3002 free; 9500/9001 free |
| gh | 2.103.3, logged in as `amediateam` |
| AI CLIs | `claude` 2.1.319; `codex` 0.167.0 (logged in via ChatGPT, `codex exec` non-interactive); `gemini` 0.67.0 (`-p`, `--approval-mode plan|auto_edit|yolo`, `-o json`, oauth creds present); `grok` 1.0.70 (`--agent`, `--allow/--deny`, `--always-approve`, auth file present). Functional smoke tests **not run** (paid/quota operations → decision D8) |
| Claude Code models | Agent tool exposes `sonnet`, `opus`, `haiku`, `fable`; CLI supports `--agents`, `--allowedTools`, `--permission-mode`, `--output-format` |

Local vhost convention observed (other projects on this machine): nginx `listen 80` + `$approot` variable; Laravel → `fastcgi_pass 127.0.0.1:9000`; Vite/Next dev servers → `proxy_pass http://127.0.0.1:<port>`; `cdn.<x>.loc` → `root <project>/backend/storage/app/public`; `s3.app.loc` → MinIO `127.0.0.1:9500`; `webhook.<x>.loc` exists for qulay.

## 3. Backend (`backend/`) — verified

- Laravel **13.40.0**, PHP ^8.3 required (8.5 used), starter: `laravel/blank-react-starter-kit` (Inertia v3 + React 19 + TS 7 + Tailwind 4 + Vite+ (`vp`) + Wayfinder + React Compiler).
- Direct deps (26): framework, inertia-laravel 3.7, ai 1.3, horizon 5.50, mcp 1.1, pennant 1.26, pulse 1.8, reverb 1.12, sanctum 4.3, scout 11.9, socialite 5.31, telescope 5.27, tinker, wayfinder 0.1.23; dev: boost 2.10.4, dusk 8.7, pail, pao, pint, sail, larastan 3.14, pest 5.3 (+laravel plugin), mockery, collision, faker. 170 packages installed total.
- `composer audit`: **no advisories**. `composer outdated --direct`: **all up to date**. No `config.platform.php` pin.
- **Not installed** (needed by product/infra, present in app.uz): `league/flysystem-aws-s3-v3`, `intervention/image`, `dedoc/scramble`, `spatie/laravel-permission`, `spatie/laravel-medialibrary`, any Telegram SDK, `danog/madelineproto`, `sentry/sentry-laravel`, `spatie/laravel-backup`. → listed as **PROPOSED** (install = REVIEW level), see §7.
- `laravel/ai` ships a `GeminiProvider` → satisfies about.md's Google Gemini requirement without a new package.
- `config/filesystems.php` has the default `s3` disk, but the adapter package is missing.
- `.env` is PostgreSQL (`DB_CONNECTION=pgsql`), `QUEUE_CONNECTION=database`, `CACHE_STORE=database`, `SESSION_DRIVER=database`, `BROADCAST_CONNECTION=reverb`. DB connectivity works: 7 migrations ran (users, cache, jobs, pennant features, sanctum tokens, telescope, pulse).
- `.env.example` is **stale**: missing `DB_HOST/PORT/DATABASE/USERNAME/PASSWORD` and all `REVERB_*` / `VITE_REVERB_*` keys (keys compared, values not read).
- `php artisan dev` = serve + **horizon** (replaces `queue:listen`) + reverb + pail + vite. Horizon only consumes **Redis** queues → with `QUEUE_CONNECTION=database` jobs never run under `artisan dev`.
- Tests: Pest, 2 example tests pass (`php artisan test --compact`). PHPStan level 7. Pint preset laravel. CI (`.github/workflows/tests.yml`) runs `composer setup` + `composer ci:check` on **PHP 8.5 / Node 22**.
- JS: npm (`package-lock.json`) although `pnpm-workspace.yaml` + `.npmrc ignore-scripts=true` exist (starter leftovers). No `packageManager`.
- Boost: `backend/AGENTS.md` (gitignored, generated), skills in `backend/.claude/skills/`, MCP `php artisan boost:mcp` (failed to connect in this session — CONNECTION_CLOSED; investigate in Phase 4).

## 4. Frontend (`frontend/`) — verified

- `frontend/app` and `frontend/landing`: **unmodified `create-next-app` output**, Next **16.4.5**, React 19.3.1, TS ^7, Tailwind 4 via `@tailwindcss/turbopack`, `cacheComponents: true`, `partialPrefetching: true`, `experimental.agentFeedback: true`. ESLint 10 flat config. npm lockfiles. Identical except `name`.
- No `.env*` files in either app. Both default to port 3000.
- `frontend/arm` and `frontend/packages/*` **do not exist**.
- No root `package.json`, no pnpm workspace at `frontend/`, no `.node-version`/`.nvmrc`.

## 5. Product requirements — from `docs/about.md` (read in full)

`about.md` is a Russian product/marketing description with explicit hedges ("примерный стек", "вероятно SPA/PWA"). It is the **product source of truth**, not a technical spec.

**Functional:** aggregate rent/sale listings from dozens of public Telegram channels (text, photos, phone); dedupe the same property across channels into one card with all sources; feed sorted by time with Rent/Sale and New-build/Resale toggles; filters (city, district, rooms, property type apartment/house/room/commercial, budget+currency, rent term long/daily, hide agencies); OpenStreetMap map with price distribution by district; AI (Google Gemini) tags "from owner" vs "from realtor"; "below market" badge at ≈20% under district median; "radar" push notifications via Telegram bot per saved filter, incl. free-text queries ("двушка в Чиланзаре до $600"); favorites (♡), "already rented" hide; market analytics (median by rooms, monthly dynamics, district heatmaps, CSV export); ru/uz/en UI + currency choice; Telegram Mini App + PWA; closed-beta waitlist; `/privacy` command deletes all user data; PostHog (EU) analytics; voice message transcription via Gemini for support.

**Non-functional:** mobile-first, no registration (Telegram ID identity), minimal personal data (phone stored only as hash), channels polled "every few minutes", free/no ads.

**Entities (draft):** Listing, ListingSource (channel+post), Photo, Region/City, District, PropertyType, DealType, RentTerm, Price/Currency, OwnerType flag, MarketStats/PriceIndex, User (telegram_id, locale, currency), Favorite, RadarSubscription (filters), Notification, Report/Hide, WaitlistEntry.

**Critical product unknown (OPEN-1):** Telegram **Bot API cannot read arbitrary public channels** (a bot only receives channel posts where it is an admin). Aggregating "dozens of open channels" implies an **MTProto user client** (userbot) or a third-party source. `app.uz` already has a MadelineProto userbot driver (`app/Services/Telegram/Userbot/Drivers/MadelineProtoDriver.php`, 436 lines — verified present). This is an architecture-shaping decision (long-running process, account/TOS risk) → D9.

## 6. Reference codebase `app.uz` — subagent overview (sonnet), key claims spot-verified by main session

Verified directly: path exists; `.svn` at root (not git); `backend/composer.json` has `laravel/framework ^13.16`, `danog/madelineproto ^8.7`, `league/flysystem-aws-s3-v3 ^3.34`, `intervention/image ^4.1`, `dedoc/scramble ^0.13.28`, `spatie/laravel-medialibrary ^11.23`, `spatie/laravel-permission ^8.0`, `openai-php/laravel ^0.19.1`; no `statefulApi`/`EnsureFrontendRequestsAreStateful` in `bootstrap/app.php`; `createToken` ×13 in controllers (bearer-token auth); all reuse-candidate files below exist with the stated sizes.

Subagent-reported (unverified detail): one Laravel 13.39 monolith serving ~19 products (Http 825 files, Services 798, Models 266, Jobs 54, Resources 136, FormRequests 263, ~1,400 route lines, 115+ migrations in per-product subdirs); admin UI is Inertia + **Vue 3**; frontends are Vue 3/Vite SPAs except `frontend/lendo` (Next 16 static export); Pest 4 with 737 feature + 72 unit tests (not run); CI matrix stale (8.3/8.4 vs ^8.5); i18n via custom jsonb `HasTranslations` (ru default, uz, en); Horizon with Redis queues; no listings/geo/PostGIS domain (only 14 regions + Tashkent districts seeder); three independent Telegram webhook implementations (Bot, Qulay, Gramir), no bot SDK; custom media pipeline (content-addressed originals, EXIF strip, WebP variants 320/640/1024/1920) coupled to a DB-driven MinIO "ObjectStorage" module; secrets on disk (`backend/.env`, `.env.production`, `envprod`) — never copy.

**Reuse candidates (status per §4.1):**

| # | Path (under `app.uz/backend/`) | Purpose | Status |
|---|---|---|---|
| 1 | `app/Support/Telegram/InitDataVerifier.php` (75) | Telegram WebApp initData HMAC verify | READY |
| 2 | `app/Services/Bot/Channels/Telegram/TelegramClient.php` (91) + `TelegramException.php` | Bot API HTTP client w/ retries (Http facade) | READY |
| 3 | `app/Support/Localization/{HasTranslations,LocaleRegistry}.php` (173) | jsonb translatable attrs + fallback chain | READY |
| 4 | `app/Services/Bot/WebhookDispatcher.php` (187) + `Models/Bot/BotUpdateLog` + `Jobs/Bot/ProcessBotUpdateJob` | verify → unique `external_update_id` log → queue → fast 200 | NEEDS_ADAPTATION (pattern) |
| 5 | `app/Services/Media/{HashedUploader,MediaUrlBuilder,BucketDiskFactory}.php` + `Jobs/Media/GenerateImageVariantsJob.php` | hashed originals, EXIF strip, WebP variants | NEEDS_ADAPTATION (decouple from ObjectStorage module) |
| 6 | `Models/SmartAgent/{Region,District}` + `database/seeders/SmartAgent/SmartAgentGeoSeeder.php` | UZ regions + Tashkent districts (ru/uz/en) | NEEDS_ADAPTATION (no coords, Tashkent-only districts) |
| 7 | `Controllers/Api/V1/ApiController.php` + `withExceptions` in `bootstrap/app.php` | `{success,message,data|errors}` envelope | NEEDS_ADAPTATION (take default dialect only) |
| 8 | `app/Services/Telegram/Userbot/Drivers/MadelineProtoDriver.php` (436) | MTProto userbot driver | NEEDS_ADAPTATION / depends on D9 |
| 9 | `config/horizon.php` supervisors, `RateLimiter::for` set | shape only | NEEDS_ADAPTATION |
| 10 | `frontend/lendo/lib/{api,auth}.ts` | Next 16 API client (bearer + localStorage) | NEEDS_ADAPTATION (likely wrong for cookie/SSR) |
| 11 | Id SSO (`routes/id`, `IdentifyProject`, `project:*` abilities) | multi-product SSO | NOT_PORTABLE |

Rule: copy single files/patterns, never folders; adapt namespaces; respect READ-ONLY (hook enforcement in Phase 6).

## 7. CDN / S3 infrastructure — subagent overview (sonnet), key claims spot-verified

Verified directly: guide exists (171 lines, mtime 2026-06-22, Russian); 22 mentions of `index.html|dist/`, **0** mentions of presign/private/Laravel/flysystem; hosts `s3.hc.uz` ×5, `cdn.smartagent.uz` ×4, `cdn.proagent.uz` ×1; no secret values inline (placeholders only).

Subagent-reported: the guide covers **SPA static hosting** on `cdn.<project>.uz` (upload Vite `dist/` to a public-read MinIO bucket, nginx SPA fallback) — **not** media/private files. Provider: self-hosted single-disk **MinIO** on the same host as nginx (`31.220.104.38`), S3 API `127.0.0.1:9000`, console `127.0.0.1:9001`, public endpoint `https://s3.hc.uz` (path-style, region `us-east-1`), console `cmd.hc.uz` IP-restricted; per-project bucket + IAM user (write), anonymous `GetObject` only, 5 GiB quota; shared nginx `proxy_cache` zone `s3_cache` (20g, 7d) keyed with `$host`; `Cache-Control: public, max-age=31536000, immutable` for assets; certbot per-host ECDSA certs (`/etc/letsencrypt/live/<host>/`), ACME webroot, default server rejects unknown TLS handshakes; shared `security-headers.conf` includes `X-Frame-Options DENY`; rate-limit zones (static 50r/s, api 10r/s …); **no image transforms, no CORS, no brotli**; presigned URLs work via `s3.hc.uz` and bypass cache; `img.elbozor.uz` legacy local-FS vhost. The directory is an **SVN mirror** of the server's `/etc/nginx` with empty `sites-enabled/` → may be stale. **No PHP/Laravel vhost exists in the mirror** → where HOMI's Laravel will be hosted is unknown (OPEN-2). Useful for Phase 3 (not yet read): `server/scripts/onboard-project.sh`, `server/decisions/2026-05-26-minio-deployment.md`, `docs/api.md`, `docs/task/host.md`.

Implication for HOMI: `cdn.homi.uz` = new vhost cloned from the `s3.hc.conf` public-media blocks (not the SPA fallback), one public bucket + one **separate private bucket** served only via uncached presigned URLs; `hook.homi.uz` = new vhost + cert + DNS → wherever the Laravel app runs. Locally: MinIO on `127.0.0.1:9500` (free) behind `cdn.homi.loc`, mirroring the `s3.app.loc` convention.

**PROPOSED packages (REVIEW level, not installed):** `league/flysystem-aws-s3-v3` (required for any S3 disk), `intervention/image` (variants/EXIF strip; GD+imagick available), `dedoc/scramble` (OpenAPI for §12.4), `spatie/laravel-permission` (ARM roles — only if needed), `danog/madelineproto` (only if D9 = userbot). Deferred: sentry, spatie/laravel-backup (Phase 6/ops).

## 8. DECISIONS NEEDED — HUMAN APPROVAL checkpoint (§23.0)

```text
DECISION_NEEDED (one message, independent items; defaults in RECOMMENDATION apply if you say "go with recommendations")

D1  Local environment tooling
    OPTIONS:  A) Homebrew nginx + php-fpm + /etc/hosts (existing machine convention) + mkcert HTTPS on 443
              B) same but plain HTTP on :80 like every other local project here
              C) Docker Compose via colima (nothing else here uses it)
    RECOMMENDATION: A — reuses the proven local pattern, satisfies the master prompt's trusted-HTTPS requirement
                    (Secure cookies across *.homi.loc, Telegram Mini App dev). Needs `brew install mkcert`
                    and one `mkcert -install` (touches the system trust store — I will ask before running it).

D2  Auth Next.js ↔ Laravel
    OPTIONS:  A) Sanctum SPA cookie sessions (SESSION_DOMAIN=.homi.loc, stateful domains app/arm, CSRF cookie)
                 + Telegram as identity (WebApp initData / Login Widget), no passwords
              B) Sanctum bearer tokens in localStorage (app.uz pattern, reusable code exists)
    RECOMMENDATION: A — httpOnly cookies, works with Next.js SSR/Server Components, same parent domain in every env.
                    B only for the bot / non-browser clients if ever needed.

D3  Backend shape (Inertia+React starter vs API-only)
    OPTIONS:  A) Make backend API-only: remove inertia-laravel, wayfinder, React/Vite+ toolchain and resources/js
                 (dependency removal = REVIEW; Boost skills for inertia/wayfinder/tailwind dropped)
              B) Keep the Inertia+React stack and use it as the ARM admin instead of frontend/arm (Next.js)
              C) Keep it installed but unused
    RECOMMENDATION: A — three Next.js apps are mandated; a second UI stack inside the API doubles tooling,
                    CI and skills. Decided via ADR in Phase 1 before committing the baseline.

D4  JS package manager & pins
    OPTIONS:  A) pnpm workspace rooted at frontend/ (landing, app, arm, packages/*), root package.json with
                 packageManager pin, .node-version; backend keeps no JS after D3-A
              B) stay on npm everywhere (current state, app.uz convention)
    RECOMMENDATION: A (pnpm 11.24 already installed; master prompt stack). Node pin: decide 22 (CI today) vs 26 (local);
                    I will verify the current LTS line before pinning.

D5  Queue / cache / session drivers
    OPTIONS:  A) Redis for queue + cache (Horizon already installed and wired into `artisan dev`; Redis running
                 locally and used by app.uz in production); session = database
              B) database for everything (master prompt default), remove Horizon from dev processes
    RECOMMENDATION: A — otherwise Horizon is dead weight and radar notifications/queue visibility suffer. ADR required
                    because the master prompt lists Redis as "not in declared stack".

D6  Protected main on GitHub
    OPTIONS:  A) Upgrade org/repo plan (GitHub Pro/Team — paid) → real branch protection + required checks
              B) Conventions only: PR workflow + CI required by habit + local pre-push hook (not enforceable)
    RECOMMENDATION: B now, A when budget allows; I will not spend money without your OK.

D7  Commit the scaffolding baseline (backend/, frontend/) in Phase 1 after D3/D4 are applied
    RECOMMENDATION: yes (on a feature branch, PR to main).

D8  Smoke-test external AI CLIs (codex exec / gemini -p / grok) with one 1-line task each in Phase 4
    RECOMMENDATION: yes — trivial quota; needed to mark them AVAILABLE in the Cost Registry.

D9  Telegram channel ingestion (product-level)
    OPTIONS:  A) MTProto userbot (MadelineProto; app.uz driver reusable) — reads any public channel; needs a
                 dedicated Telegram account, long-running process, TOS/ban risk
              B) Bot API only — works only for channels where the bot is admin (partners/own channels)
              C) Hybrid: B now, A later
    RECOMMENDATION: decide before Phase 1 architecture boundaries; infra work does not block on it.

D10 Root prompt.md (staged duplicate of docs/ai/master-prompt.md)
    RECOMMENDATION: remove it from the index and the tree (`git rm --cached prompt.md && rm prompt.md`) — I will not
                    delete a file you created without your OK.

D11 server/ vs infra/ for nginx/env configs
    RECOMMENDATION: use `infra/` (master prompt layout) and delete the empty `server/` tree; or keep `server/` if
                    it mirrors app.uz deliberately — tell me which.

BLOCKED_UNTIL_DECIDED: Phase 2 (local env) and the dependency changes in Phase 1 (D3, D4, D5).
CONTINUING_MEANWHILE: non-destructive Phase 1 work — ADR drafts, package-registry generator, deep app.uz audit
                      (read-only subagents), docs skeleton, root standards.
```

## 9. ASSUMPTION_MISMATCHES

| # | Master prompt assumed | Reality | Decision / handling |
|---|---|---|---|
| AM-1 | Herd / Caddy / Docker as local tooling options | None installed; machine convention is Homebrew nginx + php-fpm + `/etc/hosts`; nginx currently stopped | D1 |
| AM-2 | Trusted local HTTPS | No local vhost uses TLS; mkcert absent | D1 (mkcert) |
| AM-3 | Redis "not in declared stack" | Redis running locally; Horizon installed and auto-wired into `artisan dev`; app.uz uses Redis queues | D5 |
| AM-4 | pnpm | npm lockfiles everywhere; stray `pnpm-workspace.yaml`/`.npmrc` in backend | D4 |
| AM-5 | Three Next.js apps + `frontend/packages` | Only `landing` and `app`, both pristine; no `arm`, no `packages` | Phase 2 creates skeletons (§1.3) |
| AM-6 | Laravel as API for Next.js | Backend is an Inertia+React SPA starter | D3 |
| AM-7 | Protected `main` | Not available on current GitHub plan | D6 |
| AM-8 | CDN guide describes media/S3 CDN | Guide is SPA static hosting; media patterns live in vhosts; no private-file/Laravel content | Phase 3 reads `s3.hc.conf`, onboarding script, MinIO decision doc |
| AM-9 | `app.uz` is a Git repo with history | SVN working copy, no git log | Freshness by mtime only |
| AM-10 | `docs/about.md` is a product specification | Marketing-style description with hedged tech stack | Treated as requirements source; entities derived in §5; gaps → OPEN questions |
| AM-11 | `artisan serve` on :8000 | 8000/8001 occupied by HTTP Toolkit | Use nginx+php-fpm (no `serve`) or alternate port |
| AM-12 | `.env.example` current | Missing DB_* and REVERB_* keys | Fix in Phase 2; `dev:check` key diff |
| AM-13 | CI and local Node aligned | CI Node 22, local Node 26; no pins | D4 |
| AM-14 | Layout uses `infra/` | Repo has empty `server/{local,staging,production}/host` | D11 |
| AM-15 | Laravel Boost MCP available | `laravel-boost` MCP failed to connect this session (CONNECTION_CLOSED) | Investigate in Phase 4 |
| AM-16 | Telegram ingestion via Bot API | Public-channel aggregation needs MTProto or partner channels | D9 / OPEN-1 |

## 10. RISKS

- R1 Telegram ingestion approach unresolved (OPEN-1) — shapes the core domain and operations.
- R2 Staging/production hosting for the Laravel app is unknown (OPEN-2); the nginx mirror has no PHP vhost; `hook.homi.uz` needs HTTPS + public DNS.
- R3 Single-disk MinIO, data backups unconfirmed (subagent); private files must never share a public bucket or cached location; `X-Frame-Options DENY` in shared headers.
- R4 Queue silently idle in local dev (Horizon vs database driver) until D5.
- R5 Secrets on disk in `app.uz` — hook enforcement (Phase 6) must precede any copying work by agents.
- R6 Many running services on this machine (mysql, mongo, opensearch, rabbitmq, memcached, HTTP Toolkit) → port planning must be explicit.
- R7 Model-knowledge staleness: Laravel 13, Next 16.4, Pest 5, TS 7, Vite+ — always consult installed docs/Boost.
- R8 Reference code is Russian-commented, multi-product coupled; copying folders would import coupling.

## 11. BLOCKERS

- None hard. Soft: decisions D1–D11 gate Phase 1 dependency changes and Phase 2.

## 12. OPEN QUESTIONS

- OPEN-1 Channel ingestion mechanism (D9).
- OPEN-2 Where will api/hook/app for staging & production run (same box as MinIO, another server, Laravel Cloud)? DNS control for `homi.uz`?
- OPEN-3 Bot identities: separate dev/staging/prod bots exist? Mini App vs Login Widget?
- OPEN-4 AI vendor: about.md says Gemini; `laravel/ai` supports it — confirm Gemini (API key ownership) vs other providers.
- OPEN-5 Dedup algorithm expectations (text+phone+photo hashing?) and "below market" median definition — product owner input.
- OPEN-6 Analytics: PostHog EU account exists?
- OPEN-7 Who are the two developers' GitHub accounts (CODEOWNERS)?
- OPEN-8 Is `about.md` final or still being edited (it is staged with later modifications)?

## 13. PLAN (concretized for Phases 1–7)

**Phase 1 — Foundation** (after checkpoint; non-destructive parts start immediately)
1. Root standards: `.gitignore` (done), `.editorconfig`, `.node-version`, root `package.json` (pnpm workspace per D4), `composer.json` platform pin.
2. ADRs in `docs/architecture/decisions/`: 0001 monorepo layout & canonical paths; 0002 backend API-only (D3); 0003 auth strategy (D2); 0004 package manager & version pins (D4); 0005 queue/cache/session drivers (D5); 0006 time (UTC store / Asia/Tashkent display) & i18n (jsonb translations, ru/uz/en); 0007 API `/api/v1`, error envelope, pagination; 0008 local env tooling (D1); 0009 Telegram ingestion (D9, may be "deferred"); 0010 Git workflow without branch protection (D6).
3. `scripts/packages/registry` (PHP, deterministic from `composer show --format=json`, `composer audit`, `composer outdated --direct`, `rg -l` usage) → `docs/backend/package-registry.md` with `composer.lock` checksum + `.ai/memory/package-capabilities.md`; PROPOSED list from §7.
4. Deep `app.uz` audit by parallel read-only subagents (auth, media, webhook/bot, i18n/geo, tests/CI, frontend) → `docs/reference-codebase.md`.
5. `docs/architecture/overview.md` with module boundaries (Listings, Ingestion, Dedup, Geo, Pricing/Stats, Users/Auth, Radar/Notifications, Media, Bot/Webhook, Admin).
6. Apply D3/D4, commit scaffolding baseline on a branch, PR.

**Phase 2 — Local environment**
- `/etc/hosts`: `homi.loc app.homi.loc arm.homi.loc api.homi.loc cdn.homi.loc hook.homi.loc`; mkcert cert for those names; nginx vhosts in `infra/local/nginx/` symlinked into `sites-enabled`; api → php-fpm 9000 (`backend/public`), hook → same app, cdn → MinIO 9500 (bucket `homi-public`), landing/app/arm → Next dev on 3000/3001/3002 with HMR/WebSocket proxying and `allowedDevOrigins`.
- MinIO launch (brew service or script), buckets `homi-public`, `homi-private`, `homi-tmp`.
- Sanctum/CORS/session config for `.homi.loc` (per D2). `.env.example` sync for backend and all frontends.
- `frontend/arm` + `frontend/packages/{ui,api-client,types,utils,config}` skeletons; pnpm workspace.
- `Makefile` (make is present; Taskfile absent): `dev-setup|start|stop|restart|status|logs|check|reset` (reset asks for confirmation); `scripts/dev/check.sh` implements §6.6.

**Phase 3 — CDN & webhook**: install `league/flysystem-aws-s3-v3` (+ `intervention/image`) after approval; disks public/private/tmp; adapted media pipeline from app.uz #5; presigned upload; `cdn.homi.loc` verification; Telegram webhook route behind `hook.*` with secret-token middleware, body-size limit, dedup `(bot_id, update_id)` with TTL in DB, queued processing, `telegram:webhook:set|info|delete` with production guard; docs `infrastructure/cdn.md`, `infrastructure/telegram-webhook.md`.

**Phase 4 — AI infrastructure**: rewrite root `CLAUDE.md` (≤150 lines, imports `AGENTS.md`), `AGENTS.md`, thin `GEMINI.md`, `.ai/{rules,skills,agents,tasks,memory,templates}`, `.claude/{agents,rules,skills,settings.json}` + hooks (SessionStart, PreToolUse deny-list incl. `$APPUZ_ROOT` writes, PostToolUse Pint/ESLint, Stop, PreCompact), `scripts/agents/{codex,gemini,grok}.sh` wrappers (contract in → contract out), `scripts/ai/sync-instructions`, fix Boost MCP, custom `homi-*` skills, first real delegated task.

**Phase 5 — Memory & docs**: `.ai/memory/*` (≤150 lines each), handoff discipline, dependency-change checksum check, fresh-session recovery test.

**Phase 6 — Quality & security**: Pest/PHPStan/Pint gates, frontend lint/types/build + Playwright skeleton, gitleaks (install) pre-commit + CI, CI workflows for backend + frontend + OpenAPI/client drift, worktree helpers, permission tests.

**Phase 7 — Verification**: scenarios A–O by an independent verifier subagent → `docs/testing/verification-log.md`; final report `docs/ai/reports/setup-final.md`.

```text
REUSED_PACKAGES:   none yet (discovery only); laravel/ai GeminiProvider identified for about.md AI needs
REUSED_CODE:       none yet; 11 candidates catalogued (§6)
FILES_CHANGED:     docs/ai/master-prompt.md (new, copy of prompt v3.1), docs/ai/reports/phase-0.md (new),
                   CLAUDE.md (mandate pointer added), .gitignore (new, root)
TESTS:             backend `php artisan test --compact` → 2 passed (pre-existing examples); nothing else executed
VERIFIED_BY:       main session (Fable 5.1) for §1–5 and spot checks in §6–7; Explore subagents (sonnet) for the
                   remainder of §6–7 — marked "subagent-reported"
COMMIT:            see git log — chore(phase-0): discovery report and master prompt (branch chore/phase-0-discovery)
REPORT_FILE:       docs/ai/reports/phase-0.md
NEXT_ACTION:       human answers D1–D11 (or "go with recommendations"); meanwhile Phase 1 non-destructive items 1–5
```

## 14. Checkpoint outcome (2026-11-08, answered by the developer)

| # | Decision | Answer | Consequence |
|---|---|---|---|
| D1 | Local tooling | Homebrew nginx + php-fpm + `/etc/hosts` + **mkcert HTTPS** | ADR-0008; `mkcert -install` only after a separate OK |
| D2 | Auth | **Sanctum bearer tokens** (app.uz pattern), Telegram as identity | ADR-0003; reuse `TokenController`, `frontend/lendo/lib/{api,auth}.ts`, `InitDataVerifier` |
| D3 | Backend shape | **Keep Inertia+React stack installed, unused (frozen)** | ADR-0002; agents must not build UI in `backend/resources/js` |
| D4 | JS tooling | **pnpm workspace** in `frontend/`, `packageManager` + `.node-version` pins | ADR-0004; Node 26 (Active LTS since 2026-10-28 per official schedule), pnpm 11.24 |
| D5 | Drivers | **Redis queue + cache, Horizon**; session = database | ADR-0005 |
| D6 | Protected main | **Conventions + CI + local hooks** (no paid plan) | ADR-0010; PR workflow, CODEOWNERS = `amediateam` |
| D7 | Scaffolding commit | **Yes**, on a branch after pnpm conversion | Phase 1 |
| D8 | External CLI smoke tests | **Yes** (codex / gemini / grok, 1 line each) | Phase 4 |
| D9 | Listing ingestion | **HOMI owns its DB; sources push into it.** Collection lives outside this repo: `telegram.uz` (Laravel 13 + MadelineProto, REST `/v1`), `geo.uz` (web sources), `datahub.uz` (dedup/canon platform, intake not built yet, no consumer API today) | ADR-0009: authenticated, idempotent intake API in HOMI; `hook.homi.uz` scope widens to "inbound integrations" |
| D10 | Root `prompt.md` | **Remove** (canonical copy is `docs/ai/master-prompt.md`) | Phase 1 housekeeping |
| D11 | `server/` vs `infra/` | **Delete empty `server/`, use `infra/`** | ADR-0001 |
| H | Hosting | Web server **159.253.19.121** (nginx mirror with PHP vhosts exists locally at `Server/nginx/159.253.19.121`), PostgreSQL **5.45.127.98**, MinIO **31.220.104.38** (`s3.hc.uz`) | ADR-0011; Phase 3/6 read that mirror |
| B | Telegram bots | **All three exist** (dev / staging / prod) | names + token env keys in `.env.example`; prod webhook untouched without explicit OK |
| AI | AI vendor | **Decide later**, before the first AI feature | `laravel/ai` stays; provider via env |
| 2D | Second developer | **macOS with the same Homebrew stack** | `dev:setup` may rely on brew + `/etc/hosts` + `/opt/homebrew/etc/nginx` |
| CO | CODEOWNERS | `amediateam` only for now | `.github/CODEOWNERS` |
| L | Locale/currency | **ru default + fallback, UZS default**; UTC stored, `Asia/Tashkent` displayed; ru/uz/en jsonb translations | ADR-0006 |
| A | `docs/about.md` | **Preliminary description**; real documentation is built incrementally — structure it for maximum effectiveness | Phase 1 docs skeleton, ADR-0001 |

Supersedes the recommendations in §8 where they differ (D2, D3).
