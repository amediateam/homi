# 01 — Legacy system map (kvadro²)

Conventions, labels and IDs: [`README.md`](README.md). This document is the top-level map. The detailed inventories
are in documents 02–08.

## 1. Product in one paragraph

kvadro² (KvadroApp) aggregates housing listings in Uzbekistan:

- **Sources.** It reads open Telegram channels (rentals and sales) and parses the posts with an LLM (Google Gemini)
  into structured listings.
- **Feed.** It merges duplicates and shows one feed with filters, a map and a market-price comparison.
- **Radar.** It pushes new matching listings to the user's Telegram chat.

The only user entry is Telegram: the bot `@KvadroAppBot` and its Mini App. There is no web login.

| Property | Value |
| -------- | ----- |
| Deals | `rent_long`, `rent_daily`, `sale` |
| Cities | Tashkent, Tashkent region, Andijan, Namangan, Kokand, Fergana |
| Languages | `ru`, `uz_Latn`, `en` |
| Currency | USD is primary (prices and filters are stored in USD); UZS is displayed at a rate |
| Time zone | `Asia/Tashkent` |
| Volume on 2026-11-09 | ≈ 18.6 k active listings, ≈ 1 050 new per day |

Evidence: `$KVADRO_ROOT/docs/about.md` §1 (lines 38–65), status `DOCUMENTED_ONLY`. The volume figure comes from the
bot's greeting.

## 2. Components

| Component | Where it runs | Role | Material we have | Detailed audit |
| --------- | ------------- | ---- | ---------------- | -------------- |
| Telegram bot `@KvadroAppBot` | Bot API, served by the legacy backend | Entry, radar wizard, free-text query parsing, listing cards, favourites, settings, `/owner`, `/privacy` | Behaviour documented by manual exploration (`docs/telegram-bot.md`, 1 064+ lines). **No source code** | [04](04-telegram-bot-audit.md) |
| Mini App | `https://app.kvadro.app` (Telegram WebView) | Feed, filters, map, listing details, radars, favourites, history, hidden, settings | React 19 + Vite source decompiled from the prod bundle: `demo/app/src`, 177 JS/JSX files + 27 CSS, ≈ 22.3 k lines. Verified against prod by the legacy team's parity tests | [03](03-legacy-frontend-audit.md), [05](05-telegram-miniapp-audit.md) |
| Landing | `https://kvadro.app` (`/`, `/uz/`, `/en/`, `/privacy.html`) | Bot page with a Mini App demo, live price map, links into the bot with source tags | Static prod mirror: `demo/landing/site/` contains the prod files 1:1, with no build step | [03b](03b-legacy-landing-seo-audit.md) |
| SEO pages | `kvadro.app/arenda/…`, `/prodazha/…`, `/novostrojki/…` (+ `/uz/`, `/en/`) | 1 008 server-rendered pages (336 per language): cities, districts, quarters, metro, rooms, rent index, sale prices, methodology | Behaviour documented in `docs/seo-pages.md`. Renderer source not available | [03b](03b-legacy-landing-seo-audit.md) |
| Backend | Python, FastAPI + Pydantic 🔶; PostgreSQL + PostGIS 3.5.2 | Channel reading, LLM parsing, dedup, geo, medians, Mini App API (34 methods), bot, radar delivery, landing data, SEO rendering, `/media`, `/tiles`, `/call` | **No source, no schema, no data.** Known only from the contract `docs/api.md`, client code and observed output | [02](02-legacy-backend-audit.md), [08](08-api-inventory.md) |
| Support bot `@KvadroSupportBot` | Telegram | Conversation with the team; Gemini translation (per `/privacy`) | Not researched | `Q-SYS-003` |
| Admin / moderation | unknown | Takedowns, beta access (`invite`/`full`), "service news" broadcasts | Nothing visible from outside | `Q-SYS-004` |

Evidence: `$KVADRO_ROOT/docs/about.md` §2 (lines 67–99), `$KVADRO_ROOT/CLAUDE.md` ("What this is").

```text
 Telegram channels (217, public pages) ──read 🔶──►  Legacy backend (FastAPI 🔶, PostgreSQL+PostGIS)
                                                       │  Gemini (parse, translate, query parsing)
   @KvadroAppBot ◄── Bot API ──────────────────────────┤
   Mini App app.kvadro.app ◄── HTTPS /api /media /tiles┤
   Landing + SEO kvadro.app ◄── server-rendered/data ──┘
   PostHog EU (analytics) · Cloudflare (edge) · @KvadroSupportBot
```

## 3. Source material inventory

All paths are under `$KVADRO_ROOT` (an SVN working copy, revision 18, last changed 2026-11-08; not a git repo).

