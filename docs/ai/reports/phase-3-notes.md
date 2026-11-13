# Phase 3 — working notes (inputs gathered before the pause)

Purpose: facts collected by two read-only subagents on 2026-11-08 so the remaining Phase 3 work (CDN/webhook infra templates, Telegram pipeline, intake) starts from evidence, not memory. Nothing here was verified against live servers; "inferred" marks the subagent's inference. No secrets were read or copied. Mirror roots are the machine-local paths named `NGINX_MIRROR_CDN` (31.220.104.38) and `NGINX_MIRROR_WEB` (159.253.19.121) in `.ai/local.env`; paths below are relative to them.

## A. Production CDN / MinIO host (31.220.104.38)

### Topology
- `s3.hc.uz` — the S3 API endpoint (path-style, `MINIO_DOMAIN` unset) and an edge cache for the public buckets (`telegram-media`, `offer`, `banners`). MinIO listens on `127.0.0.1:9000` only; console on `127.0.0.1:9001` behind `cmd.hc.uz` + IP allowlist.
- `cdn.proagent.uz`, `cdn.smartagent.uz` — one domain → one public bucket, **SPA hosting** (`index.html` fallback). Not the media pattern (confirms AM-8).
- `img.elbozor.uz` serves local disk, not MinIO. `p.hc.uz` = Grafana/Prometheus/Alertmanager.
- MinIO: native binary under systemd (`minio.service`, `Type=notify`, `EnvironmentFile=/etc/minio/minio.conf`, `ReadWritePaths=/data/minio`, hardened unit), single node / single disk, `RELEASE.2025-09-07` (frozen OSS release — accepted risk in their 2026-07-09 audit), `MINIO_SERVER_URL=https://s3.hc.uz`, `MINIO_REGION=us-east-1`, `MINIO_API_REQUESTS_MAX=4096`, `MINIO_SCANNER_SPEED=slow`.
- Client tool: `mcli` with alias `s3hc`. Applications receive endpoint `https://s3.hc.uz`, region `us-east-1`, path-style.
- Buckets (as of 2026-06-22): `elmarket-pgbackrest` (private, versioned, 50 GiB), `telegram-media` / `smartagent` / `proagent` (public-read GetObject only, 50/5/5 GiB). One IAM user per bucket.

### The public-media edge-cache block to clone for `cdn.homi.uz` (`sites-available/hc/s3.hc.conf:73-99`)
```nginx
location ~* ^/telegram-media/ {
    limit_req zone=static burst=100 nodelay;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Cache-Control "public, immutable, max-age=2592000" always;
    add_header X-Cache-Status $upstream_cache_status always;
    include /etc/nginx/snippets/proxy-buffers-minio.conf;
    proxy_read_timeout 600;
    proxy_buffering on;              # required for proxy_cache (the snippet turns it off for the streaming API)
    proxy_request_buffering off;
    proxy_cache s3_cache;
    proxy_cache_valid 200 30d;
    proxy_cache_valid 404 1m;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
    proxy_cache_lock on;
    proxy_cache_lock_timeout 5s;
    proxy_cache_revalidate on;       # ETag revalidation
    proxy_ignore_headers Set-Cookie Cache-Control Expires;
    proxy_pass http://127.0.0.1:9000;
}
```
Shared pieces: `snippets/proxy-buffers-minio.conf` (`proxy_http_version 1.1`, `Connection ""`, `Host $http_host`, X-Real-IP / X-Forwarded-*, hides upstream HSTS/nosniff/XSS headers, connect 300 s / send 600 s), `snippets/s3-admin-deny.conf` (403 on `/minio/(health|v2/metrics|admin)/`), `snippets/security-headers.conf` (HSTS preload, nosniff, `X-Frame-Options DENY`, Referrer-Policy, Permissions-Policy). Cache zone in `nginx.conf:110-114`: `proxy_cache_path /var/cache/nginx/s3_cache levels=1:2 keys_zone=s3_cache:100m max_size=20g inactive=7d use_temp_path=off`. Rate-limit zones (`nginx.conf:130-140`): `api` 10 r/s, `web` 20, `static` 50, `critical` 3, `media_limit` 10, keyed by `$binary_remote_addr`. Globals: `access_log off` (vhosts set their own, `/var/log/nginx/<project>/…`), `client_max_body_size 32m`, `server_tokens off`, gzip level 5 with `gzip_proxied any`.

Dedicated-domain pattern worth copying from `cdn.proagent.conf`: `proxy_cache_key "$scheme$host$request_uri"` (shared zone, no cross-tenant collisions), `proxy_hide_header Cache-Control` + own immutable header, security snippet re-included inside every `location` (nginx `add_header` inheritance), `proxy_pass http://127.0.0.1:9000/<bucket>/…`, ACME webroot `/var/www/certbot` on the port-80 server, `proxy_intercept_errors on` because anonymous GetObject without ListBucket makes MinIO answer **403** for a missing key.

