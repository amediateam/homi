# 08 — Legacy API inventory

Part of the kvadro² → HOMI migration audit (rules, labels and ID scheme: `docs/migration/README.md`).

This document lists every `/api/*` method the legacy Mini App calls (`API-NNN`, in the order of the registry in
`$KVADRO_ROOT/docs/api.md` §2) and every non-API HTTP resource the legacy system serves or depends on (`RES-NNN`).
The server-side system behind these endpoints — business rules `BR-API-NNN`, contract quirks and questionable design
decisions `LB-API-NNN` (each with a proposed fix and old-client impact), open questions `Q-API-NNN` — is in
`02-legacy-backend-audit.md`. The machine-readable twin of this file is `data/api-inventory.json`. API-035
(`GET /api/feed/new`, added in release `index-DY_DH7h-.js`) stands at its registry position, after API-006; ids stay
stable, so it takes the next free number while the legacy registry renumbered the methods after it. API-036
(`POST /api/settings/card-sample`, added in release `index-BnFvC-Ft.js`) stands the same way at its registry position
#27, after API-025. API-037 … API-054 (the owner cabinet and the contact request, added in release
`index-CBlEKxdL.js`) stand at their registry positions #37 – #54. API-055 (`DELETE /api/listings/:id/report`, added in
release `index-CIa0Ldj2.js`) stands at its registry position #18, after API-016; the legacy registry moved every later
method down by one, so the positions named above are #28 and #38 – #55 since that release.

- **Audit date:** 2026-11-09. **Legacy state:** Mini App release `index-plF_TOcT.js` at the audit, brought up to
  `index-DY_DH7h-.js` (SVN r27, the pin of WP-02) and, by the intakes of 2026-11-19, to `index-BnFvC-Ft.js` (SVN r29;
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:46`), to `index-CBlEKxdL.js` (SVN r31, the previous pin;
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5` at r31) and to the pinned release `index-CIa0Ldj2.js` (source at SVN
  r33; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5` at r36; `wave-1/baseline.md`). Text changed for a later release
  names it; "Doc:" line numbers are those of the audited tree, "current Doc:" and "at the pin" those of SVN r27.
  "Doc r31:" cites `$KVADRO_ROOT/docs/api.md` at r31, the state of release `index-CBlEKxdL.js`. The intake of
  `index-BnFvC-Ft.js` cites the same state, because `api.md` of r29 cannot be read, and client files at r29 when they
  have not changed since. Text of the intake of `index-CBlEKxdL.js` cites client files "at r31", the state the release
  was read in; the checkout has moved since (`wave-1/baseline.md`). "Doc r35:" cites `$KVADRO_ROOT/docs/api.md` at
  r35, the pinned release's own state. Text of the intake of `index-CIa0Ldj2.js` cites client files "at r33", the
  state that release was read in.
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
- Since release `index-CBlEKxdL.js` `apiFetch` also takes a `FormData` body. Only the photo upload of the owner
  cabinet uses it (API-041): `multipart/form-data` with one field `file`, sent without the JSON `Content-Type`
  (`src/lib/api/owner.js:57-70` at r31; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:14` at r31). — `CONFIRMED`
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
    `src/features/onboarding/NoAccessScreen.jsx:13-22`); since release `index-CIa0Ldj2.js` also the reason `paused`,
    «Бот на паузе» (API-001; `NoAccessScreen.jsx:13`, `:22` at r33; Doc r35:69-75; `02` BR-API-194);
  - `403` on `GET /api/feed|favorites|history` → «Нет доступа» instead of the error state
    (`src/features/feed/ListingFeed.jsx:88`);
  - `404` on `GET /api/listings/:id` → up to `index-CBlEKxdL.js` «Объявление не загрузилось»
    (`src/features/listing/ListingScreen.jsx:115-116`, string `listing.loadFailed` in `src/i18n/locales/ru.js:156`);
    since release `index-CIa0Ldj2.js` the screen «Этого объявления уже нет» with the button «Смотреть свежие»
    (API-008; `ListingScreen.jsx:175-201` at r33; `03` SCR-019);
  - `429` with `detail: "too many today"` on `GET /api/listings/:id`, since release `index-CIa0Ldj2.js` → «Лимит на
    сегодня» with a text of its own instead of the server-error text. The client compares `detail` with that string
    exactly, so any other `429` reads as a server error. The check lives in the shared error state, so the text shows
    wherever that component does; the contract names the limit for this method only (API-008;
    `src/lib/api/client.js:29-30`, `src/components/ErrorState.jsx:14-25` at r33; Doc r35:712-714, :1366-1367; `02`
    BR-API-193, Q-API-080);
  - `409` with `detail: "no_chat"` → write-access flow (`src/lib/chatAccess.js:15-54`); since release
    `index-CBlEKxdL.js` also on `POST /api/listings/:id/contact` (API-054), where it is answered before a request is
    created (Doc r31:837-838, :1290);
  - `409` without `no_chat` → radar-limit toast «Уже {max} радаров — удалите ненужный во вкладке «Радар»»
    (`src/app/subscriptionActions.js:147-155`, `ru.js:64`).
- Network failure or the 15 s timeout → `ApiError(status 0, detail 'network' | 'timeout')`; the generic error state
  shows «Нет связи» / «Сервер не ответил. Попробуйте ещё раз через минуту.» (`client.js:103-106`,
  `src/components/ErrorState.jsx:14`, `ru.js:14-16`). — `CONFIRMED`
- Since release `index-CBlEKxdL.js` the owner methods (API-037 … API-053) report refusals as `detail` strings that the
  client parses: `invalid:<fields>` (`422`), `missing:<fields>`, `status:…` (`409`), `rejected:<reason>` and
  `photo:too_many`, `photo:not_image`, `photo:too_big` (`02` BR-API-160; Doc r31:1286-1288, :1439-1442, :1450-1454;
  `src/features/owner/OwnerForm.jsx:668-741`, `:1437-1447` at r31). A `409` on `POST /api/owner/listings` is the
  apartment limit, shown as «Уже две квартиры» (API-038; Doc r31:1434-1435, :1286). The HTTP statuses of the other
  codes are not documented (Q-API-069 in `02`). — `CONFIRMED` (client parsing); server statuses `DOCUMENTED_ONLY`

### 1.6 Timeouts, cancellation, prefetch and retries

- Timeout 15 s per request (`client.js:24`, `:63`). An external `AbortSignal` (used by `/api/feed/count`,
  `/api/feed/flow` and, since release `index-DY_DH7h-.js`, `/api/feed/new`) aborts the request and is re-thrown as
  `AbortError`, so the server sees dropped connections (`client.js:64-72`, `:104`; `$KVADRO_ROOT/docs/api.md:534`). —
  `CONFIRMED`
- Since release `index-CBlEKxdL.js` `apiFetch` takes `timeoutMs`: 90 s for a photo upload of the owner cabinet
  (API-041), 15 s for every other call (`client.js:24-27` at r31). `/api/owner/place` and `/api/owner/demand` also
  pass an `AbortSignal`: a new request, 400 ms after the map stops or 500 ms after a change of the form, aborts the
  previous one (API-051, API-053; `src/features/owner/PlacePicker.jsx:24`, `:63-83`,
  `src/features/owner/OwnerForm.jsx:107`, `:347-369` at r31). — `CONFIRMED`
- Prefetch before React mounts (`src/main.jsx:24-39`): `GET /api/meta`; the first feed page for
  `defaultFilters('rent_long', <saved city>)` with `limit=20`; `GET /api/listings/<id>` when opened from a listing
  link. Prefetch is skipped without `initData` (`client.js:35-43`). The first `apiFetch(url)` **without options**
  and with the **identical URL string** consumes the prefetched promise; if it failed, the request is repeated
  immediately (`client.js:56-60`). A failed first `/api/meta` therefore produces two requests back to back. —
  `CONFIRMED`
- Automatic retries exist only for `GET /api/meta` (§2, API-001). Mutations are never retried automatically, except
  the single repeat after the user grants write access on `409 no_chat` (`src/lib/chatAccess.js:27-54`); since release
  `index-CBlEKxdL.js` the contact request (API-054) repeats the same way
  (`src/features/listing/ContactRequestSheet.jsx:59-68` at r31). — `CONFIRMED`
- Debounced live requests: `/api/feed/count` 250 ms and `/api/feed/flow` 500 ms after each filter change, previous
  request aborted (`src/features/filters/useLiveFeedStats.js:12-45`). — `CONFIRMED`
- Since release `index-CBlEKxdL.js` two requests repeat on their own. While the owner form waits for the phone, it
  polls `GET /api/owner/listings/:id`: at once, then every 1.5 s without overlapping requests for up to 90 s, and at
  once on every return to the app (API-039; `src/features/owner/OwnerForm.jsx:80-86`, `:1484-1620` at r31).
  `GET /api/owner/pending` is sent at app start and on every return to the app, for every user (API-047;
  `src/lib/ownerPending.js:40-55`, `src/app/App.jsx:141` at r31; `03` LB-APP-066). — `CONFIRMED`
- Since release `index-CIa0Ldj2.js` four more points, all on existing methods. The listing of a launch link is
  prefetched only while `sessionStorage['kv-start-done']` does not hold it, that is once per launch
  (`src/main.jsx:36-39`, `src/lib/telegram/startParam.js:38-52` at r33; `03` BR-APP-106). `GET /api/feed/new` has a
  second caller, the fresh pill, which passes no `AbortSignal` (API-035; `src/app/App.jsx:438-468`,
  `src/lib/api/feed.js:111-117` at r33). `GET /api/subscriptions` is sent once at launch when the page address
  carries `?radar=<id>` and no listing link (API-018; `src/app/useAppBootstrap.js:135-149` at r33). The three preview
  requests per radar (`/api/feed`, `/api/feed/count`, `/api/feed/flow`) repeat after every successful load of the
  radar list, at most once per 10 s; before, only a change of the radars or of their filters repeated them
  (`src/features/radar/RadarScreen.jsx:48-50`, `:61-74`, `src/features/radar/useRadarPreviews.js:23-74` at r33; `03`
  BR-APP-063). — `CONFIRMED`

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

Since release `index-CIa0Ldj2.js` the filters sheet shows the area range for every deal, in the search sheet and in
both radar sheets, so `area_min` / `area_max` are sent for rent too; before, the section showed for `sale` only. The
serialisation did not change (`src/features/filters/FiltersSheet.jsx:221`,
`src/features/filters/sheet/ExtraSections.jsx:9-42` at r33). Doc r35:206 still says that the two keys exist only for
`sale` (§4.3); what the server does with them for rent is unknown (Q-API-082 in `02`).

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
`floor: number|null` (since release `index-CIa0Ldj2.js` `0` is the ground (semi-basement) floor and a negative value
a basement; an unknown floor must be `null` or absent, never `0`; before, the client showed nothing for `0` and a
number for a negative floor; Doc r35:274, :305-307; `02` BR-API-195, `03` BR-APP-110), `floors_total: number|null`,
`rooms: number|null`, `pets_ok: boolean`, `is_owner?: boolean`,
`owner_verified?: boolean` (since release `index-CBlEKxdL.js` `owner_verified` draws the badge «Проверенный хозяин»
with a shield, a shield after the price on the compact map card, and the owner chip with `03` SCR-062 on the listing
screen; `is_owner` draws the quiet «Хозяин»; Doc r31:274-276), `photos_preview: string[]`!, `photos_count?: number`,
`cover?: string`,
`video: unknown|null` (truthy flag only; tap opens the Telegram post — `src/features/listing/ListingScreen.jsx:150`),
`age: string|null` (`<prefix> · <when>`; since release `index-CIa0Ldj2.js` only the fallback of the age label),
`posted_at?: string|null` (since release `index-CIa0Ldj2.js`: an ISO time that the client parses with `Date.parse` and
turns into the age label itself, «5 мин назад»; without a parsable value the label comes from `age`, so `age` must
keep coming; the time zone of the value is not stated; Doc r35:286, :302-304; `02` BR-API-196, Q-API-083, `03`
BR-APP-109), `status_text: string|null`, `market: string|null` (display label),
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

