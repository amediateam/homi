---
updated: 2026-11-16 (development track: WP-00, WP-01, WP-02 merged into main, all three WAITING; WP-03 merged (#39, #41), WAITING for the deploy; WP-10 merged (#42, #43, #44), WAITING for the production track; WP-11 merged (#45, #46, #47), WAITING for the production track; WP-12 merged (#48, #49), WAITING for the production track; WP-13 merged (#50; `main` = `6c48ce6`), WAITING for the production track; WP-20 merged (#52, #53), WAITING for the deploy; WP-21 merged (#55, shared files #54; `main` = `31b53f4`), WAITING for the production track; WP-22 merged (#61; `main` = `e8c8f9e`), WAITING for the deploy; local tooling: dev-check fix #63 and nginx fix #64 merged (`main` = `59a34ad`); the Infrastructure section was last updated by the production track on 2026-11-09)
source-of-truth: git log, docs/ai/reports/phase-2.md, docs/ai/reports/phase-4-plan.md, docs/ai/reports/production-notes.md, docs/architecture/decisions/, HANDOFF.md §6, `make dev-check`, `make ci-backend`, `make ai-hooks-test` output
---

# Current state (facts only)

## Repository
- Branches: `main` holds everything — the phase stack (phase-0 … phase-4) was merged on 2026-11-09 through PRs #1–#4 with merge commits (last `834d69d`); the `chore/phase-*` branches are history. PRs #6–#8 merged later the same day. On 2026-11-14 `main` is at `596d0db` (last merge PR #24); PR #9 (`docs/migration/` + `scripts/migration/`, the kvadro² audit and migration plan) is merged as `b583d3d`. Open (`gh pr list`, 2026-11-14): Dependabot PR #5 (TypeScript 7 — not to be merged, KI-4); PR #25 (`docs/three-wave-plan`: the three-wave strategy and the Wave 1 plan — not on `main` yet). No branch protection (free GitHub plan) and no local push guard yet (KI-19).
- Two tracks since 2026-11-09: development (second developer, Codex) and production (first developer) — `HANDOFF.md`, `docs/handoff/parallel-work.md`.
- Tracked: backend baseline, frontend pnpm workspace (landing, app, arm, packages/*), `infra/local/nginx`, `scripts/dev`, `Makefile`, docs, ADRs 0001–0013 and 0015 (Accepted), 0016–0020 (merged 2026-11-15 with `Status: Proposed`, waiting for the first developer's acceptance), `scripts/packages/registry`, root CI workflows, CODEOWNERS, `HANDOFF.md`, `AGENTS.md`, `docs/handoff/`.
- Gitignored machine files: `infra/local/certs/`, `infra/local/nginx/snippets/paths.conf`, `infra/local/{run,logs}/`, `.ai/local.env`, `backend/.env`, `frontend/*/.env.local`.

## Backend (`backend/`)
- Laravel 13.42 (`php artisan --version` after PR #26, merged 2026-11-14), PHP 8.5.12, `php ^8.5` + platform pin. Starter Inertia/React UI present and **frozen** (ADR-0002).
- `composer ci:check` (`make ci-backend`) exit 0 on 2026-11-09 after the AM-36 fixes (`vite.config.ts` fmt/lint ignores, `phpstan.neon` exclude): 47 Pest tests, PHPStan 0 errors. GitHub's `backend.yml` has not run on the phase 3/4 branches (PR/`main` only). PostgreSQL via `DB_CONNECTION=pgsql`, no pending migrations.
- `make dev-setup` installs Composer deps only; the frozen starter UI needs `cd backend && npm ci && npm run build` before `ci-backend` (CI does it through `composer setup`).
- Local `.env`: `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis` (ADR-0005 applied), `MEDIA_PUBLIC_URL=https://cdn.homi.loc`, blank `AWS_*` and `TELEGRAM_*`. `.env.example` is the authoritative key list; `dev-check` enforces key parity. On 2026-11-15 `scripts/dev/env-keys.sh` reports four template keys missing from the developer's local file: `RADAR_CREATION_ENABLED`, `SOURCES_ALLOW_STUB`, `TELEGRAM_SUPPORT_USERNAME`, `TELESCOPE_RECORD_ALL` (the agent may not write it: deny rule `Edit(**/.env)`).
- `config/cors.php` env-driven; `config/filesystems.php` `public` disk URL from `MEDIA_PUBLIC_URL`; `storage/app/public/{health.txt,originals,derived}` exist locally.
- **Phase 3 WIP (branch `chore/phase-3-cdn-webhook`, paused by the developer on 2026-11-08):** packages added with approval — `league/flysystem-aws-s3-v3`, `intervention/image` 4.4, `dedoc/scramble` (registry regenerated). Media module implemented and tested (`/api/v1/media*`: upload, show, delete, presign/register; `HashedUploader`, `GenerateImageVariantsJob` on queue `media`, CDN/temporary URLs); `ApiController` envelope + `ApiExceptionRenderer`; `AssignRequestId`; rate limiters `api|uploads|intake|telegram-webhook`; Horizon queues `default+notifications|telegram|media|ingest`; tables `media_files`, `telegram_updates`, `sources`, `source_listings`, `intake_requests`, `intake_events` (migrated locally). Webhook route `POST /telegram/webhook` exists but is fail-closed (403/501 stubs). Intake endpoints, Telegram pipeline, OpenAPI export and Phase 3 docs are NOT done — the plan is `HANDOFF.md` §4 T1–T4 (development track), re-planned by the kvadro² migration tasks (PR #9, `docs/migration/10` §9). 47 tests green, PHPStan clean.
- Media ownership: the fix WP-00 is on `main` since PR #27 (merged 2026-11-15): `media_file_references`, owner-scoped load and policy, actor-typed upload prefix, migration `2026_11_14_150551_create_media_file_references_table` (run on the developer's dev database only). Staging and production still run the old code (KI-25) until the production track deploys it and approves the migration on production. KI-27 and KI-28 are open (PR #28, merged).
- **Since WP-10 (#42, merged 2026-11-15; staging and production do not run it yet):**
  - **Errors:** every `/api/v1` error body has `code` (`ApiException`, the renderer table, `SourceUnavailable` 503, `SourceNotFound` 404).
  - **Source drivers:** `config/sources.php` (no features yet), `SourceConfig`, `SourceSelector`, `SourceManager`, Pennant rules in the global scope, and `meta.source` in every sourced answer.
  - **Commands and audit:** `sources:list|set|reset|check|publish-stub-media`; the audit table `source_flag_changes` (migration `2026_11_14_224945_…`, run on the local test databases only; production approval pending).
  - **Stubs:** `FixtureStore` over `resources/fixtures/v1` (empty) with the `X-Stub-Scenario` header.
  - **OpenAPI:** the committed `docs/api/openapi.json`, `composer openapi:check` in `ci:check`, and `/docs/api` behind `viewApiDocs`.
  - **Tests:** `make ci-backend` → exit 0 (215 passed, 4 skipped); `make test-pgsql` → 4 passed; `backend` and `frontend` green on `main` after the merge (runs 43652932665, 43652932624).
  - `backend/.env.example` has `SOURCES_ALLOW_STUB` since PR #43 (merged).
- **Since WP-11 (#45, merged 2026-11-15 as `2e3d3bf`; staging and production do not run it yet):**
  - **Methods on stubs:**
    - `POST /auth/telegram` issues a real Sanctum token for the stub user `stub@homi.invalid`;
    - `GET /me`, `GET|PATCH /settings`, `GET /reference` (public), `GET /cities` (public), `POST /events`.
  - **Plumbing:**
    - `SetRequestLocale` on the whole `v1` group;
    - `AccessDenied` (`403 access_denied` + `reason`);
    - `StubResponder`;
    - the reference data objects with strict `fromArray()`.
  - **Sources and config:**
    - `StubReferenceSource` and the features `source.reference` and `source.cities`;
    - `config/{radar,settings}.php` and `telegram.support.username`;
    - the fixtures under `resources/fixtures/v1/{me,settings,reference,cities}`.
  - **Tests:** `make ci-backend` → exit 0 (343 passed, 4 skipped); `make test-pgsql` → 4 passed; `backend` and `frontend` green on `main` after the merge (runs 43657763081, 43657762964).
  - `backend/.env.example` has `TELEGRAM_SUPPORT_USERNAME` and `RADAR_CREATION_ENABLED=true` since PR #46 (merged as `e1a65f2`; `backend` run 43658186462 green). Staging and production leave the radar key unset until WP-57.

- **Since WP-12 (#48, merged 2026-11-15 as `b16993e`; staging and production do not run it yet):**
  - **Methods on stubs** (bearer, `app:read`): `GET /listings`, `/listings/count`, `/listings/new`, `/listings/flow`,
    `/listings/map`, `/listings/{number}`; `POST /listings/{number}/contact|translation|share`.
  - **Filters:** `SearchFilters` (25 keys, `canonicalHash()`), `SearchFiltersNormaliser`, `config/filters.php`
    (three DEV switches off), `ListingFiltersRequest`.
  - **No phone on the card:** `PhoneMasker` masks every author number to its last two digits; only `POST …/contact`
    gives a number (DEC-52).
  - **Stub:** `StubListingSource` over `resources/fixtures/v1/listings/catalog.json` (16 listings, 45 for the default
    filters); the eight `source.listings.*` features; six placeholder photos and `sources:publish-stub-media`.
  - **Tests:** `make ci-backend` → exit 0 (603 passed, 4 skipped); `make test-pgsql` → 4 passed; `backend` and
    `frontend` green on `main` after the merge (runs 43662113261, 43662113325).
- **Since WP-13 (#50, merged 2026-11-15 as `6c48ce6`; staging and production do not run it yet):**
  - **Methods on stubs:** favourites, history, hidden listings, blocked authors, the hidden list, reports, the two
    found-survey methods, the six radar methods, and the public `GET /landing/live` and `/landing/pins`. With them
    the `/api/v1` route list equals the 39 pairs of `25` §4.2 (a test pins it).
  - **Radar switch (DEC-51):** `EnsureRadarsEnabled` on the four radar writes answers `403 radars_disabled` while
    `radar.creation_enabled` is false; `GET /radars` answers `[]`; `DELETE` works.
  - **Stubs:** personal fixtures hold listing numbers resolved through the card source (`StubListingRefs`);
    `StubCursor` ends every stub list quietly on a foreign cursor (the feed included); `StubRadars`;
    `StubLandingSource` and the features `source.landing.live`, `source.landing.pins`.

## Frontend (`frontend/`)
- pnpm 11.24 workspace, Node 26, Next 16.4.5 × 3 apps on dev ports 3000/3001/3002, TypeScript ^6. `pnpm -r lint` and `pnpm -r typecheck` exit 0 (3 apps + 5 packages).
- `packages/`: `@homi/config`, `@homi/types`, `@homi/utils`, `@homi/api-client`, `@homi/ui`, `@homi/i18n` (WP-20; `./format` since WP-22), `@homi/search` (WP-22) — each with lint/typecheck/test scripts (the `lint` scripts are placeholders, KI-29); `app` uses `@homi/config`, `@homi/i18n` and `@homi/ui` since WP-20, `@homi/search`, `@homi/api-client` and `@homi/types` since WP-22.
- Since WP-03 (#39, merged 2026-11-15):
  - **Packages:** the 31 Wave 1 npm packages are installed (lockfile 665 entries). The install scripts of `@parcel/watcher`, `@swc/core` and `core-js` are denied in `allowBuilds`. No product code imports them.
  - **Unit tests:** Vitest 5 runs through `frontend/vitest.config.mts`, with one project per package. `pnpm test` → `@homi/testing` 89 passed, `@homi/utils` 2 passed.
  - **`@homi/testing`** is a dev-only package. `@homi/testing/playwright` provides the fake Telegram and the external-request guard.
  - **End to end:** Playwright 1.65.1 runs `frontend/playwright.config.ts`, with the `app/e2e/smoke.spec.ts` test. `pnpm test:e2e` → 2 passed.
  - **Gates:** `make ci-frontend` includes `pnpm test`, and `make e2e` is new. The workflow `frontend-e2e.yml` is new.
- Since WP-10 (#42):
  - `@homi/types` generates `src/generated/api.ts` from `docs/api/openapi.json`, and `pnpm types:check` runs in CI and in `make ci-frontend`.
  - `@homi/api-client` gains `put`, a required `ApiError.code`, `null` data for a `204`, and `createTypedClient`.
- Since WP-11 (#45): the generated types cover the seven contract methods; `@homi/testing` 90 passed, including a `fixture()` test on the real backend fixtures.
- **Since WP-20 (#52, merged 2026-11-15 as `2ef9b2f`; staging and production do not run it yet):**
  - **`frontend/app`:** the route tree of `25` §3.2 under `app/[locale]/` with `RoutePlaceholder` on every address;
    sheets and the listing layer intercepted into `(main)/@sheet` and `(main)/@overlay`; the three catch-alls are
    `[...rest]`. `proxy.ts` redirects to the `NEXT_LOCALE` cookie's locale or `ru`. next-intl reads the locale from
    `next/root-params` (pages stay static). `lib/navigation/routes.ts`, `lib/brand`, `lib/flags.ts` (17 flags off),
    the `track` and `reportError` facades, the sources store and `DemoDataMarker`. Starter files removed.
  - **`@homi/i18n`:** the `legacy` layer generated by `scripts/import-legacy.mjs` from the release pinned by WP-02
    (476 keys per locale, 15 plurals, 4 keys at `<key>._`), the `homi` layer, `getMessages`, `createIntlHandlers`,
    `labelFor`.
  - **`@homi/ui`:** tokens, themes, lite and motion CSS (`@homi/ui/styles.css`; Tailwind's default palette removed),
    the restyled shadcn/ui base components, `cn` = clsx + tailwind-merge.
  - **Tests:** `make ci-frontend` → exit 0 (app 135, `@homi/i18n` 30, `@homi/ui` 24, `@homi/testing` 90 passed);
    `pnpm exec playwright test --project miniapp` → 20 passed; `frontend` and `frontend-e2e` green on the PR,
    `frontend` green on `main` after the merge (run 43697001406).
- **Since WP-21 (#55 merged 2026-11-15 as `31b53f4`, shared files #54 as `68751f3`; staging and production do not
  run it yet):** the Telegram adapter `tg` (`lib/telegram/`), the ES5 boot script and update screen (`boot/`),
  storage and graphics mode, the session exchange `/bff/session` with `lib/session/`, the history stack with
  BackButton and SettingsButton, launch links, the locale and fragment guards, the development-only emulator
  (`dev/`), the nonce CSP and security headers of `proxy.ts` (every document at request time, ADR-0020; unknown
  address → `200` + `noindex`, AM-57); `frontend/app/.env.example` has the server-only keys `API_URL`, `CSP_*`.
  `frontend-e2e.yml` starts the API on stubs. On the branch: `make ci-frontend` → exit 0 (app 362 + the launch-order
  test, `@homi/testing` 95), Playwright `miniapp` → 51 passed; `frontend` and `frontend-e2e` green on the PR,
  `frontend` green on `main` after the merge (run 43732411072).
- **Since WP-22 (#61 merged 2026-11-16 as `e8c8f9e`; staging and production do not run it yet):** `lib/api/*` (typed server calls, `UiError`,
  `/bff/[...path]` with its read allow-list, `bffFetch`, stub scenarios), `lib/actions/{run,validate,useAction}`,
  `lib/data/{useResource,sessionMaps}`, `lib/reference/*` (cached per locale), `lib/search/*`, `lib/money/useMoney`,
  the packages `@homi/search` and `@homi/i18n/format`; the feed and map placeholders show a data proof. On the branch:
  `make ci-frontend` → exit 0 (app 480, `@homi/search` 238 + 1 todo, `@homi/i18n` 108), Playwright `data.spec.ts` → 5
  passed; `frontend` and `frontend-e2e` green on the PR (`3bb7831`, e2e 56 passed).
- `next.config.ts`: next-intl plugin (WP-20); `allowedDevOrigins` for the `.homi.loc` hosts; `images.remotePatterns` for `cdn.homi.loc`, `cdn.staging.homi.uz`, `cdn.homi.uz`. `.env.example` per app; `.env.local` present locally.

## Infrastructure
- Local (ADR-0008 + ADR-0012), **working on the first developer's machine** as of 2026-11-08: six `*.homi.loc` hosts in `/etc/hosts`; mkcert cert (valid to 2029-02-08) trusted by the system keychain; Homebrew nginx vhosts symlinked from `infra/local/nginx/`; nginx started by hand (`sudo nginx`, never `brew services` — KI-13); php-fpm :9000, PostgreSQL :5432, Redis :6379 as brew services; Horizon + Next dev servers via `make dev-start`; media on disk behind `cdn.homi.loc` (no local MinIO). `make dev-check` → 24 PASS / 0 WARN / 0 FAIL; HMR WebSocket (`/_next/hmr`) upgrades through nginx.
- Second developer's machine: `make dev-setup` end-to-end on a clean clone done in T0 (PR #7, 2026-11-09; `docs/testing/verification-log.md`). A fresh Homebrew nginx lacks the `sites-available`/`sites-enabled` layout `scripts/dev/nginx.sh` expects — manual step in `docs/handoff/setup.md` B1. On 2026-11-16 the shared nginx lost its `~/Documents` access after a reload (KI-31); `make dev-nginx-restart` from Terminal restored it, and `make dev-check` → `dev:check OK (0 warning(s))`, 24 PASS, on `main` = `59a34ad`.
- Local tooling since #63/#64: `dev-check` follows redirects on the three Next hosts (the app's `/` → `/ru`, KI-30); `scripts/dev/nginx.sh` has `start`, `stop` (waits, TERM after 10 s), `restart` and `reload` as separate commands, signals only the root master, and reports "Operation not permitted" with the restart hint; `make dev-nginx-restart`.
- Staging/production (production track, 2026-11-09): PostgreSQL 18.6 on `5.45.127.98` has `homi_db` (production) and `homi_staging_db` (staging) with same-named owner roles, reachable only from the app host `159.253.19.121` (`pg_hba` + ufw + nftables), `DB_SSLMODE=disable` by the developer's decision — verified with `psql` and PHP PDO from `159.253.19.121`. The app host (Debian 12) already runs nginx, PHP 8.5.12 (`pdo_pgsql`, `redis`, `imagick`) and a shared Redis for other projects; PostGIS is not installed on the DB host. **Production is live on `159.253.19.121` since 2026-11-09**: `/var/www/homi.uz` (git, read-only deploy key) at `main`, Laravel API `https://api.homi.uz` and webhook host `https://hook.homi.uz` over php8.5-fpm, Next SSR `https://homi.uz`, `app.`, `arm.` as systemd units on `127.0.0.1:3100–3102`, Horizon as a systemd unit (Redis DB 3/4), Let's Encrypt certificates to 2027-02-06 — all verified from outside (`production-notes.md` §4). **Staging is live on the same host** since 2026-11-09: `/var/www/staging.homi.uz` at `main`, `*.staging.homi.uz` (five hosts, all `noindex`), Next SSR on `127.0.0.1:3200–3202`, `horizon-homi-staging`, database `homi_staging_db`, Redis DB 5/6. Deploys run with `homi-deploy <production|staging>`. The script is in `infra/production/bin/` and installed as `/usr/local/sbin/homi-deploy`. On 2026-11-09 staging ran a full repeat deploy plus a rollback and a forward deploy through it; production has had dry runs only (`production-notes.md` §3c). Not yet: bot tokens/webhooks (both environments), MinIO buckets + `cdn.*` DNS (still → app host), backups, atomic releases. Copies of the vhosts/units: `infra/production/`; runbook `docs/infrastructure/deployment.md`; log `docs/ai/reports/production-notes.md`.
- Telegram: three bots exist (dev/staging/prod); tokens not in repo; no webhook registered by us.

## AI tooling (Phase 4 in progress)
- Claude Code 2.1.319; Agent models sonnet/opus/haiku/fable. codex 0.167, gemini 0.67, grok 1.0.70 present. Codex: root `AGENTS.md` (2026-11-09) is loaded and the 37 skills in `.agents/skills` are listed (`codex debug prompt-input`); Boost MCP for Codex is a user-level `codex mcp add` (`docs/handoff/environment.md` §4), not committed. Gemini/Grok not configured (waiting).
- Laravel Boost 2.10.4 MCP: root `.mcp.json` runs `php backend/artisan boost:mcp` (project scope); the server answers `initialize` + `tools/list` (9 tools), also with the absolute artisan path from another directory. Claude Code asks each user to approve the project server once (`claude mcp list` → "Pending approval" on 2026-11-09). Sessions must start at the repository root.
- One knowledge base: canonical skills in `.ai/skills/` (19 vendored third-party skills + HOMI's own `save-session`, `SOURCES.md`), `backend/.ai → ../.ai`, `backend/boost.json` tracked (every skill must be listed there), `config/boost.php` agent paths; `php artisan boost:update` (`make ai-sync`) regenerates gitignored `.claude/skills` (37 = 17 official + 20 symlinks), `.agents/skills`, `.grok/skills`. Claude Code discovers the root skills.
- Guard rails: committed `.claude/settings.json` (permissions allow/ask/deny, `worktree.baseRef: head`) wires `.ai/hooks/guard_paths.py` (PreToolUse: reference codebases read-only, `.env*`/keys never printed), `session_context.py` (SessionStart: handoff + next AM/KI numbers), `format_on_edit.py` (PostToolUse: Pint / eslint / vp fmt). `make ai-hooks-test` → 46 tests OK; CI `tooling.yml`. `.ai/local.env` exists on both developer machines (gitignored). The guard has no key for the legacy kvadro² checkout (`KVADRO_ROOT`, KI-26).
- Subagents: `.ai/agents/` (`reference-reader`, `telegram-bot-engineer`, `intake-pipeline-engineer`, `listing-matching-engineer`, `postgis-geo-engineer`, `security-reviewer`), loaded through `.claude/agents → ../.ai/agents`.
- Not yet: `GEMINI.md`, `.ai/{rules,tasks}`, hook adapters for other agents (Codex has no guard — `AGENTS.md` hard rules only), plugins (`php-lsp`, `security-guidance`, `hookify`, `claude-md-management`), Codex/Gemini/Grok smoke tests, remaining marketing skills — waiting for the developer (`docs/ai/reports/phase-4-plan.md`).

## Collectors (outside this repo, read-only)
- `telegram.uz`: Laravel 13 + MadelineProto, PostgreSQL, stores listings/phones(HMAC)/photos, public API `/api/public/v1/listings` (tokens `tk_live_*`); rules + an Anthropic LLM; no push into HOMI, production use not confirmed. `geo.uz`: not a housing source (elmarket). `datahub.uz`: dedup/canon platform, intake not built, no consumer API. None of them mentions kvadro. ADR-0009's push model is not backed by any collector yet (AM-44; reported by `reference-reader` 2026-11-09, not re-run).

## kvadro² (the legacy product being migrated)
- Legacy sources: SVN checkout `kvadro.uz` (`KVADRO_ROOT` in `.ai/local.env`), read-only. The guard hook protects it by key and by folder name since PR #29 (merged 2026-11-14, KI-26). Since PR #37 (WP-02, merged 2026-11-15) the audit describes legacy release `index-DY_DH7h-.js` (`demo/app` SVN r27, `docs/migration/wave-1/baseline.md`). It holds the Mini App rebuilt from the production bundle, the landing and SEO pages, and docs. The legacy backend (Python/FastAPI) and its PostgreSQL/PostGIS database are not available.
- The audit and plan are in `docs/migration/` on `main` (start: `22-agent-handoff.md`). No migration code exists yet.
- The audit describes the Mini App release `index-plF_TOcT.js`. The legacy tree holds two later synced releases, `index-Dbpp463V.js` and `index-BNLZFfL0.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md`, read 2026-11-14); 03 and 08 do not cover them (Q-APP-024).
- Course decided by the developer on 2026-11-14 (PR #25, merged 2026-11-14): HOMI ships a new product under its own bot and brand instead of taking over the legacy bot, hosts and users; the frontend talks only to `/api/v1`; each method answers from a stub, from legacy through a service key, or from HOMI's own code. Strategy `docs/migration/24-three-wave-strategy.md`, plan `25-wave-1-plan.md`, queue `docs/migration/wave-1/README.md` (45 work packages including the support bot WP-59; WP-00, WP-01 and WP-02 merged and `WAITING` (deploy; ADR acceptance; the operator request is not sent); WP-03 merged (#39, 2026-11-15) and `WAITING` for the deploy: the confirmed packages, the test tooling and the backend `pgsql` test group (`backend/tests/Pgsql`, `make test-pgsql`) are on `main`; the rest not started; 45 specifications `wave-1/WP-NN-*.md`, decisions DEC-31 … DEC-56, drafted by subagents, then read in full against the code and each other in a verification pass), answers `docs/migration/decisions/2026-11-14-developer-answers.md`.
- Not existing yet: the service key and its contract, the dump and schema, any `/api/v1` product method, the Mini App screens, the bot handlers, the landing. `frontend/app` serves placeholders behind the Telegram layer and the session (WP-20, WP-21).
