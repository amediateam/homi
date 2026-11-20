# 02 — Legacy backend audit (reconstructed)

Part of the kvadro² → HOMI migration audit (rules, labels and ID scheme: `docs/migration/README.md`).

The legacy backend (Python/FastAPI + PostgreSQL/PostGIS per `$KVADRO_ROOT/docs/about.md:101-117`) is **not
available**: no source, no database, no configuration. This document reconstructs the server-side system from the
Mini App contract (`$KVADRO_ROOT/docs/api.md`), the decompiled Mini App (`$KVADRO_ROOT/demo/app/src`), its parity
mocks, the landing mirror (`$KVADRO_ROOT/demo/landing`), and the product, bot and SEO documents. The endpoint-level
contract is in `08-api-inventory.md` (`API-NNN`, `RES-NNN`).

- **Audit date:** 2026-11-09; legacy Mini App release `index-plF_TOcT.js`, brought up to `index-DY_DH7h-.js` (the pin
  of WP-02) and, by the intakes of 2026-11-19, to `index-BnFvC-Ft.js`, to `index-CBlEKxdL.js` (SVN r31) and to
  `index-CIa0Ldj2.js` (source at SVN r33, the previous pin), and by the intake of 2026-11-20 to the pinned release
  `index-YX9bFVws.js` (source at SVN r38; `wave-1/baseline.md`). Items changed for a later release name it. "current
  Doc:" and "at the pin" cite SVN r27; "Doc r31:" cites `$KVADRO_ROOT/docs/api.md` at r31, and the client files of
  §12a are cited at r31 too. "Doc r35:" cites `$KVADRO_ROOT/docs/api.md` at r35, the state of release
  `index-CIa0Ldj2.js`; the client files in text of the intake of `index-CIa0Ldj2.js` are cited at r33. "Doc r38:" cites
  `$KVADRO_ROOT/docs/api.md` at r38, the pinned release's own state, and the client files in text of the intake of
  `index-YX9bFVws.js` are cited at r38. Nothing was run
  (`RUNTIME_VERIFIED` is not used).
- **Labels:** `CONFIRMED` — visible in client code or in a contract the code agrees with (for a server rule this means
  the client depends on it or produces it); `DOCUMENTED_ONLY` — stated as fact (✅) in legacy docs, no implementation
  visible; `UNVERIFIED` — 🔶 in legacy docs or our inference, always with a `Q-API` item.
- **IDs:** `BR-API-NNN` business rules (one line each); `LB-API-NNN` legacy bugs, fragile client expectations
  (`bug`, `quirk`) and questionable design decisions (`decision`, §24). Per the developer's policy (2026-11-09) HOMI
  **fixes** legacy bugs and logically wrong decisions instead of reproducing them; every `LB-API` therefore carries a
  **Proposed fix** (a proposal, not approved) and its **Old-client impact** — whether the fix breaks the legacy Mini App
  that keeps running during the transition, and how to stay compatible. `Q-API-NNN` open questions name the check that
  would close them.
- Short references: "Doc" = `$KVADRO_ROOT/docs/api.md`; "About" = `$KVADRO_ROOT/docs/about.md`; "Bot" =
  `$KVADRO_ROOT/docs/telegram-bot.md`; "SEO" = `$KVADRO_ROOT/docs/seo-pages.md`; client paths are relative to
  `$KVADRO_ROOT/demo/app/`.

## 1. System overview

| Component | What is known | Evidence | Status |
| --------- | ------------- | -------- | ------ |
| API server | FastAPI + Pydantic v2: default `404 {"detail":"Not Found"}`, `422` with `literal_error`; module names `app/api/landing_pages.py`, `site_stats.py`, `landing.py`, `area_pages.py` | About:108-109; `demo/app/docs/RECOVERY.md:13` | `DOCUMENTED_ONLY` (framework itself 🔶 → `UNVERIFIED`, Q-API-055) |
| Database | PostgreSQL + PostGIS 3.5.2 (bot `/ping`: «🏓 pong · БД: ок · PostGIS: 3.5.2») | About:110 | `DOCUMENTED_ONLY` |
| Hosts | `app.kvadro.app` (Mini App + `/api` + `/media` + `/tiles` + `/call`), `kvadro.app` (landing, SEO, `/media`), Cloudflare in front | About:116; SEO:375-389; `08` §1.1 | `CONFIRMED` / `DOCUMENTED_ONLY` |
| Bots | `@KvadroAppBot` (main, Mini App, radars), `@KvadroSupportBot` (support) | Doc:493-498; Bot:975 | `CONFIRMED` |
| LLM | Google Gemini: listing field extraction, user query parsing (text and voice), translation, support summaries | About:111, :172-173, :269 | `DOCUMENTED_ONLY` |
| Analytics | PostHog EU; own action log via `/api/events` | About:115, :268 | `DOCUMENTED_ONLY` |
| Jobs | channel reading, parsing, medians (hourly), radar delivery, digests, landing data, retention | About:167-185, :399; SEO:264-275 | `DOCUMENTED_ONLY` / `UNVERIFIED` (§18) |

## 2. Request pipeline

- **BR-API-001** · `CONFIRMED` — All Mini App API calls are same-origin relative `/api/*` requests with JSON bodies;
  no API versioning exists. *Evidence:* Doc:18-22; `src/lib/api/*.js`.
- **BR-API-002** · `CONFIRMED` — The server must answer within the client's 15 s timeout; slower answers surface as
  «Сервер не ответил…» (status 0, `timeout`). *Evidence:* `src/lib/api/client.js:24`, `:103-106`.
- **BR-API-003** · `CONFIRMED` — Mutations are never auto-retried by the client (except one repeat after `no_chat`
  consent), so server-side idempotency is the only protection against double taps and bot/app races. *Evidence:*
  Doc:97-98; `src/lib/chatAccess.js:27-54`.
- **BR-API-193** · `DOCUMENTED_ONLY` — Since release `index-CIa0Ldj2.js` `GET /api/listings/:id` may answer
  `429 {"detail": "too many today"}` when the caller has opened very many listings within a day. The client matches
  that text exactly and shows «Лимит на сегодня»; any other `429` reads as a server error. The threshold, the window,
  the counted identity and whether the preview form counts are not documented; the client's text promises that radar
  alerts continue. *Evidence:* Doc r35:712-714, :1366-1367, :1425; `src/lib/api/client.js:29-30`,
  `src/components/ErrorState.jsx:14-25` (at r33). (Q-API-001, Q-API-080)
- **Q-API-001** — Are there rate limits or `429` responses on any `/api/*` route, and per what key (user id, IP)?
  **Narrowed by release `index-CIa0Ldj2.js`:** a `429` exists on `GET /api/listings/:id` (`too many today`,
  BR-API-193). Still open: every other route, the key and the numbers (Q-API-080).
  *Check:* fire 50 rapid `GET /api/feed/count` requests from a dedicated test account and record statuses/headers; ask
  the legacy owner for the limiter configuration.
- **Q-API-080** — The daily cap behind `429 too many today`: the number of listings, the window ("сутки": a calendar
  day in Asia/Tashkent or 24 hours), the counted identity — the user, the IP address or, for a caller with a service
  key, the key —, whether `?preview=1` and repeated opens of one listing count, whether `Retry-After` is sent, and
  whether radar alerts really continue. Legacy asks about the thresholds itself (Doc r35:1422-1426, open question
  18). *Check:* open distinct listings from one account until the `429` comes, and record the count, the headers and
  the time at which it lifts: the operator's answer; a test account on the legacy product, with the product owner's
  approval.

## 3. Authentication

Known: every `/api/*` request except `GET /api/bot` (and browser-originated `POST /api/csp-report`) carries
`Authorization: tma <initData>`; the server validates the Telegram signature (HMAC-SHA256 with a key derived from the
main bot token) and `auth_date`, and identifies the user by `user.id` (About:337-338, :403; Doc:30-42). The client
never obtains a token or cookie. Names and contacts are not stored; three profile flags (Premium, `@username`
present, photo present) and an account-age estimate from the user id are stored for anti-abuse (About:155).

- **BR-API-004** · `CONFIRMED` — Every protected request is authenticated independently from its own `initData`
  (stateless; no session, cookie, CSRF or bearer token). *Evidence:* `client.js:74-86`; Doc:41-42.
- **BR-API-005** · `DOCUMENTED_ONLY` — `initData` validity = Telegram HMAC with the main bot token + `auth_date`
  freshness; maximum age unknown. *Evidence:* About:337, :403. (Q-API-002)
- **BR-API-006** · `DOCUMENTED_ONLY` — The user key is the Telegram `user.id`; no name, phone or other contact is
  stored for the profile. *Evidence:* About:155.
- **BR-API-007** · `DOCUMENTED_ONLY` — For anti-abuse the profile keeps three booleans (Premium, has `@username`, has
  photo) and an approximate account age derived from the user id. *Evidence:* About:155, :228.
- **BR-API-008** · `DOCUMENTED_ONLY` — `initData` is valid only for the backend holding the same bot token; every
  environment needs its own bot and Mini App. *Evidence:* About:408-413.
- **BR-API-009** · `CONFIRMED` — `GET /api/bot` must work without any `Authorization` header (outside Telegram and for
  gated users). *Evidence:* `src/lib/api/meta.js:15-23`; `index.html:94-102`.
- **BR-API-010** · `CONFIRMED` — Requests carrying `Authorization: tma ` with an empty value (React `app_error`
  without `initData`) must be rejected silently. *Evidence:* Doc:1012-1013; `src/lib/errors.js:101-122`.
- **Q-API-002** — What `auth_date` age does the server accept, and is it enforced on every endpoint? *Check:* with a
  dedicated test account keep the Mini App open (no reload) for 1 h, 24 h and 48 h and call any action; record the
  status; or read the setting from the legacy deployment.
- **Q-API-003** — What status and body does the server return for a missing header, a tampered hash, a stale
  `auth_date` and `initData` signed by another bot (401? 403 `private`?)? *Check:* `curl` `GET /api/meta` in those four
  variants using the test account's own `initData`, record status and body.
- **Q-API-004** — Does the first authenticated request create the user row, and does the API record attribution from
  `start_param` (in `initData`) or only the bot's `/start`? *Check:* open the Mini App from `startapp=l_<id>-web` with
  a brand-new test account that never started the bot, then inspect `/api/meta` (403 `join`?) and ask the owner where
  the source is stored.
- **LB-API-001** · `bug` · `CONFIRMED` — The React app installs global error handlers before checking for `initData`
  and posts `app_error` with `Authorization: tma ` (empty). *Evidence:* `src/lib/errors.js:101-122`,
  `src/lib/telegram/webApp.js:111-125`, `client.js:78`.
  - **Proposed fix:** server answers `401 {"detail":"unauthorized"}` without logging it as an application error and
    without storing the event; the new client sends nothing without `initData`.
  - **Old-client impact:** none — `app_error` is fire-and-forget and its failure is swallowed (`events.js:33`); any
    non-5xx answer keeps the old client unchanged.

## 4. Access modes and closed beta

Known: `GET /api/meta` is the gate. A denied user gets `403 {"detail": <reason>}` with `private` (only the owner may
use the app), `invite` (entry by invitation link + «Старт» in the bot), `full` (beta seats taken), `blocked`, `join`
(press «Старт» in the bot first) and, since release `index-CIa0Ldj2.js`, `paused` (the bot is paused), with its texts
«Бот на паузе», «Скоро вернёмся. Ваши Радары и избранное на месте.» (`src/features/onboarding/NoAccessScreen.jsx:13`,
`:22` at r33; Doc r35:69-75). Whether restrictions are active for new users today is not visible (About:248-252).
The mode and owner list are server configuration (About:453). UI texts: «Приложение сейчас доступно только
владельцу.», «Войти можно по ссылке-приглашению: откройте её и нажмите «Старт» в боте.», «Все места в бете заняты.
Попробуйте позже.», «Доступ к приложению закрыт.», «Нажмите «Старт» в боте — после этого приложение откроется.»
(`src/i18n/locales/ru.js:33-37`).

- **BR-API-011** · `CONFIRMED` — Access denial is signalled only as `403` on `GET /api/meta` with `detail` ∈
  {`private`, `invite`, `full`, `blocked`, `join`} and, since release `index-CIa0Ldj2.js`, `paused`; any other value
  is displayed as `private`. *Evidence:* `NoAccessScreen.jsx:13`, `:22`; `useAppBootstrap.js:130-139`; for `paused`
  `NoAccessScreen.jsx:13`, `:22` at r33; Doc r35:69-75.
- **BR-API-012** · `DOCUMENTED_ONLY` — `private` = only owner accounts may use the app; `invite` = an invitation link
  plus bot «Старт» grants access; `full` = seat limit reached; `blocked` = user blocked by the operator; `join` = the user
  has not started the bot. Since release `index-CIa0Ldj2.js`: `paused` = the bot is paused; the meaning is known only
  from the Mini App's text. *Evidence:* About:248-252; `ru.js:33-37`; for `paused` `NoAccessScreen.jsx:13`, `:22` at
  r33.
- **BR-API-013** · `CONFIRMED` — After the user presses «Старт» the gate must open within seconds: the client
  re-checks `/api/meta` 3 × 2.5 s for every reason except `blocked`, and again on each return to the app. *Evidence:*
  `useAppBootstrap.js:26`, `:134-137`, `:150-157`; `ru.js:40` «Только что нажали «Старт»? Подождите пару секунд —
  проверяем доступ…».
- **BR-API-014** · `CONFIRMED` — `GET /api/feed`, `/api/favorites`, `/api/history` may return `403` for a gated
  user; the client shows «Нет доступа». *Evidence:* `ListingFeed.jsx:88`; Doc:73.
- **BR-API-015** · `CONFIRMED` — A gated user arriving from a listing link is sent to the bot with
  `start=s_<source>--l<id>` (not for `blocked`, and since release `index-CIa0Ldj2.js` not for `paused`), and the bot
  answers with the listing («Квартира, по которой вы пришли: …»). Since that release the source `seo` carries the
  interface language: `s_seo_en`, `s_seo_uz`. *Evidence:* `NoAccessScreen.jsx:26`, `:66`; Bot:1007-1017;
  `NoAccessScreen.jsx:26`, `:40-47`, `:72-81` at r33.
- **BR-API-016** · `DOCUMENTED_ONLY` — The beta mode (`private`/`invite`/`full`) and the owner list are deployment
  configuration. *Evidence:* About:453.
- **BR-API-194** · `DOCUMENTED_ONLY` — Since release `index-CIa0Ldj2.js` `GET /api/meta` may answer
  `403 {"detail": "paused"}` while the bot is paused. `GET /api/bot` must still answer without authorisation, and the
  client passes no source to `/start` for this reason, as for `blocked`. What a user can still reach during a pause,
  and what happens to radar alerts, is not documented. *Evidence:* Doc r35:69-75, :1370, :1393;
  `src/features/onboarding/NoAccessScreen.jsx:13`, `:22`, `:26` (at r33). (Q-API-081; `04` Q-BOT-051)
- **Q-API-005** — Which endpoints besides `/api/meta`, `/feed`, `/favorites`, `/history` enforce the gate (e.g. can a
  gated user still `POST /api/subscriptions`)? Is `paused` enforced on the other routes too (Q-API-081)? *Check:* with
  a test account in a gated state call every endpoint of the registry and record statuses.
- **Q-API-006** — What are the exact conditions of each reason: how is the seat count configured, where are invite
  tokens stored and consumed, is `join` "never sent /start" or "blocked the bot"? *Check:* legacy configuration and
  admin tooling (owner interview); data migration needs the invite/seat tables (`14-data-migration-plan.md`).
- **Q-API-081** — `paused`: is the pause global or per user; which routes besides `/api/meta` refuse during it; what
  a paused user can still reach (the text promises that radars and favourites are safe); is it announced beforehand.
  Legacy asks what a paused user reaches itself (Doc r35:1422-1426, open question 18). *Check:* during a pause call
  every route of the registry from one account and record the statuses: the operator's answer; a test account on the
  legacy product, with the product owner's approval.
- **LB-API-002** · `quirk` · `CONFIRMED` — The reason is read only on `/api/meta`; a `403` on any other endpoint either
  shows «Нет доступа» (feed, favorites, history) or a generic error, and an unknown reason falls back to `private`.
  *Evidence:* `NoAccessScreen.jsx:13`; `ListingFeed.jsx:88`; `ErrorState.jsx:14`.
  - **Proposed fix:** one access middleware for all protected routes returning the same `403` reason codes; the new
    client handles a `403` from any endpoint by showing the no-access screen.
  - **Old-client impact:** compatible as long as `/api/meta` keeps returning exactly these five strings; new reasons
    would show as «Бот приватный» in the old client — add none during the transition.

## 5. Errors and validation

- **BR-API-017** · `CONFIRMED` — Error bodies are JSON `{"detail": "<string>"}`; the client uses `detail` only when it
  is a string and otherwise treats it as absent. *Evidence:* Doc:51, :56-62; `client.js:87-97`.
- **BR-API-018** · `DOCUMENTED_ONLY` — Request validation errors are `422` in Pydantic v2 shape (`detail` is an array
  of objects with error `type` such as `literal_error`); enum query/body values are validated as literals (e.g. an
  invalid `deal` on `/api/feed`). *Evidence:* About:108; Bot:977.
- **BR-API-019** · `DOCUMENTED_ONLY` — Unknown routes and static misses answer `404 {"detail":"Not Found"}`.
  *Evidence:* `demo/app/docs/RECOVERY.md:13`, :16.
- **BR-API-020** · `CONFIRMED` — Successful responses that the client reads must be JSON with status ≠ 204; `204` is
  allowed only where the body is ignored (hide, unhide, block-author `DELETE`, hidden deletes, history delete, found,
  events, subscription delete). *Evidence:* Doc:44-50, :1080-1081; `client.js:99-102`.
