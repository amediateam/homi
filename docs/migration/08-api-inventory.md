# 08 — Legacy API inventory

Part of the kvadro² → HOMI migration audit (rules, labels and ID scheme: `docs/migration/README.md`).

This document lists every `/api/*` method the legacy Mini App calls (`API-NNN`, in the order of the registry in
`$KVADRO_ROOT/docs/api.md` §2) and every non-API HTTP resource the legacy system serves or depends on (`RES-NNN`).
The server-side system behind these endpoints — business rules `BR-API-NNN`, contract quirks and questionable design
decisions `LB-API-NNN` (each with a proposed fix and old-client impact), open questions `Q-API-NNN` — is in
`02-legacy-backend-audit.md`. The machine-readable twin of this file is `data/api-inventory.json`. API-035
(`GET /api/feed/new`, added in release `index-DY_DH7h-.js`) stands at its registry position, after API-006; ids stay
stable, so it takes the next free number while the legacy registry renumbered the methods after it.

- **Audit date:** 2026-11-09. **Legacy state:** Mini App release `index-plF_TOcT.js` at the audit, brought up to the
  pinned release `index-DY_DH7h-.js` (current `$KVADRO_ROOT/docs/api.md:5`, `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5`;
  `wave-1/baseline.md`). Text changed for a later release names it; "Doc:" line numbers are those of the audited
  tree, "current Doc:" and "at the pin" those of SVN r27.
- **Evidence base:** the legacy backend source and database are not available. The Mini App source is decompiled from
  the production bundle; the landing is a 1:1 production mirror. Nothing was run: `RUNTIME_VERIFIED` is not used.
- **Status per endpoint** carries two labels: **Contract** (method, path, request construction, the response fields
  the client reads — `CONFIRMED` when seen in client code) and **Server logic** (what the server does — normally
  `DOCUMENTED_ONLY`, `UNVERIFIED` where the legacy docs mark it 🔶 or it is our inference).
- Client paths below are relative to `$KVADRO_ROOT/demo/app/` unless written in full
  (`src/lib/api/meta.js:5` = `$KVADRO_ROOT/demo/app/src/lib/api/meta.js:5`).

## 1. Protocol conventions

### 1.1 Origins and base URLs

| Item | Value | Evidence | Status |
| ---- | ----- | -------- | ------ |
| Mini App API | Relative `/api/*` on the Mini App origin `https://app.kvadro.app` (same origin, no CORS for the app itself) | `$KVADRO_ROOT/docs/api.md:18-22`; every call in `src/lib/api/*.js` uses a relative URL | CONFIRMED |
| Dev proxy | `/api`, `/media`, `/tiles` → `VITE_API_PROXY \|\| https://app.kvadro.app` | `vite.config.js:49-63`; `$KVADRO_ROOT/docs/api.md:24-28` | CONFIRMED |
| Separate API host | None: `api.`, `dev.`, `staging.`, `beta.`, `admin.` subdomains do not exist | `docs/RECOVERY.md:17` | CONFIRMED |
| Published spec | None: `/api/openapi.json` and `/docs` → 404 | `docs/RECOVERY.md:16` | CONFIRMED |
| Landing and SEO | `https://kvadro.app` (`/`, `/uz/`, `/en/`, SEO sections, `sitemap.xml`) | `$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:52-64`; `$KVADRO_ROOT/docs/seo-pages.md:44-129` | CONFIRMED |
| `/media` | Served identically from `kvadro.app` and `app.kvadro.app` | `$KVADRO_ROOT/docs/seo-pages.md:385-386` | DOCUMENTED_ONLY |
| Edge | Cloudflare in front of both hosts | `$KVADRO_ROOT/docs/about.md:116`; `$KVADRO_ROOT/docs/seo-pages.md:375-378` | DOCUMENTED_ONLY |

### 1.2 Authentication

- Every request made through `apiFetch` sends `Authorization: tma <initData>` (`src/lib/api/client.js:77-78`). `initData`
  is `Telegram.WebApp.initData`, or — when the SDK is missing — the `tgWebAppData` value read once from the URL hash
  (`src/lib/telegram/webApp.js:111-125`). The boot script in `index.html` uses the same two sources
  (`index.html:38-43`). — `CONFIRMED`
- No cookie, bearer token, CSRF token or session is used (`$KVADRO_ROOT/docs/api.md:41-42`; `client.js:74-86` sends
  only `Authorization` and, with a body, `Content-Type`). The server must authenticate **every request** from
  `initData`. — `CONFIRMED`
- Exceptions: `GET /api/bot` is called with plain `fetch`/`XMLHttpRequest` without `Authorization`
  (`src/lib/api/meta.js:15-23`, `index.html:94-102`). — `CONFIRMED`
- Without `initData` the React app still installs global error handlers before any check and can send `app_error` with
  the header `Authorization: tma ` (empty value) — `src/lib/errors.js:101-122`, `client.js:78`,
  `webApp.js:111-117`; the server must reject it silently (`$KVADRO_ROOT/docs/api.md:1012-1013`). — `CONFIRMED`
- Server-side validation: HMAC of `initData` keyed from the main bot token plus an `auth_date` check
  (`$KVADRO_ROOT/docs/about.md:337-338`, `:403`). Accepted age of `auth_date` and the status code for a bad or stale
  signature are unknown (Q-API-002, Q-API-003 in `02`). — `DOCUMENTED_ONLY`
- `initData` is bound to the bot token: a Mini App opened from a test bot fails on the production backend and vice
  versa (`$KVADRO_ROOT/docs/about.md:412-413`). — `DOCUMENTED_ONLY`

### 1.3 Requests

- Bodies are JSON; `Content-Type: application/json` is added only when `options.body` is set (`client.js:79-83`).
  Bodiless `POST`/`DELETE` calls send no `Content-Type` and no body (for example `src/lib/api/listings.js:29-32`). —
  `CONFIRMED`
- Body keys whose value is `undefined` are dropped by `JSON.stringify` (for example `relaxed` in
  `src/lib/api/subscriptions.js:16-20` when no relax option was picked). — `CONFIRMED`
- Path ids are interpolated without encoding: `` `/api/listings/${id}` `` (`listings.js:10`). Listing ids come from
  numeric API ids or from `start_param` / `?listing=` parsed to a positive integer
  (`src/lib/telegram/startParam.js:17-25`). — `CONFIRMED`
- Query strings are built with `URLSearchParams` (repeated keys via `append`, `+` for spaces); see §1.7. —
  `CONFIRMED`

### 1.4 Responses

- Any `2xx` is success; `204` → `undefined`; any other `2xx` is parsed with `response.json()`, so an empty `200` throws
  (`client.js:87-102`; `$KVADRO_ROOT/docs/api.md:44-50`). — `CONFIRMED`
- Lists must be arrays, never `null`; keys the client compares strictly must always be present
  (`$KVADRO_ROOT/docs/api.md:1083-1086`). Per-endpoint strict fields are listed in §2. — `CONFIRMED`

### 1.5 Errors

- The client reads `detail` from the JSON error body **only if it is a string**; anything else becomes `null`
  (`client.js:87-97`). Recommended body: `{"detail": "machine_or_human_readable_reason"}`
  (`$KVADRO_ROOT/docs/api.md:56-62`). — `CONFIRMED`
- Observed legacy server errors: unknown route `404 {"detail":"Not Found"}` (`docs/RECOVERY.md:13`); validation errors
  `422` in Pydantic v2 shape with `literal_error` (`$KVADRO_ROOT/docs/about.md:108`), seen on `/api/feed` with an
  invalid `deal` (`$KVADRO_ROOT/docs/telegram-bot.md:977`) and on `/media` without signature
  (`$KVADRO_ROOT/docs/seo-pages.md:384`). In that shape `detail` is an array, so the client sees `detail = null`. —
  `DOCUMENTED_ONLY`
- Statuses with dedicated UI handling (`$KVADRO_ROOT/docs/api.md:64-85`), all `CONFIRMED` in code:
  - `403` on `GET /api/meta` → no-access screen with the reason from `detail` (`src/app/useAppBootstrap.js:130-139`,
    `src/features/onboarding/NoAccessScreen.jsx:13-22`);
  - `403` on `GET /api/feed|favorites|history` → «Нет доступа» instead of the error state
    (`src/features/feed/ListingFeed.jsx:88`);
  - `404` on `GET /api/listings/:id` → «Объявление не загрузилось» (`src/features/listing/ListingScreen.jsx:115-116`,
    string `listing.loadFailed` in `src/i18n/locales/ru.js:156`);
  - `409` with `detail: "no_chat"` → write-access flow (`src/lib/chatAccess.js:15-54`);
  - `409` without `no_chat` → radar-limit toast «Уже {max} радаров — удалите ненужный во вкладке «Радар»»
    (`src/app/subscriptionActions.js:147-155`, `ru.js:64`).
- Network failure or the 15 s timeout → `ApiError(status 0, detail 'network' | 'timeout')`; the generic error state
  shows «Нет связи» / «Сервер не ответил. Попробуйте ещё раз через минуту.» (`client.js:103-106`,
  `src/components/ErrorState.jsx:14`, `ru.js:14-16`). — `CONFIRMED`

### 1.6 Timeouts, cancellation, prefetch and retries

- Timeout 15 s per request (`client.js:24`, `:63`). An external `AbortSignal` (used by `/api/feed/count`,
  `/api/feed/flow` and, since release `index-DY_DH7h-.js`, `/api/feed/new`) aborts the request and is re-thrown as
  `AbortError`, so the server sees dropped connections (`client.js:64-72`, `:104`; `$KVADRO_ROOT/docs/api.md:534`). —
  `CONFIRMED`
- Prefetch before React mounts (`src/main.jsx:24-39`): `GET /api/meta`; the first feed page for
  `defaultFilters('rent_long', <saved city>)` with `limit=20`; `GET /api/listings/<id>` when opened from a listing
  link. Prefetch is skipped without `initData` (`client.js:35-43`). The first `apiFetch(url)` **without options**
  and with the **identical URL string** consumes the prefetched promise; if it failed, the request is repeated
  immediately (`client.js:56-60`). A failed first `/api/meta` therefore produces two requests back to back. —
  `CONFIRMED`
- Automatic retries exist only for `GET /api/meta` (§2, API-001). Mutations are never retried automatically, except
  the single repeat after the user grants write access on `409 no_chat` (`src/lib/chatAccess.js:27-54`). —
  `CONFIRMED`
- Debounced live requests: `/api/feed/count` 250 ms and `/api/feed/flow` 500 ms after each filter change, previous
  request aborted (`src/features/filters/useLiveFeedStats.js:12-45`). — `CONFIRMED`

### 1.7 Common filter query (`FilterQuery`)

`GET /api/feed`, `/api/feed/count`, `/api/feed/flow`, `/api/map` and, since release `index-DY_DH7h-.js`,
`/api/feed/new` (plus `since`, API-035) send the same parameters, built by
`buildFilterParams` (`src/lib/api/feed.js:10-66`; `$KVADRO_ROOT/docs/api.md:188-225`). Order of keys in the query
string is the order below (it matters only for the prefetch-cache string match):

| Param | Type | Sent when | Code |
| ----- | ---- | --------- | ---- |
| `city` | string | always; `filters.city \|\| 'tashkent'` | `feed.js:12` |
| `deal` | `rent_long \| rent_daily \| sale` | always (a missing key is sent as the string `undefined`) | `feed.js:13` |
| `owner` | `any \| no_agents \| owners` | always (same caveat) | `feed.js:14` |
| `types` | string, repeated | per element; `.forEach` on a missing array throws | `feed.js:16` |
| `districts` | string, repeated | per element | `feed.js:17` |
| `renovation` | string, repeated | per element | `feed.js:18` |
| `appliances` | string, repeated | per element | `feed.js:19` |
| `rooms_min`, `rooms_max`, `price_min`, `price_max`, `area_min`, `area_max`, `posted_days` | number as string | `!== null` (a missing key is sent as `undefined`) | `feed.js:20-32` |
| `furnished` | `true \| false` | `!== null` | `feed.js:33-35` |
| `floor_not_first`, `floor_not_last` | `true` | only when truthy | `feed.js:36-41` |
| `market` | `new \| secondary` | when truthy | `feed.js:42-44` |
| `zones` | string, repeated (`center`, `near_center`) | per element; the only array allowed to be missing (`?? []`) | `feed.js:46` |
| `near_metro`, `below_median` | `true` | only when truthy | `feed.js:47-52` |
| `tenant` | `family \| men \| women` | when truthy | `feed.js:53-55` |
| `pets`, `pets_only` | `true` | only when truthy | `feed.js:56-61` |
| `polygon` | `lat,lon;lat,lon;…` | when it has vertices; 3–40 vertices, 5 decimals, not closed | `feed.js:62-64`, `src/lib/geo/polygon.js:6`, `:149`, `:235` |

Feed-only additions: `limit=20` (always), `sort` (`cheap \| expensive \| deal \| center \| ppm`; `new` is never sent),
`cursor` (opaque, only for page 2+) — `feed.js:75-85`. The UI offers `deal` only for a single `apartment` type, not
`rent_daily`, in a city with `median !== false`; `center` only when the city has zones; `ppm` only for `sale`
(`src/features/sort/SortSheet.jsx:17-33`). Server-side validation of all of this: see `02` §6.

`SearchFilters` (the object form, used in subscription bodies and returned by the server) has exactly these 25 keys
(`src/features/filters/model.js:12-39`; `$KVADRO_ROOT/docs/api.md:145-172`): `city: string`, `deal`,
`types: string[]`, `districts: string[]`, `rooms_min: number|null`, `rooms_max: number|null`,
`price_min: number|null` (USD), `price_max: number|null` (USD), `zones: string[]`, `near_metro: boolean`,
`below_median: boolean`, `owner`, `tenant: string|null`, `pets: boolean`, `pets_only: boolean`,
`furnished: boolean|null`, `renovation: string[]`, `floor_not_first: boolean`, `floor_not_last: boolean`,
`area_min: number|null`, `area_max: number|null`, `market: string|null`, `appliances: string[]`,
`posted_days: 1|3|7|null`, `polygon: [lat, lon][]|null`. Default object: `types: ['apartment']`, everything else
empty/`null`/`false`, `owner: 'any'`.

Contract change history: on 2026-11-06 the filter `zone` (string | null, query `zone=`) became `zones` (array, repeated
`zones=`); subscription bodies carry `zones: []` instead of `zone: null`
(`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:46-54`). Radars stored before that date may still hold `zone` (Q-API-013).

### 1.8 Shared response models

Literal schemas are in `$KVADRO_ROOT/docs/api.md` §3–§4; all field names and types are repeated here because they are
the contract. `!` marks keys the client reads strictly (`=== null`, `!== null`, `.length`, `.slice`, spread) — they
must be present even when empty.

**`ListingPreview`** (`$KVADRO_ROOT/docs/api.md:227-273`): `id: number`! (compared with `===`/`!==`),
`title: string` (part before the first ` · ` is shown), `short_title?: string`, `price: string|null` (pre-formatted;
parts split by ` · `, `(…)` cut from part 1, text from the first `/` is the period),
`price_kind: "down_payment"|"business"|null` (label after the price: «первый взнос» /
«цена за бизнес, помещение в аренде»; any other value gets no label; `"business"` since release `index-Dbpp463V.js`
— `src/features/listing/format.js:35-43`, current `$KVADRO_ROOT/docs/api.md:239`; BR-API-156, Q-API-065),
`favorite: boolean`!, `viewed?: boolean`, `district_name: string|null`, `place?: string`, `landmark: string|null`,
`metro: string|null`, `metro_km: number|null`!, `center_km: number|null`!, `area_total: number|null`,
`floor: number|null`, `floors_total: number|null`, `rooms: number|null`, `pets_ok: boolean`, `is_owner?: boolean`,
`owner_verified?: boolean`, `photos_preview: string[]`!, `photos_count?: number`, `cover?: string`,
`video: unknown|null` (truthy flag only; tap opens the Telegram post — `src/features/listing/ListingScreen.jsx:150`),
`age: string|null` (`<prefix> · <when>`), `status_text: string|null`, `market: string|null` (display label),
`median_delta: number|null`! (fraction, `-0.12` = 12% cheaper), `median_tone: string|null`
(`good|check|suspicious|same|mixed|no_repair`, others = "dearer"), `lat: number|null`, `lon: number|null`.

