# Setup runbook — a new developer machine

Purpose: one file that takes a clean Mac to a running, verified HOMI environment with a configured AI agent — written so the developer and their agent (Claude Code with any model, e.g. Fable, or Codex) can follow it step by step. Background, versions and the reasons behind each step: `docs/handoff/environment.md`; the work plan after setup: `HANDOFF.md` §4.

**Who does what.** **[you]** — the developer, in their own terminal: sudo, passwords, anything secret. **[agent]** — the AI agent started in the repository. The agent never runs sudo and never reads or edits `.env` files (in Claude Code the project hooks and permissions refuse it anyway).

**Stop rule.** Every step ends with a check. If the check does not give the expected result, stop, keep the output, and fix it only as described here — or ask. Problems you find are part of the result (step F).

**For the agent:** read this whole file first, then walk the developer through it from the first unfinished step. Tell them exactly which **[you]** command to run and wait for the pasted output; run the **[agent]** steps yourself and show command + output for each check. Talk to the developer in their language; anything written into the repository is in English.

## A. Before the agent exists — [you], about 15 minutes

| # | Do | Check |
|---|---|---|
| A1 | `xcode-select --install` | `xcode-select -p` prints a path |
| A2 | Install Homebrew from https://brew.sh and run the `eval "$(/opt/homebrew/bin/brew shellenv)"` line it prints | `brew --version`; `brew --prefix` → `/opt/homebrew` |
| A3 | `brew install gh jq ripgrep git` and your agent: `brew install --cask claude-code` (or the native installer from https://claude.ai) **or** `brew install --cask codex` | `claude --version` ≥ 2.1.319 or `codex --version` ≥ 0.167 |
| A4 | `gh auth login` (GitHub.com, HTTPS) — you need collaborator access to `amediateam/homi` first | `gh repo view amediateam/homi --json name` prints `{"name":"homi"}` |
| A5 | Clone: `gh repo clone amediateam/homi homi.uz && cd homi.uz` — the default branch `main` holds everything | `ls HANDOFF.md docs/handoff/setup.md` |
| A6 | Start the agent **in the repository root**: `claude` (trust the folder; choose the model with `/model`) or `codex` (trust the project). Then give it the first message from the end of this file | the agent answers after reading this file |

On the first Claude Code start the SessionStart hook reports missing `.ai/local.env`, `backend/vendor`, `backend/.env` and `.claude/skills` — expected on a fresh clone; the next sections create them.

## B. System prerequisites — [you] run, [agent] checks

**B1 nginx layout.** `brew install nginx`, then:
```bash
mkdir -p /opt/homebrew/etc/nginx/sites-available /opt/homebrew/etc/nginx/sites-enabled
```
Edit `/opt/homebrew/etc/nginx/nginx.conf`: inside `http { … }` add `include sites-enabled/*.conf;`, and set the worker user at the top. Prefer `user <your-macOS-user> staff;` — less privileged; verified on the second machine 2026-11-09 with the checkout under `~/Documents` (all six vhosts, 24/24 `dev-check`). The first developer's file has `user root staff;`, which also works. The default `#user nobody;` cannot read a checkout in your home folder. Never start nginx with `brew services` (KI-13). Homebrew's sample `server { listen 8080; }` in the same file can stay for now, but it occupies Reverb's port (KI-24).
**[agent] check:** `grep -nE '^\s*user |include sites-enabled' /opt/homebrew/etc/nginx/nginx.conf` shows both lines; `ls -d /opt/homebrew/etc/nginx/sites-enabled`.

**B2 PHP and its extensions.**
```bash
brew install php imagemagick pkgconf
pecl install redis imagick           # accept the defaults
brew services restart php
```
**[agent] check:** `php -r 'echo PHP_VERSION, PHP_EOL;'` → `8.5.x`; `php -m | grep -cE '^(redis|imagick|gd|intl|pdo_pgsql)$'` → `5`.

**B3 PostgreSQL client tools on PATH** (`postgresql@18` is keg-only):
```bash
brew install postgresql@18
echo 'export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"' >> ~/.zshrc && exec zsh
```
If `postgresql@18` is already linked (`brew link --force`), `createdb`/`psql` are in `/opt/homebrew/bin` and the PATH line is not needed (AM-37).
**[agent] check:** `for c in createdb psql; do readlink -f "$(command -v $c)"; done` prints two paths inside the `postgresql@18` keg (`/opt/homebrew/Cellar/postgresql@18/…/bin`).

**B4 macOS privacy.** If the checkout is under `~/Documents`, `~/Desktop` or `~/Downloads`, the terminal that runs `sudo nginx` needs access to that folder (macOS asks once; System Settings → Privacy & Security → Files and Folders). Elsewhere nothing is needed.

## C. Project setup

| # | Who | Do | Check |
|---|---|---|---|
| C1 | agent | `cp .ai/local.env.example .ai/local.env` — keep the `/path/to/...` placeholders for reference checkouts you do not have | `test -f .ai/local.env && echo ok` |
| C2 | you | `make dev-setup` in your terminal. It installs/starts the Homebrew services, `composer install`, `npm ci` in `backend/` (before the skill sync, KI-22), syncs agent skills, installs the pnpm workspace, creates `frontend/*/.env.local`, makes the mkcert certificate (CA install asks for your password), links nginx, writes `/etc/hosts`, prepares media storage. The first run creates `backend/.env`, **warns** and skips the migration — that is expected | output ends with the `dev-check` summary and "next: make dev-start" |
| C3 | you | Edit `backend/.env`: `DB_USERNAME` = your macOS user, `DB_PASSWORD` empty (Homebrew default) or your role's password, `REVERB_APP_ID` / `REVERB_APP_KEY` / `REVERB_APP_SECRET` = random strings (`php -r 'echo bin2hex(random_bytes(16)), PHP_EOL;'`). Leave `TELEGRAM_*` empty until task T1. Then `createdb homi` | **[agent]** names only, never values: `for k in DB_USERNAME REVERB_APP_ID REVERB_APP_KEY REVERB_APP_SECRET; do printf '%s %s\n' "$k" "$(grep -cE "^$k=.+" backend/.env)"; done` → `1` for each |
| C4 | you | `make dev-setup` again (idempotent) — this time it migrates | output contains "database migrated" |
| C5 | agent | `(cd backend && npm ci && npm run build)` — the frozen starter UI build that `make ci-backend` needs | exit 0; `ls backend/public/build/manifest.json` |
| C6 | agent | `make dev-start` | `make dev-status` → four PASS lines (horizon, next-landing, next-app, next-arm) |

## D. Verify — [agent]

Some checks need network or reach outside the repository (HTTPS to `*.homi.loc`, PostgreSQL/Redis, Google Fonts during the Next build) — approve them when the agent asks.

| Command | Expected |
|---|---|
| `make dev-check` | 24 PASS lines, last line `dev:check OK (0 warning(s))` |
| `make ci-backend` | exit 0; 47 tests passed, PHPStan 0 errors, Vite+ "correctly formatted" and "no warnings or lint errors" (under an agent Pest prints one JSON line `{"tool":"pest","result":"passed","tests":47,…}`) |
| `make ci-frontend` | exit 0 (lint, typecheck, build of landing, app, arm) |
| `make ai-hooks-test` | `Ran 46 tests` … `OK` |
| `make registry-check` | `package registry is current` |
| `make ai-skills` | the official Boost skills plus the 20 from `.ai/skills/` |
| `curl -s -o /dev/null -w '%{http_code}\n' https://api.homi.loc/up` and `…/cdn.homi.loc/health.txt` | `200` and `200` |
| **[you]** open `https://homi.loc`, `https://app.homi.loc`, `https://arm.homi.loc` | pages load without a certificate warning |

## E. Agent configuration

### E1 Claude Code (any model — Fable, Opus, Sonnet)

| # | Who | Do | Check |
|---|---|---|---|
| E1.1 | you | Restart `claude` in the repository root so the SessionStart hook and the MCP server see the finished setup | the session-start context no longer lists missing local tooling |
| E1.2 | you | Approve the project MCP server `laravel-boost` (prompt on start, or `/mcp`) | `/mcp` shows `laravel-boost` connected; **[agent]** calls its `search-docs` tool once |
| E1.3 | agent | Confirm skills and subagents | `python3 -c 'import os; print(len(os.listdir(".claude/skills")))'` → 37; `ls .claude/agents/` lists six `.md` agents plus `README.md` |
| E1.4 | you, then agent | Prove the guard: **[you]** `echo PROBE=dummy > backend/.env.probe`; **[agent]** tries `cat backend/.env.probe`; **[you]** `rm backend/.env.probe` | the agent's `cat` is refused by the PreToolUse hook (a refusal is the PASS) |
| E1.5 | agent | Seed Claude Code's auto-memory with the first developer's portable notes — the command block below the table (the project memory in the repo loads anyway; this adds the team conventions to the per-user memory; it writes outside the repository, so approve it; `cp -n` never overwrites) | `ls "$D"` shows `MEMORY.md`, `homi-project.md`, `homi-team-conventions.md`; after a restart `/memory` lists them |
| E1.6 | — | Optional | personal overrides go into `.claude/settings.local.json` (gitignored). If your user-level hooks handle `WorktreeCreate`, the Agent tool's worktree isolation fails (KI-18) — use `git worktree add --detach .worktrees/<name> HEAD`. The first developer's user-level plugins are not required |

E1.5 — run in the repository root:
```bash
D="$HOME/.claude/projects/$(pwd | sed 's#[/.]#-#g')/memory"
ls "$(dirname "$D")"/*.jsonl          # must list this session's transcript — proves the folder name is right
mkdir -p "$D" && cp -n docs/handoff/claude-memory/*.md "$D/" && ls "$D"
```


### E2 Codex (instead of Claude Code)

| # | Who | Do | Check |
|---|---|---|---|
| E2.1 | you | `codex mcp add homi-boost -- php "$PWD/backend/artisan" boost:mcp` (run in the repository root) | `codex mcp list` shows `homi-boost … enabled` |
| E2.2 | agent | `codex debug prompt-input "ping" > /tmp/homi-codex-prompt.json` | `grep -c 'Reference codebases are read-only' /tmp/homi-codex-prompt.json` ≥ 1 (root `AGENTS.md` loaded); `grep -c 'homi.uz/.agents/skills' /tmp/homi-codex-prompt.json` ≥ 1 |
| E2.3 | you | In a Codex session run `/mcp` | `homi-boost` lists nine tools (`search-docs`, `database-schema`, …) |

Codex has no HOMI hooks: the hard rules in `AGENTS.md` are followed by hand (details: `environment.md` §4).

## F. Finish — record the result (this is task T0)

1. **[agent]** Create `docs/testing/verification-log.md` with one row per check from B–E: date, command, output excerpt, PASS/FAIL. Mark it as a **preliminary** scenario A record; the formal Phase 7 run is done later by an independent verifier.
2. **[agent]** Every deviation from this runbook becomes a `KI-<next>` row in `.ai/memory/known-issues.md` (open problem with a workaround) or an `AM-<next>` line in the phase document (wrong assumption). Small fixes to this file or to `scripts/dev/*` go into the same PR.
3. **[you]** Add your GitHub login next to `@amediateam` on each line of `.github/CODEOWNERS`. If you work under the `amediateam` account itself, skip this and record it (AM-38).
4. **[agent]** Branch `chore/onboarding-second-machine` from the base (A5), commit (Conventional Commits, English), push, open a PR against that base. The first developer reviews it.
5. Continue with `HANDOFF.md` §4 — T1, plan first, code after the developer's OK.

## First message for the agent (A6)

```text
Read docs/handoff/setup.md completely, then AGENTS.md (Codex) or CLAUDE.md (Claude Code) and HANDOFF.md.
Walk me through setup.md from the first unfinished step: tell me each [you] command and wait for my pasted output; run the [agent] steps yourself and show command and output for every check.
Never run sudo, never read or edit .env files, do not change anything outside setup.md without asking me, and never claim a check you did not run.
Talk to me in Russian; write repository artifacts in English. When section F is done, propose the plan for task T1 and wait.
```
