# Reproducing the development environment

Purpose: set up a second macOS machine so it matches the first developer's environment as closely as the tools allow — versions, services, agent skills, MCP and rules — and prove it works. Written 2026-11-09 for `/HANDOFF.md`. Day-to-day commands stay in `docs/development/getting-started.md`; troubleshooting in `docs/infrastructure/local-development.md`.

## 1. Reference versions and how they are kept identical

Measured on the first developer's machine on 2026-11-09 (`<tool> --version`).

| Tool | Version | How your machine gets the same |
|---|---|---|
| macOS / CPU | 27.0.1 / arm64 | Apple Silicon with Homebrew in `/opt/homebrew` is assumed by `scripts/dev/*` and `NGINX_ETC` |
| Homebrew | 7.0.12 | — |
| PHP | 8.5.12 + extensions `pdo_pgsql`, `gd`, `intl` (Homebrew) and `redis`, `imagick` (PECL) | `brew install php` (latest 8.5); `make dev-check` compares the minor with `composer.json` `config.platform.php` and fails when any of the five extensions is missing |
| Composer | 2.11.1 | `brew install composer`; resolution is fixed by `composer.lock` + platform pin |
| Node / npm | 26.13.0 / 11.20.0 | Node **major** pinned in `.node-version` (26); `dev-check` fails on another major |
| pnpm | 11.24.0 | `frontend/package.json` `packageManager: pnpm@11.24.0`; `dev-check` checks the major |
| PostgreSQL | 18.6 | `brew install postgresql@18` — keg-only, so its `bin/` must be put on `PATH` (§2 step 3) |
| Redis | 8.10.3 | `brew install redis` |
| nginx | 1.31.8 | `brew install nginx`; started by hand with `sudo nginx` (KI-13) |
| mkcert | 1.4.4 | `brew install mkcert` |
| python3 | 3.15.2 (Homebrew); `/usr/bin/python3` 3.9.6 also works | agent hooks need ≥ 3.9 on `PATH` |
| git / gh / jq / ripgrep | 2.54.0 / 2.103.3 / 1.7.1 / 15.2.0 | `brew install gh jq ripgrep` (not installed by `make dev-setup`); `gh` for cloning and PRs, `jq` only for the `tooling` CI checks |
| Codex CLI | 0.167.0 | `brew install --cask codex` (how the first machine has it); the checks in §4 were run with 0.167 |
| Claude Code (optional) | 2.1.319 | only if you use it — §5 |

Libraries are identical through the lockfiles, provided you **install, never update**: `composer install` (`backend/composer.lock`), `pnpm install --frozen-lockfile` (`frontend/pnpm-lock.yaml`), `npm ci` in `backend/` (`backend/package-lock.json`, frozen starter UI). Any dependency change is a separate, approved PR (`docs/handoff/parallel-work.md` §4).

## 2. Setup on a clean Mac

Run these steps yourself in a terminal — several ask for sudo or a password; an agent can read the output afterwards.

1. **Prerequisites.** Xcode command-line tools (`xcode-select --install`), Homebrew, then:
   ```bash
   brew install gh jq ripgrep && brew install --cask codex
   gh auth login                        # HTTPS is fine; no SSH key needed
   ```
2. **nginx layout (manual, once).** `scripts/dev/nginx.sh` links the vhosts into `/opt/homebrew/etc/nginx/sites-enabled/` and stops with "sites-available not found" when that layout is missing. A fresh Homebrew nginx has only `servers/`. If you do not already use `sites-enabled`:
   ```bash
   brew install nginx
   mkdir -p /opt/homebrew/etc/nginx/sites-available /opt/homebrew/etc/nginx/sites-enabled
   # inside the http { … } block of /opt/homebrew/etc/nginx/nginx.conf add:
   #     include sites-enabled/*.conf;
   ```
   The HOMI vhosts are self-contained (TLS, headers, `$approot` come from `infra/local/nginx/snippets/`). One more line matters: nginx workers must be able to read your checkout. Homebrew's default (`#user nobody;`) cannot enter a home folder; the first developer's `nginx.conf` has `user root staff;` at the top. `user <your-macOS-user> staff;` should work as well and is less privileged, but it was not tested here. Never start nginx with `brew services` (KI-13) — `make dev-nginx` runs `sudo nginx` from your terminal.
   macOS privacy (TCC): the first checkout lives under `~/Documents`, which works when the terminal that runs `sudo nginx` has access to Documents (macOS asks once; see System Settings → Privacy & Security → Files and Folders). A checkout outside `~/Documents`, `~/Desktop` and `~/Downloads` avoids the prompt.
3. **PHP extensions and PostgreSQL client tools.** `make dev-check` fails without `redis` and `imagick`, and the Redis queue/cache use `REDIS_CLIENT=phpredis`. On the first machine `redis.so` and `imagick.so` sit in PHP's extension directory next to the `imagemagick` and `pkgconf` formulae, which is what PECL produces; the exact commands used there were not recorded:
   ```bash
   brew install php imagemagick pkgconf
   pecl install redis imagick           # accept the defaults; pecl adds extension=… to php.ini
   brew services restart php
   php -m | grep -E '^(redis|imagick|gd|intl|pdo_pgsql)$'   # all five must be listed
   echo 'export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"' >> ~/.zshrc && exec zsh   # postgresql@18 is keg-only
   ```
