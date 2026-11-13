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
| Deploy script `homi-deploy` (both environments) | **done** — installed on the app host; staging: full repeat deploy, rollback and forward deploys; production: dry run only | §3c |
| Backups, monitoring | not started | §5 |

## Resume here (state at 2026-11-12)

- **2026-11-12.**
  - The shared Redis was checked (§8): `noeviction`, no `maxmemory`, RDB only.
  - The development track's PR #9 (kvadro² plan) was reviewed: the production parts, as a PR comment.
  - Branch `chore/infra-review-fixes` holds the fixes to the vhost and unit copies and to `homi-deploy`.
  - When it merges, the servers need the apply batch in §8 (developer's go).
  - Open decision: which bot gets `hook.homi.uz` (§8).
- **Repository.** Everything is on `main`. PR #8 (`chore/infra-db-production`) was merged on 2026-11-09 at the developer's request («commit push main»). New work on this track branches from `origin/main` and goes through a PR.
- **Server checkouts.** The checkouts are still at `591ceb4`. The next `homi-deploy` only checks out the merge: it touches docs and `infra/` only, so no backend or frontend step runs. After that the drift check has `infra/` to compare against.
- **Servers.** Production and staging are live at `591ceb4`; `homi-deploy` is installed; `/var/lib/homi-deploy/{production,staging}.sha` = `591ceb4`.
- **Check in one command:** `ssh root@159.253.19.121 'homi-deploy staging --dry-run && homi-deploy production --dry-run'`. Each prints "nothing to deploy" and 14 checks `ok`. That held on 2026-11-09 (§3c).
- **Next, in this order.** Each item needs the developer's go.
  1. The first real production run, `homi-deploy production --full`. It was offered on 2026-11-09 and is not yet approved; it also fixes AM-42 there. Combine it with the apply batch in §8 once `chore/infra-review-fixes` is merged.
  2. Backups: database dumps off-host plus `storage/` (§5 item 9).
  3. The rest of §5, in the order the developer picks: bot tokens (the developer writes them into `.env`), MinIO and `cdn` DNS, the SVN commit, `TELESCOPE_ENABLED`, a deploy trigger and atomic releases, release tag vs `main`.
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
   - the first production run of `homi-deploy production` (it also fixes AM-42 there);
   - a trigger — GitHub Actions over SSH, or manual only — decide;
   - atomic releases (release directories plus a `current` symlink) so that `next build` and `composer install` no longer run under the live servers (`deployment.md` "Deploy" limits);
   - after PR #8 is merged, the next deploy brings `infra/` into the checkouts and the drift check starts reporting.
6. **Telescope in production**: `TELESCOPE_ENABLED` defaults to `true` and records every request into `homi_db`; set `TELESCOPE_ENABLED=false` (or gate + prune) before real traffic — a one-line `.env` change, developer's call. Pulse: enabled; its `pulse:check` worker is not running (the house runs one per project).
7. Scheduler cron for `www-data` once `schedule:list` is non-empty; `php artisan optimize` in the deploy; log rotation of `storage/logs` (daily driver, no retention set).
8. DB host follow-ups with the cluster owner: `shared_buffers` (128 MB default on 32 GB), who loads `/etc/nftables.conf` at boot, PostGIS install if T7 adopts it (ADR first).
9. Backups (database dumps off-host; `storage/`), monitoring (`/up` probes, unit failures), ADR amendments: ADR-0011 (Redis = DB indexes on the shared instance; `homi_db` naming), ADR-0013 (process manager = systemd, `/opt/node26`). The ADR amendments were proposed on 2026-11-12 in their own PR (branch `docs/adr-0011-0013-amend`). ADRs are shared files, so they never go into an infra PR (`parallel-work.md` §1).
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

## 7. Not verified

- A deploy that carries real changes:
  - Staging has only redeployed `591ceb4` (`--full`) and rolled back to `aa8149e` and forward again, with no backend or migration changes in that diff. The composer and migration steps ran but had nothing to do.
  - Production has had dry runs only.
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