| Path | Size / files | What it is | How it was produced |
| ---- | ------------ | ---------- | ------------------- |
| `CLAUDE.md` | 13.8 KB | Working guide for the recovery repo: architecture, hard constraints, parity and sync commands | Written by the legacy recovery team |
| `docs/about.md` | 76 KB | Technical product description written for the teams building the new Laravel backend and Next.js frontend. Lists requirements (§8, §9), what not to port (§10) and unknowns (§11) | Derived from the sources below; ✅/🔶 markers |
| `docs/api.md` | 67 KB | Mini App ↔ backend contract: 34 methods, models, a checklist and open questions | Derived from the client code and observed prod responses |
| `docs/telegram-bot.md` | 123 KB | Bot behaviour: profile, commands, scenarios, buttons, toasts, deep links, quirks, localisation | Manual exploration of the prod bot |
| `docs/seo-pages.md` | 48 KB | SEO pages: address scheme, indexing, templates, calculations, CSV exports | Observation of prod output |
| `demo/task.md` | 6 KB | Original recovery brief (Russian) | — |
| `demo/app/src/` | 97 `.js`, 80 `.jsx`, 27 `.css`, fonts | Mini App source (plain JS; the original was TypeScript in a `webapp` repo) | Decompiled from the prod bundle |
| `demo/app/docs/` | `RECOVERY.md`, `MODULE_MAP.md`, `CHANGELOG.md`, `releases/` (2026-11-06, -07, -08) | Recovery notes, minified-symbol → file map, release log with ported and deferred changes | Recovery team + sync tooling |
| `demo/app/tools/` | `parity/` (28 + 35 + 16 scenarios), `recover/`, `sync/`, `dev/` | Parity harness (headless Chrome, prod snapshot vs rebuilt `dist/`, identical mocks); decompile pipeline; release-sync engine; dev-only Telegram emulation | Recovery team |
| `demo/landing/site/` | 4 HTML, 4 JS, 2 CSS, images | Prod files 1:1 (`index.html`, `privacy.html`, `uz/`, `en/`, `landing.js`, `landing-i18n.js`, `stats.js`, `miniapp.css`, `miniapp-i18n.js`) | Mirror |
| `demo/landing/docs/` | `RECOVERY.md`, `CHANGELOG.md` | File map, backend contract, kept quirks | Recovery team |
| `demo/landing/tools/` | parity (40 scenarios), sync, fixtures | Landing parity and sync engine; fixture data | Recovery team |
| `.claude/commands/` | `sync_frontend_app.md`, `sync_frontend_landing.md` | Commands that port new prod releases into the recovery repo and update `docs/api.md` | Recovery team |

`node_modules/` (≈ 296 MB in `demo/app`, plus `demo/landing`) and `dist/` are installed or generated. They are
excluded from analysis except for version facts.

## 4. Entry points

| Entry | Format | Detail |
| ----- | ------ | ------ |
| Bot chat | `/start`, `/start <payload>` (`s_…` attribution, `l_…` listing and others) | [04](04-telegram-bot-audit.md) |
| Mini App | Main Mini App of the bot, `?startapp=l_<id>[-…]` deep links, menu button | [05](05-telegram-miniapp-audit.md) |
| Landing | `kvadro.app/`, `/uz/`, `/en/`, `/privacy.html` | [03b](03b-legacy-landing-seo-audit.md) |
| SEO | `kvadro.app/arenda/…`, `/prodazha/…`, `/novostrojki/…` and the localised variants, `sitemap.xml` | [03b](03b-legacy-landing-seo-audit.md) |
| Shared links | `t.me/<channel>/<post>` (source posts), bot links with `?start=` from the landing and SEO pages | [03b](03b-legacy-landing-seo-audit.md) |

Already-distributed links must keep working after the cut-over: `?start=s_…`, `?startapp=l_<id>…`, and the SEO
addresses (`$KVADRO_ROOT/docs/about.md` §8.2).

## 5. Legacy technology stack

| Layer | Legacy | Status |
| ----- | ------ | ------ |
| Backend | Python, FastAPI + Pydantic v2. Known file names: `app/api/landing_pages.py`, `site_stats.py`, `landing.py`, `area_pages.py`, `scripts/landing_snapshot.py` | 🔶 inference from the error formats; the file names are ✅ from landing comments |
| DB | PostgreSQL + PostGIS 3.5.2 | ✅ (bot `/ping`) |
| LLM | Google Gemini: listing extraction, text and voice query parsing, translation | ✅ (`/privacy`) |
| Mini App | React 19.3.0, Vite, MapLibre GL 6.11.2, Leaflet 1.9.4 + markercluster 1.5.3, protomaps-leaflet, PMTiles, supercluster, posthog-js 1.434.15, lucide-react | ✅ `$KVADRO_ROOT/demo/app/package.json` |
| Landing | Static HTML + ES5 IIFE scripts. The `uz/` and `en/` pages are server output | ✅ |
| Maps | Protomaps basemap vector tiles (`/tiles` or PMTiles), raster OSM fallback | ✅ |
| Analytics | PostHog EU, no cookies on the landing | ✅ |
| Edge | Cloudflare | ✅ |

