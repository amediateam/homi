# Production track — notes

Purpose: the running log of the **production track** (first developer; staging and production servers). It replaces `session-handoff.md` for this track (`docs/handoff/parallel-work.md` §5, KI-20): a production-track session reads this file first and extends it; it never rewrites the development track's handoff. Facts only — every claim names the command that proved it or says `unverified`. No secrets: variable names, file paths and host names only.

Reading order for a production-track session: `CLAUDE.md` → `HANDOFF.md` §4 "Production track" → this file → `docs/infrastructure/deployment.md` → `docs/infrastructure/environments.md` → ADR-0011 (hosts), ADR-0013 (Next SSR on the servers) → `docs/ai/reports/phase-3-notes.md` §A (CDN / MinIO items).

Rules that apply here in addition to the mandate: every action on a server, DNS, bucket or bot is approved by the developer **each time** (batches of related steps may be approved together); back up before editing a server file; validate before restarting; record the rollback; the development track owns application code — this track asks for changes instead of making them (`parallel-work.md` §1).

## Status

| Component | State (2026-11-09) | Where |
|---|---|---|
| PostgreSQL databases and roles | **done** — `homi_db` (production) and `homi_staging_db` (staging) on `5.45.127.98`, reachable from the app host | §2 |
| Production code on the app host | **done** — `/var/www/homi.uz` = `main`, read-only deploy key, Node 26 + pnpm, composer, `.env`, migrations (23 tables) | §3 |
| nginx vhosts + TLS: `homi.uz`, `app.`, `arm.`, `api.`, `hook.homi.uz` | **live** — Let's Encrypt to 2027-02-06, HTTP/2, HSTS; verified from outside | §3, §4 |
| Processes: Horizon, three Next SSR servers | **running** under systemd as `www-data` | §3 |
| Staging (`/var/www/staging.homi.uz`, `*.staging.homi.uz`, ports 3200–3202, `homi_staging_db`, Redis 5/6) | **live** — same recipe, all five hosts `noindex`; verified from outside | §3b, §4 |
| Telegram production and staging bots | tokens not on the server yet; webhooks not registered | §5 |
| MinIO buckets, `AWS_*`, `cdn.homi.uz` / `cdn.staging.homi.uz` | not started — DNS for both `cdn` names still points at the app host | §5 |
| Deploy script `homi-deploy` (both environments) | **done** — installed on the app host; staging: full repeat deploy, rollback and forward deploys; production: first real run `--full` on 2026-11-13 | §3c, §9 |
| Backups | **done** 2026-11-13: nightly `homi-backup` of both databases and `storage/app` to MinIO `homi-backups` (14 days); restore drill from the MinIO copy passed on 2026-11-13 | §10, §11, `docs/infrastructure/backup-recovery.md` |
| Monitoring | **done** 2026-11-13: external HTTPS/TLS probes of the 10 hosts from the MinIO host, systemd-unit and backup-age checks on the app host, alerts to the elmarket ops chat; Telegram delivery tested end to end on both paths | §12, `docs/infrastructure/monitoring.md` |

## Resume here (state at 2026-11-13)

- **2026-11-12/13.**
  - The shared Redis was checked (§8): `noeviction`, no `maxmemory`, RDB only.
  - The development track's PR #9 (kvadro² plan) was reviewed: the production parts, as a PR comment.
  - PRs #10 (infra fixes) and #11 (ADR-0015) were merged on 2026-11-13 at the developer's request, without the second developer's review (§6).
  - The apply batch ran the same day (§9): both environments are at `e654925`, with the reviewed vhosts, units and script installed, and there is no drift.
  - Backups are live (§10). `homi-backup.timer` runs nightly to MinIO `homi-backups`. The first runs for both environments were verified, including a download checked with `sha256sum -c`.
  - Monitoring is live (§12). It is built on two existing stacks: external probes on the MinIO host and internal checks on the app host. Alerts go to the elmarket ops chat. A test alert went through both Alertmanagers, with firing and resolved both delivered (§12 item 6).
  - PR #13 (backups) was merged on 2026-11-13 at the developer's request («смёржи #13 и сделай шаг на сервере»), followed by the post-merge step (§10 item 9): both environments were then at `05a7354`, and the new `homi-deploy` was installed.
  - Runtime monitoring is live (§13): the shared Redis, queues, Horizon, failed jobs and Laravel log errors, through `homi-metrics` every minute.
  - Open decision: which bot gets `hook.homi.uz` (§8).
- **Repository.** Everything is on `main`. New work on this track branches from `origin/main` and goes through a PR.
- **Servers.** Production and staging are live at `fc6e4b6` since 2026-11-13. That commit is PR #17, merged and deployed at the developer's request («смёржи #17 и сделай шаг на сервере», §13 item 8). `/var/lib/homi-deploy/{production,staging}.sha` = `fc6e4b6`.
  - The checkouts contain `infra/`, so the drift check compares 10 vhosts, the Horizon, backup and metrics units, their timers, `homi-deploy`, `homi-backup` and `homi-metrics`. All are the same: both dry runs show 14 `ok` and 0 `WARNING`.
  - Backups of the replaced files are in `/root/.homi-backups/20261113/` on each host (§9, §12, §13).
- **Check in one command:** `ssh root@159.253.19.121 'homi-deploy staging --dry-run && homi-deploy production --dry-run'`. Each should print "nothing to deploy", 14 checks `ok` and no `WARNING`. That held on 2026-11-13 (§9).
- **Next, in this order.** Each item needs the developer's go.
  1. Decide which bot gets `hook.homi.uz` (§5 item 10). Then: the bot tokens, which the developer writes into `.env`, and the webhooks.
  2. ~~Backups~~ done 2026-11-13 (§10). Follow-ups:
     - ~~a restore drill into a scratch database~~ passed 2026-11-13 (§11);
     - ~~encryption~~ not needed: the developer's decision of 2026-11-13 (§6);
     - a second off-host copy;
     - ~~an alert when `homi-backup.service` fails~~ done 2026-11-13 (`HomiBackupFailed`, `HomiBackupStale`, §12).
  3. The rest of §5, in the order the developer picks: MinIO and `cdn` DNS, the SVN commit, `TELESCOPE_ENABLED`, a deploy trigger and atomic releases, release tag vs `main`.
- **Who.** This is the first developer's track. SSH, DNS and server credentials are not handed over to the second developer (`HANDOFF.md` §5), so the developer has to hand over access before the colleague can continue here.
- **Next numbers:** AM-46, KI-27. PR #9 takes AM-44, AM-45, KI-25 and KI-26. Check `main` first; the other track may have taken more.

## 1. Servers as found (survey 2026-11-09, read-only)

Both hosts are shared with other projects; nothing below was changed except what §2–§3 list.

**App host `159.253.19.121`** (`sd420adbb.fastvps-server.com`, Debian 12 bookworm, 8 vCPU, 32 GB RAM, uptime 65 days):
- nginx 1.30.6 on 80/443 serving ~75 vhosts of other projects; `/etc/nginx` is an **SVN working copy** (`svn://159.253.19.121/server`) with its own `CLAUDE.md`: vhosts in `sites-available/<app>/<sub>.conf`, flat symlinks via `add.sh`, `nginx -t` before reload, certbot per host name. php-fpm pools run as `www-data` (`php8.5-fpm.sock` 32 children, `php8.4-fpm.sock`); PHP 8.5.12 CLI with `pdo_pgsql`, `pgsql`, `redis`, `imagick`.
- Other projects are SVN checkouts under `/var/www/<domain>/` (root-owned, `www-data` runtime); Laravel workers run as systemd units (`horizon-appuz.service`, `octane.service`, `pulse-*`). Node 25.2.1 via nvm under `/root`, no pnpm; pm2 installed but never used (no dump) — the survey's `pm2 -v` accidentally spawned its daemon, killed again (`pm2 kill`, verified with `pgrep`).
- A **local** PostgreSQL 18.6 cluster with 13 other databases listens on `127.0.0.1` and `159.253.19.121:5432` — HOMI does not use it (ADR-0011). Redis 8.10.3 on `127.0.0.1:6379`, no password, `databases 16`, DB 0–2 in use by others.
- certbot 2.1.0 with `certbot.timer`, 87 certificates, ACME webroot `/var/www/letsencrypt` served by `acme-default.conf`, global deploy hook `renewal-hooks/deploy/reload-nginx.sh` (`nginx -t && systemctl reload nginx`).
- ufw: default deny incoming; 80/443 open; inbound 5432 open (pre-existing, for the local cluster). `/root/.postgresql/root.crt` from an earlier setup makes libpq's `sslmode=require` verify certificates under `root` (irrelevant since TLS to the DB is off).
- Round trip to the DB host 0.5 ms (`ping`); the route leaves through the gateway — the hosts are **not** on a private network.
- DNS (`dig`, 2026-11-09): `homi.uz`, `www`, `app`, `arm`, `api`, `hook`, `cdn`, `staging` **all** resolve to `159.253.19.121` (NS fastdns24); `cdn` must move to `31.220.104.38` when MinIO is provisioned (developer owns DNS).

