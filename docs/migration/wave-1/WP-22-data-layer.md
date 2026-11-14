# WP-22 — Data layer, formatters and the filter model

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
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
- DEC-36. Fixed here: LB-APP-007, LB-APP-011, LB-APP-023. Written behind flags that are off: LB-APP-025
  (`dev014TashkentDates`), LB-APP-026 (`dev015NeutralWholeCity`), LB-APP-029 (`dev017TenantPetsDailyRule`),
  LB-APP-030 (`dev018ResetKeepsDaily`), LB-APP-031 (`dev019OneDistanceFormatter`), LB-APP-033
  (`dev021OneFlowVocabulary`), LB-APP-043 (`dev025ValidateRanges`), LB-APP-045
  (`dev001AnyForbiddenShowsAccess`). Also wired: `dev052UnifiedBelowMedianRule`, `dev005RadarDropsPostedDays`.
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
  `ApiResult<T> = { ok: true, data, meta } | { ok: false, error: UiError, status, code? }` — it does not throw for
  an HTTP answer. The locale comes from the root parameter getter in Server Components (`next-root-params.md`
  says the getter does not run in Server Actions or Route Handlers, so those pass the locale in).
- `errors.ts`: `UiError` and `toUiError(statusOrFailure)` (table below). An error object carries the method, the
  path template (`listings/:number`), the status and the code — never headers, a query string or a body.
- `browser.ts`: `bffFetch(path, { query, signal })` → `GET /bff/<path>`; sends `Accept-Language`; adds
  `Authorization: Bearer` in header mode (`getAuth()` of WP-21); on `unauthorized` awaits `reauthenticate()` once
  and repeats the request; returns the same `ApiResult<T>`. Every successful answer calls `reportSource(meta.source)`.
- `bffAllowList.ts` and `app/bff/[...path]/route.ts`: a pass-through for **reads** only. The complete list ships
  here so later packages do not touch it: `GET` `me`, `settings`, `reference`, `cities`, `listings`,
  `listings/count`, `listings/flow`, `listings/map`, `listings/:number`, `favorites`, `history`, `hidden`,
  `radars`. (`POST events` and `boot-error` are added by WP-32.) The handler rejects anything else with `404`,
  accepts same-origin requests only, takes the token from the cookie or the bearer header, validates `:number` as
  a positive integer, caps the query string at 4 KB, forwards the API's status and body unchanged, answers
  `Cache-Control: private, no-store`, never forwards `Set-Cookie`, never logs the query.

### Error mapping

| # | Answer | `UiError` | What screens do with it |
| - | ------ | --------- | ----------------------- |
| 1 | request never completed | `offline` | `ErrorState` offline: «Нет связи» (`error.offline`), «Проверьте интернет и попробуйте ещё раз.» (`error.offlineText`) |
| 2 | no answer in 15 s | `timeout` | as offline (legacy treats both as status 0) |
| 3 | `5xx`, unreadable `2xx` body | `server` | «Не загрузилось» (`common.loadFailed`), «Сервер не ответил. Попробуйте ещё раз через минуту.» (`error.serverText`), «Повторить» (`error.retry`) |
| 4 | `503` with code `source_unavailable` | `source_unavailable` | the same "could not load" state as row 3 (`25` §4.1) |
| 5 | `401` | `unauthorized` | never shown: `reauthenticate()` of WP-21; if that fails the session-expired state replaces the screen |
| 6 | `403` | `forbidden` | flag off: lists show the inline «Нет доступа — повторить» (`feed.retry` with `common.noAccess`), other screens row 3; with `dev001AnyForbiddenShowsAccess` on: `onForbidden()` sets the session to `denied` and the access screen opens (LB-APP-045) |
| 7 | `404` | `not_found` | the screen's own text (listing: `listing.loadFailed`) |
| 8 | `409` | `conflict` + `code` | radar limit and `no_chat` (WP-30) |
| 9 | `422` | `validation` | a mutation: `failed()` of WP-23 |
| 10 | `429` | `rate_limited` | reads: row 3; mutations: `failed()` |

