# WP-21 — Telegram layer and session

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | IN_PROGRESS (feat/wp-21-telegram-and-session) |
| Depends on | WP-20 |
| Size | ≈ 3 000 changed lines, L |
| Behaviour reference | `25` §3.1 – §3.4, §3.10; `03` §1.2 – §1.7, §3.2, SCR-001, SCR-044; `05` (all of TMA-001 … TMA-045); earlier tasks KV-FE-024 … KV-FE-033, KV-FE-037, KV-FE-038, KV-FE-040 (behaviour, constants, edge cases and test ideas only — not their layer stack, `Authorization: tma` transport, `kv-*` keys or file layout) |
| Needs from the production track | (1) The app vhosts stop sending `X-Frame-Options` (`infra/staging/nginx/app.staging.homi.conf` sends `SAMEORIGIN` today) so that `frame-ancestors` of this package decides framing (Q-SEC-012). (2) Document responses of the app are not cached by nginx and `Set-Cookie` passes untouched. (3) Server environment of the app on staging and production: `API_URL`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `CSP_FRAME_ANCESTORS`, `CSP_TILE_HOSTS`, `CSP_ANALYTICS_HOSTS`, `CSP_REPORT_ONLY`. (4) The Mini App address of each environment attached to its bot, so the checks inside Telegram can run (DEC-45) |

## Goal

The app starts inside Telegram: an inline boot script guards old engines with the «Обновите Telegram» screen, one
adapter owns every call to `window.Telegram.WebApp`, the launch data is exchanged once for HOMI's own session
(cookie mode, or header mode where the frame refuses the cookie), BackButton and SettingsButton drive the router,
deep links open their target, and `proxy.ts` sends a nonce-based CSP. A developer can run all of it in a desktop
browser through the emulator.

## Scope

**In.** Boot script and the unsupported-engine screen; SDK loading and the 3 s wait; `lib/telegram/*`;
`lib/storage.ts`; theme and lite-mode application; `app/bff/session/route.ts`; `lib/session/*`; `lib/navigation/`
(`history`, `useBack`, `closeThen`, `useLayerState`, `nav`); `TelegramButtons`; `lib/deeplinks/*` and the launch
redirect; the development emulator and the fake Telegram of `@homi/testing`; CSP and security headers in
`proxy.ts`.

**Out.** Screens of the gates and the session-expired screen (WP-23). `/bff/[...path]` and Server Actions (WP-22).
Sheet drag, swipe-back, toast, confirm UI (WP-23). The `no_chat` flow (WP-30), the home-screen offer (WP-31), the
map engine override (WP-27) — this package only provides their adapter calls. Event transport, the boot-error
endpoint, PostHog (WP-32).

## Decisions that bind this package

- DEC-44, `25` §3.3: one adapter module; components never touch the SDK. The browser floor is the Next.js default
  (Chrome 111, Safari 16.4); anything older sees the update screen.
- DEC-40, `25` §3.4: HOMI's own bot signs `initData`; Laravel verifies it once and issues a token. The token lives
  in an `HttpOnly` cookie, or in memory in header mode — never in `localStorage`, DeviceStorage or the address
  (SEC-REQ-007).
- DEC-44, RK-30: Telegram Web is supported through a partitioned cookie with a header fallback; one screen code
  path serves both modes.
- `25` §3.2: BackButton follows the app's history; SettingsButton pushes `/settings`; a `start_param` of the form
  `l_<number>` or `?listing=` opens the listing, `?news=pets` opens the filters on the pets section.
- `25` §3.10, SEC-REQ-031: nonce-based CSP from `proxy.ts`. The bundled guide says nonces need dynamic rendering
  and do not combine with partial prerendering, which `cacheComponents` turns on (`25` §3.1) — step 1 settles it.
- DEC-36: fixed here — LB-APP-009, LB-APP-012, LB-APP-021, LB-APP-046, LB-APP-047. Behind a flag that is off —
  LB-APP-032 (`dev020OneLanguageDetector`).
- SEC-REQ-047: `initData`, the token and phone numbers never reach a log, an error report or an analytics payload.
- DEC-45: no tunnel tool; inside-Telegram checks run on staging and production after the deploy.

## Design

### Read before coding

`frontend/app/node_modules/next/dist/docs/01-app/`: `03-api-reference/02-components/script.md`;
`03-api-reference/03-file-conventions/proxy.md`, `route.md`, `layout.md`, `instrumentation-client.md`;
`03-api-reference/04-functions/cookies.md`; `02-guides/content-security-policy.md`,
`authentication-with-cache-components.md`, `backend-for-frontend.md`, `single-page-applications.md` ("Shallow
routing"), `preventing-flash-before-hydration.md`, `data-security.md`; and
`frontend/app/node_modules/next/dist/docs/03-architecture/supported-browsers.md`.

### What the root layout emits, in order

| # | Element | Purpose |
| - | ------- | ------- |
| 1 | inline script: stubs (`boot/stubs.js`) | `window.__tg__postBackgroundChange` and `window.TelegramGameProxy.receiveEvent` as no-ops when absent (TMA-002) |
| 2 | development only: emulator script | must run before the SDK; it keeps its double against the SDK's own assignment |
| 3 | inline script: boot (`<script id="homi-boot" data-bot>`) | engine test, watchdog, pre-paint theme and lite class, the update screen (below); at its end it **inserts** `<script id="tg-sdk" async crossorigin="anonymous" src="https://telegram.org/js/telegram-web-app.js">` with its own nonce |
| 4 | `preconnect` to `https://telegram.org` | `async` so a hanging host cannot keep the page white; `crossorigin` so SDK errors are readable (TMA-001) |
| 5 | providers: `SessionProvider`, `NavigationBinder`, `TelegramButtons`, `LocaleGuard`, `FragmentGuard`, `LaunchRedirector`, `BootGuard` | client side of everything below |

All inline and external scripts carry the request nonce. `script.md` says a `beforeInteractive` script is
downloaded before any Next.js module and executed in order — which is exactly what the SDK must **not** do. Measured
(WP-21): a plain `<script async>` rendered by the root layout receives the nonce, but React 19 hoists it above the
inline scripts of `<head>`, so the SDK could fail before the watchdog listens; the boot script therefore inserts the
SDK tag itself (with `'strict-dynamic'` a script inserted by a nonce-carrying script is trusted).

### Boot script (`frontend/app/boot/`)

- `boot/boot.js` and `boot/stubs.js` are hand-written in ES5 syntax (they must parse on engines below the floor) and
  linted with ESLint's own parser `espree` at `ecmaVersion: 5` (a block in `frontend/app/eslint.config.mjs`;
  eslint-config-next parses `.js` with typescript-eslint, which does not enforce `ecmaVersion`). `boot/build.mjs` (run
  by `predev` and `prebuild`) writes their text to `boot/inline.generated.ts`, which the layout injects. No bundler
  touches them. pnpm 11.24 runs `pre*` scripts by itself (verified with `pnpm hello` and `pnpm --filter app hello`).
