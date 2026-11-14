# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandate and session start

- The engineering setup follows `docs/ai/master-prompt.md` (v3.1). It is the source mandate; it is not imported here. Changes to it go through a PR with a short ADR.
- Phase reports live in `docs/ai/reports/phase-<N>.md`. Read the latest one first. Phases 0 (discovery), 1 (foundation) and 2 (local environment) are complete; the checkpoint decisions are recorded in `docs/architecture/decisions/`. Phase 3 (CDN, webhook, intake) is in progress (paused WIP; its approved packages are installed) and Phase 4 (AI infrastructure) is partly applied (`docs/ai/reports/phase-4-plan.md`). Session memory for agents: `.ai/memory/{current-state,session-handoff,known-issues}.md`.
- Since 2026-11-09 work runs on two tracks — **development** (second developer: application code, plan in `HANDOFF.md` §4) and **production** (first developer: staging/production). Read `HANDOFF.md` and `docs/handoff/parallel-work.md` before starting; they say who owns which paths and how branches, migrations and shared files are handled.
- The kvadro² → HOMI migration is planned in `docs/migration/` (conventions in its `README.md`). Wave 1 is worked from the single queue `docs/migration/wave-1/README.md`: take the first package that is not `DONE` and read its specification. The legacy checkout (`KVADRO_ROOT` in `.ai/local.env`) is read-only: no edits, no builds, no `npm`, no dev server there, and no copy of its code.
- Talk to the developer in the language they write (Russian so far). Repository artifacts (docs, rules, code comments, commits) are in English.
- `app.uz` (a sibling checkout; its path is `APPUZ_ROOT` in `.ai/local.env`, template in `.ai/local.env.example`) is a reference codebase: **read-only**, and read it only through read-only subagents, never in the main context. Never copy its `.env*` files or secrets. Machine-specific absolute paths never go into repository files.
- Keep the main session's context small: delegate large reads to Explore subagents, and prefer `rg -n`/`sed -n` over printing whole files.

## Project

homi.uz aggregates housing rental and sale listings from public Telegram channels in Uzbekistan. It turns them into one deduplicated feed with filters and a map. It also sends "radar" alerts through a Telegram bot, uses Google Gemini to tag listings as owner or realtor, and flags listings priced about 20% below the district median. The UI is in ru/uz/en. `docs/about.md` (in Russian) is a product overview, not a technical spec. Parts of its "tech stack" section are guesses.

**Current state: foundation + Phase 3 WIP.** `backend/` started as a Laravel React starter kit; its Inertia/React UI is **frozen** (ADR-0002) — the backend is developed as an API. Phase 3 added the media module (`/api/v1/media*`), the API envelope, request ids, Horizon queues and the intake/Telegram tables; the Telegram webhook is a fail-closed stub (details: `.ai/memory/current-state.md`). The three Next.js apps are `create-next-app` output plus env/config. No other domain code exists yet. Decisions live in `docs/architecture/decisions/`; architecture in `docs/architecture/overview.md`.

## Layout

One git repo at the root (`docs/architecture/decisions/0001-…` has the canonical layout). `backend/` and `frontend/` have separate toolchains; run commands from inside them.

- `backend/`: Laravel 13 on PHP 8.5 (pinned `^8.5`), with a frozen Inertia v3 + React 19 + TypeScript 7 + Tailwind 4 starter UI. Installed packages: Horizon, Reverb, Sanctum, Scout, Socialite, Pennant, Pulse, Telescope, `laravel/ai`, `laravel/mcp`, Wayfinder, Dusk. Full registry: `docs/backend/package-registry.md` (generated; compact index `.ai/memory/package-capabilities.md`).
- `frontend/`: **pnpm workspace** (`pnpm@11.24.0`, Node 26 from `.node-version`) with `landing/`, `app/`, `arm/` — three Next.js 16.4 App Router apps (Tailwind 4 via the turbopack loader, `cacheComponents`, `partialPrefetching`, `@/*` alias per app) — and `packages/*` with the shared workspace packages `@homi/config` (locales, currencies, defaults), `@homi/types` (API envelope, pagination), `@homi/utils` (formatting), `@homi/api-client` (`createApiClient`, `ApiError`), `@homi/ui` (`cn`) and the dev-only `@homi/testing` (fake Telegram, synthetic `initData`, `freezeClock`, API fixtures; `@homi/testing/playwright` for specs — ESLint forbids it outside test files). Apps import them as workspace dependencies; each package has `lint`/`typecheck`/`test` scripts so `pnpm -r` covers them. The Wave 1 npm packages (WP-03) are installed, but no product code uses them yet.

## Commands

### backend (`cd backend`)

