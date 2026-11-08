# Phase 1 — Foundation Report

```text
PHASE:        1 — FOUNDATION
STATUS:       COMPLETE (ADR-0009 Accepted; field-level intake contract is Phase 3 work)
DATE:         2026-11-08
SESSION:      Claude Code 2.1.319, main session on Claude Fable 5.1; 5 read-only Explore subagents (sonnet)
BRANCH:       chore/phase-1-foundation (stacked on chore/phase-0-discovery, PR #1)
```

## COMPLETED

1. **Checkpoint decisions recorded** — 16 answers from the developer in `phase-0.md` §14, turned into ADRs 0001–0011 (`docs/architecture/decisions/`).
2. **Housekeeping (approved D10/D11)** — root `prompt.md` removed (canonical `docs/ai/master-prompt.md`), empty `server/` tree removed, `infra/` adopted as the config root.
3. **Root standards** — `.editorconfig`, `.node-version` (26 = Active LTS per the official schedule), `.gitignore` (+ `.worktrees/`), `.ai/local.env.example` for machine-specific paths.
4. **CI at the repository root** — `.github/workflows/backend.yml` (PHP 8.5, Node from `.node-version`, `composer setup` + `composer ci:check` + registry `--check`) and `frontend.yml` (pnpm, lint, typecheck, build); `CODEOWNERS` (`@amediateam`); `dependabot.yml`. The starter's `backend/.github/` was never evaluated by GitHub (not at the repo root) and was removed.
5. **Toolchain pins (ADR-0004)** — `composer.json` `php ^8.5` + `config.platform.php 8.5.0` (lock refreshed, `composer validate` OK); `frontend/` converted to a **pnpm workspace** (`pnpm@11.24.0`, `engines.node >=26 <27`, one `pnpm-lock.yaml`, npm lockfiles removed); TypeScript pinned `^6` in all three apps because `typescript-eslint` 8.x rejects TS 7.0; `lint` + `typecheck` scripts pass in `landing`, `app`, `arm`.
6. **Scaffolding baseline committed (D7)** — `backend/` (97 files, no `.env`/`vendor`/`sqlite`) and `frontend/` (3 apps + workspace files); 185 tracked files at the time of the baseline.
7. **Package registry (mandate §3.6–3.7)** — `scripts/packages/registry` (PHP, deterministic: `composer show/audit/outdated/licenses` + namespace usage scan; `[ai-summary]` columns from `summaries.json`; PROPOSED list from `proposed.json`; `--check` compares the `composer.lock` sha256) → `docs/backend/package-registry.md` (26 direct, 2 transitive-in-use, 6 proposed, 0 advisories) and `.ai/memory/package-capabilities.md`.
8. **Documentation structure** — `docs/README.md` (map, reading order, rules), `architecture/overview.md` (context, containers, module boundaries, listing data flow), `architecture/requirements.md` (FR/NFR/entities labelled CONFIRMED/ASSUMED/OPEN), `infrastructure/environments.md` (domain matrix, hosts, ports, buckets, env var names), `development/{workflows,getting-started}.md`.
9. **Reference codebase catalogue (mandate §4)** — `docs/reference-codebase.md` index + two card files covering 15 `app.uz` modules with status and port plans; critical claims spot-verified.
10. **Collector landscape clarified** — `datahub.uz` (dedup/canon platform, intake not built, no consumer API), `telegram.uz` (Telegram collector: partitioned `listings` without title/description, phones via HMAC + raw, content-addressed media without variants, 12 Tashkent districts, no approval event, public API too thin for pull), `geo.uz` (web sources) — recorded in `docs/api/intake-sources.md` (incl. a source-mapped intake payload draft and the list of changes `telegram.uz` needs to push), ADR-0009 (Accepted) and `architecture/overview.md`.
11. **CLAUDE.md** updated (mandate pointer, frozen backend UI, pnpm commands, registry tooling); first `.ai/memory/` files written (`current-state.md`, `session-handoff.md`, `known-issues.md`, generated `package-capabilities.md`).

## DECISIONS

ADR-0001 layout/canonical paths · 0002 backend Inertia/React stack frozen · 0003 Sanctum bearer tokens + Telegram identity · 0004 pnpm workspace, Node 26, PHP 8.5, TS 6 · 0005 Redis queue/cache + Horizon · 0006 UTC/Asia/Tashkent, ru default, UZS default, jsonb translations · 0007 `/api/v1`, envelope, pagination, OpenAPI-first · 0008 local nginx + php-fpm + mkcert · 0009 ingestion push model (Proposed → Accepted once the payload reference is attached) · 0010 Git conventions without branch protection · 0011 hosting topology (web 159.253.19.121, DB 5.45.127.98, MinIO 31.220.104.38).

## REUSED_PACKAGES

- `laravel/ai` (GeminiProvider et al.) covers about.md's AI needs — no new AI package.
- `laravel/sanctum` tokens (ADR-0003), `laravel/horizon` (ADR-0005), `laravel/pennant` for closed-beta gating — all already installed.
- PROPOSED (not installed, REVIEW-level): `league/flysystem-aws-s3-v3`, `intervention/image`, `dedoc/scramble`, `spatie/laravel-permission`, `spatie/laravel-backup`, `sentry/sentry-laravel` — reasons and evidence in the registry §Proposed.

## REUSED_CODE

