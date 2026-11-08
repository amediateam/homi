# Deployment (production web host)

Purpose: how HOMI is laid out and operated on `159.253.19.121`, and the exact sequence a deploy runs. Owned by the production track; the development track reads it (`docs/handoff/parallel-work.md` §1). Every command below is run on the server as `root` (the host's convention — deploys are root, runtime is `www-data`), and every change on the server is approved by the first developer first. History and evidence: `docs/ai/reports/production-notes.md`.

## Layout

| What | Where |
|---|---|
| Checkout | `/var/www/homi.uz` — `git clone` of `github.com/amediateam/homi`, branch `main`, through a **read-only deploy key** (`/root/.ssh/homi_deploy_ed25519`, SSH alias `github.com-homi` in `/root/.ssh/config`). The server cannot push. |
| Backend env | `/var/www/homi.uz/backend/.env` (`root:www-data`, `0640`). Key names: `docs/infrastructure/environments.md`. `DB_SSLMODE=disable`, `REDIS_DB=3`, `REDIS_CACHE_DB=4`, `REDIS_PREFIX=homi-production-`, `BROADCAST_CONNECTION=log` (Reverb is not deployed). |
| Frontend env | `/var/www/homi.uz/frontend/{landing,app,arm}/.env.local` — public build-time values only (`NEXT_PUBLIC_*`). Changing one means rebuilding that app. |
| PHP | system PHP 8.5.12, shared pool `php8.5-fpm.sock` (`www-data`) |
| Node | `/opt/node26` → `/opt/node-v26.13.0` (copy of the nvm install so `www-data` can run it); `pnpm 11.24.0` in the same `bin/`. `nvm` under `/root` keeps its default on Node 25 for the other projects. |
| Processes | `horizon-homi.service`; `homi-next-landing.service` (:3100), `homi-next-app.service` (:3101), `homi-next-arm.service` (:3102) — all `www-data`, `Restart=always`, logs in `journalctl -u <unit>` |
| nginx | `/etc/nginx/sites-available/homi/*.conf` (copies: `infra/production/nginx/`), logs `/var/log/nginx/homi/`; the directory is an SVN working copy (`svn://159.253.19.121/server`) — commit new files there too |
| TLS | Let's Encrypt, one lineage per host name (`homi.uz` + `www.homi.uz` share one), webroot `/var/www/letsencrypt`, renewal by `certbot.timer`, deploy hook reloads nginx |
| Database | `homi_db` on `5.45.127.98` (`docs/infrastructure/environments.md`) |
| Media | `backend/storage/app/public` on disk until the MinIO buckets exist; `cdn.homi.uz` is not served from this host |
| Deploy script | `/usr/local/sbin/homi-deploy` (reviewed source `infra/production/bin/homi-deploy`, both environments); state `/var/lib/homi-deploy/<env>.{sha,history}`, log `/var/log/homi-deploy/<env>.log` |

## Staging on the same host

Same layout under `/var/www/staging.homi.uz` with staging names: hosts `staging.homi.uz`, `app.`, `arm.`, `api.`, `hook.staging.homi.uz` (all `noindex`), Next on `127.0.0.1:3200–3202`, units `horizon-homi-staging.service` and `homi-staging-next-{landing,app,arm}.service`, database `homi_staging_db`, `REDIS_DB=5` / `REDIS_CACHE_DB=6`, `APP_ENV=staging`, logs `/var/log/nginx/homi/staging-*.log`. Files: `infra/staging/`. `homi-deploy staging` deploys it (no migration gate on staging). Both checkouts follow `main` today; a release branch or tag for production is an open decision.

## Deploy

As `root` on the host, once the change is merged into `main`:

```bash
homi-deploy staging                # staging first
homi-deploy production --dry-run   # read the plan: new commits, changed files, new migrations
homi-deploy production             # add --migrate when the plan lists new migrations
```

`homi-deploy <production|staging> [--dry-run] [--full] [--migrate] [--ref <commit|tag>]` (`--help`) compares the commit it is about to deploy with the last commit it deployed successfully (`/var/lib/homi-deploy/<env>.sha`) and runs a step only when that step's inputs changed. `--full` runs every step.

| Step | Runs when |
|---|---|
| `git fetch`; the plan (commits, changed files, new migrations) | always |
| checkout — fast-forward `main` to `origin/main`, or `--ref` as a detached HEAD | the target differs from the checkout |
| `composer install --no-dev --optimize-autoloader`, `chown -R www-data` on `storage/` and `bootstrap/cache/`, `php artisan migrate --force` as `www-data` | anything under `backend/` changed |
| `npm ci && npm run build` (the frozen starter UI) | `backend/resources/`, `package*.json`, `vite.config.ts` or `tsconfig.json` changed, or `public/build/manifest.json` is missing |
| `horizon:terminate`, then wait until systemd has started a new Horizon master | anything under `backend/` changed |
| `pnpm install --frozen-lockfile`, `pnpm -r build`, `chown` the three `.next`, restart the three Next units | anything under `frontend/` changed, or a `.next/BUILD_ID` is missing |
| health checks — the table below | always, also on `--dry-run` and when nothing changed |
| record the commit in `<env>.sha` and `<env>.history` | only after the checks pass |
| drift warnings — the checkout's `infra/<env>/` files and the script against the copies on the server | always |

The script stops before it changes anything in three cases:
- tracked files in the checkout are modified;
- another deploy holds `/run/lock/homi-deploy.lock` (one deploy at a time on the host);
- on production, the target adds migrations and `--migrate` is not given. Read their PRs for downtime or backfill notes first (`docs/handoff/parallel-work.md` §3).

Builds run under `nice` with `umask 022` (AM-41). Output goes to the terminal and to `/var/log/homi-deploy/<env>.log`. If a step fails, the script names it and prints the rollback command. It records nothing, so the next run compares against the last good commit again.

This is an in-place deploy, not an atomic one. Release directories behind a `current` symlink would fix that (open item in `production-notes.md` §5). Until then:
- PHP serves the new files from the checkout onward, before `composer install` and the migrations finish (a few seconds).
- `next build` rewrites the `.next` directory the running servers read from, so pages can fail until the restart (minutes). If the build fails, the servers keep running on a half-rebuilt `.next`; roll back with `--ref`.
- Migrations are never rolled back.
- `.env` edits: php-fpm reads `backend/.env` on every request (there is no config cache). Horizon needs `systemctl restart horizon-homi` (staging: `horizon-homi-staging`). `frontend/*/.env.local` edits need a rebuild: `homi-deploy <env> --full`.
- Not in the script yet:
  - `php artisan optimize` — it would turn every `.env` edit into a `config:cache` step; wait until the bot tokens are in.
  - a `schedule:run` cron for `www-data` — there were no scheduled tasks on 2026-11-09 (`php artisan schedule:list`).

The commands the script runs, for a manual deploy if the script is ever unusable:

```bash
export PATH=/opt/node26/bin:$PATH COMPOSER_ALLOW_SUPERUSER=1
umask 022
cd /var/www/homi.uz
git pull --ff-only origin main

# backend
cd backend
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
chown -R www-data:www-data storage bootstrap/cache          # root-run composer/artisan create files there (AM-42)
runuser -u www-data -- php artisan migrate --force
npm ci && npm run build                                      # only when the frozen starter UI's inputs changed
runuser -u www-data -- php artisan horizon:terminate         # systemd restarts Horizon on the new code

# frontend (Next.js SSR, ADR-0013)
cd ../frontend
CI=true pnpm install --frozen-lockfile
pnpm -r build
chown -R www-data:www-data landing/.next app/.next arm/.next # next start writes its cache there
systemctl restart homi-next-landing homi-next-app homi-next-arm
```

## Checks after a deploy

`homi-deploy` runs all of these. It reaches nginx on `127.0.0.1` with `curl --resolve`, so the checks do not depend on DNS. `homi-deploy <env> --dry-run` runs them on their own. From outside, use the same URLs.

| Check | Expected |
|---|---|
| `systemctl is-active horizon-homi homi-next-landing homi-next-app homi-next-arm` | four times `active` |
| `runuser -u www-data -- php artisan horizon:status` | `Horizon is running.` |
| `curl -sI https://api.homi.uz/up` and `https://hook.homi.uz/up` | `200`, HTTP/2, `strict-transport-security` present |
| `curl -sI https://hook.homi.uz/` | `404` (only the webhook group is exposed) |
| `curl -sI https://homi.uz/ https://app.homi.uz/ https://arm.homi.uz/` | `200`; `arm` carries `x-robots-tag: noindex, nofollow` |
| `ss -ltn` | Next ports bound to `127.0.0.1` only |
| `nginx -t` before every reload | `syntax is ok` |

## Server files: nginx, units, the deploy script

1. Edit the copy in `infra/production/` (or `infra/staging/`) in a PR. The development track reviews it.
2. After the merge, copy the file to its server path from the table above: `sites-available/homi/`, `/etc/systemd/system/`, or for the script `install -m 0755 /var/www/homi.uz/infra/production/bin/homi-deploy /usr/local/sbin/homi-deploy`.
3. Reload:
   - nginx: `nginx -t && systemctl reload nginx`;
   - units: `systemctl daemon-reload && systemctl restart <unit>`.
4. `cd /etc/nginx && svn add <file> && svn commit -m "homi: …" sites-available/homi` (needs the SVN credentials of the host's owner).

`homi-deploy` prints a `WARNING … differs` line for every server copy that no longer matches the checkout it deployed.

## Rollback

- Code: `homi-deploy <env> --ref <commit>`. The previous good commits are in `/var/lib/homi-deploy/<env>.history`, and a failed run prints the last one. Afterwards a plain `homi-deploy <env>` returns to the tip of `main`. Migrations are not rolled back without a decision (`parallel-work.md` §3); the plan warns when the target lacks migrations that already ran.
- A vhost: remove its symlink in `sites-enabled/`, `nginx -t`, reload. Certificates may stay.
- A unit: `systemctl disable --now <unit>`.
- Everything HOMI on the host: the three Next units and Horizon disabled, the five symlinks removed, `/var/www/homi.uz` left in place; the DNS still points at the host, so pages answer 404/502 from nginx until re-enabled.