- State: `window.__homiBoot = { ok: false, watching: false, sdk: null, show, errors: [] }`.
- **Engine test.** `CSS.supports('color', 'color-mix(in srgb, red, blue)')` and `HTMLScriptElement.supports('importmap')`
  (a missing `HTMLScriptElement.supports` counts as false). Checked: `color-mix()` ships in Chrome 111 and Safari 16.2
  (Chrome for Developers, caniuse `mdn-css_types_color_color-mix`), import maps in Chrome 89 and Safari 16.4
  (caniuse-lite 1.0.30001823 of the workspace), so the pair is false on Chrome 110 and Safari 16.3 and true on Chrome
  111 and Safari 16.4.
- **Watchdog** (TMA-003), active until `ok`: a capturing `error` listener on `window`. A failed script from
  `/_next/static/`, or an uncaught error that is not «Script error.» and not from `telegram.org`, shows the update
  screen. An error from the SDK is recorded only. A failed `#tg-sdk` sets `sdk = 'error'` and shows nothing — also
  after `ok`, because the session's SDK wait reads it whenever it starts; its load (captured on `document`: a load
  event never reaches `window`) sets `sdk = 'ok'`. The message drops `#…` and `tgWebAppData…` before it is recorded.
- **Report.** Every watchdog hit is pushed to `errors` (name, message ≤ 300 characters, source without query and
  fragment, `tg` version, platform) and posted by `XMLHttpRequest` to `/bff/boot-error`. That route arrives with
  WP-32; until then the request fails silently. Nothing is posted without launch data.
- **Before paint.** Theme: `homi-theme` `light` / `dark` sets `data-scheme` and `data-theme`; anything else is
  auto — `data-scheme="light"` until the SDK reports the colour scheme. Lite: `html.lite` per `lib/graphics.ts`
  rules, re-implemented in ES5 from the same constants (a unit test compares both).
- `BootGuard` (Client Component) sets `__homiBoot.ok = true` in its first effect and `watching = true` when the
  global handlers of WP-32 take over.

### Telegram adapter (`frontend/app/lib/telegram/`)

`sdk.ts` is the only file that reads `window.Telegram`. `types.ts` declares the narrow interface used (no types
package). `gates.ts` holds the one version table. `index.ts` exports the facade `tg`. Outside Telegram every
member is a no-op or returns `null` / `false` and never throws.

| # | Point | Facade member | Gate | Behaviour |
| - | ----- | ------------- | ---- | --------- |
| 1 | TMA-001, TMA-002 | layout tags | — | see the table above |
| 2 | TMA-003 | `__homiBoot`, `BootGuard` | — | watchdog and hand-over |
| 3 | TMA-004 | `waitForSdk(3000, onLate)` | — | resolves at once when the SDK exists, the tag is missing or `sdk = 'error'`; else on load, error or 3 s. A late SDK that carries launch data is adopted once and `initTelegramApp` runs again |
| 4 | TMA-005 | inside `waitForSdk` | — | without an SDK post `web_app_ready` and `web_app_expand` through `TelegramWebviewProxy.postEvent`, then `external.notify`, then `parent.postMessage` |
| 5 | TMA-006 | `tg.initData()`, `tg.hasInitData()` | — | SDK value, else `#tgWebAppData` captured once at module evaluation |
| 6 | TMA-007 | `lib/session/*` | — | replaced: `initData` is sent once to `POST /bff/session`, never on other requests |
| 7 | TMA-008 | `tg.languageCode()`, `detectLocale()` | — | raw code from the SDK user or the fragment's `user` JSON; mapping below |
| 8 | TMA-009 | `scrubLaunchFragment()` | — | removes the fragment with `history.replaceState` after the SDK wait settled and before any analytics code; never earlier, because the SDK reads its launch parameters from the fragment when it loads |
| 9 | TMA-010 … TMA-012 | `lib/deeplinks/parse.ts` | — | launch parsing (below) |
| 10 | TMA-013 | `lib/deeplinks/build.ts` | — | every link the app emits (below) |
| 11 | TMA-014 | `initTelegramApp()` | none | `ready()` and `expand()` once |
| 12 | TMA-015 | same | 7.7 | `disableVerticalSwipes()` |
| 13 | TMA-016 | same; `useTelegram()` | 8.0, platform `ios` / `android` / `android_x` | `requestFullscreen()` in `try`; `html.fullscreen` follows `isFullscreen` and `fullscreenChanged` |
| 14 | TMA-019, TMA-020, TMA-021 | `lib/telegram/theme.ts` | 6.1 colours, 6.9 exact hex | `applyTheme()`, `setThemePreference(pref)`, `themeChanged` listener (states below) |
| 15 | TMA-022 | `tg.backButton` + `TelegramButtons` | none | show / hide / one click handler |
| 16 | TMA-023 | `tg.settingsButton` + `TelegramButtons` | 7.0 | show, one click handler |
| 17 | TMA-024, TMA-027, TMA-032, TMA-034, TMA-038 | none | — | confirmed absences: no MainButton or bottom buttons, no popup / alert / QR, no inline query / story / `sendData` / download / invoice, no `requestContact`, no Cloud or Secure storage, biometrics or motion sensors. The facade has no member for them; adding one is a product change |
| 18 | TMA-025 | `tg.haptic.impact(style = 'light')`, `.success()`, `.error()` | none | optional calls; `selectionChanged` unused |
| 19 | TMA-026 | `tg.confirm(text)` → `Promise<boolean>` | 6.2 | `showConfirm`, else `window.confirm` |
| 20 | TMA-028 | `tg.openLink(url)` → `boolean` | none | `https:` only and only hosts of one allow-list constant (`t.me`, the app and landing origins, `yandex.uz`, `google.com`, the brand links; an entry also matches its `www.` form; WP-26 and WP-27 add the call-page host and the two map attribution hosts); `t.me` goes to `openTelegramLink`, the rest to `openLink`; the same address within 1.5 s returns `false`; outside Telegram `window.open(url, '_blank', 'noopener')` |
| 21 | TMA-029 | `tg.call(phone, callUrl)` → `'tel' \| 'browser' \| null` | — | Android: `tel:` then watch `visibilitychange` and `blur` for 1.2 s, else open `callUrl`; other platforms open `callUrl`; `null` when nothing opened (WP-26 logs the event only on a non-null result) |
| 22 | TMA-030 | `tg.shareMessage(preparedId)` → `boolean` | 8.0 | on `WebAppShareMessageOpened` send the internal `prepared_message_failed` event and retry once; guarded so an SDK change fails a unit test, not the user |
| 23 | TMA-031 | `tg.shareUrl(url, text)` | — | `t.me/share/url` through `openTelegramLink`; outside Telegram `navigator.share`, else a new tab |
| 24 | TMA-033 | `tg.requestWriteAccess()` → `boolean \| null` | 6.9 | `null` when unavailable; the flow around it is WP-30 |
| 25 | TMA-035 | `tg.location.available()`, `tg.location.get()` → `{ lat, lon, accuracy } \| 'denied' \| 'fail'` | 8.0 for LocationManager | LocationManager, else browser geolocation (high accuracy, 12 s, max age 60 s); the whole Telegram path races a 12 s timer (fix of LB-APP-009); one request at a time; coordinates are never stored, logged or sent |
| 26 | TMA-036 | `tg.homeScreen.status()`, `.add()`, `.onAdded(cb)` | 8.0 | status with a 1.5 s timeout → `unknown` |
| 27 | TMA-037 | `tg.deviceStorage` (used only by `lib/storage.ts`) | 9.0 | `getItem`, `setItem`, `removeItem` |
| 28 | TMA-039 | `tg.close()` | none | no closing confirmation |
| 29 | TMA-040 | `tg.onVisible(cb)`, `tg.onHidden(cb)` | — | `document.visibilitychange`, not Telegram's activity events; since legacy release `index-DY_DH7h-.js` it also drives the visit sessions of the return banner (BR-APP-070, WP-30): hidden on the search tab records a visit, visible after ≥ 6 h starts a new session |
| 30 | TMA-041 | `tg.platform()`, `tg.version()`, `isAndroid()`, `performanceClass()` | — | platform from the SDK; the `Telegram-Android/… (…; LOW\|AVERAGE\|HIGH)` class from the User-Agent |
| 31 | TMA-042 | `tg.isVersionAtLeast(v)`, `supports(feature)` | — | the single table of gates; an unparsable version opens only the "none" row |
| 32 | TMA-043 | whole facade | — | the outside-Telegram fallbacks named in each row |
| 33 | TMA-044 | `safeCallback(fn)` | — | wraps every SDK event handler: catch, then rethrow on a zero timeout so the dispatcher survives and the global handler reports once |
| 34 | TMA-045 | `frontend/app/dev/` | — | emulator (below) |

