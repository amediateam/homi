# Local development environment

Purpose: how the local stack is wired and how to operate it (ADR-0008). Commands are `make` targets at the repository root; each delegates to a script in `scripts/dev/` that can also be run directly. Every privileged step (sudo, system trust store) is printed before it runs.

## Topology

```text
browser ── https://{homi,app,arm}.homi.loc ──▶ nginx :443 ──▶ Next dev :3000 / :3001 / :3002 (HMR over WebSocket)
browser ── https://api.homi.loc ─────────────▶ nginx :443 ──▶ php-fpm 127.0.0.1:9000 ──▶ backend/public (Laravel)
Telegram ─ https://hook.homi.loc (tunnel) ───▶ nginx :443 ──▶ same Laravel, /telegram/* only
browser ── https://cdn.homi.loc ─────────────▶ nginx :443 ──▶ MinIO 127.0.0.1:9500 / homi-public (read-only)
Laravel  ─ Horizon (Redis :6379) · PostgreSQL :5432 · MinIO S3 API :9500 (buckets homi-public|private|tmp)
```

- nginx, php-fpm, PostgreSQL 18 and Redis are Homebrew services shared with the other projects on the machine. nginx runs as root (`sudo brew services`), which is why `nginx -t`/reload ask for sudo.
- HOMI's vhosts live in `infra/local/nginx/*.conf` and are **symlinked** into `/opt/homebrew/etc/nginx/sites-enabled/`; shared snippets are reached through the `sites-available/homi` symlink. The only machine-specific file is `infra/local/nginx/snippets/paths.conf` (gitignored, generated from `paths.conf.example` with the absolute checkout path and certificate paths).
- TLS: one mkcert certificate for the six hosts in `infra/local/certs/` (gitignored). `mkcert -install` once per machine adds the local CA to the system keychain.
- DNS: a managed block in `/etc/hosts` between `# >>> homi.uz local` markers (idempotent).
- Ports: 80/443 nginx, 9000 php-fpm, 3000–3002 Next, 5432, 6379, 9500/9501 MinIO. **8000/8001 are taken by HTTP Toolkit on the developer machine**, so `php artisan serve` is not used.
- Application processes started by `make dev-start`: Horizon and the three Next dev servers, detached, pid files in `infra/local/run/`, logs in `infra/local/logs/` (both gitignored).

## Commands

| Target | What it does | sudo |
|---|---|---|
| `make dev-setup` | brew deps → backend install + `.env` + migrate → pnpm install + `.env.local` → cert → nginx link/test/reload → hosts → MinIO + buckets → `dev-check` | yes (announced) |
| `make dev-start` / `dev-stop` / `dev-restart` / `dev-status` | Horizon + Next dev servers (+ MinIO if not running) | no |
| `make dev-logs` | tail nginx vhost, Horizon, Next and MinIO logs | no |
| `make dev-check` | §6.6 health check — see below | no |
| `make dev-hosts`, `dev-certs`, `dev-nginx`, `dev-minio` | the individual setup steps | hosts/certs-install/nginx: yes |
| `make dev-reset` | **destructive, local only**: stop, clear run/logs, `migrate:fresh` after typing `reset` | no |
| `make ci-backend`, `make ci-frontend` | the CI gates locally | no |
| `make registry`, `make registry-check` | Composer package registry | no |

`scripts/dev/setup.sh --no-sudo` runs everything that needs no privileges and prints the remaining manual steps.

## What `dev-check` verifies

Version pins (`.node-version`, `packageManager`, composer platform, PHP extensions) · `/etc/hosts` entries · certificate present, covers all six hosts, not expiring, **trusted by the system keychain** · php-fpm/PostgreSQL/Redis/nginx/MinIO ports · `https://api.homi.loc/up` → 200 without `-k` · database reachable and no pending migrations · Horizon running · `QUEUE_CONNECTION=redis` (ADR-0005) · Next dev servers · `.env` **key** parity against `.env.example` for backend and each app (values are never printed). Exit code 1 on any FAIL, with a fix hint per line.

## Environment files

- `backend/.env.example` is the authoritative key list (ADR-0005/0006 defaults, MinIO local credentials, Telegram and CORS keys). Secrets never enter the repository.
- `frontend/{landing,app,arm}/.env.example` → copy to `.env.local` (gitignored). Only `NEXT_PUBLIC_*` values exist today.
- Machine-specific overrides for the scripts: `.ai/local.env` (template `.ai/local.env.example`): MinIO credentials/port/data dir, Next ports, `NGINX_ETC`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Browser warns about the certificate | `scripts/dev/certs.sh install` (mkcert CA), then restart the browser |
| `nginx -t` fails on `ssl_certificate` | run `make dev-certs` before `make dev-nginx` |
| `https://api.homi.loc` → 502 | php-fpm not running (`brew services start php`) or wrong `$approot` in `snippets/paths.conf` (`scripts/dev/nginx.sh paths`) |
| 403 from MinIO on CDN URLs | object missing (MinIO answers 403 for unknown keys; nginx maps it to 404) or `homi-public` lacks the anonymous download policy (`scripts/dev/minio.sh buckets`) |
| Queued jobs never run | `.env` still has `QUEUE_CONNECTION=database`; Horizon consumes Redis only (ADR-0005) |
| Next dev server port in use | `make dev-stop` frees the ports; otherwise `lsof -nP -iTCP:3001` |
| HMR not working through nginx | the app host must be listed in `allowedDevOrigins` in that app's `next.config.ts` |
| Telegram webhook tests | `.loc` is unreachable from Telegram; expose `hook.homi.loc` through an HTTPS tunnel and register the **dev** bot only |

## Not covered here

Staging/production (`docs/infrastructure/environments.md`, Phase 3/6), the CDN and webhook internals (`cdn.md`, `telegram-webhook.md`, Phase 3), Docker (not used — both developers run macOS with Homebrew).
