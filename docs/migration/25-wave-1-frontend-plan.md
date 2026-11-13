# 25 — Wave 1: the Mini App on Next.js against the legacy API

Conventions: [`README.md`](README.md). Strategy and the decisions named here (`DEC-31` … `DEC-39`):
[`24-three-wave-strategy.md`](24-three-wave-strategy.md). Status: **`PROPOSED`** plan, 2026-11-14; no code written.

**Goal.** A copy of today's Mini App, built in `frontend/app` on Next.js 16.4, 1:1 in interface and behaviour, with
every request served by the legacy production backend through the gateway. Developed and tested on HOMI hosts, apart
from the running product, then switched in with a tested way back.

**Not in this wave.** Backend, bot, data migration, landing and SEO pages (DEC-38), ARM, the `/api/v1` contract, any
redesign, any behaviour change (`DEV` items stay off).

**Size.** 87 existing frontend tasks (33 S, 51 M, 3 L; weight 147 in S-units, from `data/tasks.csv`) plus the new
items of section 11. No backend work: the gate is `make ci-frontend`.

## 1. What is being ported

Facts read from the legacy tree on 2026-11-14 (read-only; counts by `find` and `wc`).

| Aspect | Legacy Mini App | Evidence |
| ------ | --------------- | -------- |
| Stack | React 19.3.0, Vite 8, plain JavaScript and JSX; the original TypeScript types are lost | `$KVADRO_ROOT/demo/app/package.json:22-44`, `$KVADRO_ROOT/demo/app/docs/RECOVERY.md:22-24` |
| Size | 177 modules, 18 330 lines; 27 CSS files, 4 005 lines; 3 locale files with 472 keys each | `$KVADRO_ROOT/demo/app/src/` |
| Readability | Recovered from the production bundle with meaningful names and JSDoc; logic, texts, CSS classes, API paths, storage keys and analytics events are exact, file and symbol names are inferred | `$KVADRO_ROOT/demo/app/docs/RECOVERY.md:78-95` |
| Routing | None. No router library, no `history` use; screens are React state in one root component | `$KVADRO_ROOT/demo/app/src/app/App.jsx:48-106`; `03` §1.1–1.2 |
| State | `useState` in the root (33 calls) and module-level singletons; no store library | `03` §1.1, §1.11 |
| Data | One `fetch` wrapper; relative `/api/*`; `Authorization: tma <initData>`; 15 s timeout; no query library | `$KVADRO_ROOT/demo/app/src/lib/api/client.js:74-86` |
| Styling | Global CSS; 24 `@import`s whose order is the cascade; themes through custom properties; no Tailwind, no CSS modules | `$KVADRO_ROOT/demo/app/src/styles/index.css:1-25` |
| Maps | MapLibre GL 6.11.2 loaded as vendored ESM at run time, Leaflet 1.9.4 as fallback, PMTiles, supercluster | `$KVADRO_ROOT/demo/app/vite.config.js:18-40`; `03` §1.8 |
| Analytics | Own journal `POST /api/events`; posthog-js 1.434.15 loaded lazily with a key that arrives in `/api/meta` | `03` §3.3 |
| Boot | Two inline ES5 scripts allowed by a CSP hash, the Telegram SDK tag, prefetch of meta and the first feed page before React mounts | TMA-001 … TMA-005; `$KVADRO_ROOT/demo/app/index.html` |
| Dev proxy | `/api`, `/media`, `/tiles` → `VITE_API_PROXY` or the production host, `changeOrigin` only | `$KVADRO_ROOT/demo/app/vite.config.js:51-64` |
| Tests | No unit tests. A differential run compares the production build with a rebuild in headless Chrome on a fake Telegram and a mocked API | `$KVADRO_ROOT/demo/app/tools/parity/` |
| Releases | Production ships often: five synced releases between 2026-11-06 and 2026-11-12 | `$KVADRO_ROOT/demo/app/docs/releases/` |

Two consequences shape the plan. The code is clean enough to port file by file (section 8). And the audit of
2026-11-09 already trails production by two releases (Q-APP-024), so the port needs a pinned baseline and an intake
rule (section 8.4).

## 2. Scope

**In.** Everything the Mini App does today:

- 45 screens, sheets, overlays and states (SCR-001 … SCR-045);
- the 34 API methods and the resources it consumes (section 5.3);
- the 39 Telegram integration points in use (section 5.4);
- 3 locales, the 10 `kv-*` storage keys, the journal events and the `$pageview` names (section 5.5);
- both map engines, unless FD-3 drops one.

**Rules.**

1. 1:1 in interface and behaviour. A visible difference is a regression unless it is on the agreed defect list
   (DEC-36).
2. The legacy tree is read-only: no edits, no `npm`, no builds, no dev server there (README).
3. No production write outside an owner-approved test account, and no production call at all from tests, CI or
   agents (DEC-33, section 6.3).
4. No new dependency without approval (section 12).
5. Storage keys, i18n keys, analytics names and API paths keep their legacy names (12 §1 rule 10).

## 3. Architecture in Next.js

### 3.1 Rendering: a client application inside the App Router

The Mini App is rendered in the browser only.

- **Why.** The user's identity is `initData`. It reaches the page in the URL fragment or through the SDK and never
  reaches the server with the first request (`08-api-inventory.md:1327-1328`). The server has nothing to render for a
  user, and the data requests need the client anyway.
- **How.** The page of the route group is a Server Component that renders a static shell. A Client Component loads
  the application with `next/dynamic` and `ssr: false`. This is the path the Next.js guide gives for moving a Vite
  application: "keep it as a purely client-side application (SPA) without migrating your existing router"
  (`frontend/app/node_modules/next/dist/docs/01-app/02-guides/migrating/from-vite.md:48-52`, `:357-465`;
  `…/01-app/02-guides/single-page-applications.md:205-215`).