Safe areas and the absence of viewport units (TMA-017, TMA-018) are CSS and belong to WP-20.

The system sheets the app triggers (SCR-044: write access, the share picker, the home-screen dialog, the location
permission, link hand-off) have no layout of their own: they are the members `requestWriteAccess`,
`shareMessage`, `homeScreen.add`, `location.get`, `openLink`, and callers only react to the returned value.

**Language (BR-APP-050, LB-APP-032).** `detectLocale(languageCode, { oneDetector })`: with
`dev020OneLanguageDetector` off, `uz*` → `uz`, anything else → `ru` (an English Telegram user sees Russian before
sign-in, as legacy; the no-access screen of WP-23 uses the full mapping, as legacy); with the flag on, `uz*` →
`uz`, `en*` → `en`, else `ru`, everywhere including the boot script. `LocaleGuard` applies it: before sign-in,
when next-intl has no stored locale and the detected one differs from the segment, it replaces the segment; after
sign-in `me.locale` wins (step 5 of `25` §3.4) and the guard re-checks on every navigation, so Back cannot land
on an old segment. The first-launch choice itself is WP-23.

### Storage (`frontend/app/lib/storage.ts`)

| Key | Format | Policy |
| --- | ------ | ------ |
| `homi-city` | city code | mirrored and restored |
| `homi-nudge` | JSON `{ asked: string[≤40], closed, quietUntil, lastShown, back, feedOff }`; since legacy release `index-DY_DH7h-.js` `back` is `{ <filters hash>: ms }` with at most 40 entries (the last return banner per filter set) and `feedOff` the end of the radar card's snooze in ms | mirrored and restored |
| `homi-visits` | JSON `{ <filters hash>: ms }`, the last search visit per filter set, the 40 newest kept (BR-APP-070); since legacy release `index-DY_DH7h-.js` | mirrored and restored (TMA-037) |
| `homi-home` | JSON `{ days: ['YYYY-MM-DD' ×≤10], offered }` | mirrored and restored |
| `homi-new-<feature>` | `'1'` (only `pets` in use) | mirrored and restored |
| `homi-theme` | `auto` / `light` / `dark` | local |
| `homi-graphics` | `full` / `lite`, absent = auto | local |
| `homi-graphics-measured` | `lite` | local |
| `homi-map-engine` | `gl` / `leaflet` | local |
| `homi-map-fit:<lat>,<lon>` | JSON `[lat, lon, zoom]` | local |

- `storageGet(key)`, `storageSet(key, value | null)`; unknown keys do not compile. Every call sits in `try`:
  with storage disabled reads give `null`, writes are ignored and the app still starts.
- Fix of LB-APP-012: a key is mirrored to DeviceStorage (9.0+) only if it is also restored.
- Fix of LB-APP-021: `restoreFromDeviceStorage()` fills missing local keys, 1.5 s per key, all in parallel, never
  rejects; the session bootstrap awaits it right after the SDK wait (DeviceStorage is part of the SDK), i.e. before
  the first data request. Since
  legacy release `index-DY_DH7h-.js` the same race also loses `kv-visits` (no previous visit, no return banner, and
  a single-entry write over the DeviceStorage copy); awaiting the restore before the first data request fixes it
  for `homi-visits` too, because no visit is recorded before the reference data has loaded (WP-30).
- There is no stored locale key: the locale is the address segment plus next-intl's cookie.
- A guard refuses any value that looks like launch data (`hash=`, `auth_date=`, `query_id=`) or a bearer token.

`frontend/app/lib/graphics.ts` (`03` §1.7): `getGraphicsMode()`, `isLiteGraphics()`, `applyGraphicsMode()`,
`setGraphicsMode(mode)` (`auto` also clears the measured key), `measureScrollPerformance()` (Android, auto, 150
frame intervals, lite when ≥ 20 % exceed 28 ms), `useGraphicsMode()`. Low-end rule: User-Agent class not `HIGH`;
else Android with ≤ 4 cores or ≤ 3 GB (missing values count as 8); iOS and desktop never.

### Session

**`app/bff/session/route.ts`** (`route.md`, `cookies.md`; server-only base address `API_URL`, falling back to
`NEXT_PUBLIC_API_URL`):

| Method | Input | Does | Answers |
| ------ | ----- | ---- | ------- |
| `POST` | JSON `{ initData }`, at most 4 KB, same-origin `Origin` only (compared with `Host`) | calls `POST /auth/telegram` per the WP-11 contract; on success sets `homi_session` with `httpOnly`, `secure`, `sameSite: 'none'`, `partitioned`, `path: '/'` and the token's expiry, and `homi_session_user` (same attributes) with the SHA-256 of the Telegram user id — `MeResource` carries no Telegram id | `200 { token, expiresAt, me }`; `401` with the API's code when the signature or the age of `auth_date` is refused (both cookies are deleted); `403` with the access reason of the contract; `502` for anything else |
| `GET` | the cookie, or `Authorization: Bearer`; refused when `Origin` or `Sec-Fetch-Site` names another site | calls `GET /me` with that token | `200 { mode: 'cookie', me, user }` (`user` = the `homi_session_user` value), `200 { mode: 'header', me }`, or `200 { mode: 'none' }` when neither is present; `401` when the API refuses the token; `403` with the access reason, as on `POST`, when `GET /me` answers `access_denied` (a user refused after an earlier launch) |