Since release `index-CBlEKxdL.js` `ListingDetails` also has seven keys of the owner cabinet (Doc r31:343-350,
:386-397; a breaking change of the contract per `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:43` at r31):
`owner_self?: boolean` (the owner placed the listing in the cabinet: the owner chip, no «Источник» section, the
`details.historySelf` line, the response time; a request instead of a call is possible), `owner_mine?: boolean` (the
caller's own listing, `03` SCR-059), `owner_listing_id?: number` (the cabinet record; the owner panel loads only with
`owner_mine` and this id), `contact_mode: "gate"|"open"|null` (`gate` with `owner_self` and no `phone` → a request
instead of a call, API-054; `open` → the phone is on the card as usual),
`my_request: "pending"|"given"|"declined"|"agent"|"expired"|"cancelled"|null` (the caller's request on this listing),
`response_minutes: number|null` («Обычно отвечает за N мин»: the author section of a self-placed listing that is not
the caller's, the lead of the request sheet `03` SCR-061, the info sheet `03` SCR-062),
`owner_description: string|null` (the cabinet description, the second paragraph of «Описание»; the server must hide
phone numbers in it, Doc r31:1390). `owner_mine` and `my_request` depend on the caller. The card of a gate listing
has no `phone` until the caller's request is `given` (Doc r31:386-391; `02` BR-API-187, BR-API-188). A
self-placed listing has no channel source, so its `original_url` is expected to be `null` (`inferred`; Q-API-078 in
`02`).

Since release `index-CIa0Ldj2.js` the client reads two keys of `ListingDetails` that it ignored before. `deal_type`:
`"sale"` on the listing of the launch link switches the feed under it to the sale defaults (`03` BR-APP-108; Doc
r35:315-316). `author.kind`: unless it is `"phone"`, the report reason `agent` is not offered, and `author: null`
counts as not a phone (API-016; Doc r35:337-341). The answer of `GET /api/map` gains `with_point?: number` (API-007;
Doc r35:671; `02` BR-API-192).

**`FeedPage`** (`$KVADRO_ROOT/docs/api.md:355-366`): `{items: ListingPreview[], next_cursor: string|null!}` —
`next_cursor === null` is the only end-of-list signal (`src/features/feed/useInfiniteFeed.js:41-42`).

**`Subscription`** (`$KVADRO_ROOT/docs/api.md:368-378`): `{id: number|string, active: boolean, mode:
"instant"|"digest", filters: SearchFilters (all 25 keys)!, hidden?: number}`. The contract still types `id` as
`number|string` (Doc r35:428), while since release `index-CIa0Ldj2.js` the radar link `?radar=<id>` compares it
strictly with a number, so an `id` that arrives as a string never matches (API-018; `03` LB-APP-079; Q-API-083 in
`02`).

**`SubscriptionMutationResult`** (`$KVADRO_ROOT/docs/api.md:382-400`): `{subscription: Subscription, starter: number,
options?: {code, label, rate, count: number}[], relaxed: {text: string, …}[]!}`.

The five models of the owner cabinet, since release `index-CBlEKxdL.js` (Doc r31:1352-1427). The contract's own
checklist makes three points strict: `form` is always an object and `photos` always an array; `who` takes only the
values listed below; both `status` fields take only the values listed below. Any other value crashes the owner
screens (Doc r31:1283-1285; `02` BR-API-159; `03` LB-APP-064). Where no type is written, the intake recorded the
field name only.

**`OwnerListing`** (Doc r31:1355-1371): `id`, `status: "draft"|"active"|"paused"|"rented"|"removed"|"rejected"`,
`withdrawn?` (taken down after complaints), `held?` (paused by support), `published_at`, `listing_id` (the public
listing once it is published), `photos: {id, url}[]`! (at most 10, the first is the cover), `form: OwnerListingForm`!,
`stats: OwnerListingStats|null`, `contact_mode: "gate"|"open"|null`, `phone_set`, `phone_display`, `reject_reason?`
(`not_own` or `not_uz` on a draft; `agent`, `fraud` or `limit` with `status: "rejected"`, Doc r31:1366-1369),
`shown_point?: {lat, lon, radius_m}` (the circle seekers see instead of the exact point).

**`OwnerListingForm`** (Doc r31:1373-1391): `city`, `district_code`, `landmark`, `lat`, `lon` (5 decimals), `room`,
`rooms` (1…5), `area_m2`, `floor`, `floors_total`, `price`, `currency: "USD"|"UZS"`, `renovation` (a code from
`meta.renovations.owner`, API-001), `furniture`, `tenants: ("family"|"students"|"girls"|"boys"|"foreigners")[]` (empty
means anyone), `pets`, `description` («номер телефона в тексте сервер должен скрыть», Doc r31:1390).

**`OwnerListingStats`** (Doc r31:1393-1404): `pending`, `requests`, `given`, `sent`, `opened`, `favorites?`,
`days_listed?`, `daily[]` (the last value is today), `price_delta?`, `price_tone?`.

**`OwnerListingsResponse`** (Doc r31:1406-1411): `{items: OwnerListing[], max, can_add, past?}`.

**`OwnerRequest`** (Doc r31:1413-1427): `id`, `name` (the seeker's Telegram name), `who:
"one"|"couple"|"family"|"students"|"friends"`, `people`, `move_in`, `message`, `status:
"pending"|"given"|"declined"|"agent"|"expired"|"cancelled"`, `agent_marked?`, `can_reason?`, `can_undo?`, `can_late?`.

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
- **Business Logic:** evaluates access mode (private / invite / full / blocked / join; since release
  `index-CIa0Ldj2.js` also the pause of the bot, `paused`); returns the user's profile
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
  `bot_username: string|null`, `tiles: string|null`, `new_features?: string[]` (codes `pets`, the filter, and since
  release `index-BnFvC-Ft.js` `cards`, the card-style row of `03` SCR-032; seen = `kv-new-<code>`; Doc r31:488),
  `cities?: CityMeta[]`,
  `districts: {code, name}[]`, `zones: {code, name}[]`, `renovations: Record<deal, {code, name}[]>` (required, Doc
  r31:492-493; since release `index-CBlEKxdL.js` it may hold a key `owner` besides the deals, which the owner form
  reads as `renovations.owner ?? renovations.rent_long`, `src/features/owner/OwnerForm.jsx:993` at r31),
  `appliances: {code, name}[]`, `price_presets: Record<deal, number[]>` (USD), `locales: {code, name}[]`.
  `CityMeta` (Doc:454-463): `code`, `name`, `center: [lat, lon]`, `zoom?: number` (default 12; `< 11` = region, a rule
  the contract states since release `index-CBlEKxdL.js`, Doc r31:499-500; `zoom + 1` is the start zoom of the owner's
  place picker, Doc r31:500-505),
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
  the `full` text (`03` SCR-003). The `detail` codes did not change. Since release `index-CIa0Ldj2.js` there is a
  sixth reason: `403 {"detail": "paused"}` → «Бот на паузе», «Скоро вернёмся. Ваши Радары и избранное на месте.» It
  is re-checked like every reason except `blocked`. As for `blocked`, the client passes no source to `/start`, so the
  main button reads «Вернуться в бот» and only closes the Mini App (`NoAccessScreen.jsx:13`, `:22`, `:26`, `:40`,
  `:72-81`, `useAppBootstrap.js:155-165`, `:175-182` at r33; Doc r35:69-75, :1370; `02` BR-API-194; `03` SCR-003). A
  bundle cached before the release shows `paused` as `private`, with the source passed. What a user can still reach
  during a pause is not documented (Q-API-081).
- **Legacy Source:** Doc:104 (registry), Doc:64-72 (403 handling), Doc:416-466 (§4);
  `$KVADRO_ROOT/docs/about.md:248-252`; client `src/lib/api/meta.js:5`, `src/main.jsx:24` (prefetch),
  `src/app/useAppBootstrap.js:70`, `src/app/App.jsx:234`, `:252`, `:257`; parity mock
  `tools/parity/mocks.mjs:65-73`, `:264` (403 scenario). Release `index-CIa0Ldj2.js`: Doc r35:69-75, :1370, :1393;
  client `src/features/onboarding/NoAccessScreen.jsx:13`, `:22`, `:26` (at r33); parity scenario `no-access-paused`.
- **Migration Target:** legacy `GET /api/meta` must stay byte-compatible during the transition. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — valid `initData` → `200` with every key present (snapshot of names and types), arrays never
  `null`; settings round-trip — after `PUT /api/settings {locale}` → `locale_chosen: true`, after `{city}` →
  `city_chosen: true` and `city` updated, after `{theme}` → `theme` updated; access — one case per reason
  (`private`, `invite`, `full`, `blocked`, `join`) with `detail` as a string; `join` turns into `200` right after the
  bot `/start`; since release `index-CIa0Ldj2.js` also `paused`, during which `GET /api/bot` still answers without
  authorisation (the other routes per Q-API-081); auth — no header, `tma ` with empty value, tampered hash, stale
  `auth_date`, `initData` signed by another bot → status per Q-API-003, never `200`; edge — `cities: []` keeps
  top-level `districts`/`zones`, `analytics: null`, `tiles: null`.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (gate reasons `CONFIRMED` in client, their
  conditions `DOCUMENTED_ONLY`). Related: LB-API-002, LB-API-018, LB-API-019, LB-API-021, LB-API-048,
  LB-API-051, LB-API-053; Q-API-002 … Q-API-006, Q-API-026, Q-API-047, Q-API-054; since release
  `index-CIa0Ldj2.js` `02` BR-API-194, Q-API-081; `03` SCR-003.

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
  listing actions sheet. Since release `index-CBlEKxdL.js` it is also read by the owner panel on every mount and by
  «Мои объявления», for the «Поддержка» button of a held or withdrawn owner listing
  (`src/features/owner/OwnerPanel.jsx:43-52`, `:123`, `src/features/owner/OwnerListings.jsx:100-105` at r31; Doc
  r31:549-551; `03` SCR-057, SCR-059).
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
  path reads `items[0..1].photos_preview[0]` (`src/main.jsx:26-33`). Unread: `total`. Since release
  `index-CIa0Ldj2.js` the items carry the two changes of `ListingPreview` (§1.8). `floor`: `0` is the ground floor
  and a negative value a basement, each shown as a word on the card; an unknown floor is `null` or absent. `posted_at`:
  an ISO time from which the card builds its age label, with `age` as the fallback. The same holds for the items of
  `/api/favorites` and `/api/history` and for the listing card (Doc r35:274, :286, :302-307, :1368;
  `src/features/listing/format.js:55-71`, `:141-166` at r33; `02` BR-API-195, BR-API-196).
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
  LB-API-009, LB-API-029; Q-API-007, Q-API-008, Q-API-010 … Q-API-014, Q-API-022, Q-API-036; since release
  `index-CIa0Ldj2.js` `02` BR-API-195, BR-API-196.

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
  returns from the background after ≥ 6 h, which starts a new visit session (`useReturnNudge.js:50-71`). Since
  release `index-CIa0Ldj2.js` the method has a second caller, the fresh pill «Показать N новых» (`03` SCR-063). After
  a return from ≥ 6 h in the background, on the search tab with the list covered or scrolled 60 px or more, the client
  sends the same filter query with `since` = the moment the current feed was created, not the previous visit (`03`
  BR-APP-104). This call passes no `AbortSignal`, and its answer is used only while the feed key is unchanged
  (`src/app/App.jsx:430-435`, `:438-468`, `src/lib/api/feed.js:111-117` at r33). After one long return both callers
  can send a request, each with its own `since` (`03` LB-APP-082).
- **Validation:** as API-004; validation and bounds of `since` unknown (Q-API-066). — DOCUMENTED_ONLY
- **Business Logic:** number of listings matching the filters that appeared after `since`, with the filter
  interpretation of `/api/feed`, `/count`, `/flow` and `/map` (current Doc:563-570, :1161). What "appeared" means
  (publication or first seen), whether hidden listings and blocked authors are excluded and whether `since` is clamped
  are open in the legacy contract itself (current Doc:1200-1202; Q-API-066). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none; aborted requests show up as dropped connections.
- **Response:** `200 {"count": number}` (current Doc:566-570). `count` is mandatory and numeric: the client shows the
  banner for `count > 0`, nothing for `0`, and crashes on a body without `count` (current Doc:572-573; LB-API-055,
  `03` LB-APP-048). `return_prompt_shown.n` carries this `count`. Since release `index-CIa0Ldj2.js` the fresh pill
  reads the same `count` and shows while it is above `0`; the pill sends no event.
- **Errors:** any status, network failure or timeout → no banner, silently (`useReturnNudge.js:117`; current
  Doc:574); since release `index-CIa0Ldj2.js` likewise no pill (`App.jsx:438-468` at r33).
- **Legacy Source:** `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:16,29`; current Doc:110 (registry #7), Doc:559-588,
  Doc:1161-1162, Doc:1200-1202; client `src/lib/api/feed.js:105-117`,
  `src/app/useReturnNudge.js:112-137`, `src/features/feed/followNudge.js:179-195`; mock
  `tools/parity/mocks.mjs:207-211`; scenarios `return-nudge*` (`tools/parity/mocks.mjs:314-323`). Release
  `index-CIa0Ldj2.js`: `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:10` at r36; Doc r35:648-653; client
  `src/app/App.jsx:430-473`, `src/lib/api/feed.js:111-117` (at r33); mock `tools/parity/mocks.mjs:331`; parity
  scenarios `fresh-pill`, `fresh-pill-show`, `fresh-reload`.
- **Migration Target:** legacy `GET /api/feed/new` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — `count` equals the number of `/api/feed` items for the same filters that appeared after
  `since` (meaning per Q-API-066); edge — nothing new → `{"count": 0}`; `since` in the future → `{"count": 0}`; `since`
  weeks old → per the bound decided in Q-API-066; every `200` carries an integer `count` (never an empty body or
  `null`); an aborted request leaves no server work running; negative/auth as API-004.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-055; Q-API-066; since release
  `index-CIa0Ldj2.js` `03` SCR-063, BR-APP-104, LB-APP-082.

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
  price; `usd` orders stacked points (missing/null = Infinity); `total` drives «показано N из M». Since release
  `index-CIa0Ldj2.js` the answer may also carry `with_point?: number`, the number of listings of `total` that have
  coordinates (Doc r35:671, :681-685; `02` BR-API-192). The client computes `withPoint = with_point ?? points.length`,
  `cut = max(0, withPoint − points.length)` and `noPoint = max(0, total − withPoint)`
  (`src/lib/api/feed.js:142-149` at r33) and shows one of two notes for 6 s after new points, on both engines. With
  `cut > 0`: «На карте — {n} самых свежих. Остальные — в списке», where `n` is the number of points on the map without
  the locally hidden ones. Otherwise with `noPoint > 0`: «На карте {shown} из {total} · {missing} известен только
  район», where `total` is the points shown plus `noPoint`. Without `total` neither note shows
  (`src/features/map/gl/MapViewGL.jsx:192-204`, `src/features/map/leaflet/MapView.jsx:242-254` at r33; `03`
  BR-APP-062). Locally hidden listings are no longer subtracted from `total` (Doc r35:684-685). From how many points
  the answer is cut, and what "newest" orders by, is not documented (Q-API-015).
- **Errors:** up to `index-CBlEKxdL.js` never shown: the GL hook had no rejection handler
  (`src/features/map/gl/useMapPoints.js:15-22`), and a failure left the map without a message. The `ApiError`
  rejection is filtered out of `app_error` (`src/lib/errors.js:118`). Since release `index-CIa0Ldj2.js` a failure
  removes the markers, clusters, selection and counts of the previous filters and shows the banner «Не загрузилось»
  with «Повторить» on both engines; the retry repeats the same request, and a change of filters also clears the
  error (`src/features/map/gl/useMapPoints.js:16-45`, `src/features/map/gl/MapViewGL.jsx:125-140`, `:186-190`,
  `src/features/map/leaflet/MapView.jsx:152-188`, `:236-240` at r33; Doc r35:686-687; `03` SCR-011).
- **Legacy Source:** Doc:110, Doc:558-585; client `src/lib/api/feed.js:119`, `src/features/map/gl/useMapPoints.js:15`,
  `src/features/map/leaflet/MapView.jsx:154`; mock `tools/parity/mocks.mjs:86`, `:130`. Release `index-CIa0Ldj2.js`:
  Doc r35:655-689, :1369; client `src/lib/api/feed.js:142-149`, `src/features/map/gl/useMapPoints.js:16-45`,
  `src/features/map/leaflet/MapView.jsx:152-188` (at r33); mock `tools/parity/mocks.mjs:320`; parity scenarios
  `map-cut-leaflet`, `gl-cut`, `map-fail-leaflet`, `map-fail-leaflet-retry`, `gl-fail`, `gl-fail-retry`.
- **Migration Target:** legacy `GET /api/map` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — every point has numeric `lat`/`lon`, ids match `/api/feed` ids for the same filters, `total ≥
  points.length`; security — a listing whose source text contains `<script>`/`&` never yields a `label` with `<` or
  `&`; edge — listings without coordinates are absent, polygon filter respected; load — large city returns within the
  15 s client timeout; negative/auth as API-004; since release `index-CIa0Ldj2.js` — a cut answer has `with_point`
  larger than the number of points and `total ≥ with_point`; an answer that is not cut may omit `with_point`.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-008; Q-API-015 (narrowed by
  release `index-CIa0Ldj2.js`); since that release `02` BR-API-192; `03` SCR-011, BR-APP-062.

### API-008 — `GET /api/listings/:id`

- **Method:** GET
- **URL:** `/api/listings/:id` (optional `?preview=1`)
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** path `id` — positive integer in practice (from API ids, `start_param` `l_<id>…` or `?listing=<id>`,
  `src/lib/telegram/startParam.js:17-25`); Doc:591 allows string or number. Query `preview=1` only from the map
  selection card (`src/features/map/MapSelectionCard.jsx:29`); it loads the current card and both neighbours. Since
  release `index-CIa0Ldj2.js` an id from a link must be a positive safe integer (`Number.isSafeInteger`; before,
  `Number.isInteger`), and the listing of a launch link is requested only once per launch (`startParam.js:21`,
  `:38-52` at r33; `03` BR-APP-106).
- **Validation:** unknown/removed id → `404`. — CONFIRMED (client handling), server conditions DOCUMENTED_ONLY
- **Business Logic:** full listing card with per-user flags, market comparison, price history, publications,
  author, contact links (`call_url` signed, ~10 min) and nearby places; the server may answer with a **different
  listing** (merged duplicate) — the screen switches to the response `id` without a second request
  (`src/features/listing/hooks/useListingLoader.js:47-58`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:12`, `:16`).
  Since release `index-CBlEKxdL.js` the card of a listing placed through the owner cabinet also carries the seven
  owner keys of §1.8 (`owner_self`, `owner_mine`, `owner_listing_id`, `contact_mode`, `my_request`,
  `response_minutes`, `owner_description`). `owner_mine` and `my_request` depend on the caller, and the card of a gate
  listing has `phone` only after the caller's request is `given` (Doc r31:343-350, :386-391; `02` BR-API-186 …
  BR-API-188). — DOCUMENTED_ONLY
- **DB Changes:** probably records view history (`viewed`, `GET /api/history`); which variant (full, preview) records
  it is unknown (Q-API-035). — UNVERIFIED
- **Side Effects:** probably increments `stats.views` (Q-API-035). — UNVERIFIED
- **Response:** without `preview` — `200 ListingDetails` (§1.8). With `preview=1` — at least the `ListingPreview`
  minimum the compact card needs: `photos_preview` (array), `title` or `short_title`, `favorite`, and the keys
  `center_km`, `metro_km`, `median_delta` (Doc:601-604). `id` must be a number: compared with `!==` against the
  requested number (Doc:606-608). With `phone` non-null, `call_url` must be non-null (Doc:351-353). Unread:
  `contacts`, `source_url`, `price_per_m`. Since release `index-CBlEKxdL.js` `ListingDetails` includes the seven
  owner keys (§1.8). After the caller's request becomes `given` the client reads the card again and expects `phone`
  on it (`src/features/listing/ListingScreen.jsx:334-340` at r31; `03` LB-APP-074). Since release `index-CIa0Ldj2.js`
  the client also reads two keys it ignored before. `deal_type`: `"sale"` on the listing of the launch link, on its
  first full load, switches the feed under it to the sale defaults; daily rent switches nothing
  (`src/features/listing/ListingScreen.jsx:142-146`, `src/app/App.jsx:244-264` at r33; Doc r35:315-316; `03`
  BR-APP-108). `author.kind`: unless it is `"phone"`, the report reason `agent` is not offered (API-016; Doc
  r35:337-341). `floor` and `posted_at` follow §1.8 (`02` BR-API-195, BR-API-196).
- **Errors:** `404` → up to `index-CBlEKxdL.js` «Объявление не загрузилось» (no retry button)
  (`ListingScreen.jsx:115-116`). Since release `index-CIa0Ldj2.js` the screen «Этого объявления уже нет — квартиру,
  похоже, сдали или продали» with the button «Смотреть свежие», which closes the screen and does not reload the feed.
  It shows for every `404` of the full card, whatever its `detail`, and not for `preview=1`
  (`src/features/listing/ListingScreen.jsx:175-201` at r33; Doc r35:712-714; `03` SCR-019). Since the same release
  `429 {"detail": "too many today"}` → «Лимит на сегодня» with the text «За сутки открыто очень много объявлений.
  Попробуйте позже — Радар продолжит присылать новые в чат.» and «Повторить»; `detail` is matched exactly, and any
  other `429` reads as a server error (`src/lib/api/client.js:29-30`, `src/components/ErrorState.jsx:14-25` at r33;
  Doc r35:712-714, :1366-1367; `02` BR-API-193). The threshold, the window and the counted identity are not
  documented (Q-API-080). Other errors → error state with «Повторить». `preview=1`: up to `index-CBlEKxdL.js` errors
  were not shown (spinner stays, neighbour can be re-requested, `MapSelectionCard.jsx:29-36`). Since release
  `index-CIa0Ldj2.js`, with no change of the contract, the card slot shows «Не загрузилось» with «Повторить», which
  reloads the current card and its neighbours; `404` and `429` get no special text there
  (`src/features/map/MapSelectionCard.jsx:22-54`, `:111-121` at r33; Doc r35:690-691).
- **Legacy Source:** Doc:111, Doc:227-353, Doc:589-608; `$KVADRO_ROOT/docs/about.md:156-158`; client
  `src/lib/api/listings.js:10-17`, `src/main.jsx:38` (prefetch for deep links), `src/features/listing/hooks/useListingLoader.js:47`,
  `src/features/map/MapSelectionCard.jsx:29`; mocks `tools/parity/mocks.mjs:76-104`, `:145-147`, `:193-196`. Release
  `index-CIa0Ldj2.js`: Doc r35:274, :286, :302-307, :315-316, :337-341, :690-691, :712-714, :1366-1368; client
  `src/features/listing/ListingScreen.jsx:142-146`, `:175-201`, `src/lib/api/client.js:29-30`,
  `src/components/ErrorState.jsx:14-25`, `src/features/map/MapSelectionCard.jsx:22-54` (at r33); mocks
  `tools/parity/mocks.mjs:345`, `:348`; parity scenarios `listing-gone`, `listing-gone-fresh`, `listing-day-limit`,
  `feed-floor`, `listing-floor-ground`, `listing-floor-basement`.
- **Migration Target:** legacy `GET /api/listings/:id` and `GET /api/listings/:id?preview=1` byte-compatible
  (numeric ids). Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — rent, daily, sale × apartment/house/room/commercial/land fixtures each return every strict key
  (`center_km`, `metro_km`, `median_delta`, `history[].price_usd`, `history[].change_pct`, `median_value` when
  `median`, `sources`, `photos_preview`); `id` is a JSON number; `nearby[].kind ∈ {park, school}` and unique;
  `facts[].key` unique; `phone` ⇒ `call_url`; preview — `?preview=1` contains the preview minimum; merge — id of a
  merged duplicate returns the surviving listing with its own `id`; negative — unknown id → `404 {"detail": …}`,
  non-numeric id → `404` or `422` (record legacy), withdrawn listing (Q-API-023); auth — missing/invalid `initData`;
  side effect — history/`viewed` recorded per Q-API-035; owner cabinet (since release `index-CBlEKxdL.js`) — a gate
  listing without a request has `contact_mode: "gate"`, `my_request: null` and no `phone`; one card per `my_request`
  value (`pending`, `given`, `declined`, `agent`, `expired`, `cancelled`); `given` ⇒ `phone` (per Q-API-076); the
  author's own listing has `owner_mine` and `owner_listing_id`, and the same listing read by another user has neither;
  since release `index-CIa0Ldj2.js` — a listing that is gone → `404`; the daily cap → `429 {"detail": "too many
  today"}` (threshold per Q-API-080); `floor: 0`, `floor: -1` and an unknown floor as `null`, never `0`; `posted_at`
  as an ISO time, with `age` still present.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-009, LB-API-010, LB-API-011,
  LB-API-012, LB-API-029, LB-API-030, LB-API-031; Q-API-019, Q-API-021 … Q-API-024, Q-API-035; since release
  `index-CBlEKxdL.js` `02` BR-API-186 … BR-API-189, Q-API-076, Q-API-078; since release `index-CIa0Ldj2.js`
  API-016, `02` BR-API-193, BR-API-195, BR-API-196, Q-API-080; `03` SCR-019, BR-APP-106, BR-APP-108.

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
  `:24-52`, `:62-72`). Since release `index-CBlEKxdL.js` "the first link arrives in the card" does not hold for a
  gate listing of the owner cabinet until the caller's request is `given`: before that its card carries no `phone`
  (Doc r31:386-391; API-054; `02` BR-API-187). — DOCUMENTED_ONLY (TTL and single-use rules: Q-API-042)
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
- **Input:** path `id`. Up to `index-CBlEKxdL.js` no body. Since release `index-CIa0Ldj2.js` the body
  `{"favorite": boolean}`, the wanted state (`Content-Type: application/json`). Bundles cached before the release
  still send no body, and such a request must still toggle (Doc r35:746-766, :1363-1364;
  `src/lib/api/listings.js:39-45` at r33; `02` BR-API-197).
