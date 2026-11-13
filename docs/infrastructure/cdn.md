# Media storage and CDN (staging and production)

Purpose: where HOMI's media lives on staging and production, how it is delivered, and how to check, purge, rotate or roll it back. The production track owns this file; the development track reads it (`docs/handoff/parallel-work.md` §1). Locally there is no MinIO: media sits on disk behind `https://cdn.homi.loc` (ADR-0012). History and evidence: `docs/ai/reports/production-notes.md` §14.

## Overview

| | Production | Staging |
|---|---|---|
| Public media URL (`MEDIA_PUBLIC_URL`) | `https://cdn.homi.uz` | `https://cdn.staging.homi.uz` |
| Buckets (public / private / tmp) | `homi-public` / `homi-private` / `homi-tmp` | `homi-staging-public` / `homi-staging-private` / `homi-staging-tmp` |
| MinIO user and policy | `homi-app`, `homi-app-rw` | `homi-staging-app`, `homi-staging-app-rw` |
| Secret of that user | `/root/.homi-secrets/s3-app-production.secret` on the app host (0600) | `/root/.homi-secrets/s3-app-staging.secret` |
| CDN vhost | `/etc/nginx/sites-available/homi/cdn.homi.conf` on `31.220.104.38` | `…/homi/cdn.staging.homi.conf` |
| TLS | Let's Encrypt ECDSA, webroot `/var/www/certbot` on the MinIO host, renewed by its certbot timer; first expiry 2027-02-11 | same |

- **MinIO.** It runs on the MinIO host `31.220.104.38` (ADR-0011). The host is shared with other projects. Version `RELEASE.2025-09-07`, single node, single disk (`/data/minio` on `/`). The S3 endpoint is `https://s3.hc.uz` (path-style, region `us-east-1`).
- **Application writes.** The application writes through the S3 API as its environment's user.
- **Browser reads.** Browsers read public media through the CDN vhost.
- **Private media.** Private media is read only through presigned `temporaryUrl`s on `s3.hc.uz`, valid for 10 minutes (`MEDIA_TEMPORARY_URL_MINUTES`).
- **Browser uploads.** Browsers upload with a presigned `PUT` to `s3.hc.uz/<tmp bucket>/uploads/<user id>/…`. The `register` call then validates and re-encodes the file into an original (`PresignController`). MinIO's CORS is global on that host (`cors_allow_origin=*`), so nothing per bucket is needed.

Reviewed copies of every file: `infra/production/minio-host/` and `infra/staging/minio-host/` (nginx vhost, user policy, anonymous policy). They are kept out of `infra/<env>/nginx/` on purpose: `homi-deploy`'s drift check compares that folder with the app host.

## Bucket rules

| Bucket | Versioning | Lifecycle (ILM) | Anonymous access | Quota |
|---|---|---|---|---|
| `*-public` | on | noncurrent versions expire after **30 days**; expired delete markers are removed | `s3:GetObject` only (no listing), from `*-public-anonymous.json` | none |
| `*-private` | on | the same as public | none | none |
| `*-tmp` | off | current objects expire after **1 day** | none | none |

The developer decided this on 2026-11-13:
- **No quotas.** The disk is the limit, and `HomiMinioDiskLow` / `HomiMinioDiskCritical` alert in the HOMI chat (`monitoring.md`).
- **Versioning for 30 days.** A deleted or overwritten object in public or private can be restored for 30 days, which also covers a wrong delete through the API (KI-25). A restore: `mcli ls --versions s3hc/<bucket>/<key>`, then `mcli cp --version-id <id> s3hc/<bucket>/<key> s3hc/<bucket>/<key>`.

The user policies (`homi-app-rw`, `homi-staging-app-rw`) allow, on the environment's three buckets only, `GetBucketLocation`, `ListBucket` and `ListBucketMultipartUploads`, plus `GetObject`, `PutObject`, `DeleteObject`, `AbortMultipartUpload` and `ListMultipartUploadParts` on their objects. Neither user can reach the other environment, `homi-backups` or any other project's bucket, and neither can create buckets (tested 2026-11-13).