- **Effect on the port.** The recovered modules read `window`, `location`, `localStorage` and `performance` at module
  load in eight places (list in section 3.9). With `ssr: false` they are never evaluated on the server, so they can
  stay as they are.
- **ADR.** ADR-0013 expects server-rendered pages in `frontend/app`. The Mini App group is the exception that CF-011
  option A already describes; KV-FE-003 records it. `output: 'export'` is still not used.

### 3.2 Route group and layouts

`frontend/app/app/(miniapp)/` with its **own root layout** (12 §1 rule 2). The top-level `app/layout.tsx` and
`app/page.tsx` of the starter are removed, and `/` is the page of the group, as the route-group rules require
(`…/01-app/03-api-reference/03-file-conventions/route-groups.md:25-32`). A `(web)` group stays reserved for
server-rendered pages later; moving between groups is a full page load, which is acceptable.

The root layout owns exactly what the legacy `index.html` owns: `<html lang>`, the viewport meta
(`viewport-fit=cover`), the title, the favicon, the stubs and the boot guard as inline scripts, the Telegram SDK tag
and the global CSS. The Tailwind entry of the starter (`app/globals.css`) is **not** loaded in this group: its reset
would change the legacy base styles.

### 3.3 Boot sequence

Kept in the legacy order (TMA-001 … TMA-005, `03` §1.3–1.5):

1. Inline stubs and the ES5 boot guard run first. The guard shows the trilingual «Обновите Telegram» screen if the
   bundle fails and reports `app_error` of kind `boot`.
2. The SDK script loads (`https://telegram.org/js/telegram-web-app.js`).
3. The client entry installs the error handlers, applies the graphics mode, prefetches `/api/meta`, the first feed
   page and a deep-linked listing, waits up to 3 s for the SDK and mounts React.

Changes that Next.js forces — each is a seam, not a behaviour change:

| Legacy | In `frontend/app` |
| ------ | ----------------- |
| The guard recognises "our bundle failed" by `/(assets\|src)/` in a script URL (`$KVADRO_ROOT/demo/app/index.html:132`) | `/_next/` |
| Build version read from the entry script name and from `import.meta.url` (`index.html:82`, `src/lib/buildVersion.js:8-14`) | A build id constant set at build time |
| Inline scripts allowed by a static CSP hash | Nonce from `proxy.ts`, or hashes if the spike shows the group can stay static (KV-FE-033, SEC-REQ-031) |
| `__MAPLIBRE_URL__` define and a Vite plugin that serves the three MapLibre files under `/assets/maplibre-gl-6.11.2/` | The same three files copied to `public/` at install or build time, the URL as a constant, the import kept out of the bundler |
| `main.jsx` side effects before `createRoot` | The same calls at the top of the client entry that `next/dynamic` loads |

### 3.4 Navigation

No URL routing in Wave 1. The port keeps the legacy model: four tabs, the list/map view, the saved sub-tab, and
overlays driven by state, with a LIFO stack of back handlers on Telegram's `BackButton` (TMA-022,
`$KVADRO_ROOT/demo/app/src/lib/telegram/buttons.js:5-35`). The only URL inputs stay `start_param`, `?listing=`,
`?news=`, `?map=` and `?mapdebug` (TMA-010 … TMA-012). App Router file routes per screen would add URLs and history
entries the legacy client does not have; they are a candidate for after the wave, not part of it.

### 3.5 State and data

- State stays where it is: root state and module singletons. No store or query library is introduced.
- One typed port for the API: a function per method of 08, on top of the ported `apiFetch`. The client calls
  relative paths on its own origin; which backend answers is the gateway's business (24 §3). This is FD-2 option A.
- `@homi/api-client` is **not** used in Wave 1: it speaks the `/api/v1` envelope and bearer tokens
  (`frontend/packages/api-client/src/index.ts`), not the legacy contract. Moving to it is a later step behind the
  same typed port.
- Types for the legacy shapes go to `@homi/types` (subpath `legacy`), written from 08.

### 3.6 Styling

The 27 CSS files are copied unchanged and imported in the legacy order. No rewrite to Tailwind and no CSS modules in
this wave: the cascade order is part of the behaviour (`$KVADRO_ROOT/demo/app/src/styles/index.css:1`). One check is
owed before relying on this: `frontend/app/next.config.ts` sends every `*.css` through the Tailwind loader, and
whether that leaves plain CSS unchanged in effect at the chosen browser floor is `UNVERIFIED` (Q-APP-023; part of the
spike).

### 3.7 i18n, storage, analytics, errors

Ported as they are: the own `t()` and `plural()` with the three catalogues; `kv-*` keys in `localStorage` with the
DeviceStorage mirror (TMA-037); the journal and the lazy PostHog loader with its `initData` scrubbing (TMA-009); the
global error handlers and the error boundary. Two additions that do not change production behaviour:

- a build-time switch that turns the journal and PostHog off outside production (section 6.3);
- the catalogue key stays `uz_Latn` in Wave 1; the rename to `uz` (CF-006) belongs to the refactor after the wave.

### 3.8 Maps

Both engines are ported with the exact legacy versions. MapLibre keeps loading at run time from the same origin;
PMTiles, supercluster, Leaflet and its cluster plugin are ordinary dependencies. All six packages need approval
(section 12); until then the map stage (W1-5) is blocked and the other stages are not.

### 3.9 TypeScript, lint and the known seams

