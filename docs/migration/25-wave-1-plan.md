# 25 — Wave 1: the new product on legacy listings

Conventions: [`README.md`](README.md). Strategy and decisions (`DEC-31` … `DEC-49`):
[`24-three-wave-strategy.md`](24-three-wave-strategy.md). Verbatim answers:
[`decisions/2026-11-14-developer-answers.md`](decisions/2026-11-14-developer-answers.md). Work queue and the
specification of every work package: [`wave-1/README.md`](wave-1/README.md). Status: decided by the developer on
2026-11-14; no code written.

**Goal.** A complete new product under the HOMI brand — bot, Mini App, landing, API — that does everything the
legacy product does, function by function. Personal data, radars and the bot are HOMI's own code. Listings, map
points, cards, contacts and photos are read from legacy through a service key until Wave 2.

**Not in this wave.** HOMI's own listing ingestion (Wave 2), SEO pages (Wave 3), the admin panel, any transfer of
legacy users' data, any `DEV` behaviour change.

**Reading order for whoever does the work.** This document once, then the queue, then the specification of the
package you take. The audit documents are opened only at the sections a specification cites.

## 1. What the product must do

The legacy product is the description of the behaviour, not a source of code (DEC-32).

| Surface | Inventory | Where it is described |
| ------- | --------- | --------------------- |
| Mini App screens, sheets, overlays, states | 45 (SCR-001 … SCR-045) | `03` §2, `data/screens.json` |
| Client business rules | 69 (`BR-APP`) | `03` §4 |
| Client defects to fix | 47 (`LB-APP`) | `03` §5, §5b |
| Telegram integration points | 45, of which 39 in use (TMA-001 … TMA-045) | `05` |
| API methods the client uses | 34 (API-001 … API-034) | `08` §2 |
| Bot handlers, buttons, texts | 84, 76, 88 | `04`, `data/bot-handlers.json` |
| Landing items | 39 of the 64 `LND` items; the other 25 are SEO pages (Wave 3) | `03b` |
| Texts | 472 keys per locale in the current legacy tree; the bot catalogue of `04` | `$KVADRO_ROOT/demo/app/src/i18n/locales/` |

The audit describes legacy release `index-plF_TOcT.js`. Two later releases are in the legacy tree and not in the
audit (Q-APP-024); the queue starts by bringing the audit up to a pinned release (section 8).

## 2. Scope and rules

**In.** Every row of section 1 except the SEO pages; the `/api/v1` surface of section 4; the native modules of
section 5; the bot of section 6; the landing of section 7.

**Rules.**

1. **Functional parity** is the acceptance criterion (DEC-46): the same screens, states, texts and scenarios as
   legacy. Small visual differences are accepted. Each work package carries its checklist (section 9).
2. **Defects are fixed, behaviour changes are not made** (DEC-36). An `LB` item that `09` §4.3 lists as a plain fix
   is fixed and tested. An `LB` item that `09` §4.2 turns into a `DEV` row changes what a user sees, so it is written
   and tested behind a typed flag that is **off**, like every other `DEV` item. For the Mini App that is 33 fixes and
   14 flagged items; each specification names its own.
3. **The legacy tree is read-only** and is a reference: no edits, no `npm`, no builds, no dev server there, and no
   copy-paste of its code or CSS into this repository.
4. **Nobody but HOMI's servers calls legacy** (DEC-33). Development, tests, CI and agents work on stubs and recorded
   fixtures. The service key exists only in the server environment files of staging and production.
5. **Brand.** The interface is the legacy one; name, logo, bot name, links and legal texts are HOMI (DEC-40). All of
   them live in one brand layer, never inline. Legacy artwork is not copied; until HOMI's own logo, mascots and
   stickers are supplied (Q-APP-025) the packages ship neutral placeholders.
6. **Texts.** The legacy i18n key names are kept, so a legacy release diff can be applied; values are copied
   verbatim except brand words.
7. **Secrets and personal data** follow 16: nothing in the repository, nothing in logs (SEC-REQ-047).

## 3. Frontend architecture (`frontend/app`)

Before writing any Next.js code, read the guide for the feature in
`frontend/app/node_modules/next/dist/docs/` — the specifications name the files. Next.js 16.4 differs from older
versions (`proxy.ts` replaces `middleware.ts`; `cacheComponents` is on).