**`ListingDetails`** = `ListingPreview` + (`$KVADRO_ROOT/docs/api.md:275-353`): `deal_type: string`,
`market_code?: string|null` (`new` = new build, other non-empty = secondary), `photos: string[]`,
`facts: {key, label, value}[]` (`key` unique; icons for `type, rooms, area, land, floor, building, renovation,
furniture, appliances, per_m2, commission, conditions`), `nearby: {kind: "park"|"school", name, km: number,
note?: string|null}[]` (`kind` unique, only these two values, never `metro`), `stats: {days_listed, publications,
channels, views?}`, `history: {at: string, channel: string (no @), url: string|null, text?: string, kind?: string
(`published|price_down|price_up`, becomes a CSS class), price_usd: number|null!, change_pct: number|null!}[]`,
`geo_radius_m: number|null` (client default 500 m — `ListingScreen.jsx:134`), `author: {kind: "phone"|"source",
label, count}|null`, `call_url: string|null`, `contact_url: string|null`, `contact_paid?: boolean`,
`summary: string|null`, `sources: {url, handle}[]`!, `original_text: string|null`, `original_url: string|null`,
`post_deleted?: boolean`, `offers?: {text, url?}[]`, `phone: string|null` (`+998XXXXXXXXX`),
`phone_display: string|null`, `owner: string|null`, `median?: boolean`, `median_value?: number|null`! (when `median`
is truthy), `median_own?: number|null`, `median_n?: number|null`, `median_metric?: string|null` (`m2`, `person`,
others = per month; the parity mock uses `unit`), `median_reason?: unknown` (truthy check only),
`median_scope?: string|null` (`near`, `city`, others = district), `median_rooms?: number|null` (≥ 4 → «4+»),
`median_near_class?: "jk"|"house"|string|null`, `median_radius_km?: number|null`, `median_district?: string|null`,
`median_place_value?: number|null`, `median_note?: string|null`, `median_updated?: string|null`,
`price_usd?: number|null`, `price_per_m2?: number|null` (one of `median_own`/`price_per_m2`/`price_usd` must be present
or the scale shows `$NaN`).

**`FeedPage`** (`$KVADRO_ROOT/docs/api.md:355-366`): `{items: ListingPreview[], next_cursor: string|null!}` —
`next_cursor === null` is the only end-of-list signal (`src/features/feed/useInfiniteFeed.js:41-42`).

**`Subscription`** (`$KVADRO_ROOT/docs/api.md:368-378`): `{id: number|string, active: boolean, mode:
"instant"|"digest", filters: SearchFilters (all 25 keys)!, hidden?: number}`.

**`SubscriptionMutationResult`** (`$KVADRO_ROOT/docs/api.md:382-400`): `{subscription: Subscription, starter: number,
options?: {code, label, rate, count: number}[], relaxed: {text: string, …}[]!}`.

Fields that the server may send but the client never reads (`$KVADRO_ROOT/docs/api.md:402-414`): `FeedPage.total`;
`ListingPreview.usd`, `photos_total`, `tone`, `label`, `priced`; `ListingDetails.contacts`, `source_url`,
`price_per_m`; `Subscription.title`, `new_count`, `finds`, `created_at`, `hidden_count`;
`SubscriptionMutationResult.ask_found`, `options[].filters`; `FeedFlowResponse.options[].count`;
`SettingsResponse.theme`, `city`; `CityStats.name`, `center`. These hint at legacy server fields (and possibly bot
use) — see §5.

### 1.9 Constraints for `10-target-architecture.md` (recorded, not decided)

Keeping this contract byte-compatible during the transition collides with accepted HOMI ADRs:

- `docs/architecture/decisions/0007-api-v1-response-envelope-pagination.md`: `/api/v1` prefix, `{success, data}`
  envelope, `{success:false, message, errors, code}` errors, page-number pagination, opaque ULID/UUID ids. The legacy
  client needs bare JSON at `/api/*`, `{"detail": "…"}` errors, an opaque cursor and **numeric** listing ids.
- `docs/architecture/decisions/0003-auth-sanctum-bearer-tokens.md`: a Sanctum bearer token issued once by
  `POST /api/v1/auth/telegram`. The legacy client sends `Authorization: tma <initData>` on every request and never
  obtains a token.
- `docs/architecture/decisions/0006-time-locale-i18n-currency.md`: prices stored in source currency, display default
  UZS. The legacy contract stores and filters in USD and formats `price` server-side per user currency.

Every API row below therefore names the legacy method + path that must stay byte-compatible and leaves the handler to
`10-target-architecture.md`.

## 2. Endpoints

Field order in every row: ID → Method → URL → Auth → Roles/access mode → Input → Validation → Business Logic → DB
Changes → Side Effects → Response → Errors → Legacy Source → Migration Target → Tests → Status. "Doc" means
`$KVADRO_ROOT/docs/api.md`. `02 §N` points to `02-legacy-backend-audit.md`.

### API-001 — `GET /api/meta`

- **Method:** GET
- **URL:** `/api/meta`
- **Auth:** `Authorization: tma <initData>` (required).
- **Roles/access mode:** any Telegram user; this endpoint **is the closed-beta gate**: denied users get `403` with a
  reason (`02 §4`).
- **Input:** none (no query, no body). Identity, language and `start_param` reach the server only inside `initData`.
- **Validation:** `initData` signature and `auth_date` (`02 §3`). — DOCUMENTED_ONLY
- **Business Logic:** evaluates access mode (private / invite / full / blocked / join); returns the user's profile
  settings (`locale`, `locale_chosen`, `currency`, `theme`, `city`, `city_chosen`), the USD→UZS rate, analytics
  configuration with the user's random PostHog id, the radar limit, bot username, tiles URL, feature flags and all
  directories (cities with districts/zones/metro/median flags, renovations per deal, appliances, USD price presets per
  deal, locales). — DOCUMENTED_ONLY
- **DB Changes:** none known. Whether the first call creates the user row or records `start_param` attribution is
  unknown (Q-API-004). — UNVERIFIED
- **Side Effects:** none known.
- **Response:** `200` `MetaResponse` (Doc:423-452): `locale: string` (`ru|uz_Latn|en`), `locale_chosen: boolean`,
  `currency: string` (`USD|UZS`), `usd_uzs: number`, `theme: "auto"|"light"|"dark"`, `city: string|null`,
  `city_chosen?: boolean`, `analytics: null|{key: string, host: string, id: string, env?: string, team?: boolean,
  autocapture?: boolean, replay?: boolean, replay_rate?: number}`, `max_subscriptions?: number`,
  `bot_username: string|null`, `tiles: string|null`, `new_features?: string[]`, `cities?: CityMeta[]`,
  `districts: {code, name}[]`, `zones: {code, name}[]`, `renovations: Record<deal, {code, name}[]>`,
  `appliances: {code, name}[]`, `price_presets: Record<deal, number[]>` (USD), `locales: {code, name}[]`.
  `CityMeta` (Doc:454-463): `code`, `name`, `center: [lat, lon]`, `zoom?: number` (default 12; `< 11` = region),
  `metro: boolean`, `median: boolean`, `districts[]`, `zones[]`. Client semantics: `locale_chosen === false` (falsy)
  → language picker built from `locales` (`src/app/App.jsx:234`); `city_chosen === false` (strict) → first city
  picker (`App.jsx:257`); `meta.city` different from the saved city replaces it and the filter city when no geography
  is selected (`src/app/useAppBootstrap.js:83-94`); `theme` overrides the local theme on every start
  (`useAppBootstrap.js:81`); `analytics.autocapture` disabled only by explicit `false`, `replay_rate` default 1
  (`src/lib/analytics.js:126-127`); `max_subscriptions` default 10 (`src/app/subscriptionActions.js:16`);
  `bot_username: null` hides «Поделиться» and the bot link on `no_chat`; `tiles: null` → OSM raster fallback;
  `cities` missing or empty → Tashkent from top-level `districts`/`zones`.
- **Errors:** `403 {"detail": "private"|"invite"|"full"|"blocked"|"join"}` → no-access screen; unknown or missing
  `detail` shown as `private` (`src/features/onboarding/NoAccessScreen.jsx:13`, `:22`); `blocked` → no automatic
  re-check, others re-checked 3 × 2.5 s; returning to the app (`visibilitychange`) resets counters and re-requests,
  also for `blocked` (`useAppBootstrap.js:26`, `:130-139`, `:150-157`). Any other failure (network, `401`, `5xx`) →
  retries after 1, 3, 7, 15, 30 s, then the app stays without meta and without an error screen
  (`useAppBootstrap.js:24`, `:141-143`). A failed prefetch adds one immediate repeat (`client.js:56-60`). Telegram
  user-facing texts: «Бот приватный», «Вход по приглашению», «Мест пока нет», «Нет доступа», «Сначала — бот»
  (`src/i18n/locales/ru.js:28-32`); release `index-Dbpp463V.js` renamed «Закрытая бета» and dropped the beta from
  the `full` text (`03` SCR-003). The `detail` codes did not change.
- **Legacy Source:** Doc:104 (registry), Doc:64-72 (403 handling), Doc:416-466 (§4);
  `$KVADRO_ROOT/docs/about.md:248-252`; client `src/lib/api/meta.js:5`, `src/main.jsx:24` (prefetch),
  `src/app/useAppBootstrap.js:70`, `src/app/App.jsx:234`, `:252`, `:257`; parity mock
  `tools/parity/mocks.mjs:65-73`, `:264` (403 scenario).
- **Migration Target:** legacy `GET /api/meta` must stay byte-compatible during the transition. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — valid `initData` → `200` with every key present (snapshot of names and types), arrays never
  `null`; settings round-trip — after `PUT /api/settings {locale}` → `locale_chosen: true`, after `{city}` →
  `city_chosen: true` and `city` updated, after `{theme}` → `theme` updated; access — one case per reason
  (`private`, `invite`, `full`, `blocked`, `join`) with `detail` as a string; `join` turns into `200` right after the
  bot `/start`; auth — no header, `tma ` with empty value, tampered hash, stale `auth_date`, `initData` signed by
  another bot → status per Q-API-003, never `200`; edge — `cities: []` keeps top-level `districts`/`zones`,
  `analytics: null`, `tiles: null`.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (gate reasons `CONFIRMED` in client, their
  conditions `DOCUMENTED_ONLY`). Related: LB-API-002, LB-API-018, LB-API-019, LB-API-021, LB-API-048,
  LB-API-051, LB-API-053; Q-API-002 … Q-API-006, Q-API-026, Q-API-047, Q-API-054.

### API-002 — `GET /api/cities`

- **Method:** GET
- **URL:** `/api/cities`
- **Auth:** `tma` required.
- **Roles/access mode:** any authenticated user; gate behaviour unknown (Q-API-005).
- **Input:** none.
- **Validation:** auth only.
- **Business Logic:** per city: listing counts per deal, USD price presets per deal and a "typical" (median) price per
  deal for the price hint «{city}: половина квартир — до {price} в месяц» (`src/i18n/locales/ru.js:137-139`). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200` array of `CityStats` (Doc:472-485): `code: string`, `counts: {rent_long: number,
  rent_daily: number, sale: number}`, `presets: Partial<Record<deal, number[]>>` (USD), `typical:
  Partial<Record<deal, number>>` (USD). `counts` and `presets` are read without optional chaining when an entry for
  the city exists (`src/features/city/CityPicker.jsx:99-117`, `src/app/App.jsx:254`, `:431`,
  `src/features/filters/PriceSection.jsx:33-35`), so both objects must be present. Unread: `name`, `center`.
- **Errors:** all errors ignored silently (`useAppBootstrap.js:125`, `App.jsx:169`).
- **Legacy Source:** Doc:105, Doc:468-487; client `src/lib/api/meta.js:8`, `src/app/useAppBootstrap.js:125` (after
  meta), `src/app/App.jsx:166-171` (each time the filters sheet opens); mock `tools/parity/mocks.mjs:117`.
- **Migration Target:** legacy `GET /api/cities` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — one entry per `meta.cities` code with all three `counts` keys and `presets`/`typical` objects
  (possibly empty); values in USD independent of user currency; auth — missing/invalid `initData`; edge — city without
  listings returns zeros, not a missing entry (Q-API-016).
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: Q-API-016.

### API-003 — `GET /api/bot`

- **Method:** GET
- **URL:** `/api/bot`
- **Auth:** **none** — called with plain `fetch` / `XMLHttpRequest` and no `Authorization` header.
- **Roles/access mode:** public; must work for users who failed the gate and outside Telegram.
- **Input:** none.
- **Validation:** none.
- **Business Logic:** returns the usernames of the main bot and of the support bot. — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {"username": string, "support": string|null}` (Doc:493-498; production values are the public bot
  names `KvadroAppBot` and `KvadroSupportBot`, `$KVADRO_ROOT/docs/telegram-bot.md:975`). `username` is used only by
  the no-access screen («Перейти в бота» with deep link `?start=s_<source>[--l<id>]`,
  `NoAccessScreen.jsx:40`, `:66`) and by the boot script when `WebApp.close` is unavailable (`index.html:91-103`).
  `support` (absent or `null` hides the item) is used by the no-access screen, «Настройки → О приложении» and the
  listing actions sheet.
- **Errors:** non-2xx → local fallback `{username: null}` (drops `support` too); a network error rejects and is
  swallowed by callers (`src/lib/api/meta.js:15-23`).
- **Legacy Source:** Doc:106, Doc:38-39, Doc:489-505; client `src/lib/api/meta.js:15-23`, `index.html:94-102`,
  `src/features/onboarding/NoAccessScreen.jsx:31`, `src/features/settings/SettingsScreen.jsx:65`,
  `src/features/listing/ListingActionsSheet.jsx:46`; mock `tools/parity/mocks.mjs:127`, `:264`.
- **Migration Target:** legacy `GET /api/bot` byte-compatible, unauthenticated. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — no `Authorization` header → `200` with both keys; with a valid `tma` header → same body (header
  ignored); with a garbage `Authorization` header → still `200` (must not authenticate); edge — `support: null`
  allowed; environment — staging returns the staging bot names.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: Q-API-056.

### API-004 — `GET /api/feed`

- **Method:** GET
- **URL:** `/api/feed`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; `403` for gated users is handled («Нет доступа», `ListingFeed.jsx:88`).
- **Input:** query `FilterQuery` (§1.7) + `limit=20` (always), `sort` (`cheap|expensive|deal|center|ppm`, omitted for
  default `new`), `cursor` (opaque; only for page 2+). Repeated: `types`, `districts`, `renovation`, `appliances`,
  `zones`. Example (Doc:221-225): `GET /api/feed?city=tashkent&deal=rent_long&owner=any&types=apartment&rooms_min=2&rooms_max=2&price_max=600&near_metro=true&limit=20`.
- **Validation:** `deal` (and other enums) validated with Pydantic `Literal` — an invalid `deal` returns `422`
  (`$KVADRO_ROOT/docs/telegram-bot.md:977`). Limits for other params unknown (Q-API-007, Q-API-012). — DOCUMENTED_ONLY
