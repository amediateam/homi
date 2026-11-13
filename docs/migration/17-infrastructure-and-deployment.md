# 17 — Infrastructure and deployment for the migration

Part of the kvadro² → HOMI migration audit (rules, labels and ID scheme: [`README.md`](README.md)). The architecture
decisions this document serves are in [`10-target-architecture.md`](10-target-architecture.md) (parts 3–6, `DEC-NN`
in §8); the cut-over itself is in [`18-release-and-rollback.md`](18-release-and-rollback.md).

- **Status:** design, 2026-11-09. Everything here is `PROPOSED`. Written before the production track's PR #8: since
  2026-11-09 HOMI's own staging and production run on the web host (checkouts of `main`, the `homi-deploy` script,
  Next SSR and Horizon under systemd, Let's Encrypt for the HOMI hosts; `docs/infrastructure/deployment.md`,
  `docs/infrastructure/environments.md`, `infra/{production,staging}/`). Nothing for kvadro² is provisioned: no legacy
  hosts or aliases, no legacy surface, no `@KvadroAppBot` webhook, no import database. KV-INF-015, KV-INF-019 and
  KV-INF-023 overlap PR #8 and say so in their reconciliation notes; where a task calls an existing file "new", extend
  the file instead.
- **Ownership marker.** Rows marked **[PT]** are *production track — first developer approves*
  (`docs/handoff/parallel-work.md` §1): servers, DNS, TLS, MinIO, server `.env`, staging and production bots and
  webhooks, backups, monitoring, deploy pipeline. The development track writes application code, `.env.example`
  keys, `config/*.php`, local tooling and CI for tests; it never receives staging or production credentials.
- **No values.** Variable **names** only; no secrets, hosts' credentials or tokens (`docs/handoff/parallel-work.md`
  §6). Machine paths are never written.
- **Inputs:** ADR-0005, ADR-0008, ADR-0011, ADR-0012, ADR-0013; `docs/infrastructure/environments.md`;
  `docs/ai/reports/phase-3-notes.md` §A–§B (conventions of the existing hosts); `16-security-review.md` §4 (SEC-REQ);
  `14-data-migration-plan.md` §1, §7.

## 1. Environments