Nothing copied yet (no product code in Phase 1). Catalogued for Phase 3: READY — `InitDataVerifier`, `TokenController` flow, `ApiController`, `HashedUploader` + `StoredOriginal` + `GenerateImageVariantsJob` + MinIO `WebhookController`, `TelegramClient` + `TelegramException`, `CredentialsVault`, `HasTranslations` + `LocaleRegistry`, geo schema/seeder/enums; NEEDS_ADAPTATION — Gramir webhook pattern, presign/storage glue, rate-limiter set, Next.js API client, exception renderers, Horizon/schedule shape.

## FILES_CHANGED

Commits on `chore/phase-1-foundation` (oldest first): `b385410` root standards/CI · `8ddeacf` backend baseline · `c24177d` frontend pnpm workspace · `7adafe0` ADRs + docs · `0acbe3f` registry generator · `5d14aaa` worktrees ignore · `8c483e6` ADR-0009 + hook scope · `8b069d4` reference catalogue draft · `c967b78` catalogue complete · (this report + memory files + ADR-0009 status: see git log).

## TESTS

- `php artisan test --compact` (backend): 2 passed (starter examples) — unchanged.
- `pnpm -r lint` and `pnpm -r typecheck` (frontend): pass for `landing`, `app`, `arm`.
- `composer validate`: valid. `composer audit`: no advisories. `scripts/packages/registry --check`: current.
- CI workflows not yet exercised (first run happens on the PR); `pnpm -r build` not run locally (CI runs it).

## RISKS

- R1 Collector push clients (`telegram.uz`, `geo.uz`) are work outside this repo; HOMI's intake can be built and tested with fixtures, but real data flow depends on those teams/projects.
- R2 Peer-dependency warnings in the Next.js apps (eslint 10 vs `eslint-config-next` plugins) — harmless today, may block an eslint upgrade.
- R3 Laravel Boost MCP failed to connect in this session (CONNECTION_CLOSED) — Phase 4 must fix it before agents rely on `search-docs`.
- R4 GitHub cannot enforce the PR workflow (free plan) — relies on hooks and discipline (ADR-0010).
- R5 Starter UI frozen but still built in CI (`npm run check`, `tsc`, build) — adds CI minutes for code that will not change.

## BLOCKERS

None. Phase 2 needs the developer present for `mkcert -install` and `/etc/hosts` edits (sudo).

## NEXT_ACTION

Phase 2 — local environment (ADR-0008): `infra/local/nginx/*.conf`, hosts script, mkcert certs, MinIO buckets, `.env.example` sync (backend + frontends), `frontend/packages/*` skeletons, `Makefile` with `dev-*` targets and `scripts/dev/check.sh` (§6.6). Open PR for this branch after PR #1 merges (or rebase onto `main`).

## ASSUMPTION_MISMATCHES (new in Phase 1)

| # | Assumed | Found | Handling |
|---|---|---|---|
| AM-17 | `backend/.github/workflows/tests.yml` was the project's CI | GitHub only reads `.github/` at the repository root → CI never ran | Root workflows created; nested dir removed |
| AM-18 | `create-next-app` 16.4 output lints out of the box | `typescript ^7` breaks `typescript-eslint` ("does not support TS 7.0") | TS pinned `^6` (ADR-0004) |
| AM-19 | Node 22 (backend CI) was the intended pin | Node 26 is the Active LTS line since 2026-10-28; local is 26.13 | `.node-version` = 26 |
| AM-20 | Only `landing` and `app` existed | Developer created `frontend/arm` during the session (18:58) | Included in the workspace |
| AM-21 | Collection happens in HOMI or via a Bot API | Collection lives in `telegram.uz`/`geo.uz`; `datahub.uz` has no intake/API yet | ADR-0009 push model |
| AM-22 | `docs/about.md` is the requirements spec | Developer: preliminary; documentation is built incrementally | `architecture/requirements.md` with labels |
| AM-23 | Shell cwd stable across tool calls | cwd carried between parallel calls, breaking two commands | Absolute paths everywhere |

## OPEN_QUESTIONS

- OPQ from `requirements.md`: dedup thresholds, "below market" definition, launch cities, ARM roles, data retention.
- Second developer's GitHub login (CODEOWNERS), PostHog account, DNS ownership for `homi.uz`.
- Where Next.js SSR runs in production (Node/pm2 vs static export) — Phase 2/6.
- Field-level intake contract → `docs/api/intake.md` + OpenAPI in Phase 3 (inputs: `docs/api/intake-sources.md`). Who implements the push side in `telegram.uz` and when (outside this repo).

## VERIFIED_BY

Main session (Fable 5.1): all commands in this report were executed and their output read; subagent claims about `app.uz`, `datahub.uz`, `telegram.uz` and the CDN mirror are marked as such in the docs; the critical ones (`.svn`, composer constraints, auth wiring, file existence/sizes, SPA-only CDN guide) were re-checked with `grep`/`ls`.

## COST (actual data only)

Subagents: 6 Explore runs on `sonnet` (app.uz overview, CDN guide, datahub.uz, app.uz auth/API/media, app.uz bot/i18n/geo/ops, telegram.uz intake audit); two needed a follow-up message because their first reply was truncated. Token counts per agent are not exposed by the tool → left blank. External CLIs (codex/gemini/grok): not yet invoked (approved for Phase 4).

```text
COMMIT:       see FILES_CHANGED; final commit of this phase adds docs/ai/reports/phase-1.md and .ai/memory/*
REPORT_FILE:  docs/ai/reports/phase-1.md
```