A read that fails while older data is on screen keeps the data and shows the inline retry (`03` §1.6). An empty
`2xx` or `204` on a mutation is success.

### Server Actions (`frontend/app/lib/actions/`)

- `run.ts`: `runAction(auth, locale, fn)` resolves the token (cookie first, else `auth.token`), refuses to run
  without one (`unauthorized`), calls `fn(serverApi(...))`, and returns `ActionResult<T>` (the `ApiResult` union,
  serialisable). Each action re-reads the session itself; nothing trusts the client
  (`authentication-with-cache-components.md`, "Trusting the client for authorization").
- Every action is `'use server'`, takes `(input, auth?: { token?: string }, locale?)`, validates its input (listing
  numbers and radar ids as positive integers, enums against the generated types) and returns `ActionResult`. The
  token travels in the request body of the action, never in an address.
- `useAction(action)` (client): injects `auth` in header mode and the locale, awaits `reauthenticate()` once on
  `unauthorized`, and reports `meta.source`.
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

- `useResource(key, fetcher, { initial, enabled = true, staleMs = 30000 })` → `{ data, error, status, refetch,
  mutate }`, `status` = `idle | loading | success | error`. One module-level map keyed by `key`: `initial` seeds
  it; equal keys share one in-flight request; a key change or unmount aborts; a fresh entry is reused, a stale one
  is shown while it refetches; `mutate(updater)` writes optimistically; `invalidate(prefix)` drops entries.
  Memory only. With `cacheComponents`, hidden routes keep state and re-run effects when shown again
  (`preserving-ui-state.md`); the stale check is what stops a refetch storm on every Back.
- `sessionMaps.ts`: `favs`, `seen`, `hidden` for this launch (`03` §1.11) with `useSessionMap(name)`,
  `setFav(number, on)`, `markSeen(number)`, `hide(numbers)`, `unhide(numbers)`, `resetHidden()`. The server stays
  the truth after a reload.
- `sources.ts` (created by WP-20): `bffFetch`, `useAction` and the `SourceReporter` rendered next to every
  server-fetched `initial` all report, so the demo marker is right on every screen without per-screen code.

### Reference data (`frontend/app/lib/reference/`)

- `server.ts`: `getReference(locale)` and `getCities(locale)` — `'use cache'`, tagged `reference`, with a lifetime
  of about ten minutes (`cacheLife.md`). A cached function cannot read the cookie
  (`authentication-with-cache-components.md`), so both calls go **without a user token**. If the WP-11 contract
  requires a session for `GET /reference` or `GET /cities`, fix the contract in the same PR (queue rule 6); a
  per-user token must never become part of a cache key.
- `ReferenceProvider` (in the root layout, fed by the cached call) and `useReference()`: cities (code, name, kind
  city or region, centre, zones, districts, metro and median marks), renovations per deal, appliances, price
  presets per deal, locale and currency lists, the USD → UZS rate, the tile address, the radar limit, the support
  account. `useCityStats()`: counts per deal, presets and the typical price per city from `GET /cities`.
  `findCity(code)`.
- Defaults when a field is absent: radar limit 10; no support account → its rows are hidden; no cities →
  nothing that needs a city is offered (see LB-APP-023 below).

### Search state in the address (`frontend/app/lib/search/`)

- `useSearchState()` (Client Component, under `<Suspense>` as `use-search-params.md` requires) →
  `{ filters, sort, setFilters(next), setSort(sort), href(builder) }`. It reads the address with
  `fromSearchParams`, writes with `nav.replace(builder(toSearchParams(next, sort)))` on the current root (`/` or
  `/map`), and never touches a reserved parameter.