| Environment | Purpose in the migration | Data | Bot | Who operates |
| ----------- | ------------------------ | ---- | --- | ------------ |
| **local** (each developer's Mac, ADR-0008) | build and test every module; run the legacy Mini App artefacts against the local legacy surface | factories, the masked sample R0 (`14` §7.4), never production data | the developer's own dev bot | development track |
| **staging** **[PT]** | S1: the HOMI backend serving the unchanged legacy Mini App and landing with migrated data; rehearsals R1–R3; parity runs; bot acceptance | migrated production data only inside the controls of `14` §1.2 (P4, P5); destroyed after each rehearsal | the staging bot with its own Main Mini App URL | production track; the development track deploys through the pipeline, never by hand |
| **production** **[PT]** | from S2: `kvadro.app`, `app.kvadro.app`, `@KvadroAppBot`, plus HOMI hosts | real users | `@KvadroAppBot` (token rotated at S2, SEC-REQ-012) | production track; every webhook change and deploy explicitly approved (ADR-0011) |
| **import database** **[PT]** | the isolated `legacy_raw` / `legacy_stage` area of `14` §7.1 | the legacy dump (encrypted) | none | production track; read-only role for the migration commands |

Rules carried over from ADR-0011: staging and production never share a writable bucket, database or Redis; local
code never points at staging or production services; agents never see production credentials.

## 2. Telegram bots per environment

`initData` is signed with a key derived from the token of the bot that opened the Mini App, so a Mini App opened from
one bot fails verification on another environment's backend (`$KVADRO_ROOT/docs/about.md` §8.4; SEC-REQ-001). Each
environment therefore has **its own bot, its own Main Mini App URL pointing at that environment's legacy-app host,
and its own webhook**.

| Setting (BotFather / Bot API) | Dev bot (per developer) | Staging bot **[PT]** | `@KvadroAppBot` **[PT]** |
| ----------------------------- | ----------------------- | -------------------- | ------------------------ |
| Owner account | the developer | the team account named by the first developer | transferred from the legacy owner if possible (Q-SEC-001, DEC-05) |
| Main Mini App URL | `https://kvadro-app.homi.loc/` through the tunnel host (only for live checks) | `https://kvadro-app.staging.homi.uz/` | `https://app.kvadro.app/` (unchanged at S2) |
| Menu button | «Открыть» → web_app, same URL | same | unchanged; per-chat menu buttons set by legacy persist (`04` §1 note 1) |
| Mini App domain | tunnel host | staging host | `app.kvadro.app` |
| Webhook URL | `https://<tunnel>/telegram/webhook` with `Host: hook.homi.loc` (T1) | `https://hook.staging.homi.uz/telegram/webhook` | `https://hook.homi.uz/telegram/webhook` (CF-009) |
| `secret_token` | random, local `.env` | vault | vault; rotation per SEC-REQ-008 |
| `allowed_updates` | `message`, `callback_query`, `my_chat_member` (CF-019) | same | same |
| Descriptions, short description, commands | copies of the legacy texts in ru, uz, en (`04` §1, §7) set by `php artisan telegram:profile sync` (new, `PROPOSED`) | same | unchanged at S2; the sync command fills the missing uz command list only after approval (DEC candidate) |
| Description picture, avatar, stickers | test copies | copies from source files (sticker `file_id`s belong to one bot, `04` §1 note 2) | unchanged |
| Privacy policy URL | — | staging privacy page | unchanged (`kvadro.app/privacy.html`) |
| Inline mode | off | off | off |

`php artisan telegram:webhook set|info|delete` refuses staging and production (T1); those webhooks are set by the
production track from the server, with explicit approval each time (`docs/handoff/parallel-work.md` §7).

## 3. Domains, hosts and TLS

### 3.1 Host matrix

| Role | Local (ADR-0008) | Staging **[PT]** | Production **[PT]** | Serves |
| ---- | ---------------- | ---------------- | ------------------- | ------ |
| Legacy landing + SEO | `kvadro.homi.loc` (new, `PROPOSED`) | `kvadro.staging.homi.uz` (`PROPOSED`) | `kvadro.app` | legacy landing files (until S4), `frontend/landing` SEO pages, data files, CSV, sitemap, `/media`, `/api/csp-report` |
| Legacy Mini App origin | `kvadro-app.homi.loc` (new, `PROPOSED`) | `kvadro-app.staging.homi.uz` (`PROPOSED`) | `app.kvadro.app` | legacy Mini App artefacts (until S4), legacy `/api/*`, `/media`, `/call` |
| Landing (HOMI brand) | `homi.loc` | `staging.homi.uz` | `homi.uz` — unpublished until DEC-04 | `frontend/landing` |
| App (HOMI brand) | `app.homi.loc` | `app.staging.homi.uz` | `app.homi.uz` — unpublished until DEC-04 | `frontend/app` |
| ARM | `arm.homi.loc` | `arm.staging.homi.uz` | `arm.homi.uz` | `frontend/arm` |
| API | `api.homi.loc` | `api.staging.homi.uz` | `api.homi.uz` | `/api/v1` (intake, v1 clients, public statistics API) |
| CDN | `cdn.homi.loc` | `cdn.staging.homi.uz` | `cdn.homi.uz` | public media, PMTiles |
| Hooks | `hook.homi.loc` | `hook.staging.homi.uz` | `hook.homi.uz` | `POST /telegram/webhook` only |

The two local aliases need new `/etc/hosts` entries, two more names on the mkcert certificate and two vhosts in
`infra/local/nginx` (development track; `make dev-check` extended). Staging names stay under `homi.uz` because the
kvadro domains are not under the team's control before S0 completes.

### 3.2 Path routing on the legacy hosts (nginx)

| Host | Path | Upstream | Notes |
| ---- | ---- | -------- | ----- |
| Mini App origin | `/`, `/assets/*`, `/maplibre-gl.mjs`, favicons | static: legacy artefact directory (S1–S3); `frontend/app` or the static SPA (S4) | CSP header from the artefact manifest (SEC-REQ-030); `/assets/*` immutable 1 year; `index.html` `no-cache` |
| Mini App origin | `/api/*` | php-fpm (Laravel, legacy route group) | `client_max_body_size 64k`; no CORS headers; `Cache-Control: private, no-store` set by Laravel |
| Mini App origin, landing host | `/media/*` | php-fpm → `X-Accel-Redirect` → internal location reading the private bucket (staging/production) or `storage/app/private` (local) | `Content-Type: image/jpeg`, `max-age=86400`; access log without query strings |
| Mini App origin | `/call/*` | php-fpm | access log drops the token segment (SEC-REQ-026) |
| Mini App origin | `/tiles/*` (only if a template URL is ever used) | static | PMTiles on `cdn.*` is the default (§7) |
| Landing host | `/`, `/uz/`, `/en/`, `/privacy.html`, landing assets | static: legacy landing mirror directory (S1–S3); `frontend/landing` (S4) | legacy CSP header with its hashes; `/uz` → `308 /uz/`; `/index.html` → `301 /` (RES-009) |
| Landing host | `/data/*.json`, `/img/snap/*` | static from the public disk prefixes written by the backend | `max-age=1800`; robots disallow `/img/snap/` |
| Landing host | SEO sections in three languages, `/sitemap.xml`, `/robots.txt` | `frontend/landing` (`next start`, ADR-0013 ports) | `s-maxage=300` (RES-017) |
| Landing host | CSV paths | static files from `CsvExportService` | `text/csv; charset=utf-8` |
| Landing host | `/api/csp-report` | php-fpm | bounded body |
| Hook host | `/telegram/webhook` | php-fpm | `client_max_body_size 1m`; the route is also host-bound in Laravel (SEC-REQ-008) |

### 3.3 TLS

- Local: mkcert, as today (ADR-0008).
- Staging and production **[PT]**: one Let's Encrypt certificate per host (conventions of the existing hosts,
  `docs/ai/reports/phase-3-notes.md` §A "Decisions already taken"). `hook.*` needs a publicly trusted certificate for
  Telegram.
