# infra/production — what runs on the production web host

Copies of the files that live on `159.253.19.121` (ADR-0011), owned by the production track (`docs/handoff/parallel-work.md` §1). The server is the running instance; this directory is the reviewed source. Change here first, then copy to the server, `nginx -t`, reload (runbook: `docs/infrastructure/deployment.md`). History of how they got there: `docs/ai/reports/production-notes.md`.

| File here | On the server | Role |
|---|---|---|
| `nginx/api.homi.conf` | `/etc/nginx/sites-available/homi/api.homi.conf` → symlink in `sites-enabled/` | `https://api.homi.uz` — Laravel API over `php8.5-fpm.sock`; `/up`, dashboards |
| `nginx/hook.homi.conf` | same folder | `https://hook.homi.uz` — only `/telegram/*` and `/up`; everything else 404 |
| `nginx/homi.conf` | same folder | `https://homi.uz` (+ `www` → apex) — proxy to Next `landing` on `127.0.0.1:3100` |
| `nginx/app.homi.conf` | same folder | `https://app.homi.uz` — proxy to Next `app` on `127.0.0.1:3101` |
| `nginx/arm.homi.conf` | same folder | `https://arm.homi.uz` — proxy to Next `arm` on `127.0.0.1:3102`, `X-Robots-Tag: noindex` |
| `systemd/horizon-homi.service` | `/etc/systemd/system/` | Horizon queue supervisor, `User=www-data` |
| `systemd/homi-next-{landing,app,arm}.service` | `/etc/systemd/system/` | `next start -H 127.0.0.1 -p 310x` with `/opt/node26/bin/node`, `User=www-data` |

Conventions these files follow (the host's own `/etc/nginx/CLAUDE.md`): one folder per application under `sites-available/`, flat symlinks in `sites-enabled/`, a `listen 80` server that answers ACME challenges from `/var/www/letsencrypt` and redirects everything else to HTTPS, Let's Encrypt certificates per host name under `/etc/letsencrypt/live/<name>/` (webroot renewal; the host's global deploy hook reloads nginx), php-fpm over the shared Unix socket, logs under `/var/log/nginx/homi/`.

Not in this directory on purpose: `backend/.env` and `frontend/*/.env.local` (server-only; key names in `docs/infrastructure/environments.md`), certificates, the deploy key. `cdn.homi.uz` is not an nginx vhost on this host — media goes to MinIO on `31.220.104.38` (ADR-0011; not provisioned yet).

Staging (`*.staging.homi.uz`, ports 3200–3202, database `homi_staging_db`, Redis DB 5/6) runs on the same host from `/var/www/staging.homi.uz`; its files are the staging-named twins of these in `infra/staging/`.