Each public bucket holds `_probe/ok.txt` (3 bytes, `ok\n`). It is the external probe's target, so do not delete it.

## Application settings

The keys are in each environment's `backend/.env`, and their values are not secret except the key itself:

| Key | Production | Staging |
|---|---|---|
| `MEDIA_PUBLIC_DISK` / `MEDIA_PRIVATE_DISK` / `MEDIA_TMP_DISK` | `s3_public` / `s3_private` / `s3_tmp` | same |
| `AWS_ACCESS_KEY_ID` | `homi-app` | `homi-staging-app` |
| `AWS_SECRET_ACCESS_KEY` | the secret file above (48 hex characters) | the staging secret file |
| `AWS_DEFAULT_REGION`, `AWS_ENDPOINT`, `AWS_USE_PATH_STYLE_ENDPOINT` | `us-east-1`, `https://s3.hc.uz`, `true` | same |
| `MEDIA_PUBLIC_BUCKET` / `MEDIA_PRIVATE_BUCKET` / `MEDIA_TMP_BUCKET` | `homi-public` / `homi-private` / `homi-tmp` | `homi-staging-*` |
| `MEDIA_PUBLIC_URL` | `https://cdn.homi.uz` | `https://cdn.staging.homi.uz` |

There is no config cache (`bootstrap/cache/config.php` does not exist), so php-fpm reads a changed `.env` on the next request. Horizon keeps its configuration until it restarts: after a change run `sudo -u www-data php artisan horizon:terminate` in that `backend/`. systemd starts the new master.

## What the CDN vhost does

- `/originals/…` and `/derived/…`: content-addressed keys (`config/media.php`), `Cache-Control: public, max-age=31536000, immutable`, edge cache 30 days in the host's shared `s3_cache` zone.
- Any other key in the public bucket: `public, max-age=3600`, edge cache 1 hour.
- `/_probe/ok.txt`: `no-store` and never cached, so the probe reaches MinIO every time.
- A missing key (MinIO answers 404, or 403 when the request is not covered by the policy) becomes a plain nginx 404 with `max-age=60`, so no MinIO XML reaches the client. `/` is a 404.
- Only `GET` and `HEAD` are allowed; anything else is a 404.
- Query strings are not forwarded and not part of the cache key (no cache busting, no `?versionId` or other S3 sub-resources). The cache key carries the host, because the zone is shared with other tenants.
- `/minio/…` → 403. The private and tmp buckets are not reachable through this vhost.
- Every response carries the host's security headers (HSTS preload, `nosniff`, `X-Frame-Options DENY`, …). Staging also adds `X-Robots-Tag: noindex, nofollow`, like every `*.staging.homi.uz` host.
- Logs: `/var/log/nginx/homi/cdn{,.staging}.{access,error}.log`, rotated by the host's `/etc/logrotate.d/nginx-vhosts.conf`.

## Checks

From anywhere:

```bash
curl -sI https://cdn.homi.uz/_probe/ok.txt          # 200, cache-control: no-store
curl -sI https://cdn.staging.homi.uz/_probe/ok.txt  # 200, x-robots-tag: noindex, nofollow
```

On the MinIO host:

```bash
mcli ls s3hc | grep homi                     # 6 media buckets + homi-backups
mcli du s3hc/homi-public s3hc/homi-private s3hc/homi-tmp
mcli ilm rule ls s3hc/homi-public            # 30-day noncurrent rule + delete-marker rule
mcli anonymous get-json s3hc/homi-public     # GetObject on homi-public/* only
mcli admin user info s3hc homi-app           # policy homi-app-rw
```

As the application user, on the app host (the alias comes from the environment, so nothing is written to `~/.mcli`):

```bash
export MC_HOST_homiapp="https://homi-app:$(cat /root/.homi-secrets/s3-app-production.secret)@s3.hc.uz"
mcli ls homiapp/homi-public/      # works
mcli ls homiapp/homi-backups/     # Access Denied
```

The external probes and the disk alerts are described in `docs/infrastructure/monitoring.md`.

## Purge one object from the edge cache