```bash
composer setup                    # first-time: install deps, .env, key, migrate, npm install + build
composer run dev                  # `php artisan dev` TUI: serve (:8000), horizon, reverb, pail, vite
php artisan test --compact        # Unit + Feature suites (the Pgsql suite is skipped here)
php artisan test --compact tests/Feature/ExampleTest.php   # single file
php artisan test --compact --filter=testName               # single test
php artisan dusk                  # browser tests in tests/Browser (not run by `artisan test`)
vendor/bin/pint --dirty --format agent   # format changed PHP files — run after any PHP edit
composer types:check              # PHPStan/Larastan level 7 (app, config, database, routes, bootstrap/app.php)
npm run check                     # Vite+ (`vp`) lint + format check, warnings are errors; `check:fix` to fix
npm run types:check               # tsc --noEmit
composer ci:check                 # what CI runs: npm check, tsc, pint --test, phpstan, tests
```

If the UI doesn't reflect a frontend change, or you see "Unable to locate file in Vite manifest", run `npm run build` (or have the dev server running).

### Next.js apps (`cd frontend`)

```bash
pnpm install                        # whole workspace (frontend/pnpm-lock.yaml)
pnpm --filter app dev               # landing → 3000, app → 3001 (`-- -p 3001`), arm → 3002
pnpm -r lint                        # eslint (next core-web-vitals + typescript) in every app
pnpm -r build
pnpm test                           # Vitest, every project (frontend/vitest.config.mts); TZ=UTC unless set
pnpm --filter @homi/utils test      # one package; `pnpm test:watch` for watch mode
pnpm test:e2e                       # Playwright (builds + starts app on :3001; E2E_BASE_URL=https://app.homi.loc to reuse the dev server)
```

Unit tests reject any unmocked `fetch` (`frontend/vitest.setup.ts`); Playwright specs import `test`/`expect` from `@homi/testing/playwright`, whose guard fails a test after a request to an external host. Run `pnpm exec playwright install chromium` once per machine. Dependency install scripts are decided in `allowBuilds` of `frontend/pnpm-workspace.yaml` (pnpm 11 fails an install while one is undecided); never commit a `minimumReleaseAgeExclude` entry. Known peer-dependency warnings (eslint 10 / TypeScript 7 vs `eslint-config-next` plugins; `openapi-typescript` wants TypeScript 5) are expected.

### Repository tooling (root)

```bash
make help                           # all targets
make dev-setup                      # fresh clone → running local stack (announces sudo steps)
make dev-start | dev-stop | dev-status | dev-logs   # Horizon + Next dev servers behind nginx
make dev-check                      # health check (DNS, TLS, ports, API, CDN, DB, Horizon, env keys)
make ci-backend | ci-frontend       # the CI gates locally (ci-frontend includes `pnpm test`)
make e2e                            # Playwright suite (`pnpm test:e2e`)
make test-pgsql                     # backend tests/Pgsql on a PostgreSQL database ending in _test (default homi_test)
make registry | registry-check      # Composer registry after any composer.lock change
```

Local URLs: `https://homi.loc`, `https://app.homi.loc`, `https://arm.homi.loc`, `https://api.homi.loc`, `https://cdn.homi.loc` (static `backend/storage/app/public`), `https://hook.homi.loc`. Details: `docs/infrastructure/local-development.md`. Never use `php artisan serve` (ports 8000/8001 are taken on the developer machines).

## Backend architecture and gotchas

- **Inertia SPA:** `routes/web.php` renders pages from `resources/js/pages/*.tsx` (for example `Route::inertia('/', 'welcome')`). Shared props (`name`, `auth.user`) are set in `app/Http/Middleware/HandleInertiaRequests.php`. The root template is `resources/views/app.blade.php`.
- **API:** `routes/api.php` is guarded by Sanctum. `bootstrap/app.php` renders exceptions as JSON for `api/*` and for requests that expect JSON.
- **Wayfinder:** generates typed TS helpers for routes and controllers into `resources/js/{actions,routes,wayfinder}`. These files are gitignored, regenerated by the Vite plugin, and must not be hand-edited. Import from `@/actions/...` or `@/routes/...` instead of hardcoding URLs.
- **JS tooling:** `vite` is aliased to Vite+ (`@voidzero-dev/vite-plus-core`) through npm `overrides`. The `lint` and `fmt` sections of `vite.config.ts` replace ESLint and Prettier: 4-space indent, single quotes, 80 columns, Tailwind class sorting for `clsx`/`cn`/`cva`. The React Compiler is enabled through a babel preset. `.npmrc` sets `ignore-scripts=true`.
- **Realtime:** broadcasting goes through Reverb, and Echo is configured in `resources/js/app.tsx`.
- **Defaults in `AppServiceProvider`:** dates are `CarbonImmutable`. Destructive DB commands are blocked in production. Strict password rules apply only in production.
- **Databases:** `.env.example` and the local `.env` use PostgreSQL (`DB_CONNECTION=pgsql`). Tests run on in-memory SQLite (`phpunit.xml`, with Pulse and Telescope disabled), so Postgres-specific SQL behaves differently in tests; such tests and concurrent writes go into `tests/Pgsql` (base `Tests\PgsqlTestCase`, `concurrently()` in `tests/Pest.php`), which runs only through `make test-pgsql` / CI and refuses a database whose name does not end in `_test`. Feature tests get `RefreshDatabase` automatically (`tests/Pest.php`).
- **Queues:** Horizon only consumes **Redis** queues (`config/horizon.php`); `.env.example` and the local `.env` set `QUEUE_CONNECTION=redis` and `CACHE_STORE=redis` (ADR-0005). `make dev-start` runs Horizon; `make dev-check` fails if the queue driver is not `redis`. An old `.env` with `QUEUE_CONNECTION=database` leaves queued jobs unprocessed.
- **Media:** the `public` disk writes to `storage/app/public`, served locally by nginx as `https://cdn.homi.loc` (`MEDIA_PUBLIC_URL`, ADR-0012). MinIO/S3 exists only in staging and production; `AWS_*` stays blank locally.
- **Local dashboards:** `/horizon`, `/telescope`, `/pulse`.