- **Kvadro hosts before the DNS switch [PT]:** HTTP-01 validation cannot reach HOMI while DNS still points at legacy, so
  the certificates for `kvadro.app` and `app.kvadro.app` are issued before S2 by DNS-01 validation (needs DNS access,
  Q-SEC-001) or, if Cloudflare stays in front with "Full (strict)", by a Cloudflare origin certificate. Either way they
  are installed and tested on HOMI before T0 (`18` §4).

## 4. Environment variable names per feature

Existing keys (`backend/.env.example`) are not repeated unless their use changes. A new key = `.env.example` (blank or
safe default) + the config file that reads it + the name in `docs/infrastructure/environments.md`, announced in the PR
(`docs/handoff/parallel-work.md` §6). Names are `PROPOSED`; values are per environment and secret unless noted.

| Feature | Backend names | Notes |
| ------- | ------------- | ----- |
| Legacy surface | `LEGACY_SURFACE_ENABLED`, `LEGACY_APP_HOSTS`, `LEGACY_SITE_HOSTS` | host lists per environment (not secret) |
| `initData` windows | `TELEGRAM_INITDATA_MAX_AGE` (legacy surface), `TELEGRAM_INITDATA_EXCHANGE_MAX_AGE` (v1) | SEC-REQ-002 |
| Telegram (existing) | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL` | per environment, never shared |
| Telegram (read by `config/telegram.php`, missing from `.env.example`) | `TELEGRAM_WEBHOOK_MAX_CONNECTIONS`, `TELEGRAM_API_BASE_URL`, `TELEGRAM_HTTP_TIMEOUT`, `TELEGRAM_HTTP_CONNECT_TIMEOUT`, `TELEGRAM_UPDATES_RETENTION_DAYS` | add to `.env.example` so `dev-check` sees them |
| Telegram (new) | `TELEGRAM_MINIAPP_URL`, `TELEGRAM_SUPPORT_BOT_USERNAME`, `TELEGRAM_SEND_RATE_GLOBAL`, `TELEGRAM_SEND_RATE_PER_CHAT`, `TELEGRAM_UPDATES_ENCRYPTION_KEY` | pacing values not secret |
| Signed URLs | `MEDIA_URL_SIGNING_KEY`, `MEDIA_URL_SIGNING_KEY_PREVIOUS`, `CALL_LINK_SIGNING_KEY`, `CALL_LINK_TTL` | ≥ 32 bytes (SEC-REQ-034) |
| Phones | `PHONE_HMAC_PEPPER`, `PHONE_ENCRYPTION_KEY` | separate from `APP_KEY` |
| Access | `ACCESS_MODE`, `ACCESS_MAX_SEATS` | owner list in the database, not in env |
| Legacy media renditions | `MEDIA_LEGACY_SIZES` (default `800,480`), `MEDIA_LISTING_PHOTO_DISK` | not secret |
| LLM (`laravel/ai`) | `GEMINI_API_KEY` (or the chosen vendor's key), `AI_DEFAULT_PROVIDER`, `AI_DAILY_SPEND_LIMIT` | the package hard-codes its default provider (`backend/vendor/laravel/ai/config/ai.php:16`), so the config is published with an env default |
| PostHog | `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` | the project key is public; the personal key is a secret used only for person deletion |
| Exchange rate | `CBU_RATES_URL`, `RATE_STALE_AFTER_HOURS` | not secret |
| Map tiles | `MAP_TILES_URL` | the PMTiles URL delivered in `meta.tiles` |
| Channel reader (CF-007 B/C) | `COLLECTOR_ENABLED`, `COLLECTOR_USER_AGENT`, `COLLECTOR_POLL_SECONDS`, `COLLECTOR_SHARDS` | channel list in the database |
| Data migration | `LEGACY_IMPORT_DB_HOST`, `LEGACY_IMPORT_DB_PORT`, `LEGACY_IMPORT_DB_DATABASE`, `LEGACY_IMPORT_DB_USERNAME`, `LEGACY_IMPORT_DB_PASSWORD` | only on the host that runs the import; read-only role |
| Telescope | `TELESCOPE_ENABLED` | `false` in production unless SEC-034 is resolved |
| Edge purge | `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` (only if DEC-16 keeps Cloudflare) | purge-only token **[PT]** |

| Frontend app | Names | Notes |
| ------------ | ----- | ----- |
| all | `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (exist) | — |
| landing | `NEXT_PUBLIC_SITE_URL` (canonical base: `https://kvadro.app` until S6), `PUBLIC_API_INTERNAL_URL` (server-side fetches), `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | — |
| app (Mini App) | `NEXT_PUBLIC_SUPPORT_BOT_USERNAME`, `NEXT_PUBLIC_MAP_TILES_URL` (fallback only; the bootstrap call is authoritative) | — |

## 5. PostgreSQL and PostGIS

| Item | Local | Staging / production **[PT]** |
| ---- | ----- | ----------------------------- |
| Server | Homebrew PostgreSQL 18 | `5.45.127.98`, databases `homi_staging_db`, `homi_db`, separate roles (ADR-0011) |
| PostGIS | `brew install postgis` (development track; `make dev-check` verifies the extension) | `CREATE EXTENSION postgis` needs a privileged role on a shared server: version check against the other products' databases, then enabled per database (DEC-09, KV-DB-005) |
| CI | service image with PostGIS for PostgreSQL 18 (`PROPOSED`, DEC-23); the `pgsql` Pest group runs against it | — |
| Import database | — | a separate database (not `homi_db`) with `legacy_raw`, `legacy_stage`, a read-only role for the migration commands, destroyed after the rollback window (`14` §7.1, §7.9) |
| Partitions | created by migrations and the monthly scheduler task | same |
| Connections | direct | measure first; a pooler only if the app host opens too many connections across the network (ADR-0011 notes the cross-host latency) |
| Large-table changes | — | additive migrations; backfills in jobs; `CONCURRENTLY` indexes; data-impacting migrations flagged in the PR (`docs/handoff/parallel-work.md` §3) |

## 6. Redis, Horizon and workers

- Redis per environment **[PT]**: we recommended separate instances; the production track decided DB indexes on the
  host's shared instance on 2026-11-09 (DEC-27; `docs/infrastructure/environments.md`). Open point: the eviction
  policy of the shared instance must not drop queue keys (KV-INF-019).
  Redis holds queues, cache, locks, bot conversation state and limiter counters — nothing that must survive a flush
  (ADR-0005).
- Supervisors (`backend/config/horizon.php`, shared file; process counts are a proposal for production and are
  re-measured on staging):

| Supervisor | Queues | Production processes | Staging | Notes |
| ---------- | ------ | -------------------- | ------- | ----- |
| `supervisor-default` | `default` | 2–4 (auto) | 1–2 | stats, landing data, CSV, rates, purges |
| `supervisor-telegram` | `telegram` | 4 | 2 | inbound updates (exists) |
| `supervisor-delivery` (new) | `notifications` | 2–6 (auto) | 1–2 | paced sends; the global limiter, not the process count, sets the rate |
| `supervisor-radar` (new) | `radar` | 2–4 (auto) | 1 | matching fan-in |
| `supervisor-ingest` | `ingest` | 1–3 (exists) | 1–2 | — |
| `supervisor-llm` (new) | `llm` | 1–4 (auto) | 1 | provider rate limits |
| `supervisor-media` | `media` | 1–3 (exists) | 1–2 | photo copies and renditions; memory-heavy |
| `supervisor-collect` (new, CF-007 B/C) | `collect` | 1–2 | 1 | polite intervals per host |

- Deploys run `php artisan horizon:terminate` after the code switch (interface of `docs/handoff/parallel-work.md` §1);
  Horizon runs under the host's process manager (systemd, ADR-0013 conventions) **[PT]**.
- Horizon `waits` thresholds per queue feed the queue-lag alerts (§12). Dashboard access: by ARM role or SSH tunnel
  only (Q-SEC-019) **[PT]**.
- Capacity **[PT]**: the web host runs nginx, php-fpm, three Next processes per environment (six with staging, ADR-0013)
  and Horizon; with the new supervisors, measure memory on staging before S2 and decide whether workers move to another
  host (DEC-28).

## 7. Object storage, CDN, media and tiles

| Content | Bucket / disk **[PT]** | Served as | Requirements |
| ------- | ---------------------- | --------- | ------------ |
| Listing photos (originals, legacy JPEG 800/480, WebP variants) | `homi-private` (`homi-staging-private`) | only through the signed `/media/…` route; Laravel answers `X-Accel-Redirect`, nginx reads the object from MinIO through an internal location | never anonymous; never `immutable` (SEC-029); deletion of the object triggers an edge purge of the legacy URLs (SEC-REQ-025) |
| Landing snapshots, landing data, CSV | `homi-public` under `landing/`, `exports/` (or the web host's public disk) | `kvadro.app` paths of §3.2 | snapshots removed on takedown |
| Basemap PMTiles | `homi-public/tiles/` | `https://cdn.homi.uz/tiles/uzbekistan-<date>.pmtiles` in `meta.tiles` | `Range` → `206` with `Content-Range`; CORS `GET`, `HEAD`, preflight for the Mini App origins only, exposing `Content-Range`, `Content-Length`, `ETag` (RES-003, SEC-REQ-032); MinIO's CORS is global `*` on the existing host, so nginx on `cdn.*` sets the narrower headers (`docs/ai/reports/phase-3-notes.md` §A); `proxy_cache` must key on the range or use the nginx `slice` module, or bypass the cache for ranged requests |
| User uploads (existing Media API) | `homi-public`, `homi-private`, `homi-tmp` | as ADR-0012 | unchanged, with the ownership fix |
| Migration media transfer | a transfer bucket on the import side | not served | manifest + SHA-256 per file; destroyed after validation (`14` §5) |