The edge cache keeps an immutable object for 30 days, even after it was deleted in MinIO. To drop one entry, run this on the MinIO host. `<key>` is the path without the leading slash:

```bash
H=cdn.homi.uz; K='originals/<sha256>.jpg'
k=$(printf '%s' "https$H/$K" | md5sum | cut -d' ' -f1)
rm -f "/var/cache/nginx/s3_cache/${k: -1}/${k: -3:2}/$k"
```

A request that is already being served can still get the old file once, because the worker holds the file open. That happened once on 2026-11-13, and the next request got the 404.

## Rotate the application secret

1. On the app host: `umask 077; openssl rand -hex 24 > /root/.homi-secrets/s3-app-<env>.secret`.
2. Pipe it to the MinIO host, so it never appears in a chat or a log:
   ```bash
   ssh root@159.253.19.121 'cat /root/.homi-secrets/s3-app-<env>.secret' \
     | ssh root@31.220.104.38 'read -r s; mcli admin user add s3hc <user> "$s" >/dev/null && echo updated'
   ```
3. On the app host, write it into the environment's `.env` with `sed -i "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$(cat …secret)|"`, then run `horizon:terminate` (see "Application settings").

## DNS

- `cdn.homi.uz` and `cdn.staging.homi.uz` are explicit A records → `31.220.104.38`; every other HOMI name points at the app host `159.253.19.121`.
- **Pitfall (AM-46).** Until 2026-11-13 the staging names had no records of their own: `*.homi.uz` covered them.
  - The explicit `cdn.staging.homi.uz` record made `staging.homi.uz` an existing, empty node. A wildcard does not apply below an existing node (RFC 4592).
  - So `staging.homi.uz` answered with no address, and `app.`, `api.`, `arm.` and `hook.staging.homi.uz` answered NXDOMAIN.
  - The fix is two explicit records: `staging.homi.uz A 159.253.19.121` and `*.staging.homi.uz A 159.253.19.121`. The explicit `cdn.staging` record still wins over that wildcard.
  - The zone's negative TTL is 3600 s, so resolvers can keep a cached NXDOMAIN for up to an hour.
- The developer owns DNS (panel of fastdns24 / fastvps).

## Not covered

- **No backup of the media buckets.** `homi-backup` copies the databases and `storage/app` only.
  - Versioning protects against a delete for 30 days. It does not protect against losing the single MinIO disk or host.
  - This is the open "second off-host copy" item (`production-notes.md` "Resume here").
- **Presigned `PUT` does not bind the content type.** The URL signs only the `Host` header, so a client can upload any `Content-Type`. `register` reads the bytes, validates the image and re-encodes it, so the stored original is safe. A note for the development track.
- **SVN on the MinIO host.** `/etc/nginx` there is an SVN working copy (`file:///var/repository/server.uz`). `sites-available/homi/` is `svn add`ed but not committed. The symlinks in `sites-enabled/` are not versioned on that host.

## Rollback

1. **Application, both environments.** Restore the previous values of the 11 keys with `sed -i`:
   - `MEDIA_PUBLIC_DISK=public`, `MEDIA_PRIVATE_DISK=local`, `MEDIA_TMP_DISK=tmp`;
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT` and the three `MEDIA_*_BUCKET` keys empty;
   - region `us-east-1`, path style `true`.
   - Then run `horizon:terminate`.
   - Media written to MinIO in the meantime is then no longer reachable through the application.
2. **CDN vhosts.** Remove the two symlinks in `/etc/nginx/sites-enabled/`, run `nginx -t` and reload. `certbot delete --cert-name cdn.homi.uz` and `--cert-name cdn.staging.homi.uz` remove the certificates.
3. **MinIO.** Remove buckets and users only with the developer's go, because that deletes media.
   - Commands: `mcli rb --force s3hc/<bucket>`, `mcli admin user remove s3hc <user>`, `mcli admin policy remove s3hc <policy>`.
4. **Monitoring.** Restore `/root/.homi-backups/20261113/{prometheus.yml,homi.rules.yml}.bak-20261113b-homi` on the MinIO host, run `promtool check config`, then `systemctl reload prometheus`.
