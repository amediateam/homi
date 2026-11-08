# ADR-0008: Local environment — Homebrew nginx + php-fpm + mkcert

- Status: Accepted — MinIO parts amended by ADR-0012 (no local MinIO; media on disk behind `cdn.homi.loc`)
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint D1, 2D)
- Source: `docs/ai/reports/phase-0.md` §2, §14; master prompt §6

## Context

Both developers use macOS with the same Homebrew stack. The machine already runs ~100 local projects on one convention: Homebrew nginx (`/opt/homebrew/etc/nginx/sites-enabled/*.conf`, `$approot` variable), Laravel through `fastcgi_pass 127.0.0.1:9000`, SPA dev servers through `proxy_pass`, `.loc` domains in `/etc/hosts`, MinIO on `127.0.0.1:9500`. No project uses local HTTPS; mkcert is not installed (its dependency `nss` is). Herd, Caddy and Docker are absent. Ports 8000/8001 are taken by HTTP Toolkit. The mandate requires trusted local HTTPS and all frontends running simultaneously with Fast Refresh.

## Decision

- Domains: `homi.loc`, `app.homi.loc`, `arm.homi.loc`, `api.homi.loc`, `cdn.homi.loc`, `hook.homi.loc` → `127.0.0.1` in `/etc/hosts` (managed by `scripts/dev/hosts.sh`, idempotent).
- TLS: one mkcert certificate for the six names in `infra/local/certs/` (gitignored); vhosts listen on 443 and redirect 80→443. `mkcert -install` (system trust store) is run by the developer once.
- nginx vhosts live in `infra/local/nginx/*.conf` and are symlinked into `/opt/homebrew/etc/nginx/sites-enabled/`; they use the `$approot` convention so no absolute path is committed.
- Routing: `api.`/`hook.` → php-fpm `127.0.0.1:9000` with `backend/public` as root (no `artisan serve`); `homi.`/`app.`/`arm.` → Next dev servers on `3000`/`3001`/`3002` with WebSocket upgrade for HMR; `cdn.` → MinIO `127.0.0.1:9500` (bucket `homi-public`), console `9501`.
- Services: PostgreSQL 18, Redis, MinIO, php-fpm, nginx via `brew services`; Horizon + Next dev servers via `make dev-start` (a `Makefile` at the root wraps `dev-setup|start|stop|restart|status|logs|check|reset`).
- Next.js: `allowedDevOrigins` includes the `.homi.loc` hosts; `images.remotePatterns` lists `cdn.homi.loc` only.

## Consequences

- `dev-setup` installs missing brew formulae (`mkcert`, and checks nginx/php/postgresql@18/redis/minio), writes hosts entries, generates certs, links vhosts, creates the database and MinIO buckets, copies `.env.example` files.
- `dev-check` implements master prompt §6.6 (DNS, certs, ports, health, DB/migrations, queue worker, S3, version pins, `.env` key parity).
- Telegram cannot reach `.loc`; webhook tests use the dev bot with an HTTPS tunnel when needed (Phase 3).
- A Docker Compose profile is explicitly out of scope until a non-macOS developer joins.

## Alternatives considered

- Plain HTTP like the other local projects — rejected: mandate requires HTTPS; production parity for `Secure` cookies/headers and Mini App testing.
- Docker Compose via colima — rejected: nothing else on the machines uses it; slower feedback loop on macOS.
- Herd/Valet — not installed; nginx convention already exists.