Buckets, users and policies follow the existing onboarding pattern (anonymous `GetObject` only on public buckets,
one IAM user per environment; `docs/ai/reports/phase-3-notes.md` §A) **[PT]**.

**Edge (Cloudflare, if DEC-16 keeps it) [PT]:** cache rules — bypass `/api/*` and `/call/*`; cache `/media/*` by the
full URL including the query string for 1 day; SEO HTML by `s-maxage`; landing data 30 min. A purge-only API token is
used by the backend for takedowns and the 90-day purge. The trusted-proxy list in Laravel must contain the edge
ranges so client IPs for limiters are real (SEC-REQ-027). If Cloudflare is dropped, nginx `proxy_cache` on the web
host takes the same rules.

## 8. LLM keys and spend

- One key per environment and vendor **[PT]**; local development uses a developer key with a low cap or fakes.
- Daily spend cap enforced in code (`AI_DAILY_SPEND_LIMIT`) plus the vendor's own budget alert; staging cap at a small
  fraction of production.
- No raw PII leaves HOMI: masking before every call (SEC-REQ-042); prompts and outputs logged without raw text
  (SEC-REQ-044).
- The vendor and the legal basis for cross-border processing are DEC-03 and Q-SEC-006.

## 9. PostHog

- Production keeps the **legacy EU project** so migrated distinct ids continue their history (`14` §3; DEC-26)
  **[PT]**: the project key is delivered in `meta.analytics` (Mini App) and is already inside the legacy `stats.js`
  served from the mirror.
