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
| nginx + php-fpm + Node (Next.js) + Horizon | this machine (Homebrew) | `159.253.19.121` |
| PostgreSQL 18 | `127.0.0.1:5432` (Homebrew) | `5.45.127.98` (databases `homi_staging`, `homi_production`) |
| Redis | `127.0.0.1:6379` | on the app host |
| Object storage | none — `backend/storage/app/public` served by `cdn.homi.loc` (ADR-0012) | MinIO on `31.220.104.38` via `https://s3.hc.uz` (path-style, `us-east-1`) |
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
`APP_URL`, `APP_LOCALE=ru`, `APP_FALLBACK_LOCALE=ru`, `APP_TIMEZONE=UTC`, `DB_*` (pgsql), `REDIS_*`, `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`, `SESSION_DRIVER=database`, `MEDIA_PUBLIC_URL` (CDN base in every environment), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_BUCKET`, `AWS_ENDPOINT`, `AWS_USE_PATH_STYLE_ENDPOINT=true`, `AWS_URL`, `MEDIA_PRIVATE_BUCKET`, `MEDIA_TMP_BUCKET` (all `AWS_*`/bucket keys blank locally — staging/production only), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, `CORS_ALLOWED_ORIGINS`, `SANCTUM_TOKEN_EXPIRATION`, `HORIZON_*`. Collector intake tokens are issued as Sanctum tokens (ADR-0009), not env values.

Frontend (`frontend/*/.env.example`, Phase 2): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `NEXT_PUBLIC_POSTHOG_KEY`/`HOST` (if PostHog is confirmed).

## Not decided yet

- Where Next.js SSR runs in production (Node/pm2 vs static export per app) — Phase 2/6.
- Redis per environment: separate instances vs DB index — Phase 3.
- DNS ownership for `homi.uz` and `*.staging.homi.uz` — developer.