### 3.1 Rendering and data flow

- Pages are **Server Components** that fetch through the API with the user's session and render on the server
  (DEC-44). Everything interactive is a Client Component that receives the server-fetched data as `initial` props.
- The first request of a launch has no session: Telegram hands `initData` to the page in the browser only. The page
  therefore renders a shell, the client creates the session (section 3.4), and the router refreshes into
  server-rendered content.
- `cacheComponents: true` is set in `frontend/app/next.config.ts`. Anything that reads cookies is dynamic and sits
  inside a `<Suspense>` boundary; nothing per-user is ever cached. Only reference data (directories, cities) is cached
  on the server, keyed by locale. Read `01-app/02-guides/authentication-with-cache-components.md` and
  `01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md` first.

### 3.2 Routes

Every screen has an address (DEC-44). The locale is the first segment (next-intl). Filters travel as search
parameters, so a feed, its map and its filter sheet share one state and survive a reload.

| Route under `/[locale]` | Screens | Kind |
| ----------------------- | ------- | ---- |
| `/` | feed with its states and pull-to-refresh (SCR-007 … SCR-010) inside the shell (SCR-006) | page |
| `/map` | map, lasso, selection card (SCR-011 … SCR-013) | page |
| `/filters`, `/filters/[kind]`, `/sort`, `/city` | full filters, quick filter, sort, city picker (SCR-014 … SCR-017) | sheet |
| `/listing/[number]` | listing and its states (SCR-018, SCR-019) | page, opened over the feed |
| `/listing/[number]/photos`, `/location`, `/market`, `/actions` | photo viewer, spot map, market sheet, actions and report (SCR-020 … SCR-023) | overlay or sheet |
| `/saved`, `/saved/history` | favourites, history (SCR-024, SCR-025) | page |
| `/radars`, `/radars/new`, `/radars/[id]`, `/radars/[id]/edit`, `/radars/found` | radar tab and empty state, new radar, radar sheet, editor, survey (SCR-026 … SCR-031) | page and sheets |
| `/settings` and `/settings/{theme,graphics,language,currency,quiet-hours,digest,hidden}` | settings and sub-pages (SCR-032 … SCR-039) | page |
| `/welcome/language`, `/welcome/city` | first-launch pickers (SCR-004, SCR-005) | page |
| `/no-access`, `/outside` | no access, outside Telegram (SCR-003, SCR-002) | page |

Not routes: the boot-failure screen (SCR-001, inline boot guard), nudges (SCR-040, SCR-041), toast (SCR-042),
confirms (SCR-043), Telegram system sheets (SCR-044), the crash screen (SCR-045, `error.tsx`).

- **Sheets and overlays** are intercepting routes rendered into a parallel slot, so the screen below stays mounted
  and a direct load of the address still works (`…/03-file-conventions/parallel-routes.md`,
  `…/03-file-conventions/intercepting-routes.md`).
- **Back.** The visible behaviour of legacy is the rule: tabs and the list/map switch have no Back; every sheet,
  overlay and pushed screen has one and closes in the order sheet, overlay, screen (TMA-022). The app keeps its own
  depth counter: a tab or view switch replaces the address and resets it; a layer pushes. Telegram's `BackButton` is
  shown while the counter is above zero and goes back one step. An address of a layer that is loaded directly has
  no history behind it, so Back there goes to the layer's parent address. The `SettingsButton` opens `/settings`
  (TMA-023). The helper that knows each address's parent is defined once (WP-20) and used everywhere.
- **Launch.** The bot opens `/`; `proxy.ts` redirects to the locale. A `start_param` of the form `l_<number>` or a
  `?listing=` query redirects to the listing; `?news=pets` opens the filters on the pets section
  (TMA-010 … TMA-012).

### 3.3 Boot and the Telegram layer

One adapter module owns every call to `window.Telegram.WebApp`; components never touch the SDK.

1. A small inline script in the root layout tests the engine. An engine below the Next.js floor gets the
   «Обновите Telegram» screen in three languages (DEC-44, SCR-001).
