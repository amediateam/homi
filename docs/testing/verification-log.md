# Verification log

## 2026-11-09 — T0: clean-machine setup on the second machine (PRELIMINARY scenario A record)

**Status: preliminary.** This is the development track's own record of following `docs/handoff/setup.md` on a second Mac; it is not the formal Phase 7 verification, which an independent verifier runs later (mandate §23).

- Machine: Apple Silicon (arm64), macOS 26.5.1, Homebrew in `/opt/homebrew`, checkout under `~/Documents`.
- Base: `main` at `aa8149e`.
- Agent: Claude Code 2.1.319 (Opus). Runbook variant E1 (Claude Code); E2 (Codex) not applicable.
- Roles: B1–B3, the PostgreSQL/Redis start and `createdb homi` were run by the agent (no sudo, no secrets) at the developer's request; C2–C4 (sudo: mkcert CA, `nginx -t`/reload, `/etc/hosts`; `backend/.env` values) were run by the developer in their own terminal. The agent never ran sudo and never read `backend/.env` (only key-name counts).
- Machine state before the run: Xcode CLT, Homebrew, `gh` (authenticated), PHP 8.5.12 with `redis`, PostgreSQL 18.6 (already linked into `/opt/homebrew/bin`), Redis 8.10, nginx 1.31.8 and Node 26 were already installed; ImageMagick/`imagick`, `pnpm`, `mkcert` were not.