- `readSearchState(searchParams, me)` — the same parsing for Server Components.
- `searchStateFromHref(href)` — for callers that hold a remembered address (the shell of WP-23, the radar «+»).
- City when the address has none (BR-APP-001, BR-APP-010): `me.city`, else `homi-city`, else `tashkent`. At
  sign-in `homi-city` is overwritten with `me.city` without a server call. An address that already carries a city
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
parameters, booleans as `1`, `polygon` as `lat,lon;lat,lon…` with 5 decimals), omits every value equal to the
default of its deal, omits `deal=rent_long` and `sort=new`, always writes `city`, and emits keys in one fixed
order so equal states give equal addresses. `fromSearchParams(params, { fallbackCity })` reads **only** the 25
keys and `sort`, ignores everything else — in particular the reserved parameters `from`, `focus`, `pick`,
`draw`, `pin`, `step`, `i` (`RESERVED_PARAMS` of WP-20) — and passes the result through `normalizeFilters`, so a
hand-edited address cannot produce an invalid state. `toApiQuery(filters, { sort, cursor, limit })` is the single
mapping to the v1 query of WP-12; `new` is never sent.

**Rules and where they live.**

| # | Rule | Function | Content |
| - | ---- | -------- | ------- |
| 1 | BR-APP-001 | `defaultFilters(deal, city)` | `rent_long`, `types ['apartment']`, `owner 'any'`, lists empty, the rest `null` or `false` |
| 2 | BR-APP-002 | `switchDeal(f, deal)` | new deal's defaults, keeping `districts`, `zones`, `polygon` |
| 3 | BR-APP-003 | `switchRentTerm(f, term)` | keeps the types allowed for the term (else `['apartment']`), resets `price_min`, `price_max`, `below_median`; daily also clears `tenant`, `pets`, `pets_only` |
| 4 | BR-APP-004 | `sectionsFor(f, city, mode, rules).rentTerm` | rent only, and daily already selected or the city's daily count > 0 |
| 5 | BR-APP-005 | `toggleType(f, type)`, `TYPES_BY_DEAL` | rent `apartment, house, room, commercial`; daily `apartment, house, room`; sale `apartment, house, commercial, land`; the last type cannot be removed; `below_median` survives only for `['apartment']` |
| 6 | BR-APP-006 | `sectionsFor(…).rooms` | hidden when every type is `room`, `commercial` or `land` |
| 7 | BR-APP-007 | `pickRooms(f, value)` | one value; a second different value makes a range; `4` is "4 or more"; `null` clears |
| 8 | BR-APP-008 | `setGeography(f, { polygon \| zones \| districts })` | the three modes exclude each other; zones in the order `center, near_center`; `near_metro` independent |
| 9 | BR-APP-009 | `pickCity(f, city)` | clears `districts`, `polygon`; keeps `zones` only if the city has zones, `near_metro` only with metro, `below_median` only with medians — each coerced to a boolean (fix of LB-APP-007) |
| 10 | BR-APP-010 | `readSearchState` / `useSearchState` | the profile city wins over the saved one; an address with a city is not changed |
| 11 | BR-APP-011 | `countActiveFilters(f)` | groups: daily, non-apartment types, rooms, price, geography, metro, below-median, owner, tenant, pets (not for sale), furnished, renovation, floor, area, market, appliances, posted days |
| 12 | BR-APP-012 | `filtersKey(f)`, `sameFilters(a, b)` | defaults filled, keys and lists sorted, `posted_days` ignored |
| 13 | BR-APP-013 | `isCustomFilters(f)` | differs from the defaults of its base deal and city |
| 14 | BR-APP-014 | `applyPreset(f, usd)`, `isPresetSelected` | sets `price_max`, clears `price_min`; selected only with no minimum; city presets before reference presets |
| 15 | BR-APP-015 | `createMoney(…).presets(deal, …)` | UZS presets: city USD presets converted and rounded to 50 млн (sale), 0.1 млн (daily), 0.5 млн (rent), duplicates dropped; else the fixed lists of `03` §3.5 |
| 16 | BR-APP-016 | `sectionsFor(…).typicalPrice` | apartment-only searches (daily included) in a city with a name and a typical price |
| 17 | BR-APP-017 | `belowMedianAvailable(f, city, rules)` | non-daily, apartment-only, city with medians |
| 18 | BR-APP-018 | `sectionsFor(…).unitPriceHint` | sale searches that include land or houses |
| 19 | BR-APP-019 | `sectionsFor(…).tenant`, `.pets` | base deal rent, daily included (flag row below) |
| 20 | BR-APP-020 | `sectionsFor(…).area`, `.market`, `.appliances` | area and market for sale only; appliances for rent only |
| 21 | BR-APP-021 | `sectionsFor(…).posted` | `mode === 'search'` only |
| 22 | BR-APP-022 | `resetAll(f, city, rules)`, `resetQuick(f, kind)` | full reset → defaults of the base deal and city; quick reset → its own filter, price also clears `below_median` |
| 23 | BR-APP-023 | `sortOptions(f, city)`, `normalizeSort(sort, options)` | `new`, `cheap`, `expensive` always; `deal` for non-daily apartment-only with medians; `center` with zones; `ppm` for sale; unavailable → `new` |
| 24 | BR-APP-064 | `filtersSummary(f, ctx)` | `city · area · Посуточно · у метро · rooms · price · ≤ медианы · без риелторов / от хозяев` |
| 25 | BR-APP-065 | `filtersTitle(f, ctx)` | deal (unless long rent) · types (unless only apartments) · rooms · price; empty → the deal name |
| 26 | BR-APP-066 | `roomsLabel`, `priceLabel` | «{n}-комн.», «{n}+ комн.», «{lo}–{hi} комн.»; «до X», «от X», «X–Y» |