Both answers are `Cache-Control: no-store`; the handler never logs a body or a header.

**Client bootstrap** (`lib/session/bootstrap.ts`), once per launch, guarded against double effects:

1. No launch data → status `outside`.
2. `track('app_launch', { entry, ms, v, sdk, js, platform })`, `entry` from the launch parser.
3. `GET /bff/session`. If it says `cookie` and its `user` equals the SHA-256 of the Telegram user id of the launch
   data (the unsigned user id is used only to decide whether to sign in again) → ready, no sign-in. Before this
   step the SDK wait ends, then the DeviceStorage restore runs (it needs the SDK), `initTelegramApp`, the fragment
   scrub and `app_launch`; the state's `prepared` turns true, and navigations of `LocaleGuard` wait for it, because
   the scrub's `history.replaceState` undoes a navigation still pending.
4. Otherwise `POST /bff/session` with the launch data, then `GET /bff/session`: `cookie` → cookie mode, the token
   from the body is dropped; `none` → header mode, the token stays in module memory and `GET /bff/session` is
   repeated with the bearer header to read `me`. Outcomes other than success, in step 3 or here: `403` → status
   `denied` with the reason; `401` from the sign-in (`auth_expired` or `invalid_init_data` of WP-11) → status
   `expired`, also on the first sign-in of a launch; a network error, a timeout, `502` or `429` → still `booting`
   with `error` set.
5. Ready: apply `me.theme` (it replaces `homi-theme` on every start, TMA-021), let `LocaleGuard` replace the
   locale segment if it differs, `track('app_opened', …)`, then `router.refresh()` in cookie mode so Server
   Components render with the session.

`SessionProvider` / `useSession()`:

| Field | Meaning |
| ----- | ------- |
| `status` | `booting`, `ready`, `outside`, `denied`, `expired` |
| `mode` | `cookie` or `header` once ready |
| `me` | the user part of the contract (`locale`, `currency`, `theme`, `city`, the "chosen" marks, analytics id) |
| `reason` | access reason when `denied` |
| `error` | `UiError` of the last failed attempt (offline, timeout, server) while still `booting` |
| `retry()` | runs the bootstrap again; WP-23 owns the timers of BR-APP-054 that call it |
| `refresh()` | re-reads `me` after a settings change |
| `patchMe(partial)` | merges a saved change (`locale`, `currency`, `theme`, `city` and the two "chosen" marks) into `me` at once. Keys patched in this launch are applied again after every later re-read of `me`: a stub `GET /me` never changes, and without this the locale guard would turn the address back after a language pick. WP-23 and WP-31 call it after a successful `updateSettings` |

`lib/session/server.ts` (`import 'server-only'`): `getSessionToken()` reads the cookie; every caller sits inside
`<Suspense>` (`authentication-with-cache-components.md`). `lib/session/store.ts`: `getAuth()` returns
`{ mode, token? }` for `bffFetch` and Server Actions of WP-22.

**Expiry (fix of LB-APP-047).** `reauthenticate()` — one in-flight promise — is called by WP-22 on any
`unauthorized` answer: it repeats step 4 with the launch data of this launch. If that sign-in is refused with
`401`, the status becomes `expired`: every screen is replaced by the session-expired state of WP-23, BackButton is
hidden, no request is retried. The same check runs when the app becomes visible after the token's expiry time.

### Navigation (`frontend/app/lib/navigation/`)

- `nav.ts`: `nav.push(href)`, `nav.replace(href)`, `nav.back()`, `nav.tab(href)` — thin wrappers over the
  next-intl router with `scroll: false`. The `useRouter` exported by `frontend/app/i18n/navigation.ts` (WP-20) is
  rebuilt on top of them, so wherever another specification writes `router.push`, `router.replace` or
  `router.back`, the call is counted. The `Link` exported there is wrapped the same way — an unmodified click
  appends its target to the stack, a `replace` link rewrites the top — so the card link of WP-24 counts like
  `nav.push`. Feature code never imports a router or `Link` from `next/navigation`, `next/link` or next-intl
  directly; that is what makes the depth counter exact. `nav.tab` is what the tab bar and the list/map toggle use.
- `history.ts`: the app's own stack of addresses pushed in this launch. `depth` is its length. `nav.push` and
  `useLayerState().open` append; a `popstate` pops down to the entry that matches the new address; `nav.replace`
  rewrites the top; `nav.tab` clears the stack (`resetDepth()`). The stack matches addresses on `popstate`; the
  Navigation API is not used. The counted `useRouter` and `Link` live in the client module
  `i18n/CountedNavigation.tsx`, re-exported by `i18n/navigation.ts`, so `redirect` and `getPathname` stay usable on
  the server; `features/shell/NavigationBinder.tsx` hands the plain next-intl router to `nav`.
- `useBack()` → `{ canGoBack, back }`. `canGoBack = depth > 0 || parentOf(pathname, searchParams) !== null`
  (WP-20). `back()` is `router.back()` when `depth > 0`, else `nav.replace(parentOf(…))` — a direct load of a layer
  address, or a layer parameter present at depth 0, still closes in the legacy order.
- `closeThen(href)`: when `depth > 0`, go back, wait for the `popstate` (500 ms cap), then `nav.replace(href)`; at
  depth 0 only the replace. History never grows. Used by «Показать N», sort and city picks.
- `useLayerState(key)` → `{ value, open(value), close() }` for layers that are not routes but must close on Back:
  `open` appends the search parameter with `window.history.pushState` (`single-page-applications.md`), `close` is
  `back()`. Keys in use: `pick`, `draw`, `pin`, `step`.
- `features/shell/TelegramButtons.tsx`: BackButton is shown iff `canGoBack` and the session is not `expired`;
  its click runs `back()`. SettingsButton (7.0+) runs `nav.push(routes.settings())` unless the address is already
  under `/settings`. Because every slot has null pages for other addresses, this leaves no sheet or overlay
  rendered — the fix of LB-APP-046. Handlers go through `safeCallback`; a late SDK re-registers them once.

Visible order of closing must equal legacy (`03` §1.2): layer parameter, then sheet, then overlay child, then the
listing, then nothing (root tab: BackButton hidden, Telegram shows Close).

### Deep links (`frontend/app/lib/deeplinks/`)

`parse.ts` — `parseLaunch(initData, search)`, memoised, never throws:

