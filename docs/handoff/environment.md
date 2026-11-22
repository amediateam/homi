# Reproducing the development environment

Purpose: set up a second macOS machine so it matches the first developer's environment as closely as the tools allow — versions, services, agent skills, MCP and rules — and prove it works. Written 2026-11-09 for `/HANDOFF.md`. Day-to-day commands stay in `docs/development/getting-started.md`; troubleshooting in `docs/infrastructure/local-development.md`.

## 1. Reference versions and how they are kept identical

Measured on the first developer's machine on 2026-11-09 (`<tool> --version`).

| Tool | Version | How your machine gets the same |
|---|---|---|
| macOS / CPU | 27.0.1 / arm64 | Apple Silicon with Homebrew in `/opt/homebrew` is assumed by `scripts/dev/*` and `NGINX_ETC` |
| Homebrew | 7.0.12 | — |
| PHP | 8.6.0 + extensions `pdo_pgsql`, `gd`, `intl` (Homebrew) and `redis`, `imagick` (built from source until PECL releases support 8.6: `phpredis` `release/6.4.0RC1`, `Imagick` `master`; each enabled by its own `conf.d/ext-*.ini`) | `brew install php` (latest 8.6); `make dev-check` compares the minor with `composer.json` `config.platform.php` and fails when any of the five extensions is missing |
| Composer | 2.11.1 | `brew install composer`; resolution is fixed by `composer.lock` + platform pin |
| Node / npm | 26.13.0 / 11.20.0 | Node **major** pinned in `.node-version` (26); `dev-check` fails on another major |
| pnpm | 11.24.0 | `frontend/package.json` `packageManager: pnpm@11.24.0`; `dev-check` checks the major |
| PostgreSQL | 18.6 | `brew install postgresql@18` — keg-only, so its `bin/` must be put on `PATH` (`setup.md` B3) |
| Redis | 8.10.3 | `brew install redis` |
| nginx | 1.31.8 | `brew install nginx`; started by hand with `sudo nginx` (KI-13) |
| mkcert | 1.4.4 | `brew install mkcert` |
| python3 | 3.15.2 (Homebrew); `/usr/bin/python3` 3.9.6 also works | agent hooks need ≥ 3.9 on `PATH` |
| git / gh / jq / ripgrep | 2.54.0 / 2.103.3 / 1.7.1 / 15.2.0 | `brew install gh jq ripgrep` (not installed by `make dev-setup`); `gh` for cloning and PRs, `jq` only for the `tooling` CI checks |
| Codex CLI | 0.167.0 | `brew install --cask codex` (how the first machine has it); the checks in §4 were run with 0.167 |
| Claude Code | 2.1.319 | `brew install --cask claude-code` or the native installer (the first machine's `claude` resolves to `~/.local/bin`); any model, e.g. Fable — §5 |

Libraries are identical through the lockfiles, provided you **install, never update**: `composer install` (`backend/composer.lock`), `pnpm install --frozen-lockfile` (`frontend/pnpm-lock.yaml`), `npm ci` in `backend/` (`backend/package-lock.json`, frozen starter UI). Any dependency change is a separate, approved PR (`docs/handoff/parallel-work.md` §4).

## 2. Setup on a clean Mac

The step-by-step runbook — who runs what, the check after every step, the manual nginx, PHP-extension and PostgreSQL-PATH prerequisites — is [`setup.md`](setup.md). Reasons behind the non-obvious steps:

- `scripts/dev/nginx.sh` expects the `sites-available`/`sites-enabled` layout and an `include sites-enabled/*.conf;` in `nginx.conf`; a fresh Homebrew nginx has only `servers/`. nginx workers must be able to read the checkout (the first developer's `nginx.conf` has `user root staff;`); nginx is started with `sudo nginx`, never `brew services` (KI-13).
- `make dev-check` requires the PHP extensions `pdo_pgsql`, `redis`, `gd`, `imagick`, `intl`; `redis` and `imagick` come from PECL (on the first machine `redis.so`/`imagick.so` sit next to the `imagemagick` and `pkgconf` formulae — the exact install commands were not recorded). The queue and cache use `REDIS_CLIENT=phpredis`.
- `postgresql@18` is keg-only (`brew info` → `keg_only: true`), so `createdb`/`psql` need its `bin/` on `PATH`.
- The first `make dev-setup` run creates `backend/.env`, warns and skips the migration; the second run migrates. `scripts/dev/setup.sh --no-sudo` skips the sudo steps (`make dev-setup` always runs them).
- `make dev-setup` does not build the frozen starter UI; `make ci-backend` and the `home` feature test need `npm ci && npm run build` in `backend/` (GitHub CI does it through `composer setup`).
- `REVERB_*` only need random local values (Reverb is not started by `make dev-start`); `TELEGRAM_*` stay empty until task T1 and then belong to your own dev bot.

## 3. Expected check results

The verification table is [`setup.md`](setup.md) §D (first developer's machine, 2026-11-09: `make dev-check` 24 PASS, `make ci-backend` exit 0 with 47 tests, `make ci-frontend` exit 0, `make ai-hooks-test` 46 OK).

## 4. AI agent setup — Codex

What the repository already provides for every agent:

| Piece | Where | Notes |
|---|---|---|
| Instructions | root `AGENTS.md` → `HANDOFF.md`, `CLAUDE.md`; (Codex does not read the root `.mcp.json` — that file is Claude Code's) nested `backend/AGENTS.md` (Boost guidelines, generated) and `frontend/<app>/AGENTS.md` (Next.js 16) | Codex 0.167 loads the root `AGENTS.md` automatically when started at the repository root; it does **not** load nested ones from the root (checked with a probe repository) — the root file tells it to read them |
| Skills | canonical `.ai/skills/` (20: 19 vendored + HOMI's `save-session`, provenance in `.ai/skills/SOURCES.md`) + 17 official Boost skills → generated `.agents/skills/` for Codex by `make ai-sync` | `codex debug prompt-input` listed 37 skills from `<repo>/.agents/skills` on 2026-11-09 |
| Domain rulebooks | `.ai/agents/*.md` (Claude Code subagent definitions) | Codex has no HOMI agent definitions — read the matching file as a checklist (telegram bot, intake, matching, PostGIS, security review; `reference-reader` for reference codebases) |
| Memory | `.ai/memory/{current-state,known-issues,session-handoff}.md`; skill `save-session` at the end of a session | see `docs/handoff/parallel-work.md` §5 for the two-track rule |
| MCP | Laravel Boost server `php backend/artisan boost:mcp` — tools `search-docs`, `database-schema`, `database-query`, `database-connections`, `last-error`, `read-log-entries`, `browser-logs`, `get-absolute-url`, `record-rule` | do not use `record-rule` yet: it writes `.ai/rules/`, which is not approved (Phase 4 pending) |

Steps:

1. Start Codex **from the repository root** and trust the project when asked. Keep the human-only steps (`setup.md` **[you]** rows: sudo, nginx, `/etc/hosts`, mkcert, `pecl`, `make dev-setup`) in your own terminal. Some checks need network access or reach outside the repository — `make dev-check` (HTTPS to `*.homi.loc`, PostgreSQL, Redis), `make ci-frontend` (the apps load Google Fonts through `next/font/google`), `codex mcp add` (writes `~/.codex`) — so approve them when Codex asks, or run them yourself.
2. Add the Boost MCP server at user level (Codex keeps MCP servers in `~/.codex/config.toml`; the absolute path makes it work from any directory):
   ```bash
   codex mcp add homi-boost -- php "$PWD/backend/artisan" boost:mcp
   codex mcp list            # homi-boost  php  <repo>/backend/artisan boost:mcp  …  enabled
   ```
   Do not add a server that runs `php artisan boost:mcp` without a path — it fails everywhere outside `backend/`.
3. Check what Codex sees (no model call):
   ```bash
   codex debug prompt-input "ping" > /tmp/homi-codex-prompt.json
   grep -c 'HANDOFF.md' /tmp/homi-codex-prompt.json      # ≥ 1 → root AGENTS.md loaded
   grep -o '\.agents/skills' /tmp/homi-codex-prompt.json | head -1   # repo skills registered
   ```
   In a live Codex session `/mcp` should show `homi-boost` with the nine tools above.

What Codex does **not** get (Claude Code-only today; task T9 in `HANDOFF.md`):
- the hooks in `.ai/hooks/` — the path guard (reference codebases read-only, `.env*` never printed), the session-start context and format-on-edit. In Codex these are rules in `AGENTS.md` that you and the agent follow by hand: run Pint / eslint after edits, read `.ai/memory/*` at start, never open secret files;
- the permission lists of `.claude/settings.json` (ask/deny) — Codex's own sandbox and approval prompts are the only technical guard.

Verified on 2026-11-09: the Boost server answers `initialize` + `tools/list` (9 tools) when started with the absolute artisan path from another directory; `codex mcp add` writes exactly the entry above (tested with a throw-away `CODEX_HOME`). Not verified: a live Codex session calling the tools.

## 5. AI agent setup — Claude Code (any model, e.g. Fable)

- Everything is committed: `.claude/settings.json` (permissions + three Python hooks), `.claude/agents → ../.ai/agents`, root `.mcp.json`. Skills: `.claude/skills/` from `make ai-sync`.
- On the first start at the repository root, **approve the project MCP server `laravel-boost`** (prompt or `/mcp`). On 2026-11-09 `claude mcp list` showed it as "Pending approval" on the first developer's machine until approved.
- Personal overrides go to `.claude/settings.local.json` (gitignored; `"disableAllHooks": true` switches the hooks off for you).
- If your user-level `~/.claude/settings.json` has hooks on `WorktreeCreate`, the Agent tool's `isolation: worktree` fails (KI-18); use `git worktree add --detach .worktrees/<name> HEAD`.
- The first developer's user-level plugins (`superpowers`, `code-review`, `context7`, … — list in `docs/ai/reports/phase-4-plan.md` §1) are personal and not required by the project.

## 6. Debugging

- Processes and logs: `make dev-status`, `make dev-logs` (nginx vhost logs, Horizon, Next); `cd backend && php artisan pail` for the Laravel log stream.
- Dashboards (local only): `https://api.homi.loc/horizon`, `/telescope`, `/pulse`.
- Through the Boost MCP: `last-error`, `read-log-entries`, `browser-logs`, `database-schema`, `database-query` (read-only questions about the local DB).
- Tests: `php artisan test --compact --filter=<name>`; Pest runs on in-memory SQLite (`phpunit.xml`), so check PostgreSQL-specific SQL against the real `homi` database; browser tests `php artisan dusk` (not part of `artisan test`).
- Symptom table (certificates, 502, `cdn` 404, HMR, ports, Telegram tunnels): `docs/infrastructure/local-development.md` §Troubleshooting; tool quirks: `.ai/memory/known-issues.md`.