**DB host `5.45.127.98`** (`s59a6108d.fastvps-server.com`, Debian 13 trixie, 8 vCPU, 32 GB RAM, 251 GB disk at 17 %):
- PostgreSQL 18.6 (pgdg), cluster `18/main`, config `/etc/postgresql/18/main/` with `include_dir = 'conf.d'`; other database `kc_db`. `max_connections 100`, `shared_buffers 128 MB` (default), `password_encryption scram-sha-256`, `ssl on` (self-signed snakeoil cert), `log_statement none`, server timezone `Asia/Tashkent`.
- Extensions available, none installed: `pg_trgm 1.6`, `citext 1.8`, `unaccent 1.1`, `btree_gist 1.8`. **PostGIS not installed**; `postgresql-18-postgis-3` 3.7.0 available from pgdg — input for the T7 gate.
- Two firewall layers: ufw (IP whitelist incl. `159.253.19.121` and `31.220.104.38`) **and** an nftables `inet filter` table (`/etc/nftables.conf`, policy drop). `nftables.service` is disabled yet the ruleset is loaded — what loads it at boot is `unverified`. fail2ban active.

**MinIO host `31.220.104.38`** (`srv740740`): reachable over SSH; `minio` active, `mcli RELEASE.2025-08-13`, vhosts `s3.hc`, `cdn.proagent`, `cdn.smartagent`, `cmd.hc`, `p.hc`, `img.elbozor` — matches `phase-3-notes.md` §A. Nothing done there yet.

## 2. Done 2026-11-09 — PostgreSQL for HOMI (DB host)

1. **Roles and databases** (`sudo -u postgres psql`, `ON_ERROR_STOP`): `homi_db` and `homi_staging_db`, each `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`, owning the same-named database (`UTF8`, `en_US.UTF-8`), `REVOKE CONNECT, TEMPORARY … FROM PUBLIC`, `GRANT … TO <owner>`, `ALTER DATABASE … SET timezone TO 'UTC'`. Proof: `pg_database.datacl = {homi_db=CTc/homi_db}` / `{homi_staging_db=CTc/homi_staging_db}`; `has_database_privilege('kc_db','homi_db','CONNECT')` → `false`.
   - Passwords: no plaintext reached the DB host. The production password (from the developer) was hashed locally into a SCRAM-SHA-256 verifier (`pbkdf2 4096`); the staging password was generated **on the app host** (`openssl rand -hex 20`) into `/root/.homi-secrets/staging-db.password` (0600) and hashed there. `pg_authid.rolpassword` starts with `SCRAM-SHA-256$` for both.
2. **Listen on the public interface**: `/etc/postgresql/18/main/conf.d/homi.conf` with `listen_addresses = 'localhost,5.45.127.98'`; validated via `pg_file_settings`; `systemctl restart postgresql@18-main` (approved; `kc_db` reconnected). `ss -ltn` shows `5.45.127.98:5432`.
3. **pg_hba** (`pg_hba.conf` lines 135–136, backups `pg_hba.conf.bak-*-homi*`): `host homi_db homi_db 159.253.19.121/32 scram-sha-256`, `host homi_staging_db homi_staging_db 159.253.19.121/32 scram-sha-256`; `pg_reload_conf()`, 0 errors in `pg_hba_file_rules`. First written as `hostssl`, changed to `host` after the no-TLS decision (§6).
4. **nftables**: `nft add rule inet filter input tcp dport 5432 ip saddr 159.253.19.121 accept` (handle 15) and the same line in `/etc/nftables.conf` (backup `*.bak-*-homi`, `nft -c -f` OK, file not reloaded). ufw already allowed the app host.

Verified from the app host: `psql … sslmode=disable` as `homi_db` → `ssl=false`, `TimeZone=UTC`; PHP PDO as `www-data` → OK; wrong password → `FATAL: password authentication failed`; cross-database logins (`homi_db`→`postgres`, staging→production, production→staging) → `no pg_hba.conf entry`; before the nftables rule → `timeout expired`, after → connected.

