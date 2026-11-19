# WP-22 — Data layer, formatters and the filter model

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (merged in #61 on 2026-11-16; production track: deploy, with the `API_URL` of WP-21) |
| Depends on | WP-21 |
| Size | ≈ 3 000 changed lines, L |
| Behaviour reference | `25` §3.1, §3.5, §4.1 – §4.4; `03` §1.6, §1.11, §1.12, §3.4, §3.5, §4 (rules 001 … 023, 029, 031, 044, 060, 064 … 066); earlier tasks KV-FE-017 … KV-FE-023 (rules, tables, edge cases and test ideas only — not the legacy query strings, the `Authorization: tma` transport, the boot prefetch or their file layout) |
| Needs from the production track | Nothing beyond the `API_URL` value WP-21 asked for; the app server must reach the API over it |

## Goal

Every screen gets its data and its rules from one place: typed server calls with the session, a pass-through for
browser reads, a single shape for Server Actions, a small client hook, one mapping from API errors to UI states,
the legacy money, number, date, distance and flow formatters, cached reference data, and the filter model as the
new package `@homi/search` with its mapping to and from the address. After this package a screen is layout and
wiring only.

## Scope

**In.** `lib/api/*`; `app/bff/[...path]/route.ts` with its allow-list; `lib/actions/run.ts` and `useAction`;
`lib/data/{useResource,sessionMaps}.ts` and the wiring of `lib/data/sources.ts`; `lib/reference/*`;
`lib/search/useSearchState.ts`; `lib/money/useMoney.ts`; `@homi/i18n/format`; the package `@homi/search`.

**Out.** The concrete Server Actions — each is written by the package that first needs it, in the file this
specification names (WP-23 settings, WP-24 favourites, WP-26 hidden / reports / listing, WP-29 history, WP-30
radars and surveys). `useCursorFeed` (WP-24). Card and listing text helpers (WP-24, WP-26). Event transport
(WP-32). The filters UI (WP-25).

## Decisions that bind this package

- DEC-44, `25` §3.1: pages are Server Components that fetch with the session; with `cacheComponents` everything
  that reads the cookie sits inside `<Suspense>` and nothing per-user is cached. Only reference data is cached,
  keyed by locale.
- `25` §3.4, §3.5: one screen implementation for cookie mode and header mode — `initial` from the server when it
  had a session, the same fetch through `/bff/*` when it did not. Mutations are Server Actions; in header mode the
  token is an argument. No query library is added (DEC-49).
- DEC-41, `25` §4.1, §4.6: the frontend sees `/api/v1` only; types come from `@homi/types`; every answer carries
  `meta.source`; `503 source_unavailable` shows the legacy "could not load" state.
- `25` §3.7, `03` §3.5: numbers in Uzbek are formatted with `ru-RU`; prices are stored and sent in USD.
- DEC-36. Fixed here: LB-APP-007, LB-APP-011, LB-APP-023. Written behind flags that were off as built: LB-APP-025
  (`dev014TashkentDates`, on by default since DEC-58), LB-APP-029 (`dev017TenantPetsDailyRule`),
  LB-APP-030 (`dev018ResetKeepsDaily`), LB-APP-031 (`dev019OneDistanceFormatter`), LB-APP-033
  (`dev021OneFlowVocabulary`), LB-APP-043 (`dev025ValidateRanges`), LB-APP-045
  (`dev001AnyForbiddenShowsAccess`). Also wired: `dev052UnifiedBelowMedianRule`, `dev005RadarDropsPostedDays`.
- DEC-58 amends DEC-36 for the behaviours that legacy adopted in `index-CIa0Ldj2.js`: their flags stay, with both
  branches tested, and are on by default. Here: `dev014TashkentDates`, and the pets half of LB-APP-029 under its own
  rule key `dev017PetsLongRentOnly` ("Flagged branches" and "Formatters" below; *added by the intake of
  `index-CIa0Ldj2.js`*).
- DEC-54: the whole-city label is «{city} целиком», built from the city's name in the reference data. It is on by
  decision and has no flag; it settles LB-APP-026.
- DEC-51: `GET /reference` says whether radars are switched on (`radars_enabled`, WP-11); the reference hook
  exposes it and a refused radar write has its own error.
- DEC-53: favourites and history are read page by page, with the cursor of the feed.
- SEC-REQ-047: no token, launch data or query string in a log line or an error object.

## Design

### Read before coding

`frontend/app/node_modules/next/dist/docs/01-app/`: `02-guides/authentication-with-cache-components.md`,
`backend-for-frontend.md`, `data-security.md`, `server-actions.md`, `single-page-applications.md`,
`preserving-ui-state.md`, `preventing-flash-before-hydration.md`; `03-api-reference/03-file-conventions/route.md`;
`03-api-reference/04-functions/cookies.md`, `cacheLife.md`, `cacheTag.md`, `use-search-params.md`,
`next-root-params.md`; `03-api-reference/01-directives/use-cache.md`;
`03-api-reference/05-config/01-next-config-js/cacheComponents.md`.

### Server calls (`frontend/app/lib/api/`)

- `server.ts` (`import 'server-only'`): `serverApi(auth?)` builds on `createApiClient` of `@homi/api-client` with
  base `API_URL`, the token from `getSessionToken()` (WP-21) or from `auth.token`, `Accept-Language` = the locale
  (`uz` stays `uz`; only Laravel's legacy driver knows `uz_Latn`), a 15 s timeout and a request id header. It
  exposes one typed function per v1 method of `25` §4.2 and returns
  `ApiResult<T> = { ok: true, data, meta } | { ok: false, error: UiError, status, code?, method, path }` (`status`
  `0` without an answer; types in `lib/api/types.ts`) — it does not throw for an HTTP answer. The locale comes from
  the root parameter getter in Server Components (`next-root-params.md` says the getter does not run in Server
  Actions or Route Handlers, so those pass the locale in). `createServerApi({ token, locale, scenario })` is the
  core both build on; `publicApi(locale)` sends no token and no stub scenario, for the cached reference calls. The
  request id is a random value, so a call awaits `io()` of `next/cache` first (`io.md`); without it
  `cacheComponents` reports `crypto.randomUUID()` while prerendering.
- Two facts of today's `@homi/api-client` (`frontend/packages/api-client/src/index.ts`) that this package
  corrects there, with tests, because the contract needs both: `request()` answers a `204` with
  `{ success: true, data: null }` but throws `ApiError` for any other empty body (`payload === null`), so an empty
  `200` or `201` would be an error — every empty `2xx` body must resolve as `{ success: true, data: null }`, while an
  unreadable one stays an error; and `RequestOptions.query` takes one scalar per key and writes it with
  `searchParams.set`, so the list filters of WP-12 (`types[]=a&types[]=b`) cannot be sent — `query` also accepts
  `URLSearchParams`, which is what `toApiQuery` returns.
- Stub scenarios (`25` §9, WP-10): outside production — `NEXT_PUBLIC_APP_ENV` is not `production`, a build-time
  condition — `server.ts`, the pass-through below, `app/bff/session/route.ts` of WP-21 and `runAction` copy the
  value of the cookie `homi_stub_scenario` (`^[a-z0-9_]{1,40}$`, anything else ignored) into the request header
  `X-Stub-Scenario` (`lib/api/scenario.ts`). It is the only way an end-to-end test reaches an error or empty state of a server-rendered
  page, so every later package of stage B relies on it; tests set the cookie with Playwright's
  `context.addCookies` until WP-33 adds the `setScenario` helper. The cached reference calls never forward it.
- `errors.ts`: `UiError` and `toUiError(statusOrFailure)` (table below); a `4xx` the table does not name is row 3.
  An error object (`ApiFailure`, built by `failureOf`) carries the method, the path template (`listings/:number`),
  the status and the code — never headers, a query string or a body.
- `browser.ts`: `bffFetch(path, { query, signal })` → `GET /bff/<path>`; sends `Accept-Language`; adds
  `Authorization: Bearer` in header mode (`getAuth()` of WP-21); on `unauthorized` awaits `reauthenticate()` once
  and repeats the request; returns the same `ApiResult<T>`. Every successful answer calls `reportSource(meta.source)`.
  An abort by the caller rejects with its `AbortError`; the locale is the document's `lang` unless given.
- `bffAllowList.ts` and `app/bff/[...path]/route.ts`: a pass-through for **reads** only. The complete list ships
  here so later packages do not touch it: `GET` `me`, `settings`, `reference`, `cities`, `listings`,
  `listings/count`, `listings/new`, `listings/flow`, `listings/map`, `listings/:number`, `favorites`, `history`,
  `hidden`, `radars`. (`POST events` and `boot-error` are added by WP-32.) The handler rejects anything else with
  `404`, accepts same-origin requests only (a same-origin `GET` carries no `Origin` header, so the rule is: refuse
  when `Origin` is present and is not the app's origin, or when `Sec-Fetch-Site` is present and is not
  `same-origin`), takes the token from the cookie or the bearer header, validates `:number` as
  a positive integer, caps the query string at 4 KB (`414` above), forwards the API's status and body unchanged
  (`502` when the API cannot be reached, `504` after 15 s), answers `Cache-Control: private, no-store`, forwards no
  header of the API but `Content-Type` — so never `Set-Cookie` — and never logs the query. The same-origin rule lives
  in `lib/security/sameOrigin.ts`, shared with `app/bff/session/route.ts`. The query string is
  forwarded as it is, so `favorites` and `history` page with `cursor` and `limit` exactly like `listings` (DEC-53).

### Error mapping

| # | Answer | `UiError` | What screens do with it |
| - | ------ | --------- | ----------------------- |
| 1 | request never completed | `offline` | `ErrorState` offline: «Нет связи» (`error.offline`), «Проверьте интернет и попробуйте ещё раз.» (`error.offlineText`) |
| 2 | no answer in 15 s | `timeout` | as offline (legacy treats both as status 0) |
| 3 | `5xx`, unreadable `2xx` body | `server` | «Не загрузилось» (`common.loadFailed`), «Сервер не ответил. Попробуйте ещё раз через минуту.» (`error.serverText`), «Повторить» (`error.retry`) |
| 4 | `503` with code `source_unavailable` | `source_unavailable` | the same "could not load" state as row 3 (`25` §4.1) |
| 5 | `401` | `unauthorized` | never shown: `reauthenticate()` of WP-21; if that fails the session-expired state replaces the screen |
| 6 | `403` | `forbidden` | flag off: lists show the inline «Нет доступа — повторить» (`feed.retry` with `common.noAccess`), other screens row 3; with `dev001AnyForbiddenShowsAccess` on: `onForbidden()` sets the session to `denied` and the access screen opens (LB-APP-045) |
| 7 | `404` | `not_found` | the screen's own text (listing: the "gone" block `listing.gone` of WP-26 since the intake of `index-CIa0Ldj2.js`, before it `listing.loadFailed`; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `ListingScreen` for a later package (`wave-1/baseline.md`, built code behind the pin, row 17)) |
| 8 | `409` | `conflict` + `code` | radar limit and `no_chat` (WP-30) |
| 9 | `422` | `validation` | a mutation: `failed()` of WP-23 |
| 10 | `429` | `rate_limited` | reads: row 3; mutations: `failed()`. `UiError` keeps the code and gains `reason?: "daily"`, read from the body of the `429` (DEC-59): the listing shows its day-limit state for it (WP-26); every other screen ignores the reason (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `lib/api/errors.ts` and `useListing` for a later package (`wave-1/baseline.md`, built code behind the pin, row 18)) |
| 11 | `403` with code `radars_disabled` | `radars_disabled` | read before row 6: a radar write while radars are switched off (DEC-51, WP-13) — the toast `radar.soon.title` (WP-30); never the "no access" handling of row 6 |

A read that fails while older data is on screen keeps the data and shows the inline retry (`03` §1.6). An empty
`2xx` or `204` on a mutation is success.

### Server Actions (`frontend/app/lib/actions/`)

- `run.ts`: `runAction(auth, locale, fn)` resolves the token (cookie first, else `auth.token`), refuses to run
  without one (`unauthorized`), calls `fn(serverApi(...))`, and returns `ActionResult<T>` (the `ApiResult` union,
  serialisable); a refusal has `method` `ACTION`. `runAction.invalid(method, path)` is the `validation` answer of an
  action whose input failed its check, without a request. Each action re-reads the session itself; nothing trusts
  the client (`authentication-with-cache-components.md`, "Trusting the client for authorization").
- Every action is `'use server'`, takes `(input, auth?: { token?: string }, locale?)`, validates its input (listing
  numbers as positive integers; radar and blocked-author ids as ULID strings, 26 characters in either case, as
  Laravel's `whereUlid` of WP-13 accepts them; enums against the generated types — `listingNumber`, `ulid` and
  `oneOf` of `lib/actions/validate.ts`) and returns `ActionResult`. The
  token travels in the request body of the action, never in an address.
- `useAction(action)` (client): injects `auth` in header mode and the locale, awaits `reauthenticate()` once on
  `unauthorized`, and reports `meta.source`; an action that cannot be reached resolves `offline`.
- Nothing per-user is cached, so actions call no revalidation; the caller updates its session map or
  `invalidate(prefix)`.

Files and names reserved for the packages that write them:

| File | Actions | Written by |
| ---- | ------- | ---------- |
| `settings.ts` | `updateSettings(patch)` | WP-23, extended by WP-31 |
| `favorites.ts` | `setFavorite(number, on)` — `PUT` or `DELETE`, never a toggle | WP-24 |
| `listing.ts` | `getContact(number)`, `translate(number)`, `prepareShare(number)` | WP-26 |
| `hidden.ts` | `hideListing`, `unhideListing`, `blockAuthor`, `unblockAuthor`, `unblockAuthorById`, `unhideAll` | WP-26, WP-31 |
| `reports.ts` | `reportListing(number, reason, detail?)` | WP-26 |
| `history.ts` | `clearHistory()` | WP-29 |
| `radars.ts` | `createRadar`, `replaceRadar`, `patchRadar`, `deleteRadar`, `relaxRadar` | WP-30 |
| `surveys.ts` | `sendFound`, `sendFoundWhere` | WP-30 |

### Client data (`frontend/app/lib/data/`)

- `useResource(key, fetcher, { initial, enabled = true, staleMs = 30000, flags })` → `{ data, error, status,
  refreshing, refetch, mutate }`, `status` = `idle | loading | success | error`, `refreshing` while a read is in
  flight over shown data; `fetcher(signal)` returns an `ApiResult`. One module-level map keyed by `key`: `initial` seeds
  it; equal keys share one in-flight request; a key change or unmount aborts; a fresh entry is reused, a stale one
  is shown while it refetches; `mutate(updater)` writes optimistically; `invalidate(prefix)` drops entries and
  reads a key that is on screen again. Memory only, and never written on the server (a server-rendered Client
  Component sees `initial` only, so one user's data cannot reach another request). A `403` with
  `dev001AnyForbiddenShowsAccess` on calls `onForbidden()` of `lib/session/bootstrap.ts`. With `cacheComponents`, hidden routes keep state and re-run effects when shown again
  (`preserving-ui-state.md`); the stale check is what stops a refetch storm on every Back.
- `sessionMaps.ts`: `favs`, `seen`, `hidden` for this launch (`03` §1.11) with `useSessionMap(name)`,
  `setFav(number, on)`, `markSeen(number)`, `hide(numbers)`, `unhide(numbers)`, `resetHidden()`, and the readers
  `isFavorite(number, server)`, `isSeen(number, server)`, `isHidden(number)`. The server stays the truth after a
  reload.
- `sources.ts` (created by WP-20): `bffFetch`, `useAction` and the `SourceReporter` rendered next to every
  server-fetched `initial` all report, so the demo marker is right on every screen without per-screen code.
  `SourceReporter` takes an optional source, as `meta.source` is optional.

### Reference data (`frontend/app/lib/reference/`)

- `server.ts`: `getReference(locale)` and `getCities(locale)` — `'use cache'`, tagged `reference`, with a lifetime
  of about ten minutes (`cacheLife.md`; `{ stale: 300, revalidate: 600, expire: 3600 }`). Each returns
  `{ loaded, data, source? }`: `loaded` is `false` when the empty value stands in. A cached function cannot read the cookie
  (`authentication-with-cache-components.md`), so both calls go **without a user token**; WP-11 defines
  `GET /reference` and `GET /cities` as public methods, so no token is needed. A per-user token must never become
  part of a cache key.
- Build time. `use-cache.md` says prerendering fills a cache entry, and `cacheLife.md` ("Prerendering behavior")
  excludes only entries that expire in under five minutes — so a prerendered page would make `next build` call the
  API once per locale, while the `Build` step of `.github/workflows/frontend.yml` and `make ci-frontend` have no API.
  Since ADR-0020 every document renders at request time, so the build makes no reference call at all (AM-58); the
  rule below still holds for the first request. Both functions
  therefore never throw: when the call fails they return an empty reference (no cities, default limit) and give
  that result a short lifetime (`cacheLife.md`, "Conditional cache lifetimes"; the `seconds` profile) so the next
  request asks again; because such an entry is resolved at request time, `ReferenceProvider` sits inside
  `<Suspense>`. Verify at
  step 11 by building once with `API_URL` pointing at a closed port: the build passes and the running app loads
  the reference data on the first request.
- `ReferenceProvider` (rendered by `ReferenceFeed` of the root layout inside `<Suspense>`, next to the page rather
  than around it so the page never waits for it; a layout effect hands the data to a client store) and
  `useReference()` → `{ loaded, reference, cities, findCity, radarsEnabled, radarLimit, botUsername,
  supportUsername, usdUzs }` over: cities (`code`, `name`,
  `is_region`, `center`, `zoom`, `zones`, `districts`, `has_metro`, `has_median`), `renovations` per deal,
  `appliances`, `price_presets` per deal, `locales`, `features`, `rates.usd_uzs`, `map.tiles_url`,
  `limits.radars`, `radars_enabled`, `bot.username` and `bot.support_username` — the names of WP-11. The
  currency list is not reference data: it is `options.currencies` of `GET /settings` (WP-31).
  `useCityStats(code)`: `counts` per deal, `price_presets` and `typical_price` per city from `GET /cities`.
  `findCity(code)` matches the code only, never another city in its place.
- Defaults when a field is absent: radar limit 10; `radars_enabled` `false` (no radar is offered while the
  reference data is missing); no support account → its rows are hidden; no cities → nothing that needs a city is
  offered (see LB-APP-023 below). `radars_enabled` is read from the cached reference, so a switch on the server
  reaches a running app when the cache entry expires (about ten minutes).

### Search state in the address (`frontend/app/lib/search/`)

- `useSearchState()` (Client Component, under `<Suspense>` as `use-search-params.md` requires) →
  `{ filters, sort, setFilters(next), setSort(sort), href(builder) }`. It reads the address with
  `fromSearchParams`, writes with `nav.replace` on the current root (`/` or `/map`) — the search keys of
  `toSearchParams(next, sort)` first, then every other parameter of the address as it was — and never touches a
  reserved parameter.
- `readSearchState(searchParams, me)` — the same parsing for Server Components.
- `searchStateFromHref(href, fallbackCity?)` — for callers that hold a remembered address (the shell of WP-23, the radar «+»).
- City when the address has none (BR-APP-001, BR-APP-010): `me.city`, else `homi-city`, else `tashkent`. At
  sign-in `homi-city` is overwritten with `me.city` without a server call (`SessionProvider`). An address that already carries a city
  is left alone, so a selected geography is never reset by the profile.
- `rules.ts`: `searchRules(devFlags)` — the one place where app flags become the `rules` argument of `@homi/search`.

### `@homi/search` (new workspace package, `frontend/packages/search`)

No React, no Next.js, no app imports. `src/{types,defaults,normalize,compare,rooms,transitions,availability,sort,
summary,url,api,radar,polygon}.ts`. Translations and money enter as arguments.

**Model.** `SearchFilters` has exactly 25 keys: `city`, `deal` (`rent_long | rent_daily | sale`), `owner`,
`types`, `districts`, `renovation`, `appliances`, `rooms_min`, `rooms_max`, `price_min`, `price_max`, `area_min`,
`area_max`, `posted_days`, `furnished`, `floor_not_first`, `floor_not_last`, `market`, `zones`, `near_metro`,
`below_median`, `tenant`, `pets`, `pets_only`, `polygon`. Prices are USD integers.

**Address mapping.** `toSearchParams(filters, sort)` writes each key under its own name (lists as repeated
parameters, booleans as `1`, the three-state `furnished` as `1` or `0`, `polygon` as `lat,lon;lat,lon…` with 5
decimals), omits every value equal to the
default of its deal, omits `deal=rent_long` and `sort=new`, always writes `city`, and emits keys in one fixed
order so equal states give equal addresses. `fromSearchParams(params, { fallbackCity })` reads **only** the 25
keys and `sort`, ignores everything else — in particular the reserved parameters `from`, `focus`, `pick`,
`draw`, `pin`, `step`, `i` (`RESERVED_PARAMS` of WP-20) — and passes the result through `normalizeFilters`, so a
hand-edited address cannot produce an invalid state. `toApiQuery(filters, { sort, cursor, limit })` is the single
mapping to the v1 query of WP-12 (lists as repeated `name[]` keys, booleans as `true` and only when set,
`furnished` as `true` or `false`); `new` is never sent. `cityFallback({ profile, saved })` is the fallback city of
row 10 (`me.city`, else `homi-city`, else `tashkent`); the wiring is in `lib/search`.

**Rules and where they live.**

| # | Rule | Function | Content |
| - | ---- | -------- | ------- |
| 1 | BR-APP-001 | `defaultFilters(deal, city)` | `rent_long`, `types ['apartment']`, `owner 'any'`, lists empty, the rest `null` or `false` |
| 2 | BR-APP-002 | `switchDeal(f, deal)` | new deal's defaults, keeping `districts`, `zones`, `polygon` |
| 3 | BR-APP-003 | `switchRentTerm(f, term)` | keeps the types allowed for the term (else `['apartment']`), resets `price_min`, `price_max`, `below_median`; daily also clears `tenant`, `pets`, `pets_only` |
| 4 | BR-APP-004 | `sectionsFor(f, city, mode, rules, stats).rentTerm` | rent only, and daily already selected or the city's daily count > 0 (`stats` = the city's entry of `GET /cities`) |
| 5 | BR-APP-005 | `toggleType(f, type)`, `TYPES_BY_DEAL` | rent `apartment, house, room, commercial`; daily `apartment, house, room`; sale `apartment, house, commercial, land`; the last type cannot be removed; `below_median` survives only for `['apartment']` |
| 6 | BR-APP-006 | `sectionsFor(…).rooms` | hidden when every type is `room`, `commercial` or `land` |
| 7 | BR-APP-007 | `pickRooms(f, value)` | one value; a second different value makes a range; `4` is "4 or more"; `null` clears. With only `rooms_max` set the values 1 … max count as picked, and "any" is true only when both bounds are `null` (legacy since `index-CIa0Ldj2.js`; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `rooms.ts` and `RoomsPicker` for a later package (`wave-1/baseline.md`, built code behind the pin, row 40)) |
| 8 | BR-APP-008 | `setGeography(f, { polygon \| zones \| districts })` | the three modes exclude each other; zones in the order `center, near_center`; `near_metro` independent |
| 9 | BR-APP-009 | `pickCity(f, city)` | clears `districts`, `polygon`; keeps `zones` only if the city has zones, `near_metro` only with metro, `below_median` only with medians — each coerced to a boolean (fix of LB-APP-007) |
| 10 | BR-APP-010 | `readSearchState` / `useSearchState` | the profile city wins over the saved one; an address with a city is not changed |
| 11 | BR-APP-011 | `countActiveFilters(f)` | groups: daily, non-apartment types, rooms, price, geography, metro, below-median, owner, tenant, pets (not for sale), furnished, renovation, floor, area, market, appliances, posted days |
| 12 | BR-APP-012 | `filtersKey(f)`, `sameFilters(a, b)` | defaults filled, keys and lists sorted, `posted_days` ignored |
| 13 | BR-APP-013 | `isCustomFilters(f)` | differs from the defaults of its base deal and city |
| 14 | BR-APP-014 | `applyPreset(f, usd)`, `isPresetSelected` | sets `price_max`, or clears it when it already equals the preset, and clears `price_min`; selected only with no minimum; city presets before reference presets |
| 15 | BR-APP-015 | `createMoney(…).presets(deal, …)` | UZS presets: city USD presets converted and rounded to 50 млн (sale), 0.1 млн (daily), 0.5 млн (rent), duplicates dropped; else the fixed lists of `03` §3.5 |
| 16 | BR-APP-016 | `sectionsFor(…).typicalPrice` | apartment-only searches (daily included) in a city with a name and a typical price; the USD amount to show or `null` |
| 17 | BR-APP-017 | `belowMedianAvailable(f, city, rules)` | non-daily, apartment-only, a city whose `has_median` is `true` (a missing mark counts as none, as the server's `SearchFiltersNormaliser` reads it) |
| 18 | BR-APP-018 | `sectionsFor(…).unitPriceHint` | sale searches that include land or houses |
| 19 | BR-APP-019 | `sectionsFor(…).tenant`, `.pets` | `tenant`: base deal rent, daily included (`dev017TenantPetsDailyRule`, off; flag rows below). `pets`: long-term rent only, behind the rule key `dev017PetsLongRentOnly`, on by default since the intake of `index-CIa0Ldj2.js` (DEC-58; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `availability.ts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 39)) |
| 20 | BR-APP-020 | `sectionsFor(…).area`, `.market`, `.appliances` | area for every deal (DEC-62; legacy since `index-CIa0Ldj2.js`; *added by the intake of `index-CIa0Ldj2.js`*; a parity item of `availability.ts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 38)); market for sale only; appliances for rent only |
| 21 | BR-APP-021 | `sectionsFor(…).posted` | `mode === 'search'` only |
| 22 | BR-APP-022 | `resetAll(f, cityCode = f.city, rules)`, `resetQuick(f, kind)` | full reset → defaults of the base deal and city; quick reset → its own filter, price also clears `below_median` |
| 23 | BR-APP-023 | `sortOptions(f, city)`, `normalizeSort(sort, options)` | `new`, `cheap`, `expensive` always; `deal` for non-daily apartment-only with medians; `center` with zones; `ppm` for sale; unavailable → `new` |
| 24 | BR-APP-064 | `filtersSummary(f, ctx)` | `city · area · Посуточно · у метро · rooms · price · ≤ медианы · без риелторов / от хозяев` |
| 25 | BR-APP-065 | `filtersTitle(f, ctx)` | deal (unless long rent) · types (unless only apartments) · rooms · price; empty → the deal name |
| 26 | BR-APP-066 | `roomsLabel`, `priceLabel` | «{n}-комн.», «{n}+ комн.», «{lo}–{hi} комн.»; «до X», «от X», «X–Y» |

`normalizeFilters(input)` is used for every state change, address read and API body: missing keys from the
defaults of the input's deal, booleans coerced, numbers finite integers or `null`, lists as lists, zones in
canonical order, unknown keys dropped, a polygon under 3 points dropped. Like the server's normaliser it also closes
the enums, keeps the types the deal offers in `TYPES_BY_DEAL` order (none → apartments), drops repeated list codes
(at most 100 matching `^[\w.-]{1,64}$`), keeps the bounds of `config/filters.php` (`posted_days` 1, 3 or 7), lets
`pets_only` win over `pets`, rounds a polygon to 5 decimals, opens a closed one and keeps 3 – 40 vertices, and reads
own properties only; it does not resolve the geography modes, so a server radar keeps what it sent. No `undefined` can reach `filtersKey` —
the fix of LB-APP-007. `sortOptions(f, null)` (reference data not loaded) returns only `new`, `cheap`,
`expensive` — the fix of LB-APP-023. `serializePolygon` / `parsePolygon` hold the wire form; the drawing rules of
the lasso are WP-28's. `areaLabel(f, city)`: «Своя область», «Центр и ближе к центру» (`sum.zonesBoth`), the
zone name before « (», two districts and «+N». `filtersAreaSummary(f, ctx)` is the area line of a radar tile and
of the radar sheet header (WP-30 uses it under this name): the legacy function of the same name, listed in task
KV-FE-020 next to `filtersSummary` and `filtersTitle` — its composition is read from the audited `summary.js`
and fixed by a snapshot test in three locales. Server-stored types in a radar title go through `labelFor`
(WP-20).

**Flagged branches** (argument `rules`; every member is `false` by default, except `dev017PetsLongRentOnly` of row 6,
which follows the pinned release and is `true`, DEC-58):

| # | Flag | Defect | Off (legacy) | On |
| - | ---- | ------ | ------------ | -- |
| 1 | `dev017TenantPetsDailyRule` | LB-APP-029 | tenant and pets sections visible for daily rent although the switch clears them. Since the intake of `index-CIa0Ldj2.js` this key governs the tenant section only (row 6 has the pets half) | sections hidden for daily rent (after the split: the tenant section) |
| 2 | `dev018ResetKeepsDaily` | LB-APP-030 | «Сбросить» returns to `rent_long` | reset keeps `rent_daily` |
| 3 | `dev025ValidateRanges` | LB-APP-043 | `fixRanges` returns its input: inverted price or area ranges are sent as typed | `fixRanges` swaps the bounds |
| 4 | `dev052UnifiedBelowMedianRule` | — | row 17 above | the single rule of DEV-052 as approved; until then a `todo` test and no effect |
| 5 | `dev005RadarDropsPostedDays` | — | `toRadarFilters` keeps `posted_days` | sets it to `null` |
| 6 | `dev017PetsLongRentOnly` (on by default since the intake of `index-CIa0Ldj2.js`, DEC-58) | LB-APP-029, the pets half, fixed in legacy by that release | the pets section for both rents (legacy up to `index-CBlEKxdL.js`) | `pets` only when `deal === "rent_long"` (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `availability.ts`, `lib/search/rules.ts` and `lib/flags.ts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 39)) |

**Whole-city label (DEC-54, no flag).** The audited `summary.js` prints `sum.wholeCity` where the city's name is
unknown (`city.name || «Весь Ташкент»`). HOMI: `filtersSummary` starts with the city's name and the area (the
legacy `[name, area]`) and leaves the city part out while the name is unknown; `filtersAreaSummary` prints the
area, else `sum.wholeCity` with the argument `{city}` = the name of the filters' city in the reference data
(`findCity`, exact code only), else nothing. Whether the collapsed title should also read «{city} целиком» is
open for the reviewer. The
key keeps its legacy name; its value is overridden in the `homi` layer: ru «{city} целиком», uz «Butun {city}», en
«All of {city}» (uz and en are proposals for the reviewer). When the city's name is not known yet (reference data
not loaded) the part is left out. The fixed «Весь Ташкент» of legacy is never printed, and no generic
«Весь город» key is added.

### Formatters (`frontend/packages/i18n/src/format/`, exported as `@homi/i18n/format`)

Pure functions; the locale, the clock and a `t(key, values)` function are arguments. The existing `formatPrice`
and `intlLocale` of `@homi/utils` are a different contract (minor units, `en-US`) and are not used by the Mini
App. A formatter with a flagged branch takes the flag as a plain last option that the caller fills from
`devFlags` — `formatMetroLabel(name, km, { oneFormatter })`, `formatFlow(rate, surface, t, { oneVocabulary })` —
because the package never imports `lib/flags.ts`. The locale and `t` are explicit arguments wherever a formatter
prints: `formatNumber(value, locale)`, `formatDecimal(value, locale)`, `formatKm(km, locale)`,
`formatCount(n, pluralKey, locale, t)`, `formatMetroLabel(name, km, locale, t, { oneFormatter })`,
`formatDistance(km, locale, t, { approx })`, `formatCenter(km, locale, t)`; the date zone comes from
`dateTimeZone(devFlags.dev014TashkentDates)` (`undefined` = the device zone).

- **Numbers.** `numberLocale(locale)` of WP-20 (`src/locale.ts`, not written again): `ru-RU` for ru and uz,
  `en-GB` for en. `formatNumber`, `formatDecimal`
  (at most one fraction digit), `formatCount(n, pluralKey)`.
- **Money** (`money.ts`, BR-APP-060): `createMoney({ locale, currency, usdUzs, t })` → `isUzs` (currency `UZS`
  **and** rate > 0), `format(usd)`, `unitLabel()`, `toInput(usd)`, `parseInput(text)`, `presets(…)`.
  USD: `$` + the rounded integer in the number locale (`$1 200`, en `$1,200`). UZS: «{value} млрд сум»
  (`money.bln`) and «{value} млн сум» (`money.mln`) with one decimal, below a million rounded to thousands
  «850 000 сум» (`money.uzs`). Inputs: UZS in millions with one decimal (unit `money.unitMln`), USD an integer.
  Fix of LB-APP-011: round to the display precision first, then choose the unit (999 500 сум → «1 млн сум»);
  parse by stripping spaces of every kind, treating one `,` or `.` followed by one or two digits as the decimal
  mark and repeated separators as thousands (`1.000.000` → 1 000 000); `0`, empty and non-numbers → `null`; UZS
  input converts with `max(1, round(value · 10⁶ / rate))`. A negative or non-finite amount formats to an empty
  string and reports once (`report` of `createMoney`). Since legacy release `index-CIa0Ldj2.js` (`03` §3.5): the
  dollar field accepts one leading or trailing `$` with the amount — in `parseInput`, which knows the currency;
  `parseAmount` does not, and «$1200» stays `null` in сум (*added by the intake of `index-CIa0Ldj2.js`*; a parity
  item of `money.ts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 41)) —, and
  `toInput()` prints the сум field's millions without a thousands separator (*added by the intake of
  `index-CIa0Ldj2.js`*; a parity item of `money.ts` for a later package (`wave-1/baseline.md`, built code behind
  the pin, row 42)). `presets(deal, { city, reference })`: in USD the city
  presets, else the reference presets; in UZS the city presets converted and rounded per deal, at least one step,
  duplicates dropped in first-seen order, else the fixed lists (reference presets are not used in UZS, as legacy).
- **Dates** (`date.ts`): `formatShortDate(iso, locale, { timeZone })` — «5 мар» (dot removed), «5 Mar», «5-mar»
  with the Uzbek short months `yan … dek` as a constant; `formatTime`; `formatAgo(iso, now, t)` — under 2 min
  «только что», then minutes, hours under 48 h, then days (`market.info.ago*`), a future time is «только что»;
  `tashkentDayKey(date)`. LB-APP-025: with `dev014TashkentDates` off the zone argument is the device zone, as
  legacy up to `index-CBlEKxdL.js`; on, `Asia/Tashkent`. The flag is on by default since the intake of
  `index-CIa0Ldj2.js`, because legacy formats the listing's history in Asia/Tashkent since that release (DEC-58);
  both branches stay tested (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `lib/flags.ts` for a
  later package (`wave-1/baseline.md`, built code behind the pin, row 27)). A device-zone value must not be
  produced during server rendering — the caller renders it on the client
  (`preventing-flash-before-hydration.md`); an invalid date gives `null`.
- **Age** (legacy since `index-CIa0Ldj2.js`, `03` BR-APP-109): a formatter of the listing's age over `posted.at`
  and the clock, in four steps of whole units, rounded down — under 1 minute `card.ageNow`, 1 … 59 minutes
  `card.ageMin`, 60 … 1 439 minutes `card.ageHours`, from 1 440 minutes `card.ageDays`; a missing or unparsable
  `at` gives `null`, and the caller prints the server's `posted.when` (*added by the intake of
  `index-CIa0Ldj2.js`*; a parity item of `cardText.ts` for a later package (`wave-1/baseline.md`, built code
  behind the pin, row 20)).