## Backend conventions (Laravel Boost)

`backend/AGENTS.md` holds the full Laravel Boost guidelines. Boost generates it with `php artisan boost:update`, which also runs after `composer update`, and the file is gitignored. Skills follow one canonical store: third-party skills are vendored in `.ai/skills/` (provenance in `.ai/skills/SOURCES.md`), and `php artisan boost:update` (run in `backend/`; `backend/.ai` is a symlink to `.ai/`) regenerates the gitignored per-agent directories at the repository root — `.claude/skills/` for Claude Code (official Boost skills such as `laravel-best-practices`, `testing-best-practices`, `configuring-horizon`, `scramble-development` plus symlinks to `.ai/skills/*`), `.agents/skills` for Codex, `.grok/skills` for Grok. `backend/boost.json` (tracked) records the agent and skill selection. Read the relevant skill before working in its area; `.ai/README.md` explains the layout. Key rules:

- Create files with `php artisan make:* --no-interaction`, and use `make:class` for plain classes. New models get a factory and a seeder. Create tests with `php artisan make:test --pest Name` (add `--unit` for unit tests). Prefer feature tests that use factories.
- PHP style: always use curly braces, constructor property promotion, explicit parameter and return types, TitleCase enum keys, and PHPDoc (with array shapes) instead of inline comments.
- Don't add or change dependencies, or create new top-level folders, without approval. Don't delete tests without approval.
- Inertia v3 has no axios: use the built-in client or `useHttp`. `Inertia::lazy()` is gone, so use `Inertia::optional()`. Use `router.cancelAll()` instead of `router.cancel()`. Deferred props need a skeleton empty state.
- The Laravel Boost MCP server is declared in the root `.mcp.json` (`php backend/artisan boost:mcp`, project scope) and provides `search-docs`, `database-schema`, `database-query` and `browser-logs`. Use `search-docs` before relying on version-specific Laravel ecosystem APIs. It must be started from the repository root; `backend/.mcp.json` is not read by Claude Code sessions started here.

## Agent guard rails (hooks, permissions, subagents)

- `.claude/settings.json` (committed) wires three Python hooks from `.ai/hooks/` and the permission baseline. The **PreToolUse guard** denies writes and project tooling under the reference codebases (paths from `.ai/local.env`, fallback: folders named `app.uz`, `telegram.uz`, `datahub.uz`, `geo.uz`, `kvadro.uz`) and any read, print or copy of `.env*` (except `*.example`), `envprod*`, `key.md` and private keys — list key names with `grep -o '^[A-Z_]*=' backend/.env` instead. The **SessionStart hook** injects `.ai/memory/session-handoff.md`, high-severity known issues and the next `AM-`/`KI-` numbers. The **PostToolUse hook** runs Pint / `eslint --fix` / `vp fmt` on the edited file and tells you when it rewrote it (re-read before the next edit). Details and limits: `.ai/hooks/README.md`; tests: `make ai-hooks-test`.
- Permission rules: `ask` for sudo, force-push, hard resets, destructive artisan commands, dependency changes, process kills, ssh/scp/rsync/psql; `deny` for `php artisan serve`, `brew services start|restart nginx` (KI-13) and edits of generated files (`backend/AGENTS.md`, Wayfinder output, `.claude/skills/**`, the package registry).
- Subagent definitions live in `.ai/agents/` (`.claude/agents` is a symlink). Use the read-only `reference-reader` agent for anything in `app.uz`; the domain agents (Telegram bot, intake pipeline, listing matching, PostGIS, security review) carry the HOMI-specific rules distilled from the reference codebase.
- Machine-specific paths belong in `.ai/local.env` (copy `.ai/local.env.example`; gitignored). Without it the hooks still run, but recognise reference codebases only by folder name.
- Agents other than Claude Code (Codex, Grok) start from the root `AGENTS.md`, which points at this file and restates the hard rules; the hooks and permission lists do not run there (`docs/handoff/environment.md` §4).

## Next.js conventions

Next.js 16.4 has breaking changes compared with older versions. Before writing Next.js code, read the relevant guide in that app's `node_modules/next/dist/docs/` (per `frontend/*/AGENTS.md`). `next dev` regenerates that AGENTS.md block.
