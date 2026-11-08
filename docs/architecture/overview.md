# Architecture overview

Purpose: the one page that explains how HOMI is put together. Details live in ADRs (`decisions/`) and per-area docs. Status: Phase 1 baseline — no product code exists yet; this describes the agreed target.

## System context

```text
                 Telegram users                     Team (admins, data stewards)
                 ┌───────────────┐                  ┌──────────────┐
  Telegram ──▶   │ Mini App / Web│ ──▶ app.homi.uz  │ arm.homi.uz  │
  Bot API  ◀──▶  │   (Next.js)   │                  │  (Next.js)   │
                 └──────┬────────┘                  └──────┬───────┘
                        │ bearer token (ADR-0003)          │
                        ▼                                  ▼
   homi.uz (landing) ──▶  api.homi.uz  ◀── hook.homi.uz (Telegram webhooks, collector pushes)
                           Laravel 13 API + Horizon workers (Redis)
                           │            │              │
                           ▼            ▼              ▼
                     PostgreSQL 18   MinIO (S3)     AI provider (via laravel/ai, TBD)
                                     cdn.homi.uz

   Collectors (outside this repo) ──push──▶ api/hook (ADR-0009):
     telegram.uz  — Telegram channels (MadelineProto)
     geo.uz       — web sources (OLX, Uybor, …)
     datahub.uz   — dedup/canon platform (intake not built yet)
```

HOMI **owns its listing database**. It does not scrape or read other systems' databases; collectors push normalised listings through an authenticated, idempotent intake API. Deduplication across sources is HOMI's responsibility until `datahub.uz` provides canonical properties, at which point datahub becomes one more (higher-trust) pusher.

## Containers

| Container | Tech | Hosts (prod) | Notes |
|---|---|---|---|
| `landing` | Next.js 16 (App Router, mostly static/SSG) | `homi.uz` | SEO pages, price indices, waitlist |
| `app` | Next.js 16 (SSR + client), PWA, Telegram Mini App | `app.homi.uz` | feed, map, filters, favourites, radar |
| `arm` | Next.js 16 | `arm.homi.uz` | moderation, sources, stats, users |
| `api` | Laravel 13 / PHP 8.5, php-fpm behind nginx | `api.homi.uz`, `hook.homi.uz` | `/api/v1`, webhooks, intake |
| `worker` | Horizon (Redis) | same host | ingest, media, notifications, bot queues |
| `db` | PostgreSQL 18 | `5.45.127.98` | `timestamptz`, `jsonb` translations |
| `object storage` | MinIO via `s3.hc.uz` | `31.220.104.38` | public bucket → `cdn.homi.uz`; private bucket → presigned URLs |
| `cache/queue` | Redis | app host | ADR-0005 |

Shared frontend code: `frontend/packages/{ui,api-client,types,utils,config}` (pnpm workspace, ADR-0004); `api-client` and `types` are generated from the OpenAPI spec (ADR-0007).

## Backend module boundaries

Modules are namespaces inside one Laravel app (no microservices). A module may depend on the ones listed; anything else goes through events or explicit service interfaces. Enforced later by Pest architecture tests.

| Module | Owns | Depends on |
|---|---|---|
| **Identity** | users (telegram_id, locale, currency), tokens, Telegram hash verification, abilities | — |
| **Geo** | regions, districts (jsonb names), geocoding helpers, map tiles config | — |
| **Listings** | listings, listing sources (channel/post refs), photos metadata, status (active/hidden/rented), owner/realtor flag, below-market flag | Geo, Media |
| **Intake** | authenticated push endpoints for collectors, payload validation, idempotency keys, normalisation, dedup heuristics, source trust | Listings, Geo |
| **Media** | upload/presign, variants (WebP), public/private disks, cleanup | — |
| **Pricing & Stats** | medians per district/rooms/currency, monthly indices, CSV exports, below-market computation | Listings, Geo |
| **Radar & Notifications** | saved filters, matching on new listings, Telegram delivery, digests | Listings, Identity, Bot |
| **Bot** | Telegram Bot API client, webhook intake + dedup `(bot_id, update_id)`, command handlers, Mini App bridge | Identity |
| **Admin (ARM API)** | moderation queues, source management, stats for the team, role checks | all read-side |
| **AI** | provider-agnostic calls (classification, query parsing, translation) via `laravel/ai` | — |

## Listing data flow

1. Collector sends `POST /api/v1/intake/listings` (bearer token with `intake:*` ability, `Idempotency-Key`, source id, payload with raw text, parsed fields, photos as URLs or pre-uploaded object keys).
2. Intake validates, stores the raw payload + normalised record in one transaction, returns 202 with the HOMI listing id; duplicate idempotency key → 200 with the same id.
3. Queue (`ingest`): dedup heuristics (phone hash, text shingles, photo hashes) link the record to an existing property or create a new one; Media job fetches/derives WebP variants into the public bucket.
4. Listing becomes visible in the feed; Pricing recomputes affected district medians; Radar matches saved filters and queues Telegram notifications.
5. Users mark "already rented"/report → status changes propagate to stats and radar.

## Cross-cutting rules

- API: `/api/v1`, success/error envelope, opaque ids, Resources only (ADR-0007).
- Time UTC / display `Asia/Tashkent`; locales ru/uz/en; prices in minor units with explicit currency, default UZS (ADR-0006).
- Secrets only in server-side `.env`; agents read `.env.example` (master prompt §15.4).
- Observability baseline: Pulse, Telescope (non-prod), structured logs with request id, Horizon metrics (master prompt §17).

## Open architecture questions

- Dedup algorithm and thresholds (text + phone + photo) — product input needed before Intake is implemented.
- Whether `datahub.uz` canon replaces HOMI's own dedup later (ADR-0009 pending collector audit).
- Real-time web updates (Reverb) vs Telegram-only notifications.
- Search: PostgreSQL full-text vs Scout driver — measure first.