Rollback: remove `conf.d/homi.conf`, restore `pg_hba.conf` from the oldest `*-homi` backup, restart; `nft delete rule inet filter input handle 15` + restore `/etc/nftables.conf`; `DROP DATABASE` / `DROP ROLE` (destructive — developer's approval).

## 3. Done 2026-11-09 — production bring-up on the app host

Approved in four batches (database access, code + env + migrations, Horizon + api/hook vhosts + assets, Next builds + units + vhosts).

1. **Code**: deploy key `/root/.ssh/homi_deploy_ed25519` (ed25519, generated on the server), public half registered via `gh repo deploy-key add` as **read-only** key id 169208854; GitHub's host key pinned by fingerprint (`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`) in `/root/.ssh/known_hosts`; SSH alias `github.com-homi`. `git clone --branch main` → `/var/www/homi.uz` at `591ceb4` (7.6 MB). `git push --dry-run` is refused (read-only key).
2. **Toolchain**: `nvm install 26` → Node 26.13.0 (npm 11.20.0) beside 25.2.1, default alias unchanged; `npm i -g pnpm@11.24.0` into that Node's `bin/`. Copy `/opt/node-v26.13.0` → symlink `/opt/node26` so systemd units running as `www-data` can execute it (`/root` is 0700). `composer install --no-dev --prefer-dist --optimize-autoloader` → Laravel 13.40.0 (`check-platform-reqs` all `success`). Backend starter UI built once (`npm ci && npm run build`, 10 assets, `public/build/manifest.json`) so `api.homi.uz/` renders instead of failing on the Vite manifest.
3. **`backend/.env`** from `.env.example` (`root:www-data`, 0640): `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://api.homi.uz`, `LOG_STACK=daily`, `LOG_LEVEL=info`, `DB_HOST=5.45.127.98`, `DB_DATABASE=homi_db`, `DB_USERNAME=homi_db`, `DB_PASSWORD` (set), `DB_SSLMODE=disable`, `REDIS_DB=3`, `REDIS_CACHE_DB=4`, `REDIS_PREFIX=homi-production-`, `BROADCAST_CONNECTION=log`, `MEDIA_PUBLIC_URL=https://cdn.homi.uz`, `TELEGRAM_WEBHOOK_URL=https://hook.homi.uz/telegram/webhook`, `TELEGRAM_WEBHOOK_SECRET` (generated), `CORS_ALLOWED_ORIGINS=https://homi.uz,https://app.homi.uz,https://arm.homi.uz`, `REVERB_*` random, `APP_KEY` via `key:generate`. **Empty on purpose:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, all `AWS_*` and `MEDIA_*_BUCKET`. `storage/` and `bootstrap/cache` → `www-data:www-data`.
4. **Migrations** as `www-data`: `php artisan migrate --force` → 13 migrations, `db:show` → 23 tables on `homi_db`; `php artisan about` → production, debug OFF, cache/queue redis, session database, logs stack/daily.
5. **Horizon**: `/etc/systemd/system/horizon-homi.service` (copy in `infra/production/systemd/`, modelled on `horizon-appuz.service`), `enable --now` → `active`; `horizon:status` → `Horizon is running.`; Redis DB 3 holds its keys, DB 0 untouched (790 keys before and after).
6. **Next.js**: `frontend/*/.env.local` with the public production URLs (`NEXT_PUBLIC_API_URL=https://api.homi.uz/api/v1`, `NEXT_PUBLIC_CDN_URL=https://cdn.homi.uz`, `NEXT_PUBLIC_APP_URL=https://app.homi.uz` for landing, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` empty); `pnpm install --frozen-lockfile` (345 packages), `pnpm -r build` → three `BUILD_ID`s; `.next` dirs → `www-data`. Units `homi-next-{landing,app,arm}.service` → `active`, `ss -ltn` shows `127.0.0.1:3100–3102`, `curl 127.0.0.1:310x/` → 200; RSS ≈ 125 MB each.
7. **nginx**: `sites-available/homi/{homi,app.homi,arm.homi,api.homi,hook.homi}.conf` + flat symlinks (copies in `infra/production/nginx/`), logs `/var/log/nginx/homi/`. Two-phase: port-80 servers first (`nginx -t`, reload), `certbot certonly --webroot -w /var/www/letsencrypt` for five lineages (`homi.uz` + `www.homi.uz`, `app.homi.uz`, `arm.homi.uz`, `api.homi.uz`, `hook.homi.uz`; all `notAfter` 2027-02-06), then the TLS servers (`nginx -t`, reload). `svn add sites-available/homi` done; **`svn commit` failed** (`E170001: Can't get username or password`) — the files are in the working copy, uncommitted.

Assumption mismatches found while doing it:
- **AM-39** — `next start` ignores the `HOSTNAME` environment variable (that is for the standalone `server.js`): the first unit version listened on `*:310x`. ufw's default deny kept the ports closed externally (probed from outside: timeout), and the units were fixed within minutes to `next start -H 127.0.0.1 -p <port>`; `ss -ltn` now shows `127.0.0.1` only.
- **AM-40** — the host's `nginx.conf` sets a global `fastcgi_temp_file_write_size` smaller than the `64k`/`32×32k` buffers copied from the house API vhost; `nginx -t` failed (`[emerg] "fastcgi_temp_file_write_size" must be equal to or greater than …`) until `fastcgi_temp_file_write_size 256k;` was added to the php location as the house file does. Because `-t` failed, the reload did not happen — nginx kept the port-80 bootstrap config, nothing broke.

## 3b. Done 2026-11-09 — staging bring-up on the same host

Approved as one batch («Дальше по очереди: staging»). DNS checked first: `staging.homi.uz`, `app.`, `arm.`, `api.`, `hook.`, `cdn.staging.homi.uz` all resolve to `159.253.19.121` (`dig`).

1. **Code and backend**: `git clone --branch main` through the same deploy key → `/var/www/staging.homi.uz` at `591ceb4`; `composer install --no-dev`; `backend/.env` from `.env.example` with `APP_ENV=staging`, `APP_DEBUG=false`, `APP_URL=https://api.staging.homi.uz`, `DB_DATABASE=homi_staging_db`, `DB_USERNAME=homi_staging_db`, `DB_PASSWORD` read from `/root/.homi-secrets/staging-db.password` on the host (never displayed), `DB_SSLMODE=disable`, `REDIS_DB=5`, `REDIS_CACHE_DB=6`, `REDIS_PREFIX=homi-staging-`, `BROADCAST_CONNECTION=log`, `MEDIA_PUBLIC_URL=https://cdn.staging.homi.uz`, `TELEGRAM_WEBHOOK_URL=https://hook.staging.homi.uz/telegram/webhook`, generated `TELEGRAM_WEBHOOK_SECRET` / `REVERB_*` / `APP_KEY`, staging `CORS_ALLOWED_ORIGINS`; bot token and `AWS_*` empty. `migrate --force` as `www-data` → `db:show`: `homi_staging_db`, 23 tables; `about` → `staging`, debug OFF. Backend assets built (`manifest.json`).
2. **Horizon**: `horizon-homi-staging.service` (production unit with the staging path) → `active`, `horizon:status` → `Horizon is running.`; Redis DB 5 holds its keys, DB 3 (production) unchanged at 8 keys.
3. **Next.js**: `frontend/*/.env.local` with the staging public URLs (`NEXT_PUBLIC_APP_ENV=staging`), `pnpm install --frozen-lockfile` (store reused, 1.7 s), `pnpm -r build` → three `BUILD_ID`s, `.next` → `www-data`; units `homi-staging-next-{landing,app,arm}.service` (`next start -H 127.0.0.1 -p 320x`) → `active`, `ss -ltn` shows `127.0.0.1:3200–3202`, loopback `curl` → 200 ×3.
4. **nginx**: `sites-available/homi/{staging,app.staging,arm.staging,api.staging,hook.staging}.homi.conf` (copies in `infra/staging/nginx/`) derived from the production files by `sed` (names, ports, paths, upstream and unit names, log names `staging-*`); `X-Robots-Tag: noindex, nofollow` added to all five; the `www` blocks dropped (no `www.staging` DNS). Two-phase as before: port-80 bootstrap → `certbot certonly --webroot` for five lineages (all `notAfter` 2027-02-06) → TLS servers; `nginx -t` OK both times. `svn add` done for the whole `sites-available/homi` (10 files `A`), still uncommitted (credentials).

Assumption mismatch:
- **AM-41** — the staging backend script set `umask 027` for the `.env` and never reset it, so `npm ci`, the asset build and the Wayfinder output were created without world-read bits; `https://api.staging.homi.uz/` answered **500** (`Vite manifest not found` — the file existed but `www-data` could not read `public/build`). Found by the external check, fixed with `chmod -R o+rX public/build resources/js node_modules`; afterwards `find -not -perm -o=r` lists only `.env` (intentional) and `www-data`'s own compiled views, same as production. The production tree had been unaffected because its `.env` step ran in a separate shell.

Rollback (staging only): `systemctl disable --now horizon-homi-staging homi-staging-next-{landing,app,arm}`, remove the five `*.staging.homi.conf` symlinks, `nginx -t`, reload; `/var/www/staging.homi.uz` may stay.

## 3c. Done 2026-11-09 — deploy script `homi-deploy`

Approved as the next step («Дальше по очереди — deploy-скрипт по описанной последовательности»). `infra/production/bin/homi-deploy` (bash) implements the runbook sequence for both environments. How it works and its flags: `docs/infrastructure/deployment.md` "Deploy".

Design choices (this track's, not ADR material):
- **Only changed steps run.** The script runs a step only when that step's inputs changed since the last *successful* deploy (`/var/lib/homi-deploy/<env>.sha`, written only after the health checks pass), so a failed run is retried against the last good commit. `--full` runs everything.
- **Production migration gate.** On production, migrations new in the deploy need `--migrate`; staging runs them automatically.
- **One lock for the host**, because builds share the CPU with the other projects; the builds also run under `nice`.
- **`umask 022`** (AM-41).
- **`chown` of `storage/` and `bootstrap/cache/`** after the root-run steps (AM-42).
- **Health checks through nginx on 127.0.0.1** (`curl --resolve`).
- **Drift warnings** when a server copy differs from the checkout's `infra/` file.
- **No php-fpm reload.** The pool is shared with other projects, and `opcache.validate_timestamps=On` with `revalidate_freq=2` (`php-fpm8.5 -i`) picks up changed files on its own.
- **No `php artisan optimize` yet.** It would make the developer's coming `.env` edits for the bot tokens need a `config:cache`.

Installed:
- the script → `/usr/local/sbin/homi-deploy`: uploaded, `bash -n` OK (bash 5.2.15), `sha256` equal to the repository file. `shellcheck` is not installed on the host or on the developer machine, so it was not run.
- state files: `/var/lib/homi-deploy/{production,staging}.sha` set by hand to `591ceb4`. The bring-up deployed that commit, the external checks passed, and `migrate:status --pending` printed `No pending migrations` in both environments.

Checked before installing: all 18 repository copies in `infra/production/` and `infra/staging/` (nginx, systemd) match the server files (`sha256sum -c` → 18 × `OK`).

Tests on the host, 2026-11-09:

| Test | Result |
|---|---|
| `homi-deploy staging --dry-run` | plan "nothing to deploy", 14 checks `ok`, exit 0 |
| `homi-deploy staging --full` — **first repeat deploy** | composer 3 s, migrate (nothing pending), `npm ci` + build 7 s, Horizon restarted (new PID), pnpm install 6 s, `pnpm -r build` 7 s (three new `BUILD_ID`s owned by `www-data`), three units restarted, 14 checks `ok`; 32 s in total. Afterwards no file under `storage/` or `bootstrap/cache/` is owned by anyone but `www-data`, and none under `public/build` or `.next` lacks world-read. |
| Production during all staging runs | `MainPID` of `horizon-homi` and the three Next units unchanged (`117282 122057 122059 122060` before and after) — the staging `horizon:terminate` does not reach the production master |
| Rollback `homi-deploy staging --ref 591ceb4^1` (= `aa8149e`) | plan `checkout pnpm-build next-restart` (PR #7 touched only `frontend/` among the deployed trees), detached HEAD, checks `ok`, recorded `aa8149e` |
| Forward `homi-deploy staging` | back on `main` (`## main...origin/main`); the first run failed one check (AM-43), recorded nothing, printed nothing about a rollback (fixed); after the fix: forward, rollback, forward again → exit 0 each; then "nothing to deploy" |
| Lock: `flock /run/lock/homi-deploy.lock homi-deploy staging --dry-run` | `ERROR: another homi-deploy is running`, exit 1 |
| Production gate: `HOMI_DEPLOY_STATE_DIR=<temp dir with 8ddeacf> homi-deploy production --dry-run` | lists the six Phase 3 migrations, `ERROR: production runs new migrations only with --migrate`, exit 1; with `--migrate` the plan is complete, `no changes made`, exit 0 (dry runs record nothing; the temp dir was removed) |
| `homi-deploy prod`, `--ref nosuchref` | exit 2 (usage), `ERROR: unknown ref`, exit 1 |
| `homi-deploy production --dry-run` | "nothing to deploy", 14 checks `ok` |
| From outside afterwards | `https://staging.homi.uz/`, `app.`, `arm.` → 200; `api.staging…/up` → 200; `hook.staging…/` → 404; production `homi.uz`, `app.`, `arm.`, `api…/up`, `hook…/up` → 200 (HTTP/2) |

Assumption mismatches:
- **AM-42** — "root-run deploy steps leave no runtime files behind" was wrong. The survey for the script found compiled Blade views owned by `root:root` in `storage/framework/views` (three files in each environment) from artisan commands run as root at bring-up. Which command created them is unknown (`unverified`). php-fpm (`www-data`) could not have rewritten them once a view changed. `homi-deploy` now `chown`s `storage/` and `bootstrap/cache/` after composer and after the asset build. Staging is fixed by the deploys above. **Production still has the three files until its first `homi-deploy` run.** Harmless until then: a view is recompiled only when its source changes, which only a deploy does.
- **AM-43** — "a Next unit is listening once `systemctl restart` returns" was wrong (`Type=simple` units are `active` before the port is bound). The loopback-binding check ran right after the restart and saw no listener on `:3200`, while the HTTP check a moment later got 200. The check now retries for up to 60 s, like the HTTP checks. A failed check now also prints the rollback command.

## 4. Verification (from outside, 2026-11-09)

| Check | Result |
|---|---|
| `http://api.homi.uz/up`, `http://homi.uz/` | `301` → `https://…` |
| `https://api.homi.uz/up`, `https://api.homi.uz/` | `200`, HTTP/2 |
| `https://api.homi.uz/api/v1/nope` | `404` JSON envelope |
| `https://hook.homi.uz/` → `404`; `/up` → `200`; `POST /telegram/webhook` with `{}` → `403` | fail-closed stub without the secret, as designed |
| `https://www.homi.uz/` | `301` → `https://homi.uz/` |
| `https://homi.uz/`, `https://app.homi.uz/`, `https://arm.homi.uz/` | `200`, HTTP/2 |
| Headers | `strict-transport-security: max-age=31536000; includeSubDomains`, `x-content-type-options: nosniff`, `x-frame-options` (`DENY` on api/hook, `SAMEORIGIN` on the web apps), `x-robots-tag: noindex, nofollow` on arm only |
| Certificates (`openssl s_client`) | Let's Encrypt, SANs as listed above, `notAfter` 2027-02-06 |
| `159.253.19.121:3100–3102` from outside | closed (ufw) and bound to loopback |
| `systemctl is-active` for the four units; `horizon:status` | `active` ×4; `Horizon is running.` |
| `php artisan schedule:list` | no scheduled tasks → no cron yet |
| `config:show telescope` / `pulse` | `enabled true` for both in production (defaults) — see §5 |
| **Staging** `http://staging.homi.uz/`, `http://api.staging.homi.uz/up` | `301` → `https://…` |
| `https://staging.homi.uz/`, `app.staging`, `arm.staging` | `200`, HTTP/2 |
| `https://api.staging.homi.uz/up` → `200`; `/` → `200` after AM-41 (was `500`) | |
| `https://hook.staging.homi.uz/` → `404`; `/up` → `200`; `POST /telegram/webhook` → `403` | fail-closed, as production |
| Headers on all five staging hosts | HSTS + `x-robots-tag: noindex, nofollow` |
| Staging certificates | Let's Encrypt, `notAfter` 2027-02-06 |
| Production re-checked after the staging reloads | `https://homi.uz/` 200, `https://api.homi.uz/up` 200 |
| Host memory after both environments | `free -h`: 12 GB used, 19 GB available (32 GB) |

## 5. Open items (need the developer's go — do not start alone)

1. **SVN**: `cd /etc/nginx && svn commit -m "homi: production vhosts" sites-available/homi` with the owner's credentials (the files are added, not committed).
2. **Telegram production bot**: the developer writes `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` into `/var/www/homi.uz/backend/.env` (not via chat) and `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` into `frontend/{landing,app}/.env.local` (then rebuild those two apps); registering the webhook (`setWebhook` to `https://hook.homi.uz/telegram/webhook` with the secret from `.env`) is a separate approved action — T1 of the development track decides what the handler does first.
3. **MinIO** (ADR-0011): buckets `homi-public`, `homi-private`, `homi-tmp` (+ staging), user `homi-app`, anonymous `GetObject` on the public bucket, `cdn.homi.uz` edge-cache vhost on `31.220.104.38` (`phase-3-notes.md` §A), then `AWS_*` / `MEDIA_*_BUCKET` / disk names in `.env`, and **DNS `cdn.homi.uz` → `31.220.104.38`** (developer). Until then `MEDIA_PUBLIC_URL` points at a name that resolves to the app host and serves nothing.
4. **Staging follow-ups**: the staging bot's `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` in `/var/www/staging.homi.uz/backend/.env` (+ rebuild of landing/app) and its webhook (separate approval); `homi-staging-*` buckets and `cdn.staging.homi.uz` DNS together with item 3; decide whether production keeps following `main` or moves to a release tag (both checkouts are on `main` today).
5. **Deploy follow-ups** (the script itself is done, §3c):
   - ~~the first production run of `homi-deploy production`~~ done 2026-11-13 (`--full`, AM-42 fixed there, §9);
   - a trigger — GitHub Actions over SSH, or manual only — decide;
   - atomic releases (release directories plus a `current` symlink) so that `next build` and `composer install` no longer run under the live servers (`deployment.md` "Deploy" limits);
   - ~~the drift check starts reporting once `infra/` is in the checkouts~~ done 2026-11-13: it compares 10 vhosts, both Horizon units and the script, and all were the same after the apply batch (§9).
6. **Telescope in production**: `TELESCOPE_ENABLED` defaults to `true` and records every request into `homi_db`; set `TELESCOPE_ENABLED=false` (or gate + prune) before real traffic — a one-line `.env` change, developer's call. Pulse: enabled; its `pulse:check` worker is not running (the house runs one per project).
7. Scheduler cron for `www-data` once `schedule:list` is non-empty; `php artisan optimize` in the deploy; log rotation of `storage/logs` (daily driver, no retention set).
8. DB host follow-ups with the cluster owner: `shared_buffers` (128 MB default on 32 GB), who loads `/etc/nftables.conf` at boot, PostGIS install if T7 adopts it (ADR first).
9. ~~Backups (database dumps off-host; `storage/`)~~ done 2026-11-13 (§10). ~~Monitoring~~ done 2026-11-13 (§12). ADR amendments: ADR-0011 (Redis = DB indexes on the shared instance; `homi_db` naming), ADR-0013 (process manager = systemd, `/opt/node26`). **Done for the ADRs:** ADR-0015 records both amendments (PR #11, merged 2026-11-13). ADRs are shared files, so they never go into an infra PR (`parallel-work.md` §1).
10. **Decision: which bot gets `hook.homi.uz`.** Item 2 plans the existing HOMI production bot there. The kvadro² plan (PR #9, `18` T0.4) puts `@KvadroAppBot` on the same URL at the cut-over. One URL with one secret serves one bot.

Decision already taken on the password question: the developer accepted that the production DB password passed through chat («ничего страшного»); no rotation planned.

## 6. Developer decisions

| Date | Decision | Consequence recorded |
|---|---|---|
| 2026-11-09 | **No TLS between app and database** («ssl mode не нужен, это тормозит потом работу приложения»). `pg_hba` uses `host`, the app sets `DB_SSLMODE=disable` | Traffic between the hosts crosses the public network unencrypted; SCRAM keeps the password off the wire. Certificate pinning (`verify-ca`) was tested and works if ever wanted (needs `sslrootcert` support in `config/database.php`). |
| 2026-11-09 | `homi_db` is **production**; staging gets `homi_staging_db` on the same cluster | placeholder names `homi_staging` / `homi_production` replaced in `environments.md` |
| 2026-11-09 | Media in production on **MinIO `31.220.104.38`** per ADR-0011 (not on the app host's disk) | `cdn.homi.uz` has no vhost on the app host; DNS change pending |
| 2026-11-09 | Code delivery by **git with a read-only deploy key** (not the host's SVN, not rsync) | `/var/www/homi.uz` is a git checkout; deploy = `git pull --ff-only` |
| 2026-11-09 | Redis: **DB indexes on the shared instance** (production 3/4, staging 5/6) | closes the "Redis per environment" question of `environments.md` |
| 2026-11-09 | Process manager: **systemd** (pm2 unused on the host; its stray daemon removed) | ADR-0013's open choice settled for production |
| 2026-11-09 | Batches 3 and 4 approved together ("продолжать без паузы") | recorded here; the per-action rule still applies to new work |
| 2026-11-13 | Monitoring: **alerts to the elmarket ops chat** (bot @nimaqattabot), not a new HOMI chat. **External + internal checks**, built on the existing stacks | §12; the MinIO host's Alertmanager got a `homi` receiver with that bot and chat |
| 2026-11-13 | **Backup encryption is not needed** («шифрование бэкапов не нужно!»), with no condition attached (it supersedes «пока без шифрования» from the same day) | `docs/infrastructure/backup-recovery.md` updated; the follow-up was removed from "Resume here" |
| 2026-11-13 | Backups per the plan in §10 («да, запускай»), not encrypted («пока без шифрования») | `docs/infrastructure/backup-recovery.md` |
| 2026-11-13 | PRs #10 and #11 merged without the second developer's review («смёржи #10 и #11») | `parallel-work.md` §2 asks for the other developer's review; the second developer can still comment after the merge |

## 7. Not verified

- A deploy that carries real changes:
  - Staging has only redeployed `591ceb4` (`--full`) and rolled back to `aa8149e` and forward again, with no backend or migration changes in that diff. The composer and migration steps ran but had nothing to do.
  - Production has had one real run, `--full` on 2026-11-13. Every step ran (composer, migrate, backend assets, Horizon restart, `pnpm -r build`, Next restarts), but the diff had no backend or migration changes (§9).
  - Behaviour under live traffic while `next build` runs is unobserved.
- `certbot renew --dry-run` for the new lineages.
- Behaviour after a reboot of either host (units are `enabled`; nginx config is on disk; what loads nftables on the DB host is unknown).
- `/etc/nftables.conf` was syntax-checked but not reloaded.
- Real traffic: no load test, no Horizon jobs processed yet (queues are empty), no media upload through the API on this host — production and staging alike.
- Staging was brought up by the same sequence, not by a script; differences between the two trees are only what §3b lists (`diff -r` of the two checkouts not run).
- `homi-deploy`: not linted (no `shellcheck`). Untested paths:
  - a failure in the middle of a backend step;
  - a Horizon master that takes longer than 360 s to finish its jobs (120 s until 2026-11-12, §8);
  - an `npm ci` triggered by a real lockfile change.

## 8. 2026-11-12 — Redis check, PR #9 review, repository fixes

**Redis on the app host** (developer approved this read-only check; `ssh root@159.253.19.121` with `redis-cli CONFIG GET …` and `INFO memory|stats|persistence|server|keyspace`):
- The server runs Redis 8.10.3 from `/etc/redis/redis.conf`, up 11 days. Among the memory and persistence keys, that file sets only `appendonly no`.
- Memory and eviction:
  - `maxmemory 0` and `maxmemory-policy noeviction` (the default), with `evicted_keys 0`;
  - `used_memory_human 4.63M` on a host with 32 GB.
- Persistence: AOF is off. RDB snapshots run with `save "3600 1 300 100 60 10000"`, and `rdb_last_bgsave_status` is `ok`.
- Keyspace: DB 0–2 belong to other projects (807, 13 and 2 keys). HOMI has DB 3 with 8 keys, DB 5 with 8 and DB 6 with 1. DB 4 is empty.
- What follows from this:
  - Redis never evicts, so eviction cannot drop queue keys.
  - Memory growth has no limit. A memory alert belongs to the monitoring task.
  - A crash loses the jobs queued since the last snapshot. HOMI jobs must be re-dispatchable from PostgreSQL.
- HOMI never runs `CONFIG SET` on this instance (`maxmemory`, policy, `appendonly`, `requirepass`): every setting there applies to every project on the host.

**PR #9 review** (development track's kvadro² plan):
- The review is posted as a comment on PR #9 and covers only the production parts: `17`, `18`, `11b` §3 and §7, the 33 `KV-INF-*` tasks, and the shared-file edits.
- It has seven must-fix items: the deploy steps, a Horizon pause that is lost on restart, pgBackRest on the shared cluster, Redis hardening, the staging reset, truncating production tables, and the `cdn.*` vhost location.
- It also re-scopes KV-INF-023 on top of `homi-deploy`.
- Open decision for the developer: which bot is registered on `hook.homi.uz`. The options are the HOMI production bot (§5 item 2) or `@KvadroAppBot` at the kvadro² cut-over (PR #9, `18` T0.4). One URL with one secret serves one bot.

**Repository fixes** (branch `chore/infra-review-fixes`). Servers are unchanged; the steps to apply them are below.
- **`hook[.staging].homi.conf`.** `location ~ \.php$` became `location = /index.php { internal; … }`. Before, a direct `GET /index.php` reached Laravel's `/` route on the webhook host.
- **Static locations in both environments** (`/_next/static/` for landing, app and arm; the asset regex for api).
  - Their own `add_header Cache-Control` dropped the server-level security headers: nginx does not inherit `add_header` into a location that sets one.
  - The headers are now repeated there.
  - The duplicate `expires 1y` is gone; it produced a second `Cache-Control` header.
- **`horizon-homi[-staging].service`.** `TimeoutStopSec` went from 60 to 330. The `media` supervisor's `timeout` is 300 s, so the `systemctl restart` after an `.env` edit used to SIGKILL running jobs at 60 s.
- **`homi-deploy`.** It now waits up to 360 s instead of 120 s for the new Horizon master, because `horizon:terminate` lets running jobs finish first.
- **`environments.md`.** The Redis row records the decision and the facts above.

Verification:
- **Test harness.** Local Homebrew nginx 1.31.8 ran copies of the vhosts with a throw-away certificate on `127.0.0.1:18443` and no PHP upstream, so a 502 means "reached PHP".
- **`nginx -t` on all 10 vhost copies:** ok.
- **hook, before:** `GET /index.php` → 502.
- **hook, after:**
  - `GET /index.php` → 404, on staging too;
  - `/up` and `/telegram/webhook` (GET and POST) → 502, so they still reach PHP;
  - `/` and `/foo.php` → 404.
- **app `/_next/static/t.js`, before:** two `Cache-Control` headers and no security headers.
- **app `/_next/static/t.js`, after:** one `Cache-Control` plus `nosniff`, `X-Frame-Options`, `Referrer-Policy` and HSTS.
- **api and `arm.staging` static files:** HSTS and `nosniff` present, plus `X-Robots-Tag` on staging.
- **`homi-deploy`:** `bash -n` ok. It is still not linted (no `shellcheck`), and the 360 s path is untested.
- **Stray requests to live hosts.** A typo in one probe (the port was missing from the URL) sent three GET requests to the live hosts: `api.homi.uz/t.css`, `api.staging.homi.uz/t.css` and `arm.staging.homi.uz/_next/static/t.js`. All three returned 404 and changed nothing.

To apply, after the merge. This is one batch and needs the developer's go:
1. Run `homi-deploy staging`, then `homi-deploy production --full`. The checkout brings in the new `infra/`, and the drift check then reports all 10 vhosts, both Horizon units and the script as different from the installed copies.
2. For each environment, install the vhosts:
   - back up `/etc/nginx/sites-available/homi/*.conf` (`*.bak-<date>-homi`);
   - copy the reviewed vhosts;
   - `nginx -t`, then `systemctl reload nginx`.
3. Copy the two Horizon units, then run `systemctl daemon-reload`. No restart is needed: systemd reads `TimeoutStopSec` at the next stop.
4. Install the script: `install -m 0755 /var/www/homi.uz/infra/production/bin/homi-deploy /usr/local/sbin/homi-deploy`.
5. Check from outside:
   - `https://hook.homi.uz/index.php` → 404, and `/up` → 200, on both hosts;
   - `curl -sI` of one `/_next/static/` file on `app.homi.uz` shows HSTS and `nosniff`;
   - `homi-deploy <env> --dry-run` shows no drift warnings.
6. Rollback: restore the `*.bak-*-homi` copies, `nginx -t`, reload; restore the old units, `daemon-reload`.

## 9. Done 2026-11-13 — apply batch (§8)

The developer approved this batch («да, запускай пакет»). All commands ran over `ssh root@159.253.19.121`.

1. **Pre-checks.**
   - Both environments were at `591ceb4` (`/var/lib/homi-deploy/*.sha`, `git log -1`).
   - The `telegram`, `media`, `ingest` and `default` queues were empty in Redis DB 3 and DB 5.
   - `nginx -t` passed.
   - The 10 vhosts, both Horizon units and `/usr/local/sbin/homi-deploy` matched their reviewed copies at `bb844ca` (sha256 compared), so nothing had been edited by hand.
   - Range `591ceb4..e654925`: no file under `backend/` or `frontend/`, and no migration.
2. **`homi-deploy staging`.**
   - Plan: `checkout → health checks`. Result: 14 checks `ok`, deployed `e654925` in 3 s.
   - Drift warnings for the 5 staging vhosts, `horizon-homi-staging.service` and the script, as expected.
3. **`homi-deploy production --full`.**
   - Plan: `checkout composer migrate backend-assets horizon-restart pnpm-build next-restart`. Result: 14 checks `ok`, deployed `e654925` in 31 s.
   - Horizon restarted at 04:43:31 UTC.
   - `migrate:status` shows 13 migrations, all ran. AM-42 is fixed: `find storage bootstrap/cache -user root` finds 0 files.
   - Drift warnings for the 5 production vhosts, `horizon-homi.service` and the script, as expected.
4. **Vhosts, staging first, then production.**
   - The old files were copied to `/root/.homi-backups/20261113/nginx/*.bak-20261113-homi` (10 files). They are kept outside `/etc/nginx`, so the SVN working copy stays clean.
   - The new files were installed with `install -m 0644 -o root -g root` from each checkout's `infra/<env>/nginx/`.
   - `nginx -t` passed, then `systemctl reload nginx`, once per environment.
   - Checked from outside after each reload:
     - `hook[.staging]/index.php` → 404, `/up` → 200, `/` → 404;
     - an unsigned `POST /telegram/webhook` → 403;
     - `api /up` → 200;
     - landing, app and arm → 200, and `www` → 301.
     - On a real `/_next/static/chunks/*.js` (landing, app, arm, both environments): one `Cache-Control` plus `nosniff` and HSTS, and `X-Robots-Tag` on `arm` and on staging.
     - api `/build/assets/*.css`: `nosniff` and HSTS.
5. **Units.**
   - The old units were copied to `/root/.homi-backups/20261113/systemd/`.
   - The new units were installed, then `systemctl daemon-reload` ran.
   - `TimeoutStopUSec=5min 30s` on both. The MainPIDs did not change, so nothing restarted.
   - `systemd-analyze verify` printed one warning, about another project's `memcached.service`.
6. **Script.**
   - The old copy went to `/root/.homi-backups/20261113/bin/`.
   - Installed with `install -m 0755 …/infra/production/bin/homi-deploy /usr/local/sbin/homi-deploy`; `bash -n` passes.
7. **Final check.** `homi-deploy staging --dry-run` and `homi-deploy production --dry-run` each give exit 0, 14 checks `ok`, 0 `WARNING`, "nothing to deploy — e654925 is live". `svn status sites-available/homi` still lists only the HOMI files as `A` (§5 item 1).

Rollback, if ever needed:
- Copy `/root/.homi-backups/20261113/nginx/<file>.bak-20261113-homi` back to `/etc/nginx/sites-available/homi/<file>`, run `nginx -t`, then reload.
- Do the same for the units, followed by `systemctl daemon-reload`, and for the script.
- Code: `homi-deploy <env> --ref 591ceb4`. The range has no backend changes, so only the checkout moves.

## 10. Done 2026-11-13 — backups

The developer approved the plan («да, запускай») and chose no encryption for now («пока без шифрования»). The runbook is `docs/infrastructure/backup-recovery.md`.

1. **Survey** (read-only):
   - App host: `pg_dump` 18.6 in `/usr/lib/postgresql/18/bin`, plus `mcli`, `zstd`, `gpg`, `flock` and `python3`, so no new package was needed. The clock is UTC. 188 GB are free.
   - Sizes: `homi_db` 840 KB and `homi_staging_db` 0.97 MB (`artisan db:show`); `storage/app` is 24 K per environment.
   - MinIO host: alias `s3hc`, 227 GB free. The house pattern comes from `appuz-db-backups` and `elmarket-pgbackrest`: versioning, an ILM rule that expires noncurrent versions after 14 days, and one user with a per-bucket policy.
2. **MinIO** (`31.220.104.38`):
   - `mcli mb --with-versioning s3hc/homi-backups`.
   - ILM rule 1 expires current objects after 14 days and noncurrent versions after 7. Rule 2 removes expired delete markers.
   - Policy `homi-backups-append` (`/root/homi-backups-append.json` on that host): `GetBucketLocation`, `ListBucket` and `ListBucketMultipartUploads` on the bucket; `PutObject`, `AbortMultipartUpload`, `GetObject` and `ListMultipartUploadParts` on its objects. It has no `DeleteObject`.
   - User `homi-backup`, enabled, with that policy.
   - The secret was generated on the app host (`openssl rand -hex 24` into `/root/.homi-secrets/backup-s3.secret`, 0600) and piped from ssh to ssh. It never appeared in output.
3. **Access test** from the app host. The alias comes from `MC_HOST_homibk` in the environment, so nothing is written to `~/.mcli`.
   - `ls` works.
   - A put and get of `_probe/20261113T052443Z.txt` (25 bytes) works. The object stays until ILM removes it.
   - `rm` gets `Access Denied`, and so does `ls` of `appuz-db-backups`.
4. **Install** from the branch `chore/infra-backups`:
   - `/usr/local/sbin/homi-backup` (0755);
   - `/etc/systemd/system/homi-backup.{service,timer}` (0644);
   - then `systemctl daemon-reload`. `systemd-analyze verify` had no remarks on these units; its only warning was about another project's `memcached.service`.
5. **Runs.**
   - `homi-backup staging`: exit 0 in 5 s. Dump 68 K with 23 tables of data; storage 4 K.
   - `systemctl start homi-backup.service`: `Result=success`.
     - production: dump 64 K (62 669 bytes), 23 tables;
     - staging: dump 66 795 bytes;
     - both environments uploaded, and `*.last-success` was written.
   - MinIO side (`mcli ls --recursive`, `mcli du`): 10 objects, 193 KiB.
6. **Round trip.** The latest production prefix was downloaded to a temp directory. `sha256sum -c SHA256SUMS` passed for both files, and `pg_restore --list` lists the 23 tables (`migrations`, `users`, `media_files`, `telegram_updates` and the rest). The storage archive is readable with `zstd -dc | tar -t`.
7. **Timer.** `systemctl enable --now homi-backup.timer`: enabled and active, first run Fri 2026-11-13 21:31:56 UTC.
8. **`homi-deploy` drift check** (repository): it now also compares `infra/<env>/systemd/*.timer` and `/usr/local/sbin/homi-backup`. The installed `homi-deploy` is still the `e654925` version and gets replaced from the checkout after the merge.
9. **After the merge of PR #13** (`05a7354`, the developer's go):
   - `homi-deploy staging` and then `homi-deploy production`: plan `checkout → health checks`, 14 `ok` each, 3 s each. The only drift warning was `/usr/local/sbin/homi-deploy`.
   - The old script was copied to `/root/.homi-backups/20261113/bin/homi-deploy.bak-20261113b-homi`, and the new one was installed from `/var/www/homi.uz/infra/production/bin/homi-deploy` (`bash -n` ok).
   - Both dry runs: exit 0, 14 `ok`, 0 `WARNING`, "nothing to deploy — 05a7354 is live".
   - `cmp` against the checkout shows `homi-backup` and its service and timer are the same.
   - The timer is unchanged: next run Fri 2026-11-13 21:31:56 UTC.

Not verified:
- ~~A restore into a database~~: done on 2026-11-13 (§11);
- a run that fails on purpose (the per-environment subshell and the exit code are reasoned from the script, not tested);
- ILM expiry in practice (first due 2026-11-27).

Rollback:
- `systemctl disable --now homi-backup.timer`, then remove the three installed files and run `systemctl daemon-reload`.
- On MinIO, the bucket and user can only be removed with the developer's go, because removing them deletes backups.

## 11. Done 2026-11-13 — restore drill (production backup)

Approved by the developer («давай, сделай тестовое восстановление бэкапа»). The procedure is in `docs/infrastructure/backup-recovery.md` "Restore" step 2. The live databases were only read.

1. **Access path to the DB host.**
   - From the developer machine, `ssh root@5.45.127.98` timed out, and `nc -z` failed on 22 and 5432. That machine's current IP is not in the DB host's whitelist; whether it ever was is `unverified`.
   - `ssh -J` through the app host failed with `administratively prohibited`: the app host's sshd forbids forwarding.
   - The app host's root key is authorised on the DB host, and its host key is in `known_hosts` (`StrictHostKeyChecking=yes` passed). So every DB-host command ran as `ssh app 'ssh root@5.45.127.98 …'`.
2. **Pre-check** on the DB host: PostgreSQL 18.6 with `pg_restore` 18; databases `homi_db`, `homi_staging_db`, `kc_db` and the system ones, so `homi_restore_drill` was free; 208 GB free; `homi_db` at 9 342 kB with no sessions.
3. **Source: the MinIO copy**, not the local one.
   - On the app host, `mcli cp --recursive` fetched `s3://homi-backups/production/20261113T053043Z/`, and `sha256sum -c SHA256SUMS` passed for both files.
   - `scp` copied the dump (62 669 bytes) to the DB host, where its sha256 `889790b9…0661` matched `SHA256SUMS`.
4. **Restore.**
   - `postgres` got a private copy in `/tmp/homi-restore-drill` (0700 postgres).
   - `createdb homi_restore_drill`, then `pg_restore --no-owner --no-acl --exit-on-error`: exit 0 in 0.19 s.
5. **Comparison with live `homi_db`** (exact `count(*)` per `public` table through `query_to_xml`):
   - 23 tables on both sides, no table with a different row count, 74 rows in total on both;
   - 62 indexes, 155 constraints and 13 sequences on both;
   - the same `md5(string_agg(migration …))`, `2212027a…8122`.
   - The data is tiny (empty queues and almost no users). The drill proves the procedure and the archive, not the timing for a real data volume.
6. **Clean-up.**
   - `dropdb homi_restore_drill`; the database list is back to `homi_db homi_staging_db kc_db postgres template0 template1`.
   - `rm -rf /tmp/homi-restore-drill /root/restore-drill` on the DB host and `/root/restore-drill` on the app host. `ls` confirms all three are gone.

Not done: a staging drill (same format; not needed for this proof), and a restore of `storage/app` (its archive was tested with `zstd -dc | tar -t` in §10).

## 12. Done 2026-11-13 — monitoring

The developer said «давай, настрой мониторинг» and chose two things: alerts **to the elmarket ops chat**, and **external plus internal** checks. The runbook is `docs/infrastructure/monitoring.md`, and the reviewed copies are in `infra/production/monitoring/`.

1. **Survey** (read-only). HOMI had no monitoring.
   - The app host runs the **elmarket-prod** stack:
     - Prometheus 3.14 on `127.0.0.1:9090` with `--web.enable-lifecycle`;
     - Alertmanager 0.34 on `127.0.0.1:9093`, routing by severity to three receivers. All three use one chat and `bot_token_file`, bot @nimaqattabot (from `getMe`; only the username was printed);
     - Grafana;
     - node_exporter 1.12 on `*:9100`, which ufw closes to the outside. Its textfile collector is in `/var/lib/prometheus/node-exporter`, from elmarket's drop-in `textfile.conf`.
     - A `blackbox_exporter` 0.25 binary exists there but does not run.
   - The MinIO host runs the **mars** stack:
     - Prometheus 2.42 under `/prom`;
     - Alertmanager 0.25 under `/am`, with one inline-token receiver for another chat (`chat_id` hashes compared, not printed) and a Watchdog route;
     - node exporter;
     - ufw allows only 22, 80, 443 and 3690.
     - `prometheus-blackbox-exporter` 0.23 was available but not installed.
   - The app host's `ServiceDown` rule waits `for: 3m`, so a node_exporter restart does not fire it.
2. **App host.** Backups of every changed file are in `/root/.homi-backups/20261113/`.
   - **`homi-backup`** now writes `homi_backup.prom` (`homi_backup_last_success_timestamp_seconds{env}`) after every run. The old copy was backed up and the new one installed. A run through `systemctl start homi-backup.service` gave `Result=success`; the metric is exported, with `node_textfile_scrape_error 0`.
   - **node_exporter drop-in `textfile.conf`.** Two comment lines plus `--collector.systemd --collector.systemd.unit-include=(…HOMI units…)[.]service`, inserted with a textual edit; nothing else changed (diff checked).
     - `systemd-analyze verify` had no remarks.
     - `daemon-reload`, then a restart, then active.
     - The 9 HOMI units are exported, and `node_scrape_collector_success` is 1 for both `systemd` and `textfile`.
   - **`/etc/prometheus/rules/homi.yml`**, 6 rules.
     - `promtool check rules` and `promtool check config` passed, then `systemctl reload prometheus`.
     - `reloadConfigSuccess: true`; all 6 rules `ok` and `inactive`.
     - Prometheus sees 8 active HOMI units (the oneshot `homi-backup` is inactive between runs) and a backup age of about 330 s.
3. **MinIO host.** Backups are in `/root/.homi-backups/20261113/`.
   - **Blackbox exporter.** `apt-get install --no-install-recommends prometheus-blackbox-exporter` installed one package, 0.23.0.
     - `ARGS` gained `--web.listen-address=127.0.0.1:9115`, and the `homi_https` module was appended to `/etc/prometheus/blackbox.yml`.
     - `--config.check` ok, restart, active, listening on `127.0.0.1:9115` only.
     - Manual probes of `homi.uz/`, `hook.homi.uz/up` and `api.staging.homi.uz/up`: 200, `probe_success 1`, 86 days left on the certificates.
   - **Prometheus.** The `homi-blackbox` job (10 targets, labels `project=homi`, `env`) was appended to `prometheus.yml`, and `rules/homi.rules.yml` (5 rules) installed.
     - `promtool check config` passed (4 rule files), then reload; `reloadConfigSuccess: true`.
     - After one minute, all 10 targets are `up`, there are 10 `probe_success` series and all are 1. The earliest certificate expiry is 85.6 days away.
     - All 5 rules `ok` and `inactive`.
   - **Alertmanager.** Added a first child route `project = "homi"` → receiver `homi`, plus the receiver itself. The token and `chat_id` were read on the app host, piped from ssh to ssh into a script on the MinIO host, and checked for shape there. They were never printed, and the script was deleted afterwards.
     - The file stays `0640 root:prometheus`. `amtool check-config`: SUCCESS, 2 receivers.
     - `amtool config routes test`: `project=homi` goes to `homi`; another critical alert and `Watchdog` still go to `telegram`.
     - `systemctl reload prometheus-alertmanager`: `alertmanager_config_last_reload_successful 1`, and the API lists the receivers `telegram` and `homi`.
4. **Not verified:**
   - ~~Telegram delivery end to end~~: tested on 2026-11-13 with the developer's go (item 6).
   - **A real rule actually firing**: every rule is `inactive` because everything is healthy.
   - **Coverage gaps**: Redis memory, Laravel errors and queue depth are not covered (runbook "Not covered yet").
5. **Rollback.** Restore the backups in `/root/.homi-backups/20261113/` on each host, then validate and reload (runbook "Rollback"). Removing the blackbox package needs the developer's go.
6. **Delivery test** (the developer's go: «да, отправь тестовые алерты»). One `HomiMonitoringTest` alert went to each Alertmanager through `amtool alert add`, with `severity=warning`, `project=homi`, a "TEST … Please ignore" summary and `--end` = now + 90 s.
   - The routing test on the MinIO host sent it to `homi`. On the app host it took the `warning` severity route.
   - `alertmanager_notifications_total{integration="telegram"}`, firing and resolved: app host 632 → 633 → 634, MinIO host 57 → 58 → 59, rising by exactly 2 each.
   - `alertmanager_notifications_failed_total` stayed 0 on both, and `amtool alert query` afterwards shows no test alert left.
   - The message in the chat itself was not seen by the agent. The developer can confirm it.

## 13. Done 2026-11-13 — Redis, queue, Horizon and Laravel-error monitoring

The developer asked for this («Добавить мониторинг памяти Redis, ошибок Laravel и очередей») and decided the same day that backup encryption is not needed (§6). The runbook is `docs/infrastructure/monitoring.md` ("Alerts", "How homi-metrics measures"). No new package was installed: only `redis-cli`, `gawk`, `tail` and the textfile collector from §12 are used.

1. **Survey** (read-only; `.env` values were not read, because the guard hook blocked a first attempt that would have printed them):
   - `artisan tinker` (production) printed the config:
     - `app.timezone` = UTC; queue connection `redis` on the `default` Redis connection (DB 3); Redis prefix `homi-production-`; Horizon prefix `homi_horizon:`; failed driver `database-uuids`;
     - Horizon queues `default`, `notifications`, `telegram`, `media`, `ingest`; `failed_jobs` = 0.
   - `horizon:status` was "running" in both environments.
   - The key names in DB 3–6 match: `homi_horizon:*` in DB 3 and DB 5, cache keys `homi-<env>-homi-cache-*` in DB 4 and DB 6, and no queue keys, because every queue is empty.
   - Horizon's source (`RedisJobRepository`, `RedisMasterSupervisorRepository`, `StatusCommand`) gives the keys `failed_jobs` and `masters` and the 14 s master window.
   - The staging log `laravel-2026-11-08.log` shows the line format, with 12 old `staging.ERROR: Vite manifest not found` entries. Production has no log file yet.
2. **`homi-metrics`** (`infra/production/bin/homi-metrics` → `/usr/local/sbin/homi-metrics`):
   - It writes `homi.prom` atomically and keeps a value only if it is numeric, because one bad line would make node_exporter drop the whole file.
   - A manual run took 0.21 s, exit 0, and produced 26 samples: Redis up, 4 853 744 bytes, maxmemory 0, 0 evictions, RDB ok; DB keys 8/1/8/1; every queue 0; failed 0/0; Horizon running 1/1; log errors 0/0.
   - node_exporter exports 48 `homi_` series (including backups and the delayed/reserved states), with `node_textfile_scrape_error 0`.
   - The log-error `awk` was tested locally on a synthetic log. It counted 3 of 3 expected entries (ERROR, CRITICAL, ERROR with JSON), and skipped the 20-minute-old ERROR, the INFO, the WARNING and the stack-trace line.
3. **Timer.**
   - `homi-metrics.{service,timer}` installed; `systemd-analyze verify` had no remarks; `daemon-reload`; `enable --now`.
   - It runs every minute (last 09:21:01, next 09:22:00 UTC), and the file stays under 60 s old.
   - The journal shows nothing beyond start and finish.
4. **Rules.** `homi.yml` gained the group `homi-runtime` with 12 rules (the file now holds 18). The old file was kept as `/root/.homi-backups/20261113/homi.yml.bak-20261113b-homi`.
   - `promtool check rules` and `check config` passed, then `systemctl reload prometheus`, with `reloadConfigSuccess: true`.
   - Both groups are `ok`, and nothing is pending or firing.
   - Prometheus queries return `homi_redis_up` 1, `homi_horizon_running` 1/1, log errors 0/0 and a queue sum of 0.
5. **`homi-deploy`** (repository): the drift check also compares `homi-metrics`. Its timer and service are covered by the existing `*.service` / `*.timer` globs.
6. **Not verified:**
   - an alert from these rules actually firing (everything is healthy);
   - a paused Horizon, a real backlog or real failed jobs (none could be produced without touching the environments);
   - the thresholds: 2 / 8 GiB for Redis and 100 / 1000 ready jobs are starting values.
7. **Rollback:**
   - `systemctl disable --now homi-metrics.timer`, then remove the three installed files, `homi.prom` and the `homi-runtime` group (or restore `homi.yml.bak-20261113b-homi`);
   - `promtool check config`, then reload.
8. **After the merge of PR #17** (`fc6e4b6`, the developer's go):
   - `homi-deploy staging` and then `homi-deploy production`: a checkout only, 3 s each. The only drift warning was the outdated installed `homi-deploy`.
   - The old script was copied to `/root/.homi-backups/20261113/bin/homi-deploy.bak-20261113c-homi`, and the new one was installed from the production checkout (`bash -n` ok; it now checks `homi-metrics`).
   - Both dry runs: exit 0, 14 `ok`, 0 `WARNING`, "nothing to deploy — fc6e4b6 is live".
   - `homi.prom` was 58 s old, and all 18 HOMI rules were inactive.
