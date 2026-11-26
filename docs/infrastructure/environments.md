# Environments

Purpose: the single table of domains, hosts, ports and services per environment. Secrets and credentials are never written here — only variable **names**.

## Domain matrix

| Role | Local | Staging | Production | Serves |
|---|---|---|---|---|
| Landing | `https://homi.loc` | `https://staging.homi.uz` | `https://homi.uz` | `frontend/landing` |
| App | `https://app.homi.loc` | `https://app.staging.homi.uz` | `https://app.homi.uz` | `frontend/app` |
| Admin | `https://arm.homi.loc` | `https://arm.staging.homi.uz` | `https://arm.homi.uz` | `frontend/arm` |
| API | `https://api.homi.loc` | `https://api.staging.homi.uz` | `https://api.homi.uz` | `backend` (`/api/v1`) |
| CDN (public media) | `https://cdn.homi.loc` | `https://cdn.staging.homi.uz` | `https://cdn.homi.uz` | MinIO public bucket via nginx |
| Hooks (third-party webhooks) | `https://hook.homi.loc` | `https://hook.staging.homi.uz` | `https://hook.homi.uz` | `backend` (Telegram webhook route group only) |

`hook.*` is a second vhost in front of the same Laravel app, restricted to third-party webhook routes (Telegram Bot API; no `/api/v1` browsing). First-party collectors (`telegram.uz`, `geo.uz`, `datahub.uz`) push to `api.*` under `/api/v1/intake/*` with their own tokens (ADR-0009). Telegram cannot reach `.loc`; local webhook tests use the dev bot plus an HTTPS tunnel when needed.

## Hosts (ADR-0011)

| Component | Local | Staging / Production |
|---|---|---|
| nginx + php-fpm + Node (Next.js) + Horizon | this machine (Homebrew) | `159.253.19.121` — production and staging live since 2026-11-09 (`/var/www/homi.uz` with Next SSR on `127.0.0.1:3100–3102`; `/var/www/staging.homi.uz` on `3200–3202`; one Horizon unit each; `docs/infrastructure/deployment.md`) |
| PostgreSQL 18 | `127.0.0.1:5432` (Homebrew) | `5.45.127.98:5432` — databases `homi_db` (production) and `homi_staging_db` (staging), each owned by a same-named role; `pg_hba` and both firewalls admit only `159.253.19.121`; `DB_SSLMODE=disable` (developer decision 2026-11-09); set up 2026-11-09, see `docs/ai/reports/production-notes.md` §2 |
| Redis | `127.0.0.1:6379` | on the app host, `127.0.0.1:6379`, shared with other projects (they use DB 0–2). HOMI uses DB indexes (decided 2026-11-09): production `REDIS_DB=3` / `REDIS_CACHE_DB=4`, staging 5 / 6. The instance has no `maxmemory` and the default `noeviction` policy, and persists through RDB snapshots only, with AOF off (checked 2026-11-12, `production-notes.md` §8). HOMI never runs `CONFIG SET` on it |
| Object storage | none — `backend/storage/app/public` served by `cdn.homi.loc` (ADR-0012) | MinIO on `31.220.104.38` via `https://s3.hc.uz` (path-style, `us-east-1`); live since 2026-11-13, users `homi-app` / `homi-staging-app`, the `.env` values are in `docs/infrastructure/cdn.md` |
| Telegram bots | dev bot | staging bot / production bot (all three exist) |

## Local port plan

| Port | Service | Note |
|---|---|---|
| 80/443 | nginx | 80 redirects to 443 |
| 9000 | php-fpm | shared with other local projects |
| 3000 / 3001 / 3002 | Next dev: landing / app / arm | HMR proxied by nginx |
| 5432, 6379 | PostgreSQL, Redis | Homebrew services |
| 8000, 8001 | **taken** by HTTP Toolkit | never use `php artisan serve` defaults |

## Buckets and prefixes (staging / production)

Locally the same key layout (`originals/`, `derived/`, …) lives on disk under `backend/storage/app/public` (ADR-0012); the `media_private` disk is `storage/app/private`.

| Bucket | Access | Content |
|---|---|---|
| `homi-public` (`homi-staging-public`) | anonymous `GetObject` via `cdn.*` | listing photos and WebP variants, public assets |
| `homi-private` (`homi-staging-private`) | presigned URLs only, never cached by nginx | documents, exports, anything user-restricted |
| `homi-tmp` | short-lived presigned PUT targets | raw uploads before processing; lifecycle rule deletes after 24 h |

## Environment variables (names)