- Staging uses a separate project; rehearsals never write to production analytics (`14` P12).
- The personal API key (person deletion) is a server-only secret.

## 10. Scheduler and cron **[PT]**

- One cron entry per environment on exactly one host: `* * * * * php artisan schedule:run` as the app user; every task
  uses `onOneServer()` (Redis lock) so a second host is safe later.
- The task list and cadences are in `10` §4.11; business times use `Asia/Tashkent`, the server clock stays UTC.
- A heartbeat task pings the monitor every minute; missing heartbeats alert (§12).

## 11. CI/CD gates

| Gate | Where | Status | Owner |
| ---- | ----- | ------ | ----- |
| `composer ci:check` (Vite+ check, `tsc`, Pint, PHPStan level 7, Pest on SQLite) | `.github/workflows/backend.yml` | exists | development |
| PostgreSQL/PostGIS test group (`pgsql`): search, medians, polygons, migrations, legacy contract tests | `backend.yml`, PostGIS service image | new (DEC-23) | development |
| Legacy contract: every legacy response validated against `docs/api/kvadro-legacy.openapi.yaml` and golden fixtures | `backend.yml` | new (CF-020) | development |
| v1 OpenAPI drift check (T3) and generated client check (T5) | `backend.yml`, `frontend.yml` | planned | development |
| Legacy artefact integrity: SHA-256 manifest of the served Mini App and landing files; CSP hashes recomputed and compared with the header config (SEC-REQ-030) | a new job in `frontend.yml` or `tooling.yml` | new | development |
| `pnpm -r lint`, `typecheck`, `build` | `frontend.yml` | exists | development |
| Next test runner (T8) and Lighthouse on the SEO templates | `frontend.yml` | planned (approval) | development |
| `composer audit`, `pnpm audit` (fail on high/critical) | both | new (SEC-REQ-049) | development |
| Secret scanning | pre-commit and CI | new, tool needs approval (SEC-REQ-035, T10) | development; first developer approves |
| Deploy to staging on merge to `main`; deploy to production on manual approval | `.github/workflows/deploy*.yml` | new **[PT]** | production track |

