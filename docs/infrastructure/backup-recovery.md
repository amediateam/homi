# Backup and recovery (staging and production)

Purpose: what HOMI backs up, where, how to check it and how to restore. The production track owns this file; the development track reads it (`docs/handoff/parallel-work.md` §1). Every command runs as `root` on the host named in its heading, and every action on a server is approved by the first developer first. History and evidence: `docs/ai/reports/production-notes.md` §10.

## What is backed up

| Item | How | Not included |
|---|---|---|
| `homi_db` (production), `homi_staging_db` (staging) on `5.45.127.98` | `pg_dump --format=custom` as the database's owner role, read back completely with `pg_restore --file=/dev/null` before upload | roles and cluster settings (the cluster is shared with `kc_db`; roles are re-created by hand, `production-notes.md` §2) |
| `backend/storage/app` of each environment | `tar` + `zstd -19` | `storage/logs`, `storage/framework` (rebuildable) |
| Integrity | `SHA256SUMS` next to the files; remote sizes compared after upload | — |

Not backed up here:
- `backend/.env`, including `APP_KEY`, and `frontend/*/.env.local`. They hold secrets, so the developer keeps a copy outside the servers. Without `APP_KEY`, encrypted values and sessions cannot be read after a rebuild.
- Redis: queues and cache must be rebuildable from PostgreSQL (ADR-0005, ADR-0015).
- nginx and systemd: the reviewed copies are in `infra/`.
- The MinIO media buckets do not exist yet.

The dumps are **not encrypted**. This was the developer's decision on 2026-11-13, and it holds while there is almost no personal data. Public-key encryption comes before the kvadro² data is moved.

## Where and how long

| | |
|---|---|
| Off-host copy | MinIO on `31.220.104.38` (`https://s3.hc.uz`), bucket **`homi-backups`**, keys `<env>/<UTC stamp>/<file>` |
| Bucket rules | Versioning on. ILM: current objects expire after **14 days**, noncurrent versions **7 days** after that, and expired delete markers are removed (`mcli ilm rule ls s3hc/homi-backups` on the MinIO host). |
| Credentials | MinIO user `homi-backup` with policy `homi-backups-append`: list, put and get on this bucket only, **no delete**. A stolen key cannot erase the history. The secret is `/root/.homi-secrets/backup-s3.secret` (0600) on the app host. |
| Local copy | `/var/backups/homi/<env>/<stamp>/` on the app host (0700), removed after 3 days |
| Schedule | `homi-backup.timer` daily at 21:30 UTC (02:30 Asia/Tashkent), random delay up to 10 min, `Persistent=true` (a missed run starts at boot) |
| Code | `infra/production/bin/homi-backup` → `/usr/local/sbin/homi-backup`; `infra/production/systemd/homi-backup.{service,timer}` → `/etc/systemd/system/`. The `homi-deploy` drift check compares all three. |

