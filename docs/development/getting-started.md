# Getting started (local)

Purpose: from clone to a running stack on macOS with Homebrew (ADR-0008). Details and troubleshooting: `docs/infrastructure/local-development.md`.

## Prerequisites

- macOS with Homebrew; Xcode command-line tools.
- Access to the private repository `github.com/amediateam/homi` and `gh` logged in (for PRs).
- A local PostgreSQL role that can create the `homi` database (Homebrew's `postgresql@18` makes your user a superuser by default).

Everything else (`php`, `composer`, `node` 26, `pnpm`, `postgresql@18`, `redis`, `nginx`, `mkcert`) is installed by the setup command if missing. There is no MinIO locally: media lives on disk behind `https://cdn.homi.loc` (ADR-0012). nginx is started by hand with `sudo nginx` (`make dev-nginx` does it), never with `brew services` — see `docs/infrastructure/local-development.md`.

## Setup

```bash
git clone git@github.com:amediateam/homi.git homi.uz && cd homi.uz
cp .ai/local.env.example .ai/local.env      # optional: Next ports, NGINX_ETC, reference-project paths
make dev-setup                               # announces every sudo step before running it
```

`dev-setup` stops with a warning when `backend/.env` was just created: set `DB_*` (and later `TELEGRAM_*`) there, then run `make dev-setup` again — it is idempotent.

## Daily use

```bash
make dev-start      # Horizon + Next dev servers (landing :3000, app :3001, arm :3002) behind nginx
make dev-check      # health check; fix hints on every FAIL line
make dev-logs       # tail everything
make dev-stop
```

Open `https://homi.loc`, `https://app.homi.loc`, `https://arm.homi.loc`; API at `https://api.homi.loc` (`/up`, `/horizon`, `/telescope`, `/pulse`).

## Quality gates before a PR

```bash
make ci-backend     # composer ci:check: Pint, PHPStan, Vite+ check, tsc, Pest
make ci-frontend    # pnpm -r lint, typecheck, build
make registry-check # after any composer.lock change run `make registry` and commit the output
```

Workflow rules (branches, commits, reviews): `docs/development/workflows.md`.