| Field | Rule |
| ----- | ---- |
| `listingNumber` | `^l_(\d+)` of `start_param`, else `?listing=`; a positive safe integer; `start_param` wins |
| `source` | `l_<n>-web` → `web`; `l_<n>-(fb\|tg\|ig)<1–4 digits>` → that code; `l_<n>-seo…` → `seo`; any other `l_…` → `share`; else `null` (TMA-011) |
| `postUrl` | `l_<n>-[seo-]<channel 4–32>-<post 1–12 digits>` → `https://t.me/<channel>/<post>` |
| `news` | `?news=` matching `^[a-z_]{1,32}$` |
| `mapOverride` | `?map=gl\|leaflet\|auto` (consumed by WP-27) |
| `entry` | `link` with a listing, else `news`, else `menu` |

`LaunchRedirector`, once per launch after the session is ready and while `launchGate()` allows it (WP-23
registers its gate check with `setLaunchGate(fn)` and calls `releaseLaunchGate()` when it opens): a listing →
`nav.push(routes.listing(n))` from the feed, so the listing opens over the feed and Back returns to it;
`news = 'pets'` without a listing → `nav.push(routes.filters({ focus: 'pets' }))`. The `listing` and `news`
parameters leave the address first, by `nav.replace`; the push waits until `useSearchParams` shows the cleaned
address (a native `replaceState` followed by a push in the same tick collapsed into one entry — measured).
`scrubLaunchFragment` passes a `null` state to `history.replaceState`: the App Router's patched `replaceState`
ignores the address under a state it wrote and put the fragment back on the next Back (measured).
`features/shell/FragmentGuard.tsx` removes the launch fragment again after every navigation, because the App Router
brought it back on the locale switch after sign-in (measured, TMA-009). Whether the bot's buttons use `?listing=` or `startapp` is open (Q-APP-019); both work.

`build.ts` — the only place a Telegram link is built: `botUrl()`, `botStartUrl(payload?)`,
`botStartAppUrl(number)`, `noAccessStartUrl(source, number?)` (`s_<source>[--l<number>]`),
`supportUrl(username, number?)`, `channelPostUrl(channel, post)`. Usernames match `^[A-Za-z0-9_]{4,32}$`, numbers
are positive integers, a `start` payload is at most 64 characters of `[A-Za-z0-9_-]`; a builder returns `null`
when a part is missing, and the caller hides its button.

### Development emulator and the fake Telegram

- `@homi/testing` exists since WP-03 with `fakeTelegram(options)` — a double of `window.Telegram.WebApp` that
  refuses what the configured version does not support (TMA-042) — and `playwrightTelegram(page, options)`, which
  installs the same double as an init script and blocks external hosts, `telegram.org` included. Tests therefore
  never run Telegram's own script: the adapter finds `window.Telegram.WebApp` in place. Do not build a second fake
  at the bridge level. This package extends the double (`frontend/packages/testing/src/fakeTelegram.ts`) with every
  member of the adapter table it still lacks — theme and viewport events, safe area, fullscreen, popup, write
  access, prepared message, home screen, location, DeviceStorage, close — each with its version gate and a
  self-test, and adds `launchApp(page, { mode, locale, startParam, platform, version, sdk })`: it calls
  `playwrightTelegram`, forces the session mode and opens the app.
- The start without an SDK (TMA-005) is tested with `launchApp(page, { sdk: false })`: no double is installed, the
  SDK host stays blocked, and a spy on `TelegramWebviewProxy.postEvent` records `web_app_ready` and
  `web_app_expand`.