- **Validation:** listing exists. — UNVERIFIED
- **Business Logic:** **toggles** the favourite flag on the server and returns the resulting state; the bot's
  «⭐ В избранное» / «★ В избранном» buttons use the same toggle (`$KVADRO_ROOT/docs/telegram-bot.md:986`). Since
  release `index-CIa0Ldj2.js` the server sets the state that the body names and toggles only for a request without a
  body (Doc r35:746-766). — DOCUMENTED_ONLY
- **DB Changes:** insert or delete a favourite row (user, listing). — UNVERIFIED
- **Side Effects:** none known.
- **Response:** `200 {"favorite": boolean}`; the client uses it as the source of truth
  (`src/components/FavButton.jsx:27`). `204` or an error rolls the heart back.
- **Errors:** up to `index-CBlEKxdL.js` any error → optimistic state reverted silently. Since release
  `index-CIa0Ldj2.js` an error or a `204` returns the heart to its previous state with the error haptic and the toast
  «Не получилось сохранить» (`src/components/FavButton.jsx:20-37` at r33).
- **Legacy Source:** Doc:114, Doc:636-647; client `src/lib/api/listings.js:38-41`, `src/components/FavButton.jsx:27`.
  Release `index-CIa0Ldj2.js`: Doc r35:746-766, :1363-1364; client `src/lib/api/listings.js:39-45`,
  `src/components/FavButton.jsx:20-37` (at r33); parity scenario `fav-fail`.