2. The SDK is loaded from `https://telegram.org/js/telegram-web-app.js`.
3. The adapter reads `initData` once, removes it from the address before any analytics code runs (TMA-009), applies
   theme, safe areas, fullscreen and vertical-swipe settings (TMA-014 … TMA-021), and starts the session.

The adapter also covers haptics, confirms, links, calls, sharing, write access, location, home screen and
DeviceStorage (TMA-025 … TMA-037), with the version gates of TMA-042. A development-only emulator stands in for
Telegram in a desktop browser; it is never part of a production bundle.

### 3.4 Session

| Step | What happens |
| ---- | ------------ |
| 1 | The client posts `initData` to the app's own route `POST /bff/session` |
| 2 | That route calls `POST /api/v1/auth/telegram`; Laravel verifies the signature with the environment's bot token and the age of `auth_date`, creates or updates the user and issues a token with an expiry |
| 3 | The route sets the cookie `homi_session`: `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`, lifetime of the token. It also returns the token in the body |
| 4 | The client asks `GET /bff/session`. If the cookie came back, the app is in **cookie mode** and forgets the token. If not, it is in **header mode** and keeps the token in memory only |
| 5 | The router refreshes. If the user's locale differs from the address, it replaces the address |

- **Cookie mode** (native clients, most browsers): Server Components fetch with the cookie; mutations are Server
  Actions.
- **Header mode** (browsers that refuse cookies inside Telegram Web's frame): pages render their shell, Client
  Components fetch through `/bff/*` with `Authorization: Bearer`, and mutations pass the token as an argument of the
  same Server Action. Nothing is written to `localStorage` or to the address.
- One screen implementation serves both modes: the client part takes `initial` data when the server had a session
  and fetches for itself when it did not.
- **A later launch.** A valid cookie of the same Telegram user skips steps 1–3. A cookie of another Telegram user
  (a second account on the device) is replaced by a fresh sign-in.
- **Expiry.** A `401` restarts step 1 with the current `initData`. If Telegram's `initData` is itself too old, the
  user sees the "session expired, reopen the app" state — the fix of LB-APP-047.

### 3.5 Data layer

| Piece | Role |
| ----- | ---- |
| `lib/api/server.ts` (server only) | Typed calls to `/api/v1` with the session token from the cookie; maps API errors to typed results |
| `app/bff/[...path]/route.ts` | Pass-through to `/api/v1` for reads that happen in the browser: live count while a filter changes, feed pages, map points, and everything in header mode. Allow-list of paths; the token comes from the cookie or the header |
| `lib/actions/*.ts` | Server Actions for every mutation |
| `lib/data/useResource.ts` | Small client hook: `initial` data, refetch, abort, cache per key. No query library is added |
| `@homi/types` | Types generated from OpenAPI (section 4.6) |
| `@homi/api-client` | The existing envelope client; gains the generated path types |
| `@homi/search` (new workspace package) | The filter model: 25 keys, defaults, transitions, sort availability, summaries, and the mapping to and from search parameters |

### 3.6 Interface

- **Tailwind 4 with tokens** in `@homi/ui`: the legacy palette, radii, spacing and type scale become tokens
  (`03` §3.6); light, dark and Telegram-driven themes switch by attributes on `<html>` as legacy does.
- **shadcn/ui with Radix** supplies dialogs, sheets, switches, tabs and toasts, restyled to the legacy look. Where
  a legacy gesture has no equivalent (sheet drag with velocity, swipe back, collapsing header), it is written on
  top of the primitive, not replaced by different behaviour.
- **Lite graphics mode** (legacy `html.lite`) stays: it turns off blur, shadows and animation by rule, not by
  component.
- **Icons:** `lucide-react`, the set legacy uses.

### 3.7 Localisation

next-intl with the locale in the address: `ru`, `uz`, `en` (DEC-44). Catalogues live in a workspace package
`@homi/i18n` as one file per locale with the legacy key names; `uz` is the address and file name for legacy
`uz_Latn` (CF-006). A missing key renders the key and reports an error instead of throwing (fix of LB-APP-002).
Numbers and dates follow the legacy rules of `03` §3.5, including `ru-RU` number formatting for Uzbek. How next-intl
plugs into `proxy.ts` on Next.js 16 is to be read in its documentation before the package starts (`UNVERIFIED`
here).

### 3.8 Maps

Both engines (DEC-44): MapLibre GL with supercluster and PMTiles as the main engine, Leaflet with markercluster and
protomaps-leaflet as the fallback, chosen by the legacy rule (`03` §1.8). Both are client-only and loaded on demand.
Tiles: the address comes from the reference data; until HOMI hosts its own PMTiles file (KV-INF-021, production
track) the value is `null` and both engines use the raster fallback the legacy client already has. That fallback is
the public OpenStreetMap tile server, which is not meant to carry a product's traffic: hosting the tile file is a
condition of the launch package (WP-70), not an option. The vector path cannot be tested before the file exists.

### 3.9 Analytics and errors

- The action log: `POST /api/v1/events`, with the legacy event names (`03` §3.3).
- PostHog: HOMI's own projects, one per environment (DEC-47); loaded lazily under the legacy rules (not on
  Save-Data or 2g); `initData` and session tokens are scrubbed; replay masks everything by default (SEC-021).