- `frontend/app/dev/telegram-emulator.ts` wraps the same double for a desktop browser: a form over the
  outside-Telegram state (paste launch data of the developer's own dev bot, or "fake user" for stub sign-in), the
  choice kept in `sessionStorage` `homi-dev-initData`; a dev bar with Back, Settings, version (6.0 … 9.1),
  platform, theme; a red bar on `401`. Inside a real Telegram it does nothing.
- It is built by the `predev` script into `public/__dev/telegram-emulator.js` (git-ignored), referenced by the
  layout only when `NODE_ENV` is `development`, and deleted by `prebuild`. WP-33 checks that neither the file nor
  the string `homi-dev-initData` exists in production output.

### CSP and security headers (`proxy.ts`)

Step 1 decides between: (a) nonce and `'strict-dynamic'` as `25` §3.10 says, with every document rendered at
request time; (b) hash-based policy with the experimental `sri` option of the bundled guide plus the SHA-256 of
the two inline scripts, keeping the static shell; (c) asking the developers to change `25`. The policy itself:

```text
default-src 'self';
script-src 'self' 'nonce-<n>' 'strict-dynamic' https://telegram.org;      + 'unsafe-eval' in development only
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: <media host> <tile hosts>;
font-src 'self' data:;
connect-src 'self' <tile hosts> <analytics hosts>;
worker-src 'self' blob:;
object-src 'none'; base-uri 'none'; form-action 'self';
frame-ancestors <CSP_FRAME_ANCESTORS>
```

- The browser talks only to its own origin (`/bff/*`), so the API host is not in `connect-src`.
- Host lists come from the environment, never from reference data: `NEXT_PUBLIC_CDN_URL`, `CSP_TILE_HOSTS`,
  `CSP_ANALYTICS_HOSTS`, `CSP_FRAME_ANCESTORS` (the Telegram Web origins found for Q-SEC-012; `'none'` is wrong
  for this app). Non-`https` values are rejected at start.
- `style-src 'unsafe-inline'` is a recorded residual risk (gesture transforms, map libraries).
- `CSP_REPORT_ONLY=1` sends the header as report-only for the first staging deploy.
- Also set: `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`,
  `Permissions-Policy` with `geolocation=(self)`, `clipboard-write=(self)` (copying the original, WP-26) and
  everything else off (Chromium rejects `browsing-topics` with a console error, so it is not listed),
  `Cache-Control: no-store` on documents. No `X-Frame-Options`. An empty `CSP_FRAME_ANCESTORS` means
  `https://web.telegram.org`; `'none'` is refused.

## Files

- `frontend/app/boot/{boot.js,stubs.js,build.mjs,inline.generated.ts}`, `frontend/app/features/shell/BootGuard.tsx`.
- `frontend/app/lib/telegram/{sdk,types,gates,wait,init,theme,haptics,dialogs,links,phone,share,access,location,
  homeScreen,deviceStorage,buttons,language,index}.ts`, `useTelegram.ts`.
- `frontend/app/lib/{storage,graphics}.ts`.
- `frontend/app/app/bff/session/route.ts`; `frontend/app/lib/session/{server,store,bootstrap,types}.ts`,
  `SessionProvider.tsx`, `LocaleGuard.tsx`; `frontend/server-only.test-stub.ts` (Vitest stands it in for
  `server-only`, which Next.js resolves itself and which is not installed).
- `frontend/app/lib/navigation/{nav,history,useBack,closeThen,useLayerState}.ts`;
  `frontend/app/features/shell/{TelegramButtons,NavigationBinder,FragmentGuard}.tsx`,
  `frontend/app/i18n/CountedNavigation.tsx`.
- `frontend/app/lib/deeplinks/{parse,build,launch}.ts`, `frontend/app/features/shell/LaunchRedirector.tsx`.
- `frontend/app/dev/{telegram-emulator.ts,build.mjs}` (the emulator is built with Node's `module.stripTypeScriptTypes`:
  no bundler), `frontend/packages/testing/**`.
- Changed: `frontend/app/proxy.ts`, `frontend/app/lib/security/csp.ts` (new), `frontend/app/app/[locale]/layout.tsx`,
  `frontend/app/i18n/navigation.ts` (its `useRouter` rebuilt on `nav`), `frontend/app/eslint.config.mjs` (the
  ES5 block for `boot/boot.js`), `frontend/app/package.json` (scripts only), `frontend/app/.env.example` (the
  server-only keys `API_URL`, `CSP_FRAME_ANCESTORS`, `CSP_TILE_HOSTS`, `CSP_ANALYTICS_HOSTS`, `CSP_REPORT_ONLY`;
  today the file holds `NEXT_PUBLIC_*` keys only), `frontend/app/.gitignore` (`/public/__dev/`).
  `boot/inline.generated.ts` is committed: CI runs lint and typecheck before any build, so the import must
  resolve without `prebuild`; `boot/boot.test.ts` also asserts that the committed text equals `boot.js`.
- Tests under `frontend/app/tests/{telegram,session,navigation,deeplinks,boot,security}/` and
  `frontend/app/e2e/{launch,session,back,boot-failure,csp}.spec.ts`.
- `.github/workflows/frontend-e2e.yml` and the `webServer` entry of `frontend/playwright.config.ts` (shared files:
  announce them in the PR). WP-03 left the API service of the end-to-end workflow to WP-33, but `launch.spec.ts`
  and `session.spec.ts` cannot sign in without the API and the workflow runs on every frontend pull request, so
  the service is added here: PHP and Composer install, `php artisan migrate` on SQLite, the API served by PHP's
  built-in server on a local port (CI only — never on a developer machine), `API_URL` pointing at it, the app
  built and started with `NEXT_PUBLIC_APP_ENV=ci`. Chromium keeps the `Secure`, `Partitioned` cookie on
  `http://localhost` (the cookie-mode specs pass there), so no TLS is needed. On a developer machine
  `playwright.config.ts` gives the app server `API_URL` (default the local stack) and the mkcert root through
  `NODE_EXTRA_CA_CERTS`. WP-33 adds the remaining steps (stub media, WebKit, nightly, checks).

## Steps

1. **CSP and Cache Components spike** (one day at most). Build the smallest page with a nonce from `proxy.ts`
   under `cacheComponents`, an inline script and a Suspense boundary; observe what the browser blocks. Choose
   (a), (b) or (c), write the choice into a short ADR that amends ADR-0018 (accepted ADRs are not edited,
   `docs/architecture/decisions/README.md`) and into "Handoff".
2. `lib/telegram/{sdk,types,gates,wait,init}.ts` with unit tests on a fake `window.Telegram`.
3. `lib/storage.ts`, `lib/graphics.ts`, `lib/telegram/theme.ts` with tests.
4. `boot/boot.js`, its build script, the layout tags, `BootGuard`; the boot-failure e2e cases.
5. Remaining adapter members (haptics, dialogs, links, phone, share, access, location, home screen), each with
   its test; the facade `tg`.
6. `@homi/testing` fake Telegram and the emulator; `predev` / `prebuild` scripts.
7. `app/bff/session/route.ts`, `lib/session/*`, `SessionProvider`; unit tests of the route with a fake API; the
   API service of the end-to-end workflow (see "Files"), so that the specs of the next steps can sign in on CI.
8. `lib/navigation/*` and `TelegramButtons`; unit tests of the stack; e2e Back cases on the placeholder routes.
9. `lib/deeplinks/*`, `LaunchRedirector`, `LocaleGuard`.
10. `lib/security/csp.ts` and the headers in `proxy.ts` per step 1; the CSP e2e case.
11. `.env.example`, README of the app, the request to the production track; deploy to staging in report-only
    mode, open inside Telegram on iOS, Android, Desktop and Web, note which mode each client got.
12. Enforce the policy; repeat the check on production.

## Behaviour to reproduce

**Update screen «Обновите Telegram» (SCR-001).** Shown when the engine test fails, when a script of the app
fails to load, or on an uncaught error before `ok`; never closes. Full-height centred block built with inline
styles by the boot script: 🔄 44 px, title 22 px, one paragraph, two 48 px pill buttons (first accent, second
`#f0f0f3` light or `#1c1c1f` dark; dark when the SDK says so or the system prefers dark). Texts are in the
script, not in the catalogues:

| Locale | Title | First button | Second button |
| ------ | ----- | ------------ | ------------- |
| ru | «Обновите Telegram» | «Вернуться в бота» | «Попробовать ещё раз» |
| uz | «Telegramni yangilang» | «Botga qaytish» | «Qayta urinish» |
| en | «Update Telegram» | «Back to the bot» | «Try again» |

The paragraph per language is copied from the pinned legacy release, with the brand untouched (it names
Telegram and the system WebView only). Language: the address segment if it is a known locale, else
`detectLocale` of the Telegram language. First button: `Telegram.WebApp.close()`, or without the SDK
a link to `https://t.me/<bot>`; the bot name comes from the boot tag's `data-bot`, rendered by the layout from
`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (the generated file is committed, so nothing environment-specific is baked into
it), and without SDK and bot name the button is left out. Second button: `location.reload()`.
A slow or failed SDK shows no screen: the app starts without it after at most 3 s.

**Launch.**

| State | Trigger | What the user sees |
| ----- | ------- | ------------------ |
| booting | first paint | shell and skeletons of the address, theme and lite class already right |
| ready, cookie mode | sign-in ok, cookie came back | content rendered on the server after one refresh |
| ready, header mode | sign-in ok, cookie refused by the frame | the same screens, filled by client requests |
| outside | no launch data | WP-23's outside-Telegram page |
| denied | sign-in answered `403` | WP-23's no-access page with the reason |
| expired | a request answered `401` and the new sign-in was refused | WP-23's session-expired state; BackButton hidden |
| network failure | sign-in unreachable | still booting; `error` set; WP-23 retries after 1, 3, 7, 15, 30 s and on return to the app |

**Theme** (TMA-019 … TMA-021):

| State | `data-scheme` | `data-theme` | Window colours |
| ----- | ------------- | ------------ | -------------- |
| auto, Telegram light | `light` | absent | `bg_color` (6.1+) |
| auto, Telegram dark | `dark` | absent | exact `--bg` (6.9+), else `bg_color` |
| explicit light / dark | that value | that value | exact `--bg` (6.9+), else `bg_color` |
| outside Telegram | from the preference, auto → `light` | as above | none |

`themeChanged` re-applies in auto and changes nothing with an explicit choice. A non-hex computed `--bg` falls
back to `bg_color`.

**Version gates** (TMA-042): none — `ready`, `expand`, `close`, haptics, links, BackButton, events; 6.1 — header
and background colour; 6.2 — `showConfirm`; 6.9 — exact hex colours, `requestWriteAccess`; 7.0 — SettingsButton;
7.7 — `disableVerticalSwipes`; 8.0 — fullscreen on mobile, `shareMessage`, home screen, LocationManager; 9.0 —
DeviceStorage. A closed gate degrades, never throws.

**Back and Settings.**

| Where | BackButton | Back does |
| ----- | ---------- | --------- |
| root tab, nothing open | hidden | — |
| sheet, overlay, listing, settings sub-page opened in the app | shown | closes the top one |
| the same addresses loaded directly | shown | goes to the parent address, search state kept |
| a layer parameter (`pick`, `draw`, `step`, `pin`) | shown | removes that layer only |
| feed opened from a radar («Смотреть найденное») | shown | returns to the radar sheet |
| after a tab press | hidden | — (the stack is cleared) |
| session expired | hidden | — |

SettingsButton from anywhere, with any sheet open, shows the settings screen with nothing over it.

**Links, calls, haptics:** as the adapter table; the 1.5 s link debounce and the 1.2 s `tel:` detection are
constants exported for tests.

**Events fired here:** `app_launch` when launch data exists; `app_opened` once after sign-in with
`{ entry: 'link', listing_id, ms }` or `{ entry: 'news' | 'menu', ms }`; never after a refusal.

## Tests

**Unit (Vitest), `frontend/app/tests/`.**

- `telegram/wait.test.ts`: SDK present; late with and without launch data (adopted once); tag error; 3 s timeout;
  bridge order; two `load` events.
- `telegram/gates.test.ts`: the table for 6.0, 6.1, 6.2, 6.9, 7.0, 7.7, 8.0, 9.0 and an unparsable version.
- `telegram/theme.test.ts`: each row of the theme table on 6.0, 6.1, 6.9; non-hex `--bg`.
- `telegram/links.test.ts`: debounce; refused `http:`, `javascript:` and unlisted hosts; `t.me` routing.
- `telegram/phone.test.ts` (fake timers): Android leaves within 1.2 s → `tel`; does not → `browser`; iOS →
  `browser`; no `callUrl` and no `tel` → `null`; a phone not matching `+998` and 9 digits never tries `tel:`.
- `telegram/share.test.ts`: stale-window recovery retries once; other errors rethrow; unavailable → `false`.
- `telegram/location.test.ts`: manager never answers → `fail` after 12 s; requested and not granted → `denied`
  without a request; 7.10 → browser path; a second call while pending shares the promise.
- `telegram/language.test.ts`: `uz-UZ`, `uz-Cyrl`, `en`, `en-GB`, `kk`, empty — for both flag states.
- `telegram/safeCallback.test.ts`: a throwing handler does not break the next event and rethrows once.
- `storage.test.ts`: policy per key (`homi-visits` mirrored and restored); storage throwing; restore fills only
  missing keys, honours the 1.5 s cap, survives `getItem` throwing; a `homi-visits` value in DeviceStorage and none
  locally is restored before the bootstrap resolves; no DeviceStorage call below 9.0; launch-data-shaped values refused.
- `graphics.test.ts`: User-Agent classes; cores and memory; 30 of 150 slow frames → lite, 29 → unchanged; `auto`
  clears both keys; the ES5 copy in `boot.js` gives the same answers.
- `boot/boot.test.ts` (jsdom): engine probe false → screen; language matrix; source stripping keeps `:line:col`
  and drops `?…#…`; nothing posted without launch data; `show()` is idempotent; the file parses as ES5.
- `session/route.test.ts`: cookie attributes (`HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`, expiry);
  foreign `Origin` → 403; body over 4 KB → 400; API `401` / `403` / `500` mapping; `GET` with cookie, bearer,
  neither; no body or header in any log call.
- `session/bootstrap.test.ts`: fast path with a matching cookie; another Telegram user → sign-in again; cookie
  mode drops the token; header mode keeps it in memory and writes it nowhere (spies on every storage API and on
  `history`); `401` → one re-authentication shared by parallel callers; refused re-authentication → `expired`.
- `navigation/history.test.ts`: push, back, replace, tab reset; `closeThen` at depth 1 and 0; `useLayerState`
  open and close; direct load of `/filters?from=map` → Back target `/map` with the search state.
- `deeplinks/parse.test.ts`: `l_123` share; `l_123-web`; `l_123-fb12`; `l_123-ig12345` → share;
  `l_123-seo-example_channel-45` → seo + post address; `l_abc`, `l_0`, a 17-digit number → no listing; both
  `start_param` and `?listing=` → `start_param`; `?news=Pets!` ignored.
- `deeplinks/build.test.ts`: each builder; invalid usernames; payload over 64 characters → `null`.
- `security/csp.test.ts`: directive builder per environment; development adds `'unsafe-eval'`; host parsing.

**End to end (Playwright with the fake Telegram, cookie mode and header mode).**

- `launch.spec.ts`: launch → ready; `start_param=l_42-web` → listing placeholder over the feed, Back → feed;
  `?listing=7`; `?news=pets` → filters placeholder with `focus=pets`; the fragment is gone from the address after
  launch and after Back; an `uz` Telegram user lands on `/uz` before sign-in, and the stub user's `me.locale` (`ru`)
  wins after it. The session status is read from `html[data-session]`; the placeholders link to the next addresses
  through the counted `Link`.
- `session.spec.ts`: cookie mode — one `Set-Cookie` with the attributes, no token in `localStorage`,
  `sessionStorage` or the address; header mode (the test strips `Set-Cookie`) — requests carry the bearer header;
  an intercepted `401` then a successful sign-in is invisible to the user; a refused sign-in shows the expired
  state.
- `back.spec.ts`: BackButton hidden on each root tab; sheet → Back; listing → photos → Back → Back; direct load
  of a sheet address → Back to the parent; SettingsButton from an open sheet leaves no layer; version 6.0 has no
  SettingsButton.
- `boot-failure.spec.ts`: blocked app chunk → update screen in the launch language; error before mount → screen;
  blocked `telegram.org` → app starts within 3 s plus margin.
- `csp.spec.ts`: no `securitypolicyviolation` across launch, navigation and a placeholder with an image; an
  injected inline script without the nonce is blocked.

## Acceptance checklist

Run in ru, uz and en and in light and dark; lines marked (T) also inside Telegram on staging and production.

- [ ] The choice of step 1 is recorded in the ADR and in "Handoff".
- [ ] (T) The app opens from the bot's Mini App address on iOS, Android, Desktop and Web; the session mode each
      client got is noted in the PR.
- [ ] An engine below the floor shows «Обновите Telegram» in the launch language with both buttons working.
- [ ] A failed app script and an early crash show the same screen; a blocked SDK host does not.
- [ ] (T) The first frame has the right theme for an explicit choice; auto follows Telegram and `themeChanged`.
- [ ] (T) Header and background colours follow the theme table.
- [ ] (T) Fullscreen is requested on mobile only; vertical swipes do not close the app.
- [ ] Lite mode is applied before paint on a low-end Android profile and never on iOS.
- [ ] The launch fragment is removed from the address after the SDK wait and before any analytics call.
- [ ] Cookie mode: `homi_session` is `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`; the token is nowhere
      else.
- [ ] Header mode: the app works with the cookie refused; the token exists only in memory.
- [ ] A second launch with a valid cookie of the same user renders content without a sign-in request.
- [ ] A different Telegram user on the same device gets a new session, never the old user's data.
- [ ] An expired token is renewed silently; refused launch data shows the session-expired state (fix of
      LB-APP-047).
- [ ] (T) BackButton is hidden on root tabs and closes layers in the legacy order everywhere else.
- [ ] (T) SettingsButton opens settings and leaves no sheet or overlay (fix of LB-APP-046); absent below 7.0.
- [ ] `l_<number>` and `?listing=` open the listing over the feed; Back returns to the feed.
- [ ] `?news=pets` opens the filters address with `focus=pets`; a listing link wins over it.
- [ ] Every row of the adapter table has a passing unit test, including its outside-Telegram fallback.
- [ ] A location request never hangs longer than 12 s (fix of LB-APP-009).
- [ ] Only restored keys are mirrored to DeviceStorage, and restore finishes before the first data request (fixes
      of LB-APP-012 and LB-APP-021).
- [ ] With `dev020OneLanguageDetector` off an English Telegram user sees Russian before sign-in; with it on,
      English (test).
- [ ] The emulator runs the app on `https://app.homi.loc` in a desktop browser; its dev bar drives Back and
      Settings; a production build contains no emulator file or marker.
- [ ] The CSP is enforced with zero violations on the flows above; framing works in Telegram Web and is refused
      elsewhere.
- [ ] No `initData`, token or coordinate appears in any log line, report or storage API (unit spies and a manual
      look at the staging logs).

## Handoff

- **Step 1 (2026-11-15): option (a)** — nonce and `'strict-dynamic'`, every document rendered at request time: the
  root layout reads `x-nonce` with `headers()` outside `<Suspense>` and exports `instant = false`. Measured on a
  production build: with the static shell no script tag carries the nonce (23 of 23 blocked); with the request-time
  layout all 31 carry it and nothing is blocked. Recorded in ADR-0020 (amends ADR-0018; a shared file, so it travels
  in its own small PR). Side effect: an unknown address answers `200` with the not-found screen and `noindex`
  (AM-57).
- **Steps 2–10 are done** on `feat/wp-21-telegram-and-session`, tests first, mutation-checked: the adapter `tg` with
  every row of the table, storage and graphics, the boot script and the update screen, the fake Telegram, `launchApp`
  and the emulator, the session route and bootstrap, navigation with BackButton and SettingsButton, launch links and
  the locale guard, the CSP. `make ci-frontend` and the Playwright `miniapp` project pass locally (numbers in the PR).
- **Corrections made in this specification (rule 6):** the SDK tag inserted by the boot script (React 19 hoists an
  `async` script above the inline ones); the emulator before the boot script; `boot/stubs.js`; the bot name through
  `data-bot`; ES5 linting with `espree`; `homi_session_user` and the `user` of `GET`; the restore after the SDK wait;
  `prepared` and the wait of `LocaleGuard`; `FragmentGuard` and the `null` state of the scrub; the two-phase launch
  redirect; the counted navigation in a client module plus `NavigationBinder`; `clipboard-write`, no
  `browsing-topics`; the default frame ancestor; the cookie on `http://localhost`; the `uz` launch case.
- **Decisions of the implementation** (no ADR): `Me` is typed by hand in `lib/session/types.ts` with a test against
  `docs/api/openapi.json`, because adding `@homi/types` to the app needs a lockfile change (WP-22 switches);
  `app_launch` sends `v` = `NEXT_PUBLIC_APP_VERSION` (empty until WP-32), `sdk` = the outcome of the SDK wait and
  `js` = the time the bootstrap module was evaluated; the e2e specs read the session from `html[data-session]` and
  follow the placeholders' links; outside production the stub-scenario cookie is not forwarded yet (WP-22).
- **Shared files** travel separately: ADR-0020 with its index row, and the server-only keys of
  `frontend/app/.env.example` (`API_URL`, `CSP_FRAME_ANCESTORS`, `CSP_TILE_HOSTS`, `CSP_ANALYTICS_HOSTS`,
  `CSP_REPORT_ONLY`). `.github/workflows/frontend-e2e.yml` (the API on stubs) and `frontend/playwright.config.ts`
  (`webServer.env`) are in the package PR and announced there.
- **Steps 11–12 wait for the production track** (first developer's consent): the request below, the deploy to
  staging in report-only mode, the checks inside Telegram on iOS, Android, Desktop and Web with the session mode each
  client got, then enforcing the policy and the same check on production. The (T) lines of the checklist and the
  framing line stay open until then.
- **Request to the production track:** (1) the app vhosts stop sending `X-Frame-Options`; (2) documents of the app are
  not cached by nginx, `Set-Cookie` passes, and `Host` reaches the app (the session route compares `Origin` with it);
  (3) the app's server environment on staging and production: `API_URL`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`,
  `CSP_FRAME_ANCESTORS` (Telegram Web origins, Q-SEC-012; empty means `https://web.telegram.org`), `CSP_TILE_HOSTS`,
  `CSP_ANALYTICS_HOSTS`, `CSP_REPORT_ONLY=1` for the first deploy; (4) the Mini App address of each environment
  attached to its bot (DEC-45).
- **For the next packages:** WP-22 calls `reauthenticate()` on `unauthorized`, takes the token from `getAuth()`, and
  reads the cookie server-side with `getSessionToken()` inside `<Suspense>`; WP-23 renders the gates from
  `useSession()` (`outside`, `denied` with `reason`, `expired`, `booting` with `error` and `retry()`), registers its
  launch gate with `setLaunchGate` / `releaseLaunchGate`, and calls `patchMe` after a saved setting; WP-24 calls
  `measureScrollPerformance()` on the first scroll; WP-26 adds the call-page host to `LINK_HOSTS`, WP-27 the map
  attribution hosts and the tile hosts of `CSP_TILE_HOSTS`; WP-32 sets `__homiBoot.watching` and the boot-error
  route.