Every ported file becomes TypeScript and must pass `pnpm -r lint` and `pnpm -r typecheck`. Types are added; logic and
order of statements are not changed. The hook order in the root component is kept on purpose
(`$KVADRO_ROOT/demo/app/src/app/App.jsx:49`).

Places that touch the browser at module load, which is why the application is never evaluated on the server:

| Legacy module | What it does at load |
| ------------- | -------------------- |
| `src/lib/telegram/webApp.js:9`, `:43`, `:119` | reads `window.Telegram`, `performance.now()`, `location.hash` |
| `src/lib/telegram/theme.js:20` | reads `localStorage` |
| `src/i18n/index.js:57` | detects the locale and writes `document.documentElement.lang` |
| `src/lib/buildVersion.js:8-14` | reads `import.meta.url` |
| `src/features/map/engine.js:5` | uses the `__MAPLIBRE_URL__` define |
| `src/main.jsx:20-39` | installs handlers, applies the graphics mode, prefetches |

### 3.10 Browser floor and CSP — the gate of the wave

Next.js 16.4 supports Chrome 111+ and Safari 16.4+ by default
(`frontend/app/node_modules/next/dist/docs/03-architecture/supported-browsers.md:6-21`). The legacy build targets
Chrome 80 and Safari 13.1 (`$KVADRO_ROOT/demo/app/vite.config.js:66-69`, marked inferred). Whether the Next and React
client runtime runs on the old engines with a lowered `browserslist` is `UNVERIFIED` (CF-011, RK-07).

The rule of 10 §3.11 stays: measure the audience (KV-FE-001), run the spike (KV-FE-002), then decide. What the
direction of 2026-11-14 changes is the timing — this is now the first gate of the first wave — and the fallback:
a Vite SPA (CF-011 option B) would contradict the direction, so a failed gate goes back to the developer as a
decision, not to option B by default. The architecture limits the cost of either outcome: everything Next-specific
lives in the thin shell of section 4; the ported application does not import from `next`.

### 3.11 What Next.js is deliberately not used for in this wave

Server rendering of user data, Server Actions, file routes per screen, `next/image` for listing photos (the client
builds its own `srcset` from signed `/media` URLs, `$KVADRO_ROOT/demo/app/src/lib/images.js:9-13`), `next/font` (the
UI uses the system font stack), and the API gateway (24 §3). Each can be adopted later, one at a time, under the
parity run.

## 4. Project structure

Under porting mode A (DEC-32) the ported code mirrors the legacy `src/` tree, so that every legacy file has one
obvious twin and a legacy release diff can be applied to it.

```text
frontend/app/
├── app/
│   └── (miniapp)/
│       ├── layout.tsx            root layout = legacy index.html (meta, boot guard, SDK tag, CSS)
│       ├── page.tsx              Server Component: static shell
│       └── BootRoot.tsx          'use client' — next/dynamic(() => import('@/miniapp/main'), { ssr: false })
├── miniapp/                      the ported application, one to one with $KVADRO_ROOT/demo/app/src/
│   ├── main.tsx                  ← src/main.jsx
│   ├── app/                      ← src/app/         root component, top bar, tab bar, app hooks
│   ├── components/               ← src/components/
│   ├── features/                 ← src/features/    city, feed, filters, listing, map, onboarding, radar, settings, sort
│   ├── hooks/                    ← src/hooks/
│   ├── i18n/                     ← src/i18n/
│   ├── lib/                      ← src/lib/         api, telegram, geo, money, storage, analytics, errors, …
│   └── styles/                   ← src/styles/      copied unchanged
├── boot/boot.es5.js              the inline boot guard, kept as ES5 source
├── dev/telegram-emulator.ts      ← tools/dev/telegram-client.js (development only; never in a production bundle)
├── public/assets/maplibre-gl-6.11.2/   vendored MapLibre ESM (copied, not committed by hand)
├── proxy.ts                      CSP nonce and security headers only
├── instrumentation-client.ts     polyfills, if the browser-floor decision needs them
├── tests/                        unit and component tests
└── e2e/                          fake-Telegram runs, parity run, visual set
```

Differences from the structure sketched in 12 §1 rule 3: the split into `@homi/ui`, `@homi/i18n` and `@homi/search`
is **postponed** until after the wave exit, when the parity run can protect it. In Wave 1 only two packages change:
`@homi/types` (legacy shapes) and the dev-only `@homi/testing` (fake Telegram, mock helpers, KV-FE-010). Under
porting mode B the structure of 12 applies as written.

## 5. Inventory

The full inventories are the audit documents and `data/`. This section groups them by the stage that ports them.

### 5.1 Screens

| Stage | Screens (`data/screens.json`) | Legacy source | Tasks |
| ----- | ----------------------------- | ------------- | ----- |
| W1-2 Access and shell | boot failure SCR-001, outside Telegram SCR-002, no access SCR-003, language picker SCR-004, first-launch city SCR-005, shell SCR-006, pull-to-refresh SCR-010, city picker SCR-017, toast SCR-042, confirms SCR-043, crash screen SCR-045 | `src/app/`, `src/features/onboarding/`, `src/features/city/`, `src/components/` | KV-FE-040 … KV-FE-046, with KV-FE-014, KV-FE-032 and KV-FE-036 from W1-1 |
| W1-3 Feed, filters, sort | feed SCR-007, its loading and empty states SCR-008 and SCR-009, filters SCR-014, quick filter SCR-015, sort SCR-016 | `src/features/feed/`, `src/features/filters/`, `src/features/sort/` | KV-FE-047 … KV-FE-056 |
| W1-4 Listing | listing SCR-018, its states SCR-019, photo viewer SCR-020, spot map SCR-021, market sheet SCR-022, actions sheet SCR-023, system sheets SCR-044 | `src/features/listing/` | KV-FE-063 … KV-FE-071 |
| W1-5 Map | map SCR-011, lasso SCR-012, selection card SCR-013 | `src/features/map/` | KV-FE-057 … KV-FE-062 |
| W1-6 Saved and radar | favourites SCR-024, history SCR-025, radar tab SCR-026, empty state SCR-027, radar sheet SCR-028, editor SCR-029, new radar SCR-030, survey SCR-031, follow nudge SCR-040 | `src/features/radar/`, `src/features/feed/`, `src/features/filters/` | KV-FE-072 … KV-FE-080 |
| W1-7 Settings and nudges | settings SCR-032, its seven sub-pages SCR-033 … SCR-039, home-screen nudge SCR-041 | `src/features/settings/`, `src/features/feed/Nudges.jsx` | KV-FE-081 … KV-FE-086 |