**Deploy steps [PT]** (ADR-0013, `docs/handoff/parallel-work.md` §1 interfaces): fetch the release → `composer install
--no-dev` → `php artisan migrate --force` (flagged migrations scheduled separately) → `config:cache`, `route:cache`,
`event:cache` → `pnpm install --frozen-lockfile && pnpm -r build` → atomic symlink switch → `php artisan
horizon:terminate` → restart the Next processes → smoke tests (`/up`, one legacy endpoint with a synthetic `initData`
signed by the staging bot token on staging only, the webhook info check) → rollback to the previous release directory
on failure. Legacy artefact directories are deployed from their manifest, not from git builds.

## 12. Monitoring and alerting **[PT]**

Stack: the existing Grafana/Prometheus/Alertmanager on the monitoring host (`docs/ai/reports/phase-3-notes.md` §A),
fed by application metrics (`10` §4.17), plus Pulse and Horizon in the application. Alerts go to the team's operations
chat; personal data never appears in alert text.

| Signal | Threshold (starting value, `PROPOSED`) | Why |
| ------ | -------------------------------------- | --- |
| Queue wait per queue (Horizon `waits`) | `telegram` > 10 s, `notifications` > 60 s, `ingest` > 5 min, `radar` > 2 min, `llm` > 10 min | inbound responsiveness, delivery lag |
| Failed jobs | > 10 in 10 min on any queue | poison inputs, provider outages |
| Telegram delivery failures | non-`403` errors > 1 % of sends in 10 min; any `429` storm (> 20 in a minute) | pacing and outages |
| Blocked-bot rate (`403` on send) | 3× the 7-day baseline | mass blocking after a bad change |
| Webhook errors | any non-2xx answer from HOMI; `getWebhookInfo.last_error_date` changed; `pending_update_count` > 100 | the bot stops working silently otherwise |
| Webhook latency | p95 > 1 s | Telegram retries slow webhooks |
| Legacy surface | `5xx` > 0.5 % of requests in 5 min; p95 per endpoint above `10` §5.12 budgets; `401` rate 3× baseline (except the planned spike at S2) | parity and auth regressions |
| Ingestion freshness | no new listing for 30 min in daytime (Tashkent); intake lag p95 > 15 min | collector or parser down |
| LLM | daily spend > 80 % of the cap; error rate > 5 % | cost and parsing outages |
| Contact quota | trips per hour 3× baseline | phone harvesting (SEC-REQ-028) |
| Scheduler | missing heartbeat for 5 min; any task failing twice | digests and purges depend on it |
| Exchange rate | latest rate older than 2 days | prices and filters drift |
| Backups | latest successful backup older than 26 h; WAL archive lag > 15 min | restore point |
| Storage | bucket or disk > 80 % | photos grow daily |
| TLS | certificate expiry < 14 days on any host incl. the kvadro hosts | — |
| CSP reports | spike > 10× baseline | broken artefact or an injection attempt |

