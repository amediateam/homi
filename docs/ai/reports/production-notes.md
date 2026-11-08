# Production track — notes

Purpose: the running log of the **production track** (first developer; staging and production servers). It replaces `session-handoff.md` for this track (`docs/handoff/parallel-work.md` §5, KI-20): a production-track session reads this file first and extends it; it never rewrites the development track's handoff. Facts only — every claim names the command that proved it or says `unverified`. No secrets: variable names, file paths and host names only.

Reading order for a production-track session: `CLAUDE.md` → `HANDOFF.md` §4 "Production track" → this file → `docs/infrastructure/environments.md` → ADR-0011 (hosts), ADR-0013 (Next SSR on the servers) → `docs/ai/reports/phase-3-notes.md` §A–§B (CDN and webhook items handed to this track).

Rules that apply here in addition to the mandate: every action on a server, DNS, bucket or bot is approved by the developer **each time**; back up before editing a server file; validate before restarting; record the rollback; the development track owns application code — this track asks for changes instead of making them (`parallel-work.md` §1).

## Status

| Component | State (2026-11-09) | Where |
|---|---|---|
| PostgreSQL databases and roles | **done** — `homi_db` (production) and `homi_staging_db` (staging) on `5.45.127.98`, reachable from the app host | §2 |
| App host (nginx, php-fpm, Redis, deploy layout) | surveyed only, nothing deployed | §1 |
| DNS `homi.uz`, TLS, nginx vhosts, process manager | not started | — |
| MinIO buckets and users (`31.220.104.38`, `s3.hc.uz`) | not started | — |
| Server `.env` files, deploy pipeline | not started | §4 |
| Staging and production Telegram bot webhooks | not started | — |
| Backups, monitoring | not started | — |

## 1. Servers as found (survey 2026-11-09, read-only)

Both hosts are shared with other projects; nothing below was changed except what §2 lists.

**App host `159.253.19.121`** (`sd420adbb.fastvps-server.com`, Debian 12 bookworm, 8 vCPU, 32 GB RAM, uptime 65 days):
- nginx on 80/443 serving other projects; php-fpm pools run as `www-data` (home `/var/www`); PHP 8.5.12 with `pdo_pgsql`, `pgsql`, `redis`, `imagick` (`php -m`).
- A **local** PostgreSQL 18.6 cluster listening on `127.0.0.1:5432` and `159.253.19.121:5432` with 13 other projects' databases — HOMI does not use it (ADR-0011 puts HOMI's database on `5.45.127.98`). Its `pg_hba.conf` ends with `reject` rules; ufw allows inbound 5432 — pre-existing, not touched.
- Redis `127.0.0.1:6379`, shared with other projects — the "Redis per environment" decision (`environments.md`, not decided) must account for this: a DB index or a second instance.
- `psql` client 18.6; `python3` present. `/root/.postgresql/root.crt` (dated Aug 20) exists from an earlier setup: under `root`, libpq's `sslmode=require` therefore behaves like `verify-ca`; `www-data` has no such file.
- Round trip to the DB host: 0.5 ms average (`ping -c 5`); the route leaves through the gateway `10.0.128.1`, i.e. the hosts are **not** on a private network.

