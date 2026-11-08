---
updated: 2026-11-09 (production track: PostgreSQL databases on the DB host; Infrastructure section)
source-of-truth: git log, docs/ai/reports/phase-2.md, docs/ai/reports/phase-4-plan.md, docs/ai/reports/production-notes.md, docs/architecture/decisions/, HANDOFF.md §6, `make dev-check`, `make ci-backend`, `make ai-hooks-test` output
---

# Current state (facts only)

## Repository
- Branches: `main` holds everything — the phase stack (phase-0 … phase-4) was merged on 2026-11-09 through PRs #1–#4 with merge commits (last `834d69d`); the `chore/phase-*` branches are history. Open: Dependabot PR #5 (TypeScript 7 — not to be merged, KI-4). No branch protection (free GitHub plan) and no local push guard yet (KI-19).
- Two tracks since 2026-11-09: development (second developer, Codex) and production (first developer) — `HANDOFF.md`, `docs/handoff/parallel-work.md`.
- Tracked: backend baseline, frontend pnpm workspace (landing, app, arm, packages/*), `infra/local/nginx`, `scripts/dev`, `Makefile`, docs, ADRs 0001–0013, `scripts/packages/registry`, root CI workflows, CODEOWNERS, `HANDOFF.md`, `AGENTS.md`, `docs/handoff/`.
- Gitignored machine files: `infra/local/certs/`, `infra/local/nginx/snippets/paths.conf`, `infra/local/{run,logs}/`, `.ai/local.env`, `backend/.env`, `frontend/*/.env.local`.

## Backend (`backend/`)
- Laravel 13.40, PHP 8.5.12, `php ^8.5` + platform pin. Starter Inertia/React UI present and **frozen** (ADR-0002).
- `composer ci:check` (`make ci-backend`) exit 0 on 2026-11-09 after the AM-36 fixes (`vite.config.ts` fmt/lint ignores, `phpstan.neon` exclude): 47 Pest tests, PHPStan 0 errors. GitHub's `backend.yml` has not run on the phase 3/4 branches (PR/`main` only). PostgreSQL via `DB_CONNECTION=pgsql`, no pending migrations.
- `make dev-setup` installs Composer deps only; the frozen starter UI needs `cd backend && npm ci && npm run build` before `ci-backend` (CI does it through `composer setup`).
- Local `.env`: `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis` (ADR-0005 applied), `MEDIA_PUBLIC_URL=https://cdn.homi.loc`, blank `AWS_*` and `TELEGRAM_*`. `.env.example` is the authoritative key list; `dev-check` enforces key parity.
- `config/cors.php` env-driven; `config/filesystems.php` `public` disk URL from `MEDIA_PUBLIC_URL`; `storage/app/public/{health.txt,originals,derived}` exist locally.
- **Phase 3 WIP (branch `chore/phase-3-cdn-webhook`, paused by the developer on 2026-11-08):** packages added with approval — `league/flysystem-aws-s3-v3`, `intervention/image` 4.4, `dedoc/scramble` (registry regenerated). Media module implemented and tested (`/api/v1/media*`: upload, show, delete, presign/register; `HashedUploader`, `GenerateImageVariantsJob` on queue `media`, CDN/temporary URLs); `ApiController` envelope + `ApiExceptionRenderer`; `AssignRequestId`; rate limiters `api|uploads|intake|telegram-webhook`; Horizon queues `default+notifications|telegram|media|ingest`; tables `media_files`, `telegram_updates`, `sources`, `source_listings`, `intake_requests`, `intake_events` (migrated locally). Webhook route `POST /telegram/webhook` exists but is fail-closed (403/501 stubs). Intake endpoints, Telegram pipeline, OpenAPI export and Phase 3 docs are NOT done — the plan is `HANDOFF.md` §4 T1–T4 (development track). 47 tests green, PHPStan clean.

## Frontend (`frontend/`)
- pnpm 11.24 workspace, Node 26, Next 16.4.5 × 3 apps on dev ports 3000/3001/3002, TypeScript ^6. `pnpm -r lint` and `pnpm -r typecheck` exit 0 (3 apps + 5 packages).
- `packages/`: `@homi/config`, `@homi/types`, `@homi/utils`, `@homi/api-client`, `@homi/ui` — skeletons with lint/typecheck scripts, no consumers yet.
- `next.config.ts`: `allowedDevOrigins` for the `.homi.loc` hosts; `images.remotePatterns` for `cdn.homi.loc`, `cdn.staging.homi.uz`, `cdn.homi.uz`. `.env.example` per app; `.env.local` present locally.

## Infrastructure
- Local (ADR-0008 + ADR-0012), **working on the first developer's machine** as of 2026-11-08: six `*.homi.loc` hosts in `/etc/hosts`; mkcert cert (valid to 2029-02-08) trusted by the system keychain; Homebrew nginx vhosts symlinked from `infra/local/nginx/`; nginx started by hand (`sudo nginx`, never `brew services` — KI-13); php-fpm :9000, PostgreSQL :5432, Redis :6379 as brew services; Horizon + Next dev servers via `make dev-start`; media on disk behind `cdn.homi.loc` (no local MinIO). `make dev-check` → 24 PASS / 0 WARN / 0 FAIL; HMR WebSocket (`/_next/hmr`) upgrades through nginx.
- Not yet done locally: `make dev-setup` end-to-end on a clean machine; second developer's machine (`HANDOFF.md` T0). A fresh Homebrew nginx lacks the `sites-available`/`sites-enabled` layout `scripts/dev/nginx.sh` expects — manual step in `docs/handoff/setup.md` B1.
- Staging/production (production track, 2026-11-09): PostgreSQL 18.6 on `5.45.127.98` has `homi_db` (production) and `homi_staging_db` (staging) with same-named owner roles, reachable only from the app host `159.253.19.121` (`pg_hba` + ufw + nftables), `DB_SSLMODE=disable` by the developer's decision — verified with `psql` and PHP PDO from `159.253.19.121`. The app host (Debian 12) already runs nginx, PHP 8.5.12 (`pdo_pgsql`, `redis`, `imagick`) and a shared Redis for other projects; PostGIS is not installed on the DB host. Nothing deployed; DNS for homi.uz not set up; MinIO 31.220.104.38 via s3.hc.uz untouched. Log: `docs/ai/reports/production-notes.md`.
- Telegram: three bots exist (dev/staging/prod); tokens not in repo; no webhook registered by us.

## AI tooling (Phase 4 in progress)
- Claude Code 2.1.319; Agent models sonnet/opus/haiku/fable. codex 0.167, gemini 0.67, grok 1.0.70 present. Codex: root `AGENTS.md` (2026-11-09) is loaded and the 37 skills in `.agents/skills` are listed (`codex debug prompt-input`); Boost MCP for Codex is a user-level `codex mcp add` (`docs/handoff/environment.md` §4), not committed. Gemini/Grok not configured (waiting).
- Laravel Boost 2.10.4 MCP: root `.mcp.json` runs `php backend/artisan boost:mcp` (project scope); the server answers `initialize` + `tools/list` (9 tools), also with the absolute artisan path from another directory. Claude Code asks each user to approve the project server once (`claude mcp list` → "Pending approval" on 2026-11-09). Sessions must start at the repository root.
- One knowledge base: canonical skills in `.ai/skills/` (19 vendored third-party skills + HOMI's own `save-session`, `SOURCES.md`), `backend/.ai → ../.ai`, `backend/boost.json` tracked (every skill must be listed there), `config/boost.php` agent paths; `php artisan boost:update` (`make ai-sync`) regenerates gitignored `.claude/skills` (37 = 17 official + 20 symlinks), `.agents/skills`, `.grok/skills`. Claude Code discovers the root skills.
- Guard rails: committed `.claude/settings.json` (permissions allow/ask/deny, `worktree.baseRef: head`) wires `.ai/hooks/guard_paths.py` (PreToolUse: reference codebases read-only, `.env*`/keys never printed), `session_context.py` (SessionStart: handoff + next AM/KI numbers), `format_on_edit.py` (PostToolUse: Pint / eslint / vp fmt). `make ai-hooks-test` → 46 tests OK; CI `tooling.yml`. `.ai/local.env` exists on the first developer's machine (gitignored).
- Subagents: `.ai/agents/` (`reference-reader`, `telegram-bot-engineer`, `intake-pipeline-engineer`, `listing-matching-engineer`, `postgis-geo-engineer`, `security-reviewer`), loaded through `.claude/agents → ../.ai/agents`.
- Not yet: `GEMINI.md`, `.ai/{rules,tasks}`, hook adapters for other agents (Codex has no guard — `AGENTS.md` hard rules only), plugins (`php-lsp`, `security-guidance`, `hookify`, `claude-md-management`), Codex/Gemini/Grok smoke tests, remaining marketing skills — waiting for the developer (`docs/ai/reports/phase-4-plan.md`).

## Collectors (outside this repo, read-only)
- `telegram.uz`: Laravel 13 + MadelineProto, PostgreSQL, stores listings/phones(HMAC)/photos, public API `/api/public/v1/listings` (tokens `tk_live_*`). `geo.uz`: web sources. `datahub.uz`: dedup/canon platform, intake not built, no consumer API. Push model into HOMI per ADR-0009.