- **Distance** (`distance.ts`): `formatMetroLabel(name, km)` (BR-APP-029) — shown only within 1.5 km, name only
  under 50 m, else «{metro} · {m} м» with metres rounded to 100; `formatDistance(km, { approx })` (BR-APP-031) —
  under 0.1 km «рядом», under 0.95 km metres rounded to 100, else kilometres with one decimal, `~` prefix when
  approximate; `formatCenter(km)` «{km} км до центра». LB-APP-031: `dev019OneDistanceFormatter` on makes the metro
  label use the thresholds of `formatDistance` inside the 1.5 km cap: the name alone under 0.1 km, «{metro} · {m} м»
  under 0.95 km, else «{metro} · {km} км» (`near.km`; a key of its own when DEV-019 is approved).
- **Flow** (`flow.ts`, BR-APP-044): `flowRate(flow)` → `null` unless the answer is an object with a numeric
  `week` and `days > 0`; `week = 0` → `none`; `week / days < 1` → `week` with N; else `day` with N rounded.
  `formatFlow(rate, surface, t)` for `sheet | tile | nudge`: «📡 За неделю таких не было — радар будет срабатывать
  редко» (`sheet.flowNone`), «📡 Радар: {n} за неделю» (`sheet.flowWeek`), «📡 Радар: ≈{n} в день»
  (`sheet.flowDay`); tiles «пока редко» (`alert.rare`), «{n} за неделю» (`alert.week`), «≈{n} в день»
  (`alert.day`); nudge «Таких пока нет — радар пришлёт, как появятся» (`nudge.none`). LB-APP-033:
  `dev021OneFlowVocabulary` on uses the sheet vocabulary, 📡 included, on every surface.