All 45 items are `CONFIRMED` in 03. None has a URL; two can be opened by a link (the listing by `start_param` or
`?listing=`, the filters by `?news=pets`).

### 5.2 Modules

| Legacy folder | Files | Lines | Content | Stage |
| ------------- | ----: | ----: | ------- | ----- |
| `src/lib/` | 33 | 2 580 | API client and 8 endpoint modules, 9 Telegram modules, geo, money, storage, analytics, errors, images | W1-1 |
| `src/i18n/` | 4 | 1 764 | `t()`, `plural()`, three catalogues | W1-1 |
| `src/hooks/` | 4 | 481 | sheet drag, swipe back, collapsing chrome, scroll | W1-1 |
| `src/components/` | 14 | 661 | listing card, photo strip, chips, switch, toast, inputs, error state | W1-1 and W1-3 |
| `src/styles/` | 25 | 3 914 | global CSS in cascade order | W1-1, complete from the start |
| `src/app/` | 15 | 1 766 | root component (673 lines), top bar, tab bar, bootstrap and tracking hooks | W1-2 |
| `src/features/onboarding`, `city`, `sort` | 4 | 393 | language picker, no-access screen, city picker, sort sheet | W1-2, W1-3 |
| `src/features/feed/` | 5 | 453 | feed, header, nudges | W1-3 |
| `src/features/filters/` | 14 | 1 543 | filters sheet in three modes, quick filter | W1-3 |
| `src/features/listing/` | 29 | 3 057 | listing screen, sections, photo viewer, market sheet, spot map, actions | W1-4 |
| `src/features/map/` | 38 | 4 125 | engine choice, GL view, Leaflet view, clusters, lasso, tile prefetch | W1-5 |
| `src/features/radar/` | 8 | 846 | radar tab, sheet, survey, previews | W1-6 |
| `src/features/settings/` | 10 | 699 | settings and sub-pages, hidden list | W1-7 |

Counts include the CSS files that live next to components. The whole stylesheet is copied in W1-1, because a screen
ported later must find its styles already in cascade position.

### 5.3 API methods and resources, as the gateway sees them

Contract rows: 08. The column "Live mode" is the rule for development traffic against production (section 6.3).

| Group | Items | Kind | Live mode |
| ----- | ----- | ---- | --------- |
| Bootstrap | meta, cities, bot (API-001 … API-003) | read; `/api/bot` is public and sent without the header | allowed |
| Search | feed, count, flow, map (API-004 … API-007) | read of shared data with per-user flags | allowed |
| Listing | card, call link, translate, share (API-008 … API-010, API-017) | read; translate costs an LLM call; share calls the Bot API | allowed, translate and share sparingly |
| Personal lists | favourite, hide, block author, hidden, favourites, history (API-011 … API-015, API-026 … API-031) | writes to the user's own state | test account only |
| Radars | list, create, replace, patch, delete, relax (API-018 … API-023) | writes; create and relax make the bot post into the user's chat | test account only |
| Settings | read, update (API-024, API-025) | write; also changes the bot's menu language | test account only |
| Effects on other users | report and votes (API-016), survey (API-032, API-033) | write with global effect or into product statistics | **blocked** by the local and staging gateway |
| Telemetry | event journal (API-034) | write; feeds server-side analytics | **suppressed** outside production |
| Photos | `/media/<id>/<n>.jpg` and `.s.jpg` with `e` and `s` (RES-001, RES-002) | signed, cacheable for a day | allowed |
| Tiles | the URL in `meta.tiles` (RES-003); OSM raster as fallback (RES-004) | `Range` requests; may be on another origin | allowed |
| Call page | `/call/<token>` (RES-005), opened in the external browser against the client's own origin | HTML from the backend | allowed |
| External, not proxied | Telegram SDK (RES-007), PostHog (RES-006) | called by the browser directly | PostHog off outside production |

### 5.4 Telegram integration

45 points in 05; 39 in use. Ported in W1-1 with the nine modules of `src/lib/telegram/`: SDK loading and boot
(TMA-001 … TMA-005), identity and the `tma` header (TMA-006 … TMA-009), launch parameters and deep links
(TMA-010 … TMA-013), window, safe areas and theme (TMA-014 … TMA-021), back and settings buttons (TMA-022, TMA-023),
haptics and confirms (TMA-025, TMA-026), links, calls and sharing (TMA-028 … TMA-031), permissions, location, home
screen and DeviceStorage (TMA-033, TMA-035 … TMA-037), platform and version gates (TMA-041 … TMA-044), and the
development emulator (TMA-045). The six recorded absences stay absent.

### 5.5 Names that are contracts