| Date | Step | Command | Output excerpt | Result |
|---|---|---|---|---|
| 2026-11-09 | A1 | `xcode-select -p` | `/Library/Developer/CommandLineTools` | PASS |
| 2026-11-09 | A2 | `brew --version; brew --prefix` | `Homebrew 7.0.12`, `/opt/homebrew` | PASS |
| 2026-11-09 | A3 | `claude --version` | `2.1.319 (Claude Code)`; `gh`, `jq`, `rg`, `git` on PATH | PASS |
| 2026-11-09 | A4 | `gh repo view amediateam/homi --json name` | `{"name":"homi"}` | PASS |
| 2026-11-09 | A5 | `git pull --ff-only origin main` (existing clone) | fast-forward `f8f9564..aa8149e`, 689 tracked files | PASS |
| 2026-11-09 | B1 | `grep -nE '^\s*user \|include sites-enabled' /opt/homebrew/etc/nginx/nginx.conf`; `ls -d …/sites-enabled` | `2:user shohsanam staff;` `115:    include sites-enabled/*.conf;`; directory present. Worker user = macOS user (the runbook's untested option) — works, see D | PASS |
| 2026-11-09 | B2 | `php -r 'echo PHP_VERSION;'`; `php -m \| grep -cE '^(redis\|imagick\|gd\|intl\|pdo_pgsql)$'` | `8.5.12`; `5` (`imagick` 3.8.1 built by `pecl` against ImageMagick 7.1.2-35) | PASS |
| 2026-11-09 | B3 | `command -v createdb psql` | `/opt/homebrew/bin/createdb`, `/opt/homebrew/bin/psql` → resolve to `Cellar/postgresql@18/18.6_1/bin` — runbook expected `/opt/homebrew/opt/postgresql@18/bin` (AM-37, check fixed) | PASS (deviation) |
| 2026-11-09 | B4 | — | checkout under `~/Documents`; terminal access granted by the developer; `sudo nginx` serves files from the checkout (D) | PASS |
| 2026-11-09 | C1 | `test -f .ai/local.env && echo ok` | `ok` (reference checkouts present on this machine: app.uz, telegram.uz, datahub.uz, geo.uz — paths set; nginx mirrors absent, placeholders kept) | PASS |
| 2026-11-09 | C2 | `make dev-setup` (first run, developer) | output not captured (the developer's log file of the first run was not written); its artifacts exist: `backend/vendor`, `frontend/*/.env.local`, `infra/local/certs/homi.loc.pem`, `/etc/hosts` block, `backend/.env` | PASS (output not recorded) |
| 2026-11-09 | C3 | `for k in DB_USERNAME REVERB_APP_ID REVERB_APP_KEY REVERB_APP_SECRET; do … grep -cE "^$k=.+" backend/.env; done` | `1` for each key (values set by the developer with `sed`, never shown); `createdb homi` → owner `shohsanam`, role without password | PASS |
| 2026-11-09 | C4 | `make dev-setup` (second run, developer) | `PASS  database migrated`; `sudo nginx -t` → `test is successful`; `nginx reloaded`; 13 migrations `Ran` | PASS |
| 2026-11-09 | C4 side effect | `git status` after C2–C4 | `backend/boost.json` lost 3 skills (KI-22, fixed); `make dev-check` inside setup: false FAIL for pnpm, false PASS for Next servers (KI-21, fixed) | FAIL → fixed |
| 2026-11-09 | C5 | `(cd backend && npm ci && npm run build)` | `found 0 vulnerabilities`; `✓ built in 2.51s`; exit 0; `public/build/manifest.json` present | PASS |
| 2026-11-09 | C6 | `make dev-start`; `make dev-status` | four `PASS` lines: horizon, next-landing :3000, next-app :3001, next-arm :3002 | PASS |
| 2026-11-09 | C6 side effect | `git status` after `make dev-start` | `next dev` appended a `nextjs-agent-feedback` block to `frontend/{landing,app,arm}/AGENTS.md` (KI-23) | FAIL → fixed |
| 2026-11-09 | C6 side effect, fix | `agentFeedback: false` in the three `next.config.ts`; `git checkout` the three `AGENTS.md`; `services.sh restart next-landing next-app next-arm`; `git status --short` | no `AGENTS.md` change; `grep -c agent-feedback frontend/*/AGENTS.md` → `0` ×3; hosts 200/200/200; `make ci-frontend` exit 0 (3 builds) | PASS |
| 2026-11-09 | D | `make dev-check` (before the fix) | 23 PASS, `FAIL  pnpm 12 ≠ pnpm@11` (KI-21) | FAIL → fixed |
| 2026-11-09 | D | `make dev-check` (after the fix) | 24 PASS, `dev:check OK (0 warning(s))` | PASS |
| 2026-11-09 | D | `scripts/dev/check.sh` with `next-arm` stopped (negative test of the fix) | `WARN  Next dev servers not all running`, `FAIL  https://arm.homi.loc/ → 502` | PASS |
| 2026-11-09 | D | KI-22 fix: `backend/node_modules` moved aside, then `scripts/dev/setup.sh --no-sudo` | `PASS  backend npm packages installed` before `PASS  agent skills synced (boost:update)`; `git diff --stat backend/boost.json` empty; `.claude/skills` 37; `dev:check OK (0 warning(s))` | PASS |
| 2026-11-09 | D | `make ci-backend` | `vp check` correctly formatted / no warnings or lint errors; `tsc` ok; `{"tool":"pint","result":"passed"}`, `{"tool":"phpstan","result":"passed","errors":0}`, `{"tool":"pest","result":"passed","tests":47,"passed":47,"assertions":157}`; exit 0 | PASS |
| 2026-11-09 | D | `make ci-frontend` | lint, typecheck, build of landing/app/arm (`/`, `/_not-found` static); exit 0 | PASS |
| 2026-11-09 | D | `make ai-hooks-test` | `Ran 46 tests in 0.248s` `OK` | PASS |
| 2026-11-09 | D | `make registry-check` | `package registry is current` | PASS |
| 2026-11-09 | D | `make ai-skills` | `Found 37 skills` — 17 official Boost skills + 20 local from `.ai/skills/` | PASS |
| 2026-11-09 | D | `curl -s -o /dev/null -w '%{http_code}' https://api.homi.loc/up` / `https://cdn.homi.loc/health.txt` | `200` / `200` | PASS |
| 2026-11-09 | D | browser: `https://homi.loc`, `https://app.homi.loc`, `https://arm.homi.loc` | developer: all three open without a certificate warning | PASS |
| 2026-11-09 | E1.1 | restart Claude Code (`claude --continue`); the SessionStart hook run as Claude Code runs it (`CLAUDE_PROJECT_DIR=$PWD python3 .ai/hooks/session_context.py` with a `SessionStart` event) | `local tooling present (.ai/local.env, backend/vendor, backend/.env, .claude/skills)`; `Next numbers: ASSUMPTION_MISMATCH AM-39, known issue KI-25` | PASS |
| 2026-11-09 | E1.2 | `/mcp` → `laravel-boost` connected; one `search-docs` call | server side checked: `initialize` + `tools/list` piped into `php backend/artisan boost:mcp` → `Laravel Boost`, 9 tools (`search-docs`, `database-schema`, `database-query`, `browser-logs`, …); `claude mcp list` → `laravel-boost … ⏸ Pending approval`. After `claude --continue` the server was still `Pending approval` (no approval prompt on resume) → approve with `/mcp`; the `search-docs` call: _pending_ | pending |
| 2026-11-09 | E1.3 | `python3 -c '…len(os.listdir(".claude/skills"))'`; `ls .claude/agents/` | `37`; six agents (`intake-pipeline-engineer`, `listing-matching-engineer`, `postgis-geo-engineer`, `reference-reader`, `security-reviewer`, `telegram-bot-engineer`) + `README.md` | PASS |
| 2026-11-09 | E1.4 | agent: Bash `cat backend/.env.probe` and the Read tool on the same path | both refused before execution: `PreToolUse:Bash hook error: HOMI guard: .env.probe holds secrets and is never printed, read or copied` (same for `PreToolUse:Read`). The guard matches the path, so the probe file was not created — nothing could have been read | PASS |
| 2026-11-09 | E1.5 | `cp -n docs/handoff/claude-memory/*.md "$D/"; ls "$D"` | transcript `.jsonl` found in the project folder; `MEMORY.md homi-project.md homi-team-conventions.md` | PASS |
| 2026-11-09 | E1.6 | — | optional; nothing changed | n/a |
| 2026-11-09 | F3 | `gh api user --jq .login`; `gh api repos/amediateam/homi/collaborators --jq '.[].login'` | `amediateam` / `amediateam` — the second developer works under the owner account; `CODEOWNERS` unchanged (AM-38) | n/a (deviation) |

### Findings

| ID | Summary | State |
|---|---|---|
| KI-21 | `dev-check`: false FAIL for a newer global pnpm; false PASS for Next servers that are not running (`services.sh status` exit code, single target) | fixed in `scripts/dev/check.sh`, `scripts/dev/services.sh` |
| KI-22 | `dev-setup` ran `boost:update` before backend `npm ci` → 3 skills removed from `backend/boost.json` | fixed in `scripts/dev/setup.sh` |
| KI-23 | `next dev` writes a Next.js agent-feedback block into the three tracked `AGENTS.md` files (`experimental.agentFeedback: true`) | fixed: `agentFeedback: false` (developer's decision) |
| KI-24 | Homebrew's sample nginx server on :8080 collides with `REVERB_PORT=8080` (latent) | open — when realtime work starts |
| AM-37 | `setup.md` B3 check assumed keg-only PostgreSQL client paths | fixed in `setup.md` |
| AM-38 | The handoff assumed a separate GitHub login for the second developer; both tracks use `amediateam` | recorded; review sign-off is the first developer's call |