- **Business Logic:** active listings matching the filters (`02 §7` for each filter's meaning), ordered by `sort`
  (Q-API-010), cursor-paginated by 20, with per-user flags `favorite`, `viewed`, strings formatted in the user's
  locale and currency. Exclusion of the user's hidden listings and blocked authors server-side: Q-API-036. —
  DOCUMENTED_ONLY
- **DB Changes:** none known.
- **Side Effects:** none known.
- **Response:** `200 FeedPage` `{items: ListingPreview[], next_cursor: string|null}` (§1.8). `next_cursor` strictly
  `null` on the last page; client de-duplicates items by `id` across pages (`useInfiniteFeed.js:37-42`). The prefetch
  path reads `items[0..1].photos_preview[0]` (`src/main.jsx:26-33`). Unread: `total`.
- **Errors:** `403` → «Нет доступа» button; other errors → error state with «Повторить»; error on a later page stops
  loading until retry (`tools/parity/mocks-filters.mjs:81-82` covers `500` and `403` on page 2). `422` for invalid
  enums (body ignored by the client).
- **Legacy Source:** Doc:107, Doc:188-225, Doc:355-366, Doc:507-522; `$KVADRO_ROOT/docs/about.md:187-192`; client
  `src/lib/api/feed.js:75-93`, `src/main.jsx:25` (prefetch), `src/features/feed/useInfiniteFeed.js:36`,
  `src/features/radar/useRadarPreviews.js:42` (one request per radar, first 5 items shown); mocks
  `tools/parity/mocks.mjs:118`, `mocks-filters.mjs:32`.
- **Migration Target:** legacy `GET /api/feed` byte-compatible (query parsing with repeated keys, cursor opacity,
  item shape). Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — default filters return ≤ 20 items with every strict key (`id` number, `photos_preview` array,
  `center_km`/`metro_km`/`median_delta` keys present); pagination — follow `next_cursor` to the end, last page has
  `next_cursor: null`, no duplicates and no gaps; repeated params — `types=apartment&types=house` and `zones=center&zones=near_center`
  are both applied (not last-wins); each sort value; each filter key in isolation (§1.7) with a fixture set;
  booleans — `near_metro=true` applied, absent = not applied, `furnished=false` applied; polygon — 3 and 40
  vertices, self-intersection handled; negative — `deal=foo` → `422` with JSON body, `limit=0`/`1000`, malformed
  `polygon`, unknown `cursor` → defined error; auth — missing/invalid `initData`; access — gated user → `403`;
  consistency — same filters give the same set in `/api/feed`, `/api/feed/count`, `/api/map`.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-004, LB-API-005, LB-API-006,
  LB-API-009, LB-API-029; Q-API-007, Q-API-008, Q-API-010 … Q-API-014, Q-API-022, Q-API-036.

### API-005 — `GET /api/feed/count`

- **Method:** GET
- **URL:** `/api/feed/count`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** query `FilterQuery` (§1.7); no `limit`, `sort`, `cursor`. Sent 250 ms after each filter change with
  abort of the previous request (`useLiveFeedStats.js:12-26`) and once per radar on the radar tab
  (`useRadarPreviews.js:52`).
- **Validation:** as API-004.
- **Business Logic:** number of active listings matching the filters — same interpretation as `/api/feed`
  (Doc:1096). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none; aborted requests show up as dropped connections (Doc:534).
- **Response:** `200 {"count": number}` (Doc:528-532).
- **Errors:** ignored by the client (previous value kept).
- **Legacy Source:** Doc:108, Doc:524-534; client `src/lib/api/feed.js:100-103`,
  `src/features/filters/useLiveFeedStats.js:16`, `src/features/radar/useRadarPreviews.js:52`; mock
  `tools/parity/mocks.mjs:119`.
- **Migration Target:** legacy `GET /api/feed/count` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — `count` equals the total number of items reachable through `/api/feed` pagination with the
  same filters; edge — no matches → `{"count": 0}`; aborted request does not leave server work running (load
  characterisation); negative/auth as API-004.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-052; Q-API-012.

### API-006 — `GET /api/feed/flow`

- **Method:** GET
- **URL:** `/api/feed/flow`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** query `FilterQuery` (§1.7). Sent 500 ms after filter changes (`useLiveFeedStats.js:34-45`), per radar on
  the radar tab (`useRadarPreviews.js:59`) and before the follow nudge (`src/app/useFollowNudge.js:63`).
- **Validation:** as API-004.
- **Business Logic:** rate of new matching listings (`week` = listings in the observation window, `days` = window
  length, client shows ≈ `week / days` per day) and ready-made relaxation options, each with complete filters. —
  DOCUMENTED_ONLY; the selection rules for options are unknown.
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {week: number, days: number (> 0), options?: {code: string, label: string, rate: string,
  filters: SearchFilters (all 25 keys)}[]}` (Doc:540-551). Picking an option replaces the sheet filters and sends its
  `code` as `relaxed` in `POST`/`PUT /api/subscriptions` — never to `/relax` (Doc:553-556). Example option codes in
  mocks: `price`, `rooms` (`tools/parity/mocks-filters.mjs:33-45`). Unread: `options[].count`.
- **Errors:** ignored (no hint shown; the nudge appears without flow data).
- **Legacy Source:** Doc:109, Doc:536-556; client `src/lib/api/feed.js:110-113`,
  `src/features/filters/useLiveFeedStats.js:38`, `src/features/radar/useRadarPreviews.js:59`,
  `src/app/useFollowNudge.js:63`; mocks `tools/parity/mocks.mjs:120`, `:160-164`.
- **Migration Target:** legacy `GET /api/feed/flow` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — `days ≥ 1`, `week ≥ 0`; every `options[].filters` contains all 25 keys with arrays non-null and
  `types` valid for its `deal`; applying an option's filters to `/api/feed/count` returns more results than the
  original filters; edge — wide filters return no options; negative/auth as API-004.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-005, LB-API-006, LB-API-007,
  LB-API-036, LB-API-052.

### API-035 — `GET /api/feed/new`

- **Method:** GET
- **URL:** `/api/feed/new`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** since release `index-DY_DH7h-.js`, called by the return banner (`03` SCR-046); client lines in this row
  are at the pin. Query `FilterQuery` (§1.7), built by the same `buildFilterParams` as `/api/feed/count`, plus `since` =
  the previous visit with these filters as integer unix **seconds** (`Math.floor(ms / 1000)` of the device clock,
  `src/lib/api/feed.js:105-117`); no `limit`, `sort`, `cursor`. The previous visit comes from `kv-visits` (`03`
  BR-APP-070) and has no lower bound on the client, so it can be weeks old. Sent at most once per eligible visit,
  1.8 s after a search-tab visit with meta and radars loaded, nothing over the list and the `03` BR-APP-071
  conditions met (`src/app/useReturnNudge.js:90-143`). Aborted through `AbortSignal` when the filters, the radars or
  the overlay state change during the wait or the request (`useReturnNudge.js:110,138-141`). Sent again when the app
  returns from the background after ≥ 6 h, which starts a new visit session (`useReturnNudge.js:50-71`).
- **Validation:** as API-004; validation and bounds of `since` unknown (Q-API-066). — DOCUMENTED_ONLY
- **Business Logic:** number of listings matching the filters that appeared after `since`, with the filter
  interpretation of `/api/feed`, `/count`, `/flow` and `/map` (current Doc:563-570, :1161). What "appeared" means
  (publication or first seen), whether hidden listings and blocked authors are excluded and whether `since` is clamped
  are open in the legacy contract itself (current Doc:1200-1202; Q-API-066). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none; aborted requests show up as dropped connections.
- **Response:** `200 {"count": number}` (current Doc:566-570). `count` is mandatory and numeric: the client shows the
  banner for `count > 0`, nothing for `0`, and crashes on a body without `count` (current Doc:572-573; LB-API-055,
  `03` LB-APP-048). `return_prompt_shown.n` carries this `count`.
- **Errors:** any status, network failure or timeout → no banner, silently (`useReturnNudge.js:117`; current
  Doc:574).
- **Legacy Source:** `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:16,29`; current Doc:110 (registry #7), Doc:559-588,
  Doc:1161-1162, Doc:1200-1202; client `src/lib/api/feed.js:105-117`,
  `src/app/useReturnNudge.js:112-137`, `src/features/feed/followNudge.js:179-195`; mock
  `tools/parity/mocks.mjs:207-211`; scenarios `return-nudge*` (`tools/parity/mocks.mjs:314-323`).
- **Migration Target:** legacy `GET /api/feed/new` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — `count` equals the number of `/api/feed` items for the same filters that appeared after
  `since` (meaning per Q-API-066); edge — nothing new → `{"count": 0}`; `since` in the future → `{"count": 0}`; `since`
  weeks old → per the bound decided in Q-API-066; every `200` carries an integer `count` (never an empty body or
  `null`); an aborted request leaves no server work running; negative/auth as API-004.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-055; Q-API-066.

### API-007 — `GET /api/map`

- **Method:** GET
- **URL:** `/api/map`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** query `FilterQuery` (§1.7); no viewport, zoom or paging parameters — one request returns all points for
  the filters.
- **Validation:** as API-004.
- **Business Logic:** coordinates of matching listings with a short price label, tone and USD price. — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {points: {id: number|string, lat: number, lon: number, label: string, tone?: "good"|"high"|"check"|"suspicious"|null,
  priced?: boolean, usd?: number|null}[], total?: number}` (Doc:562-574). `lat`/`lon` mandatory numbers; `label` is
  inserted as **HTML** (Leaflet pins `src/features/map/leaflet/icons.js:13`; GL stacks
  `src/features/map/gl/markerElements.js:40`) — must be plain text without `<` and `&`; `priced: false` = negotiable
  price; `usd` orders stacked points (missing/null = Infinity); `total` drives «показано N из M».
- **Errors:** never shown. The GL hook has no rejection handler (`src/features/map/gl/useMapPoints.js:15-22`); the
  `ApiError` rejection is filtered out of `app_error` (`src/lib/errors.js:118`), so a failure leaves an empty map.
- **Legacy Source:** Doc:110, Doc:558-585; client `src/lib/api/feed.js:119`, `src/features/map/gl/useMapPoints.js:15`,
  `src/features/map/leaflet/MapView.jsx:154`; mock `tools/parity/mocks.mjs:86`, `:130`.
- **Migration Target:** legacy `GET /api/map` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — every point has numeric `lat`/`lon`, ids match `/api/feed` ids for the same filters, `total ≥
  points.length`; security — a listing whose source text contains `<script>`/`&` never yields a `label` with `<` or
  `&`; edge — listings without coordinates are absent, polygon filter respected; load — large city returns within the
  15 s client timeout; negative/auth as API-004.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-008; Q-API-015.

### API-008 — `GET /api/listings/:id`

- **Method:** GET
- **URL:** `/api/listings/:id` (optional `?preview=1`)
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** path `id` — positive integer in practice (from API ids, `start_param` `l_<id>…` or `?listing=<id>`,
  `src/lib/telegram/startParam.js:17-25`); Doc:591 allows string or number. Query `preview=1` only from the map
  selection card (`src/features/map/MapSelectionCard.jsx:29`); it loads the current card and both neighbours.
- **Validation:** unknown/removed id → `404`. — CONFIRMED (client handling), server conditions DOCUMENTED_ONLY
- **Business Logic:** full listing card with per-user flags, market comparison, price history, publications,
  author, contact links (`call_url` signed, ~10 min) and nearby places; the server may answer with a **different
  listing** (merged duplicate) — the screen switches to the response `id` without a second request
  (`src/features/listing/hooks/useListingLoader.js:47-58`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:12`, `:16`). —
  DOCUMENTED_ONLY
- **DB Changes:** probably records view history (`viewed`, `GET /api/history`); which variant (full, preview) records
  it is unknown (Q-API-035). — UNVERIFIED
- **Side Effects:** probably increments `stats.views` (Q-API-035). — UNVERIFIED
- **Response:** without `preview` — `200 ListingDetails` (§1.8). With `preview=1` — at least the `ListingPreview`
  minimum the compact card needs: `photos_preview` (array), `title` or `short_title`, `favorite`, and the keys
  `center_km`, `metro_km`, `median_delta` (Doc:601-604). `id` must be a number: compared with `!==` against the
  requested number (Doc:606-608). With `phone` non-null, `call_url` must be non-null (Doc:351-353). Unread:
  `contacts`, `source_url`, `price_per_m`.
- **Errors:** `404` → «Объявление не загрузилось» (no retry button) (`ListingScreen.jsx:115-116`); other errors → error
  state with «Повторить»; `preview=1` errors are not shown (spinner stays, neighbour can be re-requested,
  `MapSelectionCard.jsx:29-36`).
- **Legacy Source:** Doc:111, Doc:227-353, Doc:589-608; `$KVADRO_ROOT/docs/about.md:156-158`; client
  `src/lib/api/listings.js:10-17`, `src/main.jsx:38` (prefetch for deep links), `src/features/listing/hooks/useListingLoader.js:47`,
  `src/features/map/MapSelectionCard.jsx:29`; mocks `tools/parity/mocks.mjs:76-104`, `:145-147`, `:193-196`.
- **Migration Target:** legacy `GET /api/listings/:id` and `GET /api/listings/:id?preview=1` byte-compatible
  (numeric ids). Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — rent, daily, sale × apartment/house/room/commercial/land fixtures each return every strict key
  (`center_km`, `metro_km`, `median_delta`, `history[].price_usd`, `history[].change_pct`, `median_value` when
  `median`, `sources`, `photos_preview`); `id` is a JSON number; `nearby[].kind ∈ {park, school}` and unique;
  `facts[].key` unique; `phone` ⇒ `call_url`; preview — `?preview=1` contains the preview minimum; merge — id of a
  merged duplicate returns the surviving listing with its own `id`; negative — unknown id → `404 {"detail": …}`,
  non-numeric id → `404` or `422` (record legacy), withdrawn listing (Q-API-023); auth — missing/invalid `initData`;
  side effect — history/`viewed` recorded per Q-API-035.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-009, LB-API-010, LB-API-011,
  LB-API-012, LB-API-029, LB-API-030, LB-API-031; Q-API-019, Q-API-021 … Q-API-024, Q-API-035.

### API-009 — `GET /api/listings/:id/call`

- **Method:** GET
- **URL:** `/api/listings/:id/call`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** path `id`.
- **Validation:** listing exists and has a phone (assumed). — UNVERIFIED
- **Business Logic:** issues a fresh temporary web link to the call page `/call/<token>` (RES-005). The first link
  arrives as `call_url` in the listing card; this endpoint is called only to refresh it: by a timer 8 min after the
  last link was obtained (TTL assumed 10 min, refresh 2 min early) when the app is visible, on return to the app when
  the link is stale, and on «Позвонить» with a stale link (`src/features/listing/hooks/useListingContact.js:9-10`,
  `:24-52`, `:62-72`). — DOCUMENTED_ONLY (TTL and single-use rules: Q-API-042)
- **DB Changes:** possibly stores the token or nothing (stateless signature). — UNVERIFIED
- **Side Effects:** none known.
- **Response:** `200 {"url": string}` — relative (`/call/…`) or absolute; resolved against the Mini App origin and
  opened with `openLink` (`useListingContact.js:59`, Doc:614-621).
- **Errors:** refresh errors ignored; on «Позвонить» a failed refresh opens the old link (`useListingContact.js:67-70`).
- **Legacy Source:** Doc:112, Doc:610-624; `$KVADRO_ROOT/docs/about.md:237-241`; client `src/lib/api/listings.js:23`,
  `src/features/listing/hooks/useListingContact.js:26`.
- **Migration Target:** legacy `GET /api/listings/:id/call` byte-compatible; link must stay valid ≥ 10 min. Handler:
  TBD (`10-target-architecture.md`).
- **Tests:** positive — returns `url`; the URL opens the call page for ≥ 10 min; refresh returns a new working URL;
  negative — listing without phone, unknown id → `404`; security — URL cannot be reused for another listing, does not
  expose the phone in the URL; auth — missing/invalid `initData`.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-016, LB-API-045; Q-API-042.

### API-010 — `POST /api/listings/:id/translate`

- **Method:** POST
- **URL:** `/api/listings/:id/translate`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the button is offered only when the UI locale is not `ru`
  (`src/features/listing/hooks/useListingTranslation.js:22`).
- **Input:** path `id`; **no body**, no `Content-Type`. Target language is taken from the user profile (Doc:628).
- **Validation:** listing exists and has `original_text`. — UNVERIFIED
- **Business Logic:** machine translation (Google Gemini) of the listing's original text into the profile language.
  The first tap requests, later taps toggle original/translation locally. — DOCUMENTED_ONLY (`about.md:111`, `:179`)
- **DB Changes:** possibly caches the translation (Q-API-025). — UNVERIFIED
- **Side Effects:** LLM call (cost, latency within the 15 s client timeout).
- **Response:** `200 {"text": string}` (Doc:630-634).
- **Errors:** any error → inline «failed» state, retry possible (`useListingTranslation.js:34-35`).
- **Legacy Source:** Doc:113, Doc:626-634; client `src/lib/api/listings.js:29-32`,
  `src/features/listing/hooks/useListingTranslation.js:32`.
- **Migration Target:** legacy `POST /api/listings/:id/translate` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — `uz_Latn` and `en` profiles get text in that language; phones and `@handles` handled as in the
  pipeline (masking before LLM, `02 §8`); edge — listing whose `original_text` was erased after 90 days; translation
  of already-target-language text; LLM timeout → error within 15 s; negative — unknown id → `404`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-032; Q-API-025.

### API-011 — `POST /api/listings/:id/favorite`

- **Method:** POST
- **URL:** `/api/listings/:id/favorite`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** path `id`; no body.
- **Validation:** listing exists. — UNVERIFIED
- **Business Logic:** **toggles** the favourite flag on the server and returns the resulting state; the bot's
  «⭐ В избранное» / «★ В избранном» buttons use the same toggle (`$KVADRO_ROOT/docs/telegram-bot.md:986`). —
  DOCUMENTED_ONLY
- **DB Changes:** insert or delete a favourite row (user, listing). — UNVERIFIED
- **Side Effects:** none known.
- **Response:** `200 {"favorite": boolean}`; the client uses it as the source of truth
  (`src/components/FavButton.jsx:27`). `204` or an error rolls the heart back.
- **Errors:** any error → optimistic state reverted silently.
- **Legacy Source:** Doc:114, Doc:636-647; client `src/lib/api/listings.js:38-41`, `src/components/FavButton.jsx:27`.
- **Migration Target:** legacy `POST /api/listings/:id/favorite` (toggle) byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — two calls return `true` then `false`; `GET /api/favorites` reflects the state; concurrency —
  two parallel calls end in a defined state (record legacy behaviour, Q-API-038); bot ↔ app consistency; negative —
  unknown id → `404`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-039; Q-API-038.

### API-012 — `POST /api/listings/:id/hide`

- **Method:** POST
- **URL:** `/api/listings/:id/hide`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** path `id`; no body.
- **Validation:** listing exists. — UNVERIFIED
- **Business Logic:** hides the listing for this user only (`$KVADRO_ROOT/docs/about.md:226`). The client hides it
  locally, closes the card and offers «Отменить» (undo = API-013) (`src/app/useListingActions.js:35-51`). —
  DOCUMENTED_ONLY
- **DB Changes:** insert a hidden-listing row. — UNVERIFIED
- **Side Effects:** the listing should disappear from feed/map/radar delivery for this user (Q-API-036).
- **Response:** not read; recommended `204` (Doc:651). Toast «Объявление скрыто» (`ru.js:202`).
- **Errors:** any error → «Не получилось сохранить» (`useListingActions.js:82`, `ru.js:13`).
- **Legacy Source:** Doc:115, Doc:649-651; client `src/lib/api/listings.js:47-50`,
  `src/features/listing/ListingActionsSheet.jsx:71`; mocks `tools/parity/mocks.mjs:178`, `:185-189`.
- **Migration Target:** legacy `POST /api/listings/:id/hide` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — `2xx`; listing appears in `GET /api/hidden.listings`; excluded from feed/count/map per
  Q-API-036; idempotency — second call does not error or duplicate; negative — unknown id; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-041, LB-API-043; Q-API-036,
  Q-API-038.

### API-013 — `DELETE /api/listings/:id/hide`

- **Method:** DELETE
- **URL:** `/api/listings/:id/hide`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** path `id`; no body.
- **Validation:** none known.
- **Business Logic:** returns a hidden listing to the user's results. Used as undo after hide, as undo after a
  `fraud` report that hid the listing (`useListingActions.js:61-62`) and to return a listing from «Скрытое»
  (`src/features/settings/HiddenScreen.jsx:53`). The bot's «↩️ Не сдано» is assumed to map here 🔶
  (`$KVADRO_ROOT/docs/telegram-bot.md:987`). — DOCUMENTED_ONLY
- **DB Changes:** delete the hidden-listing row (and possibly the report-induced hide — Q-API-040). — UNVERIFIED
- **Side Effects:** none known.
- **Response:** not read; recommended `204` (Doc:655).
- **Errors:** undo failure → listing hidden again and «Не получилось сохранить» (`useListingActions.js:43-46`;
  mock `tools/parity/mocks.mjs:183-188`).
- **Legacy Source:** Doc:116, Doc:653-655, Doc:700-702; client `src/lib/api/listings.js:56-59`,
  `src/app/useListingActions.js:51`, `:62`, `src/features/settings/HiddenScreen.jsx:53`.
- **Migration Target:** legacy `DELETE /api/listings/:id/hide` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — after hide then unhide the listing is back in feed and gone from `/api/hidden`; after a
  `fraud` report with `hidden: true` the undo restores it; idempotency — unhide of a non-hidden listing is a no-op
  `2xx`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-040; Q-API-040.

### API-014 — `POST /api/listings/:id/block-author`

- **Method:** POST
- **URL:** `/api/listings/:id/block-author`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** path `id` (a listing of the author); no body.
- **Validation:** listing exists and has an author (phone or source channel). — UNVERIFIED
- **Business Logic:** blocks the listing's author — by phone or, without a phone, by source channel
  (`author.kind: phone|source`) — and hides all of the author's listings for this user
  (`$KVADRO_ROOT/docs/about.md:227`). — DOCUMENTED_ONLY
- **DB Changes:** insert a blocked-author row (author key = phone hash/number or channel). — UNVERIFIED
- **Side Effects:** the author's listings disappear from the user's feed/map/radars (Q-API-036).
- **Response:** `200 {"listing_ids": (number|string)[], "label": string}` (Doc:661-669). `listing_ids` is spread
  (`[...new Set([id, ...ids])]`, `useListingActions.js:55`) — must be an array; may omit `:id`. `label` goes into the
  toast «Автор {label} заблокирован» (`ru.js:203`); the mock uses a masked phone label
  (`tools/parity/mocks.mjs:187`).
- **Errors:** any error → «Не получилось сохранить».
- **Legacy Source:** Doc:117, Doc:657-669; client `src/lib/api/listings.js:65-68`,
  `src/features/listing/ListingActionsSheet.jsx:79-85`.
- **Migration Target:** legacy `POST /api/listings/:id/block-author` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — phone author: returns all active listings with that phone; source author: all listings of the
  channel; the author appears in `GET /api/hidden.authors` with `kind`, `label`, `count`; `label` masks the phone;
  idempotency — second call; negative — unknown id; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-040, LB-API-043; Q-API-036,
  Q-API-038.

### API-015 — `DELETE /api/listings/:id/block-author`

- **Method:** DELETE
- **URL:** `/api/listings/:id/block-author`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** path `id` (listing whose author is unblocked); no body.
- **Validation:** none known.
- **Business Logic:** unblocks the author determined from listing `:id`; used only as the undo of a block
  (`useListingActions.js:52-60`). The settings screen unblocks through API-027 by author entry id instead. —
  DOCUMENTED_ONLY
- **DB Changes:** delete the blocked-author row. — UNVERIFIED
- **Side Effects:** the author's listings return.
- **Response:** not read; recommended `204` (Doc:671-673).
- **Errors:** undo failure → listings hidden again and «Не получилось сохранить».
- **Legacy Source:** Doc:118, Doc:671-673; client `src/lib/api/listings.js:74-77`, `src/app/useListingActions.js:59`.
- **Migration Target:** legacy `DELETE /api/listings/:id/block-author` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — after block + unblock the author is gone from `/api/hidden.authors`; equivalence with
  API-027 on the same author; idempotency; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-040.

### API-016 — `POST /api/listings/:id/report`

- **Method:** POST
- **URL:** `/api/listings/:id/report`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; anti-abuse weighting applies (`02 §11`).
- **Input:** path `id`; body `{"reason": "rented"|"agent"|"wrong_data"|"fraud"}` (`Content-Type: application/json`).
  `agent` is not offered when the card says `is_owner: false`
  (`src/features/listing/ListingActionsSheet.jsx:12`, `:176`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:77`).
  Since release `index-BNLZFfL0.js` a `wrong_data` report carries
  `"detail": "price"|"rooms"|"place"|"photos"|"other"`, picked on the detail view of the actions sheet (`03` SCR-023):
  `{"reason": "wrong_data", "detail": "price"}`. The client adds the key only when `detail` is truthy and only the
  detail view passes one, so the other reasons keep the old body without the key (not `null`, not `""`)
  (`src/lib/api/listings.js:86-90`; `src/features/listing/ListingActionsSheet.jsx:93-102`, `:176-200`). This client
  no longer sends `wrong_data` without `detail`; older cached bundles still can, and the legacy contract requires the
  server to accept both bodies (current `$KVADRO_ROOT/docs/api.md:724-744`, `:1171-1172`).
- **Validation:** `reason` from the four literals (Pydantic `Literal` assumed → `422` otherwise). `detail` is optional;
  the answer to `detail` with another reason or to an unknown code is unknown (Q-API-064). — UNVERIFIED
- **Business Logic:** records the vote. `rented`: hidden for the voter at once, for everybody after more
  confirmations; `agent`: the phone is remembered as a realtor's and marked in all its listings; `wrong_data`:
  recorded; `fraud`: may hide the listing for the reporter immediately (`$KVADRO_ROOT/docs/about.md:221-228`). —
  DOCUMENTED_ONLY (thresholds 🔶, Q-API-039). Whether `detail` is only stored for moderation or also affects `hidden`
  is open in the legacy contract itself (current `$KVADRO_ROOT/docs/api.md:1198-1199`). — UNVERIFIED (Q-API-064)
- **DB Changes:** insert a vote/report row (with `detail` when sent); possibly update listing status, realtor mark on
  the phone, hidden row. — UNVERIFIED
- **Side Effects:** global effects on other users (status after confirmations, realtor badge, `owner` filter
  results, owner-verification eligibility).
- **Response:** `200 {"hidden": boolean}` **for every reason** — a `204` makes the client show
  «Не получилось сохранить» although the report was accepted (Doc:704-705; mock `tools/parity/mocks.mjs:175-177`).
  Client toasts: `rented` → «Отметили: уже сдано» (listing hidden locally, card closed, no undo); `agent` →
  «Отметили номер как риелторский»; `fraud` with `hidden: true` → «Спасибо, посмотрим. Это объявление у вас скрыли»
  with undo via API-013; others, including `wrong_data` with any `detail` → «Спасибо! Посмотрим»
  (`useListingActions.js:61-77`, `ru.js:229-232`; audited tree `ru.js:217-220`).
- **Errors:** any error → «Не получилось сохранить».
- **Legacy Source:** Doc:119, Doc:675-705; `$KVADRO_ROOT/docs/about.md:219-228`; client
  `src/lib/api/listings.js:84-90`, `src/features/listing/ListingActionsSheet.jsx:89-95`,
  `src/app/useListingActions.js:61-77` (audited tree). Release `index-BNLZFfL0.js`: `src/lib/api/listings.js:79-90`,
  `src/features/listing/ListingActionsSheet.jsx:13-14`, `:93-102`, `:175-200`; current
  `$KVADRO_ROOT/docs/api.md:707-758`; `$KVADRO_ROOT/demo/app/docs/releases/2026-11-12_index-BNLZFfL0/REPORT.md:22-24`;
  parity scenarios `tools/parity/mocks.mjs:281-293`.
- **Migration Target:** legacy `POST /api/listings/:id/report` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — each reason returns JSON `{hidden}` (never `204`); `fraud` returns `hidden: true` when the
  listing was hidden for the reporter; `rented` hides for the voter; `agent` marks the phone (per threshold);
  `wrong_data` with each of `price`, `rooms`, `place`, `photos`, `other` → `200 {hidden}`, the `detail` kept with the
  report; compatibility — `{"reason": "wrong_data"}` without `detail` (older bundle) → `200 {hidden}`; the other
  reasons without the key → `200`; negative — `reason: "spam"` → `422`, missing body → `422`; an unknown `detail` code
  and a `detail` with another reason → per Q-API-064 (record legacy first); repeat — same user, same reason twice is
  counted once (record legacy, Q-API-038); anti-abuse — low-trust accounts do not flip global state alone; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (`detail` handling `UNVERIFIED`). Related:
  LB-API-015, LB-API-042, LB-API-043; Q-API-038 … Q-API-040, Q-API-064.

### API-017 — `POST /api/listings/:id/share`

- **Method:** POST
- **URL:** `/api/listings/:id/share`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; called only when `WebApp.shareMessage` exists and Telegram ≥ 8.0
  (`src/lib/telegram/share.js:12-15`).
- **Input:** path `id`; no body.
- **Validation:** listing exists. — UNVERIFIED
- **Business Logic:** prepares a Telegram message for `WebApp.shareMessage(id)` — probably Bot API
  `savePreparedInlineMessage` for this user 🔶 (`$KVADRO_ROOT/docs/about.md:243-246`). — UNVERIFIED (Q-API-044)
- **DB Changes:** none known.
- **Side Effects:** outbound Bot API call per tap.
- **Response:** `200 {"id": string}` (prepared message id) (Doc:711-715; mock `tools/parity/mocks.mjs:129`).
- **Errors:** any failure (or `shareMessage` unavailable) → fallback: share link
  `https://t.me/<bot_username>?startapp=l_<id>` with text «title · price · kind · district»
  (`src/features/listing/ListingTitleRow.jsx:28-49`). `listing_shared` is tracked before the attempt.
- **Legacy Source:** Doc:120, Doc:707-717; `$KVADRO_ROOT/docs/about.md:243-246`; client
  `src/lib/api/listings.js:97-100`, `src/features/listing/ListingTitleRow.jsx:35`.
- **Migration Target:** legacy `POST /api/listings/:id/share` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — returns `id` accepted by `WebApp.shareMessage` for the same user (integration with a test
  bot); the prepared message contains the Mini App deep link `startapp=l_<id>`; negative — unknown id → `404`; Bot
  API failure → non-2xx (client falls back); auth.
- **Status:** Contract `CONFIRMED`; server logic `UNVERIFIED`. Related: LB-API-046; Q-API-044.

### API-018 — `GET /api/subscriptions`

- **Method:** GET
- **URL:** `/api/subscriptions`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** none.
- **Validation:** auth only.
- **Business Logic:** the user's radars (saved searches) — the same set the bot manages (`/subs`, wizard,
  free-text) (`$KVADRO_ROOT/docs/telegram-bot.md:976`). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 Subscription[]` — a bare array, not `{items}` (Doc:725-729). Each `filters` object must contain all
  25 `SearchFilters` keys with arrays non-null (only `zones` may be missing) — the client serialises them for
  `/api/feed`, `/count`, `/flow` per radar and compares them with `sameFilters`
  (`src/features/filters/model.js:45-63`). `types` must be valid for the `deal`: the radar title is built through
  `t('type.<code>')`, which throws on unknown keys (Doc:177-179). `hidden > 0` shows «Скрыто: N» and enables
  `PATCH {unhide: true}`. Unread: `title`, `new_count`, `finds`, `created_at`, `hidden_count`.
- **Errors:** radar tab → error state with «Повторить» (`src/features/radar/RadarScreen.jsx:58`, `:193-195`);
  elsewhere ignored.
- **Legacy Source:** Doc:121, Doc:368-378, Doc:721-729; client `src/lib/api/subscriptions.js:5`,
  `src/app/App.jsx:175` (search tab; since release `index-DY_DH7h-.js` also re-read when the app returns from the
  background after ≥ 6 h, `src/app/useReturnNudge.js:62-66` at the pin), `src/app/subscriptionActions.js:95` (re-read
  before every create), `src/features/radar/RadarScreen.jsx:58`, `src/features/settings/SettingsScreen.jsx:60`; mock
  `tools/parity/mocks.mjs:105-107`, `:121`.
- **Migration Target:** legacy `GET /api/subscriptions` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — radars created in the app and in the bot both appear; every `filters` has 25 keys; ids stable;
  migrated legacy radars (pre-`zones`) come back normalised; edge — empty list → `[]`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-005, LB-API-006, LB-API-038;
  Q-API-013, Q-API-032.

### API-019 — `POST /api/subscriptions`

- **Method:** POST
- **URL:** `/api/subscriptions`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the bot must be able to write to the user (else `409 no_chat`); limit
  `max_subscriptions` (default 10).
- **Input:** body `{"filters": SearchFilters, "entry": "filters"|"empty"|"few"|"prompt"|"feed"|"return", "relaxed"?:
  string}` (Doc:733-738; current Doc:786-807). `entry`: `filters` = «Включить радар» in the filters sheet
  (`App.jsx:582`), `empty` = «Создать радар» sheet on the radar tab / «+» (`App.jsx:599`), `few` = banner under a short
  result list (`App.jsx:310`), `prompt` = follow nudge (`App.jsx:631`). Since release `index-DY_DH7h-.js` also `feed` =
  the in-feed radar card and `return` = the return banner (`03` SCR-047, SCR-046): sent at once for custom filters, or
  from the create-radar sheet for default filters; that sheet now sends the `entry` of the place it was opened from
  and, from «+» and the empty radar screen, still `empty` (`App.jsx:401-415`, `:635`, `:718`, `:752` at the pin).
  `relaxed` = `code` of a `/api/feed/flow` option, only when the radar is created in a filters sheet (`filters`,
  `empty`, and `feed` / `return` through the create-radar sheet; never from the banner or the card directly); omitted
  from JSON when not chosen. `filters.posted_days` is sent as it is in the feed filters.
- **Validation:** filters schema (Pydantic `Literal`s assumed); limit; `no_chat` check **before** any write. —
  DOCUMENTED_ONLY
- **Business Logic:** before calling, the client re-reads API-018 and looks for a radar with the same filters
  ignoring `posted_days`: active → no request, toast «Радар по этому поиску уже включён»; inactive →
  `PATCH {active: true}` instead (API-021), `entry`/`relaxed` lost (`subscriptionActions.js:94-129`). Server: creates
  the radar (mode default unknown — Q-API-031), counts `starter` (listings already matching; the bot lists
  «Уже есть за последние 3 дня: N») and, for empty/narrow results, `options` (relax suggestions) and `relaxed` hints.
  — DOCUMENTED_ONLY
- **DB Changes:** insert subscription; store `entry`/`relaxed` for statistics (Q-API-034). — UNVERIFIED
- **Side Effects:** the bot posts the starter listings into the chat (toast «Радар включён. {count} уже в чате с
  ботом», `ru.js:56`). — DOCUMENTED_ONLY
- **Response:** `200 SubscriptionMutationResult` (§1.8). `starter > 0` → toast with the count; otherwise with options →
  «Радар включён, но таких объявлений мало. {what}: {rate}» + «Расширить» (first option with `count ≥ 7`, else the
  last; its `code` goes to API-023); without options → «Радар включён — новые придут в чат, как только появятся{hint}»
  with `relaxed[0].text` (`subscriptionActions.js:49-67`, `:137-143`; `ru.js:56-60`).
- **Errors:** `409 {"detail":"no_chat"}` → Telegram write-access request, one automatic repeat on consent, else offer
  to open the bot chat; final toast «Радар не включён — боту нужно разрешение писать вам в чат»
  (`src/lib/chatAccess.js:27-54`, `ru.js:390`); `409` without `no_chat` → limit toast (`ru.js:64`); other →
  «Не получилось сохранить».
- **Legacy Source:** Doc:122, Doc:731-754, Doc:76-85; current Doc:784-811, :1163; `$KVADRO_ROOT/docs/about.md:194-211`;
  client `src/lib/api/subscriptions.js:13-21`, `src/app/subscriptionActions.js:131`; at the pin
  `src/app/App.jsx:399-415`, `:629-635`, `:712-721`, `:749-753`; parity `feed-radar-setup` and `return-nudge-setup`
  (`tools/parity/mocks.mjs:307`, `:317`).
- **Migration Target:** legacy `POST /api/subscriptions` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — creates radar; response has `subscription` (25-key filters), numeric `starter`, `relaxed`
  array; starter cards delivered to the bot chat once; narrow filters → `options` with codes accepted by API-023;
  `no_chat` — user who never started the bot gets `409 no_chat` and **no radar is created** (repeat after granting
  access creates exactly one); limit — 11th radar → `409` whose `detail` is not `no_chat`, nothing created;
  validation — invalid `deal`/`types`/`entry` → `422`; `entry` `feed` and `return` accepted (current Doc:1163);
  `relaxed` absent vs present; idempotency — double submit does not create two radars (record legacy, Q-API-034);
  auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-013, LB-API-014, LB-API-033 …
  LB-API-037; Q-API-027, Q-API-031, Q-API-033, Q-API-034.

### API-020 — `PUT /api/subscriptions/:id`

- **Method:** PUT
- **URL:** `/api/subscriptions/:id`
- **Auth:** `tma` required.
- **Roles/access mode:** owner of the radar; `no_chat` applies.
- **Input:** path `id`; body `{"filters": SearchFilters, "relaxed"?: string}` (Doc:760-765) — full replacement of
  the filters from the radar editor (`subscriptionActions.js:160-165`).
- **Validation:** as API-019; ownership. — DOCUMENTED_ONLY
- **Business Logic:** replaces filters; recomputes `starter`/`options`/`relaxed`; after an edit only listings the user
  has not received yet are sent 🔶 (`$KVADRO_ROOT/docs/about.md:200-201`). — DOCUMENTED_ONLY / UNVERIFIED
- **DB Changes:** update subscription filters. — UNVERIFIED
- **Side Effects:** possibly sends new starter cards to the chat (Q-API-031).
- **Response:** `200 SubscriptionMutationResult`; toasts «Радар обновлён. {count} под новые условия — в чате с ботом»,
  «Радар обновлён. Пока пусто{hint}» or «Радар обновлён, но таких объявлений мало. {what}: {rate}» (`ru.js:58-61`)
  (`subscriptionActions.js:166-175`).
- **Errors:** `409 no_chat` → write-access flow; any other error incl. limit `409` → «Не получилось сохранить».
- **Legacy Source:** Doc:123, Doc:756-767; client `src/lib/api/subscriptions.js:29-36`,
  `src/app/subscriptionActions.js:163`; mock `tools/parity/mocks.mjs:158-172`.
- **Migration Target:** legacy `PUT /api/subscriptions/:id` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — filters replaced, response carries new filters and `relaxed` array; already delivered listings
  are not re-sent; `no_chat` before change (filters unchanged after `409`); ownership — another user's id → `404`/`403`
  (record legacy); validation `422`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-013, LB-API-014, LB-API-035,
  LB-API-036; Q-API-031.

### API-021 — `PATCH /api/subscriptions/:id`

- **Method:** PATCH
- **URL:** `/api/subscriptions/:id`
- **Auth:** `tma` required.
- **Roles/access mode:** owner; `no_chat` applies to `{active: true}`.
- **Input:** path `id`; body — exactly one of `{"active": true}`, `{"active": false}`, `{"mode": "instant"}`,
  `{"mode": "digest"}`, `{"unhide": true}` (Doc:771-791).
- **Validation:** one known key; ownership. — DOCUMENTED_ONLY
- **Business Logic:** `active` pauses/resumes (resume counts `starter` = unseen matches, toast «Радар снова включён.
  {count}, которые вы не видели, — в чате с ботом», `ru.js:476`); `mode` switches instant/digest delivery; `unhide`
  clears the radar's hide rules (channel/district, 🔶 author) created by the bot's «Скрыть похожие». The server may ask
  for the «Нашли жильё?» survey via `ask_found` (on pause, any `active` value is honoured by the client). —
  DOCUMENTED_ONLY
- **DB Changes:** update `active` / `mode` / delete hide rules. — UNVERIFIED
- **Side Effects:** resume may post unseen listings to the chat (Q-API-033).
- **Response:** `200 {"subscription": Subscription, "starter"?: number, "ask_found"?: boolean}` — `subscription`
  always (Doc:795-808). Read by the radar toggle (`subscription`, `starter`, `ask_found`), by mode/unhide
  (`subscription` only, toast «Скрытое снова показывается», `ru.js:376`); not read when used instead of `POST`
  (`RadarScreen.jsx:92-161`; `subscriptionActions.js:104-128`).
- **Errors:** toggle: any error reverts the switch silently, `no_chat` additionally shows the no-chat toast; `409`
  limit on toggle is reverted silently; on the create path `409` without `no_chat` → limit toast; mode/unhide errors
  revert silently.
- **Legacy Source:** Doc:124, Doc:769-808; `$KVADRO_ROOT/docs/telegram-bot.md:978-980`; client
  `src/lib/api/subscriptions.js:56-60`, `src/app/subscriptionActions.js:108`, `src/features/radar/RadarScreen.jsx:99`,
  `:134`, `:151`; mock `tools/parity/mocks.mjs:148-156`.
- **Migration Target:** legacy `PATCH /api/subscriptions/:id` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — each of the five bodies returns the updated `subscription`; resume returns `starter`;
  pause/resume within the limit; `ask_found` per Q-API-030; `no_chat` on `{active: true}` → `409` and radar stays
  inactive; limit — resuming when the user already has the maximum active (record legacy: is the limit on total or
  active radars?); negative — empty body, two keys, unknown key, `mode: "weekly"` → `422`; ownership; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-013, LB-API-033, LB-API-034;
  Q-API-030, Q-API-032, Q-API-033.

### API-022 — `DELETE /api/subscriptions/:id`

- **Method:** DELETE
- **URL:** `/api/subscriptions/:id`
- **Auth:** `tma` required.
- **Roles/access mode:** owner.
- **Input:** path `id`; no body. The client first asks «Удалить радар «{name}»?» (`ru.js:477`).
- **Validation:** ownership. — DOCUMENTED_ONLY
- **Business Logic:** deletes the radar; may ask for the survey (`ask_found`). — DOCUMENTED_ONLY
- **DB Changes:** delete subscription (and its hide rules / delivery records? — Q-API-031). — UNVERIFIED
- **Side Effects:** none known.
- **Response:** `200 {"ask_found"?: boolean}` or `204` (Doc:812-820); `ask_found: true` opens the survey with
  `trigger: "delete"` (`RadarScreen.jsx:172-178`).
- **Errors:** any error → haptic only.
- **Legacy Source:** Doc:125, Doc:810-820; client `src/lib/api/subscriptions.js:66-69`,
  `src/features/radar/RadarScreen.jsx:172`; mock `tools/parity/mocks.mjs:152`.
- **Migration Target:** legacy `DELETE /api/subscriptions/:id` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — radar gone from API-018 and from bot `/subs`; `200 {ask_found}` or `204`; repeat delete →
  `404` (record legacy); ownership; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: Q-API-030, Q-API-031.

### API-023 — `POST /api/subscriptions/:id/relax`

- **Method:** POST
- **URL:** `/api/subscriptions/:id/relax`
- **Auth:** `tma` required.
- **Roles/access mode:** owner; `no_chat` applies.
- **Input:** path `id`; body `{"code": string}` — a `code` from `SubscriptionMutationResult.options` (examples in
  mocks: `district`, `price_more`; doc example `price`) (Doc:824-828; `tools/parity/mocks.mjs:168`).
- **Validation:** code must be one the server offered for this radar (assumed). — UNVERIFIED
- **Business Logic:** relaxes the radar's filters according to the option (e.g. any district, higher price, «Вместе
  с риелторами» in the bot) and counts new `starter`. — DOCUMENTED_ONLY (`$KVADRO_ROOT/docs/telegram-bot.md:983`)
- **DB Changes:** update subscription filters. — UNVERIFIED
- **Side Effects:** may post new starter cards to the chat.
- **Response:** `200 {"starter": number}` — only `starter` is read; toasts `toast.subUpdated` / «Радар расширен — новые
  придут в чат, как только появятся» (`subscriptionActions.js:69-87`, `ru.js:63`).
- **Errors:** `409 no_chat` → write-access flow then «Радар не включён — …»; other → «Не получилось сохранить».
- **Legacy Source:** Doc:126, Doc:822-838; client `src/lib/api/subscriptions.js:43-49`,
  `src/app/subscriptionActions.js:72`.
- **Migration Target:** legacy `POST /api/subscriptions/:id/relax` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — each offered code changes the stored filters as described by its `label` and returns
  `starter`; `GET /api/subscriptions` shows the relaxed filters with 25 keys; negative — unknown code → `422`/`400`
  (record legacy); `no_chat` before change; ownership; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-013, LB-API-036; Q-API-034.

### API-024 — `GET /api/settings`

- **Method:** GET
- **URL:** `/api/settings`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** none.
- **Validation:** auth only.
- **Business Logic:** notification and display settings with the server's preset lists. — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {quiet: string ("off" | "HH-HH"), digest: string ("HH" or "HH,HH"), locale: string,
  currency: string, locales: {code, name}[], currencies: {code, name}[], quiet_presets: string[],
  digest_presets: string[]}` (Doc:844-855). `digest.split(',')` is called in the radar sheet
  (`src/features/radar/RadarSheet.jsx:52-61`) — `digest` must be a string. Unread: `theme`, `city`. Preset values:
  api.md examples `off`, `23-08`, `22-09` / `09`, `09,21`, `21` (mock `tools/parity/mocks.mjs:124`) vs bot presets
  `off`, `22-08`, `23-08`, `00-09`, `23-07` / `09`, `09,19`, `12,20`, `19`
  (`$KVADRO_ROOT/docs/telegram-bot.md:990`) — Q-API-029.