- Screen names sent to PostHog are the legacy names, derived from the route, so one vocabulary serves both products.
- Errors: route-level `error.tsx`, a global handler, and the boot guard, all reporting `app_error`.

### 3.10 Browser floor and security headers

The floor is the Next.js default: Chrome 111, Safari 16.4 (DEC-44). The CSP is nonce-based and set in `proxy.ts`
(SEC-REQ-031); it allows the Telegram SDK host, the API host, the media host, the tile host and the PostHog host.
A nonce needs every document rendered per request, which works against the cached shell of section 3.1; the session
package (WP-21) opens with a one-day spike that settles it — nonce with dynamic rendering, or hashes for the inline
scripts — and records the result in the Mini App ADR.
The vhosts of the app must allow framing by Telegram Web (Q-SEC-012): today the staging vhost sends
`X-Frame-Options: SAMEORIGIN` (`infra/staging/nginx/app.staging.homi.conf`), which the production track changes.

### 3.11 Layout of `frontend/`

```text
frontend/
├── app/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx                 root layout: html, theme attributes, boot script, SDK, providers
│   │   │   ├── (main)/                    shell with tab bar; @sheet and @overlay slots
│   │   │   │   ├── page.tsx               feed
│   │   │   │   ├── map/  saved/  radars/  settings/
│   │   │   │   ├── listing/[number]/
│   │   │   │   └── @sheet/ …              intercepted filters, sort, city, radar sheets
│   │   │   ├── welcome/  no-access/  outside/
│   │   │   └── error.tsx  not-found.tsx
│   │   └── bff/                           session and pass-through route handlers
│   ├── features/                          one folder per feature: screens, client components, hooks
│   ├── lib/                               api, actions, data, telegram, analytics, errors, deeplinks, brand
│   ├── boot/                              inline boot script source
│   ├── dev/                               Telegram emulator (development only)
│   ├── proxy.ts                           locale redirect, CSP nonce, security headers
│   ├── tests/  e2e/
├── landing/                               the landing (section 7)
└── packages/
    ├── ui/        tokens, shadcn components, shared primitives
    ├── i18n/      catalogues and formatting helpers (new)
    ├── search/    filter model (new)
    ├── types/     generated API types
    ├── api-client/ utils/ config/
    └── testing/   fake Telegram, fixtures helpers (new, dev only)
```

## 4. API: `/api/v1`

### 4.1 Conventions

- Envelope, errors and pagination of ADR-0007; bearer tokens of ADR-0003 issued by the sign-in method.
- Listings are addressed by their public **number** (in Wave 1 the legacy listing number). Radars and blocked-author
  entries have HOMI's own identifiers.
- The locale comes from `Accept-Language`, the currency from the user's settings.
- Every answer carries `meta.source` with the driver that produced it: `stub`, `legacy` or `native`.
- Feed-like lists use a cursor (`meta.next_cursor`); `null` ends the list. Favourites and history come back whole
  with `next_cursor: null`, as in legacy: paging them is the deviation DEV-003, whose flag is off (DEC-36).
- When the listing source cannot answer, the method returns `503` with code `source_unavailable`; the client shows
  the legacy "could not load" state.