- **Migration Target:** legacy `POST /api/listings/:id/favorite` (toggle) byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — two calls return `true` then `false`; `GET /api/favorites` reflects the state; concurrency —
  two parallel calls end in a defined state (record legacy behaviour, Q-API-038); bot ↔ app consistency; negative —
  unknown id → `404`; auth; since release `index-CIa0Ldj2.js` — `{"favorite": true}` twice → `true` both times;
  `{"favorite": false}` on a listing that is not a favourite → `false`; a request without a body → toggles.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-039; Q-API-038 (narrowed by
  release `index-CIa0Ldj2.js`); since that release `02` BR-API-197.

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
  (`src/features/listing/ListingActionsSheet.jsx:12`, `:176`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:77`). Since
  release `index-CIa0Ldj2.js` it is also not offered when the author is not a phone (`author.kind !== "phone"`), which
  covers a card without an author and the time while the details load
  (`src/features/listing/ListingScreen.jsx:389-390`, `src/features/listing/ListingActionsSheet.jsx:177` at r33; Doc
  r35:337-341; `02` BR-API-105).
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
  (`useListingActions.js:61-77`, `ru.js:229-232`; audited tree `ru.js:217-220`). Since release `index-CIa0Ldj2.js`
  the answer to `agent` may also carry `agent_marked?: boolean` (Doc r35:840-852; `02` BR-API-191), and three toasts
  change. `rented` → «Отметили: уже сдано» now has the action «Вернуть» for 6 s: it unhides the listing locally and
  withdraws the report through API-055. `fraud` with `hidden: true` keeps its undo through API-013, and the action
  reads «Показывать у меня». `agent` with `agent_marked: true` → «Отметили номер как риелторский»; with `false` or
  without the key → «Спасибо, учёл вашу отметку» (`src/app/useListingActions.js:36-50`, `:62-74`,
  `src/features/listing/ListingActionsSheet.jsx:93-103` at r33; `03` BR-APP-036).
- **Errors:** any error → «Не получилось сохранить».
- **Legacy Source:** Doc:119, Doc:675-705; `$KVADRO_ROOT/docs/about.md:219-228`; client
  `src/lib/api/listings.js:84-90`, `src/features/listing/ListingActionsSheet.jsx:89-95`,
  `src/app/useListingActions.js:61-77` (audited tree). Release `index-BNLZFfL0.js`: `src/lib/api/listings.js:79-90`,
  `src/features/listing/ListingActionsSheet.jsx:13-14`, `:93-102`, `:175-200`; current
  `$KVADRO_ROOT/docs/api.md:707-758`; `$KVADRO_ROOT/demo/app/docs/releases/2026-11-12_index-BNLZFfL0/REPORT.md:22-24`;
  parity scenarios `tools/parity/mocks.mjs:281-293`. Release `index-CIa0Ldj2.js`: Doc r35:337-341, :840-864,
  :1372-1373; client `src/app/useListingActions.js:36-50`, `:62-74`,
  `src/features/listing/ListingActionsSheet.jsx:93-103`, `:177`, `src/features/listing/ListingScreen.jsx:389-390` (at
  r33); mock `tools/parity/mocks.mjs:190-195`; parity scenarios `listing-report-rented-undo`, `listing-report-agent`,
  `listing-report-agent-marked`.
- **Migration Target:** legacy `POST /api/listings/:id/report` byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — each reason returns JSON `{hidden}` (never `204`); `fraud` returns `hidden: true` when the
  listing was hidden for the reporter; `rented` hides for the voter; `agent` marks the phone (per threshold);
  `wrong_data` with each of `price`, `rooms`, `place`, `photos`, `other` → `200 {hidden}`, the `detail` kept with the
  report; compatibility — `{"reason": "wrong_data"}` without `detail` (older bundle) → `200 {hidden}`; the other
  reasons without the key → `200`; negative — `reason: "spam"` → `422`, missing body → `422`; an unknown `detail` code
  and a `detail` with another reason → per Q-API-064 (record legacy first); repeat — same user, same reason twice is
  counted once (record legacy, Q-API-038); anti-abuse — low-trust accounts do not flip global state alone; auth;
  since release `index-CIa0Ldj2.js` — `agent` answers `agent_marked: true` once the number is marked as a realtor's,
  and `false` or no key while the vote is only counted (threshold per Q-API-039; what the server really sends per
  Q-API-083).
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (`detail` handling `UNVERIFIED`). Related:
  LB-API-015, LB-API-042, LB-API-043; Q-API-038 … Q-API-040, Q-API-064; since release `index-CIa0Ldj2.js` API-055,
  `02` BR-API-105, BR-API-190, BR-API-191, Q-API-083; `03` BR-APP-036.

### API-055 — `DELETE /api/listings/:id/report`

- **Since:** release `index-CIa0Ldj2.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:21` at r36).
- **Method:** DELETE
- **URL:** `/api/listings/:id/report`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the caller withdraws a report of their own.
- **Input:** path `id`; no body, no `Content-Type`. The client calls it from one place only: the action «Вернуть» of
  the toast «Отметили: уже сдано», shown for 6 s after a `rented` report (API-016). The contract and the changelog
  call that action «Отменить»; the dictionaries say `toast.undo` = «Вернуть» / «Undo» / «Qaytarish» (§4.3).
- **Validation:** not documented: the answer for a listing the caller never reported and for a repeat is unknown. —
  UNVERIFIED (Q-API-079 in `02`)
- **Business Logic:** withdraws the caller's report on the listing (`02` BR-API-190). The client first unhides the
  listing locally, then sends the request. Which reasons the method withdraws — the client sends it only after
  `rented` — and what happens to a report that already changed the listing for other users are not documented; the
  legacy contract asks the second itself (Doc r35:1422-1426, open question 18). — DOCUMENTED_ONLY; the two open
  points UNVERIFIED (Q-API-079)
- **DB Changes:** not documented. Presumably the caller's report row is deleted or voided (`inferred`); whether the
  hidden row that the report created goes with it is unknown. — UNVERIFIED (Q-API-079)
- **Side Effects:** the listing may return to other users' results if the report had hidden it for them. —
  UNVERIFIED (Q-API-079)
- **Response:** not read by the client; `204` is recommended by the contract (Doc r35:860-864). The parity mock
  answers `204` (`tools/parity/mocks.mjs:190-195`).
- **Errors:** any error → the listing is hidden again locally and «Не получилось сохранить» shows
  (`src/app/useListingActions.js:44-47` at r33).
- **Legacy Source:** Doc r35:126 (registry #18), Doc r35:860-864, :1365, :1422-1426; client
  `src/lib/api/listings.js:87-90`, `src/app/useListingActions.js:36-50`, `:69-71` (at r33); mock
  `tools/parity/mocks.mjs:190-195`; parity scenario `listing-report-rented-undo`.
- **Migration Target:** legacy `DELETE /api/listings/:id/report` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** a record of the legacy contract — after a `rented` report the DELETE answers `2xx` and the listing is
  back in the caller's feed; a repeat of the DELETE and a DELETE without a report (both per Q-API-079, record legacy
  first); a DELETE after a report with another reason (per Q-API-079); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (the parts marked UNVERIFIED above: Q-API-079).
  Related: API-013, API-016; `02` BR-API-190, Q-API-040, Q-API-079; `03` BR-APP-036; `04` BTN-043 (the bot's undo
  «↩️ Не сдано»).

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
  `PATCH {unhide: true}`. Unread: `title`, `new_count`, `finds`, `created_at`, `hidden_count`. Since release
  `index-CIa0Ldj2.js` the client also calls this method once at launch when the page address carries `?radar=<id>`
  and the launch names no listing. It looks for the radar with `item.id === radarId`, a strict comparison with a
  number, and takes that radar's `filters` as the search (`src/features/radar/radarLink.js:7-13`,
  `src/app/useAppBootstrap.js:135-149` at r33; Doc r35:1314-1317; `03` BR-APP-107). The contract types `id` as
  `number|string` (Doc r35:428), and an `id` that arrives as a string never matches (`03` LB-APP-079; Q-API-083).
- **Errors:** radar tab → error state with «Повторить» (`src/features/radar/RadarScreen.jsx:58`, `:193-195`);
  elsewhere ignored; the launch call for `?radar=<id>` shows nothing on a miss or an error.
- **Legacy Source:** Doc:121, Doc:368-378, Doc:721-729; client `src/lib/api/subscriptions.js:5`,
  `src/app/App.jsx:175` (search tab; since release `index-DY_DH7h-.js` also re-read when the app returns from the
  background after ≥ 6 h, `src/app/useReturnNudge.js:62-66` at the pin), `src/app/subscriptionActions.js:95` (re-read
  before every create), `src/features/radar/RadarScreen.jsx:58`, `src/features/settings/SettingsScreen.jsx:60`; mock
  `tools/parity/mocks.mjs:105-107`, `:121`. Release `index-CIa0Ldj2.js`: Doc r35:428, :1314-1317; client
  `src/app/useAppBootstrap.js:135-149`, `src/features/radar/radarLink.js:7-13` (at r33); parity scenario `radar-link`
  (`tools/parity/mocks.mjs:530`).
- **Migration Target:** legacy `GET /api/subscriptions` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — radars created in the app and in the bot both appear; every `filters` has 25 keys; ids stable;
  migrated legacy radars (pre-`zones`) come back normalised; edge — empty list → `[]`; auth; since release
  `index-CIa0Ldj2.js` — every `id` is a JSON number, because the radar link compares strictly (per Q-API-083).
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-005, LB-API-006, LB-API-038;
  Q-API-013, Q-API-032; since release `index-CIa0Ldj2.js` `02` Q-API-083; `03` BR-APP-107, LB-APP-079.

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
- **Errors:** up to `index-CBlEKxdL.js` — toggle: any error reverts the switch silently, `no_chat` additionally shows
  the no-chat toast; `409` limit on toggle is reverted silently; on the create path `409` without `no_chat` → limit
  toast; mode/unhide errors revert silently. Since release `index-CIa0Ldj2.js` every failure on the radar tab also
  shows the toast «Не получилось сохранить»: the switch (except `no_chat`, which keeps its own toast), the mode
  change and the unhide, each with its rollback (`src/features/radar/RadarScreen.jsx:130-134`, `:152-156`, `:172-175`
  at r33). A `409` limit answer to the switch therefore reads «Не получилось сохранить», while the create path still
  names the limit (`03` LB-APP-081). Doc r35:81-84 still says that the switch rolls such a `409` back silently
  (§4.3).
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
  Q-API-030, Q-API-032, Q-API-033; since release `index-CIa0Ldj2.js` `03` LB-APP-081.

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
- **Errors:** any error → haptic only; since release `index-CIa0Ldj2.js` also the toast «Не получилось сохранить»
  (`src/features/radar/RadarScreen.jsx:194-197` at r33).
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
  digest_presets: string[]}` (Doc:844-855); since release `index-BnFvC-Ft.js` also `card_style?: "classic" | "rich"`, a
  missing or `null` value meaning `classic`, any other value crashing the settings screen (`03` LB-APP-051; Doc
  r31:982,986-989). `digest.split(',')` is called in the radar sheet
  (`src/features/radar/RadarSheet.jsx:52-61`) — `digest` must be a string. Unread: `theme`, `city`. Preset values:
  api.md examples `off`, `23-08`, `22-09` / `09`, `09,21`, `21` (mock `tools/parity/mocks.mjs:124`) vs bot presets
  `off`, `22-08`, `23-08`, `00-09`, `23-07` / `09`, `09,19`, `12,20`, `19`
  (`$KVADRO_ROOT/docs/telegram-bot.md:990`) — Q-API-029.
- **Errors:** settings screen → error state with «Повторить»; radar sheet ignores errors.
- **Legacy Source:** Doc:127, Doc:842-855; client `src/lib/api/settings.js:5`,
  `src/features/settings/SettingsScreen.jsx:59`, `src/features/radar/RadarSheet.jsx:52`.
- **Migration Target:** legacy `GET /api/settings` byte-compatible. Handler: TBD (`10-target-architecture.md`).
- **Tests:** positive — all eight keys; `quiet ∈ quiet_presets`, `digest ∈ digest_presets`; values match the bot's
  `/settings`; `card_style` is `classic`, `rich` or absent; auth.
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
  (`SettingsScreen.jsx:91`); since release `index-BnFvC-Ft.js` `{card_style: "classic" | "rich"}` from the card-style
  sub-page, not sent for the current style or while a sample is sending (`SettingsScreen.jsx:153-160` at r31; Doc
  r31:1003,1022,1029).
- **Validation:** known keys and values (preset membership assumed). — UNVERIFIED
- **Business Logic:** merges the patch into the profile; the same profile drives the bot language (🔶) and
  `GET /api/meta` (`locale_chosen`/`city_chosen` become `true`). — DOCUMENTED_ONLY
- **DB Changes:** update user settings. — UNVERIFIED
- **Side Effects:** bot command menu language follows the locale (`setMyCommands` per user 🔶, `about.md:318`).
- **Response:** `200` full `SettingsResponse` (as API-024). Read only for `quiet`/`digest` (replaces local state,
  `SettingsScreen.jsx:83-95`) and, since release `index-BnFvC-Ft.js`, `card_style` (Doc r31:1025-1027); ignored for
  the others (Doc:886-888).
- **Errors:** quiet/digest/theme → rollback + haptic; locale/currency → no reload, haptic; city → ignored
  (`city.js:23-25`); language picker → haptic, can retry. Since release `index-CIa0Ldj2.js` every failure except the
  city's also shows «Не получилось сохранить»: as a toast in the settings, and as a line under the list of the
  first-launch language picker (`src/features/settings/SettingsScreen.jsx:145-149`, `:185-190`, `:202-205`,
  `src/features/onboarding/LanguagePicker.jsx:29-46`, `:66-70` at r33).
- **Legacy Source:** Doc:128, Doc:857-897; client `src/lib/api/settings.js:11-15` and the call sites above.
- **Migration Target:** legacy `PUT /api/settings` (partial semantics) byte-compatible. Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — each single-key patch persists and returns the full object; `GET /api/meta` then reflects
  `locale`/`theme`/`city`/`currency` with `locale_chosen: true`/`city_chosen: true`; keys not sent stay unchanged;
  negative — unknown locale, `quiet` outside presets, unknown city → `422`; empty body → no-op or `422` (record
  legacy); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-018, LB-API-049, LB-API-050;
  Q-API-057.

### API-036 — `POST /api/settings/card-sample`

- **Since:** release `index-BnFvC-Ft.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:54,69`).
- **Method:** POST
- **URL:** `/api/settings/card-sample`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** none (no body).
- **Validation:** auth only. — UNVERIFIED
- **Business Logic:** the bot sends the user one sample listing card in the **saved** `card_style` (written before
  through API-025). Which listing it shows is not documented. — DOCUMENTED_ONLY
- **DB Changes:** none known.
- **Side Effects:** a Telegram message in the user's chat with the bot (`04` BOT-085).
- **Response:** `200 {sent: boolean}`; `false` means the bot could not send it (Doc r31:1040-1049).
- **Errors:** the client treats any error like `sent: false` («Пример не отправился — вид всё равно сохранён»). The
  answer must be JSON: a `204` hangs the button (`03` LB-APP-052; Doc r31:1053-1055).
- **Legacy Source:** Doc r31:132 (registry #27), Doc r31:1040-1055, Doc r31:1271, Doc r31:1318-1320 (open question
  16); client `src/lib/api/settings.js:7-14` (at r29), `src/features/settings/SettingsScreen.jsx:162-171` (at r31);
  parity scenarios `settings-cards-sample`, `settings-cards-sample-unsent`, `settings-cards-sample-error`,
  `settings-cards-sample-pick` (`$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md:51-56`).
- **Migration Target:** native v1 `POST /settings/card-sample` (`25` §4.2): HOMI's bot sends the sample (WP-53,
  WP-57).
- **Tests:** positive — `200 {sent: true}` and one card in the bot chat in the saved style; `sent: false` when the
  chat cannot be written; the answer is always JSON with a boolean `sent`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (Q-API-067).

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
- **Errors:** optimistic removal rolled back with haptic (`src/features/settings/HiddenScreen.jsx:26-37`). Since
  release `index-CIa0Ldj2.js` also the toast «Не получилось сохранить», and the rollback restores only what the
  failed action had removed (`HiddenScreen.jsx:28-54` at r33).
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
- **Errors:** rollback + haptic; since release `index-CIa0Ldj2.js` also the toast «Не получилось сохранить»
  (`HiddenScreen.jsx:51-52` at r33).
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
- **Input:** up to `index-CBlEKxdL.js` none — the client never sent `cursor` (`useInfiniteFeed.js:31-33`). Since
  release `index-CIa0Ldj2.js` an optional query `cursor`: page one is requested without it, every next page with
  `cursor=<encodeURIComponent(next_cursor)>` (`src/lib/api/user.js:26-27`,
  `src/features/feed/useInfiniteFeed.js:31-42` at r33; Doc r35:1157-1162).