- **Errors:** settings screen → error state with «Повторить»; radar sheet ignores errors.
- **Legacy Source:** Doc:127, Doc:842-855; client `src/lib/api/settings.js:5`,
  `src/features/settings/SettingsScreen.jsx:59`, `src/features/radar/RadarSheet.jsx:52`.
- **Migration Target:** legacy `GET /api/settings` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — all eight keys; `quiet ∈ quiet_presets`, `digest ∈ digest_presets`; values match the bot's
  `/settings`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-050; Q-API-029.

### API-025 — `PUT /api/settings`

- **Method:** PUT
- **URL:** `/api/settings`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** body — a **partial** object with one of `city: string`, `theme: "auto"|"light"|"dark"`,
  `locale: "ru"|"uz_Latn"|"en"`, `currency: "USD"|"UZS"`, `quiet: string`, `digest: string` (Doc:859-884). Senders:
  first language picker `{locale}` (`src/features/onboarding/LanguagePicker.jsx:32`); city changes `{city}`
  (`src/lib/city.js:20-26`, triggered from `src/app/App.jsx:301`, `:387`, `:395`); settings screen `{theme}`
  (`SettingsScreen.jsx:105`), `{locale}`/`{currency}` + page reload (`SettingsScreen.jsx:119`), `{quiet}`/`{digest}`
  (`SettingsScreen.jsx:91`).