4. **Clone and branch.**
   ```bash
   gh repo clone amediateam/homi homi.uz && cd homi.uz
   git switch main                      # or chore/phase-4-ai-infra until the stack is merged (HANDOFF.md §3)
   cp .ai/local.env.example .ai/local.env
   ```
   `.ai/local.env` holds machine paths. Leave the `/path/to/...` placeholders for reference checkouts you do not have — the hooks skip them. Never commit absolute paths anywhere else.
5. **Run the setup** — it installs the Homebrew formulas, starts `php`, `postgresql@18` and `redis` as brew services, runs `composer install`, syncs the agent skills (`boost:update`), installs the pnpm workspace, creates `frontend/*/.env.local`, generates the mkcert certificate, links nginx, writes `/etc/hosts` and prepares `storage/app/public`. Every sudo step is announced first (`scripts/dev/setup.sh --no-sudo` skips them and prints what to run; `make dev-setup` always runs them).
   ```bash
   make dev-setup
   ```
   On the first run it creates `backend/.env`, **warns**, skips the migration (no database yet) and carries on with the remaining steps. Then fill in locally (never commit, never share):
   - `DB_USERNAME` / `DB_PASSWORD` — your local PostgreSQL role (Homebrew makes your macOS user a superuser; the password may stay empty), then `createdb homi`;
   - `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET` — any random strings, e.g. `php -r 'echo bin2hex(random_bytes(16)), PHP_EOL;'` (Reverb is not started by `make dev-start`; nothing broadcasts yet);
   - `TELEGRAM_*` — the script's warning mentions them, but they can stay empty until task T1; then use **your own** dev bot (`HANDOFF.md` §5).

   Then run `make dev-setup` again (idempotent) — this time it migrates.
6. **Frozen starter UI build** — `make dev-setup` does not do it, but `make ci-backend` and the `home` feature test need it (GitHub CI runs it through `composer setup`):
   ```bash
   (cd backend && npm ci && npm run build)
   ```
7. **Start:** `make dev-start` (Horizon + Next dev servers on 3000/3001/3002, logs in `infra/local/logs/`).

## 3. Verify — expected results

| Command | Expected (first developer's machine, 2026-11-09) |
|---|---|
| `make dev-check` | 24 PASS lines, last line `dev:check OK (0 warning(s))` |
| `make ci-backend` | exit 0; 47 tests passed, PHPStan 0 errors, Vite+ "correctly formatted" and "no warnings or lint errors". In a terminal Pest prints its normal report; under an AI agent `laravel/pao` condenses it to one JSON line (`{"tool":"pest","result":"passed","tests":47,…}`) |
| `make ci-frontend` | exit 0 (lint, typecheck with `next typegen`, build of all three apps) |
| `make ai-hooks-test` | `Ran 46 tests` … `OK` |
| `make registry-check` | `package registry is current` |
| `make ai-skills` | the official Boost skills plus the 20 from `.ai/skills/` |
| Browser | `https://homi.loc`, `https://app.homi.loc`, `https://arm.homi.loc` load without a certificate warning; `https://api.homi.loc/up` → 200; `https://cdn.homi.loc/health.txt` → 200 |

Record your run (commands, output excerpts, PASS/FAIL) — it is the project's first clean-machine install (`HANDOFF.md` T0).

## 4. AI agent setup — Codex (primary for the second developer)

What the repository already provides for every agent:

| Piece | Where | Notes |
|---|---|---|
| Instructions | root `AGENTS.md` → `HANDOFF.md`, `CLAUDE.md`; (Codex does not read the root `.mcp.json` — that file is Claude Code's) nested `backend/AGENTS.md` (Boost guidelines, generated) and `frontend/<app>/AGENTS.md` (Next.js 16) | Codex 0.167 loads the root `AGENTS.md` automatically when started at the repository root; it does **not** load nested ones from the root (checked with a probe repository) — the root file tells it to read them |
| Skills | canonical `.ai/skills/` (20: 19 vendored + HOMI's `save-session`, provenance in `.ai/skills/SOURCES.md`) + 17 official Boost skills → generated `.agents/skills/` for Codex by `make ai-sync` | `codex debug prompt-input` listed 37 skills from `<repo>/.agents/skills` on 2026-11-09 |
| Domain rulebooks | `.ai/agents/*.md` (Claude Code subagent definitions) | Codex has no HOMI agent definitions — read the matching file as a checklist (telegram bot, intake, matching, PostGIS, security review; `reference-reader` for reference codebases) |
| Memory | `.ai/memory/{current-state,known-issues,session-handoff}.md`; skill `save-session` at the end of a session | see `docs/handoff/parallel-work.md` §5 for the two-track rule |
| MCP | Laravel Boost server `php backend/artisan boost:mcp` — tools `search-docs`, `database-schema`, `database-query`, `database-connections`, `last-error`, `read-log-entries`, `browser-logs`, `get-absolute-url`, `record-rule` | do not use `record-rule` yet: it writes `.ai/rules/`, which is not approved (Phase 4 pending) |

Steps:

1. Start Codex **from the repository root** and trust the project when asked. Keep the human-only steps (§2: sudo, nginx, `/etc/hosts`, mkcert, `pecl`, `make dev-setup`) in your own terminal. Some checks need network access or reach outside the repository — `make dev-check` (HTTPS to `*.homi.loc`, PostgreSQL, Redis), `make ci-frontend` (the apps load Google Fonts through `next/font/google`), `codex mcp add` (writes `~/.codex`) — so approve them when Codex asks, or run them yourself.
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

## 5. AI agent setup — Claude Code (optional)

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