- **Validation:** auth only.
- **Business Logic:** the user's favourites (shared with the bot's `/fav`). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** up to `index-CBlEKxdL.js` `200 {items: ListingPreview[], next_cursor: null}` — the whole list in one
  page; any non-null `next_cursor` (or a missing key) loops the same request (Doc:930-941). Since release
  `index-CIa0Ldj2.js` `200 {items: ListingPreview[], next_cursor: string|null}`: the list is paged, the client
  follows `next_cursor` until it is `null` and drops duplicate ids (`02` BR-API-023). The page size and the cursor
  format are not documented (Q-API-084; the legacy contract asks the same, Doc r35:1400-1401). A bundle cached before
  the release never sends a cursor, so on a non-null `next_cursor` it repeats the first request in a loop
  (`inferred` from the old bundle's code, not observed; `02` LB-API-057, LB-API-004). The client additionally filters
  out items unfavourited or hidden in this session (`ListingFeed.jsx:81-83`).
- **Errors:** `403` → «Нет доступа»; other → error state.
- **Legacy Source:** Doc:132, Doc:926-941; client `src/lib/api/user.js:23`, `src/features/feed/useInfiniteFeed.js:33`;
  mocks `tools/parity/mocks.mjs:122`, `mocks-filters.mjs:83`. Release `index-CIa0Ldj2.js`: Doc r35:1157-1162,
  :1339-1340, :1400-1401; client `src/lib/api/user.js:26-27`, `src/features/feed/useInfiniteFeed.js:31-42` (at r33);
  mock `tools/parity/mocks.mjs:323-326`; parity scenario `favorites-pages`.
- **Migration Target:** legacy `GET /api/favorites` byte-compatible (`next_cursor: null`). Handler: TBD
  (`10-target-architecture.md`).
- **Tests:** positive — favourites from app and bot, `next_cursor` is JSON `null`, every item has the preview strict
  keys, withdrawn listings handling (status_text) per Q-API-023; edge — empty list; large list (e.g. 500) still one
  page; auth. Since release `index-CIa0Ldj2.js` the large list is paged instead: the first answer carries a
  `next_cursor`, the request with it returns the next page, the last page has `next_cursor: null`, and there are no
  duplicates and no gaps (page size per Q-API-084); a request without `cursor` from an older bundle on a list longer
  than one page (LB-API-057).
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: LB-API-004, LB-API-024; Q-API-009;
  since release `index-CIa0Ldj2.js` `02` BR-API-023, LB-API-057, Q-API-084.

### API-030 — `GET /api/history`

- **Method:** GET
- **URL:** `/api/history`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; `403` → «Нет доступа».
- **Input:** none (never a cursor) — `useInfiniteFeed.js:34-35`. Still so at release `index-CIa0Ldj2.js`, which
  paged `/api/favorites` (API-029): `/api/history` is read whole, without a cursor.
- **Validation:** auth only.
- **Business Logic:** listings the user viewed (which action records a view: Q-API-035), most recent first
  (assumed). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {items: ListingPreview[], next_cursor: null}` (the rules API-029 had up to `index-CBlEKxdL.js`:
  the whole list in one page; a non-null or missing `next_cursor` loops the request).
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
- **Errors:** haptic only (`src/features/feed/ListingFeed.jsx:93-103`); since release `index-CIa0Ldj2.js` also the
  toast «Не получилось сохранить» (`ListingFeed.jsx:114-117` at r33).
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
  `app_launch {entry: link|news|menu, ms, v, sdk?, js, platform?}` (`useAppBootstrap.js:54-61`), since release
  `index-BnFvC-Ft.js` also `tg?` = `Telegram.WebApp.version`, not truncated by the sender (`useAppBootstrap.js:54-62`
  at r29; Doc r31:1177,1201-1202);
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
  `chat_access_declined|allowed` (`chatAccess.js:36`, `:40`; since release `index-CBlEKxdL.js` also from the contact
  request, API-054); `listing_shared {listing_id}`
  (`ListingTitleRow.jsx:30`); `original_opened {listing_id, src: button|video|sources|price_history|offers}`
  (`ListingScreen.jsx:141`); `original_copied {listing_id}` (`sections/OriginalText.jsx:71`);
  `contact_call {listing_id, via: tel|browser, src?: "text"}` (`useListingContact.js:75`);
  `contact_write {listing_id}` (`useListingContact.js:84`); since release `index-CBlEKxdL.js`
  `owner_info_opened {listing_id}`, sent by a tap on the owner chip of the listing screen or on its tip
  (`src/features/listing/OwnerChip.jsx:54-62` at r31; Doc r31:1192; `03` BR-APP-101); since release
  `index-CIa0Ldj2.js` six events of the owner cabinet, analytics only:
  `owner_attention {what: dot|coach|banner, action: shown|clicked}`, each `what:action` pair at most once per session
  (`src/lib/ownerAttention.js:5-22`); `owner_mascot_tap` without properties, at most once per 30 s
  (`ownerAttention.js:25-39`); `owner_limit_sheet {where: settings|mine}`, on every mount of the limit sheet
  (`src/features/settings/OwnerLimitSheet.jsx:18-26`); `owner_place_set {source: map|locate|manual}`
  (`src/features/owner/OwnerForm.jsx:554-557`, `:805-809`); `owner_place_autofill {result: applied|reverted}`
  (`OwnerForm.jsx:616-620`, `:631-636`); `owner_hint_opened {field: photos|area_m2|floor|renovation|description}`
  (`src/features/owner/OwnerPanel.jsx:247-251`) — all at r33; Doc r35:1256-1261, :1278-1286. Since the same release
  `app_error` has one more form: `kind: "error"`, `source: "i18n"`, `message: "i18n: no key <key> (<locale>)"`, sent
  once per missing dictionary key and counted within the 5 distinct errors per session
  (`src/i18n/index.js:110-125`, `:180-193` at r33; Doc r35:1287-1289).
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
  Q-API-046; since release `index-CIa0Ldj2.js` `02` BR-API-123.

### API-037 — `GET /api/owner/listings`

API-037 … API-053 are the 17 methods of the owner cabinet «Сдать квартиру» (`/api/owner/*`; screens `03` SCR-049 …
SCR-060), added in release `index-CBlEKxdL.js`. API-054 is the seeker's request to such an owner. Three things are
common to the 17 and are not repeated in each entry.

**Auth and ownership.** `Authorization: tma <initData>` like every `/api` call (Doc r31:31-44; §1.2). The client sends
no role and no owner id: the server alone ties a listing `:id` or a request id to the caller. Its answer for another
user's id is not documented (`02` BR-API-161, `UNVERIFIED`; Q-API-069).

**Transport.** The `FormData` body (§1.3), the `detail` grammar of the refusals (§1.5), the timeouts and the aborted
and repeated requests (§1.6). The models are in §1.8.

**Evidence.** The contract (Doc r31 §16; registry Doc r31:142-158) and the Mini App code at r31; every client path of
these entries is cited at r31. Nothing was run. The recovery's parity runs checked the client on mocks that its
authors inferred (`tools/parity/mocks.mjs:253-301`), not on the real API. No server or bot code was seen, so the
server logic of every method is `DOCUMENTED_ONLY`, and a part that only the Mini App's texts describe is marked
`UNVERIFIED` with its question. The contract asks about the limits and ranges itself (Doc r31:1321-1325, open question
17).

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** GET
- **URL:** `/api/owner/listings`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the answer holds the caller's own listings only.
- **Input:** none.
- **Validation:** auth only.
- **Business Logic:** returns every owner listing of the user, past ones included («История» holds the `rented`,
  `removed` and `withdrawn` listings), and the apartment limit: `max` is the number of flats that may be listed at
  once (2 today), `can_add` is `false` at the limit, and `past` counts the flats the user listed before. Whether the
  limit counts per account or per confirmed phone, and whether drafts count toward `can_add`, is not documented
  (`02` BR-API-162; Q-API-068). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 OwnerListingsResponse` (§1.8): `{items, max, can_add, past?}`.
- **Errors:** the settings screen ignores every error silently; «Мои объявления» shows an error state with a retry.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1406-1411, :1430-1433; client
  `src/lib/api/owner.js`, `src/features/settings/SettingsScreen.jsx:101-107` (on mount, on `ownerVersion`, on opening
  and closing «Мои объявления»), `src/features/owner/OwnerListings.jsx:307-320`, `:352` (on open, on `version`, on
  retry, after every status change and after closing «Отклики»), `src/features/owner/OwnerForm.jsx:214-219` (a new
  form, for «С возвращением!»).
- **Migration Target:** `GET /api/v1/owner/listings` (native, WP-80 on stubs, WP-84; DEC-70); the pending count moves to
  `GET /me`.
- **Tests:** positive — a user with no listings gets `items: []` and `can_add: true`; a user at `max` gets
  `can_add: false`; `past` counts only finished listings; isolation — another user's listings never appear; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-162; `03` SCR-032, SCR-049,
  SCR-057, BR-APP-089, BR-APP-095; Q-API-068.

### API-038 — `POST /api/owner/listings`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/listings`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** none (no body; `src/lib/api/owner.js:30-34`). Every entry into a new draft sends it (`03` BR-APP-075),
  and so does each retry after a load error.
- **Validation:** the apartment limit. — DOCUMENTED_ONLY
- **Business Logic:** creates a draft. The contract says only "a new draft": nothing says that an untouched draft is
  reused, so every call may leave one behind (`02` BR-API-163; `03` LB-APP-054; Q-API-068). — DOCUMENTED_ONLY
- **DB Changes:** a new owner-listing row (`inferred`). — UNVERIFIED (Q-API-068)
- **Side Effects:** none known.
- **Response:** a new `OwnerListing` (§1.8) with `status: "draft"`. Its `form` may hold nothing; the client then fills
  `city` from `meta.city` (`src/features/owner/OwnerForm.jsx:339-346`).
- **Errors:** `409` at the apartment limit → the limit state «Уже две квартиры»; any other error → an error state
  with a retry, and the retry posts again (Doc r31:1434-1435, :1286).
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1434-1435, :1286; client
  `src/lib/api/owner.js:30-34`, `src/features/owner/OwnerForm.jsx:183-238`.
- **Migration Target:** `POST /api/v1/owner/listings`: the caller's untouched draft when one exists (DEV-054); off while
  `OWNER_CABINET_ENABLED` is off (DEC-81).
- **Tests:** at the limit → `409`; below it → `200` or `201` (record legacy) with `photos: []` and `form: {}`;
  repeated calls → per Q-API-068 (a new draft each time, or the untouched one again); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-162, BR-API-163; `03`
  SCR-050, BR-APP-075, BR-APP-089, LB-APP-054; Q-API-068.

### API-039 — `GET /api/owner/listings/:id`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** GET
- **URL:** `/api/owner/listings/:id`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** path `id` of an owner listing. Callers: the form when it loads an existing listing; the phone poll,
  every 1.5 s for up to 90 s and on every return to the app (`03` BR-APP-084; §1.6); the re-read after a publish
  answered `rejected:`; the owner panel on mount, on `ownerVersion` and on retry (`03` SCR-059).
- **Validation:** the listing belongs to the caller; the answer for another user's id is not documented. — UNVERIFIED
  (Q-API-069)
- **Business Logic:** returns one owner listing. The phone state must become visible here within seconds of the bot
  receiving the owner's contact: the Mini App learns the result of `requestContact` only from this method (`02`
  BR-API-170, BR-API-171; `04` BOT-086; `05` TMA-034). The answer also carries `shown_point`, the circle seekers see
  instead of the exact point (`02` BR-API-167). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 OwnerListing` (§1.8). During the phone poll the client watches `phone_set`, `status: "rejected"`
  and, on a draft, a `reject_reason` of `not_uz` or `not_own` (Doc r31:1436-1438).
- **Errors:** in the form → an error state with a retry; in the poll → retried on the next tick; on the panel → an
  error state inside the panel's island.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1436-1438, :1346-1348; client
  `src/lib/api/owner.js`, `src/features/owner/OwnerForm.jsx:183-238` (the load), `:708-721` (the re-read),
  `:1484-1620` (the poll), `src/features/owner/OwnerPanel.jsx` (the panel).
- **Migration Target:** `GET /api/v1/owner/listings/{id}` (native); the only answer with the true point and the owner's
  own number (DEC-72).
- **Tests:** an id of another user → not found or forbidden (the legacy status is unknown, Q-API-069); the poll sees
  `phone_set` after the bot processes the contact; `shown_point` stays the same between reads (Q-API-074); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-167, BR-API-170, BR-API-171;
  `03` SCR-053, SCR-059, BR-APP-084, BR-APP-085; Q-API-069, Q-API-074.

### API-040 — `PATCH /api/owner/listings/:id`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** PATCH
- **URL:** `/api/owner/listings/:id`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** path `id`; body — only the changed `OwnerListingForm` fields (§1.8), a cleared field as `null`. The form
  sends it 600 ms after the last edit, before «Дальше», before publish and when it closes. It holds `floor` and
  `floors_total` back while `floor > floors_total` (`03` BR-APP-079).
- **Validation:** refuses fields with `422 invalid:<fields>`. The names include at least `floor`, `point`, `lat`,
  `lon` and any form field (`inferred` from the client's handling, `src/features/owner/OwnerForm.jsx:1442-1447`). The
  accepted ranges are not documented (Q-API-069). — DOCUMENTED_ONLY
- **Business Logic:** merges the sent fields into the form; `null` clears one. The server must hide phone numbers
  written into the description (Doc r31:1390; `02` BR-API-165). For a published listing, whether the change reaches
  the public listing at once or only after `publish` is unknown (`03` LB-APP-055; Q-API-070). — DOCUMENTED_ONLY
- **DB Changes:** the form of the owner listing.
- **Side Effects:** none known.
- **Response:** `200 OwnerListing`.
- **Errors:** `409`, or `detail: "missing:status"` → the listing can no longer be edited (`own.notEditable` with
  «Мои объявления»); `422` with `detail: "invalid:a,b"` → those fields are highlighted, and the rest of the same save
  goes out again in a separate `PATCH`; a network failure → `own.editOffline` (Doc r31:1439-1442, :1287-1288; `03`
  BR-APP-079).
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1373-1391, :1439-1442, :1287-1288; client
  `src/lib/api/owner.js`, `src/features/owner/OwnerForm.jsx:245-337`.
- **Migration Target:** `PATCH /api/v1/owner/listings/{id}` (native); every save of a published listing is live
  (DEC-80).
- **Tests:** `null` clears a field; a partial body leaves the other fields; `floor > floors_total` →
  `422 invalid:floor`; a point outside the country → `422 invalid:point`; a rented or removed listing → `409`; a
  phone number in `description` is hidden on the public card; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-164, BR-API-165; `03`
  SCR-052, BR-APP-079, LB-APP-055; Q-API-069, Q-API-070.

### API-041 — `POST /api/owner/listings/:id/photos`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/listings/:id/photos`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** path `id`; body `multipart/form-data` with one field `file`, file name `photo.jpg`, one file per call
  (§1.3). Normally it is a JPEG with the long side ≤ 2048 px at quality 0.88; when the client's conversion fails, the
  original file goes up unchanged (`03` LB-APP-061). The timeout is 90 s (§1.6).
- **Validation:** at most 10 photos per listing (`photo:too_many`); the file must be an image (`photo:not_image`)
  within a size limit (`photo:too_big`). The accepted formats and sizes are not documented (Q-API-073). —
  DOCUMENTED_ONLY
- **Business Logic:** appends one photo; the first photo of a listing is its cover (`02` BR-API-166). Whether the
  server re-encodes the upload and strips EXIF and GPS data is not documented (Q-API-073). — DOCUMENTED_ONLY
- **DB Changes:** a photo of the owner listing.
- **Side Effects:** stores the photo and the `.s.jpg` thumbnail that the form expects (Doc r31:1230-1231). How long
  photos are kept is not in the contract; the landing privacy page, an uncommitted working copy at the read, says
  while the listing is in the feed or paused. — UNVERIFIED (Q-API-073)
- **Response:** `200 OwnerListing` with the new photo appended.
- **Errors:** `detail` `photo:too_many` (the client stops the batch), `photo:not_image` and `photo:too_big` (a
  message, and the batch goes on); any other error → a generic message. The client never sends an 11th photo (`03`
  BR-APP-082).
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1443-1445, :1230-1231; client
  `src/lib/api/owner.js:57-70`, `src/features/owner/OwnerForm.jsx:435-524`, `src/features/owner/shrinkPhoto.js:3-26`.
- **Migration Target:** `POST /api/v1/owner/listings/{id}/photos` (native, `HashedUploader`: re-encoded, no
  metadata).
- **Tests:** an 11th photo → `photo:too_many`; a non-image → `photo:not_image`; an oversize file → `photo:too_big`;
  an original with EXIF and GPS data, and a HEIC or PNG sent as `photo.jpg` → record what legacy stores and serves
  (`03` LB-APP-061; Q-API-073); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-166; `03` SCR-052,
  BR-APP-082, LB-APP-061; Q-API-073.

### API-042 — `DELETE /api/owner/listings/:id/photos/:photoId`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** DELETE
- **URL:** `/api/owner/listings/:id/photos/:photoId`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** path ids of the listing and the photo; no body. The client sends it on one tap, without a confirmation
  (`src/features/owner/OwnerForm.jsx:511-524`; `03` LB-APP-067).
- **Validation:** the photo belongs to the listing (assumed). — UNVERIFIED (Q-API-069)
- **Business Logic:** removes the photo at once. On a published listing it probably leaves the public listing at once
  too (`inferred`), and what happens when the last photo of a live listing is deleted is not documented
  (Q-API-070). — DOCUMENTED_ONLY
- **DB Changes:** the photo removed.
- **Side Effects:** none known.
- **Response:** `200 OwnerListing`.
- **Errors:** a generic toast-like line; a network failure → `own.actionOffline`.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1443-1447; client `src/lib/api/owner.js`,
  `src/features/owner/OwnerForm.jsx:511-524`.
- **Migration Target:** `DELETE /api/v1/owner/listings/{id}/photos/{photo}` (native); the Mini App offers an undo first
  (DEV-057).
- **Tests:** deleting the cover makes the next photo the cover; deleting the last photo of an active listing → per
  Q-API-070 (a published listing without a photo breaks the rule of «Дальше»); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-166; `03` BR-APP-082,
  LB-APP-067; Q-API-069, Q-API-070.

### API-043 — `POST /api/owner/listings/:id/photos/order`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/listings/:id/photos/order`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** `{"ids": [cover, ...rest]}` — always the full order, with the new cover first
  (`src/features/owner/OwnerForm.jsx:492-510`).
- **Validation:** not documented. — UNVERIFIED (Q-API-069)
- **Business Logic:** stores the order of the photos; the first id becomes the cover (`02` BR-API-166). —
  DOCUMENTED_ONLY
- **DB Changes:** the order of the listing's photos.
- **Side Effects:** none known.
- **Response:** `200 OwnerListing`.
- **Errors:** a message line in the photos section of the form.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1443-1447; client `src/lib/api/owner.js`,
  `src/features/owner/OwnerForm.jsx:492-510`.
- **Migration Target:** `PUT /api/v1/owner/listings/{id}/photos/order`
  (native).
- **Tests:** ids that do not match the listing's photos → refused (`422` expected; record legacy); the order is kept
  as sent; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-166; `03` BR-APP-082; Q-API-069.

### API-044 — `POST /api/owner/listings/:id/contact_mode`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/listings/:id/contact_mode`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** `{"mode": "gate" | "open"}`. The client applies the choice at once and rolls it back on an error (`03`
  BR-APP-086).
- **Validation:** the two values. — UNVERIFIED (Q-API-069)
- **Business Logic:** sets how seekers reach the owner. `gate` hides the number, and seekers send a request
  (API-054); `open` shows the number on the card to everyone. The value is `null` until the owner chooses, publishing
  does not require a choice, and the mode of a listing published without one is unknown (`02` BR-API-173; `03`
  LB-APP-056; Q-API-078). — DOCUMENTED_ONLY
- **DB Changes:** the listing's `contact_mode`.
- **Side Effects:** changes what seekers see on the public card (`ListingDetails.contact_mode`, API-008).
- **Response:** `200 OwnerListing`, which replaces the client's copy.
- **Errors:** the previous choice comes back, with an error haptic and an error line in the footer.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1448-1449, :1365; client `src/lib/api/owner.js`,
  `src/features/owner/OwnerForm.jsx:644-667`.
- **Migration Target:** `PUT /api/v1/owner/listings/{id}/contact-mode` (`request` or `phone`; a new listing starts in
  `request`, DEV-055).
- **Tests:** both values are accepted; any other value → `422` (record legacy); a mode change on an active listing
  changes `contact_mode` of the public card (API-008); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-173; `03` SCR-055,
  BR-APP-086, LB-APP-056; Q-API-069, Q-API-078.

### API-045 — `POST /api/owner/listings/:id/publish`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/listings/:id/publish`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** path `id`; no body. The client first sends the unsaved fields (API-040). The same call saves the edits of
  a listing that is already published (Doc r31:1450-1451).
- **Validation:** the required fields, the confirmed phone, the apartment limit and the state of the listing. A
  refusal names what is missing as `missing:<fields>`, from `city`, `place`, `rooms`, `price`, `photos`, `phone`,
  `limit`, `status` (Doc r31:1450-1454). — DOCUMENTED_ONLY
- **Business Logic:** checks the same required fields as the client, the confirmed phone (`missing:phone`) and the
  apartment limit, and runs the phone checks that end in `rejected:<reason>`. Then the listing becomes visible in the
  feed and goes to the matching radars at once: the done screen says «уже уходит тем, у кого включён радар», and the
  stats count `sent` as «получили по радару» (`inferred` from these texts; `02` BR-API-175; Q-API-071). The contract
  names **no check of photos or description** before a listing goes live; `withdrawn` (after complaints) and `held`
  (by support) are the only later controls (`02` BR-API-174, BR-API-177; Q-API-071). — DOCUMENTED_ONLY; the feed and
  radar part UNVERIFIED (Q-API-071)
- **DB Changes:** on a first publish `status: "active"`, `published_at` and `listing_id` (`inferred`). — UNVERIFIED
  (Q-API-070)
- **Side Effects:** the listing enters the feed and goes to the matching radars (`inferred`; the radar push is `04`
  BOT-081). — UNVERIFIED (Q-API-071)
- **Response:** `200 OwnerListing`; for a new listing with `status: "active"`, `published_at` and `listing_id`
  (`inferred`).
- **Errors:** `detail` `missing:<fields>`; `status:…` with `409` → the listing can no longer be edited;
  `rejected:<reason>` with `agent`, `fraud` or `limit` (Doc r31:1450-1454). What the client shows for each is `03`
  BR-APP-087.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1450-1454; client `src/lib/api/owner.js`,
  `src/features/owner/OwnerForm.jsx:668-741`; the text `src/features/owner/owner.js:131`.
- **Migration Target:** `POST /api/v1/owner/listings/{id}/publish` (native; post-moderation, DEC-73); the phone window
  is `POST …/phone-request`.
- **Tests:** a draft without a phone → `missing:phone`; at the limit → `missing:limit`; a realtor's phone →
  `rejected:agent` and `status: "rejected"`; publishing a listing that is already published saves the edits and keeps
  `published_at`; a paused listing → per Q-API-070; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-174, BR-API-175,
  BR-API-177; `03` SCR-055, SCR-056, BR-APP-087; Q-API-070, Q-API-071.

### API-046 — `POST /api/owner/listings/:id/status`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/listings/:id/status`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** `{"status": "active" | "paused" | "rented" | "removed"}`. The client asks for a confirmation before
  `rented` and `removed` (`03` BR-APP-088).
- **Validation:** the four values; which transitions the server refuses is not documented. — UNVERIFIED (Q-API-070)
- **Business Logic:** known from the Mini App's texts only (`inferred`; `02` BR-API-176). `paused` takes the listing
  out of the feed and the radars («в ленту и радар не уходит»). `active` puts it back. `rented` takes it out of the
  feed and tells the seekers who still wait that the flat is let: their requests become `cancelled`, «Квартира сдана»
  (`src/features/owner/owner.js:203`, `:240`). `removed` withdraws a listing or deletes a draft. The client offers no
  way out of `rented` or `removed`. It also hides «Вернуть» for a `held` listing, one paused by support
  (`src/features/owner/OwnerListings.jsx:86-87`); whether the server refuses `active` there is not documented (`02`
  BR-API-177). — UNVERIFIED (Q-API-070)
- **DB Changes:** the listing's `status`; with `rented`, the waiting requests become `cancelled` (`inferred`). —
  UNVERIFIED (Q-API-070)
- **Side Effects:** with `rented`, a bot message to the seekers whose requests still wait (`04` BOT-090; not
  observed). — UNVERIFIED (Q-BOT-048 in `04`)
- **Response:** `200 OwnerListing`. In «Мои объявления» a removed draft leaves the list.
- **Errors:** an error haptic and the toast `own.actionOffline` or `common.saveFailed` (`03` BR-APP-088).
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1455-1457, :1358-1359; client
  `src/lib/api/owner.js`, `src/features/owner/OwnerListings.jsx:322-361`, `src/features/owner/OwnerPanel.jsx:87-113`.
- **Migration Target:** `PUT /api/v1/owner/listings/{id}/status`; a draft or a rejected listing is deleted with `DELETE
  …/{id}` (DEV-056).
- **Tests:** `active` on a `held` listing → refused; `rented` closes the waiting requests and tells those seekers
  through the bot; `removed` on a draft deletes it; the transitions out of `rented` and `removed` → refused (record
  legacy for all four, Q-API-070); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (the effect of each status is `UNVERIFIED`,
  Q-API-070). Related: `02` BR-API-176, BR-API-177; `03` SCR-057, SCR-059, BR-APP-088, LB-APP-059; Q-API-070.

### API-047 — `GET /api/owner/pending`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** GET
- **URL:** `/api/owner/pending`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated. The client calls it for every user, also for those who never listed a flat
  (`03` LB-APP-066).
- **Input:** none. Sent at app start, on every return to the app (`visibilitychange`) and after cabinet actions (`03`
  BR-APP-091; §1.6).
- **Validation:** auth only.
- **Business Logic:** the number of requests that wait for the caller's answer as an owner. — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {"pending": number}`; `pending` must always be a number (Doc r31:1289; `02` BR-API-179). It
  drives the red dot on the Settings tab, the tab tip and the counter of the Settings row (`03` SCR-060).
- **Errors:** ignored silently.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1289, :1460-1462; client `src/lib/api/owner.js`,
  `src/lib/ownerPending.js:6-57`, `src/app/App.jsx:141-147`.
- **Migration Target:** Not built: the count is `owner.pending` of `GET /api/v1/me` (fix of
  LB-APP-066).
- **Tests:** a user without owner listings → `{"pending": 0}`; the count equals the sum of `stats.pending` of the
  user's listings; the body always has a numeric `pending`; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-179; `03` SCR-006, SCR-032,
  SCR-060, BR-APP-091, LB-APP-066.

### API-048 — `GET /api/owner/requests`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** GET
- **URL:** `/api/owner/requests` (query `owner_listing_id=<id>`)
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing.
- **Input:** query `owner_listing_id=<id>`, or no query for all requests of the caller (`src/lib/api/owner.js:122-127`).
  The client uses only the per-listing form.
- **Validation:** the listing belongs to the caller (assumed). — UNVERIFIED (Q-API-069)
- **Business Logic:** lists the requests that seekers sent to the owner's listing (API-054). `status` moves by the
  owner's answers (API-049), by time (`expired`) and by `rented` (`cancelled`). The server computes `can_reason`,
  `can_undo` and `can_late`, by which it decides which answers the owner may still give (`02` BR-API-180). `name` is
  the seeker's Telegram name. Whether it is stored with the request or read from Telegram when the list is shown is
  UNVERIFIED: the contract does not say, and the landing privacy page, an uncommitted working copy at the read, says
  the name is not stored (Q-API-077). The order of the list is not documented (Q-API-075). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 OwnerRequest[]` (§1.8; Doc r31:1463).
- **Errors:** an error state with a retry.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1413-1427, :1463; client
  `src/lib/api/owner.js:122-127`, `src/features/owner/OwnerListings.jsx:477-479`,
  `src/features/owner/OwnerPanel.jsx:271`.
- **Migration Target:** `GET /api/v1/owner/listings/{id}/requests` (native, cursor list; the form per listing
  only).
- **Tests:** only requests to the caller's own listings; `who` only from the list of §1.8; the order (newest first?)
  → record legacy (Q-API-075); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-159, BR-API-180; `03`
  SCR-058, BR-APP-090, LB-APP-064; Q-API-069, Q-API-075, Q-API-077.

### API-049 — `POST /api/owner/requests/:id`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/requests/:id`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated; the owner of the listing the request was sent to.
- **Input:** path `id` of a request; body
  `{"action": "give" | "decline" | "reason_found" | "reason_agent" | "undo" | "late"}`. The client sends one action
  at a time and asks for no confirmation, not even before «Дать номер» (`03` BR-APP-090).
- **Validation:** `409` when the action is no longer possible. Which actions each status allows is not documented. —
  UNVERIFIED (Q-API-075)
- **Business Logic:** known from the Mini App's texts only (`src/features/owner/owner.js:219-234`; `inferred`; `02`
  BR-API-181):
  - `give` — «Номер отправили — человек позвонит вам сам». The bot sends the owner's number to the seeker at once.
  - `decline` — «Через 10 минут мягко ответим, что номер вы дать не готовы, и покажем похожие». A soft refusal with
    similar listings goes out after 10 minutes; the same 10 minutes are the window of `undo`.
  - `reason_found`, `reason_agent` — an optional reason after `decline`. `reason_agent` marks the seeker as a
    realtor: «на ваши квартиры он больше не напишет», so the seeker can no longer write to this owner's flats.
  - `late` — after `give`, "turned out to be a realtor" (`agent_marked`), with the same block.
  - `undo` — inside the window it takes the last action back («отклик снова ждёт ответа»); for a `given` request it
    removes the mark (`own.unmarked`). What `undo` does for each status is not documented.

  — UNVERIFIED (Q-API-075, Q-API-077)
- **DB Changes:** the status and the marks of the request; the block of a seeker marked by `reason_agent` or `late`
  (`inferred`). — UNVERIFIED (Q-API-077)
- **Side Effects:** bot messages to the seeker — the number after `give` (`04` BOT-088) and the delayed soft refusal
  after `decline` (`04` BOT-089) — and the seeker's `my_request` on the card (API-008). None was observed. —
  UNVERIFIED (Q-BOT-048 in `04`)
- **Response:** `200` with the updated `OwnerRequest`. When the answer has no `name`, the client keeps the old one.
- **Errors:** `409` → the client reloads the list; for `undo` it also shows «Отменить уже нельзя: прошло больше 10
  минут»; any other error → a toast (Doc r31:1464-1466; `03` BR-APP-090).
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1464-1466; client `src/lib/api/owner.js`,
  `src/features/owner/OwnerListings.jsx:493-560`; the texts `src/features/owner/owner.js:219-234`.
- **Migration Target:** `POST /api/v1/owner/requests/{id}/answer` (native,
  WP-85).
- **Tests:** `give` delivers exactly one bot message with the number; `decline` and then `undo` within 10 minutes
  sends nothing to the seeker; `undo` after 10 minutes → `409`; `late` on a request that was not `given` → `409`; a
  seeker marked `agent` cannot send a new request to the same owner (record legacy for all five, Q-API-075,
  Q-API-077); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (the effect of each action is `UNVERIFIED`,
  Q-API-075). Related: `02` BR-API-181; `03` SCR-058, BR-APP-090; Q-API-075, Q-API-077.

### API-050 — `POST /api/owner/waitlist`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/waitlist`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated. The client offers it only on the rejection screen of a number refused as a
  realtor's, reason `agent` (`03` SCR-054).
- **Input:** none (no body).
- **Validation:** not documented; that only a user with an `agent` rejection may call it is `inferred`. — UNVERIFIED
  (Q-API-069)
- **Business Logic:** records the user in a waiting list of realtors (`02` BR-API-182). The Mini App then promises a
  bot message: «Хорошо, напишем в бот, когда откроем.» — DOCUMENTED_ONLY
- **DB Changes:** a waiting-list entry (`inferred`). — UNVERIFIED (Q-API-069)
- **Side Effects:** a later bot message to the list (`04` BOT-091), promised only and never observed. — UNVERIFIED
  (Q-BOT-049 in `04`)
- **Response:** not read by the client (Doc r31:1469-1470).
- **Errors:** an error haptic, and the button stays.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1469-1470; client `src/lib/api/owner.js`,
  `src/features/owner/OwnerForm.jsx:1639-1655`; the text `src/features/owner/owner.js:110`.
- **Migration Target:** `PUT /api/v1/owner/waitlist` (native; `owner.waitlisted` of `GET /me`, fix of
  LB-APP-071).
- **Tests:** a second call does not add a second entry; a user without an `agent` rejection → record legacy; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-182; `03` SCR-054,
  LB-APP-071; Q-API-069; Q-BOT-049 in `04`.

### API-051 — `POST /api/owner/place`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** POST
- **URL:** `/api/owner/place`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** `{"lat", "lon"}`. Two senders. The label under the pin of the place picker: 400 ms after the map stops,
  only for a centre inside the client's rectangle (lat 37–46, lon 55–74), the previous request aborted (`03`
  BR-APP-077). After «Готово»: once more with the point rounded to 5 decimals, to fill the city, the district and the
  landmark (`03` BR-APP-078).
- **Validation:** not documented; whether the server checks the point against the country is unknown (the client
  checks only the rectangle, `03` LB-APP-063). — UNVERIFIED (Q-API-074)
- **Business Logic:** an address lookup for a point; its data source is not documented (`02` BR-API-168; Q-API-074).
  After «Найти меня» the map centre is the user's own position, so that position reaches the server (`inferred` from
  the two code paths; `05` TMA-035). — DOCUMENTED_ONLY
- **DB Changes:** none known; whether the position is stored is not documented (Q-API-074).
- **Side Effects:** none known.
- **Response:** `200 {address?, city?, district_code?, landmark?}`. The client ignores a `city` that meta does not
  know.
- **Errors:** silent: the label becomes `own.pickNoAddr`, and nothing is filled.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1471-1473; client `src/lib/api/owner.js`,
  `src/features/owner/PlacePicker.jsx:63-83`, `src/features/owner/OwnerForm.jsx:565-571`.
- **Migration Target:** `GET /api/v1/owner/place` (native; city and district from HOMI's PostGIS boundaries,
  DEC-79).
- **Tests:** a Tashkent point → `city: "tashkent"` and a district from meta's list; a point outside the country → an
  empty object (the client sends no such point as a label, but its check of «Готово» is only the rectangle); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-168; `03` SCR-051,
  BR-APP-077, BR-APP-078, BR-APP-097, LB-APP-063; Q-API-074.

### API-052 — `GET /api/owner/map-start`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** GET
- **URL:** `/api/owner/map-start`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** none. Sent only for a listing without a point, and awaited for up to 1.5 s; an answer that arrives later
  is ignored (`03` BR-APP-076).
- **Validation:** auth only.
- **Business Logic:** a start view of the place picker for the caller, «примерно по IP» in the words of the client
  (`src/lib/api/owner.js:157`). That the server locates the caller by IP address is `inferred` from this comment;
  whether the position is stored is not documented (`02` BR-API-168). — UNVERIFIED (Q-API-074)
- **DB Changes:** none known.
- **Side Effects:** none known.
- **Response:** `200 {lat, lon, zoom}`. Without it the picker starts at the centre of the form's city at that city's
  `zoom + 1` (API-001; Doc r31:502-505).
- **Errors:** ignored: the picker uses the city centre.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1474-1475, :502-505; client
  `src/lib/api/owner.js:157`, `src/features/owner/OwnerForm.jsx:197-209`.
- **Migration Target:** Not built (DEV-061): the picker starts at the city centre or at the user's own
  location.
- **Tests:** an answer later than 1.5 s is ignored by the client; the answer is never the point 0, 0; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (the IP lookup is `UNVERIFIED`, Q-API-074).
  Related: `02` BR-API-168; `03` SCR-051, BR-APP-076; Q-API-074.

### API-053 — `GET /api/owner/demand`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-45` at r31).
- **Method:** GET
- **URL:** `/api/owner/demand`
- **Auth:** `tma` required.
- **Roles/access mode:** authenticated.
- **Input:** query `city=<code>[&district=<code>][&room=true | &rooms=<n>][&price=<n>&currency=<USD|UZS>]`, in this
  order. Sent 500 ms after a change of one of those fields, the previous request aborted, and never without a city
  (`03` BR-APP-083).
- **Validation:** not documented. — UNVERIFIED (Q-API-069)
- **Business Logic:** `count` is the number of active radars that match the flat («ищут N человек с радаром»); the
  usual range is the typical price for the rooms and the place, in USD whatever the form's currency (`02`
  BR-API-169). — DOCUMENTED_ONLY
- **DB Changes:** none.
- **Side Effects:** none.
- **Response:** `200 {count, usual_low_usd, usual_high_usd}` (Doc r31:1476-1479). The client shows the demand line
  for `count > 0`, and the usual price only with both bounds and a rooms choice.
- **Errors:** silent.
- **Legacy Source:** Doc r31:142-158 (registry #37 – #53), Doc r31:1476-1479; client
  `src/lib/api/owner.js:165-184`, `src/features/owner/OwnerForm.jsx:347-369`.
- **Migration Target:** `GET /api/v1/owner/demand` (native; the usual price from harvested medians,
  DEC-78).
- **Tests:** no matching radar → `count: 0`; with too little data both bounds are `null`, and the hint hides;
  `currency=UZS` does not change the USD bounds; auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY`. Related: `02` BR-API-169; `03` SCR-052,
  SCR-056, BR-APP-083; Q-API-069.

### API-054 — `POST /api/listings/:id/contact`

- **Since:** release `index-CBlEKxdL.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:14-15` at r31).
- **Method:** POST
- **URL:** `/api/listings/:id/contact`
- **Auth:** `tma` required.
- **Roles/access mode:** a seeker on an owner's listing in gate mode: the card has `owner_self`,
  `contact_mode: "gate"` and no `phone` (API-008; `03` BR-APP-098). The bot must be able to write to the user:
  `409 no_chat` is answered **before** a request is created (Doc r31:837-838, :1290; `02` BR-API-184).
- **Input:** path `id` of the listing; JSON body `{who, people, move_in, message}` — `who` one of
  `one | couple | family | students | friends` (required; the client never sends without it), `people` 1…20,
  `move_in` at most 32 characters or `null`, `message` at most 500 characters or `null` (Doc r31:833-836). The client
  trims both texts and sends an empty one as `null` (`03` BR-APP-099).
- **Validation:** the server's own checks of the body are not documented; the contract asks about limits itself (Doc
  r31:1321-1322). — UNVERIFIED (Q-API-076)
- **Business Logic:** creates the seeker's request. The owner sees it in the bot and in «Мои объявления» (Doc
  r31:821-822) and gives the number or declines from there (API-049; Doc r31:1464-1465). The answer reaches the seeker
  in the bot (`src/i18n/locales/ru.js:619-620`, `:646`). The limits are the server's; the Mini App's texts name 10
  requests a day, 30 a week and a 10-minute pause after several in a row (`02` BR-API-185; `03` LB-APP-057). What
  `given` delivers to the seeker — the number in the bot, on the card, or both — is UNVERIFIED: the client only
  expects `phone` on the card it reads again (Doc r31:390-391; Q-API-076). — DOCUMENTED_ONLY
- **DB Changes:** a request row; counters for the limits and for `response_minutes` (`inferred`). — UNVERIFIED
  (Q-API-075, Q-API-076)
- **Side Effects:** a bot message to the owner (`04` BOT-087; `inferred`, not observed). — UNVERIFIED (Q-BOT-048 in
  `04`)
- **Response:** `200 {"status": "pending" | …}`; the value becomes `my_request` of the card (Doc r31:835; `02`
  BR-API-183, BR-API-186). The parity mock answers `pending` (`tools/parity/mocks.mjs:295`). Which other values occur
  at creation, for example an immediate `given`, is UNVERIFIED (Q-API-075).
- **Errors:** by `detail`; the sheet shows one line of text (`src/i18n/locales/ru.js:636-644`;
  `src/features/listing/ContactRequestSheet.jsx:25-26`, `:71-80`):

  | `detail` | Text shown | Client effect |
  | -------- | ---------- | ------------- |
  | `no_chat` (409) | the write-access request and one repeat; if it still fails, «Ответ хозяина придёт в бот — разрешите боту писать вам и отправьте ещё раз.» | `chat_access_*` events; may offer to open the bot |
  | `limit_fast` | «Несколько откликов подряд — следующий можно будет отправить через 10 минут.» | none |
  | `limit_day` | «Сегодня вы уже отправили 10 откликов. Завтра можно снова.» | none |
  | `limit_week` | «За неделю — 30 откликов, это предел. Новые можно будет отправить через несколько дней.» | none |
  | `blocked` | «Отклики для вашего аккаунта сейчас закрыты. Если это ошибка, напишите в поддержку.» | none |
  | `harvest` | the same text as `blocked` (the user is not told that it is an anti-harvesting block) | none |
  | `closed` | «Хозяин уже не принимает отклики — квартиру, скорее всего, сдали.» | none (`03` LB-APP-073) |
  | `own` | «Это ваша квартира.» | none (`03` LB-APP-073) |
  | `open` | «Хозяин открыл номер — обновите карточку и позвоните.» | none (`03` LB-APP-073) |
  | other | «Не получилось сохранить» | none |

  The HTTP statuses of the `detail` codes other than `no_chat` are UNVERIFIED (Q-API-076).
- **Legacy Source:** Doc r31:159 (registry #54), Doc r31:818-839, :1290; client `src/lib/api/owner.js:191-192`,
  `src/features/listing/ContactRequestSheet.jsx:50-85`, `src/lib/chatAccess.js:27-55`; parity mock
  `tools/parity/mocks.mjs:295`. All client paths at r31.
- **Migration Target:** `POST /api/v1/listings/{number}/contact-request` (native; relayed for a legacy listing, DEC-71,
  WP-87).
- **Tests:** a record of the legacy contract — `no_chat` comes before the request is created, and the repeat creates
  one request; each `detail` code; a `who` outside the list is refused; a second request to the same listing
  (accepted again or `409`? UNVERIFIED, Q-API-075); the limits count per user (Q-API-076); auth.
- **Status:** Contract `CONFIRMED`; server logic `DOCUMENTED_ONLY` (the parts marked UNVERIFIED above: Q-API-075,
  Q-API-076). Related: `02` BR-API-183 … BR-API-187; `03` SCR-018, SCR-061, BR-APP-098, BR-APP-099, LB-APP-057,
  LB-APP-073, LB-APP-074, LB-APP-076; `05` TMA-033; Q-API-075, Q-API-076.

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

All 55 registry methods of the pinned release (`$KVADRO_ROOT/docs/api.md:109-163` at r35; 54 at `index-CBlEKxdL.js`,
`:106-159` at r31; 36 at `index-BnFvC-Ft.js`, `:106-141` at r31; 35 at `index-DY_DH7h-.js`, `:102-138` at r27; 34 at
the audit, `:102-137`) are called by the client. None is documented-but-unused. "Doc #" is the registry number of the
pinned release: since release `index-DY_DH7h-.js` `/api/feed/new` is #7, since `index-BnFvC-Ft.js`
`/api/settings/card-sample` stands after `PUT /api/settings` (#27 then, #28 now), since `index-CIa0Ldj2.js`
`DELETE /api/listings/:id/report` is #18, and every later method moved down by one each time. Release
`index-CBlEKxdL.js` added the 17 owner methods and the contact request at the end, #37 – #54 then (`:142-159` at
r31) and #38 – #55 now. The registry at r35 lists the owner methods in the order of the rows below (`:146-162`), and
the contact request after them (`:163`). Rows 38 – 55 cite client files at r31; `OwnerForm.jsx`, `OwnerListings.jsx`,
`OwnerPanel.jsx` and `PlacePicker.jsx` are under `src/features/owner/`, and the wrapper file is written in full
because a second `owner.js`, the cabinet's dictionary, lies in that folder. Row 18 and the additions of release
`index-CIa0Ldj2.js` to other rows cite client files at r33.

| Doc # | Method | Path | ID | In client | Wrapper | Call sites |
| ----: | ------ | ---- | -- | --------- | ------- | ---------- |
| 1 | GET | `/api/meta` | API-001 | yes | `meta.js:5` | `main.jsx:24`, `useAppBootstrap.js:70` |
| 2 | GET | `/api/cities` | API-002 | yes | `meta.js:8` | `useAppBootstrap.js:125`, `App.jsx:169` |
| 3 | GET | `/api/bot` | API-003 | yes | `meta.js:15` | `index.html:95`, `NoAccessScreen.jsx:31`, `SettingsScreen.jsx:65`, `ListingActionsSheet.jsx:46` |
| 4 | GET | `/api/feed` | API-004 | yes | `feed.js:75-93` | `main.jsx:25`, `useInfiniteFeed.js:36`, `useRadarPreviews.js:42` |
| 5 | GET | `/api/feed/count` | API-005 | yes | `feed.js:100` | `useLiveFeedStats.js:16`, `useRadarPreviews.js:52` |
| 6 | GET | `/api/feed/flow` | API-006 | yes | `feed.js:110` | `useLiveFeedStats.js:38`, `useRadarPreviews.js:59`, `useFollowNudge.js:63` |
| 7 | GET | `/api/feed/new` | API-035 | yes | `feed.js:111-117` | `useReturnNudge.js:117` (at the pin); since release `index-CIa0Ldj2.js` also the fresh pill, `App.jsx:438-468` (at r33) |
| 8 | GET | `/api/map` | API-007 | yes | `feed.js:119` | `gl/useMapPoints.js:15`, `leaflet/MapView.jsx:154` |
| 9 | GET | `/api/listings/:id` | API-008 | yes | `listings.js:10-17` | `main.jsx:38`, `useListingLoader.js:47`, `MapSelectionCard.jsx:29` |
| 10 | GET | `/api/listings/:id/call` | API-009 | yes | `listings.js:23` | `useListingContact.js:26` |
| 11 | POST | `/api/listings/:id/translate` | API-010 | yes | `listings.js:29` | `useListingTranslation.js:32` |
| 12 | POST | `/api/listings/:id/favorite` | API-011 | yes | `listings.js:38` (`:39-45` at r33) | `FavButton.jsx:27` (`:20-37` at r33) |
| 13 | POST | `/api/listings/:id/hide` | API-012 | yes | `listings.js:47` | `ListingActionsSheet.jsx:71` |
| 14 | DELETE | `/api/listings/:id/hide` | API-013 | yes | `listings.js:56` | `useListingActions.js:51`, `:62`, `HiddenScreen.jsx:53` |
| 15 | POST | `/api/listings/:id/block-author` | API-014 | yes | `listings.js:65` | `ListingActionsSheet.jsx:79` |
| 16 | DELETE | `/api/listings/:id/block-author` | API-015 | yes | `listings.js:74` | `useListingActions.js:59` |
| 17 | POST | `/api/listings/:id/report` | API-016 | yes | `listings.js:84` | `ListingActionsSheet.jsx:89` |
| 18 | DELETE | `/api/listings/:id/report` | API-055 | yes | `listings.js:87-90` | `useListingActions.js:36-50` |
| 19 | POST | `/api/listings/:id/share` | API-017 | yes | `listings.js:97` | `ListingTitleRow.jsx:35` |
| 20 | GET | `/api/subscriptions` | API-018 | yes | `subscriptions.js:5` | `App.jsx:175`, `subscriptionActions.js:95`, `RadarScreen.jsx:58`, `SettingsScreen.jsx:60`; since release `index-CIa0Ldj2.js` also `useAppBootstrap.js:135-149` (at r33) |
| 21 | POST | `/api/subscriptions` | API-019 | yes | `subscriptions.js:13` | `subscriptionActions.js:131` |
| 22 | PUT | `/api/subscriptions/:id` | API-020 | yes | `subscriptions.js:29` | `subscriptionActions.js:163` |
| 23 | PATCH | `/api/subscriptions/:id` | API-021 | yes | `subscriptions.js:56` | `subscriptionActions.js:108`, `RadarScreen.jsx:99`, `:134`, `:151` |
| 24 | DELETE | `/api/subscriptions/:id` | API-022 | yes | `subscriptions.js:66` | `RadarScreen.jsx:172` |
| 25 | POST | `/api/subscriptions/:id/relax` | API-023 | yes | `subscriptions.js:43` | `subscriptionActions.js:72` |
| 26 | GET | `/api/settings` | API-024 | yes | `settings.js:5` | `SettingsScreen.jsx:59`, `RadarSheet.jsx:52` |
| 27 | PUT | `/api/settings` | API-025 | yes | `settings.js:11` (`:20-24` at r29) | `LanguagePicker.jsx:32`, `city.js:23`, `SettingsScreen.jsx:91`, `:105`, `:119` |
| 28 | POST | `/api/settings/card-sample` | API-036 | yes | `settings.js:11-14` (at r29) | `SettingsScreen.jsx:165` (at r31) |
| 29 | GET | `/api/hidden` | API-026 | yes | `user.js:5` | `SettingsScreen.jsx:64` |
| 30 | DELETE | `/api/hidden/:id` | API-027 | yes | `user.js:11` | `HiddenScreen.jsx:45` |
| 31 | DELETE | `/api/hidden` | API-028 | yes | `user.js:17` | `HiddenScreen.jsx:62` |
| 32 | GET | `/api/favorites` | API-029 | yes | `user.js:23` (`:26-27` at r33) | `useInfiniteFeed.js:33` (`:31-42` at r33) |
| 33 | GET | `/api/history` | API-030 | yes | `user.js:26` | `useInfiniteFeed.js:35` |
| 34 | DELETE | `/api/history` | API-031 | yes | `user.js:29` | `ListingFeed.jsx:96` |
| 35 | POST | `/api/found` | API-032 | yes | `found.js:9` | `FoundSheet.jsx:95` |
| 36 | POST | `/api/found/where` | API-033 | yes | `found.js:22` | `FoundSheet.jsx:112` |
| 37 | POST | `/api/events` | API-034 | yes | `events.js:9`, `:25` | `index.html:77`, `errors.js:80`, 15 `trackEvent` sites at the audit, 20 at the pin, one more since release `index-CBlEKxdL.js` (the owner chip, `OwnerChip.jsx:54-62` at r31), and the sites of the six owner events since release `index-CIa0Ldj2.js` (§2 API-034) |
| 38 | GET | `/api/owner/listings` | API-037 | yes | `src/lib/api/owner.js` | `SettingsScreen.jsx:101-107`, `OwnerListings.jsx:307-320`, `:352`, `OwnerForm.jsx:214-219` |
| 39 | POST | `/api/owner/listings` | API-038 | yes | `src/lib/api/owner.js:30-34` | `OwnerForm.jsx:183-238` |
| 40 | GET | `/api/owner/listings/:id` | API-039 | yes | `src/lib/api/owner.js` | `OwnerForm.jsx:183-238`, `:708-721`, `:1484-1620`, `OwnerPanel.jsx` |
| 41 | PATCH | `/api/owner/listings/:id` | API-040 | yes | `src/lib/api/owner.js` | `OwnerForm.jsx:245-337` |
| 42 | POST | `/api/owner/listings/:id/photos` | API-041 | yes | `src/lib/api/owner.js:57-70` | `OwnerForm.jsx:435-524` |
| 43 | DELETE | `/api/owner/listings/:id/photos/:photoId` | API-042 | yes | `src/lib/api/owner.js` | `OwnerForm.jsx:511-524` |
| 44 | POST | `/api/owner/listings/:id/photos/order` | API-043 | yes | `src/lib/api/owner.js` | `OwnerForm.jsx:492-510` |
| 45 | POST | `/api/owner/listings/:id/contact_mode` | API-044 | yes | `src/lib/api/owner.js` | `OwnerForm.jsx:644-667` |
| 46 | POST | `/api/owner/listings/:id/publish` | API-045 | yes | `src/lib/api/owner.js` | `OwnerForm.jsx:668-741` |
| 47 | POST | `/api/owner/listings/:id/status` | API-046 | yes | `src/lib/api/owner.js` | `OwnerListings.jsx:322-361`, `OwnerPanel.jsx:87-113` |
| 48 | GET | `/api/owner/pending` | API-047 | yes | `src/lib/api/owner.js` | `ownerPending.js:6-57`, `App.jsx:141-147` |
| 49 | GET | `/api/owner/requests` | API-048 | yes | `src/lib/api/owner.js:122-127` | `OwnerListings.jsx:477-479`, `OwnerPanel.jsx:271` |
| 50 | POST | `/api/owner/requests/:id` | API-049 | yes | `src/lib/api/owner.js` | `OwnerListings.jsx:493-560` |
| 51 | POST | `/api/owner/waitlist` | API-050 | yes | `src/lib/api/owner.js` | `OwnerForm.jsx:1639-1655` |
| 52 | POST | `/api/owner/place` | API-051 | yes | `src/lib/api/owner.js` | `PlacePicker.jsx:63-83`, `OwnerForm.jsx:565-571` |
| 53 | GET | `/api/owner/map-start` | API-052 | yes | `src/lib/api/owner.js:157` | `OwnerForm.jsx:197-209` |
| 54 | GET | `/api/owner/demand` | API-053 | yes | `src/lib/api/owner.js:165-184` | `OwnerForm.jsx:347-369` |
| 55 | POST | `/api/listings/:id/contact` | API-054 | yes | `src/lib/api/owner.js:191-192` | `ContactRequestSheet.jsx:50-85` |

### 4.2 Client requests → documentation

Search performed over `$KVADRO_ROOT/demo/app/src` and `index.html` for `apiFetch`, `prefetch`, `fetch(`,
`sendBeacon`, `XMLHttpRequest`, `'/api/`, `/media`, `/tiles`, `/call`, `import(`; and over
`$KVADRO_ROOT/demo/landing/site` for `fetch(`, `XMLHttpRequest`, `data/`, `/api/`. `sendBeacon` is not used anywhere.

| Client request | Where | Documented in | Result |
| -------------- | ----- | ------------- | ------ |
| 55 `apiFetch` methods at the pinned release (54 at `index-CBlEKxdL.js`, 36 at `index-BnFvC-Ft.js`, 35 at `index-DY_DH7h-.js`, 34 at the audit) | `src/lib/api/*.js` | Doc §2 | documented (API-001 … API-055) |
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
| 1 | `404` on `GET /api/listings/:id` | screen «объявление недоступно» (Doc:74) | up to `index-CBlEKxdL.js` `listing.loadFailed` = «Объявление не загрузилось» (`ListingScreen.jsx:115-116`, `ru.js:156`); since release `index-CIa0Ldj2.js` `listing.gone` = «Этого объявления уже нет — квартиру, похоже, сдали или продали» with «Смотреть свежие», and nothing uses `listing.loadFailed` any more (`ListingScreen.jsx:175-201` at r33; Doc r35:712-714 states the new screen) | code text |
| 2 | Error body | always `{"detail": "…"}` string (Doc:56-62) | client reads only string `detail` (`client.js:88-96`); legacy `422` has an array `detail` (`about.md:108`) | both shapes exist; client tolerant |
| 3 | Phone exposure | «номера телефонов открываются только через временные ссылки звонка» (`about.md:349`) | `ListingDetails.phone` is plain `+998…` (Doc:316) and dialled as `tel:${phone}` on Android (`src/lib/telegram/links.js:28`) | the raw number reaches every client (LB-API-030) |
| 4 | Quiet/digest presets | examples `off, 23-08, 22-09` / `09, 09,21, 21` (Doc:846-847, mock) | bot presets `off, 22-08, 23-08, 00-09, 23-07` / `09, 09,19, 12,20, 19` (`telegram-bot.md:990`) | unknown — Q-API-029 |
| 5 | `median_metric` values | `m2 \| person \| string` (Doc:325) | mock uses `unit` (`tools/parity/mocks.mjs:98`); client treats others as per month | compatible |
| 6 | Landing data | «зафиксированные один раз; к API страница не обращается» (`landing.js:60-62`) | files rewritten on a schedule while `DATA_V` stays `202610171944` (`RECOVERY.md:68-70`) | data is live (LB-API-017) |
| 7 | `useMapTilePrefetch` JSDoc | `tiles` "object" (`src/app/useMapTilePrefetch.js:12`) | `meta.tiles` is a string (Doc:443) | string |
| 8 | `entry` JSDoc (release `index-DY_DH7h-.js`) | `'filters' \| 'few' \| 'prompt' \| 'empty'` (`src/app/subscriptionActions.js:92`, `src/lib/api/subscriptions.js:10`) | the app also sends `feed` and `return` (`App.jsx:635`, `:752` at the pin); current Doc:789 lists all six | six values |
| 9 | Undo of «Уже сдано» (release `index-CIa0Ldj2.js`) | the toast action reads «Отменить» (Doc r35:854; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:21` at r36) | `toast.undo` = «Вернуть» / «Undo» / «Qaytarish» (`src/app/useListingActions.js:36-50`, `src/i18n/locales/ru.js:241` at r33) | code text: «Вернуть» |
| 10 | `area_min` / `area_max` per deal (release `index-CIa0Ldj2.js`) | only for `sale` (Doc r35:204-207) | the sheet shows the area range and sends the keys for every deal (`src/features/filters/FiltersSheet.jsx:221`, `src/features/filters/sheet/ExtraSections.jsx:9-42` at r33) | the code decides what is sent; what the server does with the range for rent is Q-API-082 |
| 11 | Error of `GET /api/listings/:id?preview=1` (release `index-CIa0Ldj2.js`) | not shown, the spinner stays (Doc r35:79-80, :709-710) | «Не загрузилось» with «Повторить» in the card slot (`src/features/map/MapSelectionCard.jsx:22-54`, `:111-121` at r33); the map section of the contract says the same (Doc r35:690-691) | code; the two passages are stale |
| 12 | `409` limit on the radar switch (release `index-CIa0Ldj2.js`) | the switch rolls it back silently (Doc r35:83) | rollback and the toast «Не получилось сохранить» (`src/features/radar/RadarScreen.jsx:130-134` at r33) | code (`03` LB-APP-081) |
| 13 | A missing dictionary key (release `index-CIa0Ldj2.js`) | `t()` throws a `TypeError`, so an unknown type breaks the radar screen (Doc r35:204-207) | `t()` and `plural()` return the `ru` entry, or the key itself, and report `app_error` once per key (`src/i18n/index.js:110-125`, `:180-193` at r33); the owner dictionary has no such fallback, so an owner key still throws (`src/features/owner/owner.js:701-707` at r31; `inferred`) | code; the passage holds only for the owner dictionary |
| 14 | Report reason `agent` (release `index-CIa0Ldj2.js`) | not offered when the card says `is_owner: false` (Doc r35:808-809) | also not offered unless `author.kind` is `"phone"` (`src/features/listing/ListingScreen.jsx:389-390`, `src/features/listing/ListingActionsSheet.jsx:177` at r33); the model section of the contract states the new rule (Doc r35:337-341) | code; the passage is stale |

Source comments of release `index-CIa0Ldj2.js` differ from the text shown in one more place:
`src/features/map/MapScreen.jsx:3`, `:43` and `src/features/map/MapSelectionCard.jsx:157` (at r33) say «Не удалось
загрузить», while the string is `common.loadFailed` = «Не загрузилось».

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
| `POST /api/settings/card-sample` (since `index-BnFvC-Ft.js`) | risky: a chat message per tap, no documented rate limit; fragile: a `204` hangs the old client's button | — | `SettingsScreen.jsx:162-171` (at r31); Doc r31:1053-1055 | LB-APP-052, Q-API-067 |
| `POST /api/owner/listings/:id/photos` (since `index-CBlEKxdL.js`) | risky: when the client's conversion fails, the original file goes up unconverted, with its EXIF and GPS data | — | `src/features/owner/shrinkPhoto.js:13-25`, `src/lib/api/owner.js:57-59` (at r31) | LB-APP-061, Q-API-073 |
| `POST /api/owner/place`, `GET /api/owner/map-start` (since `index-CBlEKxdL.js`) | risky: the user's position as a map centre, and a location «примерно по IP» | — | `src/features/owner/PlacePicker.jsx:63-83`, `:139-140`, `src/lib/api/owner.js:157` (at r31) | Q-API-074; `05` TMA-035 |
| `GET /api/owner/pending` (since `index-CBlEKxdL.js`) | risky: load (one request per user at every launch and every return to the app, also for users without a listing) | — | `src/app/App.jsx:141`, `src/lib/ownerPending.js:40-55` (at r31) | LB-APP-066 |
| `POST /api/listings/:id/contact` (since `index-CBlEKxdL.js`) | risky: a chat message to a third person per call; the limits exist only on the server | — | Doc r31:820-822, :838-839 | BR-API-185, Q-API-076 |
| `GET /api/owner/requests` (since `index-CBlEKxdL.js`) | risky: personal data (the seeker's Telegram name shown to the owner) | — | Doc r31:1413-1427 | Q-API-077 |
| `POST /api/owner/listings` (since `index-CBlEKxdL.js`) | risky: a new draft per call, with no documented reuse | — | `src/lib/api/owner.js:30-34` (at r31); Doc r31:1434-1435 | LB-APP-054, Q-API-068 |
| `DELETE /api/listings/:id/report` (since `index-CIa0Ldj2.js`) | risky: undoes a vote that may already have acted for other users; the answer to a repeat is not documented | — | Doc r35:860-864, :1422-1426; `src/app/useListingActions.js:36-50` (at r33) | API-055, BR-API-190, Q-API-079 |
| `GET /api/favorites` (since `index-CIa0Ldj2.js`) | risky: paged for every caller, while bundles cached before the release never send a cursor and loop on a non-null `next_cursor` (`inferred`) | — | Doc r35:1157-1162, :1400-1401; `src/features/feed/useInfiniteFeed.js:31-42` (at r33) | API-029, LB-API-057, Q-API-084 |
| `GET /api/listings/:id` (since `index-CIa0Ldj2.js`) | risky: a daily cap answered as `429 too many today`, with an unknown threshold, window and counted identity | — | Doc r35:712-714, :1366-1367; `src/lib/api/client.js:29-30` (at r33) | BR-API-193, Q-API-080 |
| `POST /api/listings/:id/translate` | risky: LLM cost per call | — | `useListingTranslation.js:32` | LB-API-032 |
| `GET /api/feed/count`, `/api/feed/flow` | risky: load (live per change + 3 requests per radar) | — | `useLiveFeedStats.js`, `useRadarPreviews.js` | LB-API-038, LB-API-052 |
| `GET /api/feed/new` | fragile: a body without numeric `count` crashes the old client; `since` from the device clock, unbounded | — | `src/app/useReturnNudge.js:112-136` (at the pin) | LB-API-055, Q-API-066 |
| `GET /api/favorites`, `/api/history` | risky: unbounded single page; since `index-CIa0Ldj2.js` only `/api/history`, favourites are paged | — | Doc:930-941; Doc r35:1157-1162 | LB-API-024 |
| `POST /api/listings/:id/favorite` | risky: toggle, not idempotent; since `index-CIa0Ldj2.js` only for a request without a body, the body names the wanted state | — | Doc:636-647; Doc r35:746-766 | LB-API-039, BR-API-197 |
| `/img/snap/<id>.webp` | risky: unsigned copies of third-party photos | — | RES-013 | LB-API-054 |
| `/call/<token>` | risky: phone disclosure surface | — | RES-005 | LB-API-045, Q-API-042 |
| `POST /api/csp-report` | risky: public write sink | — | RES-015 | Q-API-050 |