- **BR-API-021** · `CONFIRMED` — `409 {"detail":"no_chat"}` means "the bot cannot write to this user"; any other
  `409` on radar creation/activation means "radar limit reached". *Evidence:* `src/lib/chatAccess.js:15-16`;
  `subscriptionActions.js:147-155`; Doc:76-85.
- **Q-API-007** — What exactly does the `422` body contain (`type`, `loc`, `msg`, `input`, `ctx`, `url`), and which
  parameters are range-checked (`limit`, `rooms_*`, `price_*`, `area_*` 1–10000, polygon 3–40 vertices) versus
  silently ignored? *Check:* with a test account send `GET /api/feed?deal=x`, `limit=1000`, `rooms_min=-1`,
  `area_min=0`, a 2-vertex and a 41-vertex `polygon`, an unknown district; record status and body for each.
- **LB-API-003** · `quirk` · `CONFIRMED` — An empty `200` (or non-JSON `2xx`) throws in the client and is shown as a
  failure even if the server succeeded. *Evidence:* `client.js:99-102`; Doc:50.
  - **Proposed fix:** the server never returns `200` without a JSON body; endpoints that have nothing to say return
    `204`; the new client treats an empty `2xx` as success.
  - **Old-client impact:** compatible — the fix is a server invariant the old client already expects.

## 6. Pagination

- **BR-API-022** · `CONFIRMED` — `GET /api/feed` is cursor-paginated: the client always sends `limit=20`, passes the
  opaque `next_cursor` back as `cursor`, and stops only when `next_cursor === null`; items are de-duplicated by `id`
  across pages. *Evidence:* `feed.js:75-85`; `useInfiniteFeed.js:37-42`; Doc:355-366, :511-522.
- **BR-API-023** · `CONFIRMED` — `GET /api/favorites` and `GET /api/history` returned the whole list in one page
  with `next_cursor: null` up to release `index-CBlEKxdL.js`, and the client never sent a cursor. Since release
  `index-CIa0Ldj2.js` `/api/favorites` accepts `cursor` and answers `next_cursor` (`null` on the last page), which the
  client follows; `/api/history` is still read whole. *Evidence:* `useInfiniteFeed.js:31-36`; Doc:926-941; Doc
  r35:1157-1162; `src/lib/api/user.js:26-27` at r33.
- **BR-API-024** · `CONFIRMED` — `sort` values are `cheap`, `expensive`, `deal`, `center`, `ppm`; omitted = newest
  first (`new`); `deal` is offered only for a single `apartment` type, non-daily, city with `median !== false`;
  `center` only for cities with zones; `ppm` only for sale. *Evidence:* `feed.js:78-80`;
  `src/features/sort/SortSheet.jsx:17-33`; About:189.
- **Q-API-008** — What is inside the cursor (offset, keyset), is it stable while new listings arrive, does it expire,
  and what is the maximum `limit`? *Check:* page through a busy feed with a test account while listings are ingested
  and look for duplicates/gaps; request `limit=100`; ask the owner for the implementation.
- **Q-API-009** — Are favourites and history capped (count or age), and in which order are they returned? Since
  release `index-CIa0Ldj2.js` favourites are paged: the page size is Q-API-084. *Check:* inspect a heavy test
  account; owner interview.
- **Q-API-084** — Favourites paging: the page size, the cursor format, the order, and what a request without `cursor`
  from a bundle cached before the release gets when the list is longer than one page (LB-API-057). Legacy asks about
  size and format itself (Doc r35:1400-1401, open question 7). *Check:* put more favourites on one account than a page
  holds and read `GET /api/favorites` without `cursor` and with each `next_cursor`: the operator's answer; a test
  account on the legacy product, with the product owner's approval.
- **LB-API-004** · `bug` · `CONFIRMED` — If `next_cursor` is missing (or non-null on favourites/history), the client
  requests page 1 again in a loop: duplicates are dropped, the list never grows, the request repeats forever and the
  empty state never appears. Since release `index-CIa0Ldj2.js` `/api/favorites` may carry a non-null cursor by design:
  the new client follows it, and only bundles cached before the release still loop on it (`inferred`; LB-API-057). *Evidence:*
  `useInfiniteFeed.js:41-42`, `:57-61`; Doc:364-366, :939-941.
  - **Proposed fix:** every list response always includes `next_cursor` (JSON `null` at the end); the new client
    treats a missing key or a cursor equal to the previous one as the end.
  - **Old-client impact:** compatible — a server guarantee only.

## 7. Filter model, query serialization and search endpoints

`SearchFilters` (25 keys) and its query form are specified in `08` §1.7. The four search endpoints
(`/api/feed`, `/api/feed/count`, `/api/feed/flow`, `/api/map`), and since release `index-DY_DH7h-.js` a fifth,
`/api/feed/new`, take the same query and must interpret it identically (Doc:1096; current Doc:1161; About:191).

- **BR-API-025** · `CONFIRMED` — Repeated query keys (`types`, `districts`, `renovation`, `appliances`, `zones`) carry
  multi-values and must all be applied (not last-wins). *Evidence:* `feed.js:16-19`, :46; Doc:1097.
- **BR-API-026** · `CONFIRMED` — Boolean filters `near_metro`, `below_median`, `floor_not_first`, `floor_not_last`,
  `pets`, `pets_only` are sent only as `=true`; absence means "not applied". `furnished` is tri-state: `true`,
  `false`, or absent (any). *Evidence:* `feed.js:33-61`.
- **BR-API-027** · `CONFIRMED` — `city` is always present (client fallback `tashkent`); `deal` and `owner` are always
  present. *Evidence:* `feed.js:11-15`.
- **BR-API-028** · `CONFIRMED` — `types` allowed per deal: `rent_long` → `apartment, house, room, commercial`;
  `rent_daily` → `apartment, house, room`; `sale` → `apartment, house, commercial, land`. *Evidence:* Doc:177-179.
- **BR-API-029** · `CONFIRMED` — `tenant` (`family|men|women`), `pets`, `pets_only` exist only for `rent_long`;
  `area_min`/`area_max` and `market` (`new|secondary`) only for `sale`; `appliances` only for rentals; `pets` and
  `pets_only` never together; `polygon`, `zones`, `districts` are mutually exclusive (UI-enforced). Since release
  `index-CIa0Ldj2.js` the Mini App shows the area range and sends `area_min` / `area_max` for every deal, while Doc
  r35:206 still limits them to `sale`; what the server does with them for rent is unknown (Q-API-082). *Evidence:*
  Doc:180-182; `src/features/filters/FiltersSheet.jsx:221`, `src/features/filters/sheet/ExtraSections.jsx:9-42` at
  r33.
- **BR-API-030** · `CONFIRMED` — `rooms_min`/`rooms_max`: UI values 1–4 / 1–3; `rooms_max: null` with `rooms_min` set
  means "rooms_min or more"; `4` means "4+". *Evidence:* Doc:151-152; `src/features/filters/model.js:145-166`.
- **BR-API-031** · `CONFIRMED` — `price_min`/`price_max` are integer USD; UZS input is converted client-side as
  `max(1, round(mln × 10^6 / usd_uzs))`. *Evidence:* `src/lib/money.js:91-101`; Doc:153-154.
- **BR-API-032** · `CONFIRMED` — `area_min`/`area_max` are integers 1–10 000 m². *Evidence:* Doc:166-167.
- **BR-API-033** · `CONFIRMED` — `posted_days` ∈ {1, 3, 7} restricts the feed to listings posted within that many
  days. *Evidence:* Doc:170, :185-186.
- **BR-API-034** · `CONFIRMED` — `polygon` = 3–40 `[lat, lon]` vertices, not closed, coordinates rounded to 5
  decimals, self-intersections replaced by the convex hull client-side; serialized `lat,lon;lat,lon;…`. *Evidence:*
  `src/lib/geo/polygon.js:6`, :108-149, :235; Doc:171, :183-184.
- **BR-API-035** · `DOCUMENTED_ONLY` — `owner`: `any` = everything; `no_agents` = exclude explicit realtors; `owners` =
  only listings with an explicit owner mark (text or channel hashtag `#хозяин`, `#собственник`). *Evidence:*
  About:626; SEO:259-262.
- **BR-API-036** · `CONFIRMED` — `pets=true` hides listings that explicitly forbid pets; `pets_only=true` keeps only
  listings that explicitly allow them. *Evidence:* Doc:160-161.
- **BR-API-037** · `DOCUMENTED_ONLY` — `near_metro` = landmark from the listing within ~1 km of a metro station in a
  straight line; zones `center` («Центр (внутри кольца)») and `near_center` («Ближе к центру») exist for Tashkent.
  *Evidence:* About:162, :629; SEO:320-323; mock `tools/parity/mocks.mjs:61`.
- **BR-API-038** · `UNVERIFIED` — `below_median=true` keeps listings priced below the market comparison («Не дороже
  рынка» in the UI); the threshold relative to `median_delta`/tones is unknown. *Evidence:* Doc:157;
  `tools/parity/mocks-filters.mjs:57`. (Q-API-011)
- **BR-API-039** · `CONFIRMED` — Filter objects returned by the server (`Subscription.filters`, `flow.options[].filters`)
  contain all 25 keys with arrays non-null (only `zones` may be missing). *Evidence:* Doc:216-219; `feed.js:16-19`.
- **BR-API-040** · `CONFIRMED` — `GET /api/feed/flow` returns `week` (new listings in the window) and `days` (window
  length, > 0); the client shows ≈ `week / days` per day; options carry complete replacement filters. *Evidence:*
  Doc:540-556.
- **BR-API-041** · `CONFIRMED` — `GET /api/map` returns all matching points in one response (no viewport/zoom
  parameters); `label` is plain text, `tone` ∈ {`good`, `high`, `check`, `suspicious`, null}, `priced: false` =
  negotiable, `usd` orders stacks. *Evidence:* Doc:562-585; `feed.js:119`.
- **BR-API-192** · `DOCUMENTED_ONLY` — Since release `index-CIa0Ldj2.js` `GET /api/map` may answer `with_point`, the
  number of listings of `total` that have coordinates. Absent, the client takes the number of points. When it is
  larger than the number of points, the answer was cut to the newest listings; `total − with_point` listings are
  known only by district. The size of the cut and the order behind "newest" are not documented. *Evidence:* Doc
  r35:671, :681-685, :1369; `src/lib/api/feed.js:142-149` (at r33); mock `tools/parity/mocks.mjs:320`. (Q-API-015)
- **BR-API-157** · `CONFIRMED` — `GET /api/feed/new` (since release `index-DY_DH7h-.js`) takes the common filter query
  plus `since`, the previous visit with these filters as integer unix seconds of the device clock, and returns
  `{"count": number}` with `count` required. The client calls it only for an eligible return banner, shows the banner
  for `count > 0` and ignores every error. *Evidence:* current Doc:559-588; `src/lib/api/feed.js:105-117`,
  `src/app/useReturnNudge.js:112-137` (at the pin).
- **BR-API-158** · `DOCUMENTED_ONLY` — `count` is the number of listings matching the filters that appeared after
  `since`, under the filter semantics of `/api/feed`. What "appeared" means, whether hidden listings and blocked
  authors are excluded and whether `since` is bounded are not documented (Q-API-066). *Evidence:* current Doc:568,
  :1161-1162, :1200-1202.
- **Q-API-010** — What exactly do `sort=deal` (by `median_delta`?), `center` (by `center_km`?), `ppm` and the default
  order (first seen? last publication?) sort by, and what is the tie-breaker? *Check:* with a test account compare the
  first 40 items of each sort against the fields in the responses.
- **Q-API-011** — What is the `below_median` threshold (any negative `median_delta`, ≤ −10%, tone `good` only)?
  *Check:* `GET /api/feed?…&below_median=true` and inspect `median_delta`/`median_tone` of every item.
- **Q-API-012** — Formats of `city`, `district`, `renovation`, `appliance` codes (slug rules, stability) and the
  reaction to unknown codes (ignored, empty result, `422`)? *Check:* compare `meta` directories with SEO slugs; send
  an unknown district.
- **Q-API-013** — Are radars created before 2026-11-06 stored with `zone` and normalised on read, and does the server
  still accept `zone=`? *Check:* `GET /api/feed?…&zone=center` vs `zones=center` counts; legacy DB query for
  subscriptions with a `zone` key.
- **Q-API-014** — Does radar matching apply `posted_days` stored in a radar's filters? *Check:* create a radar with
  `posted_days=1` from the Mini App (test account) and observe deliveries of older-but-newly-seen listings; owner
  interview.
- **Q-API-015** — Is `/api/map` capped (`total` > `points.length`) and in what order are points returned?
  **Narrowed by release `index-CIa0Ldj2.js`:** the answer can be cut — `with_point` larger than the number of points —
  to "the newest" (BR-API-192). Still open: from how many points, and what "newest" orders by (legacy asks the same,
  Doc r35:1422-1426). *Check:* call it for Tashkent rent with default filters and compare `total` with
  `/api/feed/count`.
- **Q-API-066** — What counts as "new" in `GET /api/feed/new`: the publication time or the first appearance in the
  database? Are hidden listings and blocked authors excluded? Is `since` bounded from below (the last visit can be
  weeks old), and what does the server answer to a `since` in the future or a malformed one? The legacy contract asks
  the same (§14 question 15, current Doc:1200-1202). *Check:* owner interview; with a test account compare
  `GET /api/feed/new?…&since=<t>` with the `/api/feed` items of the same filters first seen after `t`, for `t` an
  hour, a week and a month ago and in the future.
- **Q-API-082** — Does the server apply `area_min` / `area_max` to rent searches and rent radars? The Mini App sends
  them for every deal since release `index-CIa0Ldj2.js`; Doc r35:206 still says "only for `sale`". *Check:* compare
  `GET /api/feed/count` of a rent search with and without `area_min`, and create a rent radar with an area range and
  record what it delivers: the operator's answer; a test account on the legacy product, with the product owner's
  approval.
- **Q-API-016** — Does `GET /api/cities` return one entry per `meta.cities` item, and is `typical` the median price
  of the city per deal? *Check:* compare `GET /api/cities` with `meta.cities` and with SEO city medians.
- **LB-API-005** · `bug` · `CONFIRMED` — A filter object from the server with a missing key breaks the client: a
  missing scalar is sent as the literal string `undefined` (`deal=undefined`), a missing array throws in `forEach`.
  *Evidence:* `feed.js:13-19`, :29-31; Doc:216-219.
  - **Proposed fix:** the server normalises every stored or generated filter object to the full 25-key schema (with
    defaults) before returning it; the new client merges server filters over `defaultFilters()`.
  - **Old-client impact:** compatible — a server-side guarantee.
- **LB-API-006** · `bug` · `CONFIRMED` — Any code that the client turns into an i18n key (radar `types`, sort, deal)
  crashes the screen if unknown, because `t()` throws on missing keys. *Evidence:* Doc:177-179;
  `demo/app/docs/RECOVERY.md:155`.
  - **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** `t()` and `plural()` no longer throw: for a missing
    key they return the `ru` entry, or the key itself, and report `app_error` with `source: "i18n"` once per key
    (`src/i18n/index.js:110-125`, `:180-193` at r33; Doc r35:1287-1289). Still open: an unknown code shows a raw key
    instead of a label, and the owner dictionary has no such fallback, so an owner key still throws
    (`src/features/owner/owner.js:701-707` at r31; `inferred`; BR-API-159).
  - **Proposed fix:** the server validates enum values on write and filters them on output to the known set per
    `deal`; the new client falls back to a generic label.
  - **Old-client impact:** compatible if the server never emits a code the old dictionary lacks; new enum values
    (new property types, new deals) must wait for the old client to be retired.
- **LB-API-007** · `quirk` · `CONFIRMED` — `flow.days` is a divisor; `0` or a missing value yields `NaN`/`Infinity` in
  the «≈N в день» hint. *Evidence:* Doc:543.
  - **Proposed fix:** the server always returns `days ≥ 1` (the window length), independent of data.
  - **Old-client impact:** compatible.
- **LB-API-008** · `bug` · `CONFIRMED` — `points[].label` from `/api/map` is inserted as HTML (Leaflet: every pin;
  MapLibre: stacks), so a label containing markup is an XSS vector and entities render differently in the two
  engines. *Evidence:* `src/features/map/leaflet/icons.js:13`; `src/features/map/gl/markerElements.js:40`;
  Doc:578-580.
  - **Proposed fix:** the server builds labels only from numbers and a fixed currency format (no listing text), and
    strips `<`, `>`, `&`, quotes; the new client renders labels as text.
  - **Old-client impact:** compatible — the old client renders plain text correctly; never emit HTML entities
    (`&amp;`) because Leaflet would show them decoded and GL single pins raw.
- **LB-API-055** · `quirk` · `CONFIRMED` — `GET /api/feed/new` must always carry a numeric `count`: the client tests
  "not `count <= 0`", so a body without `count` passes and the return banner throws while formatting the number,
  which takes the old client to its crash screen. *Evidence:* `src/app/useReturnNudge.js:117-136`,
  `src/features/feed/Nudges.jsx:84-87` (at the pin); current Doc:572-573, :1162.
  - **Proposed fix:** the server always returns an integer `count ≥ 0` (`0` when nothing is new or `since` is out of
    range); the new client shows the banner only for a positive integer (`03` LB-APP-048).
  - **Old-client impact:** compatible — a server-side guarantee.

## 8. Listings pipeline

The pipeline internals are not visible; only its outputs are (About:167, 🔶 for the section as a whole). Sub-sections
follow the processing order.

### 8.1 Channel reading

- **BR-API-042** · `DOCUMENTED_ONLY` — Sources are 217 open Telegram channels read through their public pages without
  subscribing; 🔶 most likely the web preview `t.me/s/<channel>`. *Evidence:* About:117, :169; SEO:244-247.
- **BR-API-043** · `DOCUMENTED_ONLY` — A channel admin can ask that listings from the channel are not taken at all.
  *Evidence:* `$KVADRO_ROOT/demo/landing/site/privacy.html:67`.
