# 20 — Open questions

Conventions: [`README.md`](README.md). This document lists **everything not yet known or not yet decided**. Section 1
groups the items that block work by who can answer them. Section 2 is the full register, generated from the audit
documents with `python3 scripts/migration/collect_ids.py && python3 scripts/migration/build_open_questions.py`.
Never edit the generated block by hand: change the question in its source document and regenerate.

## 1. What blocks work, by who can answer

The decisions themselves (`DEC-01` … `DEC-30`: options, recommendation, who decides, what each blocks) are in
[`10-target-architecture.md`](10-target-architecture.md) §8. The questions behind them:

### 1.1 Product owner (the people who run kvadro² today)

| Topic | Items | Blocks |
| ----- | ----- | ------ |
| Legacy backend source, DB schema, row counts, a sanitised sample, access path | Q-SYS-001, Q-SYS-002, Q-DATA-001 … Q-DATA-005 | M8 data migration, every `DOCUMENTED_ONLY` server rule |
| Contract freeze date for the legacy API | Q-SYS-005, DEC-01 | the parity gate, R2 rehearsal |
| Brand, domains, bot custody | Q-SYS-006, DEC-04, DEC-05, DEC-16 | S2 cut-over |
| Legal basis for personal data (phones, Telegram ids, phone hashes), hosting location, LLM vendor | DEC-13, DEC-03, Q-SYS-008 (photo rights) | R1 rehearsal with real data, S2 |
| Admin and moderation processes, ARM roles | Q-SYS-004, DEC-22 | ARM (M9), takedowns |
| Support bot in scope? | Q-SYS-003, DEC-21 | support links in bot texts |
| Product thresholds: phone-disclosure quota, radar caps, access mode, thin-page indexing | DEC-19, DEC-20, DEC-25, DEC-30 | M2, M4, S2, SEO |
| Field sets of land, commercial and daily-rent listings | Q-SYS-007 | per-type validation and cards |

### 1.2 Legacy team (needs access to the running system or its code)

| Topic | Items |
| ----- | ----- |
| Format of the bot's `callback_data` and the wizard state | Q-BOT-017; see 04 §6 |
| Radar matching triggers, digest format, quiet hours, delivered-card log | Q-API-024, Q-BOT-002 and the DELIVERY rows in 09 |
| `auth_date` window, photo/call link signing, owner-hash algorithm | Q-API-002, Q-API-027, Q-API-031, Q-API-041, Q-BOT-042 |
| Channel list (217), reading method, LLM prompts, dedup and median algorithms | about.md §11 items 3–7 → Q-API items in 02 |
| District / zone / landmark code lists (codes already differ between surfaces) | Q-DATA items in 06 |

Many of these can be observed **without** the legacy code, on a dedicated test Telegram account, read-only: radar
pushes, digests, `/privacy` deletion, the `auth_date` window. 15-testing-strategy.md describes how. Any step that
touches production needs the developer's approval each time.

### 1.3 First developer (production track, shared decisions)

PostGIS on the shared server (DEC-09); the money, public-number, cursor, retention and compatibility-surface ADRs
(DEC-10, DEC-11, DEC-12, and the ADR tasks in 11). Also new dependencies (DEC-23), host capacity (DEC-28), the HTTPS
tunnel for live webhook checks (DEC-24), and listing acquisition: own reader vs `telegram.uz` (DEC-02). Redis per
environment (DEC-27) was answered by the production track on 2026-11-09.

### 1.4 Developer (development track)

The Mini App strategy spike (DEC-06, with the WebView data from Q-APP-001), the legacy artefact manifest (DEC-07),
the CSP baseline (DEC-08), and approval of each `PROPOSED` deviation (`DEV-…` in 09).

## 2. Register

<!-- generated:start -->

235 questions, generated from `data/ids.csv`.

| Area | Questions |
| ---- | --------: |
| System and scope (01) | 8 |
| API and server behaviour (02, 08) | 58 |
| Mini App (03) | 22 |
| Landing (03b) | 11 |
| SEO pages (03b) | 21 |
| Telegram bot (04) | 45 |
| Data model and migration (06, 14) | 50 |
| Security and personal data (16) | 20 |

### System and scope (01)