- Storage: `kv-locale`, `kv-theme`, `kv-city`, `kv-nudge`, `kv-home`, `kv-new-<feature>`, `kv-graphics`,
  `kv-graphics-measured`, `kv-map-v2`, `kv-map-fit:<centre>` (`03` §3.2).
- Analytics: the journal events and the `$pageview` screen names (`03` §3.3). PostHog also records
  `$current_url` as `<origin>/<screen>`, so the origin shows in the product's dashboards.
- i18n: 472 keys per locale in the current legacy tree; 03 counted 461 at the audit release (Q-APP-024).

`localStorage` belongs to an origin. If the new client is served under another host name than `app.kvadro.app`,
only the keys restored from DeviceStorage follow the user; theme, graphics and map choices do not. This weighs on
DEC-35 (section 10, stage W1-9).

## 6. API proxy

### 6.1 Shape

The gateway of 24 §3, option H, with the legacy upstream as the only entry in Wave 1.

- **Prefixes:** `/api/`, `/media/`, `/tiles/`, `/call/` on the Mini App origin. Everything else goes to the Next.js
  process as today (`infra/local/nginx/app.homi.conf`, `infra/staging/nginx/app.staging.homi.conf`).
- **Upstream:** the legacy production origin over TLS with its own host name in `Host` and in SNI.
- **Passed through unchanged:** method, path, query, body, `Authorization`, `Range`, `Accept-Language`, caching
  headers of the answer.
- **Not passed:** cookies in either direction — the legacy contract has none (`08` §1), and edge cookies of the
  legacy host must not be set on a HOMI origin.
- **Logging:** no `Authorization`, no query string on `/media`, no token segment on `/call` (SEC-REQ-047). The
  access log records which upstream answered.
- **Limits:** a request body cap in line with the legacy JSON bodies; timeouts above the client's 15 s.

Sketch of the intended nginx form. It is an illustration: the tested configuration is the deliverable of item N1.

```nginx
# http context: which upstream serves a route. Wave 1 has only the default.
map "$request_method $uri" $kv_upstream {
    default                     kv_legacy;
    # "~^GET /api/bot$"         kv_homi;      # Wave 2: one line per moved route
}

# server context of the Mini App origin
location ~ ^/(api|media|tiles|call)/ {
    proxy_pass            https://$kv_upstream;
    proxy_ssl_server_name on;
    proxy_set_header      Host   <legacy host>;
    proxy_set_header      Cookie "";
    proxy_hide_header     Set-Cookie;
    add_header            X-Kv-Upstream $kv_upstream always;
}
```

The table is one generated include, the same on every environment, kept in the repository so that a switch is a
reviewed one-line change. `infra/local/**` belongs to the development track; the staging and production vhosts
belong to the production track (`docs/handoff/parallel-work.md` §1), so their part is a request to the first
developer with the tested local configuration attached.

### 6.2 Three modes of the client's backend

| Mode | Backend | Used by | Network |
| ---- | ------- | ------- | ------- |
| `mock` | Contract mocks from the golden fixtures and the legacy parity mocks (KV-FE-022, KV-QA-002) | unit tests, the parity run, CI, **every agent session** | none |
| `live` | The gateway to legacy production | a developer, by hand, with a test account | production |
| `homi` (Wave 2) | The gateway with routes moved to the local or staging HOMI backend | route-by-route checks | local or staging |

`mock` is the default of the repository. `live` is a deliberate act of a person.

### 6.3 Rules of the `live` mode (DEC-33)

1. Only accounts the product owner approved for testing (`04-telegram-bot-audit.md:1337-1339`).
2. The test account's `initData` is held by the developer. It is pasted into the emulator for a session, kept in
   `sessionStorage` only, never committed, logged, put into an environment file or shown to an agent (KV-FE-038).
3. Reads are free within human use. No load tests, no crawlers, no scripted loops.
4. Writes change only the test account's own state. The routes with effects on other users or on product statistics
   are refused by the local and staging gateway (section 5.3).
5. The journal and PostHog are off in every build that is not production, so development never lands in the
   product's analytics; the gateway also answers the journal route itself outside production.
6. What a test account created is removed after the session (radars, favourites, hidden entries).
7. Tests, CI and agents never use this mode.

These rules replace, for this mode only, the sentence "Never call the production API" of 22 §4 and the limits of
15 §1.6. They take effect when DEC-33 is answered.

### 6.4 Environments

| Environment | Client | Gateway | Opens how |
| ----------- | ------ | ------- | --------- |
| Local | `https://app.homi.loc` → `next dev` on 3001 | local nginx, same vhost | desktop browser with the emulator |
| Staging preview | `https://app.staging.homi.uz` → `next start` on 3201 | staging nginx [PT] | emulator; real Telegram clients once DEC-34 gives a launch path |
| Production | decided at W1-9 (DEC-35): `app.kvadro.app` through the edge or DNS, or a HOMI host | edge or HOMI nginx | the bot |

Telegram cannot reach `.loc` hosts, and a client opened from a development or staging bot is rejected by the legacy
backend, because `initData` is bound to the bot token (BR-API-008). Real-client testing therefore needs a launch path
on the production bot (DEC-34) or stays in the emulator.

Two vhost facts to settle with the production track: the staging vhost sends `X-Frame-Options: SAMEORIGIN`
(`infra/staging/nginx/app.staging.homi.conf`), which stops Telegram Web from framing the Mini App (Q-SEC-012); and
the CSP of the group must allow the SDK host, the tile host of `meta.tiles` and, in production, the PostHog host.

### 6.5 Checks before the proxy is relied on