- `lib/money/useMoney.ts`: `createMoney` bound to `me.currency`, the reference rate and next-intl's `t`; a new
  instance after a currency change.

Server-formatted strings (`03` §1.12: card price, age, title, status, pin label) are rendered as they arrive; this
package formats only what the client formats in legacy. Both must agree with the server (Q-APP-011, Q-API-062).

## Files

- `frontend/app/lib/api/{server,errors,browser,bffAllowList,scenario,types}.ts`, `lib/security/sameOrigin.ts`; `frontend/app/app/bff/[...path]/route.ts`;
  changed `frontend/app/app/bff/session/route.ts` (scenario forwarding) and
  `frontend/packages/api-client/src/index.ts` with its test (empty body, list query).
- `frontend/app/lib/actions/{run,validate,useAction}.ts`; `onForbidden()` in `lib/session/bootstrap.ts`; the
  `homi-city` overwrite in `lib/session/SessionProvider.tsx`.
- `frontend/app/lib/data/{useResource,sessionMaps}.ts`; changed `lib/data/sources.ts`.
- `frontend/app/lib/reference/{server,empty,types,ReferenceFeed,ReferenceProvider,useReference}.ts(x)`; changed
  `app/[locale]/layout.tsx`; `features/shell/{SearchProof,SearchProofServer}.tsx` and the feed and map pages (step 13);
  the `Asia/Tashkent` unit-test run of `.github/workflows/frontend.yml` gains `@homi/i18n`.