**DB host `5.45.127.98`** (`s59a6108d.fastvps-server.com`, Debian 13 trixie, 8 vCPU, 32 GB RAM, 251 GB disk at 17 %, uptime 58 days):
- PostgreSQL 18.6 (pgdg), cluster `18/main`, data `/var/lib/postgresql/18/main`, config `/etc/postgresql/18/main/`, `include_dir = 'conf.d'`. Other database on the cluster: `kc_db` (11 MB, one connection from `127.0.0.1`).
- Settings: `max_connections 100`, `shared_buffers 128 MB` (default — low for 32 GB, tune later with the cluster owner), `password_encryption scram-sha-256`, `ssl on` with the distribution's self-signed certificate (`ssl-cert-snakeoil.pem`, CN `s59a6108d.fastvps-server.com`, valid to 2036), `log_statement none`, server timezone `Asia/Tashkent`.
- Extensions available, none installed: `pg_trgm 1.6`, `citext 1.8`, `unaccent 1.1`, `btree_gist 1.8`. **PostGIS is not installed**; `postgresql-18-postgis-3` 3.7.0 is available from pgdg (`apt-cache policy`) — input for the T7 gate.
- Firewalls: **two layers**. ufw (IP whitelist: ten addresses incl. `159.253.19.121` and `31.220.104.38` allowed on all ports; 80/443 public) **and** an nftables `inet filter` table (`/etc/nftables.conf`, policy drop, 22/80/443 public, 3306/6379/5672 from two cluster nodes, 3690). A packet must pass both. `nftables.service` is disabled yet the ruleset is loaded — what loads it at boot is `unverified`. fail2ban active (sshd, nginx jails).

## 2. Done 2026-11-09 — PostgreSQL for HOMI

Developer's request: create the database for `DB_DATABASE=homi_db`, `DB_USERNAME=homi_db`. Steps, in order, each with its evidence:

1. **Roles and databases** (as `postgres` via `sudo -u postgres psql`, `ON_ERROR_STOP`): `homi_db` and `homi_staging_db`, each `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`, each owning the same-named database (`UTF8`, template1, `en_US.UTF-8`), `REVOKE CONNECT, TEMPORARY … FROM PUBLIC`, `GRANT … TO <owner>`, `ALTER DATABASE … SET timezone TO 'UTC'`. Proof: `pg_database.datacl = {homi_db=CTc/homi_db}` and `{homi_staging_db=CTc/homi_staging_db}`; `has_database_privilege('kc_db','homi_db','CONNECT')` → `false`; `show timezone` as `homi_db` → `UTC`.
   - Passwords: neither plaintext was sent to the DB host. The production password (supplied by the developer) was hashed locally into a SCRAM-SHA-256 verifier (`pbkdf2 4096`) and only the verifier went into `CREATE ROLE`. The staging password was generated **on the app host** (`openssl rand -hex 20`) into `/root/.homi-secrets/staging-db.password` (mode 0600, root only) and hashed there; it has never been displayed. `pg_authid.rolpassword` starts with `SCRAM-SHA-256$` for both roles.