- **Validation:** known keys and values (preset membership assumed). — UNVERIFIED
- **Business Logic:** merges the patch into the profile; the same profile drives the bot language (🔶) and
  `GET /api/meta` (`locale_chosen`/`city_chosen` become `true`). — DOCUMENTED_ONLY
- **DB Changes:** update user settings. — UNVERIFIED
- **Side Effects:** bot command menu language follows the locale (`setMyCommands` per user 🔶, `about.md:318`).
- **Response:** `200` full `SettingsResponse` (as API-024). Read only for `quiet`/`digest` (replaces local state,
  `SettingsScreen.jsx:83-95`); ignored for the others (Doc:886-888).
- **Errors:** quiet/digest/theme → rollback + haptic; locale/currency → no reload, haptic; city → ignored
  (`city.js:23-25`); language picker → haptic, can retry.
- **Legacy Source:** Doc:128, Doc:857-897; client `src/lib/api/settings.js:11-15` and the call sites above.
- **Migration Target:** legacy `PUT /api/settings` (partial semantics) byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — each single-key patch persists and returns the full object; `GET /api/meta` then reflects
  `locale`/`theme`/`city`/`currency` with `locale_chosen: true`/`city_chosen: true`; keys not sent stay unchanged;
  negative — unknown locale, `quiet` outside presets, unknown city → `422`; empty body → no-op or `422` (record
  legacy); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-018, LB-API-049, LB-API-050;
  Q-API-057.

### API-026 — `GET /api/hidden`