- **Q-API-017** — Which 217 channels, how often each is polled, how blocking/rate limits are handled, and whether
  closed channels are ever read? *Check:* owner interview; legacy channel table export (`14-data-migration-plan.md`).

### 8.2 LLM extraction

- **BR-API-044** · `DOCUMENTED_ONLY` — Gemini extracts price, district, rooms, area, floor, renovation, conditions
  (deposit, «только семье» etc.), pets, owner or realtor; what the text does not say stays empty («без догадок»).
  *Evidence:* About:172-173; SEO:248-249.
- **BR-API-045** · `DOCUMENTED_ONLY` — Phone numbers and `@handles` are masked before any text is sent to the LLM
  (extraction, user queries, translation). *Evidence:* About:173, :350, :400.
- **BR-API-046** · `DOCUMENTED_ONLY` — "From the owner" = an explicit owner statement in the text or a channel hashtag
  (`#хозяин`, `#собственник`). *Evidence:* SEO:259-262.
- **Q-API-018** — Prompts, output schema, model version, retries, cost limits, and how voice messages are handled?
  *Check:* owner interview; legacy configuration.

### 8.3 Duplicates and merging

- **BR-API-047** · `DOCUMENTED_ONLY` — One flat is one card even when posted in several channels or reposted;
  duplicates are detected by photos, text and parameters (rooms, floor, district, price); the card shows the other
  sources («ещё N»). *Evidence:* About:156, :177; SEO:250-251.
- **BR-API-048** · `CONFIRMED` — `GET /api/listings/:id` may answer with another listing (the survivor of a merge);
  the client switches to the returned `id` without a second request. *Evidence:*
  `src/features/listing/hooks/useListingLoader.js:47-58`; `demo/app/docs/CHANGELOG.md:12`, :16; Doc:606-608.
- **BR-API-049** · `DOCUMENTED_ONLY` — Each publication (channel, link `t.me/<channel>/<id>`, time, text, price)
  feeds the price history (`published`, `price_down`, `price_up`) and the counters days listed / publications /
  channels. *Evidence:* About:157; Doc:286-300.
- **Q-API-019** — Which algorithm merges duplicates, which id survives, and are merges reversible? *Check:* owner
  interview; find a listing id that redirects (`GET /api/listings/:old` returns another `id`) and compare sources.

### 8.4 Geocoding and PostGIS

- **BR-API-050** · `DOCUMENTED_ONLY` — Each listing gets city, district, zone, landmark, residential complex (ЖК),
  coordinates with an uncertainty radius (`geo_radius_m`), nearest metro with distance, and distance to the centre.
  *Evidence:* About:141, :174-176.
- **BR-API-051** · `DOCUMENTED_ONLY` — Distances are measured from the block, landmark or metro named in the listing,
  not from the district; a district may be inferred from a landmark or mahalla. *Evidence:* About:175-176; SEO:252.
- **BR-API-052** · `CONFIRMED` — The client renders the nearest metro itself (when `metro_km ≤ 1.5`), so `nearby`
  carries only `park` and `school` entries. *Evidence:* Doc:342-344.
- **BR-API-053** · `DOCUMENTED_ONLY` — District and block boundaries and the 2024 school rating come from
  `opendata.tashkent.uz` (`/132`, `/134`), school locations from OpenStreetMap. *Evidence:* SEO:253-255.
- **Q-API-020** — Which geocoder and gazetteer (districts, blocks, ЖК, landmarks, mahallas) are used, and how is
  `geo_radius_m` derived? *Check:* owner interview; gazetteer export.

### 8.5 Photos and video

- **BR-API-054** · `DOCUMENTED_ONLY` — Photos are copied and served locally in two sizes: `/media/<listing_id>/<n>.jpg`
  (800 px) and `.s.jpg` (480 px). *Evidence:* About:139, :178; Doc:1054-1055.
- **BR-API-055** · `DOCUMENTED_ONLY` — Photo URLs are signed: `?e=<expiry>&s=<32 hex>`; `e` is rounded to midnight
  UTC and issued ~1–2 days ahead (one URL per photo per day); the signature binds listing id and photo number, not
  the size. *Evidence:* SEO:379-387; About:305-307.
- **BR-API-056** · `CONFIRMED` — Video is not hosted: `video` is a truthy flag and tapping it opens the source post
  (or the gallery when `post_deleted`). *Evidence:* `src/features/listing/ListingScreen.jsx:150`; About:178.
- **Q-API-024** — Signature algorithm and secret (MD5 or truncated HMAC?), issuing policy for `e`, and whether the
  Mini App receives the same signed URLs as SEO pages. *Check:* compare `photos_preview` URLs from `/api/feed` with
  SEO page image URLs for the same listing; owner for the algorithm (needed to keep issued URLs valid).

### 8.6 Medians and market comparison

- **BR-API-057** · `DOCUMENTED_ONLY` — District median: slice district (or city) × rooms; last 60 days; recomputed
  hourly; one publication per flat; ≤ 3 listings per channel (no channel cap in regional cities); groups under 8 not
  computed («—»); prices below $50 or above $20 000 per month and "per person" prices dropped; caption «по 82 из 197
  объявлений». *Evidence:* SEO:264-275.
- **BR-API-058** · `DOCUMENTED_ONLY` — "Near" comparison: median of the 12 nearest listings with the same rooms (sale:
  15 nearest, per m²) around the listing's place, within 5 km, ≤ 3 per channel; with fewer than 8 the district is used.
  *Evidence:* SEO:277-283.
- **BR-API-059** · `DOCUMENTED_ONLY` — A difference under 10% is «на уровне обычной цены» without percentages; if the
  nearest are cheaper but the district is dearer, "below market" is not claimed and both numbers are shown (`mixed`).
  *Evidence:* SEO:283-284; About:163.
- **BR-API-060** · `DOCUMENTED_ONLY` — 3+ room flats with unusual area are compared per m² among 3+ room flats; 1–2
  rooms by room count; very small flats are never called «подозрительно дёшево». *Evidence:* SEO:285-287.
- **BR-API-061** · `CONFIRMED` — Listing tones: `good`, `check`, `suspicious`, `same`, `mixed`, `no_repair` (anything
  else = dearer); map tones: `good`, `high`, `check`, `suspicious`. *Evidence:* Doc:262, :569.
- **BR-API-062** · `CONFIRMED` — The market block appears only when `median` and `median_value` are truthy and
  `median_delta !== null`; the user's own value is `median_own`, else `price_per_m2` (metric `m2`), else `price_usd`.
  *Evidence:* Doc:320-336, :349-350.
- **BR-API-063** · `DOCUMENTED_ONLY` — Sale statistics: price and price per m²; down payments and instalments
  excluded; at most a tenth of a group from one channel; prices below $5 000 or above $5 M excluded. *Evidence:*
  SEO:294-298, :313-318.
- **BR-API-064** · `CONFIRMED` — A city with `median: false` gets no market comparison filter/sort (`deal` sort and
  «Не дороже рынка» hidden). *Evidence:* Doc:460; `src/features/sort/SortSheet.jsx:19-25`; `src/app/App.jsx:295`.
- **Q-API-021** — Meaning of `median` (flag) and `median_reason`, the classes `jk`/`house`, and the tone thresholds
  (`check`, `suspicious`, `no_repair`)? *Check:* owner interview; sample 50 listings per tone with a test account.

### 8.7 Statuses and retention

- **BR-API-065** · `DOCUMENTED_ONLY` — Withdrawn listings (rented, sold, deleted) are kept 90 days, then phone, text and
  photos are erased; price, district and area remain for statistics. *Evidence:* About:181-183; SEO:252.
- **BR-API-066** · `DOCUMENTED_ONLY` — When a listing is withdrawn, the bot edits already-sent cards to «Объявление
  снято». *Evidence:* About:182-183.
- **BR-API-067** · `CONFIRMED` — A deleted source post sets `post_deleted: true` (no «Открыть пост»; video opens the
  gallery). *Evidence:* Doc:314; `demo/app/docs/CHANGELOG.md:12`, :17-18.
- **BR-API-068** · `DOCUMENTED_ONLY` — On an author's request (support bot or e-mail) a listing is removed from feed,
  map, site and alerts, and sent cards are edited. *Evidence:* About:184-185; `demo/landing/site/privacy.html:67`.
- **BR-API-069** · `CONFIRMED` — `status_text` is a server-provided state label shown on cards (mock: «Сдана»).
  *Evidence:* Doc:259; `tools/parity/mocks.mjs:81`.
- **Q-API-023** — What does `GET /api/listings/:id` return for a withdrawn listing within 90 days and after the PII
  purge (`200` with `status_text`, `404`)? Do favourites/history keep such items? **Narrowed by release
  `index-CIa0Ldj2.js`:** the client treats every `404` of the card as "the listing is gone" (`03` SCR-019). Still
  open: which of the two answers the server gives in each case. *Check:* open an old listing id from the bot history
  of a test account; inspect favourites after the listing is withdrawn.

### 8.8 Translation

- **BR-API-070** · `DOCUMENTED_ONLY` — Translation happens only on demand (`POST /api/listings/:id/translate`) into the
  profile language with Gemini; the client offers it only when its locale is not `ru`. *Evidence:* About:179;
  `src/features/listing/hooks/useListingTranslation.js:22`.
- **Q-API-025** — Are translations cached (per listing × language), and is the target the profile locale or the
  bot language? *Check:* translate the same listing twice and time it; switch locale and repeat.

### 8.9 Server-side presentation

- **BR-API-071** · `CONFIRMED` — `price` is a string formatted in the user's currency and locale; parts are separated
  by ` · `; `(…)` inside part 1 is an explanation; text from the first `/` is the period (`/мес`). *Evidence:*
  Doc:268-272; About:156, :343.
- **BR-API-072** · `CONFIRMED` — `title` is shown up to the first ` · `; `age` is `<prefix> · <when>` and the UI shows
  the part after the first ` · `. Since release `index-CIa0Ldj2.js` `age` is only the fallback of the age label
  (BR-API-196). *Evidence:* Doc:270, :273.
- **BR-API-195** · `CONFIRMED` — Since release `index-CIa0Ldj2.js` `floor` has three meanings: `0` is the ground
  (semi-basement) floor, a negative value a basement, and an unknown floor must be `null` or absent, never `0`. Before
  the release the client showed nothing for `0` and a number for a negative floor. *Evidence:* Doc r35:274, :305-307,
  :1368; `src/features/listing/format.js:55-71`, `src/features/listing/sections/KeyFacts.jsx:28-35` (at r33).
  (Q-API-083)
- **BR-API-196** · `CONFIRMED` — Since release `index-CIa0Ldj2.js` a preview may carry `posted_at`, an ISO time that
  the client parses with `Date.parse` and turns into the age label itself (`03` BR-APP-109); without a parsable value
  it falls back to `age` (BR-API-072), so `age` must keep coming. The time zone of the value is not stated.
  *Evidence:* Doc r35:286, :302-304, :1368; `src/features/listing/format.js:141-166` (at r33); mock
  `tools/parity/mocks.mjs:345`. (Q-API-083)
- **BR-API-073** · `CONFIRMED` — `market` is a display label; `market_code` (`new` = new build, other non-empty =
  secondary) drives the «Дом» tile. *Evidence:* Doc:260, :282.
- **BR-API-074** · `CONFIRMED` — Display strings (`facts[].label/value`, `district_name`, `landmark`, `metro`,
  `owner`, `status_text`, `market`, option `label`/`rate`, `relaxed[].text`, `author.label`) are rendered as received;
  the client does not localise them. *Evidence:* Doc:233-336, :385-395.
- **Q-API-022** — Exact formatting rules of `price`, `age`, `title`, `status_text`, `market` and `facts` per locale ×
  currency (needed for byte parity). *Check:* with a test account fetch the same listing in `ru`, `uz_Latn`, `en` ×
  `USD`, `UZS` and store the eight responses as golden fixtures.
- **Q-API-026** — Is `CityMeta.zoom < 11` really the "region, not a city" marker (`TODO: inferred from build`), and
  what are the six cities/regions and their zooms? *Check:* `GET /api/meta` with a test account; inspect `cities[]`.
- **Q-API-083** — What the server really sends for the new fields of release `index-CIa0Ldj2.js`, known so far from
  the client and its mocks only: `posted_at` — its time zone and whether every preview carries it; `floor` — whether
  older listings with an unknown floor are stored as `0`; `agent_marked` — always present for `agent`, and `true` also
  when the number was marked before this vote; `Subscription.id` — a number or a string (Doc r35:428 allows both; the
  radar link needs a number, `03` LB-APP-079). Legacy asks about the time zone itself (Doc r35:1422-1426, open
  question 18). *Check:* read `GET /api/feed`, a listing card, `GET /api/subscriptions` and the answer to an `agent`
  report from one account and record the types and values of the four fields: the operator's answer; a test account
  on the legacy product, with the product owner's approval.
- **LB-API-009** · `quirk` · `CONFIRMED` — The listing UI crashes or shows `$NaN` when a strictly-read key is missing:
  `center_km`, `metro_km`, `median_delta` (cards), `history[].price_usd`, `history[].change_pct` (≥ 2 entries),
  `median_value` (when `median`), `photos_preview` (`.slice`), `sources` (`.length`), one of
  `median_own`/`price_per_m2`/`price_usd`. *Evidence:* Doc:245-246, :261, :298-299, :311, :340-350, :1085-1086.
  - **Proposed fix:** the legacy serializer always emits every key (value or `null`, arrays `[]`); the new API publishes
    an OpenAPI schema with required-nullable fields; the new client is defensive.
  - **Old-client impact:** compatible — server-side guarantee.
- **LB-API-010** · `quirk` · `CONFIRMED` — `nearby[].kind` outside `park`/`school` has no icon and crashes the screen;
  `kind` and `facts[].key` are React keys and must be unique; a `metro` entry in `nearby` duplicates the client's own
  metro row. *Evidence:* Doc:342-346.
  - **Proposed fix:** the serializer whitelists `nearby` kinds, de-duplicates by kind and fact key; new kinds go only
    to the new API.
  - **Old-client impact:** compatible as long as the whitelist is applied on legacy routes.
- **LB-API-011** · `quirk` · `CONFIRMED` — Listing `id` must be a JSON number: the screen compares the response `id`
  with the requested number using `!==`, so `"123"` triggers a pointless switch; feed de-duplication uses `===`.
  *Evidence:* Doc:234, :606-608; `useInfiniteFeed.js:39`.
  - **Proposed fix:** keep integer listing ids on legacy routes; if HOMI adopts opaque ids (ADR-0007), expose a stable
    numeric `legacy_id` mapping for the transition.
  - **Old-client impact:** the old client breaks subtly with string ids — numeric ids are mandatory while it runs.
- **LB-API-012** · `quirk` · `CONFIRMED` — `?preview=1` cannot be lighter than the preview minimum (`photos_preview`,
  `title`/`short_title`, `favorite`, `center_km`, `metro_km`, `median_delta`); on error the map card spins forever.
  *Evidence:* Doc:601-604; `MapSelectionCard.jsx:29-36`.
  - **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** a failed preview request shows «Не загрузилось»
    with «Повторить» in the card slot (`src/features/map/MapSelectionCard.jsx:22-54`, `:111-121` at r33; Doc
    r35:690-691). Still open: the preview minimum is unchanged.
  - **Proposed fix:** `preview=1` returns exactly `ListingPreview`; the new client shows an error state with retry.
  - **Old-client impact:** compatible.

## 9. Radars (subscriptions)

- **BR-API-075** · `DOCUMENTED_ONLY` — Radars are one entity shared by the bot (wizard, free text via Gemini, `/subs`)
  and the Mini App, with one limit («k из 10» in the bot). *Evidence:* Bot:976; About:196-197.
- **BR-API-076** · `CONFIRMED` — Limit per user = `meta.max_subscriptions` (default 10); exceeding it → `409`
  without `detail: "no_chat"`; the client toast is «Уже {max} радаров — удалите ненужный во вкладке «Радар»».
  *Evidence:* Doc:441; `subscriptionActions.js:16`, :150-153; `ru.js:64`; About:159.
- **BR-API-077** · `CONFIRMED` — If the bot cannot write to the user (never started or blocked it), `POST`, `PUT`,
  `PATCH {active:true}` and `POST …/relax` return `409 {"detail":"no_chat"}` **before** any change. *Evidence:*
  Doc:80-85; About:208-209, :354.
- **BR-API-078** · `CONFIRMED` — Create/edit results carry `starter` (listings already matching, delivered to the
  chat), `options` (relax suggestions with `code`, `label`, `rate`, `count`) for narrow searches and `relaxed` hints;
  the client proposes the first option with `count ≥ 7`, else the last. *Evidence:* `subscriptionActions.js:18`,
  :49-67; Doc:382-400.
- **BR-API-079** · `DOCUMENTED_ONLY` — After creation the bot sends what already exists (bot: «Уже есть за последние 3
  дня: N»), afterwards only new listings. *Evidence:* About:200-201; Bot:984.
- **BR-API-080** · `UNVERIFIED` — After an edit only listings the user has not received yet are sent. *Evidence:*
  About:201 (🔶). (Q-API-031)
- **BR-API-081** · `UNVERIFIED` — Matching runs when a new listing appears (probably also on price or status change)
  against all active radars, excluding the radar's hide rules, the user's hidden listings, blocked authors and cards
  already delivered. *Evidence:* About:202-204 (🔶). (Q-API-027)
- **BR-API-082** · `DOCUMENTED_ONLY` — Mode `instant` sends one card per listing immediately; `digest` sends a list at
  the user's digest hours. *Evidence:* About:205-206; `ru.js:367` «Списком в {time}».
