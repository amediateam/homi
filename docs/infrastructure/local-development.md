# Local development environment

Purpose: how the local stack is wired and how to operate it (ADR-0008, ADR-0012). Commands are `make` targets at the repository root; each delegates to a script in `scripts/dev/` that can also be run directly. Every privileged step (sudo, system trust store) is printed before it runs.

## Topology

```text
browser ── https://{homi,app,arm}.homi.loc ──▶ nginx :443 ──▶ Next dev :3000 / :3001 / :3002 (HMR over WebSocket)
browser ── https://api.homi.loc ─────────────▶ nginx :443 ──▶ php-fpm 127.0.0.1:9000 ──▶ backend/public (Laravel)
Telegram ─ https://hook.homi.loc (tunnel) ───▶ nginx :443 ──▶ same Laravel, /telegram/* only
browser ── https://cdn.homi.loc ─────────────▶ nginx :443 ──▶ static files from backend/storage/app/public
Laravel  ─ Horizon (Redis :6379) · PostgreSQL :5432 · `public` disk = storage/app/public (no MinIO locally)
```

- php-fpm, PostgreSQL 18 and Redis are Homebrew services shared with the other projects on the machine. **nginx is started by hand as root from a terminal** (`sudo nginx`, reload with `sudo nginx -s reload`) — never through `brew services`/launchd: macOS TCC denies launch daemons access to `~/Documents`, where the project (and the vhost symlinks) live, so a daemon-launched nginx fails with "Operation not permitted" while a terminal-launched one inherits the terminal's Documents access. `make dev-nginx` follows this convention. A long-running master can still lose that access; a reload then does not help, only a new master does: `make dev-nginx-restart` from Terminal or iTerm (KI-31).
- HOMI's vhosts live in `infra/local/nginx/*.conf` and are **symlinked** into `/opt/homebrew/etc/nginx/sites-enabled/`; shared snippets are reached through the `sites-available/homi` symlink. The only machine-specific file is `infra/local/nginx/snippets/paths.conf` (gitignored, generated from `paths.conf.example` with the absolute checkout path and certificate paths).
- TLS: one mkcert certificate for the six hosts in `infra/local/certs/` (gitignored). `mkcert -install` once per machine adds the local CA to the system keychain.
- DNS: a managed block in `/etc/hosts` between `# >>> homi.uz local` markers (idempotent).
- Media: the Laravel `public` disk writes to `backend/storage/app/public`; `cdn.homi.loc` serves it read-only with immutable caching for `originals/` and `derived/`. `MEDIA_PUBLIC_URL=https://cdn.homi.loc` makes generated URLs identical in shape to production (ADR-0012). MinIO exists only in staging/production.
- Ports: 80/443 nginx, 9000 php-fpm, 3000–3002 Next, 5432, 6379. **8000/8001 are taken by HTTP Toolkit on the developer machine**, so `php artisan serve` is not used. The scripts probe ports with a TCP connect (`nc -z`), not `lsof`: on macOS a non-root `lsof` cannot see sockets owned by root, and nginx runs as root here (KI-15). Likewise nginx is detected with `pgrep -f '^nginx: master process'`, because nginx rewrites its process title and `pgrep -x nginx` never matches.
- Application processes started by `make dev-start`: Horizon and the three Next dev servers, detached, pid files in `infra/local/run/`, logs in `infra/local/logs/` (both gitignored). nginx writes its per-vhost logs as root to `/opt/homebrew/var/log/nginx/homi.<host>.{access,error}.log` (`error_log` cannot take `$variables`, so these paths are absolute); `make dev-logs` tails both locations.

## Commands

| Target | What it does | sudo |
|---|---|---|
| `make dev-setup` | brew deps → backend install + `.env` + migrate → pnpm install + `.env.local` → cert → nginx link/test/reload → hosts → storage dir → `dev-check` | yes (announced) |
| `make dev-start` / `dev-stop` / `dev-restart` / `dev-status` | Horizon + Next dev servers | no |
| `make dev-logs` | tail nginx vhost, Horizon and Next logs | no |
| `make dev-check` | §6.6 health check — see below | no |
| `make dev-hosts`, `dev-certs`, `dev-nginx`, `dev-storage` | the individual setup steps | hosts / certs-install / nginx: yes |
| `make dev-nginx-restart` | `nginx -t`, then stop the shared root nginx (graceful quit, fast shutdown after 10 s) and start a new master; run it from Terminal or iTerm (KI-31) | yes |
| `make dev-reset` | **destructive, local only**: stop, clear run/logs, `migrate:fresh` after typing `reset` | no |
| `make ci-backend`, `make ci-frontend` | the CI gates locally | no |
| `scripts/dev/e2e-local.sh [playwright arguments]` | Playwright against an API of its own, as the CI job runs it: the API on stubs under `php -S` on SQLite with the array cache, for the run only (a temporary database outside the checkout). It needs neither nginx nor the database of `backend/.env`, and the `api` rate limit never accumulates (KI-32); port 3001 must be free. `E2E_RADARS_OFF=1` runs the `@radars-off` tests against an API with radars switched off | no |
| `python3 scripts/audit/session_audit.py [--hours N] [--gh]` | where the wall clock of the Claude Code sessions went (model, tools, waiting for the developer, CI, subagents), read from the local transcripts; prompt text is printed for this project only, and `--gh` adds the merged pull requests and CI runs | no |
| `make registry`, `make registry-check` | Composer package registry | no |