- **Method:** GET
- **URL:** `/api/hidden`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** none.
- **Validation:** auth only.
- **Business Logic:** the user's hidden listings and blocked authors (phone or source channel) with listing counts. —
  DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {listings: ListingPreview[], authors: {id: number|string, kind: "phone"|"source"|string,
  label: string, count: number}[]}` — both arrays always present (Doc:903-915; both `.length` values are summed in `src/features/settings/HiddenScreen.jsx:66` and
  `src/features/settings/SettingsScreen.jsx:135`).
- **Errors:** ignored on the settings screen (row hidden).
- **Legacy Source:** Doc:129, Doc:901-915; client `src/lib/api/user.js:5`, `src/features/settings/SettingsScreen.jsx:64`;
  mock `tools/parity/mocks.mjs:108-112`.
- **Migration Target:** legacy `GET /api/hidden` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — after hide/block the entries appear; phone labels are masked; `count` equals the author's
  listing count; empty → `{listings: [], authors: []}`; scope of report-hidden listings per Q-API-037; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-040; Q-API-037.

### API-027 — `DELETE /api/hidden/:id`

- **Method:** DELETE
- **URL:** `/api/hidden/:id`
- **Auth:** `tma` required.
- **Roles/access mode:** owner of the entry.
- **Input:** path `id` — the **author entry id** from `authors[]`, not a listing id (Doc:917-920). Hidden listings are
  returned through API-013 instead.
- **Validation:** entry belongs to the user. — UNVERIFIED
- **Business Logic:** removes the blocked author. — DOCUMENTED_ONLY
- **DB Changes:** delete blocked-author row. — UNVERIFIED
- **Side Effects:** the author's listings return.
- **Response:** not read; recommended `204`.
- **Errors:** optimistic removal rolled back with haptic (`src/features/settings/HiddenScreen.jsx:26-37`).
- **Legacy Source:** Doc:130, Doc:917-920; client `src/lib/api/user.js:11-14`, `src/features/settings/HiddenScreen.jsx:45`.
- **Migration Target:** legacy `DELETE /api/hidden/:id` byte-compatible (author entry ids preserved by the data
  migration). Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — author entry removed; same result as API-015 on the same author; negative — listing id passed
  as `:id` does nothing harmful / `404`; another user's entry id → `404`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-040.

### API-028 — `DELETE /api/hidden`

- **Method:** DELETE
- **URL:** `/api/hidden`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** none (client first asks «Снова показывать все скрытые объявления и заблокированных авторов?», `ru.js:216`).
- **Validation:** auth only.
- **Business Logic:** clears all hidden listings **and** all blocked authors of the user. — DOCUMENTED_ONLY
- **DB Changes:** delete the user's hidden-listing and blocked-author rows. — UNVERIFIED
- **Side Effects:** none known.
- **Response:** not read; recommended `204`.
- **Errors:** rollback + haptic.
- **Legacy Source:** Doc:131, Doc:922-924; client `src/lib/api/user.js:17-20`, `src/features/settings/HiddenScreen.jsx:62`.
- **Migration Target:** legacy `DELETE /api/hidden` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — both lists empty afterwards; radar hide rules untouched (record legacy, Q-API-037);
  report-hidden listings per Q-API-037; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: Q-API-037.

### API-029 — `GET /api/favorites`

- **Method:** GET
- **URL:** `/api/favorites`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; `403` → «Нет доступа».
- **Input:** none — the client never sends `cursor` (`useInfiniteFeed.js:31-33`).
- **Validation:** auth only.
- **Business Logic:** the user's favourites (shared with the bot's `/fav`). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {items: ListingPreview[], next_cursor: null}` — the whole list in one page; any non-null
  `next_cursor` (or a missing key) loops the same request (Doc:930-941). The client additionally filters out items
  unfavourited or hidden in this session (`ListingFeed.jsx:81-83`).
- **Errors:** `403` → «Нет доступа»; other → error state.
- **Legacy Source:** Doc:132, Doc:926-941; client `src/lib/api/user.js:23`, `src/features/feed/useInfiniteFeed.js:33`;
  mocks `tools/parity/mocks.mjs:122`, `mocks-filters.mjs:83`.
- **Migration Target:** legacy `GET /api/favorites` byte-compatible (`next_cursor: null`). Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — favourites from app and bot, `next_cursor` is JSON `null`, every item has the preview strict
  keys, withdrawn listings handling (status_text) per Q-API-023; edge — empty list; large list (e.g. 500) still one
  page; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-004, LB-API-024; Q-API-009.

### API-030 — `GET /api/history`

- **Method:** GET
- **URL:** `/api/history`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; `403` → «Нет доступа».
- **Input:** none (never a cursor) — `useInfiniteFeed.js:34-35`.
- **Validation:** auth only.
- **Business Logic:** listings the user viewed (which action records a view: Q-API-035), most recent first
  (assumed). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {items: ListingPreview[], next_cursor: null}` (same rules as API-029).
- **Errors:** as API-029.
- **Legacy Source:** Doc:133, Doc:926-941; client `src/lib/api/user.js:26`, `src/features/feed/useInfiniteFeed.js:35`;
  mocks `tools/parity/mocks.mjs:123`, `mocks-filters.mjs:85`.
- **Migration Target:** legacy `GET /api/history` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — opening a listing adds it (once, moved to top); `next_cursor: null`; retention per Q-API-009;
  after API-031 empty; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-004, LB-API-024; Q-API-009,
  Q-API-035.

### API-031 — `DELETE /api/history`

- **Method:** DELETE
- **URL:** `/api/history`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** none (client first asks «Очистить историю просмотров?», `ru.js:108`).
- **Validation:** auth only.
- **Business Logic:** clears the view history. Whether `viewed` flags on feed items also reset is unknown
  (Q-API-035). — DOCUMENTED_ONLY
- **DB Changes:** delete the user's history rows. — UNVERIFIED
- **Side Effects:** none known.
- **Response:** not read; recommended `204`.
- **Errors:** haptic only (`src/features/feed/ListingFeed.jsx:93-103`).
- **Legacy Source:** Doc:134, Doc:943-945; client `src/lib/api/user.js:29-32`, `src/features/feed/ListingFeed.jsx:96`.
- **Migration Target:** legacy `DELETE /api/history` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — `GET /api/history` empty afterwards; favourites untouched; idempotent; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: Q-API-035.

### API-032 — `POST /api/found`

- **Method:** POST
- **URL:** `/api/found`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** body `{"answer": "kvadro"|"elsewhere"|"searching"|"stopped", "trigger": "pause"|"delete"}`
  (Doc:951-956; `src/features/radar/FoundSheet.jsx:28-46`, `:95`).
- **Validation:** literals (assumed `422` otherwise). — UNVERIFIED
- **Business Logic:** stores the answer to «Нашли жильё?» for product statistics; `elsewhere` is followed by
  API-033. — DOCUMENTED_ONLY
- **DB Changes:** insert survey answer. — UNVERIFIED
- **Side Effects:** possibly suppresses further `ask_found` prompts (Q-API-030).
- **Response:** ignored; recommended `204`. Errors intentionally hidden (`FoundSheet.jsx:95`).
- **Errors:** none shown.
- **Legacy Source:** Doc:135, Doc:949-958; `$KVADRO_ROOT/docs/about.md:210-211`; client `src/lib/api/found.js:9-16`,
  `src/features/radar/FoundSheet.jsx:95`; mock `tools/parity/mocks.mjs:154`.
- **Migration Target:** legacy `POST /api/found` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — each answer × trigger stored; `204`; negative — unknown answer → `422`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: Q-API-030.

### API-033 — `POST /api/found/where`

- **Method:** POST
- **URL:** `/api/found/where`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** body `{"where": "telegram"|"olx"|"site"|"agent"|"friends"|"street"|"other"}` (Doc:962-966;
  `FoundSheet.jsx:47-76`, `:112`). Sent only after `answer: "elsewhere"`; carries no `trigger` and no link to the
  first answer.
- **Validation:** literals (assumed). — UNVERIFIED
- **Business Logic:** stores where the user found housing. — DOCUMENTED_ONLY
- **DB Changes:** insert/update survey answer. — UNVERIFIED
- **Side Effects:** none.
- **Response:** ignored; recommended `204`.
- **Errors:** none shown.
- **Legacy Source:** Doc:136, Doc:960-968; client `src/lib/api/found.js:22-28`, `src/features/radar/FoundSheet.jsx:112`.
- **Migration Target:** legacy `POST /api/found/where` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — each value stored and linked to the latest `elsewhere` answer of the user; negative — unknown
  value → `422`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`.

### API-034 — `POST /api/events`

- **Method:** POST
- **URL:** `/api/events`
- **Auth:** `tma` — but requests with an empty `initData` (`Authorization: tma `) arrive and must be rejected
  silently (Doc:1012-1013).
- **Roles/access mode:** any; fire-and-forget.
- **Input:** body `{"name": string, …props}` with properties at the top level. React: `fetch` with `keepalive: true`,
  errors swallowed (`src/lib/api/events.js:9-35`). Boot script: `XMLHttpRequest`, no keepalive, only with `initData`
  (`index.html:69-90`). Event names and properties (Doc:1015-1042; code call sites):
  `app_launch {entry: link|news|menu, ms, v, sdk?, js, platform?}` (`useAppBootstrap.js:54-61`);
  `app_opened {entry, listing_id? (only for link), ms}` after meta success, not on `403` (`useAppBootstrap.js:101-113`);
  `app_error {v (≤ 40), error: {kind: boot|error|rejection|render, name? (≤ 40), message (≤ 300), source? (≤ 300,
  no query/hash), stage: boot|app, screen? (≤ 40, React only), tg? (≤ 10), platform? (≤ 20)}}` — boot script always
  sends the 7 keys (empty = `""`), React omits empty keys, max 5 distinct errors per session, each `kind|name|message`
  once (`src/lib/errors.js:10`, `:68-94`); `follow_prompt_shown|expired|closed` (`useFollowNudge.js:66`,
  `App.jsx:110`, `:624`); since release `index-DY_DH7h-.js` `return_prompt_shown {n, custom}`,
  `return_prompt_expired|closed {custom}` (`useReturnNudge.js:126-129`, `App.jsx:143-145`, `:744-746` at the pin) and
  `feed_radar_shown|closed {custom}` (`App.jsx:309-311`, `:638-640` at the pin), where `n` is the `count` of API-035
  and `custom` says the filters differ from the defaults of their deal and city (current Doc:1082-1085, :1106-1107);
  `home_screen_offered|added|closed` (`useHomeScreenOffer.js:74`, `:27`, `App.jsx:609`);
  `chat_access_declined|allowed` (`chatAccess.js:36`, `:40`); `listing_shared {listing_id}`
  (`ListingTitleRow.jsx:30`); `original_opened {listing_id, src: button|video|sources|price_history|offers}`
  (`ListingScreen.jsx:141`); `original_copied {listing_id}` (`sections/OriginalText.jsx:71`);
  `contact_call {listing_id, via: tel|browser, src?: "text"}` (`useListingContact.js:75`);
  `contact_write {listing_id}` (`useListingContact.js:84`).
- **Validation:** must accept unknown extra fields without hard failure (Doc:1044). Size limits unknown (Q-API-045).
- **Business Logic:** writes the action log (180 days, no texts) and forwards product events to PostHog under the
  user's random id (`$KVADRO_ROOT/docs/about.md:268`, `:375-376`, `:431`). — DOCUMENTED_ONLY
- **DB Changes:** insert action-log/event row. — UNVERIFIED
- **Side Effects:** server-side PostHog capture (Q-API-046).
- **Response:** recommended `204` (Doc:1046); never read.
- **Errors:** never surfaced.
- **Legacy Source:** Doc:137, Doc:970-1046; current Doc:1076-1107; client `src/lib/api/events.js:9-35`,
  `index.html:69-90`, `src/lib/errors.js:80`, call sites listed above. Parity excludes it from comparison
  (`tools/parity/README.md:28-29`).
- **Migration Target:** legacy `POST /api/events` byte-compatible (accept both producers). Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — each event name with its properties → `204`; `app_error` from both producers; unknown event
  name and extra fields accepted; auth — empty `tma ` → rejected without `5xx` and without an error log entry;
  negative — non-JSON body, 1 MB body → bounded rejection (target limit per Q-API-045); privacy — `source` with
  `#tgWebAppData=` never stored (client strips it, server re-checks).
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-001, LB-API-047; Q-API-045,
  Q-API-046.

## 3. Non-API resources

Rows use the same fields as §2, shortened where a field does not apply. Public URL patterns that must keep working
for SEO and deep links are owned by `03b-legacy-landing-seo-audit.md` (`URL-NNN`); here they appear only as server
resources.

### RES-001 — Listing photo, 800 px

- **Method / URL:** `GET /media/<listing_id>/<n>.jpg?e=<unix_time>&s=<32 hex>` on `app.kvadro.app` and `kvadro.app`.
- **Auth:** none (no `Authorization`; loaded by `<img>`); access controlled by the URL signature.
- **Input:** `listing_id` and `n` numeric; `e` = expiry rounded to midnight UTC, issued ~1–2 days ahead; `s` = signature
  bound to listing id + photo number, not to size (`$KVADRO_ROOT/docs/seo-pages.md:379-387`).
- **Behaviour:** serves the locally stored copy of a channel photo; photo erased 90 days after withdrawal
  (`$KVADRO_ROOT/docs/about.md:178`, `:181-183`).
- **Response:** `200 image/jpeg`, `Cache-Control: public, max-age=86400`, `ETag` (`seo-pages.md:385-386`).
- **Errors:** no `e`/`s` → `422` (FastAPI validation body); bad or expired signature → `404 {"detail":"Not Found"}`
  (`seo-pages.md:384`). The client shows a placeholder on error and never retries with another size (Doc:1061-1063).
- **Client contract:** URLs arrive in `photos`, `photos_preview`, `cover`; a thumbnail is derived only for the
  relative form `/media/<digits>/<digits>.jpg?…` (`src/lib/images.js:9-14`); absolute URLs are used as-is without a
  thumbnail. The first two feed photos are preloaded at start (`src/main.jsx:26-33`). `robots.txt` disallows
  `/media/` (`seo-pages.md:133-134`).
- **Legacy Source:** Doc:1054, Doc:1061-1063; `$KVADRO_ROOT/docs/about.md:305-307`; `seo-pages.md:380-390`;
  parity mock `tools/parity/parity.mjs:50`.
- **Migration Target:** keep `/media/<id>/<n>.jpg?e=&s=` URLs valid (or keep the URL shape for the legacy client);
  storage and signing: TBD (`10-target-architecture.md`, `17-infrastructure-and-deployment.md`).
- **Tests:** valid signature → `200` with cache headers; altered `s`, other `n`, past `e` → `404`; missing params →
  error; withdrawn > 90 days → `404`; same URL served from both hosts.
- **Status:** `DOCUMENTED_ONLY` (client usage `CONFIRMED`). Related: LB-API-023, LB-API-031; Q-API-024.

### RES-002 — Listing photo thumbnail, 480 px

- **Method / URL:** `GET /media/<listing_id>/<n>.s.jpg?e=<unix_time>&s=<32 hex>`.
- **Auth / input / errors:** as RES-001; the same signature works for `.s.jpg` (`seo-pages.md:383`).
- **Behaviour:** smaller copy; the client builds the URL by replacing `.jpg?` with `.s.jpg?` and uses it in `srcset`
  (`480w`, original `800w`), or alone on slow networks / data saver / lite graphics (`src/lib/images.js:9-60`).
- **Legacy Source:** Doc:1055, Doc:1061; `$KVADRO_ROOT/docs/about.md:139`, `:178`.
- **Migration Target:** as RES-001.
- **Tests:** `.s.jpg` exists for every `.jpg` and is ≤ 480 px wide; same signature valid.
- **Status:** `DOCUMENTED_ONLY` (client derivation `CONFIRMED`). Related: LB-API-031.

### RES-003 — Vector map tiles (`meta.tiles`)

- **Method / URL:** `GET` of the URL in `meta.tiles`: either a single PMTiles archive (recognised only by
  `/\.pmtiles(\?|$)/`, `src/features/map/gl/style.js:513`) or a template with `{z}/{x}/{y}` (e.g. under `/tiles/…`,
  proxied in dev by `vite.config.js:60-63`).
- **Auth:** none.
- **Input:** PMTiles — HTTP `Range` requests from MapLibre via the `pmtiles://` protocol (`src/features/map/engine.js:54-59`);
  template — one request per tile, plus background prefetch with plain `fetch` (`priority: 'low'`) that reads
  `content-length` (`src/features/map/tilePrefetch.js:80-115`; `src/app/useMapTilePrefetch.js:15-27`).
- **Behaviour:** Protomaps basemap schema: layers `earth`, `landuse`, `water`, `buildings`, `boundaries`, `roads`,
  `places`, `pois`; properties `kind`, `kind_detail` (numeric for `boundaries`), `population_rank`, `is_tunnel`,
  `name`, `name:ru`, `name:en`, `script`; data up to zoom 15 (`maxzoom: 15`), 512 px tiles
  (Doc:1065-1074; `src/features/map/gl/style.js:491-511`).
- **Response:** vector tiles / PMTiles bytes; **must support `Range` and CORS** for cross-origin URLs; template tiles
  need CORS because of the prefetch `fetch` (Doc:1072-1074).
