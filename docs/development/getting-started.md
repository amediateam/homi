# Getting started (local)

Purpose: from clone to a running stack on macOS with Homebrew (ADR-0008). Details and troubleshooting: `docs/infrastructure/local-development.md`.

## Prerequisites

- macOS with Homebrew; Xcode command-line tools.
- Access to the private repository `github.com/amediateam/homi` and `gh` logged in (for PRs).
- A local PostgreSQL role that can create the `homi` database (Homebrew's `postgresql@18` makes your user a superuser by default).

Everything else (`php`, `composer`, `node` 26, `pnpm`, `postgresql@18`, `redis`, `nginx`, `mkcert`) is installed by the setup command if missing. There is no MinIO locally: media lives on disk behind `https://cdn.homi.loc` (ADR-0012). nginx is started by hand with `sudo nginx` (`make dev-nginx` does it), never with `brew services` — see `docs/infrastructure/local-development.md`.

## Setup

```bash
gh repo clone amediateam/homi homi.uz && cd homi.uz   # HTTPS through gh; no SSH key needed
cp .ai/local.env.example .ai/local.env      # optional: Next ports, NGINX_ETC, reference-project paths
make dev-setup                               # announces every sudo step before running it
```

When `backend/.env` was just created, `dev-setup` warns, skips the migration and continues with the remaining steps: set `DB_*` and `REVERB_*` (and later `TELEGRAM_*`) there, then run `make dev-setup` again — it is idempotent. `make dev-check` also needs the PECL extensions `redis` and `imagick` and the keg-only `postgresql@18` tools on `PATH` (`docs/handoff/setup.md` §B). Afterwards build the frozen starter UI once — `make ci-backend` and the `home` test need it: `(cd backend && npm ci && npm run build)`.

On a machine whose Homebrew nginx has no `sites-available`/`sites-enabled` layout yet, `dev-setup` stops at the nginx step; the one-time fix and a full clean-machine runbook with a check after every step are in `docs/handoff/setup.md`.

## Daily use

```bash
make dev-start      # Horizon + Next dev servers (landing :3000, app :3001, arm :3002) behind nginx
make dev-check      # health check; fix hints on every FAIL line
make dev-logs       # tail everything
make dev-stop
```

Open `https://homi.loc`, `https://app.homi.loc`, `https://arm.homi.loc`; API at `https://api.homi.loc` (`/up`, `/horizon`, `/telescope`, `/pulse`).

## AI agents

Start Claude Code (or Codex / Grok) **from the repository root**: the root `.mcp.json` declares the Laravel Boost MCP server, and the root `.claude/skills/` holds every skill. Those directories are generated — `make dev-setup` runs `php artisan boost:update`, and `make ai-sync` re-runs it after a `composer update` or after a skill is added to the canonical `.ai/skills/` (provenance in `.ai/skills/SOURCES.md`). `make ai-skills` lists what is available. Layout and rules: `.ai/README.md`. Codex and Grok read the root `AGENTS.md`; Codex gets its skills from `.agents/skills/` and the Boost MCP through `codex mcp add` (`docs/handoff/environment.md` §4).

Copy `.ai/local.env.example` to `.ai/local.env` and fill in the paths of the sibling checkouts (`APPUZ_ROOT`, collectors, nginx mirrors). The committed `.claude/settings.json` wires hooks from `.ai/hooks/` that keep those checkouts read-only, refuse to print `.env*` files, inject the session handoff at start and format every edited file (Pint, eslint, Vite+). They need `python3` (3.9+) on `PATH` — the macOS system interpreter is enough. `make ai-hooks-test` runs their unit tests. Personal overrides go to `.claude/settings.local.json` (gitignored).

## Quality gates before a PR

```bash
make ci-backend     # composer ci:check: Pint, PHPStan, Vite+ check, tsc, Pest
make ci-frontend    # pnpm -r lint, typecheck, build
make registry-check # after any composer.lock change run `make registry` and commit the output
```

Workflow rules (branches, commits, reviews): `docs/development/workflows.md`.
