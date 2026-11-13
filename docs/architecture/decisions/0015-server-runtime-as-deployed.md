# ADR-0015: Server runtime as deployed — databases, Redis, process manager, code delivery

- Status: Accepted
- Date: 2026-11-12 (the decisions were taken on 2026-11-09 during the production and staging bring-up)
- Deciders: developer (production track; `docs/ai/reports/production-notes.md` §6)
- Source: `docs/ai/reports/production-notes.md` §1–§3c, §6, §8; amends ADR-0011 (database names, Redis) and ADR-0013 (process manager)

## Context

ADR-0011 used the placeholder database names `homi_staging` / `homi_production` and left Redis open ("one instance per environment or separate DB index"). ADR-0013 left the process manager open ("systemd unit or pm2"). Production and staging went live on 2026-11-09, and these questions were settled then. The answers are in the production notes but not in an ADR, and the development track's migration plan (PR #9) already reads them from there.

Facts behind the choices (`production-notes.md` §1, §8):
- The database host `5.45.127.98` runs one PostgreSQL 18 cluster shared with another product (`kc_db`).
- The app host `159.253.19.121` runs one Redis 8 instance shared with other projects, which use DB 0–2. That instance has no password, no `maxmemory`, the default `noeviction` policy, and RDB snapshots only.
- The app host runs its other Laravel workers under systemd. pm2 is installed there but unused.
- The two hosts are not on a private network.

## Decision

- **Databases.** On the shared cluster, `homi_db` is production and `homi_staging_db` is staging, each owned by a same-named role.
  - Roles: `NOSUPERUSER NOCREATEDB NOCREATEROLE`.
  - `CONNECT` is revoked from `PUBLIC`.
  - `pg_hba` and both firewalls admit only the app host.
  - The connection uses no TLS (`DB_SSLMODE=disable`). This is the developer's decision: «ssl mode не нужен, это тормозит потом работу приложения». SCRAM keeps the password off the wire.
- **Redis.** HOMI uses DB indexes on the shared instance:
  - production: `REDIS_DB=3`, `REDIS_CACHE_DB=4`;
  - staging: 5 / 6;
  - a separate `REDIS_PREFIX` per environment.
  - HOMI never changes the instance's configuration (`CONFIG SET`, `maxmemory`, eviction policy, `appendonly`, `requirepass`). Those settings apply to every project on the host.
- **Process manager: systemd.**
  - Horizon runs as `horizon-homi.service` / `horizon-homi-staging.service`.
  - The Next SSR servers run as `homi[-staging]-next-{landing,app,arm}.service`, on ports 3100–3102 / 3200–3202 (ADR-0013).
  - All of them run as `www-data`, with Node 26 from `/opt/node26`. Both environments use the same user, as the host's other projects do. Contrary to ADR-0011's "separated by … user", directory, `.env`, units, ports and Redis indexes keep them apart.
  - Reviewed copies of the units are in `infra/{production,staging}/systemd/`.
- **Code delivery.**
  - Each environment is a git checkout (`/var/www/homi.uz`, `/var/www/staging.homi.uz`) through a read-only deploy key, not the host's SVN.
  - Deploys run with `homi-deploy <production|staging>` (`infra/production/bin/homi-deploy`, `docs/infrastructure/deployment.md`).
  - New migrations run on production only with `--migrate`.

## Consequences

- Queued jobs can be lost when Redis crashes: there is no AOF, so whatever was queued since the last snapshot is gone. Jobs must be re-dispatchable from PostgreSQL (ADR-0005). The kvadro² cut-over backlog must not live only in Redis.
- Nothing evicts Redis memory and nothing caps it. HOMI cache keys need TTLs, and monitoring needs a used-memory alert.
- Cluster-wide PostgreSQL features (WAL archiving, PITR with pgBackRest, extensions such as PostGIS, `shared_buffers`) need the cluster owner's agreement. Until then, HOMI backups are per-database `pg_dump`.
- Staging and production share one host IP, so `pg_hba` separates them by role and database, never by address.
- App-to-database traffic crosses the public network unencrypted. Certificate pinning (`verify-ca`) was tested and can be enabled later; it needs `sslrootcert` support in `config/database.php`.
- Still open:
  - atomic releases (release directories plus a `current` symlink);
  - the deploy trigger;
  - a dedicated Redis or database instance if capacity measurements require it (`production-notes.md` §5).

## Alternatives considered

- A separate Redis instance per environment, with a password and AOF. Not chosen on 2026-11-09. It can be revisited after the capacity measurement (DEC-28 in the kvadro² plan).
- pm2 for the Next servers. Not chosen: the host's existing workers run under systemd, and pm2 is installed there but unused.
- Delivery through the host's SVN or rsync. Rejected: a git checkout keeps the deployed commit traceable and lets `homi-deploy` plan, roll back (`--ref`) and check drift.