## 13. Backups and restore tests **[PT]**

- PostgreSQL: pgBackRest with continuous WAL archiving into a private, versioned MinIO bucket (the existing pattern on
  the storage host, `docs/ai/reports/phase-3-notes.md` §A) and an off-host copy; point-in-time recovery.
- **Retention must match the public promise:** deleted users disappear from backups "after about two weeks"
  (`$KVADRO_ROOT/docs/about.md` §5.11), so full backups and WAL older than 14 days are expired (DEC-12). A longer
  retention needs a changed privacy text first.
- Object storage: versioning on private buckets with non-current versions expired within the same 14 days; photos
  removed by the 90-day purge must not survive longer than that in versions.
- Restore drills: a full restore of production into an isolated staging database monthly and **before every
  rehearsal (R2, R3) and before S2** (`14` §7.5), timed and recorded; the cut-over GO requires a successful drill no older
  than 7 days.
- Redis is not backed up (ADR-0005).
- Legacy material (dump, rehearsal copies) follows `14` §1.2 and §7.9: encrypted, never on developer machines,
  destroyed with a record.

## 14. Security headers and CSP per host

Baseline for every host (SEC-REQ-033): HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation only on the Mini App origin). nginx sets headers
inside every `location` because `add_header` is not inherited when a location defines its own
(`docs/ai/reports/phase-3-notes.md` §A).

