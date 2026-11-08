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

## Deploy sequence

The bring-up on 2026-11-09 ran these steps once in this order; as a *repeat* deploy the sequence is not yet exercised (`unverified`) and not yet scripted.

```bash
export PATH=/opt/node26/bin:$PATH COMPOSER_ALLOW_SUPERUSER=1
cd /var/www/homi.uz
git pull --ff-only origin main

# backend
cd backend
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
runuser -u www-data -- php artisan migrate --force          # only additive migrations without approval (parallel-work.md §3)
npm ci && npm run build                                      # only when backend/resources or package-lock changed (frozen starter UI)
runuser -u www-data -- php artisan horizon:terminate         # systemd restarts Horizon on the new code

# frontend (Next.js SSR, ADR-0013)
cd ../frontend
pnpm install --frozen-lockfile
pnpm -r build
chown -R www-data:www-data landing/.next app/.next arm/.next # next start writes its cache there
systemctl restart homi-next-landing homi-next-app homi-next-arm
```

Not done at bring-up and still open: `php artisan optimize` (config/route/view caches) as the last backend step — once added, every `.env` change needs `php artisan config:cache`; a `schedule:run` cron for `www-data` as soon as the application defines scheduled tasks (none on 2026-11-09, `php artisan schedule:list`).

## Checks after a deploy

| Check | Expected |
|---|---|
| `systemctl is-active horizon-homi homi-next-landing homi-next-app homi-next-arm` | four times `active` |
| `runuser -u www-data -- php artisan horizon:status` | `Horizon is running.` |
| `curl -sI https://api.homi.uz/up` and `https://hook.homi.uz/up` | `200`, HTTP/2, `strict-transport-security` present |
| `curl -sI https://hook.homi.uz/` | `404` (only the webhook group is exposed) |
| `curl -sI https://homi.uz/ https://app.homi.uz/ https://arm.homi.uz/` | `200`; `arm` carries `x-robots-tag: noindex, nofollow` |
| `ss -ltn` | Next ports bound to `127.0.0.1` only |
| `nginx -t` before every reload | `syntax is ok` |

## nginx or unit changes

1. Edit the copy in `infra/production/` in a PR (the development track reviews).
2. Copy to the server path from the table above (`sites-available/homi/`, `/etc/systemd/system/`).
3. nginx: `nginx -t && systemctl reload nginx`; units: `systemctl daemon-reload && systemctl restart <unit>`.
4. `cd /etc/nginx && svn add <file> && svn commit -m "homi: …" sites-available/homi` (needs the SVN credentials of the host's owner).

## Rollback

- Code: `git -C /var/www/homi.uz checkout <previous merge commit>` then the deploy sequence from `composer install` on (migrations are not rolled back without a decision — `parallel-work.md` §3).
- A vhost: remove its symlink in `sites-enabled/`, `nginx -t`, reload. Certificates may stay.
- A unit: `systemctl disable --now <unit>`.
- Everything HOMI on the host: the three Next units and Horizon disabled, the five symlinks removed, `/var/www/homi.uz` left in place; the DNS still points at the host, so pages answer 404/502 from nginx until re-enabled.