`scripts/dev/setup.sh --no-sudo` runs everything that needs no privileges and prints the remaining manual steps. The sudo steps can be run one by one: `scripts/dev/certs.sh install`, `make dev-hosts`, `make dev-nginx`.

## What `dev-check` verifies

Version pins (`.node-version`, `packageManager`, composer platform, PHP extensions) · `/etc/hosts` entries · certificate present, covers all six hosts, not expiring, **trusted by the system keychain** · php-fpm/PostgreSQL/Redis/nginx ports · `https://api.homi.loc/up` → 200 without `-k` · `https://cdn.homi.loc/health.txt` → 200 · database reachable and no pending migrations · Horizon running · `QUEUE_CONNECTION=redis` (ADR-0005) · Next dev servers · `https://homi.loc/`, `https://app.homi.loc/` and `https://arm.homi.loc/` through nginx → 200 after redirects on the same host (the app's `/` answers 307 to its default locale `/ru`, and the line says `via /ru`; KI-30) · `.env` **key** parity against `.env.example` for backend and each app (values are never printed). Exit code 1 on any FAIL, with a fix hint per line.

## Environment files

- `backend/.env.example` is the authoritative key list (ADR-0005/0006 defaults, `MEDIA_PUBLIC_URL`, blank `AWS_*` for staging/production, Telegram and CORS keys). Secrets never enter the repository.
- The owner cabinet is off unless switched on: set `OWNER_CABINET_ENABLED=true` in the local `backend/.env` (the example leaves it blank because the servers' env files were built from it; `backend/phpunit.xml` sets it for the suites; WP-80, DEC-81).
- `frontend/{landing,app,arm}/.env.example` → copy to `.env.local` (gitignored). Besides `NEXT_PUBLIC_*`, the app has server-only keys since WP-21 (`API_URL`, `CSP_*`). After pulling, a key added to a template shows up in `dev-check` as "keys missing"; copy it from the template with its default.
- Machine-specific overrides for the scripts: `.ai/local.env` (template `.ai/local.env.example`): Next ports, `NGINX_ETC`, reference-project paths.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Browser warns about the certificate | `scripts/dev/certs.sh install` (mkcert CA), then restart the browser |
| `nginx -t` fails on `ssl_certificate` | run `make dev-certs` before `make dev-nginx` |
| `make dev-nginx` reports "not listening" right after `sudo nginx` | check `curl -sI https://api.homi.loc/up`; if it answers, the port probe is at fault (`nc` missing?) — see KI-15. If not, `sudo nginx -t` and `sudo tail /opt/homebrew/var/log/nginx/error.log` |
| nginx error.log shows "Operation not permitted" on the vhost symlinks | nginx was started by launchd (`brew services`), which macOS TCC blocks from `~/Documents`. `sudo brew services stop nginx`, remove `/Library/LaunchDaemons/sh.brew.nginx.plist` if it remains, restore ownership of `/opt/homebrew/opt/nginx`, `/opt/homebrew/var/homebrew/linked/nginx` and `/opt/homebrew/Cellar/nginx/<ver>/bin` to your user, then `sudo nginx` (KI-13) |
| "Operation not permitted" in `error.log` or `homi.cdn.error.log`, but nginx was started with `sudo nginx` and no launchd daemon exists; `cdn.homi.loc` → 500 | the running master lost its access to `~/Documents`; workers forked by a later reload inherit that. `make dev-nginx-restart` from Terminal or iTerm. If it persists, allow the terminal app in System Settings → Privacy & Security → Files and Folders (KI-31) |
| nginx does not listen on 80/443 although its master process is alive | the master is in a graceful quit, waiting on long-lived connections, and ignores a reload. `make dev-nginx-restart` (`nginx.sh stop` now falls back to a fast shutdown; KI-31) |
| `https://api.homi.loc` → 502 | php-fpm not running (`brew services start php`) or wrong `$approot` in `snippets/paths.conf` (`scripts/dev/nginx.sh paths`) |
| `https://cdn.homi.loc/...` → 404 | file not under `backend/storage/app/public`; `make dev-storage` recreates the directory and `health.txt` |
| Queued jobs never run | `.env` still has `QUEUE_CONNECTION=database`; Horizon consumes Redis only (ADR-0005) |
| Next dev server port in use | `make dev-stop` frees the ports; otherwise `lsof -nP -iTCP:3001` |
| A Playwright spec waits for `data-session="ready"`, or the local API answers `429` or `500` | the shared local API met its rate limit (KI-32) or cannot reach its database; run the spec with `scripts/dev/e2e-local.sh`, which starts its own API on SQLite |
| HMR not working through nginx | the app host must be listed in `allowedDevOrigins` in that app's `next.config.ts` |
| Telegram webhook tests | `.loc` is unreachable from Telegram; expose `hook.homi.loc` through an HTTPS tunnel and register the **dev** bot only |

## Not covered here

Staging/production (`docs/infrastructure/environments.md`, Phase 3/6), the CDN and webhook internals (`cdn.md`, `telegram-webhook.md`, Phase 3), Docker (not used — both developers run macOS with Homebrew).