- **Errors:** template prefetch failures are ignored; a rejected PMTiles registration leaves the GL map empty
  (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:165-166`).
- **Legacy Source:** Doc:443, Doc:1056, Doc:1065-1074; `$KVADRO_ROOT/docs/about.md:114`.
- **Migration Target:** same URL in `meta.tiles` or a new one announced through `meta.tiles` (the client takes any
  URL). Hosting: TBD (`17-infrastructure-and-deployment.md`).
- **Tests:** `Range: bytes=0-16383` → `206` with `Content-Range`; CORS headers on `GET` and preflight; zoom 15 tile
  exists for each city centre; style renders the eight layers.
- **Status:** `CONFIRMED` (client contract); hosting `UNVERIFIED`. Related: Q-API-053.

### RES-004 — OpenStreetMap raster fallback

- **Method / URL:** `GET https://tile.openstreetmap.org/{z}/{x}/{y}.png` (external) when `meta.tiles` is `null`
  (Leaflet: `src/features/map/leaflet/basemap.js:13`; GL via the `kvosm://` protocol with
  `referrerPolicy: 'strict-origin-when-cross-origin'`, `src/features/map/engine.js:14-28`,
  `src/features/map/gl/style.js:516-526`).
- **Auth:** none. **Served by:** OpenStreetMap Foundation (usage policy requires a `Referer`; attribution
  «© OpenStreetMap» shown).
- **Legacy Source:** Doc:1057; `src/features/map/attribution.js:3`.
- **Migration Target:** not served by us; keep `meta.tiles` non-null in production to avoid depending on the OSM tile
  policy. Decision in `10-target-architecture.md`.
- **Tests:** with `meta.tiles: null` the map renders OSM tiles (staging only).
- **Status:** `CONFIRMED`.

### RES-005 — Call page

- **Method / URL:** `GET /call/<token>` on the Mini App origin (URL from `ListingDetails.call_url` or API-009,
  resolved with `new URL(url, location.origin)` and opened through Telegram `openLink`, i.e. in the external browser —
  `src/features/listing/hooks/useListingContact.js:59`).
- **Auth:** the token (no `initData` in the external browser).
- **Behaviour:** temporary web page that lets the user call the author's number; used on iOS/desktop and when `tel:`
  fails on Android (`src/lib/telegram/links.js:14-40`). Link life ≈ 10 min (`$KVADRO_ROOT/docs/about.md:239-240`).
  Content of the page, single-use and binding to the user are unknown. — DOCUMENTED_ONLY / UNVERIFIED
- **Legacy Source:** Doc:610-624; `about.md:237-241`, `:303`, `:454` (signing secret).
- **Migration Target:** keep `/call/<token>` working for links issued by the legacy backend until they expire;
  implementation TBD (`10-target-architecture.md`).
- **Tests:** fresh token → page with a working `tel:` action; token older than TTL → expiry page; token for listing A
  cannot reveal listing B; page has `noindex` and no third-party scripts.
- **Status:** `DOCUMENTED_ONLY`. Related: LB-API-016, LB-API-045; Q-API-042.

### RES-006 — PostHog ingestion (external)

- **Method / URL:** posthog-js 1.434.15 requests to `meta.analytics.host` (Mini App; bundled SDK chunks,
  `disable_external_dependency_loading: true`) and to `https://eu.i.posthog.com` + `https://eu-assets.i.posthog.com/static/<version>/array.js`
  (landing and SEO pages via `stats.js`) (`src/lib/analytics.js:122-199`; `$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:64`;
  `$KVADRO_ROOT/docs/about.md:115`).
- **Auth:** PostHog project key (delivered in `meta.analytics.key` and templated into `stats.js` — value not copied).
- **Behaviour:** Mini App: memory persistence, no pageview autocapture, web vitals, exception capture, optional
  autocapture (`click`, `change`, `submit`), session replay sampled by `replay_rate` with masked inputs; URLs stripped
  of the hash and properties scrubbed of `initData` before send; distinct id = `meta.analytics.id`
  (`isIdentifiedID: true`, `person_profiles: 'identified_only'`). Skipped on data saver / 2g
  (`src/lib/analytics.js:101-113`).
- **Legacy Source:** Doc:1058; `$KVADRO_ROOT/docs/about.md:115`, `:375-376`, `:431`, `:449`.
- **Migration Target:** external service; configuration delivered by `meta.analytics` and `stats.js`. Decision on
  keeping PostHog EU: `10-target-architecture.md`.
- **Tests:** `meta.analytics` contains the per-user random id that equals the id used server-side; no `initData` in
  captured properties.
- **Status:** `CONFIRMED` (client configuration). Related: Q-API-046, Q-API-047.

### RES-007 — Telegram Web App SDK (external)

- **Method / URL:** `GET https://telegram.org/js/telegram-web-app.js` (`async`, `crossorigin="anonymous"`,
  preconnect) — `index.html:151-152`. The app waits ≤ 3 s for it (`src/main.jsx:19`, `:40`).
- **Served by:** Telegram. CSP of the Mini App must allow it.
- **Legacy Source:** Doc:1059.
- **Migration Target:** unchanged (external).
- **Status:** `CONFIRMED`.

### RES-008 — Mini App shell and static assets

- **Method / URL:** `GET /` (and `/?listing=<id>`, `/?news=<code>`, `/?map=gl|leaflet|auto` — client-only params) on
  `app.kvadro.app` serving `index.html` with two inline scripts allowed by CSP **sha256 hashes**; `/assets/*` (hashed
  Vite chunks incl. lazy `posthog-js` and `pmtiles` chunks); `/maplibre-gl.mjs` (vendored ES module loaded with a
  dynamic `import()`, `vite.config.js:18-26`, `src/features/map/engine.js:4-36`); `/favicon.svg`, `/favicon.ico`.
- **Auth:** none.
- **Behaviour:** static hosting on the same origin as `/api`, `/media`, `/tiles`, `/call`. The Telegram `initData` is
  in the URL hash (`#tgWebAppData=…`) and never reaches the server through the URL.
- **Legacy Source:** `index.html:1-162`; `$KVADRO_ROOT/demo/app/docs/RECOVERY.md:30`, `:39-40`;
  `$KVADRO_ROOT/docs/about.md:351`, `:455`, `:500-502`.
- **Migration Target:** the legacy Mini App build must keep being served unchanged during the backend transition
  (`about.md:437-440`). Hosting: TBD (`17-infrastructure-and-deployment.md`).
- **Tests:** CSP header hashes match the inline scripts byte-for-byte; `/maplibre-gl.mjs` served as JavaScript;
  unknown paths → `404`.
- **Status:** `CONFIRMED`.

### RES-009 — Landing pages

- **Method / URL:** `GET /`, `/uz/`, `/en/` on `kvadro.app`; `/uz` → `308 /uz/`; `/index.html` → `301 /`;
  `GET /privacy.html` (three languages in one file); static files `landing.js`, `landing-i18n.js`, `miniapp-i18n.js`,
  `landing.css`, `miniapp.css`, images, `og-{ru,uz,en}.jpg`, icons, `site.webmanifest` with `?v=<first 10 hex of
  sha256>` cache keys.
- **Auth:** none.
- **Behaviour:** `/uz/` and `/en/` are **generated by the backend** (`app/api/landing_pages.py`) from `index.html` +
  `landing-i18n.js` with their own `<head>` (og, hreflang) and `<base href="../">`; CSP `script-src 'self'
  'sha256-…' 'sha256-…' https://eu-assets.i.posthog.com; report-uri /api/csp-report`.
- **Legacy Source:** `$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:25-34`, `:52-59`; `$KVADRO_ROOT/docs/about.md:330-333`.
- **Migration Target:** ownership in `03b-legacy-landing-seo-audit.md` (`LND-`, `URL-`); server part TBD
  (`10-target-architecture.md`).
- **Tests:** redirects (`308`, `301`); uz/en bodies equal the text substitution of `landing-i18n.js`; CSP hashes match.
- **Status:** `CONFIRMED` (static mirror) / generation `DOCUMENTED_ONLY`.

### RES-010 — Landing data: `data/live.json`

- **Method / URL:** `GET /data/live.json?v=202610171944` (constant `DATA_V`), `Accept: application/json`
  (`$KVADRO_ROOT/demo/landing/site/landing.js:63-72`). Relative URL: on `/uz/`, `/en/` it resolves through
  `<base href="../">`.
- **Auth:** none. **Producer:** backend job (`scripts/landing_snapshot.py`, `live.json` ← `app/api/landing.py`);
  observed rewrite 02:02; `max-age=1800` (`$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:60-61`, `:68-69`).
- **Response shape** (fixture `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/data/live.json`): `{now: ISO string,
  day: int, week: int, since: null, latest: {id: int, rooms: int, price_usd: int, delta: int, tone: string,
  district: string, district_code: string, area: number|null, seen_at: ISO string, link: string
  ("https://t.me/KvadroAppBot?startapp=l_<id>-web")}[], sheet: {all: {count: int, per_day: float}, demo: {count: int,
  per_day: float}}}`. Read at `landing.js:1112`, `:2098`, `:2161`, `:2225`.
- **Errors:** fetch failure → retried on the next use (`landing.js:69`); the block keeps its static text.
- **Migration Target:** same path and shape for the legacy landing; generator TBD (`10-target-architecture.md`).
- **Tests:** schema snapshot; `latest[].link` uses `-web` source; no phone numbers or texts in the file.
- **Status:** `CONFIRMED` (shape from fixture, client reads) / schedule `DOCUMENTED_ONLY`. Related: LB-API-017;
  Q-API-051.

### RES-011 — Landing data: `data/pins-rent.json`

- **Method / URL:** `GET /data/pins-rent.json?v=202610171944` (`landing.js:1040`).
- **Producer:** backend job; observed rewrite 15:00; `max-age=1800`.
- **Response shape** (fixture): `{pins: {id: int, x: float (% of the static map image), y: float, rooms: int,
  price_usd: int, delta: int, tone: "good"|"high"|"mixed"|"same"|…, area: number|null, floor: int, floors_total: int,
  district: string, district_code: string, point: string (landmark), photo: "img/snap/<id>.webp", link: string,
  age_min: int, is_owner: bool|null, in_all: bool, in_rooms: bool}[], dots: [float, float, float][],
  medians: {district_code: string, rooms: int, median_usd: int, n: int}[], bargains_week: int}`. `medians` and
  `bargains_week` drive «Хорошая ли цена» (`landing.js:2242`).
- **Migration Target / Tests / Status:** as RES-010. `CONFIRMED` / schedule `DOCUMENTED_ONLY`.

### RES-012 — Landing data: `data/pins-sale.json`

- **Method / URL:** `GET /data/pins-sale.json?v=202610171944` (`landing.js:1040`).
- **Response shape:** as RES-011, with `area: float`, `is_owner: bool`; `dots: []`, `medians: []`,
  `bargains_week: null` in the fixture.
- **Migration Target / Tests / Status:** as RES-010. `CONFIRMED` / schedule `DOCUMENTED_ONLY`.

### RES-013 — Landing photo snapshots

- **Method / URL:** `GET /img/snap/<listing_id>.webp` (316 files in the fixture), referenced by `pins[].photo`.
- **Auth:** none — unsigned copies of channel photos, outside the signed `/media` policy; `robots.txt` disallows
  `/img/snap/` and `/*/img/snap/` (`$KVADRO_ROOT/docs/seo-pages.md:133-134`).
- **Producer:** `scripts/landing_snapshot.py` (`$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:60-61`).
- **Migration Target:** TBD (`10-target-architecture.md`); purge on takedown and after retention (LB-API-054).
- **Tests:** every `pins[].photo` resolves; files of withdrawn/taken-down listings are removed.
- **Status:** `CONFIRMED` (fixture) / generation `DOCUMENTED_ONLY`. Related: LB-API-054.

### RES-014 — `stats.js` (landing and SEO analytics loader)

- **Method / URL:** `GET /stats.js?v=20261020b` (manual version key).
- **Behaviour:** server-templated (`app/api/site_stats.py`): embeds PostHog key, host, assets host, SDK version,
  `env`, `clicks`; creates the visit number `kv-visit` (sessionStorage) → `window.KV_VISIT`; on SEO pages appends
  `--v<visit>` to bot links `t.me/<bot>?start=s_…` (`$KVADRO_ROOT/demo/landing/site/stats.js:1-3`, `:30-33`;
  `$KVADRO_ROOT/docs/seo-pages.md:368-369`). The key value is not reproduced here.
- **Migration Target:** TBD (`10-target-architecture.md`); the new landing may own its analytics bootstrap.
- **Tests:** served with the production key only in production; visit id format `[a-z0-9]{10}`.
- **Status:** `CONFIRMED`.

### RES-015 — CSP violation reports

- **Method / URL:** `POST /api/csp-report` (browser-generated `application/csp-report` JSON) — `report-uri` of the
  landing, SEO and privacy pages (`$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:56-57`; `seo-pages.md:376-377`;
  `$KVADRO_ROOT/docs/about.md:304`).
- **Auth:** none. Behaviour, response and storage unknown (Q-API-050).
- **Migration Target:** keep accepting reports at the same path while legacy pages are served; TBD.
- **Tests:** valid report → `2xx`; oversized/garbage body → bounded rejection; no `5xx`.
- **Status:** `DOCUMENTED_ONLY`. Related: Q-API-050.

### RES-016 — `/api/landing/live`, `/api/landing/pins` (referenced only in comments)

- **Method / URL:** `GET /api/landing/live`, `GET /api/landing/pins` — named in HTML comments of the landing
  (`$KVADRO_ROOT/demo/landing/site/index.html:67`, `:195`, `:295`, `:340`). The page itself reads `data/*.json` and
  «к API страница не обращается» (`landing.js:61-62`; `RECOVERY.md:61`).
- **Status:** `UNVERIFIED` — possibly the live sources that the snapshot job copies, or obsolete
  (`DEPRECATED_CANDIDATE`). Related: Q-API-049.

### RES-017 — SEO pages

- **Method / URL:** `GET /{arenda|prodazha|novostrojki}/…` and `/uz/{ijara|sotuv|novostroyka}/…`,
  `/en/{rent|sale|new-builds}/…` — 1 008 pages (336 per language), server-rendered HTML without JS from the database
  (`app/api/area_pages.py`) (`$KVADRO_ROOT/docs/seo-pages.md:44-129`).
- **Behaviour:** routing rules — missing slash `308`, wrong case/unknown slug/wrong-language slug `404` (localised,
  `noindex,follow`), thin pages `200` + `noindex,follow`, `?sort=cheap|expensive|below` `200` + `noindex,follow`,
  other params ignored; headers `Cache-Control: public, max-age=0, must-revalidate, s-maxage=300`, `Last-Modified`,
  CSP, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, HSTS (`seo-pages.md:116-129`, `:375-377`).
- **Migration Target:** owned by `03b-legacy-landing-seo-audit.md`; data API needs in `seo-pages.md:404-420`.
- **Status:** `DOCUMENTED_ONLY`.

### RES-018 — CSV exports

- **Method / URL:** `GET /arenda/indeks/kvadro-rent-index.csv` (`period,start,rooms,median_usd,listings`) and
  `GET /prodazha/ceny/kvadro-sale-prices.csv` (`month,district,rooms,median_usd,median_usd_m2,listings`;
  `district=all`, `rooms=0` = all rooms), `text/csv; charset=utf-8` (`seo-pages.md:325-345`).
- **Migration Target:** same paths and columns (external citations). TBD.
- **Status:** `DOCUMENTED_ONLY`.

### RES-019 — `sitemap.xml`

- **Method / URL:** `GET /sitemap.xml` — dynamic, `s-maxage=300`; 1 012 URLs (landing ×3, `privacy.html`, 1 008 SEO
  pages) with `lastmod` and `xhtml:link` hreflang + `x-default` (`seo-pages.md:46-47`, `:135-137`).
- **Status:** `DOCUMENTED_ONLY`.

### RES-020 — `robots.txt`

- **Method / URL:** `GET /robots.txt` — `Allow: /`; `Disallow: /api/`, `/media/`, `/img/snap/`, `/*/img/snap/`;
  `Sitemap: https://kvadro.app/sitemap.xml` (`seo-pages.md:133-134`; static copy in
  `$KVADRO_ROOT/demo/landing/site/robots.txt`).
- **Status:** `CONFIRMED`.

### RES-021 — Cloudflare edge artifacts

- **Method / URL:** `/cdn-cgi/l/email-protection#…` links and the injected `email-decode.min.js` on `privacy.html` and
  the methodology page (Cloudflare Email Obfuscation) (`$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:85-87`;
  `seo-pages.md:378`).
- **Served by:** Cloudflare, not the origin.
- **Status:** `CONFIRMED`.

### RES-022 — Bot update endpoint

- **Method / URL:** unknown — the legacy bot receives Telegram updates either by webhook or by `getUpdates`
  (`$KVADRO_ROOT/docs/about.md:408-411`). Needed for the cut-over plan (one receiver per bot).
- **Status:** `UNVERIFIED`. Related: Q-API-055. Bot behaviour: `04-telegram-bot-audit.md`.

## 4. Coverage

### 4.1 Registry → client code

All 35 registry methods (current `$KVADRO_ROOT/docs/api.md:102-138`; 34 at the audit, `:102-137`) are called by the
client at the pin. None is documented-but-unused. "Doc #" is the current registry number: since release
`index-DY_DH7h-.js` `/api/feed/new` is #7 and every later method moved down by one.

| Doc # | Method | Path | ID | In client | Wrapper | Call sites |
| ----: | ------ | ---- | -- | --------- | ------- | ---------- |
| 1 | GET | `/api/meta` | API-001 | yes | `meta.js:5` | `main.jsx:24`, `useAppBootstrap.js:70` |
| 2 | GET | `/api/cities` | API-002 | yes | `meta.js:8` | `useAppBootstrap.js:125`, `App.jsx:169` |
| 3 | GET | `/api/bot` | API-003 | yes | `meta.js:15` | `index.html:95`, `NoAccessScreen.jsx:31`, `SettingsScreen.jsx:65`, `ListingActionsSheet.jsx:46` |
| 4 | GET | `/api/feed` | API-004 | yes | `feed.js:75-93` | `main.jsx:25`, `useInfiniteFeed.js:36`, `useRadarPreviews.js:42` |
| 5 | GET | `/api/feed/count` | API-005 | yes | `feed.js:100` | `useLiveFeedStats.js:16`, `useRadarPreviews.js:52` |
| 6 | GET | `/api/feed/flow` | API-006 | yes | `feed.js:110` | `useLiveFeedStats.js:38`, `useRadarPreviews.js:59`, `useFollowNudge.js:63` |
| 7 | GET | `/api/feed/new` | API-035 | yes | `feed.js:111-117` | `useReturnNudge.js:117` (at the pin) |
| 8 | GET | `/api/map` | API-007 | yes | `feed.js:119` | `gl/useMapPoints.js:15`, `leaflet/MapView.jsx:154` |
| 9 | GET | `/api/listings/:id` | API-008 | yes | `listings.js:10-17` | `main.jsx:38`, `useListingLoader.js:47`, `MapSelectionCard.jsx:29` |
| 10 | GET | `/api/listings/:id/call` | API-009 | yes | `listings.js:23` | `useListingContact.js:26` |
| 11 | POST | `/api/listings/:id/translate` | API-010 | yes | `listings.js:29` | `useListingTranslation.js:32` |
| 12 | POST | `/api/listings/:id/favorite` | API-011 | yes | `listings.js:38` | `FavButton.jsx:27` |
| 13 | POST | `/api/listings/:id/hide` | API-012 | yes | `listings.js:47` | `ListingActionsSheet.jsx:71` |
| 14 | DELETE | `/api/listings/:id/hide` | API-013 | yes | `listings.js:56` | `useListingActions.js:51`, `:62`, `HiddenScreen.jsx:53` |
| 15 | POST | `/api/listings/:id/block-author` | API-014 | yes | `listings.js:65` | `ListingActionsSheet.jsx:79` |
| 16 | DELETE | `/api/listings/:id/block-author` | API-015 | yes | `listings.js:74` | `useListingActions.js:59` |
| 17 | POST | `/api/listings/:id/report` | API-016 | yes | `listings.js:84` | `ListingActionsSheet.jsx:89` |
| 18 | POST | `/api/listings/:id/share` | API-017 | yes | `listings.js:97` | `ListingTitleRow.jsx:35` |
| 19 | GET | `/api/subscriptions` | API-018 | yes | `subscriptions.js:5` | `App.jsx:175`, `subscriptionActions.js:95`, `RadarScreen.jsx:58`, `SettingsScreen.jsx:60` |
| 20 | POST | `/api/subscriptions` | API-019 | yes | `subscriptions.js:13` | `subscriptionActions.js:131` |
| 21 | PUT | `/api/subscriptions/:id` | API-020 | yes | `subscriptions.js:29` | `subscriptionActions.js:163` |
| 22 | PATCH | `/api/subscriptions/:id` | API-021 | yes | `subscriptions.js:56` | `subscriptionActions.js:108`, `RadarScreen.jsx:99`, `:134`, `:151` |
| 23 | DELETE | `/api/subscriptions/:id` | API-022 | yes | `subscriptions.js:66` | `RadarScreen.jsx:172` |
| 24 | POST | `/api/subscriptions/:id/relax` | API-023 | yes | `subscriptions.js:43` | `subscriptionActions.js:72` |
| 25 | GET | `/api/settings` | API-024 | yes | `settings.js:5` | `SettingsScreen.jsx:59`, `RadarSheet.jsx:52` |
| 26 | PUT | `/api/settings` | API-025 | yes | `settings.js:11` | `LanguagePicker.jsx:32`, `city.js:23`, `SettingsScreen.jsx:91`, `:105`, `:119` |
| 27 | GET | `/api/hidden` | API-026 | yes | `user.js:5` | `SettingsScreen.jsx:64` |
| 28 | DELETE | `/api/hidden/:id` | API-027 | yes | `user.js:11` | `HiddenScreen.jsx:45` |
| 29 | DELETE | `/api/hidden` | API-028 | yes | `user.js:17` | `HiddenScreen.jsx:62` |
| 30 | GET | `/api/favorites` | API-029 | yes | `user.js:23` | `useInfiniteFeed.js:33` |
| 31 | GET | `/api/history` | API-030 | yes | `user.js:26` | `useInfiniteFeed.js:35` |
| 32 | DELETE | `/api/history` | API-031 | yes | `user.js:29` | `ListingFeed.jsx:96` |
| 33 | POST | `/api/found` | API-032 | yes | `found.js:9` | `FoundSheet.jsx:95` |
| 34 | POST | `/api/found/where` | API-033 | yes | `found.js:22` | `FoundSheet.jsx:112` |
| 35 | POST | `/api/events` | API-034 | yes | `events.js:9`, `:25` | `index.html:77`, `errors.js:80`, 15 `trackEvent` sites at the audit, 20 at the pin (§2 API-034) |

### 4.2 Client requests → documentation

Search performed over `$KVADRO_ROOT/demo/app/src` and `index.html` for `apiFetch`, `prefetch`, `fetch(`,
`sendBeacon`, `XMLHttpRequest`, `'/api/`, `/media`, `/tiles`, `/call`, `import(`; and over
`$KVADRO_ROOT/demo/landing/site` for `fetch(`, `XMLHttpRequest`, `data/`, `/api/`. `sendBeacon` is not used anywhere.

| Client request | Where | Documented in | Result |
| -------------- | ----- | ------------- | ------ |
| 35 `apiFetch` methods (34 at the audit) | `src/lib/api/*.js` | Doc §2 | documented (API-001 … API-035) |
| Prefetch of meta, first feed page, deep-link listing | `src/main.jsx:24-39` | Doc:87-98 | documented |
| `XMLHttpRequest POST /api/events` (boot errors) | `index.html:76-88` | Doc:974-975, Doc:1007 | documented |
| `XMLHttpRequest GET /api/bot` (boot fallback) | `index.html:94-102` | Doc:38-39, Doc:500-501 | documented |
| `<img>` `/media/<id>/<n>.jpg` and `.s.jpg` | `src/lib/images.js`, `src/main.jsx:30` | Doc:1054-1055, Doc:1061-1063 | documented (RES-001, RES-002) |
| PMTiles `Range` requests | `src/features/map/engine.js:54-59` | Doc:1072 | documented (RES-003) |
| Tile template requests + `fetch` prefetch | `src/features/map/tilePrefetch.js:101` | Doc:1073-1074 | documented (RES-003) |
| OSM raster tiles via `kvosm://` + `fetch` with `referrerPolicy` | `src/features/map/engine.js:18-28`, `leaflet/basemap.js:13` | Doc:1057 (URL only) | partially — the Referer workaround is undocumented (RES-004) |
| Open `/call/<token>` in the external browser | `useListingContact.js:59` | Doc:610-624; `about.md:303` | documented (RES-005) |
| PostHog SDK traffic to `meta.analytics.host` | `src/lib/analytics.js:122-199` | Doc:1058 | documented at host level; endpoint paths belong to posthog-js (RES-006) |
| `https://telegram.org/js/telegram-web-app.js` | `index.html:151-152` | Doc:1059 | documented (RES-007) |
| Dynamic `import('/maplibre-gl.mjs')` | `src/features/map/engine.js:30-36`, `vite.config.js:18-26` | — | **undocumented** static asset (RES-008) |
| Lazy chunks `/assets/*` (`posthog-js`, `pmtiles`) | `src/lib/analytics.js:129-133`, `engine.js:55` | `demo/app/docs/RECOVERY.md:39-40` | documented as bundle, not in Doc (RES-008) |
| `/favicon.svg`, `/favicon.ico` | `index.html:8` | — | undocumented static asset (RES-008) |
| `GET /api/__probe/<method>?n=<n>` | `tools/parity/mocks.mjs:30-34` (test harness) | `tools/parity/README.md:30-32` | **test-only**, never sent by production code — do not implement |
| Landing `data/live.json`, `data/pins-rent.json`, `data/pins-sale.json` | `demo/landing/site/landing.js:63-72` | `demo/landing/docs/RECOVERY.md:60-61`, `about.md:331-332` | documented outside Doc (RES-010 … RES-012) |
| Landing `img/snap/<id>.webp` | `pins[].photo` | `RECOVERY.md:60` | documented outside Doc (RES-013) |
| Landing `stats.js` + PostHog EU | `site/stats.js` | `RECOVERY.md:33`, `:64` | documented outside Doc (RES-014, RES-006) |
| Browser CSP reports to `/api/csp-report` | CSP header | `RECOVERY.md:56-57`, `about.md:304` | documented outside Doc (RES-015) |
| `/api/landing/live`, `/api/landing/pins` | HTML comments only | — | referenced, never requested (RES-016) |

Telegram navigations (`t.me/<bot>?start=…`, `?startapp=…`, `t.me/<channel>/<post>`) are links, not requests to the
legacy servers; they are inventoried as `URL-NNN` in `03b` and `TMA-NNN` in `05`.

### 4.3 Documentation vs code

| # | Topic | Documentation says | Code says | Supported by code |
| - | ----- | ------------------ | --------- | ----------------- |
| 1 | `404` on `GET /api/listings/:id` | screen «объявление недоступно» (Doc:74) | `listing.loadFailed` = «Объявление не загрузилось» (`ListingScreen.jsx:115-116`, `ru.js:156`) | code text |
| 2 | Error body | always `{"detail": "…"}` string (Doc:56-62) | client reads only string `detail` (`client.js:88-96`); legacy `422` has an array `detail` (`about.md:108`) | both shapes exist; client tolerant |
| 3 | Phone exposure | «номера телефонов открываются только через временные ссылки звонка» (`about.md:349`) | `ListingDetails.phone` is plain `+998…` (Doc:316) and dialled as `tel:${phone}` on Android (`src/lib/telegram/links.js:28`) | the raw number reaches every client (LB-API-030) |
| 4 | Quiet/digest presets | examples `off, 23-08, 22-09` / `09, 09,21, 21` (Doc:846-847, mock) | bot presets `off, 22-08, 23-08, 00-09, 23-07` / `09, 09,19, 12,20, 19` (`telegram-bot.md:990`) | unknown — Q-API-029 |
| 5 | `median_metric` values | `m2 \| person \| string` (Doc:325) | mock uses `unit` (`tools/parity/mocks.mjs:98`); client treats others as per month | compatible |
| 6 | Landing data | «зафиксированные один раз; к API страница не обращается» (`landing.js:60-62`) | files rewritten on a schedule while `DATA_V` stays `202610171944` (`RECOVERY.md:68-70`) | data is live (LB-API-017) |
| 7 | `useMapTilePrefetch` JSDoc | `tiles` "object" (`src/app/useMapTilePrefetch.js:12`) | `meta.tiles` is a string (Doc:443) | string |
| 8 | `entry` JSDoc (release `index-DY_DH7h-.js`) | `'filters' \| 'few' \| 'prompt' \| 'empty'` (`src/app/subscriptionActions.js:92`, `src/lib/api/subscriptions.js:10`) | the app also sends `feed` and `return` (`App.jsx:635`, `:752` at the pin); current Doc:789 lists all six | six values |

## 5. Unused, obsolete, duplicate or risky endpoints

Nothing here is a deletion recommendation. Proposed fixes and old-client impact for every `LB-API` item are in
`02-legacy-backend-audit.md`.

| Item | Kind | Flag | Evidence | Note |
| ---- | ---- | ---- | -------- | ---- |
| `meta.districts`, `meta.zones` (top level) | obsolete field | `DEPRECATED_CANDIDATE` | Doc:446-447 "legacy fallback для Tashkent"; read only when `cities` is empty (`src/features/filters/summary.js`) | keep while the legacy client runs |
| Fields never read by the client (`FeedPage.total`, `ListingPreview.usd/photos_total/tone/label/priced`, `ListingDetails.contacts/source_url/price_per_m`, `Subscription.title/new_count/finds/created_at/hidden_count`, `SubscriptionMutationResult.ask_found/options[].filters`, `FeedFlowResponse.options[].count`, `SettingsResponse.theme/city`, `CityStats.name/center`) | unused fields | `DEPRECATED_CANDIDATE` | Doc:402-414 | may be used by the bot or analytics — check before dropping |
| Filter key `zone` / query `zone=` | obsolete contract | `DEPRECATED_CANDIDATE` | `CHANGELOG.md:46-54` | stored radars may still carry it (Q-API-013) |
| `/api/landing/live`, `/api/landing/pins` | unknown endpoints | `UNVERIFIED` / `DEPRECATED_CANDIDATE` | landing HTML comments | RES-016, Q-API-049 |
| `/api/__probe/*` | test harness | not an endpoint | `tools/parity/mocks.mjs:30-34` | never implement |
| Unblock author: `DELETE /api/listings/:id/block-author` vs `DELETE /api/hidden/:id` | duplicate | — | API-015, API-027 | LB-API-040 |
| Radar activation: `POST /api/subscriptions` vs `PATCH {active:true}` on a paused twin | duplicate path | — | `subscriptionActions.js:94-129` | LB-API-034 |
| Relax: `relaxed` in `POST`/`PUT` vs `POST /relax` with a different code set | duplicate mechanism | — | Doc:553-556, Doc:822-838 | LB-API-036 |
| Bot username: `GET /api/bot` vs `meta.bot_username` | duplicate data | — | Doc:500-502 | both needed: `/api/bot` works without auth |
| `GET /api/map` | risky: HTML injection | — | `leaflet/icons.js:13`, `gl/markerElements.js:40` | LB-API-008 |
| `GET /api/listings/:id` | risky: raw phone numbers | — | Doc:316, `links.js:28` | LB-API-030 |
| `POST /api/events` | risky: unauthenticated traffic, unbounded payload | — | Doc:1012-1013, Doc:1044 | LB-API-001, LB-API-047 |
| `POST /api/listings/:id/share` | risky: outbound Bot API call per tap | — | `ListingTitleRow.jsx:35` | LB-API-046 |
| `POST /api/listings/:id/translate` | risky: LLM cost per call | — | `useListingTranslation.js:32` | LB-API-032 |
| `GET /api/feed/count`, `/api/feed/flow` | risky: load (live per change + 3 requests per radar) | — | `useLiveFeedStats.js`, `useRadarPreviews.js` | LB-API-038, LB-API-052 |
| `GET /api/feed/new` | fragile: a body without numeric `count` crashes the old client; `since` from the device clock, unbounded | — | `src/app/useReturnNudge.js:112-136` (at the pin) | LB-API-055, Q-API-066 |
| `GET /api/favorites`, `/api/history` | risky: unbounded single page | — | Doc:930-941 | LB-API-024 |
| `POST /api/listings/:id/favorite` | risky: toggle, not idempotent | — | Doc:636-647 | LB-API-039 |
| `/img/snap/<id>.webp` | risky: unsigned copies of third-party photos | — | RES-013 | LB-API-054 |
| `/call/<token>` | risky: phone disclosure surface | — | RES-005 | LB-API-045, Q-API-042 |
| `POST /api/csp-report` | risky: public write sink | — | RES-015 | Q-API-050 |
