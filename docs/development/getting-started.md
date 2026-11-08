# Getting started (local)

Purpose: get a developer from clone to a running stack. **Status: draft** — Phase 2 replaces the manual steps below with `make dev-setup` / `make dev-start` / `make dev-check` and nginx vhosts for `*.homi.loc` (ADR-0008). Until then, this is what works today.

## Prerequisites (macOS, Homebrew)

- `php` 8.5 (`brew install php`), `composer` 2
- `node` 26 (`.node-version`), `pnpm` 11 (`brew install pnpm`)
- `postgresql@18`, `redis` as `brew services`
- `nginx`, `minio`, `mkcert` (Phase 2)
- `gh` (GitHub CLI) for PRs

Check versions: `php -v`, `composer -V`, `node -v`, `pnpm -v`, `psql --version`.

## Backend

```bash
cd backend
composer install
cp .env.example .env            # then set DB_* for your local PostgreSQL, REDIS_*, QUEUE_CONNECTION=redis, CACHE_STORE=redis
php artisan key:generate
createdb homi                   # or your DB_DATABASE value
php artisan migrate
php artisan test --compact      # smoke
php artisan dev                 # serve + horizon + reverb + pail + vite (frozen UI); port 8000 is taken on some machines — use nginx in Phase 2
```

Dashboards once running: `/horizon`, `/telescope`, `/pulse`.

## Frontend

```bash
cd frontend
pnpm install
pnpm --filter landing dev        # http://localhost:3000
pnpm --filter app dev -- -p 3001
pnpm --filter arm dev -- -p 3002
```

## Quality gates

- Backend: `composer ci:check` (Pint check, PHPStan, Vite+ lint/format check, tsc, Pest).
- Frontend: `pnpm -r lint && pnpm -r build`.
- Registry: `scripts/packages/registry --check` after dependency changes.

## Next

Phase 2 adds: `/etc/hosts` entries, mkcert certificates, nginx vhosts in `infra/local/nginx/`, MinIO buckets, `.env.example` for each frontend, and the `make dev-*` targets with `dev-check` (DNS, certs, ports, DB, queue, S3, pins, env-key parity).