`normalizeFilters(input)` is used for every state change, address read and API body: missing keys from the
defaults of the input's deal, booleans coerced, numbers finite integers or `null`, lists as lists, zones in
canonical order, unknown keys dropped, a polygon under 3 points dropped. No `undefined` can reach `filtersKey` —
the fix of LB-APP-007. `sortOptions(f, null)` (reference data not loaded) returns only `new`, `cheap`,
`expensive` — the fix of LB-APP-023. `serializePolygon` / `parsePolygon` hold the wire form; the drawing rules of
the lasso are WP-28's. `areaLabel(f, city)`: «Своя область», «Центр и ближе к центру» (`sum.zonesBoth`), the
zone name before « (», two districts and «+N». Server-stored types in a radar title go through `labelFor` (WP-20).

**Flagged branches** (argument `rules`, every member `false` by default):

| # | Flag | Defect | Off (legacy) | On |
| - | ---- | ------ | ------------ | -- |
| 1 | `dev015NeutralWholeCity` | LB-APP-026 | with no city name the summary says «Весь Ташкент» (`sum.wholeCity`) | new key `sum.wholeCityGeneric` |
| 2 | `dev017TenantPetsDailyRule` | LB-APP-029 | tenant and pets sections visible for daily rent although the switch clears them | sections hidden for daily rent |
| 3 | `dev018ResetKeepsDaily` | LB-APP-030 | «Сбросить» returns to `rent_long` | reset keeps `rent_daily` |
| 4 | `dev025ValidateRanges` | LB-APP-043 | `fixRanges` returns its input: inverted price or area ranges are sent as typed | `fixRanges` swaps the bounds |
| 5 | `dev052UnifiedBelowMedianRule` | — | row 17 above | the single rule of DEV-052 as approved; until then a `todo` test and no effect |
| 6 | `dev005RadarDropsPostedDays` | — | `toRadarFilters` keeps `posted_days` | sets it to `null` |

New key: `sum.wholeCityGeneric` — ru «Весь город», uz «Butun shahar», en «Whole city» (`homi` layer).

### Formatters (`frontend/packages/i18n/src/format/`, exported as `@homi/i18n/format`)

Pure functions; the locale, the clock and a `t(key, values)` function are arguments. The existing `formatPrice`
and `intlLocale` of `@homi/utils` are a different contract (minor units, `en-US`) and are not used by the Mini
App.

- **Numbers.** `numberLocale(locale)`: `ru-RU` for ru and uz, `en-GB` for en. `formatNumber`, `formatDecimal`
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
  string and reports once.
- **Dates** (`date.ts`): `formatShortDate(iso, locale, { timeZone })` — «5 мар» (dot removed), «5 Mar», «5-mar»
  with the Uzbek short months `yan … dek` as a constant; `formatTime`; `formatAgo(iso, now, t)` — under 2 min
  «только что», then minutes, hours under 48 h, then days (`market.info.ago*`), a future time is «только что»;
  `tashkentDayKey(date)`. LB-APP-025: with `dev014TashkentDates` off the zone argument is the device zone, as
  legacy; on, `Asia/Tashkent`. A device-zone value must not be produced during server rendering — the caller
  renders it on the client (`preventing-flash-before-hydration.md`); an invalid date gives `null`.
- **Distance** (`distance.ts`): `formatMetroLabel(name, km)` (BR-APP-029) — shown only within 1.5 km, name only
  under 50 m, else «{metro} · {m} м» with metres rounded to 100; `formatDistance(km, { approx })` (BR-APP-031) —
  under 0.1 km «рядом», under 0.95 km metres rounded to 100, else kilometres with one decimal, `~` prefix when
  approximate; `formatCenter(km)` «{km} км до центра». LB-APP-031: `dev019OneDistanceFormatter` on makes the metro
  label use the same thresholds as `formatDistance`.
- **Flow** (`flow.ts`, BR-APP-044): `flowRate(flow)` → `null` unless the answer is an object with a numeric
  `week` and `days > 0`; `week = 0` → `none`; `week / days < 1` → `week` with N; else `day` with N rounded.
  `formatFlow(rate, surface, t)` for `sheet | tile | nudge`: «📡 За неделю таких не было — радар будет срабатывать
  редко» (`sheet.flowNone`), «📡 Радар: {n} за неделю» (`sheet.flowWeek`), «📡 Радар: ≈{n} в день»
  (`sheet.flowDay`); tiles «пока редко» (`alert.rare`), «{n} за неделю» (`alert.week`), «≈{n} в день»
  (`alert.day`); nudge «Таких пока нет — радар пришлёт, как появятся» (`nudge.none`). LB-APP-033:
  `dev021OneFlowVocabulary` on uses the sheet vocabulary on every surface.
- `lib/money/useMoney.ts`: `createMoney` bound to `me.currency`, the reference rate and next-intl's `t`; a new
  instance after a currency change.

Server-formatted strings (`03` §1.12: card price, age, title, status, pin label) are rendered as they arrive; this
package formats only what the client formats in legacy. Both must agree with the server (Q-APP-011, Q-API-062).

## Files

- `frontend/app/lib/api/{server,errors,browser,bffAllowList}.ts`; `frontend/app/app/bff/[...path]/route.ts`.
- `frontend/app/lib/actions/{run,useAction}.ts`.
- `frontend/app/lib/data/{useResource,sessionMaps}.ts`; changed `lib/data/sources.ts`.
- `frontend/app/lib/reference/{server,ReferenceProvider,useReference}.ts(x)`; changed `app/[locale]/layout.tsx`.
- `frontend/app/lib/search/{useSearchState,readSearchState,rules}.ts`; `frontend/app/lib/money/useMoney.ts`.
- New package `frontend/packages/search/**`; `frontend/pnpm-lock.yaml` (workspace link only).
- `frontend/packages/i18n/src/format/{index,number,money,date,distance,flow}.ts`, `package.json` (export),
  `messages/homi/*.json` (one key).
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
11. `lib/reference/*` and the provider in the root layout; check in the build output that the reference call is
    cached and that no per-user call is.
12. `useSearchState`, `readSearchState`, `rules.ts`, `useMoney`.
13. Replace two placeholders with a visible proof: the feed placeholder prints the parsed filters and the count of
    cities; a button changes a filter through `setFilters`. `e2e/data.spec.ts` runs it in both modes.
14. `make ci-frontend`; update `CLAUDE.md` through the shared-file rule.

## Behaviour to reproduce

- **Defaults and transitions:** rows 1 – 23 of the rules table, exactly; the flag table for the four legacy
  decisions.
- **Comparison:** `{ …f, posted_days: 7 }` equals `f` for radar matching; a city object without a metro mark
  leaves `near_metro` at `false`, the filters are not "custom" and the follow nudge does not fire (LB-APP-007).
- **Sort:** before reference data arrives only the three basic sorts are offered and nothing throws
  (LB-APP-023); a stored `center` falls back to `new` in a city without zones.
- **Summaries** (ru): «Ташкент · Юнусабадский · у метро · 2-комн. · до $600 · без риелторов»; title «Посуточно ·
  Дом, Комната · 1–3 комн. · от $40», empty → «Аренда».
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
- `rooms`: 1 → 3 gives 1–3; 4 → 2 gives 2–4+; 2 → 2 stays 2; `null` clears.
- `transitions`: deal switch keeps geography; daily switch clears tenant and pets; the last type cannot be
  removed; `below_median` dropped when a second type is added; city matrix (metro × medians × zones); reset with
  `dev018ResetKeepsDaily` off and on; quick reset of price clears `below_median`.
- `availability`: section matrix deal × types × mode, tenant and pets with `dev017TenantPetsDailyRule` off and on;
  `belowMedianAvailable` matrix; `fixRanges` off and on for price and area.
- `sort`: matrix sale / rent / daily × apartment-only × medians × zones × city `null`.
- `summary`: snapshots in ru, uz, en; whole-city label with `dev015NeutralWholeCity` off and on; an unknown type
  in a radar title gives the fallback label.
- `url`: round trip for every key; defaults omitted; `sort=new` omitted; fixed order; reserved parameters
  ignored (`from=map&focus=pets&pick=city&draw=1&pin=5&step=report&i=2` → default filters); garbage values
  normalised; polygon with 3 and 40 vertices, 5 decimals.
- `api`: `new` never sent; `toRadarFilters` with `dev005RadarDropsPostedDays` off and on.

**Unit, `frontend/packages/i18n/tests/format/`.**

- `money`: the table of "Behaviour"; `parseInput('1.000.000')` = 1 000 000 in USD mode; `parseInput('1,2')` at
  rate 12 650 in UZS mode = 95; `'0,001'` = 1; `'0'`, `''`, `'abc'` → `null`; presets rounded to the step without
  duplicates; fixed lists without city presets; negative and `NaN` → empty string.
- `date`: «5 мар» / «5 Mar» / «5-mar»; `tashkentDayKey('2026-11-08T19:30:00Z')` = `2026-11-09`; ago steps at 1
  min, 5 min, 30 h, 3 days, a future time; device zone vs `Asia/Tashkent` under two `TZ` values.
- `distance`: metro 0.04 km → name only; 0.83 km → «· 800 м»; 1.6 km → nothing; nearby 0.08 → «рядом», 1.26
  approximate → «~1,3 км»; `dev019OneDistanceFormatter` on.
- `flow`: `null`, a string, `days = 0` → no line; 0, 4 and 21 per 7 days on the three surfaces;
  `dev021OneFlowVocabulary` on.

**Unit and component, `frontend/app/tests/`.**

- `api/errors.test.ts`: each row of the mapping table. `api/server.test.ts`: token from the cookie; locale
  header; timeout; an error object holds no header or query.
- `api/bff.test.ts`: every allowed path; a path outside the list → 404; `listings/abc` → 404; cookie and bearer;
  foreign origin refused; `Set-Cookie` not forwarded; status passed through.
- `api/browser.test.ts`: bearer only in header mode; `401` → one re-authentication, one repeat; second `401` →
  `unauthorized`; `reportSource` called.
- `actions/run.test.ts`: cookie token; argument token; neither → refusal without a request; invalid input → no
  request; `204` → success.
- `data/useResource.test.tsx`: `initial` without a request; shared in-flight request; abort on key change; stale
  entry shown while refetching; `mutate`; `invalidate`; `403` with `dev001AnyForbiddenShowsAccess` off and on.
- `data/sessionMaps.test.ts`: overrides and `resetHidden`.
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
- [ ] Each flagged branch of this package has a test for the flag off (legacy) and on.
- [ ] The address round trip holds for all 25 keys and `sort`; reserved parameters are ignored by
      `fromSearchParams` and never emitted by `toSearchParams`.
- [ ] Equal states produce byte-equal addresses.
- [ ] Uzbek numbers use the Russian separators; English uses `en-GB`.
- [ ] Money, date, distance and flow examples of "Behaviour to reproduce" hold in ru, uz and en.
- [ ] A per-user call is never cached: the build output shows only the reference calls as cached.
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

Empty.
