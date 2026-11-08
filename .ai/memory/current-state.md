---
updated: 2026-11-08 (Phase 4 second batch: hooks, settings, subagents)
source-of-truth: git log, docs/ai/reports/phase-2.md, docs/ai/reports/phase-4-plan.md, docs/architecture/decisions/, `make dev-check`, `make ai-hooks-test` output
---

# Current state (facts only)

## Repository
- Branches: `main` (README only), `chore/phase-0-discovery` (PR #1 → main), `chore/phase-1-foundation` (PR #2 → main), `chore/phase-2-local-env` (PR #3 → `chore/phase-1-foundation`), `chore/phase-3-cdn-webhook` (paused WIP, no PR), `chore/phase-4-ai-infra` (stacked on phase-3, no PR). No branch protection (free GitHub plan).
- Tracked: backend baseline, frontend pnpm workspace (landing, app, arm, packages/*), `infra/local/nginx`, `scripts/dev`, `Makefile`, docs, ADRs 0001–0012, `scripts/packages/registry`, root CI workflows, CODEOWNERS.
- Gitignored machine files: `infra/local/certs/`, `infra/local/nginx/snippets/paths.conf`, `infra/local/{run,logs}/`, `.ai/local.env`, `backend/.env`, `frontend/*/.env.local`.

## Backend (`backend/`)
- Laravel 13.40, PHP 8.5.12, `php ^8.5` + platform pin. Starter Inertia/React UI present and **frozen** (ADR-0002).
- `composer ci:check` exit 0 (2026-11-08, after the Phase 2 config changes). PostgreSQL via `DB_CONNECTION=pgsql`, no pending migrations.
- Local `.env`: `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis` (ADR-0005 applied), `MEDIA_PUBLIC_URL=https://cdn.homi.loc`, blank `AWS_*`, `TELEGRAM_*`, `CORS_ALLOWED_ORIGINS`, `SANCTUM_TOKEN_EXPIRATION`. `.env.example` is the authoritative key list; `dev-check` enforces key parity.
- `config/cors.php` env-driven; `config/filesystems.php` `public` disk URL from `MEDIA_PUBLIC_URL`; `storage/app/public/{health.txt,originals,derived}` exist locally.
- **Phase 3 WIP (branch `chore/phase-3-cdn-webhook`, paused by the developer on 2026-11-08):** packages added with approval — `league/flysystem-aws-s3-v3`, `intervention/image` 4.4, `dedoc/scramble` (registry regenerated). Media module implemented and tested (`/api/v1/media*`: upload, show, delete, presign/register; `HashedUploader`, `GenerateImageVariantsJob` on queue `media`, CDN/temporary URLs); `ApiController` envelope + `ApiExceptionRenderer`; `AssignRequestId`; rate limiters `api|uploads|intake|telegram-webhook`; Horizon queues `default+notifications|telegram|media|ingest`; tables `media_files`, `telegram_updates`, `sources`, `source_listings`, `intake_requests`, `intake_events` (migrated locally). Webhook route `POST /telegram/webhook` exists but is fail-closed (403/501 stubs). Intake endpoints, Telegram pipeline, OpenAPI export and Phase 3 docs are NOT done — see `session-handoff.md`. 47 tests green, PHPStan clean.

## Frontend (`frontend/`)
- pnpm 11.24 workspace, Node 26, Next 16.4.5 × 3 apps on dev ports 3000/3001/3002, TypeScript ^6. `pnpm -r lint` and `pnpm -r typecheck` exit 0 (3 apps + 5 packages).
- `packages/`: `@homi/config`, `@homi/types`, `@homi/utils`, `@homi/api-client`, `@homi/ui` — skeletons with lint/typecheck scripts, no consumers yet.
- `next.config.ts`: `allowedDevOrigins` for the `.homi.loc` hosts; `images.remotePatterns` for `cdn.homi.loc`, `cdn.staging.homi.uz`, `cdn.homi.uz`. `.env.example` per app; `.env.local` present locally.

## Infrastructure
- Local (ADR-0008 + ADR-0012), **working on the first developer's machine** as of 2026-11-08: six `*.homi.loc` hosts in `/etc/hosts`; mkcert cert (valid to 2029-02-08) trusted by the system keychain; Homebrew nginx vhosts symlinked from `infra/local/nginx/`; nginx started by hand (`sudo nginx`, never `brew services` — KI-13); php-fpm :9000, PostgreSQL :5432, Redis :6379 as brew services; Horizon + Next dev servers via `make dev-start`; media on disk behind `cdn.homi.loc` (no local MinIO). `make dev-check` → 24 PASS / 0 WARN / 0 FAIL; HMR WebSocket (`/_next/hmr`) upgrades through nginx.
- Not yet done locally: `make dev-setup` end-to-end on a clean machine; second developer's machine.
- Staging/production: hosts known (web 159.253.19.121, DB 5.45.127.98, MinIO 31.220.104.38 via s3.hc.uz); nothing deployed; DNS for homi.uz not set up.
- Telegram: three bots exist (dev/staging/prod); tokens not in repo; no webhook registered by us.

## AI tooling (Phase 4 in progress, branch `chore/phase-4-ai-infra`)
- Claude Code 2.1.319; Agent models sonnet/opus/haiku/fable. codex 0.167, gemini 0.67, grok 1.0.70 present — **not configured for HOMI yet** (developer said wait).
- Laravel Boost 2.10.4 MCP: **working** — root `.mcp.json` runs `php backend/artisan boost:mcp` (project scope); handshake verified. Sessions must start at the repository root.
- One knowledge base: canonical skills in `.ai/skills/` (19 vendored third-party skills + HOMI's own `save-session`, `SOURCES.md`), `backend/.ai → ../.ai`, `backend/boost.json` tracked (every skill must be listed there), `config/boost.php` agent paths; `php artisan boost:update` (`make ai-sync`) regenerates gitignored `.claude/skills` (37 = 17 official + 20 symlinks), `.agents/skills`, `.grok/skills`. Claude Code discovers the root skills.
- Guard rails: committed `.claude/settings.json` (permissions allow/ask/deny, `worktree.baseRef: head`) wires `.ai/hooks/guard_paths.py` (PreToolUse: reference codebases read-only, `.env*`/keys never printed), `session_context.py` (SessionStart: handoff + next AM/KI numbers), `format_on_edit.py` (PostToolUse: Pint / eslint / vp fmt). `make ai-hooks-test` → 46 tests OK; CI `tooling.yml`. `.ai/local.env` exists on the first developer's machine (gitignored).
- Subagents: `.ai/agents/` (`reference-reader`, `telegram-bot-engineer`, `intake-pipeline-engineer`, `listing-matching-engineer`, `postgis-geo-engineer`, `security-reviewer`), loaded through `.claude/agents → ../.ai/agents`.
- Not yet: root `AGENTS.md`/`GEMINI.md`, `.ai/{rules,tasks}`, hook adapters for other agents, plugins (`php-lsp`, `security-guidance`, `hookify`, `claude-md-management`), Codex/Gemini/Grok smoke tests, remaining marketing skills — waiting for the developer (`docs/ai/reports/phase-4-plan.md`).

## Collectors (outside this repo, read-only)
- `telegram.uz`: Laravel 13 + MadelineProto, PostgreSQL, stores listings/phones(HMAC)/photos, public API `/api/public/v1/listings` (tokens `tk_live_*`). `geo.uz`: web sources. `datahub.uz`: dedup/canon platform, intake not built, no consumer API. Push model into HOMI per ADR-0009.
