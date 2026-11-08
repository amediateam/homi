# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandate and session start

- The engineering setup follows `docs/ai/master-prompt.md` (v3.1). It is the source mandate; it is not imported here. Changes to it go through a PR with a short ADR.
- Phase reports live in `docs/ai/reports/phase-<N>.md`. Read the latest one first; Phase 0 (discovery) is complete and its section 8 lists decisions that are still waiting for a human. Do not start Phase 2 (local environment) or change dependencies until those are answered.
- Talk to the developer in the language they write (Russian so far). Repository artifacts (docs, rules, code comments, commits) are in English.
- `/Users/shohsanam/Documents/Development/Server/app.uz` is a reference codebase: **read-only**, and read it only through read-only subagents, never in the main context. Never copy its `.env*` files or secrets.
- Keep the main session's context small: delegate large reads to Explore subagents, and prefer `rg -n`/`sed -n` over printing whole files.

## Project

homi.uz aggregates housing rental and sale listings from public Telegram channels in Uzbekistan. It turns them into one deduplicated feed with filters and a map. It also sends "radar" alerts through a Telegram bot, uses Google Gemini to tag listings as owner or realtor, and flags listings priced about 20% below the district median. The UI is in ru/uz/en. `docs/about.md` (in Russian) is a product overview, not a technical spec. Parts of its "tech stack" section are guesses.

**Current state: scaffolding + foundation.** `backend/` is a Laravel React starter kit (User model, one `welcome` page, example tests); its Inertia/React UI is **frozen** (ADR-0002) — the backend is developed as an API. The three Next.js apps are unmodified `create-next-app` output. No domain code exists yet. Decisions live in `docs/architecture/decisions/`; architecture in `docs/architecture/overview.md`.

## Layout

One git repo at the root (`docs/architecture/decisions/0001-…` has the canonical layout). `backend/` and `frontend/` have separate toolchains; run commands from inside them.

- `backend/`: Laravel 13 on PHP 8.5 (pinned `^8.5`), with a frozen Inertia v3 + React 19 + TypeScript 7 + Tailwind 4 starter UI. Installed packages: Horizon, Reverb, Sanctum, Scout, Socialite, Pennant, Pulse, Telescope, `laravel/ai`, `laravel/mcp`, Wayfinder, Dusk. Full registry: `docs/backend/package-registry.md` (generated; compact index `.ai/memory/package-capabilities.md`).
- `frontend/`: **pnpm workspace** (`pnpm@11.24.0`, Node 26 from `.node-version`) with `landing/`, `app/`, `arm/` — three Next.js 16.4 App Router apps (Tailwind 4 via the turbopack loader, `cacheComponents`, `partialPrefetching`, `@/*` alias per app) — and `packages/*` for shared code (created in Phase 2).

## Commands

### backend (`cd backend`)

```bash
composer setup                    # first-time: install deps, .env, key, migrate, npm install + build
composer run dev                  # `php artisan dev` TUI: serve (:8000), horizon, reverb, pail, vite
php artisan test --compact        # Unit + Feature suites
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
```

There is no test setup in the Next.js apps yet. Known peer-dependency warnings (eslint 10 / TypeScript 7 vs `eslint-config-next` plugins) come from the create-next-app template.

### Repository tooling (root)

```bash
scripts/packages/registry           # regenerate the Composer registry after any composer.lock change
scripts/packages/registry --check   # CI check: registry matches composer.lock
```

## Backend architecture and gotchas

- **Inertia SPA:** `routes/web.php` renders pages from `resources/js/pages/*.tsx` (for example `Route::inertia('/', 'welcome')`). Shared props (`name`, `auth.user`) are set in `app/Http/Middleware/HandleInertiaRequests.php`. The root template is `resources/views/app.blade.php`.
- **API:** `routes/api.php` is guarded by Sanctum. `bootstrap/app.php` renders exceptions as JSON for `api/*` and for requests that expect JSON.
- **Wayfinder:** generates typed TS helpers for routes and controllers into `resources/js/{actions,routes,wayfinder}`. These files are gitignored, regenerated by the Vite plugin, and must not be hand-edited. Import from `@/actions/...` or `@/routes/...` instead of hardcoding URLs.
- **JS tooling:** `vite` is aliased to Vite+ (`@voidzero-dev/vite-plus-core`) through npm `overrides`. The `lint` and `fmt` sections of `vite.config.ts` replace ESLint and Prettier: 4-space indent, single quotes, 80 columns, Tailwind class sorting for `clsx`/`cn`/`cva`. The React Compiler is enabled through a babel preset. `.npmrc` sets `ignore-scripts=true`.
- **Realtime:** broadcasting goes through Reverb, and Echo is configured in `resources/js/app.tsx`.
- **Defaults in `AppServiceProvider`:** dates are `CarbonImmutable`. Destructive DB commands are blocked in production. Strict password rules apply only in production.
- **DB mismatch:** local `.env` uses PostgreSQL, while `.env.example` still has SQLite defaults. Tests run on in-memory SQLite (`phpunit.xml`, with Pulse and Telescope disabled), so Postgres-specific SQL behaves differently in tests. Feature tests get `RefreshDatabase` automatically (`tests/Pest.php`).
- **Queue gotcha:** `php artisan dev` replaces `queue:listen` with Horizon, but Horizon only consumes **Redis** queues (`config/horizon.php`). `.env` has `QUEUE_CONNECTION=database`, so queued jobs will sit unprocessed in local dev unless you switch to `redis` or run `php artisan queue:listen` yourself.
- **Local dashboards:** `/horizon`, `/telescope`, `/pulse`.

## Backend conventions (Laravel Boost)

`backend/AGENTS.md` holds the full Laravel Boost guidelines. Boost generates it with `php artisan boost:update`, which also runs after `composer update`, and the file is gitignored. Boost skills live in `backend/.claude/skills/` (for example `inertia-react-development`, `wayfinder-development`, `tailwindcss-development`, `testing-best-practices`, `laravel-best-practices`). Read the relevant skill before working in its area. Key rules:

- Create files with `php artisan make:* --no-interaction`, and use `make:class` for plain classes. New models get a factory and a seeder. Create tests with `php artisan make:test --pest Name` (add `--unit` for unit tests). Prefer feature tests that use factories.
- PHP style: always use curly braces, constructor property promotion, explicit parameter and return types, TitleCase enum keys, and PHPDoc (with array shapes) instead of inline comments.
- Don't add or change dependencies, or create new top-level folders, without approval. Don't delete tests without approval.
- Inertia v3 has no axios: use the built-in client or `useHttp`. `Inertia::lazy()` is gone, so use `Inertia::optional()`. Use `router.cancelAll()` instead of `router.cancel()`. Deferred props need a skeleton empty state.
- The Laravel Boost MCP server (`backend/.mcp.json`, which runs `php artisan boost:mcp`) provides `search-docs`, `database-schema`, `database-query` and `browser-logs`. Use `search-docs` before relying on version-specific Laravel ecosystem APIs.

## Next.js conventions

Next.js 16.4 has breaking changes compared with older versions. Before writing Next.js code, read the relevant guide in that app's `node_modules/next/dist/docs/` (per `frontend/*/AGENTS.md`). `next dev` regenerates that AGENTS.md block.