| Host / route class | CSP | Other |
| ------------------ | --- | ----- |
| Mini App origin, legacy artefacts (S1–S3) | header computed from the exact served `index.html`: two sha256 hashes, `https://telegram.org`, `connect-src 'self'` + PostHog + tile host, `img-src 'self' data: blob:` + tile/OSM hosts, `worker-src blob:` if needed, `style-src 'self' 'unsafe-inline'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors` allowing Telegram Web (Q-SEC-012), `report-uri /api/csp-report` (SEC-REQ-030). Start from the captured legacy header — **still to be captured** (Q-APP-016): `curl -sI https://app.kvadro.app/` from an allowed machine, recorded in this section | — |
| Mini App origin, HOMI Mini App (S4) | nonce + `'strict-dynamic'` from `proxy.ts` with `'self'` and the SDK host as fallbacks (SEC-REQ-031), or build-time hashes for option B | — |
| Legacy `/api/*` | `default-src 'none'; frame-ancestors 'none'` | `Cache-Control: private, no-store`; no ACAO |
| `/media/*` | none needed (images) | `nosniff`, robots disallow |
| `/call/*` | `default-src 'none'; style-src 'unsafe-inline'` (or a hash) | `no-store`, `Referrer-Policy: no-referrer`, `noindex` (SEC-REQ-026) |
| Landing host, legacy files (S1–S3) | the legacy landing header with its hashes and `https://eu-assets.i.posthog.com` (RES-009) | — |
| Landing host, SEO pages and the S4 landing | DEC-08 (`10` §5.13) | `frame-ancestors 'none'` |
| `arm.*`, `api.*`, `hook.*` | `default-src 'none'; frame-ancestors 'none'` for API hosts; a nonce CSP for ARM | ARM `noindex` |

## 15. Production-track checklist (all **[PT]**, first developer approves)

| # | Item | Needed by |
| - | ---- | --------- |
| 1 | Staging hosts, vhosts and certificates for `*.staging.homi.uz` incl. the two legacy-host aliases | S1 |
| 2 | Staging bot with BotFather settings of §2 | S1 |
| 3 | PostGIS on `homi_staging_db`, later `homi_db` | Geo work, R1 |
| 4 | Import database and the dump transfer channel (`14` P4) | R1 |
| 5 | Buckets, IAM users, internal nginx location for private listing photos, PMTiles CORS/Range on `cdn.*` | S1 |
| 6 | Redis per environment; Horizon supervisors under systemd | S1 |
| 7 | Deploy pipeline, release directories, smoke tests, rollback | S1 |
| 8 | Monitoring and alerts of §12 | S1 exit |
| 9 | Backups of §13 and the first restore drill | S1 exit |
| 10 | Custody: BotFather ownership, token, registrar, DNS, Cloudflare for the kvadro domains (Q-SEC-001) | S0 |
| 11 | Certificates for `kvadro.app` and `app.kvadro.app` on HOMI before T0 (§3.3) | S2 |
| 12 | Production `@KvadroAppBot` webhook switch and token rotation, executed from the server | S2 |
| 13 | DNS / edge switch for the kvadro hosts | S2 |
| 14 | Legacy decommissioning and destruction records | S3 |

## 16. Open items

- Q-APP-016 / Q-SEC-012: the legacy CSP header and the Telegram Web framing behaviour — capture before S1 exit.
- Q-API-053: tiles source, size, licence, update process.
- Q-SEC-019: dashboard access in staging and production.
- DEC-16, DEC-27, DEC-28 (edge, Redis layout, capacity).
- Whether redirects from `app.kvadro.app` to another host keep `tgWebAppData` inside Telegram WebViews — test before
  any S6 plan relies on it.