Source: `$KVADRO_ROOT/docs/about.md` §3 (lines 101–117).

## 6. Non-obvious couplings

These are easy to miss and break silently:

1. **`initData` is signed with the bot token.** Every environment needs its own bot and its own Mini App URL. The
   old and new backends cannot serve `@KvadroAppBot` at the same time: one bot has one webhook
   (`about.md` §8.4).
2. **CSP hashes.** The inline scripts in the Mini App `index.html` and the landing `index.html`/`privacy.html` are
   allowed by sha256. A byte change blocks them in production (`$KVADRO_ROOT/CLAUDE.md`, hard constraints).
3. **Landing files generated elsewhere.** `miniapp.css` and `miniapp-i18n.js` are produced by
   `scripts/landing_miniapp.mjs` in the (unavailable) `webapp` repo. `uz/index.html` and `en/index.html` are
   backend output. The landing data (`data/*.json`, `img/snap/*`) is rewritten by the backend several times a day.
4. **Analytics configuration comes from the API.** The PostHog key and host come from `GET /api/meta`. Errors are
   also posted to `/api/events`.
5. **Production keeps moving.** Mini App releases shipped on 2026-11-06, -07 and -08, including a breaking API change
   (`zone` → `zones`). The recovery repo follows them with `/sync_frontend_app` and `/sync_frontend_landing`. A
   contract freeze point is needed (`about.md` §8.4) → `Q-SYS-005`.
6. **Old messages in users' chats.** Old bot messages carry `callback_data` in a format we do not know. The new bot
   must handle those buttons or answer "form outdated".
7. **Delivered-cards history.** Without migrating the list of delivered cards, radars would resend old listings
   after the switch.

## 7. Legacy → HOMI component map (first cut)

The details and the conflicts with existing HOMI decisions are in [10](10-target-architecture.md).

| Legacy | HOMI target |
| ------ | ----------- |
| Legacy backend (API, bot, pipeline, jobs) | `backend/` (Laravel 13, Horizon/Redis, PostgreSQL 18 + PostGIS) |
| Bot webhook | `hook.*` host → Telegram module (current fail-closed stub: `POST /telegram/webhook`) |
| Mini App | `frontend/app` (Next.js 16). During the transition the recovered `demo/app` stays the reference client against the new backend (`about.md` §8.4) |
| Landing + SEO pages | `frontend/landing` (Next.js 16, SSR, sitemap) |
| Admin/moderation (unknown) | `frontend/arm` |
| `/media`, `/tiles` | Media module + CDN (ADR-0012 locally, MinIO/CDN in staging/production) |

## 8. What we do not have

| ID | Gap | Who can close it |
| -- | --- | ---------------- |
| `Q-SYS-001` | Legacy backend source code (any part) — would turn most `DOCUMENTED_ONLY` server items into `CONFIRMED` | Product owner / legacy team |
| `Q-SYS-002` | Legacy DB schema and a sanitised data sample (row counts, enum values) — blocks the data migration plan | Product owner / legacy team |
| `Q-SYS-003` | `@KvadroSupportBot` behaviour | Product owner |
| `Q-SYS-004` | Admin / moderation tooling and processes | Product owner |
| `Q-SYS-005` | Contract freeze date for the legacy API while the new backend is built | Product owner + developer |
| `Q-SYS-006` | Brand and domains after the migration (`kvadro.app` vs `homi.uz`); fate of the SEO addresses and of `@KvadroAppBot` | Product owner |
| `Q-SYS-007` | Which fields land plots, commercial premises and daily-rent listings carry. The contract only describes the common field set (`$KVADRO_ROOT/docs/api.md:1118`). This blocks the per-type validation and card layout | Legacy team (DB sample) |
| `Q-SYS-008` | Legal right to copy and re-host photos from third-party Telegram channels (`$KVADRO_ROOT/docs/about.md:566-567`). Affects the media migration and the landing photo snapshots | Product owner (lawyer) |

The full list, including the legacy team's own open questions (`about.md` §11, 17 items), is compiled in
[20](20-open-questions.md).