2. **Listen on the public interface**: new file `/etc/postgresql/18/main/conf.d/homi.conf` with `listen_addresses = 'localhost,5.45.127.98'`. Validated with `pg_file_settings` (the only "error" was the expected `setting could not be applied` — restart required), then `systemctl restart postgresql@18-main` (approved; `kc_db`'s single connection dropped for about a second and reconnected — `pg_stat_activity` after). Proof: `ss -ltn` shows `5.45.127.98:5432`.
3. **pg_hba** (`/etc/postgresql/18/main/pg_hba.conf`, appended lines 135–136, backups `pg_hba.conf.bak-*-homi*` next to it):
   `host homi_db homi_db 159.253.19.121/32 scram-sha-256` and `host homi_staging_db homi_staging_db 159.253.19.121/32 scram-sha-256`. Applied with `pg_reload_conf()`; `pg_hba_file_rules` shows 0 errors. The first version used `hostssl`; it was changed to `host` after the developer's decision below.
4. **nftables**: `nft add rule inet filter input tcp dport 5432 ip saddr 159.253.19.121 accept` (live, handle 15) and the same line in `/etc/nftables.conf` (backup `/etc/nftables.conf.bak-*-homi`, `nft -c -f` syntax OK, file **not** reloaded). ufw already allowed all ports from `159.253.19.121` (pre-existing rule 4).

Verification from the app host (all on 2026-11-09, after step 4):

| Check | Command (on `159.253.19.121`) | Result |
|---|---|---|
| Production login without SSL | `psql "host=5.45.127.98 dbname=homi_db user=homi_db sslmode=disable"` | `homi_db / homi_db`, `ssl=false`, `TimeZone=UTC` |
| Same path PHP uses | `runuser -u www-data -- php -r 'new PDO("pgsql:host=5.45.127.98;dbname=homi_db;sslmode=disable", …)'` | `pdo ok`, PostgreSQL 18.6 |
| Staging login | same with `homi_staging_db`, password read from the 0600 file | `ssl=false`, `UTC` |
| Wrong password | `PGPASSWORD=wrong psql …` | `FATAL: password authentication failed` |
| Cross-database: `homi_db` → `postgres`, `homi_staging_db` → `homi_db`, `homi_db` → `homi_staging_db` | `psql …` | `FATAL: no pg_hba.conf entry` (all three) |
| Firewall effect | `psql …` before the nftables rule, then after | `timeout expired` before; connected after |
| Other tenants | `pg_stat_activity` on the DB host after restart and reload | `kc_db` connection present |
| Latency | `ping -c 5 5.45.127.98` | 0.34 / 0.55 / 1.1 ms (min / avg / max) |

Rollback (all steps): remove `conf.d/homi.conf`, restore `pg_hba.conf` from the oldest `*-homi` backup, `systemctl restart postgresql@18-main`; `nft delete rule inet filter input handle 15` and restore `/etc/nftables.conf` from its backup; `DROP DATABASE homi_db, homi_staging_db; DROP ROLE homi_db, homi_staging_db` (destructive — developer's approval).

## 3. Developer decisions

| Date | Decision | Consequence recorded |
|---|---|---|
| 2026-11-09 | **No TLS between app and database** («ssl mode не нужен, это тормозит потом работу приложения»; other projects run without it). `pg_hba` uses `host` (SSL optional), the application sets `DB_SSLMODE=disable` | Traffic between the two hosts crosses the public network unencrypted; SCRAM keeps the password itself off the wire. Measured TLS cost would have been about 1–3 ms per new connection, nothing per query. Certificate pinning (`verify-ca` with the DB host's certificate) was tested and works if ever wanted — it needs `'sslrootcert' => env('DB_SSLROOTCERT')` in `config/database.php` (development track). |
| 2026-11-09 | `homi_db` is **production**; staging gets `homi_staging_db` on the same cluster now | `environments.md` hosts table updated (the earlier placeholder names `homi_staging` / `homi_production` are gone). |

## 4. Open items (need the developer's go — do not start alone)

1. **Rotate the production database password** when the server `.env` is written: it was shared in chat on 2026-11-09, which `parallel-work.md` §6 rules out as a channel. Pattern that keeps it off every screen: generate on the app host into `/root/.homi-secrets/`, hash there, `ALTER ROLE … PASSWORD '<verifier>'` on the DB host. Move both passwords into the password manager.
2. Server `.env` for the backend (names only): `DB_HOST=5.45.127.98`, `DB_PORT=5432`, `DB_DATABASE=homi_db`, `DB_USERNAME=homi_db`, `DB_PASSWORD`, `DB_SSLMODE=disable`; staging the same with `homi_staging_db`. Without `DB_SSLMODE=disable` libpq's default `prefer` negotiates TLS anyway because the server has `ssl on`.
3. App host layout: deploy user and directories, nginx vhosts for `*.homi.uz` (ADR-0013 ports 3100–3102 / 3200–3202), php-fpm pool per environment, Horizon under the process manager, Redis separation (shared instance — DB index or own instance), DNS and TLS. Each is a separate approved step.
4. DB host follow-ups with the cluster owner: `shared_buffers` (128 MB default on 32 GB), who loads `/etc/nftables.conf` at boot, PostGIS install if T7 adopts it (ADR first).
5. MinIO buckets/users, bot webhooks, backups, monitoring — per `HANDOFF.md` §4 "Production track".

## 5. Not verified

- `/etc/nftables.conf` was syntax-checked but not reloaded; the live rule and the file are consistent by inspection only.
- Behaviour after a reboot of either host (what loads nftables; whether PostgreSQL comes up with `conf.d/homi.conf`) — `unverified`.
- Connection pooling and real application load against the remote database — nothing deployed yet.