- `frontend/app/lib/search/{useSearchState,readSearchState,rules}.ts`; `frontend/app/lib/money/useMoney.ts`.
- New package `frontend/packages/search/**` with the `lint`, `typecheck` and `test` scripts of the other
  packages and its project in `frontend/vitest.config.mts`; `frontend/app/package.json` (workspace dependencies
  `@homi/search`, `@homi/api-client`, `@homi/types`); `frontend/pnpm-lock.yaml` (workspace links only).
- `frontend/packages/i18n/src/format/{index,number,money,date,distance,flow}.ts`, `package.json` (export),
  `messages/homi/*.json` (one key: the override of `sum.wholeCity`).
- Tests: `frontend/packages/search/tests/*.test.ts`, `frontend/packages/i18n/tests/format/*.test.ts`,
  `frontend/app/tests/{api,actions,data,reference,search}/*.test.ts(x)`, `frontend/app/e2e/data.spec.ts`.
- `CLAUDE.md` "Layout" (the new package) through the shared-file rule.

## Steps

1. Read the documents above. Read the WP-11 … WP-13 contracts and the generated `@homi/types`; list every field
   this specification names by meaning and its real name in the PR description.
2. `@homi/search`: `types`, `defaults`, `normalize`, `compare`, `rooms` with tests.
3. `@homi/search`: `transitions`, `availability`, `sort` with the before/after tables as tests.
4. `@homi/search`: `summary`, `polygon`, `radar`, the flagged branches.
5. `@homi/search`: `url` and `api` with round-trip tests.
6. `@homi/i18n/format`: numbers and money with the fixture table; then dates, distance, flow.
7. `lib/api/errors.ts` and `server.ts`; unit tests against a fake API.
8. `bffAllowList.ts`, the pass-through route, `browser.ts`; tests for the allow-list, both auth sources and the
   re-authentication retry.