- **BR-API-083** · `DOCUMENTED_ONLY` — During quiet hours no cards are sent; everything that appeared overnight arrives
  as one digest in the morning («Карточки не приходят; всё, что появилось за ночь, — одной подборкой утром.»,
  `ru.js:512`). *Evidence:* About:206-207.
- **BR-API-084** · `DOCUMENTED_ONLY` — Quiet hours and digest hours are Asia/Tashkent («Время — ташкентское.»,
  `ru.js:519`). *Evidence:* About:344.
- **BR-API-085** · `UNVERIFIED` — Bot presets: quiet `off`, `22-08`, `23-08`, `00-09`, `23-07`; digest `09`, `09,19`,
  `12,20`, `19`; the Mini App contract shows other examples. *Evidence:* Bot:990; About:161 (🔶); Doc:846-847.
  (Q-API-029)
- **BR-API-086** · `CONFIRMED` — `entry` (`filters`, `empty`, `few`, `prompt`; since release `index-DY_DH7h-.js` also
  `feed` and `return`) and `relaxed` (flow option code, only from a filters sheet) are sent with a new radar for
  statistics only. *Evidence:* Doc:733-748; `App.jsx:310`, :582, :599, :631; current Doc:786-807, :1163;
  `App.jsx:401-415`, :635, :718, :752 (at the pin).
- **BR-API-087** · `CONFIRMED` — Relax codes from `SubscriptionMutationResult.options` go to `POST …/relax`; flow option
  codes go as `relaxed` in `POST`/`PUT`; they are separate code sets. *Evidence:* Doc:553-556, :822-838.
- **BR-API-088** · `DOCUMENTED_ONLY` — Relax options widen price, rooms, districts or include realtors («✅ Вместе с
  риелторами»); a too-wide query gets a warning before saving. *Evidence:* About:197-199; Bot:983; mocks
  `tools/parity/mocks.mjs:162-168`.
- **BR-API-089** · `CONFIRMED` — Resume (`PATCH {active:true}`) returns `starter` = matches the user has not seen
  («Радар снова включён. {count}, которые вы не видели, — в чате с ботом», `ru.js:476`; since release
  `index-CIa0Ldj2.js` «Радар снова включён. В чате с ботом — непросмотренные: {count}»). *Evidence:*
  `RadarScreen.jsx:102-110`.
- **BR-API-090** · `CONFIRMED` — `ask_found: true` on `PATCH {active}` (any value) or `DELETE` asks the client to show
  «Нашли жильё?» with `trigger` `pause`/`delete`; it is not shown every time (🔶). *Evidence:* Doc:805-806, :816-820;
  About:211; `RadarScreen.jsx:111-114`, :176-178.
- **BR-API-091** · `DOCUMENTED_ONLY` — `Subscription.hidden` counts listings suppressed by the radar's hide rules
  (bot «Скрыть похожие → канал/район», 🔶 author); `PATCH {unhide:true}` clears them («🙉 Показать скрытое»).
  *Evidence:* About:159; Bot:980, :989.
- **BR-API-092** · `CONFIRMED` — Duplicate detection is client-side: before `POST` the client re-reads the list and
  compares filters ignoring `posted_days`; an active twin → «Радар по этому поиску уже включён», a paused twin →
  `PATCH {active:true}`. *Evidence:* `subscriptionActions.js:94-129`; `model.js:45-63`.
- **BR-API-093** · `DOCUMENTED_ONLY` — The bot's radar card buttons (⭐, «Это риелтор», «Уже сдано», «Скрыть похожие»)
  act on the same server state as the Mini App. *Evidence:* About:213-217; Bot:986-989.
- **Q-API-027** — What triggers matching (new listing, price change, repost, status change), and with what latency?
  *Check:* owner interview; observe a test radar for a week and log delivery times vs `history[].at`.
- **Q-API-028** — Digest message format, ordering, size cap and the behaviour at the quiet-hours boundary. *Check:*
  test account with `digest` mode and quiet `23-08` for several days; capture messages.
- **Q-API-029** — Which preset lists does `GET /api/settings` actually return? *Check:* `GET /api/settings` with a
  test account; compare with bot `/settings`.
- **Q-API-030** — When is `ask_found` true (every pause/delete, once per user, after N days, only when no survey answer
  exists)? *Check:* pause/delete radars repeatedly with a test account; owner interview.
- **Q-API-031** — Delivered-card tracking: per user or per radar, retention, and what `PUT` and `DELETE` reset; the
  default `mode` of a radar created in the Mini App. *Check:* owner interview; create a radar via `POST` and read its
  `mode`; migration must carry delivered cards (About:430).
- **Q-API-032** — The hide-rule model behind `Subscription.hidden` (channel, district, author?) and whether
  `GET /api/hidden` shows these rules. *Check:* use «Скрыть похожие» in the bot with a test account, then
  `GET /api/subscriptions` and `GET /api/hidden`.
- **Q-API-033** — The `starter` window and semantics for create (last 3 days?), edit and resume (unseen only?).
  *Check:* compare `starter` with `/api/feed/count` + `posted_days=3` for the same filters.
- **Q-API-034** — How `entry` and `relaxed` are stored, whether `relaxed` is validated against the filters, whether
  unknown relax codes are rejected, and whether duplicate `POST`s are prevented server-side. *Check:* owner interview;
  double-submit `POST /api/subscriptions` from a test account.
- **LB-API-013** · `quirk` · `CONFIRMED` — On `409 no_chat` the client asks for write access and repeats the same
  request once; if the server had already created the radar, the repeat creates a duplicate. *Evidence:*
  `src/lib/chatAccess.js:27-47`; Doc:83-85.
  - **Proposed fix:** check bot reachability before any write (as legacy does) **and** make radar creation idempotent
    (unique normalised filters per user, or an idempotency key in the new API).
  - **Old-client impact:** compatible — the old client sends no key; server-side de-duplication returns the existing
    radar in the same response shape.
- **LB-API-014** · `bug` · `CONFIRMED` — When `starter` is 0 and there are no `options`, the client reads
  `result.relaxed[0]` without a check; a missing `relaxed` throws and the user sees «Не получилось сохранить» after a
  successful save. *Evidence:* `subscriptionActions.js:64-66`; `demo/app/docs/RECOVERY.md:160-161`.
  - **Proposed fix:** every create/edit result contains `relaxed: []` at least; the new client guards the access.
  - **Old-client impact:** compatible.

## 10. Favourites, history, hidden listings, blocked authors

- **BR-API-094** · `CONFIRMED` — Up to release `index-CBlEKxdL.js` favourite is a server-side toggle that returns the
  resulting state, shared with the bot's ⭐ button; since `index-CIa0Ldj2.js` the Mini App sends the wanted state, and
  only a request without a body toggles (BR-API-197). *Evidence:* Doc:636-647; Bot:986.
- **BR-API-197** · `DOCUMENTED_ONLY` — Since release `index-CIa0Ldj2.js` `POST /api/listings/:id/favorite` takes
  `{"favorite": boolean}`, the wanted state, and answers `{"favorite": boolean}`, which the client takes as the truth.
  A request without a body must still toggle, because bundles cached before the release send none. *Evidence:* Doc
  r35:746-766, :1363-1364; `src/lib/api/listings.js:39-45`, `src/components/FavButton.jsx:20-37` (at r33). (Q-API-038)
- **BR-API-095** · `UNVERIFIED` — Opening a listing records it in the view history and makes it `viewed: true` in
  later previews (radar previews then do not count it as new). *Evidence:* Doc:240. (Q-API-035)
- **BR-API-096** · `DOCUMENTED_ONLY` — Hiding a listing affects only this user and can be undone. *Evidence:*
  About:226.
- **BR-API-097** · `DOCUMENTED_ONLY` — Blocking an author (by phone, or by source channel when there is no phone) hides
  all the author's listings for this user; undo in «Скрытое». *Evidence:* About:130, :227; Doc:657-673.
- **BR-API-098** · `CONFIRMED` — The block response lists the author's listings to hide at once and a display label
  (masked phone or channel handle). *Evidence:* Doc:661-669; `tools/parity/mocks.mjs:187`.
- **BR-API-099** · `CONFIRMED` — `GET /api/hidden` returns hidden listings and blocked authors (`id`, `kind`, `label`,
  `count`); `DELETE /api/hidden/:id` removes one author entry; `DELETE /api/hidden` clears both lists. *Evidence:*
  Doc:901-924.
- **BR-API-100** · `DOCUMENTED_ONLY` — `DELETE /api/history` clears the view history. *Evidence:* Doc:943-945.
- **Q-API-035** — Which action records history and `viewed` (full `GET`, `?preview=1`, opening from the bot), and does
  it increment `stats.views`? *Check:* with a test account open a listing only via the map preview, then check
  `GET /api/history`; repeat with a full open.
- **Q-API-036** — Do `/api/feed`, `/count`, `/flow`, `/map` and radar delivery exclude the user's hidden listings and
  blocked authors server-side? *Check:* hide a listing and block an author with a test account, reload the app and
  search for them.
- **Q-API-037** — Does `GET /api/hidden` include listings hidden by a `fraud`/`rented` report or by radar rules, and
  does `DELETE /api/hidden` clear those too? *Check:* report a listing as `fraud` with a test account and inspect
  `GET /api/hidden`.

## 11. Votes, reports and anti-abuse

- **BR-API-101** · `CONFIRMED` — Report reasons are `rented`, `agent`, `wrong_data`, `fraud`; every report returns
  JSON `{hidden: boolean}`. Since release `index-BNLZFfL0.js` the client sends `wrong_data` only with
  `detail` ∈ `price`, `rooms`, `place`, `photos`, `other` and never sends `detail` with another reason; older cached
  bundles still send `wrong_data` without it, so the server must accept both bodies. Since release
  `index-CIa0Ldj2.js` the answer to `agent` may also carry `agent_marked` (BR-API-191). *Evidence:* Doc:675-705;
  `src/lib/api/listings.js:86-90`; `src/features/listing/ListingActionsSheet.jsx:176-200`; current
  `$KVADRO_ROOT/docs/api.md:724-744`.
- **BR-API-102** · `DOCUMENTED_ONLY` — `rented` hides the listing for the voter at once and for others after more
  confirmations (threshold 🔶); the bot offers «↩️ Не сдано». Since release `index-CIa0Ldj2.js` the Mini App has its
  undo too: `DELETE /api/listings/:id/report` (BR-API-190). *Evidence:* About:223.
- **BR-API-103** · `DOCUMENTED_ONLY` — `agent` marks the phone as a realtor's in all its listings (🔶 possibly after a
  vote threshold); the bot has no undo. *Evidence:* About:158, :224; Bot:988, :1035.
- **BR-API-104** · `DOCUMENTED_ONLY` — `fraud` may hide the listing for the reporter immediately (`hidden: true`),
  undone with `DELETE /api/listings/:id/hide`. *Evidence:* About:225.
- **BR-API-105** · `CONFIRMED` — `agent` is not offered when the card has `is_owner: false`. Since release
  `index-CIa0Ldj2.js` also not when the author is not a phone (`author.kind !== "phone"`, or no author). *Evidence:*
  `ListingActionsSheet.jsx:12`; `demo/app/docs/CHANGELOG.md:20`; `ListingScreen.jsx:389-390`,
  `ListingActionsSheet.jsx:177` at r33; Doc r35:337-341.
- **BR-API-106** · `DOCUMENTED_ONLY` — Votes are weighted by Premium, `@username`, profile photo and approximate
  account age from the Telegram id (formula 🔶). *Evidence:* About:155, :228.
- **BR-API-190** · `DOCUMENTED_ONLY` — Since release `index-CIa0Ldj2.js` `DELETE /api/listings/:id/report` withdraws
  the caller's report on the listing. It has no body, the client does not read the answer (`204` is recommended) and
  calls it only to undo «Уже сдано». Which reasons it withdraws, what it does with a report that already changed the
  listing for other users, and what a repeat answers are not documented. *Evidence:* Doc r35:126, :860-864, :1365,
  :1422-1426; `src/lib/api/listings.js:87-90`, `src/app/useListingActions.js:36-50` (at r33). (Q-API-079)
- **BR-API-191** · `DOCUMENTED_ONLY` — Since release `index-CIa0Ldj2.js` the answer to a report with
  `reason: "agent"` may carry `agent_marked`: `true` when the number is now marked as a realtor's, `false` or absent
  when the vote was only counted. The server decides by the sum of marks; the threshold is not documented.
  *Evidence:* Doc r35:840-852, :1372-1373; `src/features/listing/ListingActionsSheet.jsx:93-103`,
  `src/app/useListingActions.js:72-74` (at r33); mock `tools/parity/mocks.mjs:190-195`. (Q-API-039, Q-API-083)
- **Q-API-038** — Semantics of repeated `favorite` (toggle race), `hide`, `block-author`, `report` (same user, same
  reason): duplicate rows, ignored, re-counted? **Narrowed by release `index-CIa0Ldj2.js`:** `favorite` sets the state
  given in the body, so a repeat is idempotent for the new client; a request without a body still toggles
  (BR-API-197). Still open: `hide`, `block-author`, `report`. *Check:* call each twice in parallel and sequentially
  with a test account; inspect resulting state.
- **Q-API-039** — Thresholds for `rented` and `agent`, and the anti-abuse weighting formula. `agent_marked`
  (BR-API-191) shows that a mark is not immediate; the numbers stay unknown. *Check:* owner interview; legacy
  configuration.
- **Q-API-040** — Does `DELETE /api/listings/:id/hide` also withdraw a `rented` vote or a `fraud` report (the bot's
  «↩️ Не сдано» is assumed to map to it 🔶)? **Narrowed by release `index-CIa0Ldj2.js`:** the Mini App withdraws «Уже
  сдано» with a method of its own (`08` API-055), and unhides locally. Still open: what `DELETE …/hide` does with a
  vote, and what the bot's «↩️ Не сдано» calls (Q-API-079). *Check:* vote `rented` in the bot, press «↩️ Не сдано»,
  compare with the Mini App undo.
- **Q-API-064** — What does the server do with the `detail` of a `wrong_data` report: keep it for moderation only, or
  also let it change `hidden` or the listing? How does it answer a `detail` with another reason, or an unknown code
  (the current client sends neither)? The legacy contract leaves this open (current
  `$KVADRO_ROOT/docs/api.md:1198-1199`). *Check:* with a test account send `wrong_data` with each of the five codes,
  without `detail` and with an unknown code, and `fraud` with a `detail`; compare status, `hidden` and what moderation
  sees.
- **Q-API-079** — `DELETE /api/listings/:id/report`: which of the caller's reports it withdraws (only `rented`, or any
  reason); what happens when the report already changed the listing for other users; the answer and the status of a
  repeat and of a call without a report; whether it also removes the hidden row; whether the bot's «↩️ Не сдано» is
  the same operation (Q-API-040). Legacy asks the first two itself (Doc r35:1422-1426, open question 18). *Check:*
  report a listing as `rented` from one account, send the DELETE twice, and once for a listing never reported; read
  the feed and `GET /api/hidden` after each call, and compare with «↩️ Не сдано» in the bot: the operator's answer; a
  test account on the legacy product, with the product owner's approval.
- **LB-API-015** · `bug` · `CONFIRMED` — A `204` from `POST …/report` makes the client read `undefined.hidden`, so the
  user sees «Не получилось сохранить» although the report was stored. *Evidence:* Doc:704-705;
  `ListingActionsSheet.jsx:89-95`; mock `tools/parity/mocks.mjs:175-177`.
  - **Proposed fix:** always return `200 {"hidden": <bool>}`.
  - **Old-client impact:** compatible.

## 12. Owner verification (`/owner`)

- **BR-API-107** · `DOCUMENTED_ONLY` — In the bot the user shares their own number (`request_contact`); the server
  stores a hash of the number and the date. *Evidence:* About:133, :232.
- **BR-API-108** · `DOCUMENTED_ONLY` — Listings whose phone matches the hash get `owner_verified`
  («Хозяин · номер подтверждён», card badge «Хозяин ✓»; since release `index-CBlEKxdL.js` the badge and the chip of
  the listing screen read «Проверенный хозяин»). *Evidence:* About:233-234; `ru.js:100`, also at r31 for the new
  text; Doc r31:274-276.
- **BR-API-109** · `DOCUMENTED_ONLY` — The mark is not applied if the number appears in listings of ≥ 3 different
  flats or is marked as a realtor's. *Evidence:* About:234-235.
- **BR-API-110** · `DOCUMENTED_ONLY` — The user can remove the number. *Evidence:* About:235.
- **BR-API-111** · `CONFIRMED` — Card badge priority: «Подозрительно дёшево» > «Проверьте цену» > «Хозяин ✓»
  (`owner_verified`) > «Хозяин» (`is_owner`) > «Ниже рынка», since release `index-Dbpp463V.js`; before it the
  changelog listed «Проверьте цену» > «Хозяин ✓» > «Ниже рынка» > «Хозяин». Release `index-CBlEKxdL.js` renames
  «Хозяин ✓» to «Проверенный хозяин» and gives the badges kinds (`03` BR-APP-026); the order is unchanged.
  *Evidence:* `demo/app/docs/CHANGELOG.md:58` (the audit cited the old order at `CHANGELOG.md:33` of the audited
  tree); current `$KVADRO_ROOT/docs/api.md:253-254`; `demo/app/docs/CHANGELOG.md:24` at r31.
- **Q-API-041** — Hash algorithm (salted? keyed?) and normalisation of the number — required to migrate verifications.
  *Check:* owner interview / legacy code.

## 12a. Owner cabinet «Сдать квартиру» and contact requests (release `index-CBlEKxdL.js`)

Everything in this section comes from the contract of the release (`$KVADRO_ROOT/docs/api.md` §16 and `:818-839` at
r31, "Doc r31:"), from the Mini App code at r31 and from its texts. No server or bot code was seen, and the
recovery's parity runs checked the client on mocks that its authors inferred, not on the real API. The methods are
`08` API-037 … API-054, the screens `03` SCR-049 … SCR-062, and the bot's side is `04` §3.18.