Gaps the subagent flagged (inferred): the `telegram-media` block has no `proxy_cache_key` (default key = scheme + upstream + URI); its own `add_header` lines drop the server-level X-Frame-Options/Referrer-Policy/Permissions-Policy.

### Decisions already taken on that host (reuse, do not re-litigate)
- TLS: one Let's Encrypt cert per host (no wildcard), `listen 443 ssl; listen [::]:443 ssl; http2 on;`, `include /etc/letsencrypt/options-ssl-nginx.conf; ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;` (TLS 1.2/1.3, tickets off), OCSP stapling deliberately off (ECDSA LE certs). `cdn.*` certs via ACME webroot, others via the certbot nginx plugin. Renewal deploy hook: `nginx -t && systemctl reload nginx`. Default server: 444 on :80, `ssl_reject_handshake on` on :443.
- **CORS is global in MinIO** (`MINIO_API_CORS_ALLOW_ORIGIN=*`, reflects Origin, `Vary: Origin`); per-bucket `mcli cors set` returns `NotImplemented`; nginx sets no `Access-Control-*`. Narrowing: `mcli admin config set s3hc api cors_allow_origin="https://a,https://*.b"` + `mcli admin service restart s3hc` — affects every bucket (needs the owner's OK). The `cdn-deploy-guide.md` is **stale** on this point.
- **Anonymous access = `GetObject` only** (`mcli anonymous set-json`), never the built-in `download` policy (it grants ListBucket → enumeration; closed 2026-06-17).
- No bucket event notifications (`notify_webhook`/`mcli event add`) exist anywhere → HOMI must not depend on a MinIO→Laravel webhook; the `register` step after presigned uploads (already implemented) is the right design. Audit webhook → local collector on 127.0.0.1:8899.
- Lifecycle pattern: `mcli ilm rule add s3hc/<bucket> --expire-days 30 --prefix tmp/`; off-host backup MinIO with versioning + `--noncurrent-expire-days 30`.

### Bucket onboarding (their idempotent script `server/scripts/onboard-project.sh`, dry-run unless `APPLY=1`)
```bash
mcli mb s3hc/<bucket>
mcli quota set s3hc/<bucket> --size 50GiB
mcli admin policy create s3hc <bucket>-rw <policy.json>     # rw | ro | wo variants
mcli admin user add s3hc <bucket>-app "$(openssl rand -hex 20)"   # secret shown once, never stored
mcli admin policy attach s3hc <bucket>-rw --user <bucket>-app
mcli anonymous set-json <anon.json> s3hc/<bucket>            # public-read buckets only
```
```json
// <bucket>-rw
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::<bucket>"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],"Resource":["arn:aws:s3:::<bucket>/*"]}]}
// anonymous public-read (no ListBucket)
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::<bucket>/*"]}]}
```
HOMI plan derived from this (for `docs/infrastructure/cdn.md` + `infra/server/minio/provision.sh`, to be run by the developer with `APPLY=1`): buckets `homi-public` (anon GetObject), `homi-private`, `homi-tmp` (+ `homi-staging-*`), users `homi-app` / `homi-staging-app` with rw policies scoped to their three buckets, ilm `--expire-days 1` on `homi-tmp`, quotas to agree with the owner. `cdn.homi.uz` vhost = dedicated-domain edge cache in front of `homi-public` only (`proxy_pass http://127.0.0.1:9000/homi-public/`), immutable cache for `originals/` and `derived/`, 403→404 mapping, no SPA fallback, no private bucket exposure.

## B. Production web host (159.253.19.121) — conventions for `api.homi.uz`, `hook.homi.uz`, Next apps
- Debian 12, nginx 1.30.x, PHP 8.5 via `fastcgi_pass unix:/run/php/php8.5-fpm.sock` (elbozor/gram on 8.4), `fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name`, fastcgi buffers 64k/32×32k, timeouts 10s/30s/30s, `fastcgi_keep_conn on`; `client_max_body_size 50m` for APIs; per-host LE certs ("managed by Certbot"); HSTS `includeSubDomains`; dotfiles denied; static assets `expires 30d` immutable; Laravel API example `app/api.app.conf` (answers only the OPTIONS preflight in nginx via an internal `/cors-preflight` location — real CORS headers come from Laravel; `fastcgi_param HTTP_APP api` tags the vhost).
- Only Node reverse proxy on the host: `agentim/demo.agentim.conf` → `next start -p 3021` behind `upstream … keepalive 32`, `/_next/static/` served from disk as immutable 1y, everything else `try_files $uri @next`, `X-Forwarded-Proto/Host`, `proxy_read_timeout 90s`, logs `/var/log/nginx/<project>/{access,error}.log`. Most other `app.*`/`arm.*` vhosts are static builds — HOMI's three Next apps need the proxy pattern (SSR) or a static export decision (open question since Phase 1).
- `cdn.app.uz` (the reference app) serves `backend/storage/app/public` from disk with `Access-Control-Allow-Origin *` and 1y immutable — the same shape HOMI uses locally (ADR-0012).

## C. `app.uz` sources fetched for porting (catalogue A4/A5/A6, B2/B3)
Verbatim dump (2063 lines, 14 items) was written to the session scratchpad `appuz-port-sources.txt`; it is temporary — re-run the read-only fetch if missing. Port caveats recorded by the subagent:
- `HashedUploader`/`GenerateImageVariantsJob` depend on app.uz `BucketDiskFactory` (DB-driven buckets) → HOMI uses plain disks via `config/media.php` (**already done**, implemented from the catalogue spec with TDD; S3 conditional PUT `If-None-Match: *` from app.uz is not used — `exists()` check instead).
- Gramir `webhook_events` migration's pgsql CHECK allowed only `meta|pay`; `telegram_bot` and `crm`/`ignored` were added by later migrations → HOMI's `telegram_updates` table has no provider CHECK (already migrated).
- `getWebhookInfo` is not in `TelegramChannel`; it lives in `app/Services/Qulay/Telegram/BotApi.php:163`.
- Middleware depends on `GramirResponse` and `Account.credentials['webhook_secret']` → HOMI reads the secret from `config('telegram.webhook.secret')`.
- app.uz `configureRateLimiting` is ~320 lines / ~50 limiters; only `api`, `api-login`, `uploads`, `bot-webhook`, `smartagent-tg-auth`, `gramir-webhook` were fetched (HOMI's four limiters already defined).
- Test fixtures in the dump (`'super-secret-32-bytes-min-token'`, `'t:ok'`, `'sec'`) are fake values, not secrets. Docblocks are Russian → rewrite in English when porting.

## D. Development track, 2026-11-09 — kvadro² migration audit and plan

The developer set a new goal for the development track: move the running product kvadro² onto HOMI. The master prompt is kept local as `writing-block.md` and is not committed (machine paths). The remaining Phase 3 work (T1 webhook, T2 intake, T3 OpenAPI, T4 close + ADR-0014) is kept and extended by the migration tasks. The mapping is in `docs/migration/10-target-architecture.md` §9.

Status:
- **Applied** on branch `docs/kvadro-migration-audit`, PR #9, not merged:
  - `docs/migration/`: the audit, the plan (01–23), 383 task files and the registers in `data/`;
  - `scripts/migration/`: the ID, open-question and task-graph checks. They are written in Python 3 with the standard library only, so they need no new dependency.
- **Not applied:**
  - no application code;
  - the `HANDOFF.md` §4 changes (`10` §9);
  - the plan's ADRs: KV-BE-001, KV-DB-004, KV-DB-005, KV-BE-120;
  - the guard key for the legacy tree (KI-26);
  - the Media ownership fix (KI-25, task KV-BE-002).

Developer decisions (2026-11-09):
- Audit the legacy product and write the full plan before any migration code. The legacy tree is read-only: «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.»
- «в homi.uz мы будем исправлят старые ошибки и логические не верные решение». This became the migration policy in `docs/migration/README.md`: parity covers capabilities, data and public links, and every behaviour change is a DEV item that needs approval. No separate ADR was written; the plan's ADR tasks above carry the policy.
- «да, закоммить и открой PR, writing-block.md не коммить». Done as `b6aa0e6`, PR #9.

ASSUMPTION_MISMATCH AM-44 (2026-11-09):
- **Assumption.** ADR-0009 and `.ai/memory/current-state.md` (Collectors) assume collectors push listings into HOMI's intake.
- **What was found** (reported by `reference-reader`, not re-run):
  - `telegram.uz` offers only a pull API (`/api/public/v1/listings`) and pushes nothing to HOMI;
  - its production use is not confirmed;
  - `geo.uz` is not a housing source;
  - none of the collectors mentions kvadro.
- **Resolution.** Recorded as CF-007 / DEC-02 in `docs/migration/10`: our own channel reader first, `telegram.uz` after a side-by-side run. ADR-0009 stays unchanged until DEC-02 is answered.

ASSUMPTION_MISMATCH AM-45 (2026-11-09):
- **Assumption.** The migration docs were written before PR #8 landed. They assumed nothing was deployed and used the ADR-0011 database names `homi_staging` / `homi_production`.
- **What PR #8 brought:**
  - live staging and production, with the databases `homi_db` / `homi_staging_db`;
  - Redis DB indexes on a shared instance;
  - Horizon units;
  - `homi-deploy`.
- **Resolution, before the commit:**
  - names corrected;
  - DEC-27 recorded as answered;
  - reconciliation notes added to KV-INF-015, KV-INF-019 and KV-INF-023;
  - `collect_ids.py --check` and `task_graph.py --check` re-run, exit 0.