9. `lib/actions/run.ts`, `useAction`; a test action proves cookie mode, header mode and refusal.
10. `useResource`, `sessionMaps`, the source reporting; component tests.
11. `lib/reference/*` and the provider in the root layout; check that the reference call is cached and that no
    per-user call is (the build output cannot show it since ADR-0020: count the app server's API calls, AM-58).
12. `useSearchState`, `readSearchState`, `rules.ts`, `useMoney`.
13. Replace two placeholders with a visible proof (the feed and the map): it prints the parsed filters, the count
    of cities and the count of `GET /listings/count`; a button changes a filter through `setFilters`. `e2e/data.spec.ts` runs it in both modes.
14. `make ci-frontend`; update `CLAUDE.md` through the shared-file rule.

## Behaviour to reproduce

- **Defaults and transitions:** rows 1 – 23 of the rules table, exactly; the flag table for the three legacy
  decisions.
- **Comparison:** `{ …f, posted_days: 7 }` equals `f` for radar matching; a city object without a metro mark
  leaves `near_metro` at `false`, the filters are not "custom" and the follow nudge does not fire (LB-APP-007).
- **Sort:** before reference data arrives only the three basic sorts are offered and nothing throws
  (LB-APP-023); a stored `center` falls back to `new` in a city without zones.
- **Summaries** (ru): «Ташкент · Юнусабадский · у метро · 2-комн. · до $600 · без риелторов»; title «Посуточно ·
  Дом, Комната · 1–3 комн. · от $40», empty → «Аренда». The whole city reads «Фергана целиком» — legacy prints
  «Весь Ташкент» for every city (LB-APP-026); HOMI builds the label from the city's own name (DEC-54).
- **Money** (ru): `$1 200`; «850 000 сум»; 999 499 → «999 000 сум»; 999 500 … 999 999 → «1 млн сум»;
  1 500 000 000 → «1,5 млрд сум»; currency `UZS` with a missing or zero rate → USD display.
- **Dates, distances, flow:** the examples in the formatter list; kilometres use the locale's decimal mark.
- **Errors:** the mapping table; one retry button repeats the failed read; data already shown is kept.
- **Session modes:** the same screen renders from `initial` in cookie mode and from `bffFetch` in header mode.
- **Demo marker:** any answer with `meta.source = stub`, read on the server or in the browser, shows it.
- **Address:** equal filter states give equal addresses; reserved parameters survive a filter change untouched
  and never become filters; a reload restores the same state.

## Tests

**Unit, `frontend/packages/search/tests/`.**

- `defaults`: the 25 keys and their values. `normalize`: missing keys, `undefined`, numeric strings, unknown
  keys, zones order, a 2-point polygon.
- `compare`: `filtersKey` equality cases; active count per group; `isCustomFilters` for daily rent.
- `rooms`: 1 → 3 gives 1–3; 4 → 2 gives 2–4+; 2 → 2 stays 2; `null` clears; with only `rooms_max` = 2 the values 1 and
  2 are picked and "any" is false (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of `rooms.ts` for a
  later package (`wave-1/baseline.md`, built code behind the pin, row 40)).
- `transitions`: deal switch keeps geography; daily switch clears tenant and pets; the last type cannot be
  removed; `below_median` dropped when a second type is added; city matrix (metro × medians × zones); reset with
  `dev018ResetKeepsDaily` off and on; quick reset of price clears `below_median`.
- `availability`: section matrix deal × types × mode, tenant and pets with `dev017TenantPetsDailyRule` off and on;
  `belowMedianAvailable` matrix; `fixRanges` off and on for price and area. Since the intake of `index-CIa0Ldj2.js`:
  area for rent, daily rent and sale; the pets matrix for both values of `dev017PetsLongRentOnly` and the tenant
  matrix for both values of `dev017TenantPetsDailyRule` (*added by the intake of `index-CIa0Ldj2.js`*; a parity item
  of `availability.ts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 38 and row 39)).
- `sort`: matrix sale / rent / daily × apartment-only × medians × zones × city `null`.
- `summary`: snapshots in ru, uz, en; the whole-city label for Tashkent and Fergana in three locales («Фергана
  целиком», «Butun Fargʻona», «All of Fergana») and without a city name (the part is absent); an unknown type
  in a radar title gives the fallback label.
- `url`: round trip for every key; defaults omitted; `sort=new` omitted; fixed order; reserved parameters
  ignored (`from=map&focus=pets&pick=city&draw=1&pin=5&step=report&i=2` → default filters); garbage values
  normalised; polygon with 3 and 40 vertices, 5 decimals.
- `api`: `new` never sent; `toRadarFilters` with `dev005RadarDropsPostedDays` off and on.

**Unit, `frontend/packages/i18n/tests/format/`.**

- `money`: the table of "Behaviour"; `parseInput('1.000.000')` = 1 000 000 in USD mode; `parseInput('1,2')` at
  rate 12 650 in UZS mode = 95; `'0,001'` = 1 in USD mode (three digits after one separator are a thousands group;
  the UZS floor `max(1, …)` is shown by `'0,01'` at a rate of 30 000); `'0'`, `''`, `'abc'` → `null`; presets rounded to the step without
  duplicates; fixed lists without city presets; negative and `NaN` → empty string. Since the intake of
  `index-CIa0Ldj2.js`: «$1200» and «1 200 $» → 1200 in dollars and still `null` in сум; the сум field of 1 500 млн
  prints without a thousands separator and parses back (*added by the intake of `index-CIa0Ldj2.js`*; a parity item of
  `money.ts` for a later package (`wave-1/baseline.md`, built code behind the pin, row 41 and row 42)).
- `date`: «5 мар» / «5 Mar» / «5-mar»; `tashkentDayKey('2026-11-08T19:30:00Z')` = `2026-11-09`; ago steps at 1
  min, 5 min, 30 h, 3 days, a future time; device zone vs `Asia/Tashkent` under two `TZ` values.
- `distance`: metro 0.04 km → name only; 0.83 km → «· 800 м»; 1.6 km → nothing; nearby 0.08 → «рядом», 1.26
  approximate → «~1,3 км»; `dev019OneDistanceFormatter` on.
- `flow`: `null`, a string, `days = 0` → no line; 0, 4 and 21 per 7 days on the three surfaces;
  `dev021OneFlowVocabulary` on.

**Unit and component, `frontend/app/tests/`.**

- `api/errors.test.ts`: each row of the mapping table. `api/server.test.ts`: token from the cookie; locale
  header; timeout; an error object holds no header or query; a `204` is `ok`; `types[]` is sent twice for two
  types; the `homi_stub_scenario` cookie becomes `X-Stub-Scenario` with `NEXT_PUBLIC_APP_ENV=ci` and is not sent
  with `production`.
- `api/bff.test.ts`: every allowed path; a path outside the list → 404; `listings/abc` → 404; cookie and bearer;
  foreign origin refused; `Set-Cookie` not forwarded; status passed through.
- `api/browser.test.ts`: bearer only in header mode; `401` → one re-authentication, one repeat; second `401` →
  `unauthorized`; `reportSource` called.
- `actions/run.test.ts`: cookie token; argument token; neither → refusal without a request; invalid input → no
  request; `204` → success.
- `data/useResource.test.tsx`: `initial` without a request; shared in-flight request; abort on key change; stale
  entry shown while refetching; `mutate`; `invalidate`; `403` with `dev001AnyForbiddenShowsAccess` off and on.
- `data/sessionMaps.test.ts`: overrides and `resetHidden`.
- `reference/useReference.test.tsx`: `radars_enabled` `true` and `false` are passed through; an absent key and an
  empty reference read as `false`; the radar limit falls back to 10.
- `search/useSearchState.test.tsx`: fallback city order; `setFilters` keeps a reserved parameter; `setSort('new')`
  removes the parameter.

**End to end (Playwright, fake Telegram, stubs, cookie mode and header mode).** `e2e/data.spec.ts`: the proof
page shows the parsed state and the demo marker; a filter change rewrites the address without a history entry;
reload restores it; in header mode the read goes through `/bff` with the bearer header and no cookie; a path
outside the allow-list answers 404.

## Acceptance checklist

- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, Vitest and Playwright are green.
- [ ] `@homi/search` and `@homi/i18n/format` import nothing from `frontend/app`, React or Next.js.
- [ ] Every row of the rules table has a test named after its rule.
- [ ] LB-APP-007, LB-APP-011 and LB-APP-023 are fixed and each has a test that fails on the legacy behaviour.
- [ ] The whole city reads «{city} целиком» with the city's own name in ru, uz and en; «Весь Ташкент» appears
      nowhere (LB-APP-026, DEC-54).
- [ ] `useReference()` exposes `radars_enabled` and reads a missing value as `false`; `403 radars_disabled` maps to
      its own error.
- [ ] Each flagged branch of this package has a test for the flag off (legacy) and on.
- [ ] The address round trip holds for all 25 keys and `sort`; reserved parameters are ignored by
      `fromSearchParams` and never emitted by `toSearchParams`.
- [ ] Equal states produce byte-equal addresses.
- [ ] Uzbek numbers use the Russian separators; English uses `en-GB`.
- [ ] Money, date, distance and flow examples of "Behaviour to reproduce" hold in ru, uz and en.
- [ ] A per-user call is never cached: the app server's API calls, counted while it serves pages, show only the
      reference calls as cached (the build output lists every route as `ƒ` since ADR-0020, AM-58).
- [ ] Reference data loads once per locale and is reused across requests.
- [ ] `/bff` passes only the listed reads; a mutation path or an unknown path answers 404.
- [ ] Cookie mode and header mode render the same proof screen.
- [ ] A `401` on a read is repaired by one re-authentication without the user noticing.
- [ ] `503 source_unavailable` shows the "could not load" state with a working retry.
- [ ] With `dev001AnyForbiddenShowsAccess` off a `403` on a list shows «Нет доступа — повторить»; on, the access
      screen (test).
- [ ] The demo marker shows for a stub answer read on the server and for one read in the browser.
- [ ] No token, launch data or query string appears in an error object or a log call (unit spies).
- [ ] Field names taken from the contract are listed in the PR description; any contract gap was fixed in the
      contract specification in the same PR.

## Handoff

- **Steps 1–14 are done** on `feat/wp-22-data-layer`, tests first. `@homi/search` (steps 2–5) and
  `@homi/i18n/format` (step 6) were written by two subagents in parallel and spot-checked; the app side (steps 7–13)
  in the main session. Mutation-checked: `@homi/search` 101 breaks, every non-equivalent one caught (2 equivalent:
  `normalizeFilters` undoes both); `@homi/i18n/format` 68 breaks, 67 caught (the survivor is a type guard with no
  runtime effect); the app modules 53 breaks, all caught after one added test. The contract field names are listed in
  the PR description.
- **Checks:** `make ci-frontend` → exit 0 (app 480, `@homi/search` 238 + 1 todo, `@homi/i18n` 108, `@homi/testing`
  95, `@homi/api-client` 14); `@homi/i18n` also under `TZ=Asia/Tashkent` (108 passed); Playwright `e2e/data.spec.ts`
  → 5 passed against the local API on stubs; `API_URL=http://127.0.0.1:9/api/v1 pnpm --filter app build` → exit 0
  (AM-58); behind a counting proxy only `GET /reference` and `GET /cities` are cached (once per locale), `GET /me` and
  `GET /listings/count` run on every request with a session.
- **Corrections made in this specification (rule 6):** the empty-body fact of `@homi/api-client` (a `204` was already
  handled; an empty `200`/`201` was not); `ApiResult` failures with `method` and `path`; `createServerApi`,
  `publicApi` and `io()` before the request id; `lib/api/scenario.ts` and `lib/security/sameOrigin.ts`; the `414`,
  `502` and `504` of `/bff`; `runAction.invalid`, `validate.ts` and ULIDs in either case; `refreshing`, `flags`,
  `invalidate` re-reading and the server rule of `useResource`; `onForbidden()`; the readers of `sessionMaps`; the
  `{ loaded, data, source? }` of the reference calls, `ReferenceFeed` and the shape of `useReference()`; the build
  makes no reference call (AM-58); the write order of `useSearchState`; `furnished` as `1`/`0` and the `name[]` and
  `true` of the v1 query; `sectionsFor(…, stats)`; `has_median === true`; the preset toggle of row 14; `resetAll`'s
  city code; what `normalizeFilters` also does; the whole-city label of `filtersSummary` and `filtersAreaSummary`;
  the formatter signatures with locale and `t`; `presets(deal, { city, reference })`; the `dev019` thresholds; the 📡
  of `dev021`; the `'0,001'` example; `vitest.config.mts`; the files list; step 13 on the feed and the map.
- **Decisions of the implementation** (no ADR): `ReferenceProvider` feeds a client store from inside `<Suspense>`
  next to the page; the proof of step 13 reads `GET /listings/count` (server-side `initial` only when the keys of
  server and client agree); the profile's city overwrites `homi-city` in `SessionProvider`; `@homi/i18n` joins the
  `Asia/Tashkent` unit-test run of CI.
- **Open for the reviewer:** should the collapsed title (`filtersSummary`) also read «{city} целиком» (today only
  `filtersAreaSummary` prints it)? The uz and en wording of the whole-city label (`Butun {city}`, `All of {city}`)
  are proposals. Input parsing is strict (`$1200`, `-5`, `1e5` → no value; legacy stripped other characters), and a
  USD input that rounds to 0 is no value. ESLint does not lint `packages/*` (no root config; the packages' `lint`
  scripts are placeholders) — the new code was linted with the app's config.
- **Shared files:** `CLAUDE.md` "Layout" (the new package `@homi/search`, `@homi/i18n/format`) follows in the
  follow-up docs PR after the merge, as for WP-20 and WP-21. `.github/workflows/frontend.yml` (the `Asia/Tashkent`
  run gains `@homi/i18n`), `frontend/vitest.config.mts` (the `@homi/search` project), `frontend/app/package.json` and
  `frontend/pnpm-lock.yaml` (workspace links only) are in this PR and announced there.
- **For the next packages:** WP-23 renders `ErrorState` from `UiError` (`error.offline`, `common.loadFailed`, …),
  writes `lib/actions/settings.ts` with `runAction` and calls `patchMe` after it; WP-24 builds `useCursorFeed` on
  `bffFetch` / `serverApi().listings` with `toApiQuery(…, { cursor, limit })` and replaces the feed proof (as built,
  WP-24: the caller owns the query and `limit`, the hook only appends `cursor`, and the proof moved to `/map`); WP-25
  builds the filters UI on `sectionsFor`, the transitions and `useMoney().presets`; WP-27 replaces the map proof;
  WP-33 adds the `setScenario` helper over the `homi_stub_scenario` cookie.
- **Merged** on 2026-11-16 on the developer's «все commit push main» (merge commit `e8c8f9e`), after `frontend`
  (run 43740527305) and `frontend-e2e` (run 43740527311, 56 passed) were green on `3bb7831`; `frontend` on `main`
  after the merge: run 43768797356, green. The first CI run (`e051f85`) failed two `data.spec.ts` cases on a hidden `<Activity>`
  copy of the proof; the spec matches visible elements since `3bb7831`. This status, `CLAUDE.md` and the memory are in
  the follow-up docs PR.
- **Next:**
  1. ~~review and merge~~ (done);
  2. the production track deploys; the app server reaches the API over the `API_URL` WP-21 asked for, and the feed
     and map placeholders show the proof on staging (once WP-24 is deployed, only the map shows it; the feed lists
     listings);
  3. set the status to `DONE`. WP-23 (gates and shell) builds on this package.
