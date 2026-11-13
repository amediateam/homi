# infra/staging — what runs for `*.staging.homi.uz`

Copies of the staging files on the same web host `159.253.19.121` (ADR-0011: staging and production share the host, separated by directory, `.env`, Redis DB and systemd units). Everything in `infra/production/README.md` applies; this directory only differs in names, ports and backing services. Runbook: `docs/infrastructure/deployment.md` (staging section). History: `docs/ai/reports/production-notes.md`.

| Production | Staging |
|---|---|
| `/var/www/homi.uz` | `/var/www/staging.homi.uz` (same repository, branch `main`, same read-only deploy key) |
| `homi.uz`, `app.`, `arm.`, `api.`, `hook.homi.uz` | `staging.homi.uz`, `app.`, `arm.`, `api.`, `hook.staging.homi.uz` — no `www`; **`X-Robots-Tag: noindex, nofollow` on every staging host** |
| Next SSR on `127.0.0.1:3100–3102` | `127.0.0.1:3200–3202` |
| `horizon-homi.service`, `homi-next-{landing,app,arm}.service` | `horizon-homi-staging.service`, `homi-staging-next-{landing,app,arm}.service` |
| database `homi_db` | `homi_staging_db` (password only in `/root/.homi-secrets/staging-db.password` on the host) |
| `REDIS_DB=3`, `REDIS_CACHE_DB=4`, prefix `homi-production-` | `REDIS_DB=5`, `REDIS_CACHE_DB=6`, prefix `homi-staging-` |
| `APP_ENV=production` | `APP_ENV=staging` (`APP_DEBUG=false` in both) |
| logs `/var/log/nginx/homi/<name>.*.log` | `/var/log/nginx/homi/staging-<name>.*.log` |
| media → MinIO `homi-*` buckets | → `homi-staging-*` buckets, user `homi-staging-app`; `cdn.staging.homi.uz` is served by the MinIO host from `minio-host/nginx/cdn.staging.homi.conf` (`docs/infrastructure/cdn.md`) |
| `homi-deploy production` (new migrations need `--migrate`) | `homi-deploy staging` — the same script (`infra/production/bin/homi-deploy`), migrations run without the flag |

The nginx files here were derived from the production files with name/port/path substitutions (`sed`) and then loaded by nginx (`nginx -t` OK); keep the two sets in step when one changes.