- **BR-API-159** · `CONFIRMED` — Owner-side enums and shapes are a strict contract: `OwnerListing.status` is `draft`,
  `active`, `paused`, `rented`, `removed` or `rejected` (with the flags `withdrawn` and `held`), `OwnerRequest.status`
  is `pending`, `given`, `declined`, `agent`, `expired` or `cancelled`, `who` is `one`, `couple`, `family`, `students`
  or `friends`; `form` is always an object and `photos` always an array. Any other value crashes the owner screens
  (`03` LB-APP-064). *Evidence:* Doc r31:1283-1285, :1355-1371, :1413-1427; `src/features/owner/OwnerListings.jsx:50`,
  :542, :571, :606.
- **BR-API-160** · `CONFIRMED` — Owner methods report refusals as `detail` strings that the client parses:
  `invalid:<fields>` (`422`), `missing:<fields>`, `status:…` (`409`), `rejected:<reason>` and `photo:too_many`,
  `photo:not_image`, `photo:too_big`. *Evidence:* Doc r31:1286-1288, :1439-1442, :1450-1454;
  `src/features/owner/OwnerForm.jsx:668-741`, :1437-1447.
- **BR-API-161** · `UNVERIFIED` — The client sends no role and no owner id: the server alone ties a listing `:id` or a
  request id to the caller. Its answer for another user's id is not documented. *Evidence:* Doc r31:31-44;
  `src/lib/api/owner.js`. (Q-API-069)
- **BR-API-162** · `DOCUMENTED_ONLY` — An owner may list `max` flats at once (2 today). `GET /api/owner/listings`
  answers `{items, max, can_add, past?}` with every listing of the user, `can_add: false` at the limit and `past` the
  number of flats listed before; `POST /api/owner/listings` answers `409` at the limit. Whether the limit counts per
  account or per phone, and whether drafts count, is not documented. *Evidence:* Doc r31:1406-1411, :1430-1435.
  (Q-API-068)
- **BR-API-163** · `DOCUMENTED_ONLY` — `POST /api/owner/listings` has no body and returns a new draft on every call;
  nothing says that an untouched draft is reused. *Evidence:* Doc r31:1434-1435; `src/lib/api/owner.js:30-34`.
  (Q-API-068; `03` LB-APP-054)
- **BR-API-164** · `DOCUMENTED_ONLY` — `PATCH /api/owner/listings/:id` takes only the changed form fields, and `null`
  clears one. `409` or `missing:status` means the listing can no longer be edited; `422 invalid:<fields>` names the
  rejected fields. The accepted ranges are not documented. *Evidence:* Doc r31:1373-1391, :1439-1442. (Q-API-069)
- **BR-API-165** · `DOCUMENTED_ONLY` — The server must hide phone numbers written into the owner's description.
  *Evidence:* Doc r31:1390; `src/features/owner/owner.js:73`.
- **BR-API-166** · `DOCUMENTED_ONLY` — Photos are uploaded one per call as the multipart field `file`, at most 10 per
  listing. The first is the cover, `photos/order` takes the full list of ids, and every photo URL has a `.s.jpg`
  thumbnail. Since release `index-YX9bFVws.js` the form sends the upload by `XMLHttpRequest` (same header, 90 s
  timeout) to draw its progress. It takes only a `2xx` with a JSON body as success, and it finds the new photos by
  the `photos[].id` that were not in the listing before, so the server must answer JSON on success and on error and
  keep photo ids stable between answers (`08` API-041). *Evidence:* Doc r31:1230-1231, :1443-1447;
  `src/lib/api/owner.js:57-85`; Doc r38:1408-1410, :1580-1584; `src/lib/api/owner.js:61-90`,
  `src/features/owner/OwnerForm.jsx:572-590` (at r38).
- **BR-API-167** · `DOCUMENTED_ONLY` — Seekers never see the exact point of a cabinet listing: the server serves
  `shown_point {lat, lon, radius_m}`, a circle of about 500 m. *Evidence:* Doc r31:1355-1371;
  `src/features/owner/OwnerForm.jsx:980-989`, :1010-1016. (Q-API-074)
- **BR-API-168** · `DOCUMENTED_ONLY` — `POST /api/owner/place {lat, lon}` answers `{address?, city?, district_code?,
  landmark?}` for a point, and `GET /api/owner/map-start` answers `{lat, lon, zoom}` for the caller, «примерно по IP»
  in the client's words. The data sources are not documented. *Evidence:* Doc r31:1471-1475;
  `src/lib/api/owner.js:157`. (Q-API-074)
- **BR-API-169** · `DOCUMENTED_ONLY` — `GET /api/owner/demand` answers `{count, usual_low_usd, usual_high_usd}`: the
  number of active radars that match the flat, and the usual price range for its rooms and place, in USD whatever the
  form's currency. *Evidence:* Doc r31:1476-1479; `src/lib/api/owner.js:165-184`.
- **BR-API-170** · `DOCUMENTED_ONLY` — The owner's phone is confirmed through the bot: the contact shared with
  `WebApp.requestContact` arrives in the bot chat, the server then sets `phone_set` and `phone_display` on the
  listing, and the Mini App learns it only from `GET /api/owner/listings/:id`, which it polls every 1.5 s for up to
  90 s. *Evidence:* Doc r31:1346-1348, :1436-1438; `src/features/owner/OwnerForm.jsx:1484-1620`.
- **BR-API-171** · `UNVERIFIED` — The server decides whether the shared number is accepted. On a draft,
  `reject_reason: not_own` means the contact of another account and `not_uz` a number that is not `+998`. `status:
  rejected` comes with `reject_reason` `agent` (the number appears in listings of different flats), `fraud` (the
  number is refused) or `limit` (two flats are already listed with it). The rules behind `agent` and `fraud` are known
  only from the Mini App's texts. *Evidence:* Doc r31:1366-1369; `src/features/owner/owner.js:89-107`. (Q-API-072)
- **BR-API-172** · `UNVERIFIED` — The cabinet keeps the owner's number itself, not a hash as `/owner` does
  (BR-API-107): `phone_display` shows it to the owner, «Дать номер» hands it to a seeker, and `open` mode shows it on
  the card. Where and how long it is stored is known only from a landing privacy text that was an uncommitted working
  copy at the read. *Evidence:* Doc r31:1366-1367; `src/features/owner/OwnerForm.jsx:947-949`;
  `src/features/owner/owner.js:219`. (Q-API-072; LB-API-056)
- **BR-API-173** · `DOCUMENTED_ONLY` — `contact_mode` is `gate`, `open` or `null`. `gate` hides the number, and
  seekers send a request (`08` API-054); `open` shows the number on the card to everyone. The value is `null` until
  the owner chooses, and publishing does not require a choice. *Evidence:* Doc r31:386-391, :1365, :1448-1449;
  `src/features/owner/OwnerForm.jsx:906-929`. (Q-API-078; `03` LB-APP-056)
- **BR-API-174** · `DOCUMENTED_ONLY` — `POST …/publish` has no body. It refuses with `missing:<fields>` (from `city`,
  `place`, `rooms`, `price`, `photos`, `phone`, `limit`, `status`), `409 status:…` or `rejected:<reason>` (`agent`,
  `fraud`, `limit`). The same call saves the edits of a listing that is already published. The contract names no check
  of photos or text before a listing goes live. *Evidence:* Doc r31:1450-1454. (Q-API-070, Q-API-071)
- **BR-API-175** · `UNVERIFIED` — A published listing appears in the feed and is sent to the matching radars at once:
  the done screen says «уже уходит тем, у кого включён радар», and the stats count `sent` as «получили по радару».
  *Evidence:* Doc r31:1393-1404; `src/features/owner/owner.js:131`. (Q-API-071)
- **BR-API-176** · `UNVERIFIED` — `POST …/status` takes `active`, `paused`, `rented` or `removed`. By the Mini App's
  texts `paused` takes the listing out of the feed and the radars, `active` puts it back, `rented` takes it out and
  tells the seekers who still wait that the flat is let (their requests become `cancelled`), and `removed` withdraws a
  listing or deletes a draft. The client offers no way out of `rented` or `removed`. *Evidence:* Doc r31:1455-1457;
  `src/features/owner/owner.js:203-211`, :240. (Q-API-070)
- **BR-API-177** · `DOCUMENTED_ONLY` — Two states are set by the service, not by the owner: `withdrawn` (taken down
  after complaints; the listing moves to «История») and `held` (paused by support; the owner cannot resume it).
  *Evidence:* Doc r31:1358-1359; `src/features/owner/OwnerListings.jsx:86-87`, :282-284. (Q-API-071)
- **BR-API-178** · `DOCUMENTED_ONLY` — `OwnerListing.stats` is `null` or `{pending, requests, given, sent, opened,
  favorites?, days_listed?, daily[], price_delta?, price_tone?}`; the last value of `daily` is today. *Evidence:* Doc
  r31:1393-1404. (Q-API-078)
- **BR-API-179** · `CONFIRMED` — `GET /api/owner/pending` answers `{pending: number}`, always a number. The client
  calls it for every user at start and on every return to the app, also for users who never listed a flat. *Evidence:*
  Doc r31:1289, :1460-1462; `src/lib/ownerPending.js:40-55`; `src/app/App.jsx:141`. (`03` LB-APP-066)