| Source | Question | Text (first line; details at the source) |
| ------ | -------- | ---- |
| `01-legacy-system-map.md:142` | Q-SYS-001 | Legacy backend source code (any part) — would turn most `DOCUMENTED_ONLY` server items into `CONFIRMED` — Product owner / legacy team |
| `01-legacy-system-map.md:143` | Q-SYS-002 | Legacy DB schema and a sanitised data sample (row counts, enum values) — blocks the data migration plan — Product owner / legacy team |
| `01-legacy-system-map.md:144` | Q-SYS-003 | KvadroSupportBot` behaviour — Product owner |
| `01-legacy-system-map.md:145` | Q-SYS-004 | Admin / moderation tooling and processes — Product owner |
| `01-legacy-system-map.md:146` | Q-SYS-005 | Contract freeze date for the legacy API while the new backend is built — Product owner + developer |
| `01-legacy-system-map.md:147` | Q-SYS-006 | Brand and domains after the migration (`kvadro.app` vs `homi.uz`); fate of the SEO addresses and of `@KvadroAppBot` — Product owner |
| `01-legacy-system-map.md:148` | Q-SYS-007 | Which fields land plots, commercial premises and daily-rent listings carry. The contract only describes the common field set (`$KVADRO_ROOT/docs/api.md:1118`). This blocks the per-type validation and card layout — Legacy team (DB sample) |
| `01-legacy-system-map.md:149` | Q-SYS-008 | Legal right to copy and re-host photos from third-party Telegram channels (`$KVADRO_ROOT/docs/about.md:566-567`). Affects the media migration and the landing photo snapshots — Product owner (lawyer) |

### API and server behaviour (02, 08)

| Source | Question | Text (first line; details at the source) |
| ------ | -------- | ---- |
| `02-legacy-backend-audit.md:47` | Q-API-001 | Are there rate limits or `429` responses on any `/api/*` route, and per what key (user id, IP)? *Check:* fire 50 rapid `GET /api/feed/count` requests from a dedicated test account and record statuses/headers; ask the legacy owner for the limiter configuration. |
| `02-legacy-backend-audit.md:73` | Q-API-002 | What `auth_date` age does the server accept, and is it enforced on every endpoint? *Check:* with a dedicated test account keep the Mini App open (no reload) for 1 h, 24 h and 48 h and call any action; record the status; or read the setting from the legacy deployment. |
| `02-legacy-backend-audit.md:76` | Q-API-003 | What status and body does the server return for a missing header, a tampered hash, a stale `auth_date` and `initData` signed by another bot (401? 403 `private`?)? *Check:* `curl` `GET /api/meta` in those four variants using the test account's own `initData`, record status and body. |
| `02-legacy-backend-audit.md:79` | Q-API-004 | Does the first authenticated request create the user row, and does the API record attribution from `start_param` (in `initData`) or only the bot's `/start`? *Check:* open the Mini App from `startapp=l_<id>-web` with a brand-new test account that never started the bot, then inspect `/api/meta` (403 ` |
| `02-legacy-backend-audit.md:118` | Q-API-005 | Which endpoints besides `/api/meta`, `/feed`, `/favorites`, `/history` enforce the gate (e.g. can a gated user still `POST /api/subscriptions`)? *Check:* with a test account in a gated state call every endpoint of the registry and record statuses. |
| `02-legacy-backend-audit.md:121` | Q-API-006 | What are the exact conditions of each reason: how is the seat count configured, where are invite tokens stored and consumed, is `join` "never sent /start" or "blocked the bot"? *Check:* legacy configuration and admin tooling (owner interview); data migration needs the invite/seat tables (`14-data-mi |
| `02-legacy-backend-audit.md:147` | Q-API-007 | What exactly does the `422` body contain (`type`, `loc`, `msg`, `input`, `ctx`, `url`), and which parameters are range-checked (`limit`, `rooms_*`, `price_*`, `area_*` 1–10000, polygon 3–40 vertices) versus silently ignored? *Check:* with a test account send `GET /api/feed?deal=x`, `limit=1000`, `ro |
| `02-legacy-backend-audit.md:168` | Q-API-008 | What is inside the cursor (offset, keyset), is it stable while new listings arrive, does it expire, and what is the maximum `limit`? *Check:* page through a busy feed with a test account while listings are ingested and look for duplicates/gaps; request `limit=100`; ask the owner for the implementati |
| `02-legacy-backend-audit.md:171` | Q-API-009 | Are favourites and history capped (count or age), and in which order are they returned? *Check:* inspect a heavy test account; owner interview. |
| `02-legacy-backend-audit.md:228` | Q-API-010 | What exactly do `sort=deal` (by `median_delta`?), `center` (by `center_km`?), `ppm` and the default order (first seen? last publication?) sort by, and what is the tie-breaker? *Check:* with a test account compare the first 40 items of each sort against the fields in the responses. |
| `02-legacy-backend-audit.md:231` | Q-API-011 | What is the `below_median` threshold (any negative `median_delta`, ≤ −10%, tone `good` only)? *Check:* `GET /api/feed?…&below_median=true` and inspect `median_delta`/`median_tone` of every item. |
| `02-legacy-backend-audit.md:233` | Q-API-012 | Formats of `city`, `district`, `renovation`, `appliance` codes (slug rules, stability) and the reaction to unknown codes (ignored, empty result, `422`)? *Check:* compare `meta` directories with SEO slugs; send an unknown district. |
| `02-legacy-backend-audit.md:236` | Q-API-013 | Are radars created before 2026-11-06 stored with `zone` and normalised on read, and does the server still accept `zone=`? *Check:* `GET /api/feed?…&zone=center` vs `zones=center` counts; legacy DB query for subscriptions with a `zone` key. |
| `02-legacy-backend-audit.md:239` | Q-API-014 | Does radar matching apply `posted_days` stored in a radar's filters? *Check:* create a radar with `posted_days=1` from the Mini App (test account) and observe deliveries of older-but-newly-seen listings; owner interview. |
| `02-legacy-backend-audit.md:242` | Q-API-015 | Is `/api/map` capped (`total` > `points.length`) and in what order are points returned? *Check:* call it for Tashkent rent with default filters and compare `total` with `/api/feed/count`. |
| `02-legacy-backend-audit.md:244` | Q-API-016 | Does `GET /api/cities` return one entry per `meta.cities` item, and is `typical` the median price of the city per deal? *Check:* compare `GET /api/cities` with `meta.cities` and with SEO city medians. |
| `02-legacy-backend-audit.md:283` | Q-API-017 | Which 217 channels, how often each is polled, how blocking/rate limits are handled, and whether closed channels are ever read? *Check:* owner interview; legacy channel table export (`14-data-migration-plan.md`). |
| `02-legacy-backend-audit.md:295` | Q-API-018 | Prompts, output schema, model version, retries, cost limits, and how voice messages are handled? *Check:* owner interview; legacy configuration. |
| `02-legacy-backend-audit.md:309` | Q-API-019 | Which algorithm merges duplicates, which id survives, and are merges reversible? *Check:* owner interview; find a listing id that redirects (`GET /api/listings/:old` returns another `id`) and compare sources. |
| `02-legacy-backend-audit.md:323` | Q-API-020 | Which geocoder and gazetteer (districts, blocks, ЖК, landmarks, mahallas) are used, and how is `geo_radius_m` derived? *Check:* owner interview; gazetteer export. |
| `02-legacy-backend-audit.md:363` | Q-API-021 | Meaning of `median` (flag) and `median_reason`, the classes `jk`/`house`, and the tone thresholds (`check`, `suspicious`, `no_repair`)? *Check:* owner interview; sample 50 listings per tone with a test account. |
| `02-legacy-backend-audit.md:402` | Q-API-022 | Exact formatting rules of `price`, `age`, `title`, `status_text`, `market` and `facts` per locale × currency (needed for byte parity). *Check:* with a test account fetch the same listing in `ru`, `uz_Latn`, `en` × `USD`, `UZS` and store the eight responses as golden fixtures. |
| `02-legacy-backend-audit.md:378` | Q-API-023 | What does `GET /api/listings/:id` return for a withdrawn listing within 90 days and after the PII purge (`200` with `status_text`, `404`)? Do favourites/history keep such items? *Check:* open an old listing id from the bot history of a test account; inspect favourites after the listing is withdrawn. |
| `02-legacy-backend-audit.md:335` | Q-API-024 | Signature algorithm and secret (MD5 or truncated HMAC?), issuing policy for `e`, and whether the Mini App receives the same signed URLs as SEO pages. *Check:* compare `photos_preview` URLs from `/api/feed` with SEO page image URLs for the same listing; owner for the algorithm (needed to keep issued  |
| `02-legacy-backend-audit.md:387` | Q-API-025 | Are translations cached (per listing × language), and is the target the profile locale or the bot language? *Check:* translate the same listing twice and time it; switch locale and repeat. |
| `02-legacy-backend-audit.md:405` | Q-API-026 | Is `CityMeta.zoom < 11` really the "region, not a city" marker (`TODO: inferred from build`), and what are the six cities/regions and their zooms? *Check:* `GET /api/meta` with a test account; inspect `cities[]`. |
| `02-legacy-backend-audit.md:484` | Q-API-027 | What triggers matching (new listing, price change, repost, status change), and with what latency? *Check:* owner interview; observe a test radar for a week and log delivery times vs `history[].at`. |
| `02-legacy-backend-audit.md:486` | Q-API-028 | Digest message format, ordering, size cap and the behaviour at the quiet-hours boundary. *Check:* test account with `digest` mode and quiet `23-08` for several days; capture messages. |
| `02-legacy-backend-audit.md:488` | Q-API-029 | Which preset lists does `GET /api/settings` actually return? *Check:* `GET /api/settings` with a test account; compare with bot `/settings`. |
| `02-legacy-backend-audit.md:490` | Q-API-030 | When is `ask_found` true (every pause/delete, once per user, after N days, only when no survey answer exists)? *Check:* pause/delete radars repeatedly with a test account; owner interview. |
| `02-legacy-backend-audit.md:492` | Q-API-031 | Delivered-card tracking: per user or per radar, retention, and what `PUT` and `DELETE` reset; the default `mode` of a radar created in the Mini App. *Check:* owner interview; create a radar via `POST` and read its `mode`; migration must carry delivered cards (About:430). |
| `02-legacy-backend-audit.md:495` | Q-API-032 | The hide-rule model behind `Subscription.hidden` (channel, district, author?) and whether `GET /api/hidden` shows these rules. *Check:* use «Скрыть похожие» in the bot with a test account, then `GET /api/subscriptions` and `GET /api/hidden`. |
| `02-legacy-backend-audit.md:498` | Q-API-033 | The `starter` window and semantics for create (last 3 days?), edit and resume (unseen only?). *Check:* compare `starter` with `/api/feed/count` + `posted_days=3` for the same filters. |
| `02-legacy-backend-audit.md:500` | Q-API-034 | How `entry` and `relaxed` are stored, whether `relaxed` is validated against the filters, whether unknown relax codes are rejected, and whether duplicate `POST`s are prevented server-side. *Check:* owner interview; double-submit `POST /api/subscriptions` from a test account. |
| `02-legacy-backend-audit.md:532` | Q-API-035 | Which action records history and `viewed` (full `GET`, `?preview=1`, opening from the bot), and does it increment `stats.views`? *Check:* with a test account open a listing only via the map preview, then check `GET /api/history`; repeat with a full open. |
| `02-legacy-backend-audit.md:535` | Q-API-036 | Do `/api/feed`, `/count`, `/flow`, `/map` and radar delivery exclude the user's hidden listings and blocked authors server-side? *Check:* hide a listing and block an author with a test account, reload the app and search for them. |
| `02-legacy-backend-audit.md:538` | Q-API-037 | Does `GET /api/hidden` include listings hidden by a `fraud`/`rented` report or by radar rules, and does `DELETE /api/hidden` clear those too? *Check:* report a listing as `fraud` with a test account and inspect `GET /api/hidden`. |
| `02-legacy-backend-audit.md:556` | Q-API-038 | Semantics of repeated `favorite` (toggle race), `hide`, `block-author`, `report` (same user, same reason): duplicate rows, ignored, re-counted? *Check:* call each twice in parallel and sequentially with a test account; inspect resulting state. |
| `02-legacy-backend-audit.md:559` | Q-API-039 | Thresholds for `rented` and `agent`, and the anti-abuse weighting formula. *Check:* owner interview; legacy configuration. |
| `02-legacy-backend-audit.md:561` | Q-API-040 | Does `DELETE /api/listings/:id/hide` also withdraw a `rented` vote or a `fraud` report (the bot's «↩️ Не сдано» is assumed to map to it 🔶)? *Check:* vote `rented` in the bot, press «↩️ Не сдано», compare with the Mini App undo. |
| `02-legacy-backend-audit.md:581` | Q-API-041 | Hash algorithm (salted? keyed?) and normalisation of the number — required to migrate verifications. *Check:* owner interview / legacy code. |
| `02-legacy-backend-audit.md:598` | Q-API-042 | Call link TTL, single-use, binding to the requesting user, and the content of the `/call` page. *Check:* with a test account open a call link after 5, 11 and 60 minutes, twice, and from another device; capture the page HTML. |
| `02-legacy-backend-audit.md:601` | Q-API-043 | What `contact_paid` means and whether any paid feature exists. *Check:* owner interview; find a listing with `contact_paid: true`. |
| `02-legacy-backend-audit.md:625` | Q-API-044 | How `POST /api/listings/:id/share` builds the prepared message (Bot API method, content, buttons, expiry, per-user scope)? *Check:* share from a test account and inspect the delivered message and its button; owner interview. |
| `02-legacy-backend-audit.md:650` | Q-API-045 | Maximum `/api/events` payload, per-user rate limit, retention and PII rules for stored events. *Check:* owner interview; post a 64 KB event from a test account and record the status. |
| `02-legacy-backend-audit.md:652` | Q-API-046 | Which events are captured server-side to PostHog, where the user → random id mapping lives, and how person deletion is called — the mapping must be migrated to keep history (About:431). *Check:* owner interview; PostHog project audit. |
| `02-legacy-backend-audit.md:655` | Q-API-047 | When is `meta.analytics` `null`, and how are `env`, `team`, `replay`, `replay_rate` chosen per user? *Check:* compare `meta.analytics` for an owner/team account and a regular test account. |
| `02-legacy-backend-audit.md:668` | Q-API-048 | Which tables the deletion covers (radars, votes, owner hash, delivered cards, events, attribution), how backups age out, and how votes of deleted users are treated. *Check:* owner interview; deletion procedure. |
| `02-legacy-backend-audit.md:692` | Q-API-049 | Do `/api/landing/live` and `/api/landing/pins` exist, and are they the sources the snapshot job copies? *Check:* `curl -I https://kvadro.app/api/landing/live` and `/pins`. |
| `02-legacy-backend-audit.md:694` | Q-API-050 | What does `/api/csp-report` do (status, storage, retention, alerting)? *Check:* post a synthetic report to the endpoint; owner interview. |
| `02-legacy-backend-audit.md:696` | Q-API-051 | Generator and exact schedule of the landing data and snapshots; selection rules for `latest` and `pins` (age, area, tones). *Check:* poll the files' `Last-Modified` for a week; owner interview. |
| `02-legacy-backend-audit.md:731` | Q-API-052 | Exact schedules, concurrency and failure handling of every job above. *Check:* owner interview; crontab/systemd/queue configuration of the legacy host. |
| `02-legacy-backend-audit.md:759` | Q-API-053 | Where are the vector tiles hosted (PMTiles file or `/tiles` template), how large, which licence and update process? *Check:* `GET /api/meta` with a test account → `tiles`; `curl -I -H 'Range: bytes=0-1'` on it. |
| `02-legacy-backend-audit.md:761` | Q-API-054 | Source and refresh time of `usd_uzs` and the rounding used for UZS display strings. *Check:* record `meta.usd_uzs` daily for a week and compare with the CBU published rate. |
| `02-legacy-backend-audit.md:763` | Q-API-055 | Confirm the stack (FastAPI is inferred from error shapes), how the bot receives updates (webhook URL or `getUpdates`) and the support bot's backend. *Check:* owner interview; Bot API `getWebhookInfo` run by the owner. |
| `02-legacy-backend-audit.md:781` | Q-API-056 | Which cache headers does `/api/*` send (none, `private`, `no-store`), including the public `GET /api/bot`? *Check:* `curl -i` each GET endpoint with a test account. |
| `02-legacy-backend-audit.md:803` | Q-API-057 | Is the language one field for bot and Mini App, and does a Mini App locale change re-localise the bot commands? *Check:* change language in the Mini App with a test account and open the bot menu. |
| `02-legacy-backend-audit.md:733` | Q-API-058 | Which admin and moderation tools exist (beta seats and invites, takedowns, channel opt-outs, «Новости сервиса» broadcasts, blocking users)? *Check:* owner interview (About:584-585). |

### Mini App (03)

| Source | Question | Text (first line; details at the source) |
| ------ | -------- | ---- |
| `03-legacy-frontend-audit.md:2025` | Q-APP-001 | What is the real minimum WebView the Mini App must support? — Pull the `platform` / `tg` distribution from `app_launch` and `app_error` in the legacy journal or PostHog; run a syntax checker over the prod bundle in `tools/parity/original/assets/` (read-only). |
| `03-legacy-frontend-audit.md:2026` | Q-APP-002 | Did the engine badge ever ship to users? — Inspect the prod chunks `MapView-*.js` / `MapViewGL-*.js` in `tools/parity/original/assets/` for the badge render. Product decision: drop it. |
| `03-legacy-frontend-audit.md:2027` | Q-APP-003 | Is the GL label halo correct? — Confirm with the existing `gl-parity` style comparison (16/16 identical per RECOVERY.md:71-74); visual check against a prod screenshot. |
| `03-legacy-frontend-audit.md:2028` | Q-APP-004 | Does `zoom < 11` really mean "region"? — Read `cities[].zoom` from a real `GET /api/meta` and confirm with the backend owner. `$KVADRO_ROOT/docs/api.md` §4 repeats the rule, but it was derived from code. |
| `03-legacy-frontend-audit.md:2029` | Q-APP-005 | Can `GET /api/feed/flow` return 204 or an empty body? (LB-APP-006) — Call it with very narrow filters on a test account and record the status and body. |
| `03-legacy-frontend-audit.md:2030` | Q-APP-006 | Do `POST` / `PUT /api/subscriptions` always return `relaxed[]` when `starter = 0` and `options` is empty? (LB-APP-005) — Contract check against `$KVADRO_ROOT/docs/api.md` §7 and a live call. |
| `03-legacy-frontend-audit.md:2031` | Q-APP-007 | What values can `median_rooms` take (0, fractions)? (LB-APP-015) — Sample `GET /api/listings/:id` responses with `median_scope = near`. |
| `03-legacy-frontend-audit.md:2032` | Q-APP-008 | Which `nearby[].kind` values exist? (LB-APP-016) — Sample listing responses; ask the backend owner for the enum. |
| `03-legacy-frontend-audit.md:2033` | Q-APP-009 | Can favourites or history return a non-null `next_cursor`? (LB-APP-022) — Call both with more than 20 entries. |
| `03-legacy-frontend-audit.md:2034` | Q-APP-010 | What are the server enums for `subscription.mode` and filter `types`? — Backend contract; the radar list with legacy radars. |
| `03-legacy-frontend-audit.md:2035` | Q-APP-011 | Do server-formatted strings (`price`, `age`, `label`, `title`) follow the user's currency and locale? — Call `/api/feed` and `/api/listings/:id` after `PUT /api/settings` with each currency and locale. |
| `03-legacy-frontend-audit.md:2036` | Q-APP-012 | Can map `label` contain HTML or user text? (LB-APP-020) — Sample `GET /api/map`; `$KVADRO_ROOT/docs/api.md` warns about HTML in labels. |
| `03-legacy-frontend-audit.md:2037` | Q-APP-013 | When are `meta.locale_chosen` and `meta.city_chosen` false, and can they reset? — Backend owner; a fresh Telegram test account. |
| `03-legacy-frontend-audit.md:2038` | Q-APP-014 | Are the closed-beta gates (`invite`, `full`, `join`) active in production? — Open the bot with a fresh account; ask the backend owner. |
| `03-legacy-frontend-audit.md:2039` | Q-APP-015 | Is `meta.tiles` in production a `.pmtiles` URL, a `{z}/{x}/{y}` template or `null`? On which host? — Read `GET /api/meta`. This affects the RES items, CSP and tile prefetch. |
| `03-legacy-frontend-audit.md:2040` | Q-APP-016 | What is the legacy CSP header for `app.kvadro.app` (script hashes, connect-src)? — `curl -sI https://app.kvadro.app/` from an allowed machine; record it in `17-infrastructure-and-deployment.md`. |
| `03-legacy-frontend-audit.md:2041` | Q-APP-017 | What does `contact_paid` mean, given the button «Номер платный»? — Backend owner; sample a listing with `contact_paid: true`. |
| `03-legacy-frontend-audit.md:2042` | Q-APP-018 | How many sessions use GL, Leaflet or lite? (decides whether to port Leaflet) — PostHog: `build` plus screen events joined with UA; or add a temporary event in the new app. |
| `03-legacy-frontend-audit.md:2043` | Q-APP-019 | Do bot buttons open the Mini App with `?listing=` / `?news=` (URL) or with `startapp`? — Read the bot's `web_app` button URLs in `$KVADRO_ROOT/docs/telegram-bot.md` and `04-telegram-bot-audit.md`. |
| `03-legacy-frontend-audit.md:2044` | Q-APP-020 | Do the parity mocks match real API shapes for every state above? — Record real responses for each endpoint on a test account and diff them against `tools/parity/mocks*.mjs`. |
| `03-legacy-frontend-audit.md:2045` | Q-APP-021 | Does `GET /api/bot` return `support`, and which account? — Call `GET /api/bot`. |
| `03-legacy-frontend-audit.md:2046` | Q-APP-022 | Do support staff use `?map=gl — leaflet — auto` overrides? — Ask the operators; otherwise treat it as a debug-only feature. |

### Landing (03b)

| Source | Question | Text (first line; details at the source) |
| ------ | -------- | ---- |
| `03b-legacy-landing-seo-audit.md:1787` | Q-LND-001 | Who stamps `?v=` on JS/CSS in prod (deploy or server), and is anything else derived from file hashes (`REC:58-59`, `REC:95`)? — Ask the legacy team; otherwise irrelevant once the new build owns hashing. |
| `03b-legacy-landing-seo-audit.md:1788` | Q-LND-002 | Schedule and generator of `data/*.json` and `img/snap/*` (`scripts/landing_snapshot.py`, `app/api/landing.py`); do `/api/landing/live` and `/api/landing/pins` exist? (also `08-api-inventory.md`, `GET /api/landing/live`) — Legacy team; or watch `Last-Modified` of the three data files on prod for 48 h |
| `03b-legacy-landing-seo-audit.md:1789` | Q-LND-003 | Does a JS-rendering crawler (Google) see English content on `/` (LB-LND-002)? — Search Console URL Inspection → rendered HTML of `/`; the language of the Google snippet for `kvadro.app`. |
| `03b-legacy-landing-seo-audit.md:1790` | Q-LND-004 | How the bot stores and uses `s_web[_<tag>]` and `--v<visit>` (and `s_seo_*`). Where is `docs/analytics.md`, which `landing.js:27` cites but our material lacks? — Legacy team; a `start` payload export or attribution report from the bot DB / PostHog. |
| `03b-legacy-landing-seo-audit.md:1791` | Q-LND-005 | Which `?s=` / `utm_source` tags are in circulation (ads, Instagram bio, partner posts)? — PostHog: distinct `$current_url` query values on `kvadro.app`; bot attribution table. |
| `03b-legacy-landing-seo-audit.md:1792` | Q-LND-006 | Prod response for unknown landing paths (JSON `404` or HTML) and for `/favicon.ico` (not among the 35 mirrored files). — `curl -sI https://kvadro.app/does-not-exist`, `…/favicon.ico` (team action). |
| `03b-legacy-landing-seo-audit.md:1793` | Q-LND-007 | Full landing response headers: HTML `Cache-Control`, HSTS, `Referrer-Policy`; static assets and data `max-age` (1 800 observed for data). — `curl -sI` on `/`, `/landing.js?v=…`, `/data/live.json` (team action). |
| `03b-legacy-landing-seo-audit.md:1794` | Q-LND-008 | PostHog continuity: which project, dashboards and insights depend on `site`, `visit`, `env` and on landing autocapture selectors (`data-l` keys, classes)? — PostHog project review with the owner before the new landing changes markup. |
| `03b-legacy-landing-seo-audit.md:1795` | Q-LND-009 | Format of the `web_app` button URLs in already-sent bot messages (`BOT:657` 🔶 «URL с id объявления») and whether they survive a domain change of `app.kvadro.app` (redirect plus `#tgWebAppData` fragment). — Legacy team; inspect a sent card's `reply_markup` in a test chat; test a `301` with a staging  |
| `03b-legacy-landing-seo-audit.md:1796` | Q-LND-010 | One definition of «below market» for HOMI: landing «≥ 20 %» (`bargains_week`, savings) vs tone `good` at ≥ 10 % (BR-SEO-014); HOMI's own brief says «about 20 %». — Product decision; record it in `07-business-rules.md`. |
| `03b-legacy-landing-seo-audit.md:1797` | Q-LND-011 | Is `?v=1` / `?v=2` (or any debug parameter) used in shared links or ads? — PostHog `$current_url` query scan. |

### SEO pages (03b)

| Source | Question | Text (first line; details at the source) |
| ------ | -------- | ---- |
| `03b-legacy-landing-seo-audit.md:1803` | Q-SEO-001 | Full content of all pages. Only 25 of 1 008 were sampled; `area.css`, the SVGs and the uz/en texts are not mirrored. The sitemap count also needs re-checking (1 012 vs `REC:62` «около 1020»). — Crawl every URL in `sitemap.xml` plus the two CSVs, `area.css` and `og-*.jpg` before cut-over. Store them  |
| `03b-legacy-landing-seo-audit.md:1804` | Q-SEO-002 | Exact noindex threshold: is a page with exactly 10 listings indexed? (BR-SEO-035) — Find a slice with 10 listings in the crawl, or ask the legacy team. |
| `03b-legacy-landing-seo-audit.md:1805` | Q-SEO-003 | How sitemap `lastmod` is computed (BR-SEO-034). — Compare `lastmod` with the newest card age across crawled pages; legacy team. |
| `03b-legacy-landing-seo-audit.md:1806` | Q-SEO-004 | uz and en `<title>` / `description` templates and block texts for every page type (verified on 4 pages only). — From the Q-SEO-001 crawl: extract the head of each type × language. |
| `03b-legacy-landing-seo-audit.md:1807` | Q-SEO-005 | Which PostHog events fire on SEO pages (LND-063). — Browser devtools on one district page: network calls to `eu.i.posthog.com`. |
| `03b-legacy-landing-seo-audit.md:1808` | Q-SEO-006 | How a listing is attached to a quarter, landmark or station (Gemini and geocoding; BR-SEO-020/021). — Legacy backend source or team; otherwise define it anew and mark a DEV. |
| `03b-legacy-landing-seo-audit.md:1809` | Q-SEO-007 | Photo signature algorithm and `e` issuance (same as Q-API-024). Do already-rendered legacy pages need legacy-valid signatures after cut-over? — Legacy team. Signatures expire in ≤ 2 days, so a short overlap is enough. |
| `03b-legacy-landing-seo-audit.md:1810` | Q-SEO-008 | What makes a combination "exist" (dictionary vs data)? What happens when a slice drops below the threshold or to 0: `200 noindex` or `404`? (BR-SEO-036) — Watch a shrinking slice over days; legacy team. |
| `03b-legacy-landing-seo-audit.md:1811` | Q-SEO-009 | Do CSV exports exist under `/uz/…` and `/en/…` (`/en/rent/index/kvadro-rent-index.csv`)? Which CSV URL do uz/en pages link? — From the crawl. |
| `03b-legacy-landing-seo-audit.md:1812` | Q-SEO-010 | Is `metro` untranslated in uz/en (`/uz/ijara/tashkent/metro/`, `/en/rent/tashkent/metro/`)? Station slugs are the same in all languages. — `sitemap.xml` grep. |
| `03b-legacy-landing-seo-audit.md:1813` | Q-SEO-011 | Does the header language switch link to the alternate of the same page? — From the crawl. |
| `03b-legacy-landing-seo-audit.md:1814` | Q-SEO-012 | How the bot answers `s_seo_*` payloads (greeting, stored attribution); `BOT:997-1017` lists only `s_web`, `s_friend`, `s_<src>--l<id>`. — Send `/start s_seo_tashkent` to the prod bot from a test account (team action), or legacy team. |
| `03b-legacy-landing-seo-audit.md:1815` | Q-SEO-013 | Index history: the rent-index months and weeks and the sale-price months since 2026-10-01 must not change after migration (BR-SEO-017). Can the new backend recompute them identically from migrated data, or must the series be migrated as data? — Archive both CSVs at cut-over; compare a recompute in s |
| `03b-legacy-landing-seo-audit.md:1816` | Q-SEO-014 | Source and update process of the salary figure (Nationalstat release, manual entry?), and rounding of «% зарплаты». — Legacy team; methodology text. |
| `03b-legacy-landing-seo-audit.md:1817` | Q-SEO-015 | Versions and licences of the open data (`opendata.tashkent.uz/data/132`, `/134`), the school rating set and OSM school extraction. — Legacy team; the open-data portal pages. |
| `03b-legacy-landing-seo-audit.md:1818` | Q-SEO-016 | Sort definitions (`below` = ascending `delta`?, tie-breaks), the date basis of «новых за 7 дней» (first seen or posted), and the rules of the district-rank sentence. — Legacy team; compare orders in the crawl. |
| `03b-legacy-landing-seo-audit.md:1819` | Q-SEO-017 | Search Console coverage now: indexed vs «discovered – not indexed» per page type; are thin pages linked from indexable ones? (LB-SEO-012) — Search Console export by the owner; the crawl's link graph. |
| `03b-legacy-landing-seo-audit.md:1820` | Q-SEO-018 | Is the SEO «near» median and badge the same calculation as the Mini App `median_*` (BR-SEO-033)? — For a few listings, compare the SEO card badge with `GET /api/listings/:id` `median_*` (team action). |
| `03b-legacy-landing-seo-audit.md:1821` | Q-SEO-019 | Are channels read via `t.me/s/<channel>` (BR-SEO-037)? Also `about.md` §11 item 3. — Legacy team. |
| `03b-legacy-landing-seo-audit.md:1822` | Q-SEO-020 | Template of the Tashkent region city page. Are `chirchiq`, `olmaliq`, `zangiota`, `qibray`, `toshkent-tumani` districts or towns in the place model? (tag `s_seo_tashkent-region_chirchiq`) — From the crawl; legacy team. |
| `03b-legacy-landing-seo-audit.md:1823` | Q-SEO-021 | Which numbers in the methodology are dynamic («217 каналов», dates)? — From the crawl at two dates. |

### Telegram bot (04)

| Source | Question | Text (first line; details at the source) |
| ------ | -------- | ---- |
| `04-telegram-bot-audit.md:1343` | Q-BOT-001 | What does `🗑 Удалить мои данные` do: confirmation step, reply text, scope (radars, votes, owner hash, attribution, delivered log), PostHog erase? — BOT-080, BTN-076, TXT-BOT-084, BR-BOT-094 — Press it on a test account at the end of all other checks and record every message; or read the legacy handl |
| `04-telegram-bot-audit.md:1344` | Q-BOT-002 | Format of a real-time radar push: same card as BOT-059? radar name? silent notification? — BOT-081, TXT-BOT-086 — Test account with a broad radar (Ташкент, аренда, любой бюджет) left on for an hour; capture the pushes — test account |
| `04-telegram-bot-audit.md:1345` | Q-BOT-003 | Digest format, size cap, empty digests; quiet-hours boundary and morning digest time — BOT-082, BOT-083, BR-BOT-077, TXT-BOT-087 — Test account: one radar in digest mode with `09:00 и 19:00`, quiet hours `23:00–07:00`; capture 07:00–09:30 and 19:00 messages — test account |
| `04-telegram-bot-audit.md:1346` | Q-BOT-004 | Service news: content, frequency, who sends it, tool used, effect of opting out — BOT-084, BTN-072, TXT-BOT-088 — Ask the product owner; keep a test account subscribed and capture the next broadcast — owner |
| `04-telegram-bot-audit.md:1347` | Q-BOT-005 | Voice queries: accepted? same review screen? limits on length? — BOT-056 — Send a 5-second voice note from a phone on a test account — test account |
| `04-telegram-bot-audit.md:1348` | Q-BOT-006 | Replies to `🎉 Да, через kvadro²`, `🔎 Ещё ищу`, `🙅 Больше не ищу` and the other where-options; poll after delete; suppression window — BOT-069…BOT-071, TXT-BOT-071 — Pause/delete radars on a test account across several days, one answer each; owner for the suppression rule — test account / owner |
| `04-telegram-bot-audit.md:1349` | Q-BOT-007 | Behaviour at the 10-radar limit from `/new`, free text, `➕ Новый радар` and on resume — BR-BOT-064 — Create 10 radars on a test account, then try an 11th by each path — test account |
| `04-telegram-bot-audit.md:1350` | Q-BOT-008 | owner` outcomes: number with listings, ≥3 flats, realtor number, contact of another person — BOT-077, TXT-BOT-081, BR-BOT-082 — Read the legacy handler; or send a forwarded foreign contact on a test account (no real number stored) — owner |
| `04-telegram-bot-audit.md:1351` | Q-BOT-009 | When is the realtor row in «Скрыть похожие» shown, with which label and scope? — BTN-047 — Open cards of listings with a known phone on a test account; or the legacy handler — test account |
| `04-telegram-bot-audit.md:1352` | Q-BOT-010 | Untested wizard details: `🏙 Ближе к центру`, `✅ Весь <город>`, pets row in the summary, reply to `📬 Подборкой` in the tip, Back from the amount prompt — BTN-013, BTN-016, BTN-024, BTN-033, TXT-BOT-038 — Press each on a test account, then cancel — test account |
| `04-telegram-bot-audit.md:1353` | Q-BOT-011 | Exact web_app URLs and `start_param` of the menu button, Main Mini App, BTN-001, BTN-004, BTN-005, BTN-035 — BOT-004, BOT-005 — Owner reads BotFather settings; for inline buttons, read `reply_markup` of the test chat with an MTProto user client (read-only dump of one's own chat) — owner |
| `04-telegram-bot-audit.md:1354` | Q-BOT-012 | What happens when a user blocks the bot: deliveries stopped, user flagged, radars paused? — BOT-081, BR-BOT-099 — Owner / legacy code; block the bot on a test account and observe the Mini App `409 no_chat` — owner |
| `04-telegram-bot-audit.md:1355` | Q-BOT-013 | Non-text messages (photo, sticker, location, document, forwarded post, contact outside `/owner`) and group behaviour — BOT-057, BOT-058 — Send each type on a test account; add the bot to a private test group — test account |
| `04-telegram-bot-audit.md:1356` | Q-BOT-014 | All UZ and EN texts beyond `/start` and `/settings`; UZ command descriptions; whether commands use per-chat scopes — BOT-007, TXT-BOT-005 — Switch a test account to uz and en and repeat every scenario; owner calls `getMyCommands` per `language_code` and per chat scope — test account / owner |
| `04-telegram-bot-audit.md:1357` | Q-BOT-015 | Does `Сумы` change prices on cards, lists, presets and the summary? — BR-BOT-079, LB-BOT-019 — Set `Сумы` on a test account and repeat `/new`, a card and `/fav` — test account |
| `04-telegram-bot-audit.md:1358` | Q-BOT-016 | Functionality of `@KvadroSupportBot`, including its `?start=l_<id>` payload — BOT-011, BOT-035 — Separate audit of the support bot — owner |
| `04-telegram-bot-audit.md:1359` | Q-BOT-017 | Legacy `callback_data` grammar and how wizard state is stored — §6.3 — Legacy handler source; or a read-only dump of `reply_markup` (callback bytes) of a test chat through an MTProto user client — owner |
| `04-telegram-bot-audit.md:1360` | Q-BOT-018 | What makes a wizard "outdated": a newer wizard, a TTL, or a restart? — BOT-023, BOT-036 — Start wizard A, then B, press A; separately leave one wizard 24 h and press — test account |
| `04-telegram-bot-audit.md:1361` | Q-BOT-019 | Are name, description and short description set per `language_code` or once? — BOT-001…BOT-003 — Owner calls `getMyName`, `getMyDescription`, `getMyShortDescription` for `ru`, `uz`, `en`; or view the profile with the Telegram UI in each language — owner |
| `04-telegram-bot-audit.md:1362` | Q-BOT-020 | Is the menu button label localised, and is it set per chat? — BOT-004, TXT-BOT-004 — View the chat with the Telegram UI in EN and UZ; owner calls `getChatMenuButton` for a test chat — owner |
| `04-telegram-bot-audit.md:1363` | Q-BOT-021 | Target and content of the privacy-policy link in the profile — BOT-006 — Open the link from the bot profile — anyone |
| `04-telegram-bot-audit.md:1364` | Q-BOT-022 | Sticker set names or source files for both stickers; description picture and avatar files — BOT-009, BOT-010 — Owner provides files or sticker-set names (`file_id` cannot be reused by another bot) — owner |
| `04-telegram-bot-audit.md:1365` | Q-BOT-023 | What the phrase parser extracts (city, districts, zones, metro, rooms, budget, owner, tenant, pets, below market), which languages and currencies it accepts, and its prompt — BOT-054, BOT-055 — Legacy prompt and schema from the owner; a fixed list of test phrases in ru/uz/en on a test account — owne |
| `04-telegram-bot-audit.md:1366` | Q-BOT-024 | Typed-amount parser: accepted formats, minimum and maximum, zero or negative, commands during the wait, wait TTL — BOT-043, LB-BOT-018 — Send `650$`, `85 000`, `85k`, `0`, `-5`, `9999999999`, `/subs` during the wait on a test account — test account |
| `04-telegram-bot-audit.md:1367` | Q-BOT-025 | Step numbering when the rooms step is skipped — LB-BOT-016 — `/new` → `🔑 Снять надолго` → `Комната / подселение`; read the next header — test account |
| `04-telegram-bot-audit.md:1368` | Q-BOT-026 | Editing in the bot a radar created in the Mini App with filters the bot cannot show (`price_min`, `polygon`, `furnished`, `renovation`, floors, area, `market`, `appliances`, `posted_days`): shown? kept on save? — BOT-066, BOT-067 — Create such a radar in the Mini App on a test account; edit its budg |
| `04-telegram-bot-audit.md:1369` | Q-BOT-027 | Is `tenant` stored for rent_daily radars made in the bot? — LB-BOT-030, BR-BOT-037 — Create a rent_daily radar with `Семья` in the bot; read `GET /api/subscriptions` in the Mini App devtools on the test account — test account |
| `04-telegram-bot-audit.md:1370` | Q-BOT-028 | Scope of hide rules: which radar gets a rule from `/fav`, a starter list or with several radars; relation to `GET /api/hidden` and `Subscription.hidden` (a count, not a list) — BTN-045, BTN-046, LB-BOT-025 — Test account with two radars; hide from a `/fav` card; compare both radar cards and the Mini |
| `04-telegram-bot-audit.md:1371` | Q-BOT-029 | Vote thresholds for «Уже сдано» and «Это риелтор»; the anti-fraud formula — BR-BOT-061, BR-BOT-062, BR-BOT-087 — Legacy code or owner — owner |
| `04-telegram-bot-audit.md:1372` | Q-BOT-030 | Does saving an edit of a paused radar resume it? — LB-BOT-021 — Pause a radar on a test account, edit and save, reopen its card — test account |
| `04-telegram-bot-audit.md:1373` | Q-BOT-031 | Text, buttons and triggers of the «Объявление снято» edit — BOT-062, TXT-BOT-047 — Owner / legacy code; or watch a card of a listing known to be rented — owner |
| `04-telegram-bot-audit.md:1374` | Q-BOT-032 | Bot replies to and storage of `s_web`, `s_web_<tag>`, `--v<visit>`, `s_seo…`, `s_friend` and unknown payloads; first-touch or last-touch attribution — BOT-027…BOT-034 — Send `/start <payload>` for each on a test account; owner for the attribution table — test account / owner |
| `04-telegram-bot-audit.md:1375` | Q-BOT-033 | Delivery triggers (new, price change, repost, status change); favourite notifications; exclusion rules — BOT-081, BR-BOT-101 — Legacy code or owner (`ab:574–575`) — owner |
| `04-telegram-bot-audit.md:1376` | Q-BOT-034 | Telegram send rate, retry on 429, volumes (users, active radars, sends per day) — §5 — Owner (`ab:590–591`) — owner |
| `04-telegram-bot-audit.md:1377` | Q-BOT-035 | Initial language of a new user, and the language of commands before any choice — BOT-026 — Start the bot from a fresh test account with the Telegram UI in English, then Uzbek — test account |
| `04-telegram-bot-audit.md:1378` | Q-BOT-036 | Definitions of «актуальных» and «за сутки новых» in the welcome — BR-BOT-012 — Owner; compare with the landing live data at the same minute — owner |
| `04-telegram-bot-audit.md:1379` | Q-BOT-037 | Is the `/owner` reply keyboard removed after a successful share? What does other text do while it is shown? — BOT-075…BOT-077 — Test account: share, then type text while the keyboard is up — test account |
| `04-telegram-bot-audit.md:1380` | Q-BOT-038 | Cap on the starter list and on `/fav` length — BOT-052, BOT-073 — A broad radar on a test account; add 30 favourites — test account |
| `04-telegram-bot-audit.md:1381` | Q-BOT-039 | Thresholds of the flow wordings and «Это много»; the full set of relax options and their labels — BR-BOT-040, BR-BOT-041, BTN-027 — Owner / legacy code; or vary filters on a test account — owner |
| `04-telegram-bot-audit.md:1382` | Q-BOT-040 | Where «Новости сервиса» is stored (no API field) and how to migrate it — BR-BOT-080 — Owner / DB schema — owner |
| `04-telegram-bot-audit.md:1383` | Q-BOT-041 | After a deal change forces step 2 in edit mode, does the flow return to the review or continue step by step? — BOT-048 — Test account: review of a room rental → `✏️ Сделка` → `🏷 Купить` → pick an object — test account |
| `04-telegram-bot-audit.md:1384` | Q-BOT-042 | Phone hash scheme (normalisation, algorithm, salt or key); needed to migrate owner verifications — BR-BOT-081, LB-BOT-029 — Owner / legacy code — owner |
| `04-telegram-bot-audit.md:1385` | Q-BOT-043 | Does a language change in the Mini App switch the bot's language and command menu? — BOT-025 — Change language in the Mini App on a test account, then `/start` and open the command menu — test account |
| `04-telegram-bot-audit.md:1386` | Q-BOT-044 | Are the bot's cities, districts, zones, median availability and presets the same data as `GET /api/meta` / `GET /api/cities`, and what are the codes behind the labels? — BR-BOT-026, BR-BOT-031, BR-BOT-032 — Compare the Mini App's `/api/meta` response (devtools on a test account) with `tb:351–358` an |
| `04-telegram-bot-audit.md:1387` | Q-BOT-045 | Text of the `▶️ Включить` toast when new matches exist — BTN-051, TXT-BOT-063 — Resume a radar on a test account after a few hours paused — test account |

### Data model and migration (06, 14)

| Source | Question | Text (first line; details at the source) |
| ------ | -------- | ---- |
| `06-database-schema.md:1501` | Q-DATA-001 | What is the legacy schema (tables, columns, types, constraints, indexes, sequences, extensions, views, functions, triggers)? — Q-SYS-002; all ENT — `pg_dump --schema-only --no-owner` plus `\dx` from the owner; commit a redacted copy under `docs/migration/data/` — owner |
| `06-database-schema.md:1502` | Q-DATA-002 | How many rows and bytes per table, and how fast does each grow? — Q-SYS-002 — `select relname, n_live_tup, pg_total_relation_size(relid) from pg_stat_user_tables order by 3 desc;` run twice a week apart — owner |
| `06-database-schema.md:1503` | Q-DATA-003 | Can we get a sanitised sample (≤ 1 000 rows per table, Telegram ids and phones replaced by consistent fakes, texts truncated)? — Q-SYS-002 — Owner runs an agreed masking script; we profile null rates, enum values, code formats — owner |
| `06-database-schema.md:1504` | Q-DATA-004 | Through which path do we receive the data (encrypted dump file, read replica, VPN), who runs the export, and how is it stored and destroyed? — `14` §1 — Written agreement on transfer, storage location, retention and destruction — owner + developer |
| `06-database-schema.md:1505` | Q-DATA-005 | What is the legal basis for transferring users' personal data (Telegram ids, behaviour, phone hashes) and listing authors' phone numbers to HOMI under the Law of the Republic of Uzbekistan «On personal data» (ZRU-547), including its localisation requirement, and must users be notified or the `/priva |
| `06-database-schema.md:1506` | Q-DATA-006 | User table: columns, when the row is created (bot `/start` or first API call), the profile flags, bot reachability and blocked state? — ENT-001; Q-API-004 — Schema + `select count(*) filter (where …)` per flag on the dump — owner |
| `06-database-schema.md:1507` | Q-DATA-007 | How are locale, currency, theme, city, quiet, digest and service news stored; what marks `locale_chosen` / `city_chosen`; is the language one field for bot and app? — ENT-002; Q-API-057; Q-APP-013 — Schema; distinct values per column on the dump — owner |
| `06-database-schema.md:1508` | Q-DATA-008 | Beta access: current mode, owner list, seat count, invite storage and consumption, admitted users? — ENT-003; ENT-004; Q-API-006 — Owner interview + the tables behind them — owner |
| `06-database-schema.md:1509` | Q-DATA-009 | Attribution: which payloads are stored, first or last touch, raw payload kept, visit id link? — ENT-005; Q-BOT-032 — Schema; sample rows — owner |
| `06-database-schema.md:1510` | Q-DATA-010 | Where is the user → PostHog distinct id mapping, how is the id generated, is there a deletion log? — ENT-006; Q-API-046 — Schema; owner interview — owner |
| `06-database-schema.md:1511` | Q-DATA-011 | Radar storage: JSON or columns, how many rows still hold `zone`, distribution of `posted_days`, storage of `entry` / `relaxed`, timestamps, default `mode`? — ENT-008; Q-API-013; Q-API-031; Q-API-034 — `select count(*) filter (where filters ? 'zone')`, `jsonb_object_keys` histogram, distinct `mode` o |
| `06-database-schema.md:1512` | Q-DATA-012 | Hide-rule model: table, kinds, target radar for rules from `/fav`, link to `Subscription.hidden`? — ENT-009; Q-API-032; Q-BOT-028 — Schema; sample rows — owner |
| `06-database-schema.md:1513` | Q-DATA-013 | Delivered-card log: per user or per radar, keys, `chat_id` / `message_id` kept, origins logged (starter, `/fav`, deep link), retention, size? — ENT-010; Q-API-031 — Schema; `count(*)`, `min(sent_at)` on the dump — owner |
| `06-database-schema.md:1514` | Q-DATA-014 | Digest and quiet-hours queue: stored queue or recomputation; per-user `last_digest_sent_at`? — ENT-011; Q-BOT-003 — Schema; owner interview — owner |
| `06-database-schema.md:1515` | Q-DATA-015 | Is the radar limit on total or active radars, and how many users exceed 10? — ENT-008; Q-BOT-007 — `select user_id, count(*) from <radars> group by 1 having count(*) > 10` — owner |
| `06-database-schema.md:1516` | Q-DATA-016 | Favourites, history and hidden listings: timestamps stored, ordering, caps, which action writes history? — ENT-014 … ENT-016; Q-API-009; Q-API-035 — Schema; max rows per user — owner |
| `06-database-schema.md:1517` | Q-DATA-017 | Blocked-author key: raw phone, normalised phone, hash or author row; source key by handle or channel id; are entry ids stable? — ENT-017; ENT-030; Q-API-036 — Schema; sample rows — owner |
| `06-database-schema.md:1518` | Q-DATA-018 | Votes: table, stored weights, thresholds, where the realtor mark and the "rented for all" state live, history of marks? — ENT-018; Q-API-038; Q-API-039; Q-BOT-029 — Schema; owner interview — owner |
| `06-database-schema.md:1519` | Q-DATA-019 | Owner-verification hash: normalisation, algorithm, salt or key; how many verified users? — ENT-019; Q-API-041; Q-BOT-042 — Legacy code or owner; `count(*)` — owner |
| `06-database-schema.md:1520` | Q-DATA-020 | Survey answers: storage, link of `where` to the answer, radar link, `ask_found` suppression state? — ENT-020; Q-API-030 — Schema — owner |
| `06-database-schema.md:1521` | Q-DATA-021 | Action log: schema, rows per day, partitioning, which properties and texts are stored? — ENT-021; Q-API-045 — Schema; `count(*) / 180` — owner |
| `06-database-schema.md:1522` | Q-DATA-022 | Listing id: column type, sequence and its `last_value`, gaps, reuse; one table or several (attributes, location); how merges are stored? — ENT-023; ENT-024; Q-API-019 — Schema; `select max(id), count(*) from <listings>`; sequence query — owner |
| `06-database-schema.md:1523` | Q-DATA-023 | Listing price storage: original amount and currency kept, rate and rate date, per-person / per-m² / per-sotka bases, rounding? — ENT-023; ENT-041; LB-DATA-019 — Schema; distinct bases; 20 sampled UZS posts compared with `price_usd` — owner |
| `06-database-schema.md:1524` | Q-DATA-024 | Status model: values, timestamps, PII-purge marker, takedown records, `post_deleted`, hard deletes? — ENT-034; ENT-037; Q-API-023 — Schema; `select status, count(*)` — owner |
| `06-database-schema.md:1525` | Q-DATA-025 | Publications: keys (channel id or handle, message id), per-publication text and price, media references? — ENT-025 — Schema; uniqueness check on (channel, post) — owner |
| `06-database-schema.md:1526` | Q-DATA-026 | Photos: storage location and layout, originals kept or only 800/480, count, total bytes, Telegram file ids, perceptual hashes? — ENT-027; Q-API-024 — File count and `du -sh` of the media store; schema — owner |
| `06-database-schema.md:1527` | Q-DATA-027 | Photo URL signing algorithm and secret — needed only if URLs issued before the switch must stay valid after it? — ENT-027; Q-API-024 — Owner; decision in `14` §5 — owner + developer |
| `06-database-schema.md:1528` | Q-DATA-028 | Geo storage: listing geometry type and SRID, `geo_radius_m` derivation, gazetteer tables (districts, quarters, places, ЖК, mahallas, metro) with geometry? — ENT-028; ENT-043 … ENT-047; Q-API-020 — Schema; `select type, srid from geometry_columns` — owner |
| `06-database-schema.md:1529` | Q-DATA-029 | Code formats: are API district/city codes equal to landing codes (`mirzo_ulugbek`) or SEO slugs (`mirzo-ulugbek`); which spellings occur in stored radars? — LB-DATA-001; Q-API-012; Q-BOT-044 — `GET /api/meta` on a test account; distinct codes in radar filters on the dump — owner / test account |
| `06-database-schema.md:1530` | Q-DATA-030 | Complete renovation (per deal) and appliance code lists with names in three languages? — ENT-049; ENT-050 — `GET /api/meta` in `ru`, `uz_Latn`, `en` on a test account; dictionary tables — test account / owner |
| `06-database-schema.md:1531` | Q-DATA-031 | Medians: stored per listing or computed on read; aggregate tables; place `pt:` keys; preset and typical-price derivation; tone thresholds? — ENT-031; ENT-032; ENT-051; Q-API-021 — Schema; owner interview — owner |
| `06-database-schema.md:1532` | Q-DATA-032 | Price index series: stored or computed at render; month/week boundaries in UTC or Asia/Tashkent; frozen published values? — ENT-033; LB-DATA-018 — Schema; recompute one month both ways and compare with the CSV — owner |
| `06-database-schema.md:1533` | Q-DATA-033 | Channels: the 217 channels with ids, handles, city, owner-hashtag rules, opt-outs, polling state? — ENT-040; Q-API-017 — Table export — owner |
| `06-database-schema.md:1534` | Q-DATA-034 | Exchange rates: history kept or only current, source and refresh time of `usd_uzs`? — ENT-041; Q-API-054 — Schema; owner interview — owner |
| `06-database-schema.md:1535` | Q-DATA-035 | Timestamp column types and the zone of naive timestamps; server `TimeZone` setting? — §5.1 — `SHOW TimeZone`; `information_schema.columns where data_type = 'timestamp without time zone'` — owner |
| `06-database-schema.md:1536` | Q-DATA-036 | Database encoding and collation; apostrophe variants and scripts in names and texts? — §5.1 — `SHOW server_encoding`; character histogram on the sample — owner |
| `06-database-schema.md:1537` | Q-DATA-037 | Are translations cached, and how many rows? — ENT-035; Q-API-025 — Schema; `count(*)` — owner |
| `06-database-schema.md:1538` | Q-DATA-038 | Is `stats.views` a stored counter or a count of history rows? — ENT-015; ENT-023; Q-API-035 — Schema — owner |
| `06-database-schema.md:1539` | Q-DATA-039 | Does support-bot data live in the same database, and is it in migration scope? — ENT-022; Q-SYS-003 — Owner interview — owner |
| `06-database-schema.md:1540` | Q-DATA-040 | Service news: where is the opt-out stored and is there a campaign history? — ENT-013; Q-BOT-040; Q-BOT-004 — Schema; owner interview — owner |
| `06-database-schema.md:1541` | Q-DATA-041 | Where is bot conversation state kept, and what is the `callback_data` grammar (which ids it embeds)? — ENT-012; ENT-059; Q-BOT-017 — Legacy handler source or a read-only `reply_markup` dump of a test chat — owner |
| `06-database-schema.md:1542` | Q-DATA-042 | What does erasure delete (radars, votes, owner hash, delivered log, events, attribution), is a trace kept, how are votes of deleted users treated? — ENT-007; Q-API-048; Q-BOT-001 — Deletion procedure from the owner — owner |
| `06-database-schema.md:1543` | Q-DATA-043 | Can changes be tracked for the final delta (`updated_at` on every table, soft deletes, logical replication)? — `14` §7 — Schema; `wal_level`; owner interview — owner |
| `06-database-schema.md:1544` | Q-DATA-044 | Where are backups and other copies («на нашем компьютере»), how long are they kept, how are they destroyed after the migration? — BR-DATA-031 — Owner interview — owner |
| `06-database-schema.md:1545` | Q-DATA-045 | After the cut-over, who reads the 217 channels (legacy pipeline ported, `telegram.uz` collector, or both), and how will collector payloads carry channel + post id so migrated publications are matched instead of duplicated? — ENT-025; ENT-040; ADR-0009 — Developer decision on CF-007 / CF-016 in `10-t |
| `06-database-schema.md:1546` | Q-DATA-046 | Are landing snapshots, SEO aggregates, `lastmod` values and the salary reference stored in the database or generated? — ENT-054; ENT-055; ENT-056 — Schema; owner interview — owner |
| `06-database-schema.md:1547` | Q-DATA-047 | Are call-link tokens and prepared share messages stored? — ENT-038; ENT-039; Q-API-042; Q-API-044 — Schema — owner |
| `06-database-schema.md:1548` | Q-DATA-048 | How are operator blocks (`blocked`) stored, with reasons? — ENT-001; ENT-003 — Schema — owner |
| `06-database-schema.md:1549` | Q-DATA-049 | Where do the owner list (`private` mode) and the `team` analytics flag live? — ENT-001; Q-API-047 — Schema; configuration — owner |
| `06-database-schema.md:1550` | Q-DATA-050 | How large is the media store (files, bytes, growth per day), and what transfer bandwidth is available? — ENT-027; `14` §5 — `du`, file counts on the media host — owner |

### Security and personal data (16)

| Source | Question | Text (first line; details at the source) |
| ------ | -------- | ---- |
| `16-security-review.md:1092` | Q-SEC-001 | Who holds the `@KvadroAppBot` token, the `kvadro.app` DNS, registrar and Cloudflare accounts today, and does the legacy operator agree to token rotation and account transfer at the cut-over? — SEC-022, SEC-REQ-012, CF-008, CF-009 — Written answer and a hand-over plan in `18` — product owner |
| `16-security-review.md:1093` | Q-SEC-002 | Does the legacy backend enforce ownership on `/api/subscriptions/:id`, `/api/hidden/:id` and bot callbacks? — SEC-011, Q-API-005, Q-BOT-017 — With owner approval, two test accounts: B calls A's radar and author-entry ids; record status and A's state — test accounts |
| `16-security-review.md:1094` | Q-SEC-003 | Soft and hard thresholds for the phone-disclosure quota, and is degrading to `phone: null` for heavy users acceptable? — SEC-002, SEC-REQ-028 — Product decision with distinct-phones-per-user statistics from legacy logs if available — product owner |
| `16-security-review.md:1095` | Q-SEC-004 | Should the new API mask phones inside `original_text` (a deviation; the source post stays public on `t.me`)? — SEC-002, LB-API-030 — Product decision recorded as a `DEV-…` in `09` — product owner |
| `16-security-review.md:1096` | Q-SEC-005 | Where are the legacy servers and HOMI's hosts (ADR-0011) physically located, is the legacy database registered in the State Register of personal-data bases, which legal entity is the operator, and does moving the database to HOMI change the operator? — SEC-020, SEC-REQ-050 — Hosting contracts; regis |
| `16-security-review.md:1097` | Q-SEC-006 | Legal basis for cross-border processing by the LLM provider, PostHog EU (including session replay) and Cloudflare (TLS termination); keep or drop each? — SEC-020, SEC-005, SEC-021 — Lawyer's note; processor agreements — lawyer; product owner |
| `16-security-review.md:1098` | Q-SEC-007 | Legal basis for processing listing authors' phones and photos taken from public channels; are hashed phones personal data; what takedown deadline do we promise? — SEC-REQ-040, SEC-REQ-036 — Lawyer's note — lawyer |
| `16-security-review.md:1099` | Q-SEC-008 | Breach-notification deadline and authority under ЗРУ-547 as amended — SEC-REQ-048 — Lawyer's note — lawyer |
| `16-security-review.md:1100` | Q-SEC-009 | Do migrated users need a new consent or only a notice; must HOMI add a data-access/export path (legacy has deletion only)? — SEC-REQ-050, SEC-REQ-039 — Lawyer's note — lawyer; product owner |
| `16-security-review.md:1101` | Q-SEC-010 | Reviewer rule 10 wants a 3-year audit trail of detector inputs and outputs, the privacy text erases listing texts after 90 days: is "outputs + masked-input hash" enough? — SEC-REQ-044, SEC-REQ-045 — Decision recorded in the retention ADR (CF-019) — product owner; security reviewer |
| `16-security-review.md:1102` | Q-SEC-011 | Which legacy backups exist (server, the team computer named in `/privacy`), are they encrypted, and when are they destroyed after the migration? How will the dump be transferred? — SEC-019, SEC-REQ-041 — Inventory from the legacy operator; destruction record — product owner; prod track |
| `16-security-review.md:1103` | Q-SEC-012 | Does Telegram Web embed the Mini App in a frame (so `frame-ancestors` must allow it), and what is the legacy CSP header? — SEC-033, SEC-REQ-030, Q-APP-016 — `curl -sI` of the Mini App origin from an allowed machine; open the dev Mini App in Telegram Web with `frame-ancestors 'none'` and observe — de |
| `16-security-review.md:1104` | Q-SEC-013 | Does Next 16.4 `experimental.sri` remove the need for `'unsafe-inline'` for Next's own inline scripts on statically rendered landing pages? — SEC-REQ-031, CF-011 — Spike: build the landing with SRI and a strict CSP, count violations — dev track |
| `16-security-review.md:1105` | Q-SEC-014 | NFR-03 says phones are stored only hashed, but the call page needs listing authors' numbers: amend NFR-03 to "user phones hashed; listing phones encrypted, erased after 90 days"? — SEC-REQ-036, GAP-015 — Amendment approved in `docs/architecture/requirements.md` — first developer; product owner |
| `16-security-review.md:1106` | Q-SEC-015 | During the transition, serve the original production Mini App artefacts (hash manifest) or a rebuild from the decompiled sources? — SEC-REQ-049, RES-008 — Decision in the compatibility ADR (CF-001, CF-011) — dev track; prod track |
| `16-security-review.md:1107` | Q-SEC-016 | Votes of a deleted user: delete (marks may flip) or anonymise (keep counts, drop the link)? — SEC-REQ-039, SEC-REQ-045, Q-API-048 — Product decision — product owner |
| `16-security-review.md:1108` | Q-SEC-017 | At the webhook switch, drop pending updates or process them on HOMI? — SEC-REQ-009, TB-10 — Decision in `18` with the legacy operator — product owner; prod track |
| `16-security-review.md:1109` | Q-SEC-018 | Which Telegram accounts become ARM admins and moderators, and is TOTP acceptable to them? Is the legacy owner list (`private` mode) imported? — SEC-REQ-046, Q-SYS-004 — Named list approved by the product owner — product owner |
| `16-security-review.md:1110` | Q-SEC-019 | How do admins reach Horizon, Telescope and Pulse in staging and production, given that gates check e-mail and users sign in with Telegram only? — SEC-REQ-046, SEC-034 — Prod-track decision (gate by role, or SSH tunnel only) — prod track |
| `16-security-review.md:1111` | Q-SEC-020 | Is `@KvadroSupportBot` migrated (GAP-026)? If yes, it needs its own review (texts with names, LLM translation, 90-day mapping). — SEC-018, BR-BOT-091 — Product decision; then a review — product owner |

<!-- generated:end -->