Backend (`backend/.env.example` is the authoritative list; `dev:check` compares keys):
`APP_URL`, `APP_LOCALE=ru`, `APP_FALLBACK_LOCALE=ru`, `APP_TIMEZONE=UTC`, `DB_*` (pgsql; `DB_SSLMODE` is `disable` on staging and production by the developer's decision of 2026-11-09 — without it libpq's default `prefer` negotiates TLS because the server has `ssl on`), `REDIS_*`, `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`, `SESSION_DRIVER=database`, `MEDIA_PUBLIC_URL` (CDN base in every environment), `MEDIA_PUBLIC_DISK`, `MEDIA_PRIVATE_DISK`, `MEDIA_TMP_DISK`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_ENDPOINT`, `AWS_USE_PATH_STYLE_ENDPOINT=true`, `MEDIA_PUBLIC_BUCKET`, `MEDIA_PRIVATE_BUCKET`, `MEDIA_TMP_BUCKET` (all `AWS_*`/bucket keys blank locally — staging/production only), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_SUPPORT_USERNAME` (public name of the support account, blank = none; WP-11), `TELEGRAM_INITDATA_MAX_AGE` (`config/telegram.php`; seconds a Mini App launch value is accepted at sign-in, blank = 3 600; WP-40), `CORS_ALLOWED_ORIGINS`, `SANCTUM_TOKEN_PREFIX` (`config/sanctum.php`; `homi_` everywhere; WP-40), `TRUSTED_PROXIES` (`config/trustedproxy.php`; comma-separated addresses the Next servers reach the API from — loopback and/or the app host's address — so the per-address limiters see the client; blank = trust nobody; WP-40), `ACCESS_MODE` (`config/access.php`; `private` \| `invite` \| `open`, blank = `private`, `open` locally and on the servers; WP-40, DEC-43), `ACCESS_MAX_SEATS` (admitted users in open mode, blank = no limit; WP-40), `ACCESS_OWNER_TELEGRAM_IDS` (comma-separated Telegram ids always let in; WP-40), `ACCESS_PAUSED` (`true` answers every sign-in and bearer method `403` reason `paused`, team accounts pass; unset on the servers unless a pause is needed; WP-40, DEC-60, DEC-106), `RATE_LIMIT_LISTING_OPENS_PER_DAY` (`config/rate_limits.php`; distinct full cards per user in 24 h, blank = 100; WP-40, DEC-104 … DEC-107; the other limiter values are in that file), `TELESCOPE_RECORD_ALL` (`config/telescope.php`; outside local only failures are recorded unless `true`), `SOURCES_ALLOW_STUB` (`config/sources.php`; `true` lets a source rule or a default name the `stub` driver; WP-10, turned off on production by WP-48), `SOURCES_NATIVE_STUBS` (`config/sources.php`; `true` answers the methods whose native bodies replaced stubs from the fixtures, for the e2e suite and the Telegram emulator; only with `APP_ENV` `local` or `testing`, the API refuses to boot with it elsewhere; unset on the servers; WP-40), `LEGACY_API_URL`, `LEGACY_SERVICE_KEY` (`config/legacy.php`, WP-41; **staging and production only**, once the operator has issued the key — never locally, in CI or in the repository; blank key = the legacy driver answers `503`, never an anonymous call), `LEGACY_AUTH_HEADER`, `LEGACY_AUTH_PREFIX` (quoted when it ends in a space, `"Bearer "`), `LEGACY_LOCALE_VIA`, `LEGACY_LOCALE_NAME`, `LEGACY_CURRENCY_VIA`, `LEGACY_CURRENCY_NAME`, `LEGACY_RATE_PER_SECOND` (all blank = the defaults built without the operator's answer, WP-02: `X-Service-Key`, no prefix, `Accept-Language`, no currency, 5 a second), `LEGACY_FAKE` (blank = on in `local` and `testing`, off elsewhere; the API refuses to boot with it in production; leave it unset on the servers), `RADAR_CREATION_ENABLED` (`config/radar.php`; `true` locally and in the tests, **unset** on staging and production until WP-57, DEC-51), `OWNER_CABINET_ENABLED` (`config/owner.php`; `true` locally and in the tests, **unset** on staging and production until DEC-81's gates; blank or unset = off; WP-80), `OWNER_CABINET_ALLOWED_IDS` (comma-separated Telegram ids allowed to create, request a phone and publish while set; blank = none; WP-84), `OWNER_LISTINGS_PUBLIC` (native listings in the feed; blank or unset = on, only `false` turns it off; WP-86). Phase 3 removed `AWS_BUCKET`, `AWS_URL` and `SANCTUM_TOKEN_EXPIRATION` (a global expiry would kill collector tokens; expiry is set per token). Collector intake tokens are issued as Sanctum tokens (ADR-0009), not env values.

Frontend (`frontend/*/.env.example`, Phase 2): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `NEXT_PUBLIC_POSTHOG_KEY`/`HOST` (if PostHog is confirmed).

## Not decided yet

- ~~Where Next.js SSR runs in production~~ — decided: SSR (`next start`) behind nginx, ports 3100–3102 (staging 3200–3202), ADR-0013; vhost templates and process manager in Phase 6.
- ~~Redis per environment: separate instances vs DB index~~ — decided 2026-11-09 (production track): DB indexes on the host's shared instance — production `REDIS_DB=3` / `REDIS_CACHE_DB=4`, staging 5 / 6, distinct `REDIS_PREFIX`.
- DNS ownership for `homi.uz` and `*.staging.homi.uz` — developer. As of 2026-11-13 `cdn.homi.uz` and `cdn.staging.homi.uz` are explicit A records → `31.220.104.38`, and the rest resolves to `159.253.19.121`. Each staging name has its own explicit A record (`staging`, `app.staging`, `api.staging`, `arm.staging`, `hook.staging`), because the explicit `cdn.staging` record shadows the `*.homi.uz` wildcard below `staging.homi.uz` (AM-46, `cdn.md` "DNS"). There is no `*.staging` wildcard, so a new staging subdomain needs its own record.