The 14 days match the retention the kvadro² privacy text promises: deleted users leave the backups "after about two weeks" (PR #9, `docs/migration/17-infrastructure-and-deployment.md` §13). A longer retention needs that text changed first (DEC-12).

## Check (app host `159.253.19.121`)

```bash
systemctl list-timers homi-backup.timer          # next and last run
systemctl status homi-backup.service --no-pager  # Result=success after the last run
journalctl -u homi-backup.service --since today  # per-environment log lines
cat /var/lib/homi-backup/*.last-success          # "<time> s3://homi-backups/<env>/<stamp>/" per environment
```

Run one by hand: `homi-backup staging`, `homi-backup production`, or `systemctl start homi-backup.service` for both. A failed environment does not stop the other one. The command exits 1, and the unit shows `failed`. No alert is wired yet: that is the monitoring task (`production-notes.md` §5 item 9).

List what is in the bucket. On the MinIO host: `mcli ls --recursive s3hc/homi-backups`. On the app host:

```bash
export MC_HOST_homibk="https://homi-backup:$(cat /root/.homi-secrets/backup-s3.secret)@s3.hc.uz"
mcli ls --recursive homibk/homi-backups/production/
```

## Restore

Every restore needs the developer's approval. A production restore overwrites live data, so first take a fresh backup with `homi-backup production`.

1. **Fetch and verify** (app host):
   ```bash
   export MC_HOST_homibk="https://homi-backup:$(cat /root/.homi-secrets/backup-s3.secret)@s3.hc.uz"
   install -d -m 0700 /root/restore && cd /root/restore
   mcli cp --recursive homibk/homi-backups/production/<stamp>/ ./
   sha256sum -c SHA256SUMS
   ```
2. **Restore drill**, without touching live data. The first one ran on 2026-11-13 (`production-notes.md` §11).
   - `pg_hba` admits only `homi_db` and `homi_staging_db` from the app host, so the drill runs on the DB host `5.45.127.98`, over the local socket.
   - **Reaching the DB host.** SSH from the developer machine timed out on 2026-11-13: its firewall whitelists the app and MinIO hosts. The app host's sshd refuses forwarding, so `ssh -J` does not work either. Run the commands from the app host instead: `ssh root@5.45.127.98 …`, which uses the app host's root key, already authorised.
   - **Copy the dump there.** From the app host: `scp <file>.dump root@5.45.127.98:/root/restore-drill/`. Check `sha256sum` against `SHA256SUMS`.
   - `postgres` cannot read `/root`, so give it a private copy:
   ```bash
   install -d -m 0700 -o postgres -g postgres /tmp/homi-restore-drill
   install -m 0600 -o postgres -g postgres /root/restore-drill/<file>.dump /tmp/homi-restore-drill/
   sudo -u postgres createdb homi_restore_drill
   sudo -u postgres pg_restore --no-owner --no-acl --exit-on-error --dbname=homi_restore_drill /tmp/homi-restore-drill/<file>.dump
   ```
   - **Compare with the live database.** Run the same exact per-table row count on both databases: `select count(*)` over every `public` table, for example through `query_to_xml`. Also compare the counts from `pg_indexes`, `pg_constraint` and `pg_sequences`, and `md5(string_agg(migration, ',' order by id))` from `migrations`. Rows written after the backup show up as expected differences.
   - **Clean up.** `sudo -u postgres dropdb homi_restore_drill`, `rm -rf /tmp/homi-restore-drill /root/restore-drill` on the DB host, and `rm -rf` of the download on the app host. The dump holds personal data once real users exist.
3. **Production database**, a disaster restore (app host):
   - Run `php artisan down` as `www-data` in `/var/www/homi.uz/backend`, then `systemctl stop horizon-homi`.
   - Restore as the owner role, with the password taken from the environment's `.env` and never typed into a chat:
     `PGPASSWORD=… PGSSLMODE=disable /usr/lib/postgresql/18/bin/pg_restore --host=5.45.127.98 --username=homi_db --dbname=homi_db --clean --if-exists --no-owner --single-transaction <file>.dump`.
   - Then `systemctl start horizon-homi` and `php artisan up`.
   - Check: `homi-deploy production --dry-run`.
   - Staging is the same, with `homi_staging_db`, `/var/www/staging.homi.uz` and `horizon-homi-staging`.
4. **Storage**:
   ```bash
   zstd -dc <env>-storage-<stamp>.tar.zst | tar -C /var/www/<env-dir>/backend/storage -xf -
   chown -R www-data:www-data /var/www/<env-dir>/backend/storage/app
   ```

## Rotate the MinIO secret

1. On the app host, write a new secret: `(umask 077; openssl rand -hex 24 > /root/.homi-secrets/backup-s3.secret.new)`.
2. On the MinIO host, set it on the user: `mcli admin user add s3hc homi-backup <new secret>`. Pipe it there from the app host with `ssh`, so it never appears in a chat or a log.
3. On the app host, move the `.new` file over the old one.
4. Run `homi-backup staging` to confirm the new secret works.

## Limits

- The off-host copy lives on a single host, `31.220.104.38`, which is also shared. Losing it while the DB host is also lost would lose everything. A second copy elsewhere is open (`production-notes.md` §5).
- The dumps are logical, so a restore returns to the last nightly run. Point-in-time recovery (WAL archiving) needs the agreement of the shared cluster's owner (ADR-0015).
- Every backup run reads the whole archive back (`pg_restore --file=/dev/null`). One restore drill into a database ran on 2026-11-13, from the MinIO copy; the result matched the live database (`production-notes.md` §11). Repeat it before the kvadro² rehearsals and after any change to `homi-backup`. It is not scheduled.