- **BR-API-180** · `DOCUMENTED_ONLY` — `GET /api/owner/requests?owner_listing_id=<id>` answers `OwnerRequest[]`: `id`,
  `name` (the seeker's Telegram name), `who`, `people`, `move_in`, `message`, `status`, `agent_marked?` and the flags
  `can_reason`, `can_undo` and `can_late`, by which the server decides which answers the owner may still give.
  *Evidence:* Doc r31:1413-1427, :1463; `src/lib/api/owner.js:122-127`. (Q-API-077)
- **BR-API-181** · `UNVERIFIED` — `POST /api/owner/requests/:id {action}` takes `give`, `decline`, `reason_found`,
  `reason_agent`, `undo` or `late` and returns the request; `409` means the action is no longer possible. By the Mini
  App's texts `give` sends the owner's number to the seeker at once, `decline` sends a soft refusal with similar
  listings after 10 minutes, which is also the window of `undo`, and `reason_agent` or `late` marks the seeker as a
  realtor who can no longer write to this owner's flats. *Evidence:* Doc r31:1464-1466;
  `src/features/owner/owner.js:219-234`. (Q-API-075, Q-API-077)
- **BR-API-182** · `DOCUMENTED_ONLY` — `POST /api/owner/waitlist` has no body, and its answer is not read. It records
  a user whose number was refused as a realtor's; the Mini App promises a bot message «когда откроем». *Evidence:* Doc
  r31:1469-1470; `src/features/owner/owner.js:110`. (`04` Q-BOT-049)
- **BR-API-183** · `DOCUMENTED_ONLY` — `POST /api/listings/:id/contact {who, people, move_in, message}` creates a
  seeker's request to an owner who hides the number: `who` is required, `people` is 1…20, `move_in` holds at most 32
  characters and `message` at most 500, both nullable. The answer `{status}` becomes `my_request` of the card.
  *Evidence:* Doc r31:818-839; `src/features/listing/ContactRequestSheet.jsx:50-85`; `src/lib/api/owner.js:191-192`.
  (Q-API-075)
- **BR-API-184** · `CONFIRMED` — `409 no_chat` on that method is answered before a request is created; the client asks
  for write access and repeats the call once. *Evidence:* Doc r31:837-838, :1290;
  `src/features/listing/ContactRequestSheet.jsx:59-68`; `src/lib/chatAccess.js:27-55`.
- **BR-API-185** · `DOCUMENTED_ONLY` — The method refuses with the `detail` codes `limit_fast`, `limit_day`,
  `limit_week`, `blocked`, `harvest`, `closed`, `own` and `open`. The limits are the server's; the Mini App's texts
  name 10 requests a day, 30 a week and a 10-minute pause after several in a row. The HTTP statuses are not
  documented. *Evidence:* Doc r31:838-839; `src/i18n/locales/ru.js:632-644`;
  `src/features/listing/ContactRequestSheet.jsx:25-26`, :71-80. (Q-API-076)
- **BR-API-186** · `DOCUMENTED_ONLY` — A request is `pending`, `given`, `declined`, `agent`, `expired` or `cancelled`.
  The seeker reads the status only as `my_request` on `GET /api/listings/:id` of its own card, and the owner's answer
  reaches the seeker through the bot. *Evidence:* Doc r31:348, :1413-1425; `src/i18n/locales/ru.js:619-620`, :646.
  (Q-API-075)
- **BR-API-187** · `DOCUMENTED_ONLY` — After `given` the seeker's card is expected to carry `phone`; until then a gate
  listing has none. *Evidence:* Doc r31:386-391; `src/features/listing/ListingScreen.jsx:206`, :334-340. (Q-API-076;
  `03` LB-APP-074)
- **BR-API-188** · `DOCUMENTED_ONLY` — The card of a listing placed through the cabinet has `owner_self: true`,
  `contact_mode`, `response_minutes` and `owner_description`, no channel source and one history entry without a
  channel; for its author it also has `owner_mine` and `owner_listing_id`. `owner_mine` and `my_request` depend on the
  caller. Since release `index-YX9bFVws.js` any card may also carry `owner_entry?: boolean`, read with a truthy
  check, which ends the card with an invitation into the cabinet (`08` API-008; `03` BR-APP-115); when the server
  sets it is not documented, and legacy's contract asks it itself (its open question 19). *Evidence:* Doc
  r31:343-350, :396-397; `src/features/listing/ListingScreen.jsx:205-211`, :285-303; Doc r38:368-369, :1406-1407,
  :1453-1454; `src/features/listing/ListingScreen.jsx:347` (at r38). (Q-API-076, Q-API-078)
- **BR-API-189** · `UNVERIFIED` — The server writes the owner tier into the `owner` label: «Проверенный хозяин…» for a
  verified or self-placed listing, «Хозяин — со слов объявления» for a claimed one; the client hides such a label by
  comparing it with its own texts. This is inferred from the parity mock. *Evidence:* Doc r31:392-395;
  `src/features/listing/sections/AuthorSection.jsx:7-23`; `tools/parity/mocks.mjs:300`. (Q-API-078; `03` LB-APP-075)
- **Q-API-068** — The apartment limit and drafts: is `max` / `can_add` counted per account or per confirmed phone (the
  sheet says «на один номер», the phone check answers `limit`); do drafts count; is `max` configuration; does
  `POST /api/owner/listings` return an existing untouched draft or always a new row? *Check:* open a new form twice
  and compare the draft ids; list flats up to `max` on one account, then confirm the same phone on a second account
  and read `can_add` and the phone check: the operator's answer; a test owner listing and a test seeker account on
  the legacy product, with the product owner's approval.
- **Q-API-069** — Validation of the owner form: the accepted ranges for area, floor, number of floors, price per
  currency and tenants; the full `detail` vocabulary of the owner methods with the HTTP status of each; the answer for a
  listing or request id of another user; who may join the waiting list and what it stores. Legacy asks the first two
  itself (Doc r31:1321-1325, open question 17). *Check:* send out-of-range values in `PATCH` and record status and
  `detail`; call the owner methods with a listing id and a request id of the second account: the operator's answer; a
  test owner listing and a test seeker account on the legacy product, with the product owner's approval.
- **Q-API-070** — Edits and states of a published listing: what a first `publish` sets (the status, the time, the id of
  the public listing); does a `PATCH` or a photo change reach the public listing at once or only after `publish`; what
  happens when the last photo of a live listing is deleted; does `publish` resume a `paused` listing; can a `rejected`
  listing be published again; are the transitions out of `rented` and `removed` refused, and `active` on a `held` listing?
  *Check:* on a published test listing change the price and a photo and read the public card before and after `publish`;
  delete its last photo; publish it while `paused`; send each status after `rented` and after `removed`: the operator's
  answer; a test owner listing and a test seeker account on the legacy product, with the product owner's approval.
- **Q-API-071** — Checks around publishing: is there any automatic or manual check of photos, description or price
  before a listing goes live; who sets `withdrawn` (which complaints, how many) and `held`, and how is the owner told;
  is the listing sent to matching radars at once, and what does `sent` count? *Check:* publish a test listing that a
  radar of the test seeker matches, and record when it appears in the feed and in the bot chat and what `sent` shows:
  the operator's answer; a test owner listing and a test seeker account on the legacy product, with the product
  owner's approval.
- **Q-API-072** — The phone checks and the stored number: the rule behind `agent` (in how many listings of different
  flats the number must appear; `/owner` refuses the badge at 3 or more, BR-API-109, the cabinet's limit is 2), the
  source of the `fraud` list and the appeal path; whether the checks run when the contact arrives, at publish, or
  both; where the number itself is stored, for how long, and whether deleting the user's data erases it. The landing
  privacy text of the release was an uncommitted working copy at the read. *Check:* confirm a phone on a test
  account and read `phone_display` and `reject_reason`; confirm a number that already stands in listings of other
  flats; ask where the number is kept and what «Удалить мои данные» erases: the operator's answer; a test owner
  listing and a test seeker account on the legacy product, with the product owner's approval.
- **Q-API-073** — Owner photos: does the server re-encode an upload and strip EXIF and GPS data; which formats and
  sizes does it accept (`photo:not_image`, `photo:too_big`); is the `.s.jpg` thumbnail made at upload; how long are
  photos kept after `rented` or `removed`? *Check:* upload a photo with EXIF and GPS data, a PNG and a HEIC named
  `photo.jpg` and an oversize file; download what the listing serves and inspect it; request the photo URLs again
  after `removed`: the operator's answer; a test owner listing and a test seeker account on the legacy product, with
  the product owner's approval.
- **Q-API-074** — Place and position: the source of the address lookup of `POST /api/owner/place`; whether
  `GET /api/owner/map-start` uses IP geolocation and whether either call stores the position; how `shown_point` is
  derived (a fixed offset per listing?) and whether the exact point appears in any public answer; whether the server
  checks the point against the country (the client checks only a rectangle, `03` LB-APP-063). *Check:* read
  `shown_point` of one test listing several times and compare it with the saved point and with the public card; call
  `map-start` from two networks; save a point outside the country: the operator's answer; a test owner listing and a
  test seeker account on the legacy product, with the product owner's approval.
- **Q-API-075** — The life of a request: when it becomes `expired`; the delay of the soft refusal and the window of
  `undo` (the texts say 10 minutes) and how long `can_late` lasts; what `undo` does for each status; whether a seeker
  may send a new request after `expired`, `declined` or `cancelled`; what a second request to the same listing answers
  while one is `pending`; whether creation can answer anything other than `pending`; the order of
  `GET /api/owner/requests`. *Check:* send a request and leave it unanswered; decline, undo and mark requests at
  different times and read the flags of `GET /api/owner/requests`; send a second request while one is `pending` and
  after each closed status: the operator's answer; a test owner listing and a test seeker account on the legacy
  product, with the product owner's approval.
- **Q-API-076** — The seeker's side: the values and windows behind `limit_fast`, `limit_day`, `limit_week` and whether they
  count per user; what triggers `blocked` and `harvest`; the HTTP status of each `detail` code; how the request body is
  checked (a `who` outside the list, too long texts); what `given` delivers (the number in the bot, `phone` on the card, or
  both: `03` LB-APP-074); how `response_minutes` is computed. *Check:* send requests in a row from the test seeker until
  each limit answers, and record status and `detail`; after «Дать номер» read the seeker's card and bot chat: the operator's
  answer; a test owner listing and a test seeker account on the legacy product, with the product owner's approval.
- **Q-API-077** — The seeker shown to the owner: is `OwnerRequest.name` stored with the request or read from Telegram
  when the list is shown (the uncommitted privacy text says the name is not stored); what a seeker marked `agent` can
  still do (barred from this owner's flats only, or more), and whether the seeker is told. *Check:* change the test
  seeker's Telegram name after a request and read `name` again; mark the seeker with `reason_agent` and send a new
  request to the same owner and to another one: the operator's answer; a test owner listing and a test seeker account
  on the legacy product, with the product owner's approval.
- **Q-API-078** — Owner fields on listing cards: is `owner_verified` always true when `owner_self` is (the feed badge
  reads only `owner_verified`); does the server prefix the `owner` label with «Проверенный хозяин» or set «Хозяин — со
  слов объявления» (inferred from the parity mock, `03` LB-APP-075); the `contact_mode` of a listing published without
  a choice (`03` LB-APP-056); the unit of `stats.price_delta` (Doc r31:1325) and whether the market verdict applies to
  cabinet listings; `sources` and `original_url` of a self-placed listing. *Check:* publish a test listing without
  choosing a mode, then read its feed item, its card and its `stats` as the owner and as the test seeker: the
  operator's answer; a test owner listing and a test seeker account on the legacy product, with the product owner's
  approval.

## 13. Call page and contact

- **BR-API-112** · `CONFIRMED` — Calls go through a signed temporary page `/call/<token>`; the client treats a link as
  valid for 10 minutes and refreshes it 2 minutes before expiry (timer while visible, on return, on tap). *Evidence:*
  `useListingContact.js:9-10`, :24-72; About:239-240.
- **BR-API-113** · `CONFIRMED` — `phone` non-null ⇒ `call_url` non-null; a number in the original text becomes a call
  button only if it normalises to `phone`. *Evidence:* Doc:351-353.
- **BR-API-114** · `CONFIRMED` — On Android the client dials `tel:<phone>` and falls back to the call page if the app
  was not left within 1.2 s; on other platforms it opens the call page; `contact_call.via` reports `tel`/`browser`.
  *Evidence:* `src/lib/telegram/links.js:5`, :14-40.
- **BR-API-115** · `CONFIRMED` — `contact_url` drives «Написать»; with `contact_paid: true` the button reads «Номер
  платный» without an icon. *Evidence:* `src/features/listing/ListingCtaBar.jsx:35-39`; `ru.js:169-170`.
- **BR-API-116** · `CONFIRMED` — `phone` format is `+998XXXXXXXXX`; `phone_display` is the formatted form. *Evidence:*
  Doc:316-317.
- **Q-API-042** — Call link TTL, single-use, binding to the requesting user, and the content of the `/call` page.
  *Check:* with a test account open a call link after 5, 11 and 60 minutes, twice, and from another device; capture
  the page HTML.
- **Q-API-043** — What `contact_paid` means and whether any paid feature exists. *Check:* owner interview; find a
  listing with `contact_paid: true`.
- **LB-API-016** · `quirk` · `CONFIRMED` — With `phone` but no `call_url`, «Позвонить» does nothing outside Android
  (and on Android when `tel:` fails). *Evidence:* Doc:351-353; `useListingContact.js:62-73`.
  - **Proposed fix:** the serializer issues `call_url` whenever it returns `phone`; contract test enforces it.
  - **Old-client impact:** compatible.

## 14. Sharing and attribution

- **BR-API-117** · `CONFIRMED` — Sharing prepares a Telegram message server-side and returns its id for
  `WebApp.shareMessage`; on any failure the client shares `https://t.me/<bot>?startapp=l_<id>` with a text built from
  title, price, kind and district. *Evidence:* Doc:707-717; `src/features/listing/ListingTitleRow.jsx:28-49`.
- **BR-API-118** · `UNVERIFIED` — The prepared message is created with Bot API `savePreparedInlineMessage` for the
  requesting user. *Evidence:* About:245-246 (🔶). (Q-API-044)
- **BR-API-119** · `CONFIRMED` — Mini App deep links: `startapp=l_<id>[-<source>]` with source `web`, a campaign
  `fb|tg|ig` + 1–4 digits, `seo[-<channel>-<post>]`, anything else = `share`; page params `?listing=<id>` and
  `?news=<code>` (`[a-z_]`, ≤ 32 chars). *Evidence:* `src/lib/telegram/startParam.js:2`, :17-53; Doc:1033-1035.
- **BR-API-120** · `CONFIRMED` — Bot deep links produced by the legacy clients: `s_web[_<tag>][--v<visit>]` (landing;
  tag `[a-z0-9_-]{1,40}` from `?s=`/`?utm_source=`, visit `[a-z0-9]{10}`), `s_<source>--l<id>` (no-access screen),
  `s_friend` (survey «Рассказать друзьям»), `s_seo[_<lang>][_<slice>]` (SEO pages). *Evidence:*
  `$KVADRO_ROOT/demo/landing/site/landing.js:26-43`; `NoAccessScreen.jsx:66`;
  `src/features/radar/FoundSheet.jsx:119`; SEO:356-369.
- **BR-API-121** · `DOCUMENTED_ONLY` — The bot stores the acquisition source from `/start` and joins the website visit
  number with the bot user in PostHog. *Evidence:* About:258; Bot:1004-1006.
- **Q-API-044** — How `POST /api/listings/:id/share` builds the prepared message (Bot API method, content, buttons,
  expiry, per-user scope)? *Check:* share from a test account and inspect the delivered message and its button;
  owner interview.

## 15. Analytics and action log

- **BR-API-122** · `CONFIRMED` — `POST /api/events` accepts `{name, …props}` with properties at the top level from
  two producers (React `fetch` with `keepalive`; boot `XMLHttpRequest`), tolerates unknown fields and answers `204`.
  *Evidence:* Doc:972-1046; `src/lib/api/events.js:9-35`; `index.html:69-90`.
- **BR-API-123** · `CONFIRMED` — The event catalogue is closed in the current client: `app_launch`, `app_opened`,
  `app_error`, `follow_prompt_shown|expired|closed`, `home_screen_offered|added|closed`,
  `chat_access_declined|allowed`, `listing_shared`, `original_opened`, `original_copied`, `contact_call`,
  `contact_write`; since release `index-DY_DH7h-.js` also `return_prompt_shown|expired|closed` and
  `feed_radar_shown|closed`, each with `custom` and `return_prompt_shown` with `n` (properties in `08` API-034).
  Since release `index-CIa0Ldj2.js` also six events of the owner cabinet (`owner_attention`, `owner_mascot_tap`,
  `owner_limit_sheet`, `owner_place_set`, `owner_place_autofill`, `owner_hint_opened`) and a form of `app_error` with
  `source: "i18n"` for a missing dictionary key.
  *Evidence:* Doc:1015-1042; 15 `trackEvent` call sites; at the pin current Doc:1076-1107 and 20 call sites; Doc
  r35:1256-1261, :1278-1289.
- **BR-API-124** · `CONFIRMED` — `app_error` volume is bounded client-side: ≤ 5 distinct errors per session, each
  `kind|name|message` once; `message` ≤ 300, `source` ≤ 300 without query/hash, `name`/`screen`/`v` ≤ 40, `tg` ≤ 10,
  `platform` ≤ 20. *Evidence:* `src/lib/errors.js:10`, :41-94; `index.html:60-88`.
- **BR-API-125** · `DOCUMENTED_ONLY` — The action log is kept 180 days and contains no texts. *Evidence:* About:136,
  :268.
- **BR-API-126** · `DOCUMENTED_ONLY` — Events go to PostHog under a random per-user id instead of the Telegram id;
  `meta.analytics.id` delivers that id to the client (`bootstrap.distinctID`, `isIdentifiedID: true`). *Evidence:*
  About:375-376, :431; `src/lib/analytics.js:157-160`.
- **BR-API-127** · `CONFIRMED` — The client never sends `initData` or the URL hash to PostHog (hash removed before
  init, properties scrubbed, network recording names stripped). *Evidence:* `src/lib/analytics.js:122-180`.
- **BR-API-128** · `DOCUMENTED_ONLY` — «Удалить мои данные» triggers a PostHog person deletion request. *Evidence:*
  About:272-273, :449.
- **Q-API-045** — Maximum `/api/events` payload, per-user rate limit, retention and PII rules for stored events.
  *Check:* owner interview; post a 64 KB event from a test account and record the status.
- **Q-API-046** — Which events are captured server-side to PostHog, where the user → random id mapping lives, and how
  person deletion is called — the mapping must be migrated to keep history (About:431). *Check:* owner interview;
  PostHog project audit.
- **Q-API-047** — When is `meta.analytics` `null`, and how are `env`, `team`, `replay`, `replay_rate` chosen per user?
  *Check:* compare `meta.analytics` for an owner/team account and a regular test account.

## 16. Privacy and data deletion

- **BR-API-129** · `DOCUMENTED_ONLY` — «Удалить мои данные» (bot `/privacy`) deletes the user's data from the database
  immediately and from backups after about two weeks. *Evidence:* About:272.
- **BR-API-130** · `DOCUMENTED_ONLY` — Support conversations: the "message ↔ user" link is kept 90 days, texts until
  the conversation is closed, the Gemini summary one year. *Evidence:* About:269.
- **BR-API-131** · `DOCUMENTED_ONLY` — Geolocation is never sent to the server (city detection runs on the device).
  *Evidence:* About:271.
- **BR-API-132** · `DOCUMENTED_ONLY` — The `/privacy` text is a public promise; HOMI must keep it or publish a new text.
  *Evidence:* About:266, :275.
- **Q-API-048** — Which tables the deletion covers (radars, votes, owner hash, delivered cards, events, attribution),
  how backups age out, and how votes of deleted users are treated. *Check:* owner interview; deletion procedure.

## 17. Landing data jobs and SEO rendering

- **BR-API-133** · `DOCUMENTED_ONLY` — A backend job rewrites `data/live.json`, `data/pins-rent.json`,
  `data/pins-sale.json` and `img/snap/*.webp` on a schedule (2026-11-08: `live.json` 02:02, pins 15:00); served with
  `max-age=1800`. *Evidence:* `$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:60-61`, :68-69.
- **BR-API-134** · `CONFIRMED` — Landing pins carry `x`/`y` as percentages of the static Tashkent map image, a photo
  `img/snap/<id>.webp`, a Mini App link `startapp=l_<id>-web`, and medians by district × rooms (rent). *Evidence:*
  fixtures `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/data/*.json`; `landing.js:1040`, :2242.
- **BR-API-135** · `DOCUMENTED_ONLY` — `/uz/` and `/en/` landing pages are produced by the backend
  (`app/api/landing_pages.py`) from `index.html` + `landing-i18n.js`; the same module rewrites SEO links (`arenda/` →
  `uz/ijara/`, `en/rent/`). *Evidence:* `RECOVERY.md:26`; `$KVADRO_ROOT/demo/landing/site/index.html:367-368`.
- **BR-API-136** · `DOCUMENTED_ONLY` — SEO pages are rendered by the backend from the database
  (`app/api/area_pages.py`), CDN-cached 5 minutes; pages with ≤ 9 listings are `noindex,follow` and excluded from the
  dynamic sitemap (threshold ~10 🔶). *Evidence:* About:524-527; SEO:131-140, :375.
- **BR-API-137** · `DOCUMENTED_ONLY` — `stats.js` is templated by the backend (`app/api/site_stats.py`) with the PostHog
  key and host. *Evidence:* `RECOVERY.md:33`.
- **BR-API-138** · `DOCUMENTED_ONLY` — Landing, privacy and SEO pages send a CSP with sha256 hashes of inline scripts
  and `report-uri /api/csp-report`. *Evidence:* `RECOVERY.md:56-57`; SEO:376-377.
- **BR-API-139** · `DOCUMENTED_ONLY` — Rent index: median of the month's **new** listings (month of first appearance,
  last price); weeks Monday–Sunday; month/week shown only with ≥ 50 listings per rooms; data since 2026-10-01; rent in
  salaries = monthly median in UZS at CBU rate / Natskomstat average salary. *Evidence:* SEO:300-311.
- **Q-API-049** — Do `/api/landing/live` and `/api/landing/pins` exist, and are they the sources the snapshot job
  copies? *Check:* `curl -I https://kvadro.app/api/landing/live` and `/pins`.
- **Q-API-050** — What does `/api/csp-report` do (status, storage, retention, alerting)? *Check:* post a synthetic
  report to the endpoint; owner interview.
- **Q-API-051** — Generator and exact schedule of the landing data and snapshots; selection rules for `latest` and
  `pins` (age, area, tones). *Check:* poll the files' `Last-Modified` for a week; owner interview.
- **LB-API-017** · `bug` · `CONFIRMED` — The landing appends a constant `?v=202610171944` (`DATA_V`) to data files
  that change daily, so the version key never busts caches; freshness depends only on `max-age=1800`, and the code
  comment claims the data is fixed. *Evidence:* `landing.js:60-72`; `RECOVERY.md:68-70`.
  - **Proposed fix:** version data URLs by content hash or generation timestamp published with the page (or drop the
    key and rely on `ETag` + short `max-age`).
  - **Old-client impact:** none for the Mini App; the legacy landing keeps working with the constant key as long as
    the files stay at the same paths.

## 18. Scheduled and background jobs (inferred)

None of these jobs is visible; the table lists what the observable behaviour requires.

| Job | Cadence / trigger | Evidence | Status |
| --- | ----------------- | -------- | ------ |
| Channel polling (217 channels) | periodic, unknown | About:169; SEO:244-247 | `UNVERIFIED` |
| LLM extraction of new posts (phones/handles masked) | per new post | About:172-173 | `DOCUMENTED_ONLY` (trigger `UNVERIFIED`) |
| Duplicate merge, geocoding, distances | per new post | About:174-177 | `DOCUMENTED_ONLY` |
| Photo download and resize (800/480 px) | per new post | About:178 | `DOCUMENTED_ONLY` |
| UZS→USD conversion at the CBU rate; `usd_uzs` refresh | daily? | About:170, :342; SEO:249 | `UNVERIFIED` |
| District medians | hourly | SEO:268 | `DOCUMENTED_ONLY` |
| Radar matching and instant delivery (respecting quiet hours) | per new/changed listing | About:202-207 | `UNVERIFIED` |
| Digest sending | at each digest hour, Asia/Tashkent | About:205-206, :344 | `DOCUMENTED_ONLY` |
| Morning digest after quiet hours | end of the user's quiet window | About:206-207 | `DOCUMENTED_ONLY` |
| Edit sent cards to «Объявление снято» | on withdrawal | About:182-183 | `DOCUMENTED_ONLY` |
| Purge PII of withdrawn listings | 90 days after withdrawal | About:181-183 | `DOCUMENTED_ONLY` |
| Purge action log | after 180 days | About:268 | `DOCUMENTED_ONLY` |
| Purge support mappings / summaries | 90 days / 1 year | About:269 | `DOCUMENTED_ONLY` |
| Backups and their expiry | ~2 weeks retention | About:272, :588-589 | `DOCUMENTED_ONLY` |
| Landing data and snapshots | daily (02:02, 15:00 observed) | `RECOVERY.md:68` | `DOCUMENTED_ONLY` |
| Rent index and sale price series | monthly/weekly | SEO:300-318 | `DOCUMENTED_ONLY` |
| PostHog person deletion | on user request | About:272-273 | `DOCUMENTED_ONLY` |
| Rented/agent vote evaluation | per vote or batch | About:223-224 | `UNVERIFIED` |

- **Q-API-052** — Exact schedules, concurrency and failure handling of every job above. *Check:* owner interview;
  crontab/systemd/queue configuration of the legacy host.
- **Q-API-058** — Which admin and moderation tools exist (beta seats and invites, takedowns, channel opt-outs,
  «Новости сервиса» broadcasts, blocking users)? *Check:* owner interview (About:584-585).

## 19. External integrations

| Integration | Use | Evidence | Status |
| ----------- | --- | -------- | ------ |
| Telegram Bot API (`@KvadroAppBot`) | delivery, editing sent cards, `request_contact`, button styles (Bot API 9.x), `setMyCommands` per language, prepared inline messages 🔶, reactions, media groups, venues | About:309-326 | `DOCUMENTED_ONLY` |
| Telegram public channel pages | source of listings (217 channels) | About:117, :169 | `DOCUMENTED_ONLY` |
| Telegram Mini App platform | `initData` signing, `shareMessage`, `requestWriteAccess`, `openLink`, `DeviceStorage` | `src/lib/telegram/*` | `CONFIRMED` |
| `@KvadroSupportBot` | support conversations, takedown requests | Doc:503-504; About:586 | `DOCUMENTED_ONLY` (not researched) |
| Google Gemini | listing extraction, user query parsing (text, voice), translation, support summaries | About:111, :269 | `DOCUMENTED_ONLY` |
| PostHog EU | client analytics (Mini App, landing, SEO), server-side events, person deletion | About:115, :375-376, :449 | `DOCUMENTED_ONLY` |
| Cloudflare | edge/CDN, Email Obfuscation, `/cdn-cgi/` | About:116; SEO:375-378 | `DOCUMENTED_ONLY` |
| Central Bank of Uzbekistan rate | UZS→USD for prices, `usd_uzs` | About:170, :342; SEO:249 | `DOCUMENTED_ONLY` |
| Protomaps basemap tiles (PMTiles or `/tiles`) | Mini App map | Doc:1065-1074; About:114 | `CONFIRMED` (client) |
| OpenStreetMap tiles | fallback map; school locations | Doc:1057; SEO:253-255 | `CONFIRMED` |
| Open data (`opendata.tashkent.uz`, `stat.uz`) | district/block boundaries, school rating, salaries | SEO:253-255, :308-309 | `DOCUMENTED_ONLY` |

- **BR-API-140** · `DOCUMENTED_ONLY` — UZS prices in posts are converted to USD at the official Central Bank of
  Uzbekistan rate. *Evidence:* About:170; SEO:249.
- **BR-API-141** · `DOCUMENTED_ONLY` — The bot relies on Bot API features: inline keyboards with `callback_data`,
  `web_app` and `url` buttons; button styles `primary`/`danger`; `editMessageText`/`editMessageReplyMarkup`;
  `answerCallbackQuery` with `show_alert`; localized `setMyCommands`; descriptions in three languages; menu button and
  Main Mini App; `sendSticker`, `sendPhoto`, `sendMediaGroup`, `sendVenue`; HTML with expandable blockquote;
  `setMessageReaction`; `request_contact`; deep-link `start`. *Evidence:* About:309-326.
- **Q-API-053** — Where are the vector tiles hosted (PMTiles file or `/tiles` template), how large, which licence and
  update process? *Check:* `GET /api/meta` with a test account → `tiles`; `curl -I -H 'Range: bytes=0-1'` on it.
- **Q-API-054** — Source and refresh time of `usd_uzs` and the rounding used for UZS display strings. *Check:* record
  `meta.usd_uzs` daily for a week and compare with the CBU published rate.
- **Q-API-055** — Confirm the stack (FastAPI is inferred from error shapes), how the bot receives updates (webhook URL
  or `getUpdates`) and the support bot's backend. *Check:* owner interview; Bot API `getWebhookInfo` run by the owner.

## 20. Caching

| Resource | Cache behaviour | Evidence | Status |
| -------- | --------------- | -------- | ------ |
| `/media/*` | `Cache-Control: public, max-age=86400`, `ETag`; one URL per photo per day | SEO:380-386 | `DOCUMENTED_ONLY` |
| SEO pages, `sitemap.xml` | `public, max-age=0, must-revalidate, s-maxage=300` | SEO:135, :375 | `DOCUMENTED_ONLY` |
| Landing data `data/*.json` | `max-age=1800` | `RECOVERY.md:69` | `DOCUMENTED_ONLY` |
| `/api/*` | unknown (responses are per-user) | — | `UNVERIFIED` |
| Client prefetch | one-shot promise per exact URL | `client.js:26-60` | `CONFIRMED` |
| Client call link | 10 min, refreshed at 8 min | `useListingContact.js:9-10` | `CONFIRMED` |
| Client tile prefetch | per-session byte budget, low priority | `tilePrefetch.js:80-115` | `CONFIRMED` |

- **BR-API-142** · `CONFIRMED` — The client keeps no API cache besides the one-shot prefetch: every screen open
  re-requests (radars on each tab entry, cities on each filters open, settings and hidden lists on each settings
  open). *Evidence:* `App.jsx:166-177`; `SettingsScreen.jsx:57-69`; `RadarScreen.jsx:56-59`.
- **Q-API-056** — Which cache headers does `/api/*` send (none, `private`, `no-store`), including the public
  `GET /api/bot`? *Check:* `curl -i` each GET endpoint with a test account.

## 21. Localization and user settings

- **BR-API-143** · `CONFIRMED` — Wire codes: locales `ru`, `uz_Latn`, `en`; currencies `USD`, `UZS`; themes `auto`,
  `light`, `dark`. *Evidence:* Doc:424-428, :848-849; `tools/parity/mocks.mjs:73`, :124.
- **BR-API-144** · `CONFIRMED` — The server is the source of truth for locale, currency, theme and city: `/api/meta`
  values replace local state at every start (city only when no geography is selected). *Evidence:*
  `useAppBootstrap.js:79-94`.
- **BR-API-145** · `CONFIRMED` — `PUT /api/settings` must persist so that `/api/meta` then reports the new values and
  `locale_chosen: true` / `city_chosen: true`. *Evidence:* Doc:890-897, :1093-1094.
- **BR-API-146** · `CONFIRMED` — Server display strings come localised in the profile locale (the client has no
  dictionary for them); a locale change reloads the app to fetch them again. *Evidence:* `SettingsScreen.jsx:115-126`;
  `LanguagePicker.jsx:32-35`.
- **BR-API-147** · `UNVERIFIED` — The language is one profile field shared by the bot (`/settings`, `/start` buttons)
  and the Mini App. *Evidence:* About:339-341 (🔶). (Q-API-057)
- **BR-API-148** · `DOCUMENTED_ONLY` — «Новости сервиса» is a bot-only setting, absent from the Mini App contract.
  *Evidence:* Bot:991; About:161.
- **BR-API-149** · `CONFIRMED` — Before meta arrives the client derives a language from Telegram `language_code`:
  `uz*` → `uz_Latn`, `en*` → `en`, else `ru` (the boot script knows only `uz_Latn`/`ru`). *Evidence:*
  `src/lib/telegram/webApp.js:133-150`; `index.html:44-59`.
- **Q-API-057** — Is the language one field for bot and Mini App, and does a Mini App locale change re-localise the
  bot commands? *Check:* change language in the Mini App with a test account and open the bot menu.
- **Q-API-067** — The card style of the bot's listing cards (since release `index-BnFvC-Ft.js`; `card_style` of
  `GET` / `PUT /api/settings` and `POST /api/settings/card-sample`, `08` API-024, API-025, API-036): what is the
  default `card_style` of a new user; does the bot read the Telegram version (`app_launch.tg`) and what does a `rich`
  user on an older client receive; when does `card-sample` answer `sent: false` (chat closed, blocked bot, limits),
  and is it rate-limited; which listing does the sample show (a fixed demo, the user's last match, a listing of the
  user's city)? The legacy contract asks the first three itself (§14 question 16, Doc r31:1318-1320). *Check:* the
  operator's answer (WP-02 request); with a test account, `GET /api/settings` before any change, then «Прислать
  пример в чат» several times in a row, with the bot blocked and on an older Telegram client.
- **LB-API-018** · `quirk` · `CONFIRMED` — If `PUT /api/settings {locale}` is not reflected as `locale_chosen: true` in
  `/api/meta`, the language picker reappears after every reload — an endless loop; the same for `city_chosen` and the
  first city picker. *Evidence:* Doc:890-897; `App.jsx:234`, :257.
  - **Proposed fix:** settings and meta read one profile record; `locale_chosen`/`city_chosen` are derived ("has a
    stored value") rather than separate flags.
  - **Old-client impact:** compatible.

## 22. Time zone

- **BR-API-150** · `DOCUMENTED_ONLY` — Business time is `Asia/Tashkent` (quiet hours, digests, «N ч назад»).
  *Evidence:* About:344; `ru.js:519`.
- **BR-API-151** · `CONFIRMED` — API timestamps (`history[].at`, `median_updated`, landing `now`, `seen_at`) are
  ISO-8601 UTC with `Z`. *Evidence:* `tools/parity/mocks.mjs:94-95`, :99; landing fixtures.
- **BR-API-152** · `DOCUMENTED_ONLY` — Photo URL expiry is aligned to midnight **UTC**, not Tashkent. *Evidence:*
  SEO:380-381.

The Mini App's home-screen offer counts days in UTC instead of Tashkent (`demo/app/docs/RECOVERY.md:169`) — a client
bug, out of scope here (`03-legacy-frontend-audit.md`).

## 23. Money

- **BR-API-153** · `DOCUMENTED_ONLY` — Prices are stored and filtered in USD; UZS is a display conversion at
  `meta.usd_uzs`. *Evidence:* About:156, :342-343.
- **BR-API-154** · `CONFIRMED` — `price_presets`, `CityStats.presets`/`typical`, `median_*` values, `price_usd`,
  `history[].price_usd` and map `usd` are USD numbers; the client formats them in the chosen currency. *Evidence:*
  Doc:450, :487, :571; `src/lib/money.js:53-62`.
- **BR-API-155** · `CONFIRMED` — In UZS mode the client offers fixed UZS presets in millions (rent_long 3, 4, 5, 6, 8,
  10, 15; rent_daily 0.3, 0.5, 0.7, 1, 1.5; sale 500, 700, 1000, 1500, 2000, 3000) or converts USD presets rounded to
  steps (sale 50 mln, daily 0.1 mln, otherwise 0.5 mln). *Evidence:* `src/lib/money.js:103-140`.
- **BR-API-156** · `CONFIRMED` — `price_kind: "down_payment"` marks a price that is a down payment (instalment sale).
  Since release `index-Dbpp463V.js` `price_kind: "business"` marks a business price with the premises rented
  (label «цена за бизнес, помещение в аренде»); any other value is shown without a label (Q-API-065). *Evidence:*
  Doc:238; `tools/parity/mocks.mjs:77`; `src/features/listing/format.js:35-43`; current `$KVADRO_ROOT/docs/api.md:239`
  and `tools/parity/mocks.mjs:81`.
- **Q-API-065** — For which deals and property types does the server send `price_kind: "business"`, and are more
  values planned? The client shows an unknown value without a label; the legacy contract asks the same (current
  `$KVADRO_ROOT/docs/api.md:1196-1197`). *Check:* collect `price_kind` from `GET /api/feed` per deal and type with a
  test account.

## 24. Questionable design decisions

Server or contract behaviour that is not a crash-level bug but looks logically wrong, unsafe or wasteful. Every item
is a **proposal**; none is approved. "Old client" = the legacy Mini App build that keeps running against HOMI during
the transition (About:437-440).

### Authentication and access

- **LB-API-019** · `decision` · `UNVERIFIED` — There is no re-authentication path: the client sends the launch
  `initData` for the whole session. If `auth_date` expiry is enforced, a Mini App left open (call-link refresh every
  8 minutes, radar actions hours later) starts failing, and only `/api/meta` is retried. *Evidence:*
  `client.js:78`; `useListingContact.js:36-52`; About:337. (Q-API-002)
  - **Proposed fix:** accept `initData` for a documented window (e.g. 24 h) and answer `401 {"detail":"auth_expired"}`
    after it; the new client reloads the WebApp (fresh `initData`) on that code or exchanges `initData` once for a
    short-lived token (ADR-0003).
  - **Old-client impact:** the old client shows a generic error on `401` and never reloads, so HOMI must accept at
    least the legacy window on legacy routes; shortening it would break long sessions.
- **LB-API-020** · `decision` · `CONFIRMED` — The full `initData` (Telegram user object, `start_param`, hash) travels in
  the `Authorization` header of every request, so proxies, access logs and error trackers receive personal data by
  default. *Evidence:* `client.js:77-78`; `index.html:78`.
  - **Proposed fix:** redact `Authorization` in all logs/traces at the edge and in Laravel; in the new API exchange
    `initData` once for a token (ADR-0003) so later requests carry no PII.
  - **Old-client impact:** none if redaction is server-side; the legacy `tma` scheme must keep working per request.
- **LB-API-021** · `decision` · `CONFIRMED` — Access denial is a `403` on the configuration endpoint, while every
  other failure of `/api/meta` (including `401` for bad `initData`) is retried 5 times and then leaves the app without
  meta and without any error screen. *Evidence:* `useAppBootstrap.js:127-145`.
  - **Proposed fix:** distinct statuses — `401` authentication, `403` access with a reason — and a visible error state
    in the new client; a dedicated access check endpoint is optional.
  - **Old-client impact:** keep `403` + the five reasons unchanged; any new `401` path leaves the old client blank, so
    keep authentication failures as rare as legacy (see LB-API-019).

### Errors and transport

- **LB-API-022** · `decision` · `DOCUMENTED_ONLY` — One key, two shapes: `detail` is a string for application errors
  and an array of objects for validation errors (`422`). *Evidence:* About:108; `client.js:90-93`.
  - **Proposed fix:** the new API uses one error schema (ADR-0007: `message`, `code`, `errors`); legacy routes map
    validation failures to `422 {"detail": "validation_error"}` or keep the array.
  - **Old-client impact:** none — the old client ignores non-string `detail` and has no UI that depends on `422`.
- **LB-API-023** · `decision` · `DOCUMENTED_ONLY` — `/media` answers a missing signature with `422` (framework
  validation body) but a wrong or expired signature with `404`, which leaks the validation mechanism and makes
  monitoring noisy. *Evidence:* SEO:384, :435.
  - **Proposed fix:** uniform `404` (or `403`) without a body for every invalid media request.
  - **Old-client impact:** none — images fall back to a placeholder on any error.
- **LB-API-024** · `decision` · `CONFIRMED` — Favourites and history are returned unpaginated in a single response
  while their shape pretends to support cursors (`next_cursor` must be `null`). *Evidence:* Doc:926-941;
  `useInfiniteFeed.js:31-36`.
  - **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** `GET /api/favorites` is paged: it accepts `cursor`,
    and the client follows `next_cursor` to the last page (Doc r35:1157-1162; `src/lib/api/user.js:26-27`,
    `src/features/feed/useInfiniteFeed.js:31-42` at r33; BR-API-023). Still open: `GET /api/history` is read whole,
    and bundles cached before the release cannot page favourites (LB-API-057).
  - **Proposed fix:** real cursor pagination in the new API (and a retention cap for history, e.g. last 200 items —
    product decision).
  - **Old-client impact:** the old client never sends a cursor and loops on a non-null one, so legacy routes must keep
    returning the whole list (or a capped list) with `next_cursor: null`.

### Filters and search

- **LB-API-025** · `decision` · `CONFIRMED` — Filter consistency rules (types per deal, `tenant`/`pets` only for long
  rent, `area`/`market` only for sale, mutually exclusive `polygon`/`zones`/`districts`, polygon size) are enforced only
  by the Mini App UI; nothing shows that the server or the bot enforces them. *Evidence:* Doc:175-186; Bot:977.
  - **Proposed fix:** one server-side normaliser/validator used by API and bot: reject impossible combinations with
    `422`, silently drop irrelevant keys (e.g. `area_min` on rent).
  - **Old-client impact:** compatible for requests (the old client never sends invalid combinations); stored legacy
    radars that violate the rules must be normalised during data migration, not rejected.
- **LB-API-026** · `decision` · `CONFIRMED` — `posted_days` is stored inside radar filters although the radar editor
  hides it («в чат и так приходят лишь новые») and duplicate detection ignores it; whether matching applies it is
  unknown. *Evidence:* Doc:185-186, :1124; `model.js:45-51`. (Q-API-014)
  - **Proposed fix:** radars store `posted_days: null` (strip on write); `posted_days` stays a feed-only filter.
  - **Old-client impact:** compatible — the old client accepts `posted_days: null` in returned filters; it still sends
    the key on create.
- **LB-API-027** · `decision` · `CONFIRMED` — Price bounds are stored only in USD. A UZS user types sums, the client
  converts at the current rate, and the saved radar keeps the USD figure, so the bound in sums drifts with the exchange
  rate and differs from what the user typed. *Evidence:* `src/lib/money.js:91-101`; Doc:153-154. Conflicts with
  ADR-0006 (source currency storage).
  - **Proposed fix:** store bound + currency as entered; convert at match time with the daily rate.
  - **Old-client impact:** compatible — legacy requests are treated as `currency = USD`; returned filters stay USD
    numbers on legacy routes.
- **LB-API-028** · `decision` · `CONFIRMED` — A breaking contract change (`zone` → `zones`) shipped on 2026-11-06
  without versioning; stored radars and the bot had to change at the same moment. *Evidence:*
  `demo/app/docs/CHANGELOG.md:46-54`.
  - **Proposed fix:** version the new API (ADR-0007 `/api/v1`), and on legacy routes accept both `zone` and `zones`
    during migration.
  - **Old-client impact:** compatible — the current old client sends only `zones`; accepting `zone` too is harmless.
- **LB-API-052** · `decision` · `CONFIRMED` — Count and flow are recomputed live on every filter change (250/500 ms
  debounce) and three heavy queries run per radar on every radar-tab visit (up to 10 radars), with aborted requests
  still consuming server time; nothing indicates server-side caching. *Evidence:* `useLiveFeedStats.js:12-45`;
  `useRadarPreviews.js:41-66`; Doc:534.
  - **Proposed fix:** cache count/flow by a normalised filter key for a short TTL; cancel queries on client
    disconnect; offer a batched radar-preview endpoint in the new API.
  - **Old-client impact:** none — same endpoints and shapes; caching is invisible.

### Listings

- **LB-API-029** · `decision` · `CONFIRMED` — Presentation lives in the API: `price`, `age`, `title` are pre-formatted
  localised strings that the client parses by separators (` · `, `(`, `/`). Every listing response is therefore
  user-specific (currency × locale), cannot be shared-cached, and any wording change is a contract change.
  *Evidence:* Doc:268-273; About:343.
  - **Proposed fix:** the new API returns structured fields (amount, currency, period, price kind, timestamps) and
    formats in the client; the legacy serializer keeps producing the strings.
  - **Old-client impact:** legacy routes must keep the exact string formats (golden fixtures, Q-API-022).
- **LB-API-030** · `decision` · `CONFIRMED` — Raw phone numbers are returned in `ListingDetails.phone`/`phone_display`
  (and appear in `original_text`), although the product promises that numbers are opened only through temporary call
  links. Anyone with a valid `initData` can harvest numbers by iterating ids. *Evidence:* Doc:316-317; About:349;
  `src/lib/telegram/links.js:28`.
  - **Proposed fix:** the new API never returns a raw number: the call button uses the signed call link, phones in
    text are masked, and listing detail requests are rate-limited per user.
  - **Old-client impact:** the old client needs `phone` to show «Позвонить», to dial `tel:` on Android and to turn
    numbers in the text into buttons; removing it breaks calling. During the transition only per-user rate limits and
    monitoring are compatible.
- **LB-API-031** · `decision` · `CONFIRMED` — Thumbnails are derived by the client with a regex on the URL
  (`/media/<digits>/<digits>.jpg?` → `.s.jpg?`), so the storage URL scheme is part of the contract and absolute/CDN URLs
  silently lose thumbnails. *Evidence:* `src/lib/images.js:9-14`; Doc:1061-1062.
  - **Proposed fix:** the API returns explicit size variants (`{src, w}` list or `thumb` URL).
  - **Old-client impact:** keep relative `/media/<id>/<n>.jpg?e=&s=` URLs with a matching `.s.jpg` on legacy routes;
    otherwise the old client still works but loads 800 px images everywhere.
- **LB-API-032** · `decision` · `CONFIRMED` — Translation is a bodiless `POST` for a cacheable read whose target
  language is implicit (profile), and it triggers an LLM call per tap unless cached. *Evidence:* `listings.js:29-32`;
  Doc:626-634.
  - **Proposed fix:** `GET …/translation?lang=<locale>` with a cache per listing × language and a per-user quota.
  - **Old-client impact:** keep `POST /api/listings/:id/translate` as an alias returning `{text}`.

### Radars

- **LB-API-033** · `decision` · `CONFIRMED` — One status, two unrelated meanings: `409` signals both "radar limit" and
  "bot cannot write" (`no_chat`); the limit case has no defined `detail`. *Evidence:* Doc:76-85;
  `subscriptionActions.js:147-155`.
  - **Proposed fix:** distinct machine codes (`subscription_limit`, `no_chat`) in the new API.
  - **Old-client impact:** legacy routes keep `409` for both; adding `detail: "subscription_limit"` is compatible
    because the old client only tests for `no_chat`.
- **LB-API-034** · `decision` · `CONFIRMED` — Re-enabling a paused radar with the same filters goes through
  `PATCH {active:true}`, so `entry` and `relaxed` are lost and creation statistics under-count. *Evidence:*
  `subscriptionActions.js:104-112`; Doc:750-752.
  - **Proposed fix:** a server-side "create or reactivate" in `POST` (returns the existing radar) and optional
    `entry`/`relaxed` on `PATCH`.
  - **Old-client impact:** compatible — extra optional fields; the old client keeps using `PATCH`.
- **LB-API-035** · `decision` · `CONFIRMED` — The selected relax option (`relaxed`) survives later manual edits and
  «Сбросить», so the server receives a code that may not describe the submitted filters. *Evidence:* Doc:555-556;
  `src/features/filters/FiltersSheet.jsx:76`.
  - **Proposed fix:** treat `relaxed` as analytics only, never as filter logic; record it with a flag "filters still
    equal option filters" computed server-side; the new client clears it on manual edits.
  - **Old-client impact:** compatible.
- **LB-API-036** · `decision` · `CONFIRMED` — Two relax mechanisms with two code namespaces: flow options (applied by
  the client, reported as `relaxed`) and mutation options (applied by the server via `POST …/relax`); the same idea
  has two contracts. *Evidence:* Doc:553-556, :822-838.
  - **Proposed fix:** one relax model in the new API (options always carry full filters and a code; applying is a
    normal `PUT`).
  - **Old-client impact:** legacy routes keep both mechanisms.
- **LB-API-037** · `decision` · `CONFIRMED` — Duplicate radars are prevented only by the client (re-read + compare);
  the server does not appear to enforce uniqueness, so races (double tap, app + bot) create twins that both deliver.
  *Evidence:* `subscriptionActions.js:94-103`. (Q-API-034)
  - **Proposed fix:** unique normalised-filter hash per user; `POST` returns the existing radar.
  - **Old-client impact:** compatible — same response shape.
- **LB-API-038** · `decision` · `CONFIRMED` — The radar tab issues `feed` + `count` + `flow` for every radar on each
  visit (≤ 30 requests) to draw previews. *Evidence:* `src/features/radar/useRadarPreviews.js:41-66`.
  - **Proposed fix:** one batched preview endpoint (finds, count, rate per radar) with short caching.
  - **Old-client impact:** none — legacy endpoints stay; rate limits must tolerate a 30-request burst per user.

### Personal lists and reports

- **LB-API-039** · `decision` · `CONFIRMED` — `POST …/favorite` is a toggle: a retried or duplicated request flips the
  state, and stale bot buttons invert it. *Evidence:* Doc:636-647; Bot:986.
  - **Partly fixed in legacy since release `index-CIa0Ldj2.js`:** the Mini App sends the wanted state,
    `{"favorite": boolean}`, so a repeated request no longer flips it (BR-API-197; Doc r35:746-766). Still open: a
    request without a body, from a bundle cached before the release, still toggles, and nothing shows that the bot's
    buttons changed.
  - **Proposed fix:** idempotent `PUT`/`DELETE …/favorite` in the new API; bot buttons carry the target state.
  - **Old-client impact:** the toggle route must stay for the old client (it already trusts the returned value).
- **LB-API-040** · `decision` · `CONFIRMED` — Two ways to unblock an author (by listing: `DELETE
  /api/listings/:id/block-author`; by entry: `DELETE /api/hidden/:id`), and `/api/hidden/:id` accepts only author
  entry ids although the path suggests any hidden item. *Evidence:* Doc:671-673, :917-920.
  - **Proposed fix:** one `blocked-authors/{id}` resource and one `hidden-listings/{listing_id}` resource in the new API.
  - **Old-client impact:** keep both legacy routes as aliases; preserve author entry ids in the data migration.
- **LB-API-041** · `decision` · `UNVERIFIED` — Hidden listings and blocked authors may be excluded only client-side for
  the current session (the client filters ids locally); if the server does not exclude them, they reappear after a
  reload and keep arriving from radars. *Evidence:* `useListingActions.js:17-31`; `ListingFeed.jsx:80-85`. (Q-API-036)
  - **Proposed fix:** server-side exclusion in feed, count, flow, map and radar matching.
  - **Old-client impact:** compatible (fewer items, same shapes).
- **LB-API-042** · `decision` · `DOCUMENTED_ONLY` — A realtor vote (`agent`) relabels a phone across all its listings,
  cannot be undone in the bot, and its threshold is unknown — a few hostile votes can mark a private owner as a
  realtor, hiding them from `owner=no_agents|owners` and blocking `/owner` verification. *Evidence:* About:224,
  :234-235; Bot:1035; since release `index-CIa0Ldj2.js` the answer tells the voter whether the number is now marked
  (`agent_marked`, Doc r35:840-852; BR-API-191), and the threshold stays unknown.
  - **Proposed fix:** weighted threshold, audit trail, undo for the voter, and a dispute path for verified owners.
  - **Old-client impact:** none — response shape unchanged.
- **LB-API-043** · `decision` · `CONFIRMED` — `hide`, `block-author` and `report` have no stated idempotency; the
  client never retries, but double taps and bot/app races can repeat them. Since release `index-CIa0Ldj2.js`
  `favorite` is idempotent by its body (BR-API-197); these three are not. *Evidence:* Doc:1117;
  `ListingActionsSheet.jsx:53-67`. (Q-API-038)
  - **Proposed fix:** upsert per (user, listing) / (user, author) / (user, listing, reason); repeated calls return the
    same result.
  - **Old-client impact:** compatible.
- **LB-API-057** · `decision` · `UNVERIFIED` — Since release `index-CIa0Ldj2.js` `GET /api/favorites` is paged for
  every caller, although bundles cached before the release never send a cursor and loop on a non-null `next_cursor`
  (LB-API-004): such a client works only while the list fits one page. The loop is `inferred` from the old bundle's
  code, not observed. *Evidence:* Doc r35:1157-1162, :1339-1340, :1401; `src/lib/api/user.js:26-27`,
  `src/features/feed/useInfiniteFeed.js:31-42` (at r33). (Q-API-084)
  - **Proposed fix:** page only for a request that asks for it (a `limit` or a `cursor`), or keep the first page
    whole until the old bundles have expired.
  - **Old-client impact:** none: no legacy client talks to HOMI (`24`).

### Owner verification, calls, sharing, analytics

- **LB-API-044** · `decision` · `DOCUMENTED_ONLY` — Verified owners' numbers are stored as a hash; the Uzbek number space
  (`+998` + 9 digits) is small enough to reverse an unsalted fast hash by enumeration. *Evidence:* About:232. (Q-API-041)
  - **Proposed fix:** keyed hash (HMAC with a secret pepper) or encryption; re-hash on migration if the legacy
    algorithm is known.
  - **Old-client impact:** none — the value is never exposed to clients.
- **LB-API-045** · `decision` · `CONFIRMED` — The call link's lifetime is implicit: the client hard-codes 10 minutes and
  the API returns no expiry, so any server change silently desynchronises refreshes. *Evidence:*
  `useListingContact.js:9-10`; Doc:620-621, :1104.
  - **Proposed fix:** return `expires_at` with every call link; the new client refreshes from it.
  - **Old-client impact:** compatible if legacy-issued links stay valid ≥ 10 minutes.
- **LB-API-046** · `decision` · `CONFIRMED` — Every «Поделиться» tap creates a new prepared Telegram message (an
  outbound Bot API call) with no reuse. *Evidence:* `ListingTitleRow.jsx:33-38`; About:245-246.
  - **Proposed fix:** cache the prepared message id per (user, listing, locale) until it expires; rate-limit.
  - **Old-client impact:** compatible — same `{id}` response.
- **LB-API-047** · `decision` · `DOCUMENTED_ONLY` — `/api/events` accepts arbitrary extra fields with no documented
  size or rate limit, and empty-`initData` traffic reaches it. *Evidence:* Doc:1012-1013, :1044, :1118.
  - **Proposed fix:** cap the body (e.g. 8 KB), whitelist event names and property keys for storage, rate-limit per
    user, drop unauthenticated events at the edge.
  - **Old-client impact:** compatible if the cap is ≥ 2 KB and unknown names are answered `204` (dropped, not
    rejected); old payloads are small (message ≤ 300, source ≤ 300).
- **LB-API-056** · `decision` · `UNVERIFIED` — The cabinet keeps the owner's phone number itself, while `/owner` and
  the bot's privacy text say that only a hash is stored; one user can be under both regimes. The cabinet came with
  release `index-CBlEKxdL.js` (§12a). *Evidence:* Bot:819-822, :852; About:232;
  `src/features/owner/OwnerForm.jsx:947-949` («Ваш номер: …») and `src/features/owner/owner.js:219` («Дать номер»),
  both at r31. The only text that states the storage of the number itself is the landing privacy page, an uncommitted
  working copy at the read, not cited as a release. (Q-API-072; BR-API-172)
  - **Proposed fix:** one rule for both flows. If the number itself is kept for cabinet owners: encrypt it at rest,
    keep it apart from the `/owner` hash, bring the bot's `/owner` and `/privacy` texts in line with it, and erase it
    when the user deletes their data.
  - **Old-client impact:** none: no legacy client talks to HOMI (`24`).

### Localization, settings, directories

- **LB-API-048** · `decision` · `CONFIRMED` — The Uzbek locale code on the wire is `uz_Latn` (underscore), not a
  BCP 47 tag (`uz-Latn`). *Evidence:* Doc:424, :848; `index.html:32`.
  - **Proposed fix:** BCP 47 internally (ADR-0006) with a mapping at the legacy boundary.
  - **Old-client impact:** legacy routes must keep emitting and accepting `uz_Latn`.
- **LB-API-049** · `decision` · `CONFIRMED` — `PUT /api/settings` has `PATCH` semantics (partial object) and returns
  the full object. *Evidence:* Doc:859-888.
  - **Proposed fix:** `PATCH` in the new API.
  - **Old-client impact:** keep `PUT` with partial semantics on the legacy route.
- **LB-API-050** · `decision` · `CONFIRMED` — Quiet hours and digest hours are stringly typed (`"off"`, `"23-08"`,
  `"09,21"`) and parsed by the client. *Evidence:* Doc:846-847; `src/features/settings/format.js:9-27`;
  `RadarSheet.jsx:52-61`.
  - **Proposed fix:** structured values (`{start, end}` / list of hours) in the new API.
  - **Old-client impact:** legacy routes keep the string encodings and preset lists.
- **LB-API-051** · `decision` · `UNVERIFIED` — `CityMeta.zoom < 11` doubles as the flag "this is a region, not a city"
  (excluded from geolocation city detection). *Evidence:* Doc:458, :1126. (Q-API-026)
  - **Proposed fix:** explicit `kind: city|region` in the new API.
  - **Old-client impact:** legacy `meta.cities[].zoom` must keep the `< 11` convention.
- **LB-API-053** · `decision` · `CONFIRMED` — `GET /api/meta` mixes per-user profile data with large static
  directories (cities, districts, renovations, appliances, presets, locales), so every start downloads the directories
  and nothing can be cached. *Evidence:* Doc:423-452; `src/main.jsx:24`.
  - **Proposed fix:** split static directories into a versioned, cacheable resource (ETag) and keep `meta` small.
  - **Old-client impact:** the legacy `meta` must keep the union of all fields.

### Landing

- **LB-API-054** · `decision` · `CONFIRMED` — The landing republishes third-party listing photos as unsigned static
  files `img/snap/<listing_id>.webp`, outside the signed `/media` policy; takedown requests and the 90-day PII purge
  must also reach these copies, which nothing documents. *Evidence:* RES-013 in `08`; `RECOVERY.md:60-61`, :70-71;
  About:181-185.
  - **Proposed fix:** generate snapshots through the media pipeline (or reference signed `/media` URLs) and purge them
    on takedown and retention.
  - **Old-client impact:** none for the Mini App; the legacy landing only needs `pins[].photo` to resolve.

## 25. Summary

### Findings that matter most for the migration

1. **The legacy contract collides with three accepted HOMI ADRs** — bare JSON at `/api/*` with `{"detail"}` errors
   and opaque cursors vs ADR-0007 (`/api/v1`, `success` envelope, page pagination, opaque ids); per-request
   `Authorization: tma <initData>` vs ADR-0003 (Sanctum token); USD storage and server-formatted price strings vs
   ADR-0006. The old Mini App needs numeric listing ids and byte-exact shapes for the whole transition (`08` §1.9,
   LB-API-011, LB-API-029). Resolution belongs to `10-target-architecture.md`.
2. **Strict response invariants are the real contract** — missing keys, non-null `next_cursor`, unknown enum codes,
   `204` on report, missing `relaxed` all crash or mislead the old client (LB-API-003 … LB-API-016). A contract-test
   suite built from `$KVADRO_ROOT/demo/app/tools/parity/mocks*.mjs` should gate every legacy route.
3. **Security debts sit in the contract itself** — raw phone numbers in listing details (LB-API-030), HTML-injected map
   labels (LB-API-008), PII-bearing `initData` in every request header (LB-API-020), unsigned photo snapshots
   (LB-API-054). Two of them cannot be removed while the old client runs; mitigations must be server-side.
4. **Most server behaviour is undocumented outside prose** — 97 business rules are `DOCUMENTED_ONLY` and 78 questions
   are open; radar matching triggers, delivered-card tracking, vote thresholds, `auth_date` window, photo-signing and
   owner-hash algorithms (Q-API-002, -024, -027, -031, -039, -041) block both parity and data migration and need the
   legacy owner.
5. **Non-API resources must survive the cut-over** — signed `/media` URLs already in chats and pages, `/call/<token>`
   links, `meta.tiles` hosting with `Range`/CORS, landing data files, SEO pages, CSV exports and the sitemap
   (RES-001 … RES-020).

### Item counts

| Prefix | Count | Defined in |
| ------ | ----: | ---------- |
| `API-` | 55 | `08-api-inventory.md` §2 |
| `RES-` | 22 | `08-api-inventory.md` §3 |
| `BR-API-` | 197 | this document |
| `LB-API-` | 57 (19 `bug`/`quirk` in §3–§21, 38 `decision` in §24) | this document |
| `Q-API-` | 79 | this document |

### Status distribution

| Prefix | CONFIRMED | DOCUMENTED_ONLY | UNVERIFIED | DEPRECATED_CANDIDATE |
| ------ | --------: | --------------: | ---------: | -------------------: |
| `API-` (contract) | 55 | 0 | 0 | 0 |
| `API-` (server logic) | 0 | 54 | 1 (API-017) | 0 |
| `RES-` (primary label) | 13 | 7 | 2 | 0 (RES-016 is flagged as a candidate in `08` §5) |
| `BR-API-` | 86 | 97 | 14 | 0 |
| `LB-API-` | 47 (8 bug, 11 quirk, 28 decision) | 5 (decision) | 5 (decision) | 0 |

`Q-API-` items carry no status: each is an open check.