| Check | Closes | When |
| ----- | ------ | ---- |
| One read (`/api/bot`, then `/api/meta` with a test account) through the local gateway | Q-API-060 | W1-0, after DEC-33 |
| One test-account write and its undo (favourite on, favourite off) | Q-API-060 | W1-0, after DEC-33 |
| A signed photo, its thumbnail and a `Range` request for tiles through the gateway | signatures and ranges survive the hop | W1-1 |
| A call link opened against the HOMI origin | `/call/<token>` works behind the hop | W1-4 |
| The operator's statement on limits and edge rules, then a measured ramp on staging | Q-API-059 | before W1-9 |

### 6.6 Ready for Wave 2

Nothing in the client changes when routes move. What Wave 1 already delivers for it: the route table and its
generator, the upstream name in headers and logs, the tester override, and the `homi` mode of section 6.2.

## 7. Development and test environments

- **Emulator.** A port of the legacy development client (`$KVADRO_ROOT/demo/app/tools/dev/telegram-client.js`,
  TMA-045): it takes a pasted launch link, emulates the Telegram Desktop bridge, shows Back and Settings in a bar
  and turns red on a `401`. Development only; a CI check proves it is absent from production bundles (KV-FE-038).
- **Fake Telegram for tests.** Synthetic users and a synthetic bot token; `initData` signed by the test kit
  (KV-QA-003). Never a real account.
- **Reference build.** The production artefacts of the pinned legacy release, served from a scratch copy outside the
  legacy tree, with the mocked API. If the pinned release is not among the snapshots the legacy tree already holds,
  fetching its static files is a production touch under DEC-33.

## 8. Porting method

### 8.1 Port, do not redesign (DEC-32, option A)

12 §1 rule 5 says "port behaviour, not code": each screen was to be rebuilt from the audit on new primitives. For
Wave 1 this plan recommends the opposite and asks for the decision:

| | A — port the recovered modules | B — rebuild from the audit |
| - | ------------------------------ | -------------------------- |
| Starting point | 18 330 lines already verified against production by the legacy differential run | prose specifications in 03 and the task files |
| Risk to 1:1 | low: logic, order and markup stay; differences show up in the parity run as exact diffs | higher: every screen is a new implementation that must be proven equal |
| Legacy releases during the wave | a release diff applies to the twin file | each release is re-read and re-implemented |
| Code quality on day one | typed and linted, but with the legacy architecture (one large root component, module singletons) | new primitives and packages from the start |
| Cost | conversion and seams | design and implementation of 76 screen and foundation tasks |

Under A the task files of FE-1 and FE-2 stay the **specification and acceptance checklist** of each unit (states,
texts, rules, test names); their "Implementation" and "Files" sections are read through section 4 of this document.
The refactors they describe move to a follow-up after the wave exit, where the parity run protects them.

### 8.2 Unit of work

One task, one branch, one PR of about 400 changed lines (`docs/handoff/parallel-work.md` §2). For a port task:

1. Read the legacy files of the unit and the task file.
2. Convert to TypeScript without changing logic or statement order; apply only the seams of sections 3.3 and 3.9.
3. Add types from `@homi/types` (legacy shapes); no `any` to silence the checker.
4. Add the unit tests the task names; add or enable the parity scenarios that reach the unit.
5. Run `make ci-frontend` and the parity run for the touched scenarios; attach the result to the PR.
6. Record the legacy release the unit was ported from.

### 8.3 Legacy defects (DEC-36, option B)

03 lists 47 client defects and questionable decisions (`LB-APP`), and 12 §1 rule 6 planned to fix all of them.
"Do not change behaviour" and "do not port bugs" meet in the middle:

- **Fixed in Wave 1:** defects whose fix cannot be seen when everything works — crashes on unexpected data and the
  HTML injection. Candidates: the throwing `t()` (LB-APP-002), the crash on an empty flow answer (LB-APP-006), the
  crashes of the market sheet and the nearby section (LB-APP-015, LB-APP-016), server labels inserted as HTML
  (LB-APP-020, SEC-001). Each gets a test and an entry in the expected-difference list of the parity run.
- **Not in Wave 1:** every fix a user would notice, and every `DEV` item. Their flags stay off; they are switched
  on one at a time after the wave exit.

The final list is agreed in W1-0.

### 8.4 Baseline and release intake (DEC-37, Q-APP-024)