### 4.2 Methods

| v1 method | Legacy equivalent | Wave 1 driver |
| --------- | ----------------- | ------------- |
| `POST /auth/telegram` | none (legacy authenticates every request) | native |
| `GET /me` | user part of meta (API-001) | native |
| `GET /settings`, `PATCH /settings` | API-024, API-025 | native |
| `GET /reference` | shared part of meta and the bot names (API-001, API-003) | legacy, cached; bot name, support name and limits always from HOMI's configuration |
| `GET /cities` | API-002 | legacy, cached |
| `GET /listings` | feed (API-004) | legacy + overlay |
| `GET /listings/count`, `GET /listings/flow` | API-005, API-006 | legacy |
| `GET /listings/map` | API-007 | legacy + overlay |
| `GET /listings/{number}` | API-008 | legacy + overlay; records the view natively |
| `POST /listings/{number}/contact` | call link (API-009) | legacy (form depends on Q-API-062) |
| `POST /listings/{number}/translation` | API-010 | legacy |
| `POST /listings/{number}/share` | API-017 | native (a prepared message of HOMI's bot) |
| `GET /favorites`, `PUT /favorites/{number}`, `DELETE /favorites/{number}` | API-029, API-011 | native |
| `GET /history`, `DELETE /history` | API-030, API-031 | native |
| `PUT /hidden/listings/{number}`, `DELETE /hidden/listings/{number}` | API-012, API-013 | native |
| `PUT /listings/{number}/blocked-author`, `DELETE /listings/{number}/blocked-author` | API-014, API-015 | native |
| `GET /hidden`, `DELETE /hidden/authors/{id}`, `DELETE /hidden` | API-026 … API-028 | native |
| `POST /listings/{number}/reports` | API-016 | native |
| `POST /surveys/found`, `POST /surveys/found/where` | API-032, API-033 | native |
| `GET /radars`, `POST /radars`, `PUT /radars/{id}`, `PATCH /radars/{id}`, `DELETE /radars/{id}`, `POST /radars/{id}/relax` | API-018 … API-023 | native |
| `POST /events` | API-034 | native |
| `GET /landing/live`, `GET /landing/pins` | public data files and photo snapshots of the legacy landing (RES-010 … RES-013) | legacy, cached; no service key needed |

Notes on the table:

- `POST /auth/telegram`, `GET /reference` and `GET /cities` are public; `GET /reference` also carries the bot and
  support names, which the no-access and outside-Telegram screens need before any session exists. Everything else
  needs the session. A refused user gets `403` with code `access_denied` and a `reason`.
- `GET /radars` can include the preview listings of each radar; `GET /listings/{number}` has a short preview form
  for cards on the map.
- There is no method to withdraw a report: the "undo" of a report belongs to a `DEV` item that is off.
- Legacy toggles a favourite with one `POST`; v1 uses an explicit `PUT` and `DELETE`, so a repeated request cannot
  flip the state back. The exact request and response shapes are fixed by the contract packages of the queue and
exported as OpenAPI.

### 4.3 Source drivers and flags

- One interface per capability (`ReferenceSource`, `ListingSource`, `LandingSource`), each with a `stub`, a `legacy`
  and later a `native` implementation.
- One Pennant feature per method, for example `source.listings.feed`, whose value is the driver name. The default
  per environment is configuration; an override can be set for everyone, for a share of users, or for named users.
- Console commands list and set the drivers. A change is logged with who made it.
- Native-only methods have no flag; they move from stub to real code by deploy and keep `meta.source` honest.

### 4.4 Stubs and the demo marker

Stubs return fixtures written from the examples of 08 and the legacy parity mocks, sanitised (no real phones, names
or addresses). They are deterministic, so tests can rely on them. Because every merge reaches production and access
is open (DEC-43, DEC-45), the client shows a small "demo data" marker on any screen whose answer has
`meta.source = stub` (RK-27).

### 4.5 The legacy driver

- **Access.** `LEGACY_API_URL` and `LEGACY_SERVICE_KEY` in the server environment of staging and production only.
  Locally and in CI the driver runs against recorded fixtures through the HTTP fake. The key's header, routes and
  limits are the operator's specification (Q-API-059, Q-API-060).
- **Translation.** One translator per method turns the legacy answer into a data object and the data object into
  the v1 resource. Legacy errors (`{"detail": …}`) become v1 errors. `uz` becomes `uz_Latn` at this boundary only.
- **Per-user overlay.** Legacy answers for the service key, not for the user. HOMI adds `favorite` and `viewed`,
  removes hidden listings and listings of blocked authors, and applies its own report thresholds. A feed page that
  shrinks below half its size after filtering is topped up from the next legacy page.
- **Locale and currency.** Legacy formats strings on the server per user. How a service-key request selects them is
  open (Q-API-062); the contract keeps raw values next to display strings so HOMI can format where legacy cannot.
- **Caching.** Reference data and cities for ten minutes; a listing card for one minute; nothing for the feed.
- **Limits.** One outbound limiter for all legacy calls, a timeout of 15 s, one retry for reads, a circuit breaker
  that answers `source_unavailable` instead of queueing.
- **Photos.** Legacy photo addresses are signed and need no key (RES-001, RES-002). The API rewrites them to a HOMI
  media address that nginx proxies and caches; the client keeps deriving the small variant. Which host carries that
  location is the production track's choice, given to the API as configuration.
- **What legacy does not give.** Its previews carry neither the source channel and post nor an author key (`08`
  §1.8). Unless the operator adds them (WP-02), HOMI learns both only when a card is opened: the Wave 2 reference is
  empty for listings a user saved without opening, and a blocked author's other listings disappear only once HOMI
  has seen them as cards. Counts and the flow estimate cannot subtract a user's hidden listings.
- **Contract tests.** The golden fixtures of 08 describe what legacy returns. A test per method fails when a
  recorded legacy answer no longer fits the translator, which is how a legacy release shows up (RK-26).

### 4.6 OpenAPI and types

Scramble exports `docs/api/openapi.json` from the routes, form requests and resources (HANDOFF T3); CI fails when
the committed file is stale. `openapi-typescript` generates `@homi/types` from it (HANDOFF T5, DEC-49); CI fails when
the generated file is stale. The stubs come first, so the frontend has types and data before any real code exists.

## 5. Native modules of the backend

Rules come from 07 and the backend tasks of 11 and 11a; those tasks describe the legacy-shaped surface, which is not
built, so only their rules, limits and edge cases are taken.

| Module | Content | Rules from |
| ------ | ------- | ---------- |
| Identity and access | `initData` verifier, users, tokens, the access gate with its modes (mode: open), per-user rate limits | KV-BE-006, KV-BE-009, KV-BE-010, SEC-REQ-001 … SEC-REQ-005 |
| Settings | locale, currency, quiet hours, digest times, theme hints; drives the bot's language | KV-BE-045 |
| Personal lists | favourites, view history, hidden listings, blocked authors, the «Скрытое» list | KV-BE-038 … KV-BE-042 |
| Reports and surveys | votes with weights and thresholds, applied to what HOMI shows (DEC-48); the «Нашли жильё?» survey | KV-BE-043, KV-BE-044 |
| Radars | create or reactivate, limit, replace, pause, mode, relax, hide rules, previews | KV-BE-100 … KV-BE-106 |
| Matching and delivery planning | in Wave 1 the matcher polls the listing source per distinct filter set and compares with the delivered set; quiet hours, digest slots, the planner | KV-BE-108 … KV-BE-111 |
| Share | prepared inline messages of HOMI's bot | KV-BE-046 |
| Action log and analytics | partitioned action log, server-side PostHog, person deletion | KV-BE-150 … KV-BE-152 |
| Erasure | one deletion procedure used by the bot's «Удалить мои данные» | KV-BE-050 |

Every table that points at a listing stores the listing number **and** the source channel and post when the listing
source provides them, so the reference can be re-pointed in Wave 2 (Q-API-063).

## 6. The bot

Full parity with 04 (DEC-43), under HOMI's bot and brand. The KV-TG task files stay the behaviour reference; the
queue groups them into nine packages. Not built: the reset of legacy per-chat menus, the decoder of legacy
`callback_data` and the cut-over switches (KV-TG-057, KV-TG-058, KV-TG-060) — there are no old messages of this bot.

Listing cards in chat, the wizard's flow estimate, starter lists and radar pushes read the same listing source as
the API. The bot's texts are the catalogue of 04 with the brand words replaced.

## 7. The landing (`frontend/landing`)

The full legacy landing on `homi.uz` in three languages: frame, hero with the phone demo, the live map in the phone,
live pushes, the owner and agent switch, the savings block, the FAQ and the privacy pages (KV-FE-100,
KV-FE-102 … KV-FE-113). Its live data comes from `GET /landing/*`; the legacy driver reads the public data files of
the legacy landing (RES-010 … RES-013), which need no key. SEO pages, sitemap entries for them and interlinking are
Wave 3. The privacy page is where the answer to Q-SEC-021 lands.

## 8. Legacy baseline and release intake

1. **Pin.** The first stage of the queue names the legacy release the work describes and brings 03, 08, 04 and the
   registers up to it. Already missing: the report-detail step with the `detail` field, the `price_kind: business`
   label, the badge order and the no-access text (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-24`).
2. **Intake.** Each later legacy release is read from its sync report (`$KVADRO_ROOT/demo/app/docs/releases/`) and
   becomes one queue item: update the audit, the affected specification, the stub fixtures, the legacy translator.
3. **End.** Intake stops for a surface when HOMI no longer reads it from legacy.

## 9. Acceptance and tests

**Functional checklist.** Every work package that builds user-visible behaviour ends with a checklist taken from the
audit: each screen state, each text, each action and its result, each error path, in three locales and two themes.
The developer ticks it in the PR with screenshots from staging; the reviewer signs it. A difference is accepted only
if it is an `LB` fix or a visual detail.

| Layer | Tool | Covers |
| ----- | ---- | ------ |
| Static | lint, typecheck, build; Pint, PHPStan | every PR |
| Unit and component | Vitest and Testing Library; Pest | filter model, formatters, translators, services, rules |
| API feature tests | Pest, on SQLite and PostgreSQL where SQL differs | every v1 method, including authorisation of every per-user resource |
| Contract | Pest: stub, legacy and native drivers return the same schema; OpenAPI and generated types are current | every method with more than one driver |
| End to end | Playwright with a fake Telegram, on stubs | every checklist scenario of the Mini App, in cookie mode and header mode |
| Bot | conversation tests: fake updates in, expected Bot API calls out (KV-QA-009) | every handler |
| In Telegram | by hand on staging, then production, after each deploy (DEC-45) | iOS, Android, Desktop, Web |

**Stub scenarios.** Deterministic stubs cannot show an error state by themselves. A stub method therefore accepts a
named scenario (empty list, source unavailable, refused access, radar limit and so on) through a request header that
is honoured only by the `stub` driver; outside production the Mini App forwards a cookie as that header, which is how
the end-to-end suite reaches every state in both session modes. Native methods lose their stub when their real code
is merged; a switch that is refused outside local and test environments keeps a stub answer for them, so the suite
of stage B keeps running. States that open access and stub answers cannot
produce inside Telegram (no access, the "no chat" prompt, the radar limit, real share and call pages) are proven by
the end-to-end suite in stage B and seen in Telegram in stage C, when the real code answers.

**Known gaps against legacy, accepted for Wave 1.** They are listed here so that nobody reports them as defects:

- The «Подробнее» link of the market sheet is hidden, because the methodology page it opens is one of the SEO pages
  of Wave 3.
- A report does not change what users of the old bot see, and reports made there do not reach HOMI (DEC-48).
- A user who never opened the old bot has no history there to bring; nothing is imported (DEC-40).
- The map uses the raster fallback until HOMI hosts its own tile file (section 3.8).
- Contact shows what the operator's service key allows: a number, or a link that leaves HOMI (Q-API-062).
- Blocking an author and the Wave 2 reference of a saved listing are partial until the operator adds the source and
  author fields (section 4.5).
- Between the radar package and the bot's sending package a radar can be created but nothing is delivered (RK-32).

**Definition of done of a work package.** Specification steps complete; tests of the package green in CI; checklist
ticked and signed; OpenAPI, generated types, the package registry and the audit rows current; the queue and the
session handoff updated; the PR reviewed and merged; staging and production deployed and checked.

## 10. Dependencies

Approved as one batch by DEC-49; the first developer confirms in the install PR.

- **Runtime:** `next-intl`; the Radix primitives and helper packages that shadcn/ui components need;
  `lucide-react`; `maplibre-gl`, `pmtiles`, `supercluster`, `leaflet`, `leaflet.markercluster`, `protomaps-leaflet`
  at the legacy versions (`$KVADRO_ROOT/demo/app/package.json:22-33`); `posthog-js`.
- **Development:** Vitest, Testing Library, jsdom, Playwright, `openapi-typescript`; and what these need to run in
  this workspace — the React plugin and the path-alias plugin for Vitest, and the type packages of the map
  libraries. The exact list is in the dependency package (WP-03) for the first developer to confirm.
- **Backend:** nothing new is known to be needed; Pennant, Sanctum, Horizon and Scramble are installed.

## 11. Environments and deployment

| Environment | Bot | Mini App | Listing source |
| ----------- | --- | -------- | -------------- |
| Local | emulator; the developer's own dev bot only for bot work | `https://app.homi.loc` | stubs and recorded fixtures |
| CI | fake Telegram | built and tested | stubs and recorded fixtures |
| Staging | staging bot | `https://app.staging.homi.uz` | flags; legacy once the key is installed |
| Production | production bot | `https://app.homi.uz` | flags; legacy once the key is installed |

Every merge is deployed to staging and to production (DEC-45). Deploys, server environment files, bot tokens,
webhooks and nginx belong to the production track (`docs/handoff/parallel-work.md` §1): each package names what it
needs from that track, and a migration reaches production only with that track's approval (§3 there).

## 12. The queue in outline

Forty-four work packages in six stages, worked strictly in order by whoever holds the relay (DEC-45). The table of
record with statuses is `wave-1/README.md`.

| Stage | Packages | Content |
| ----- | -------- | ------- |
| 0 Start | WP-00 … WP-03 | Media ownership fix; ADRs and shared files; operator request and baseline pin; dependencies and test tooling |
| A Contract | WP-10 … WP-13 | Source drivers, flags, stubs, OpenAPI, generated types; the stub contract of every method |
| B Mini App on stubs | WP-20 … WP-33 | Foundation, Telegram layer and session, data layer, gates and shell, feed, filters, listing, both map engines, saved, radars, settings, analytics, acceptance on stubs |
| C API | WP-40 … WP-48 | Sign-in and users, legacy driver, listings, contact and share, personal lists, radars, matching, action log, stubs off |
| D Bot | WP-50 … WP-58 | Webhook and client, router and texts, commands, cards, wizard, radar screens, settings and privacy, sending, profile and tests |
| E Landing | WP-60, WP-61 | Landing data, landing pages |
| F Launch | WP-70, WP-71 | Hardening, launch and watch |

Three places where a package needs something a later package builds are bridged inside the specifications by a
contract with an empty implementation: the per-user overlay of the listing package (tables come with the personal
lists), the starter list of the radar package (the delivered set comes with matching), and the share method (the
Bot API client comes with the bot). The two landing methods keep no driver between the stubs-off package and the
landing data package; nothing calls them in between.

## 13. Risks of this wave

RK-24 … RK-32 in 24 §8.3. The three that decide the order of work: the service key may be late (RK-28), so nothing
before stage C depends on it; stub data is visible in production (RK-27), so the marker is part of the first frontend
package; and the size of the wave (RK-29), which is why the queue is strict and every package ends in a deployable
state.

## 14. Definition of done for Wave 1

1. Every work package is done by its definition (section 9).
2. No method answers from a stub on production; `meta.source` is `legacy` or `native` everywhere.
3. All 45 screens and all bot scenarios have a signed checklist.
4. The Mini App works in iOS, Android, Desktop and Web clients of Telegram, in cookie mode and header mode.
5. Radars deliver: an instant card, a digest and a quiet-hours release were each observed on production.
6. The landing is live on `homi.uz` with the privacy page that answers Q-SEC-021.
7. The security checks of the hardening package pass; no `initData`, token or phone appears in logs or analytics.
8. `make ci-backend` and `make ci-frontend` are green on `main`; the audit describes the pinned legacy release.