1. **Pin.** W1-0 names the legacy release the port starts from and brings 03, 08 and the registers up to it. Two
   releases are already missing from the audit: the report-detail step with the new `detail` field of the report
   route, and the `price_kind: business` label, badge order and no-access text
   (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-24`).
2. **Intake.** Each later legacy release arrives in the legacy tree as a sync report with per-unit diffs
   (`$KVADRO_ROOT/demo/app/docs/releases/`). It becomes one port task: apply the diffs to the twin files, update the
   mocks and the parity scenarios, move the pin.
3. **Freeze.** From the switch on, the Next.js client is the client. Legacy client releases stop, or are made in
   `frontend/app` (DEC-37).

## 9. Verification

| Layer | What it proves | How | Tool state |
| ----- | -------------- | --- | ---------- |
| Static | types and lint | `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build` | exists |
| Unit and component | formatters, filter model, `t()`, API client, storage, Telegram adapter | Vitest and Testing Library (KV-FE-010) | needs approval |
| **Parity run** | the new build behaves like the legacy build | below | needs approval (browser runner) |
| Visual | pixel-level look of the key states | screenshots at 390 × 844, ru light, plus dark, uz and en; baselines from the reference build (KV-QA-019, KV-FE-171) | side-by-side review until a diff tool is approved |
| Live smoke | the real backend accepts the new client | a written checklist per stage, run by a developer on a test account (section 6.3) | manual |
| Devices | real WebViews | iOS, Android including an old WebView, Telegram Desktop, Telegram Web (KV-FE-174, KV-QA-022) | needs DEC-34 |
| Performance | startup no slower than legacy | time to first feed render against the legacy `app_launch` baseline (KV-FE-173, KV-FE-001) | needs DEC-26 for the baseline |
| Security | no `initData` in logs, analytics or URLs; CSP; replay masking | checks of KV-FE-033, KV-FE-035 and SEC-REQ-047 | — |

**The parity run** is the main evidence of this wave. It adapts the legacy differential run
(`$KVADRO_ROOT/demo/app/tools/parity/`) and the reference-client idea of 15 §2.5 (KV-FE-172, KV-QA-010 … KV-QA-012):

- Two builds are driven through the same scenario: the reference build of section 7 and the new build.
- Both get the same fake Telegram and the same mocked API answers.
- Compared per scenario: the API requests made (method, path, query, body); the DOM under the application root and
  the attributes of `<html>` (class, `lang`, `data-*`); the `kv-*` storage writes; the Telegram bridge calls; the
  journal events and `$pageview` names; a screenshot.
- A difference fails the scenario unless it is on the expected-difference list (section 8.3) or is markup that
  Next.js adds outside the application root.
- Scenarios start from the three legacy suites (base, filters, GL map). Their count is taken at the pin: the
  documents disagree (70 in `RECOVERY.md`, 79 in `03`, 95 in the task files), because the suites grow with releases.

The run never touches production and never runs inside the legacy tree.

## 10. Sequence and exit criteria

| Stage | Content | Existing tasks | Weight | Exit criteria |
| ----- | ------- | -------------- | -----: | ------------- |
| **W1-0** Decisions, access, baseline | ADR; DEC-32, DEC-33, DEC-36, DEC-37 answered; requests of Q-SYS-009 and DEC-34 sent; baseline pinned; guard for the legacy tree; browser-floor data; spike; dependency request; first gateway check | KV-FE-001 … KV-FE-005 | 6 | Floor decision recorded with the spike report; dependencies approved or the blocked stages named; release pinned and 03/08 updated to it; the gateway check of section 6.5 passed |
| **W1-1** Foundations | shell and boot; styles; i18n and formatters; filter model; API client, mocks, prefetch; Telegram adapter, navigation, storage, theme, links, share, location; journal, PostHog, error boundary; emulator; test runner; local gateway; parity runner | KV-FE-010 … KV-FE-038 | 47 | An empty shell boots in the emulator in three locales and two themes; all 34 methods typed and mocked; catalogue key parity test green; the parity runner completes one scenario on both builds; the gateway serves meta, a photo and a tile range; CI green |
| **W1-2** Access and shell | bootstrap and gates, outside-Telegram and no-access screens, language and city pickers, shell, pull-to-refresh | KV-FE-040 … KV-FE-046 | 11 | Every screen of the row in section 5.1 reachable on mocks; its parity scenarios equal; live smoke: launch, gates, tab switching |
| **W1-3** Feed, filters, sort | card, feed with paging, empty states, filters in all sections, quick filter, sort | KV-FE-047 … KV-FE-056 | 17 | As above; the filter suite of the parity run equal; live smoke: a search with every filter section |
| **W1-4** Listing | screen and sections, translation, market sheet, contact, share, photo viewer, actions | KV-FE-063 … KV-FE-071 | 19 | As above; live smoke: card, call link, share, hide and undo on the test account |
| **W1-5** Map | engine choice, GL view, Leaflet view, lasso, selection card, tile prefetch | KV-FE-057 … KV-FE-062 | 12 | As above; the GL suite equal; both engines checked on devices or the drop of one recorded (FD-3) |
| **W1-6** Saved and radar | favourites, history, radar flow, tab, sheet, editor, survey, follow nudge | KV-FE-072 … KV-FE-080 | 13 | As above; live smoke: create, edit, pause and delete a radar on the test account, with the bot's messages observed |
| **W1-7** Settings and nudges | settings, sub-pages, hidden list, home-screen nudge | KV-FE-081 … KV-FE-086 | 8 | As above; live smoke: every setting changed and restored |
| **W1-8** Parity and hardening | full parity run, visual set, device pass, performance, security checks, release intake caught up | KV-FE-170 … KV-FE-174 | 12 | 100 % of scenarios equal or on the expected list; all 45 screens ticked in the parity record; device pass signed; startup within the budget; no open intake task |
| **W1-9** Preview, canary, switch | staging preview with the gateway; DEC-35 chosen; canary cohort; rollback drill; switch; watch window | KV-FE-177, rewritten for this wave | 2 | Canary within the error budgets of 18 §12.1; rollback drill done once before the switch; switch done; watch window closed; legacy client releases frozen |

**Order.** W1-0 → W1-1 → W1-2 are sequential. After W1-2 the stages W1-3 … W1-7 can run in parallel, one worktree
per agent (`docs/handoff/parallel-work.md` §2), with two links: the listing card of W1-3 (KV-FE-047) comes before
the lists of W1-6 and the map card of W1-5, and the filters sheet of W1-3 comes before the radar editor of W1-6.
W1-5 waits for the map packages. W1-8 needs all of them; W1-9 needs W1-8 and the answers on custody.

**The switch (W1-9).** Three ways to put the new client in front of users, in the order of preference:

| Way | Users arrive at | Keeps `kv-*` settings and old bot buttons | Needs |
| --- | --------------- | ----------------------------------------- | ----- |
| Edge rules on `app.kvadro.app` (24 §3, option E) | the same address | yes | the edge account or the operator (Q-SYS-009) |
| DNS of `app.kvadro.app` to HOMI nginx (option H on the legacy name) | the same address | yes | DNS custody, a separate name for the legacy origin, answers to Q-API-059 and Q-SEC-021 |
| The bot's Mini App URL changed to a HOMI host | a new address | no: old buttons keep opening the legacy client, device settings do not follow | the bot's owner account |

In each case the legacy client files stay where they are, and the way back is the reverse of the one change made.

## 11. Tasks

**Existing tasks.** The 87 tasks of section 10 stay, with three changes applied when each is picked up:

1. `KV-BE-…` prerequisites (38 distinct ones across these tasks) are replaced by "the legacy API through the gateway,
   mocks in CI". The tasks KV-FE-004 and KV-FE-021 lose their backend prerequisites first, because the rest depend
   on them.
2. Under DEC-32 option A the "Implementation" and "Files" sections follow section 4 of this document.
3. Fixes outside the DEC-36 list move to a follow-up task after the wave.

KV-FE-177 is rewritten from "S4 switch" to stage W1-9. KV-INF-010 (legacy artefact manifest) and KV-QA-019 (visual
baseline) are pulled forward for the reference build.

**New items.** They get `KV-…` numbers and task files when this plan is approved; until then they are named N1 … N9.

| Item | Content | Track | Stage |
| ---- | ------- | ----- | ----- |
| N1 | Local gateway: the four prefixes on `app.homi.loc`, the route table and its generator, the upstream header, log format, refusals and suppression of section 5.3 | development (`infra/local/**`) | W1-1 |
| N2 | Staging gateway on `app.staging.homi.uz`, framing header for Telegram Web | production [PT] | W1-8 |
| N3 | Baseline pin: 03, 08 and the registers brought to the pinned release; the intake procedure of section 8.4 | development | W1-0 |
| N4 | Guard: `KVADRO_ROOT` in the PreToolUse guard and in `.ai/local.env.example` (KI-26), so no session can write into the legacy tree | shared file, small PR | W1-0 |
| N5 | Parity runner for two builds (extends KV-QA-010 and KV-FE-172) and the expected-difference list | development | W1-1 |
| N6 | Defect list for DEC-36 from 03, by class | development | W1-0 |
| N7 | Live-smoke checklists per stage and the test-account procedure (section 6.3) | development | W1-1 |
| N8 | Request to the product owner: operator contact, launch path, limits, custody (Q-SYS-009, DEC-34, DEC-35) | developer | W1-0 |
| N9 | Switch runbook and rollback drill for the chosen way of section 10 | development and production | W1-9 |

## 12. Dependencies to approve

Requested in one batch by KV-FE-005 (DEC-23), with the exact legacy versions:

- **Runtime:** `maplibre-gl` 6.11.2, `pmtiles` ^4.5.0, `supercluster` ^8.0.1, `leaflet` 1.9.4, `leaflet.markercluster`
  1.5.3, `protomaps-leaflet` ^5.1.0, `posthog-js` 1.434.15, `lucide-react` ^1.69.0
  (`$KVADRO_ROOT/demo/app/package.json:22-33`).
- **Tests:** Vitest, Testing Library, jsdom, Playwright (12 §9.2); an image-diff tool is optional.
- **Not requested under option A:** a query library, a schema validator, Vite.

`react` and `react-dom` are 19.3.1 in `frontend/app` and 19.3.0 in legacy; the patch difference is accepted and
covered by the parity run.

## 13. Risks of this wave

| Risk | Where it is handled |
| ---- | ------------------- |
| Old WebViews cannot run the Next.js client (RK-07) | Gate of W1-0 (section 3.10); the application stays free of `next` imports |
| The target moves (RK-26) | Pin and intake (section 8.4) |
| Development traffic reaches production data or analytics (RK-27) | Section 6.3; mocks by default |
| No launch path on the production bot (RK-28) | Emulator and Telegram Web until DEC-34; asked for in W1-0 |
| The gateway is throttled or blocked (RK-25) | Checks of section 6.5; option E |
| Test tooling not approved (RK-16) | KV-FE-005 first; until then lint, typecheck, build and manual checklists (12 §1 rule 8) |
| The CSS pipeline alters the legacy styles (Q-APP-023) | Spike in W1-0 |
| One developer and agents for 87 tasks (RK-15) | Parallel stages after W1-2; port mode A |

## 14. Definition of done for Wave 1

1. All 45 screens, 34 methods and 39 integration points are ported and ticked in the parity record (15 §4.3).
2. The parity run is equal on every scenario, or the difference is on the agreed list.
3. The visual set is reviewed; the device pass is signed for iOS, Android, Desktop and Web.
4. Startup time is within the budget set from the legacy baseline.
5. The security checks pass: CSP in place, no `initData` in logs, analytics or URLs, replay masked.
6. The client is switched in by one of the ways of section 10, the rollback drill was done before it, and the watch
   window closed within the error budgets.
7. Legacy client releases are frozen or moved to `frontend/app`.
8. `make ci-frontend` is green on `main`; the documents 03, 08, 09 and the registers describe the pinned release.

## 15. First steps

Without waiting for any decision:

1. N3 — pin the baseline and update the audit for the two missed releases.
2. N4 — the guard for the legacy tree.
3. KV-FE-005 — the dependency request.
4. KV-FE-002 — the spike: route group with `ssr: false`, boot guard, CSS pipeline check, MapLibre import, a lowered
   `browserslist`.
5. N8 — the request to the product owner.

After DEC-32, DEC-33 and DEC-36: the first gateway check, then W1-1.
