# WP-33 — Frontend acceptance on stubs

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (parts 1 to 4 merged in #111, #112, #113 and #121; the five runs on `main`, the manual run of DEC-103 and steps 14 to 17 remain: see "Handoff") |
| Depends on | WP-24 … WP-32, WP-34 … WP-39 (WP-39 *added by the intake of `index-YX9bFVws.js`*), WP-80 … WP-83 (*added by the owner-cabinet plan*) |
| Size | ≈ 2 600 changed lines (specs, fixtures, check scripts, the pass record; product code only as fixes), L |
| Behaviour reference | `25` §9 (acceptance, test layers, definition of done), §14; `24` §8.3 (RK-27, RK-30, RK-31); `03` §2, §4, §5, §5b and `data/screens.json`; `05` §1, §3.2; the specifications WP-20 … WP-32; task files KV-FE-170 (suite shape, fake Telegram, version matrix), KV-FE-173 (budgets), KV-FE-174 and KV-QA-022 (device pass) — test ideas and constants only. KV-FE-171 (pixel comparison with legacy) and KV-FE-172 (request comparison with the legacy client) are not carried: DEC-46 asks for functional parity and no legacy client ever talks to HOMI |
| Needs from the production track | (1) Deploy of the merged stage B to staging and to production. (2) The Mini App address attached to the staging bot and the production bot, so the app opens inside Telegram on both. (3) The app vhosts without `X-Frame-Options`, so Telegram Web can frame the app (Q-SEC-012, requested by WP-21). (4) `NEXT_PUBLIC_APP_ENV=staging` on staging (the stub scenario cookie and the gallery work there, not on production). (5) The PostHog keys of WP-32 on staging. (6) One test account per client for the pass |

## Goal

The whole Mini App, still answering from stubs, is proven before the API work starts: one Playwright suite runs
every scenario in cookie mode and in header mode; the consolidated checklist of all 48 screens is ticked and
signed; the app has been used inside Telegram on iOS, Android, Desktop and Web on staging and on production; a
performance budget and a bundle check guard every later merge. Every screen, rule, defect and Telegram point of
the audit is traced to the package that owns it.

## Scope

**In.**

- The Playwright project matrix, the session-mode fixture, stub scenarios, tags and annotations.
- Completing and de-flaking the specs written by WP-20 … WP-32; the cross-feature journeys; route, render,
  version-gate and brand passes.
- The coverage script (screens without a spec) and the coverage tables of this file.
- The consolidated functional checklist and its signing; the pass inside Telegram and its record.
- The performance budget with its measurements; the bundle check; their CI steps.
- Fixes of defects the acceptance finds, when small; a larger one goes back to the owning package's branch and
  specification (queue rule 6).

**Out.**

- New screens or behaviour — the owning packages. API code — stage C. The bot — stage D.
- Comparison with legacy pixels or legacy requests (see "Behaviour reference").
- Security review, load and field performance, monitoring — WP-70 and WP-71.
- The second run of this checklist on real sources — WP-48.

## Decisions that bind this package

| Topic | Source | Consequence here |
| ----- | ------ | ---------------- |
| Proof of parity | DEC-46, `25` §9, RK-31 | Acceptance is the written checklist per screen, ticked in the PR with staging screenshots and signed by the reviewer. A difference is accepted only as a defect fix or a visual detail |
| Process | DEC-45 | Checks inside Telegram happen on staging and then on production after the deploy; there is no tunnel to a developer machine |
| Session modes | DEC-44, `25` §3.4, RK-30 | Every end-to-end scenario runs in cookie mode and in header mode; the pass on Telegram Web records which mode each browser ended in |
| Defects and flags | DEC-36, `09` §4.2–§4.3 | The 37 defects without a flag are checked as fixed — LB-APP-026 among them, settled by DEC-54, and LB-APP-048 … LB-APP-050 of the pinned release; the 13 with a flag are checked in their legacy form, with the flagged branch proven below the end-to-end layer. The flags are off on `main`, except the five that legacy adopted in `index-CIa0Ldj2.js`, which are on by default and whose "legacy form" is therefore the flag on (DEC-58 amends DEC-36; WP-34 and WP-35 split three flags in two, so `lib/flags.ts` holds 20 after them; *added by the intake of `index-CIa0Ldj2.js`*). LB-APP-051 and LB-APP-052 of legacy release `index-BnFvC-Ft.js` are fixed too; LB-APP-053 is kept as legacy until it is decided |
| Decided behaviour changes | DEC-51 … DEC-54, DEC-57, DEC-67 | Six differences from legacy are behaviour of the build, not flags, and are checked as such: «Смотрели» is re-created once on the return after a listing was opened (DEC-67, DEV-053; legacy stopped doing so in `index-CBlEKxdL.js`); the card-style row has no «Новое» pill (DEC-57); radars are switched off on staging and production until WP-57 and the app says "soon" and offers no radar anywhere — no follow nudge, no return banner (SCR-046), no radar card in the search list (SCR-047); the author's number appears only after a tap; favourites and history load 20 at a time; the whole city reads «{city} целиком» |
| No legacy access | DEC-33 | The suite, CI and the pass never reach legacy; `@homi/testing` blocks external hosts |
| Stubs and the marker | `25` §4.4, RK-27 | Stub answers are deterministic and mutations do not persist: assertions target what the interface does, never stored state. The demo-data marker is asserted on every stub-backed screen |
| Scope of the wave | DEC-43 | The access gate is open, so the no-access screen is accepted on stubs only |
| Test layers | `25` §9 | Unit and component tests stay with their packages; this package owns the end-to-end layer and the "in Telegram" layer |

## Design

Read before coding, under `frontend/app/node_modules/next/dist/docs/01-app/`: `02-guides/testing/playwright.md`
(run against the production build; `webServer`), `02-guides/testing/vitest.md` (Vitest does not support `async`
Server Components — server-rendered paths are proven here, in cookie mode), `02-guides/preserving-ui-state.md`
("Testing": a route that was left stays in the document, hidden), `02-guides/package-bundling.md`
(`next analyze --output`), `02-guides/production-checklist.md`, `02-guides/content-security-policy.md`.

### Environment

- The suite runs against the production build of the app (`pnpm --filter app build && pnpm --filter app start`,
  as WP-03 configured) and the Laravel API with every source on `stub`.
- CI (`.github/workflows/frontend-e2e.yml`): the API service — PHP dependencies, migration on SQLite, the API on
  a free local port with PHP's built-in server, the app built and started with `NEXT_PUBLIC_APP_ENV=ci` — exists
  since WP-21, whose specs already needed it. This package adds `php artisan sources:publish-stub-media` before
  the build, WebKit, the manual run (`workflow_dispatch`, no schedule: DEC-100) and the check steps. The built-in
  server is for CI only; on a
  developer machine the suite runs against `https://app.homi.loc` through `E2E_BASE_URL` after `make dev-start`.
- Whether each engine accepts a `Secure`, `Partitioned` cookie on `http://localhost` is **verify before use**; if
  one does not, CI terminates TLS with a throwaway certificate and the projects set `ignoreHTTPSErrors`.
- Locators: `preserving-ui-state.md` says hidden routes stay in the document and that role-based locators skip
  them. Rule for every spec: `getByRole`, `getByLabel` or a locator filtered by `visible: true`; never a bare CSS
  locator with `.first()`.
- The `instant()` helper of `@next/playwright` named in the bundled guide is not used; adding it would be a
  dependency change.

### Projects (`frontend/playwright.config.ts`)

The `miniapp` project of WP-03 is replaced by:

| Project | Engine, viewport | Session mode | Telegram profile | Runs |
| ------- | ---------------- | ------------ | ---------------- | ---- |
| `miniapp-cookie` | Chromium, 390 × 844, touch | cookie | `android`, current version | every spec |
| `miniapp-header` | Chromium, 390 × 844, touch | header | `weba`, current version | every spec |
| `miniapp-ios` | WebKit, 390 × 844, touch | cookie | `ios`, current version | `@smoke`, `@gesture` (swipe-back exists off Android only) |
| `miniapp-desktop` | Chromium, 420 × 720, mouse | cookie | `tdesktop`, current version | `@smoke` |
| `miniapp-old` | Chromium, 390 × 844 | cookie | `android`, version 6.0 | `@gates` |
| `miniapp-locales` | Chromium, 390 × 844 | cookie | `android`; addresses in `uz` and `en` | `@render` |
| `miniapp-dark` | Chromium, 390 × 844, dark scheme | cookie | `android`, dark theme | `@render` |
| `analytics` | Chromium (build with a fake PostHog key, WP-32) | both | `android` | `analytics.spec.ts` |
| `perf` | Chromium, CPU × 4, slow 4G | cookie | `android` | the `@perf` tests of `e2e/perf/`, in the manual run (DEC-100) |

Pull requests run `miniapp-cookie` and `miniapp-header` (DEC-101). A test about the modes loops over both and names
its mode in the title; both copies run in `miniapp-cookie`, and `miniapp-header` runs every test that names no mode.
Every other project runs in the manual run before a pass (`workflow_dispatch` with `E2E_FULL=1`, no schedule:
DEC-100). The full cross product of locale, theme and mode is done by people, on the checklist (*changed by DEC-100
and DEC-101, 2026-11-22*).

### Session-mode fixture (`e2e/support/modes.ts`)

- `launchApp(page, { mode, … })` of `@homi/testing` (WP-21). Header mode is forced the way WP-21's own spec does
  it: a route handler on `**/bff/session` fetches the real answer and fulfils it without `Set-Cookie`.
- Checked after every test, by the fixture, not by the spec author:

| Mode | Assertions |
| ---- | ---------- |
| cookie | the context holds `homi_session` with `httpOnly`, `secure`, `sameSite: None` and a partition key (how Playwright exposes the partition is **verify before use**); no request to `/bff/` carries `Authorization` |
| header | no `homi_session` cookie; every request to `/bff/` carries `Authorization: Bearer`; the token value is absent from `localStorage`, `sessionStorage`, DeviceStorage calls of the fake and every address the page visited |
| both | no request left the app's own origin except photo and tile hosts of the fixtures; no `securitypolicyviolation` event; no console error; no missing-message report |

### Stub scenarios (`@homi/testing` `scenarios.ts`, `e2e/support/scenarios.ts`)

Stubs are deterministic, so every state that is not the default answer needs a switch. WP-10 provides it: the
header `X-Stub-Scenario: <name>`, read only by the stub driver, and it leaves the cookie name to stage B.

- Cookie `homi_stub_scenario`, built by WP-22: `lib/api/server.ts`, the pass-through of
  `app/bff/[...path]/route.ts`, `bff/session` and the Server Actions (`runAction`) copy its value into
  `X-Stub-Scenario` when `NEXT_PUBLIC_APP_ENV` is not `production`. This package checks that all four paths
  forward it, and the bundle check proves the forwarding is absent from a production build.
- `setScenario(page, name | null)` and `withScenario(page, name, fn)` set and clear the cookie. A scenario is
  switched right before the action that needs it, because one name applies to every stub method that knows it.
- Faking an answer with `page.route` works only for requests the browser sends itself (`/bff/*`); in cookie mode
  pages and Server Actions fetch on the server. Specs of earlier packages that fake answers this way are moved to
  scenarios here, so that they run in both modes. Interception stays for `POST /bff/session` and for PostHog.

| # | State | Reached by | Layer |
| - | ----- | ---------- | ----- |
| 1 | Access refused, each of the six reasons | `access_private`, `access_invite`, `access_full`, `access_blocked`, `access_join`, `access_paused` (WP-11; `paused` since `index-CIa0Ldj2.js`, DEC-60) | end to end; not inside Telegram while the gate is open |
| 2 | First launch; city not chosen; Uzbek profile with UZS | `first_launch`, `no_city`, `uz` | end to end |
| 3 | Launch data too old | `auth_expired` on sign-in | end to end |
| 4 | Token rejected in the middle of use | reserved `unauthenticated`, set after launch and cleared after the first rejection | end to end |
| 5 | Listing source down | reserved `source_unavailable`; listing number `999503` | end to end |
| 6 | Refusal inside a list; rate limit | reserved `forbidden`, `rate_limited` | end to end |
| 7 | Empty feed; few results; failing second page | `empty`, `few`, `page2_error` (WP-12) | end to end |
| 8 | Listing not found; merged duplicate; withdrawn listing | numbers `999404`, `100016`, `100015` | end to end |
| 9 | Translation failure; share failure | `translation_unavailable`, `share_failed` | end to end |
| 10 | Empty favourites, history, hidden list, radar list | `empty` (WP-13) | end to end |
| 11 | Radar writes: no chat, limit, duplicate, already on, starter cards, few with options, survey trigger | `no_chat`, `radar_limit`, `radar_duplicate`, `existing`, `starter`, `few`, `ask_found` (WP-13). WP-13 has no scenario for a create answered `reactivated`: «Радар снова включён» is reached by subscribing with the filters of the paused fixture radar (the client's own path, WP-30); the `kind: reactivated` answer is a unit test | end to end |
| 12 | City without daily rent | `no_daily` | end to end |
| 13 | A failing save (favourite, hide, block, report, settings, clear history) | reserved `source_unavailable`, set right before the tap | end to end |
| 14 | Offline | `context.setOffline(true)` | end to end |
| 15 | Telegram's answers: write access yes / no, confirm, location granted / denied / silent, home-screen status, stale share window | options of the fake Telegram | end to end |
| 16 | Old Telegram client | project `miniapp-old` | end to end |
| 17 | Bundle cannot start | the test aborts an app chunk | end to end |
| 18 | GL engine and Leaflet engine | headless Chromium falls to Leaflet by the legacy rule; `?map=gl` forces GL (WP-27) | end to end |
| 19 | Radars switched off on the server | not a scenario: the API's env value `RADAR_CREATION_ENABLED=false`, in the workflow step that runs the specs tagged `@radars-off` against a rebuilt app (WP-30). The cached reference call never forwards the scenario cookie | end to end |
| 20 | A second page of favourites and of history | the default fixtures of WP-13, 25 entries each | end to end |
| 21 | Return banner: a previous visit 7 h back; nothing new; one new; a visit too recent | `homi-visits` (and `homi-nudge`) seeded in local storage before launch; `new_none`, `new_one` and the default answer of `GET /listings/new` (WP-12) | end to end |
| 22 | Radar card in the search list after the 8th card and after a short list; snoozed | the default feed; `few` with custom filters; `homi-nudge.feedOff` seeded | end to end |

States that can be checked only below the end-to-end layer (they are listed in the PR with the test that covers
each): the 15 s request timeout; the scroll measurement that turns lite mode on; an engine truly below the floor
(the boot script is unit-tested; a real old device is tried in the pass if one exists); pinch zoom and the
two-finger cancel of the lasso; Android `tel:` detection; the DeviceStorage restore race; visit days around
midnight in Tashkent; an absent flow answer and a radar save answer without options (fixtures are always
complete); unknown server values for verdict tone, nearby kind, comparison rooms, radar mode and housing type;
every flagged branch; a `GET /listings/new` answer without a positive integer `count` (the contract never sends
one, LB-APP-048) and a nudge dropped before its first render (LB-APP-050). Persistence of any save is not checkable on stubs at all — it is proven by the API tests of
stage C and by the second run in WP-48.

### Specs

Existing specs keep their files and owners: `smoke`, `foundation`, `launch`, `session`, `back`, `boot-failure`,
`csp`, `gates`, `shell`, `crash`, `feed`, `filters`, `city`, `listing-open`, `listing-contact`, `listing-actions`,
`photo-viewer`, `map`, `map-leaflet`, `map-lasso`, `spot-map`, `saved`, `radars`, `radar-subscribe`, `radar-forms`,
`follow-nudge`, `return-nudge`, `feed-radar`, `radars-soon`, `settings`, `settings-language`, `settings-hidden`, `home-nudge`, `journal`,
`errors`, `analytics` (plus those of WP-22). This package adds tags (`@smoke`, `@gesture`, `@gates`, `@render`;
`@radars-off` exists since WP-30 and stays excluded from the default projects), the screen annotation, and what
is missing against the checklists of the owning specifications.

New journeys (`e2e/journeys/`), each in both modes:

| # | File | Path through the app | Key assertions |
| - | ---- | -------------------- | -------------- |
| 1 | `first-launch.spec.ts` | `first_launch`, Telegram language `uz` → language page → pick `en` → city page → pick a city → feed | headings in the Telegram language; the address moves to `/en/…` without a document load; one settings Server Action request per pick (the `PATCH /settings` bodies are sent by the server and belong to the unit tests of `updateSettings`); the gates do not come back in this launch although the stub still answers "not chosen"; BackButton hidden on the feed |
| 2 | `deep-link.spec.ts` | `startParam: 'l_<number>'`; `?listing=`; `?news=pets`; direct load of a listing address | listing over the feed, Back → feed, then no BackButton; `app_launch` and `app_opened` with `entry: 'link'`; filters open on the pets section with «Новое»; a directly loaded layer goes back to its parent |
| 3 | `search-to-radar.spec.ts` | feed → filters (rooms, price) → «Показать N» → map → lasso → «Своя область» → filters footer «Включить радар» → «Радар» tab → radar sheet → «Изменить условия» → save → switch off with `ask_found` → survey → «Ещё ищу» | the same search parameters on feed and map; chips and collapsed title follow the filters; each toast text; Back order editor → sheet → tab; the survey toast |
| 4 | `moderation.spec.ts` | listing → «⋯» → hide → «Вернуть»; block author; report fraud; report rented; settings → «Скрытое» → return one → «Показать всё снова» | card leaves and returns; toasts with and without undo; the rented report offers «Вернуть», which withdraws it (`dev051RentedUndo` is on by default since DEC-58; *corrected by WP-33 part 3*); confirm before returning all; «Ничего не скрыто» |
| 5 | `locale-currency.spec.ts` | settings → language `uz` → currency UZS (`uz` scenario) → feed → listing | address segment changes, no reload (a value set on `window` survives); tab labels in Uzbek; numbers with a space as thousands separator; amounts the client formats (price presets, market scale) in сум — the stub's server-formatted card prices stay as the fixture has them and are checked in WP-48 |
| 6 | `session-expiry.spec.ts` | launch → `unauthenticated` → any request → then `auth_expired` on the next sign-in | one silent `POST /bff/session`, the request repeats, the screen continues; then the session-expired screen, «Закрыть» calls the fake `close`, no further request, no BackButton |
| 7 | `source-unavailable.spec.ts` | `source_unavailable` on feed, map, listing, live count, a save | «Не загрузилось» with «Повторить» and recovery; the map error state; the count label keeps its last value; a failed save plays the error haptic, shows «Не получилось сохранить» and rolls back (`dev016ErrorToastOnFailure` is on by default since DEC-58; *corrected by WP-33 part 2*) |
| 8 | `demo-marker.spec.ts` | every address of the route tree | marker visible wherever an answer has `meta.source = stub`; absent on `/outside`; absent when the answers of a screen are fulfilled with `meta.source = native` (header mode) |

Passes over all addresses (`e2e/coverage/`):

- `routes.spec.ts`: each layer address opened over its base and loaded directly; Back closes in the order sheet,
  overlay, screen; a direct load goes back to `parentOf`; a tab press resets the depth; the SettingsButton from a
  listing with a sheet open lands on settings with both slots empty.
- `render.spec.ts` (`@render`): each address in the project's locale and theme shows no raw key path, reports no
  missing message, shows no legacy brand word and keeps the bottom bar inside the viewport.
- `version-gates.spec.ts` (`@gates`): at 6.0 the app starts; no SettingsButton call; confirms fall back to the
  browser dialog; no fullscreen, write-access, prepared-share, home-screen, LocationManager or DeviceStorage call
  appears in the fake's log; sharing uses the link; location uses the browser; the home nudge never shows.
- `brand.spec.ts`: the served HTML and every loaded message bundle, in three locales, contain no `kvadro`.

Every test carries an annotation `{ type: 'screen', description: '<screen identifier>' }` for each screen it
proves. `frontend/app/scripts/e2e-coverage.mjs` reads `docs/migration/data/screens.json` and the annotations of
`playwright test --list --reporter=json`, and fails when a screen has no test.

### Performance budget

Numbers are proposals. The first measured value on the merged stage B is recorded in
`frontend/app/perf-budgets.json` with 10 % headroom and becomes the limit; the PR states each value and its date.

| # | Budget | Proposed limit | How it is measured |
| - | ------ | -------------- | ------------------ |
| 1 | JavaScript requested until the feed works — the first card visible and the session ready —, session present | 170 KB compressed (the figure of the earlier plan, `10` §5.12; replace with the measured one) | `perf/startup.spec.ts`: sum of the compressed bodies of the app's script responses sent up to that moment, on a throttled relaunch |
| 2 | The same until the first card on a first launch (shell, sign-in, refresh) | measured value + 10 % | same spec, empty context |
| 3 | Map code before the map is opened or warmed up | 0 bytes of MapLibre, Leaflet, PMTiles, supercluster, protomaps and the MapLibre worker | `perf/chunks.spec.ts`: a script response holds a package when its body holds that package's marker string (`e2e/support/perf.ts`); none may be sent within 2 s of the feed's first card |
| 4 | PostHog code before first content + 0.5 s, and at all without a key | 0 bytes | same technique: without a key, none within 9.5 s of the session; with a key (the analytics run), none sent before the first card photo's `load` + 0.5 s by the page's resource timing |
| 5 | Photo viewer, filters form, radar forms, settings pages on the feed's first load | not requested | same technique, within 2 s of the first card |
| 6 | Messages of other locales | not sent | `perf/chunks.spec.ts`: the bodies of a launch in ru, uz and en hold their own locale's marker string and no other's |
| 7 | First card photo loaded, throttled profile, p75 of 20 runs | measured value + 20 % | `perf/startup.spec.ts`, project `perf`: the photo's `load` after a throttled relaunch with a session |
| 8 | Largest Contentful Paint on the feed, same profile, p75 | 2.5 s, to be confirmed by the first run | same relaunches: `PerformanceObserver` in the page |
| 9 | Frames over 28 ms while scrolling the whole stub feed (45 cards, three pages), CPU × 4, full graphics | under 20 % (the share at which the app itself would switch to lite, `03` §1.7) | `perf/scroll.spec.ts`: frame intervals sampled in the page while touch gestures run |
| 10 | Second opening of the map | no map chunk requested again | `perf/chunks.spec.ts`, project `perf`: the script log of the second opening |

`frontend/app/scripts/check-budgets.mjs` compares what a run wrote to `test-results/perf/` with
`perf-budgets.json`, right after that run. Rows 3–6 run on every pull request (they need no throttling), in both
session modes; rows 1, 2, 7–10 in the manual run (DEC-100), and row 4 with a key in the analytics run (*rows 1, 3,
4, 6, 9 and 10 made concrete by part 4, 2026-11-23: see "As built"*).

### Bundle check (`frontend/app/scripts/check-bundle.mjs`)

Run in CI on a build made with `NEXT_PUBLIC_APP_ENV=production`, over `.next/static/` and the prerendered output:

| # | Must be absent | Why |
| - | -------------- | --- |
| 1 | `public/__dev/telegram-emulator.js` and the string `homi-dev-initData` | development emulator (WP-21) |
| 2 | any module of `@homi/testing` (its marker string) | test doubles |
| 3 | the gallery of WP-23 (`/dev/ui`): its marker string in any chunk; the address answers 404 | development page |
| 4 | the cookie name `homi_stub_scenario` and the header name `X-Stub-Scenario` — this row also over `.next/server/`, because the forwarding is server code | scenario forwarding is non-production |
| 5 | every key of `frontend/app/.env.example` without the `NEXT_PUBLIC_` prefix, and the values those keys have in the job | server-only configuration |
| 6 | the strings `LEGACY_` and `SERVICE_KEY` | the legacy key never reaches the frontend (DEC-33) |
| 7 | `kvadro`, case-insensitive | brand layer (`25` §2 rule 5) |
| 8 | `*.map` files under `.next/static/` | no public source maps |

And two source checks: every server module (`lib/api/server.ts`, `lib/session/server.ts`, the server loaders of
`lib/reference/`) starts with `import 'server-only'`; `window.Telegram` appears only in `lib/telegram/sdk.ts`,
`boot/` and `dev/`.

### Pass inside Telegram

Recorded in `docs/testing/wave-1-telegram-pass.md` (new) and as one row per run in
`docs/testing/verification-log.md`. Staging first; production after the same commit is deployed there.

| Client | Device | Expected mode | Notes |
| ------ | ------ | ------------- | ----- |
| Telegram iOS, current | a phone with a notch | cookie | fullscreen, safe areas, swipe-back |
| Telegram Android, current | a mid-range phone; a low-end one if available | cookie | hardware Back, `tel:`, lite mode by itself on the low-end phone |
| Telegram Desktop | macOS or Windows | cookie | mouse, window resize, no fullscreen request |
| Telegram Web | Chrome, Safari, Firefox | recorded per browser | once more in each with cookies blocked for the app host, which must give header mode |

How the mode is recognised: the `session_mode` property on PostHog's live events of the staging project (WP-32),
for every client; on Telegram Web also the browser's tools (the cookie list, the `Authorization` header on
`/bff/*`). Production is checked the same way once its PostHog key exists; until then Web only.

Checked by hand because no automation can see it: haptics on taps, results and gestures; fullscreen and the
position of the collapsed title; safe areas at the top and bottom; the native BackButton and SettingsButton and
Android's hardware Back in the order sheet, overlay, screen; drag-to-close with a flick; pull-to-refresh with
vertical swipes off; pinch and double tap in the photo viewer; drawing an area with one finger and moving the map
with two; the theme following Telegram while the app is open; the keyboard over the price fields; the system
sheets (location permission, link hand-off, the home-screen dialog, the share picker's fallback link); the
«Обновите Telegram» screen on an old device if one exists.

Not reachable inside Telegram while the answers are stubs — accepted in the suite now, done by hand in WP-48: the
no-access screen (gate open, DEC-43); the write-access prompt after `no_chat` and the restart-bot confirm; the
radar limit; the prepared-message share window and a real call page; a session that expires by age. On staging a
tester on Telegram Web may set `homi_stub_scenario` in the browser to see these; on production nothing can.

Not reachable inside Telegram at all in this package: the radar screens beyond their "soon" state and the three
nudges and cards that offer a radar. Staging and production keep radars switched off until WP-57 (DEC-51), and the
switch is not a stub scenario. Rows 26 … 31, 40, 46 and 47 of the screen table are therefore proven by the suite
and on the local stack here, the "soon" state is checked inside
Telegram, and the full radar pass inside Telegram is part of WP-57.

Evidence for the PR: the filled record (date, client and version, device, system, mode, pass or fail per row of
the checklist, notes), one screenshot per screen group and client, and a screen recording of the Back order on iOS
and Android. Test accounts only; no real user's data in any capture.

## Files

New:

- `frontend/app/e2e/journeys/{first-launch,deep-link,search-to-radar,moderation}.spec.ts`,
  `frontend/app/e2e/journeys/{locale-currency,session-expiry,source-unavailable,demo-marker}.spec.ts`
- `frontend/app/e2e/coverage/{routes,render,version-gates,brand}.spec.ts`
- `frontend/app/e2e/perf/{startup,chunks,scroll}.spec.ts`
- `frontend/app/e2e/support/{modes,scenarios,annotations,pages}.ts` (`pages.ts`: the list of addresses with the
  scenario each needs, shared by the passes)
- `frontend/packages/testing/src/scenarios.ts`
- `frontend/app/scripts/{e2e-coverage,check-bundle,check-budgets}.mjs`, `frontend/app/perf-budgets.json`,
  `frontend/app/e2e/support/perf.ts`, `frontend/app/tests/scripts/checkBudgets.test.ts` (*part 4*)
- `docs/testing/wave-1-telegram-pass.md`

Changed:

- `frontend/playwright.config.ts` (projects, tags, reporters), existing `frontend/app/e2e/*.spec.ts` (tags,
  annotations, scenarios instead of interception)
- `frontend/app/lib/api/server.ts`, `frontend/app/app/bff/[...path]/route.ts`, `frontend/app/app/bff/session/route.ts`,
  `frontend/app/lib/actions/run.ts` — only where a path does not forward the scenario cookie of WP-22
- `.github/workflows/frontend-e2e.yml` (stub media, WebKit, the manual run of DEC-100, the check steps), `Makefile`
  (`e2e`, new `bundle-check`, new `perf`) — shared files: announce them in the PR as `docs/handoff/parallel-work.md` asks
- `docs/testing/verification-log.md`, `docs/migration/wave-1/README.md` (status), the specifications of owning
  packages where the acceptance corrected them
- part 4's fix: `frontend/app/features/map/MapWarmup.tsx`, `frontend/app/lib/analytics/{firstContent,posthog}.ts`,
  `frontend/app/tests/map/MapWarmup.test.tsx`, WP-27's warm-up text

## Steps

1. Read the documents listed under Design and the acceptance checklists of WP-20 … WP-32. Run the existing suite;
   list every checklist line without a test and every test that fakes an answer with `page.route`.
2. Scenario plumbing: confirm the header of WP-10 and the scenario names of WP-11 … WP-13 against the fixtures;
   confirm the cookie forwarding of WP-22 on its four paths; `setScenario`, `withScenario`; a spec that proves a
   scenario reaches a server-rendered page and a Server Action. Add a missing scenario to the contract
   specification and its fixture in this PR.
3. `e2e/support/modes.ts` with the after-test assertions; run the whole suite in both modes and fix what differs.
4. Projects and tags in `playwright.config.ts`; the API service and WebKit in the workflow.
5. Move interception-based fakes to scenarios; delete the helpers nobody uses.
6. `e2e/support/pages.ts` and `coverage/routes.spec.ts`.
7. `coverage/render.spec.ts` and `coverage/brand.spec.ts` in the two render projects.
8. `coverage/version-gates.spec.ts` in `miniapp-old`.
9. Journeys 1 to 8, one commit each.
10. Screen annotations on every test; `e2e-coverage.mjs`; its CI step.
11. De-flake: `--repeat-each=10` locally for every new or changed spec; no `test.fixme`, no retry above 1 in CI.
12. `check-bundle.mjs` with the production-environment build; its CI step and `make bundle-check`.
13. `perf` specs; first measurement on the merged branch; write `perf-budgets.json`; `check-budgets.mjs`; the
    manual run (DEC-100).
14. Merge and deploy with the production track. Tick the screen table on staging in ru, uz and en, light and
    dark, with screenshots in the PR.
15. The pass inside Telegram on staging, then on production; fill the record and the verification log.
16. File what failed: a fix here when small, otherwise back to the owning package with its specification
    corrected. Repeat steps 14–15 for what changed.
17. Reviewer signs the checklist; set the queue status; write the handoff with the list deferred to WP-48.

## Behaviour to reproduce

Nothing new is built: the behaviour is that of the owning specifications. The tables below are the trace from the
audit to those owners; each identifier appears once. "Proved by" names the lowest layer that proves it; the
screen table under "Acceptance checklist" is the user-visible proof.

Since the intake of `index-CBlEKxdL.js` the audit also holds SCR-049 … SCR-062, BR-APP-075 … BR-APP-103,
LB-APP-054 … LB-APP-078 and TMA-046, and TMA-034 is no longer an absence in legacy; they join this checklist: the
trace rows are WP-81's (SCR-050 … SCR-056), WP-82's (SCR-049, SCR-057 … SCR-060) and WP-83's (SCR-061, SCR-062), and
TMA-034 is used since WP-81. They stand in the section "The owner cabinet" below and in "Screens of the owner
cabinet (14)" under the acceptance checklist, so the counts of the other headings stay as they are (*added by the
owner-cabinet plan*).

Since the intake of `index-CIa0Ldj2.js` the audit also holds SCR-063, BR-APP-104 … BR-APP-111, LB-APP-079 …
LB-APP-083 and TMA-047; their lines are in the specifications of WP-34 … WP-38 (for BR-APP-107 and LB-APP-079: WP-57) and join this
checklist with them.
The numbers in the headings below are unchanged (*added by the intake of `index-CIa0Ldj2.js`*).

Since the intake of `index-YX9bFVws.js` the audit also holds BR-APP-112 … BR-APP-121, LB-APP-084 … LB-APP-091 and
TMA-048; their lines are in the specifications of WP-39 (BR-APP-112, BR-APP-113, BR-APP-114, BR-APP-116,
BR-APP-117, BR-APP-118, BR-APP-121), WP-81 (BR-APP-119, BR-APP-120 and the owner form's halves of BR-APP-113 and
BR-APP-114), WP-82 (BR-APP-115, the landlord block of BR-APP-116, the request tips' leave of BR-APP-112, the fill
hints' «n из 5» of BR-APP-113, TMA-048) and WP-83 (the owner chip tip's leave of BR-APP-112) and join this checklist
with them, with
the scenarios of that release under the acceptance checklist. The numbers in the headings below are unchanged
(*added by the intake of `index-YX9bFVws.js`*).

### Rules (74)

| # | Rules | Package | Proved by |
| - | ----- | ------- | --------- |
| 1 | BR-APP-001 … BR-APP-023 | WP-22 | unit tests of `@homi/search`; visible through `filters.spec.ts` and journey 3 |
| 2 | BR-APP-029, BR-APP-031, BR-APP-044, BR-APP-060 | WP-22 | unit tests of `@homi/i18n/format` (distance, flow, money) |
| 3 | BR-APP-064 … BR-APP-066 | WP-22 | summary and title snapshots in three locales |
| 4 | BR-APP-050 | WP-21 | `launch.spec.ts`, journey 1 |
| 5 | BR-APP-054 … BR-APP-056, BR-APP-058 | WP-23 | `gates.spec.ts`, `shell.spec.ts`, nearest-city unit test |
| 6 | BR-APP-024 … BR-APP-027, BR-APP-030, BR-APP-039, BR-APP-040, BR-APP-059 | WP-24 | `feed.spec.ts`; badge, verdict and photo unit tests; the badge kinds of BR-APP-026 in the badge and card tests (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `badges.ts` and `ListingCard` for a later package (`wave-1/baseline.md`, built code behind the pin, row 1); WP-35 closed it) |
| 7 | BR-APP-057 | WP-25 | journey 2 |
| 8 | BR-APP-028, BR-APP-032 … BR-APP-038, BR-APP-068, BR-APP-069 | WP-26 | the four listing specs, journey 4 |
| 9 | BR-APP-062 | WP-27 | `map.spec.ts` |
| 10 | BR-APP-061 | WP-28 | `map-lasso.spec.ts`; polygon unit tests |
| 11 | BR-APP-067 | WP-29 | `saved.spec.ts` |
| 12 | BR-APP-041 … BR-APP-043, BR-APP-046 … BR-APP-049, BR-APP-063, BR-APP-070 … BR-APP-073 | WP-30 | the six radar and nudge specs, journey 3 |
| 13 | BR-APP-045, BR-APP-051 … BR-APP-053, BR-APP-074 | WP-31 | `settings.spec.ts`, `settings-cards.spec.ts`, `home-nudge.spec.ts`, journey 5 |

### Defects (53)

"Fixed" means fixed without a switch and checked as such. "Flagged" means both branches exist, the flag is off,
the legacy branch is what the checklist sees and the other branch is proven by a unit or component test.

| # | Defect | Short name | Package | State |
| - | ------ | ---------- | ------- | ----- |
| 1 | LB-APP-001 | mini-map initialised twice | WP-28 | fixed |
| 2 | LB-APP-002 | missing text key throws | WP-20 | fixed |
| 3 | LB-APP-003 | translation of another listing kept | WP-26 | fixed |
| 4 | LB-APP-004 | zoom handlers bound once | WP-26 | fixed |
| 5 | LB-APP-005 | failure toast after a saved radar | WP-30 | fixed |
| 6 | LB-APP-006 | nudge crash on an absent flow | WP-30 | fixed |
| 7 | LB-APP-007 | undefined switches after a city change | WP-22 | fixed |
| 8 | LB-APP-008 | blank GL map on failure | WP-27 | fixed |
| 9 | LB-APP-009 | location request without a time limit | WP-21 | fixed |
| 10 | LB-APP-010 | visit days counted in UTC | WP-31 | fixed |
| 11 | LB-APP-011 | UZS boundary and price parsing | WP-22 | fixed |
| 12 | LB-APP-012 | every key mirrored, three restored | WP-21 | fixed |
| 13 | LB-APP-013 | cluster tap with an open stack | WP-28 | fixed |
| 14 | LB-APP-014 | radar tiles without keyboard | WP-30 | fixed |
| 15 | LB-APP-015 | market sheet crash on room count | WP-26 | fixed |
| 16 | LB-APP-016 | unknown or repeated nearby kinds | WP-26 | fixed |
| 17 | LB-APP-017 | map card spinning forever | WP-27 | fixed |
| 18 | LB-APP-018 | map warm-up during render | WP-27 | fixed |
| 19 | LB-APP-019 | GL failure retried on every open | WP-27 | fixed |
| 20 | LB-APP-020 | pin labels inserted as HTML | WP-27 | fixed |
| 21 | LB-APP-021 | restored values arrive too late | WP-21 | fixed |
| 22 | LB-APP-022 | saved lists re-request a cursor | WP-29 | fixed (the cursor guard of the list hook; the lists are paged by decision, DEC-53) |
| 23 | LB-APP-023 | sort options before reference data | WP-22 | fixed |
| 24 | LB-APP-024 | map card ignores Back | WP-27 | flagged `dev013BackClosesMapCard` (DEV-013) |
| 25 | LB-APP-025 | history dates in the device zone | WP-22 | flagged `dev014TashkentDates` (DEV-014), on by default since the intake of `index-CIa0Ldj2.js` (DEC-58) |
| 26 | LB-APP-026 | «Весь Ташкент» for every city; dead keys | WP-22 | fixed by decision (DEC-54): «{city} целиком» with the city's own name, no flag; the dead keys are dropped by WP-20's importer |
| 27 | LB-APP-027 | failures that only vibrate | WP-23 | flagged `dev016ErrorToastOnFailure` (DEV-016), on by default since the intake of `index-CIa0Ldj2.js` (DEC-58) |
| 28 | LB-APP-028 | call button dead end, calls over-counted | WP-26 | fixed |
| 29 | LB-APP-029 | tenant and pets on daily rent | WP-22 | flagged (DEV-017): pets by `dev017PetsLongRentOnly`, on by default since the intake of `index-CIa0Ldj2.js` (DEC-58); tenant by `dev017TenantPetsDailyRule`, off |
| 30 | LB-APP-030 | reset leaves daily rent | WP-22 | flagged `dev018ResetKeepsDaily` (DEV-018) |
| 31 | LB-APP-031 | two distance wordings | WP-22 | flagged `dev019OneDistanceFormatter` (DEV-019) |
| 32 | LB-APP-032 | three language detectors | WP-21 | flagged `dev020OneLanguageDetector` (DEV-020) |
| 33 | LB-APP-033 | three flow wordings | WP-22 | flagged `dev021OneFlowVocabulary` (DEV-021) |
| 34 | LB-APP-034 | «Смотреть найденное · N» counts all matches | WP-30 | flagged `dev022RadarCountLabel` (DEV-022) |
| 35 | LB-APP-035 | city counts without daily rent | WP-23 | flagged `dev023CityCountsIncludeDaily` (DEV-023) |
| 36 | LB-APP-036 | three requests per radar | WP-30 | fixed |
| 37 | LB-APP-037 | layers without a screen name | WP-32 | fixed |
| 38 | LB-APP-038 | reset offered with nothing to reset | WP-24 | flagged `dev024ResetOnlyWithActiveFilters` (DEV-024) |
| 39 | LB-APP-039 | unknown verdict reads as pricier | WP-24 | fixed |
| 40 | LB-APP-040 | home offer used up unseen | WP-31 | fixed |
| 41 | LB-APP-041 | reload on language or currency | WP-31 | fixed |
| 42 | LB-APP-042 | owner chip looks applied | WP-24 | fixed |
| 43 | LB-APP-043 | inverted ranges accepted | WP-22 | flagged `dev025ValidateRanges` (DEV-025) |
| 44 | LB-APP-044 | map without loading, empty, error states | WP-27 | fixed |
| 45 | LB-APP-045 | refusal inside the feed shows a retry | WP-22 | flagged `dev001AnyForbiddenShowsAccess` (DEV-001) |
| 46 | LB-APP-046 | Settings button leaves sheets open | WP-21 | fixed |
| 47 | LB-APP-047 | expired session blamed on the server | WP-21 | fixed (the screen is WP-23's) |
| 48 | LB-APP-048 | return banner crashes on an answer without `count` | WP-30 | fixed (and never sent by the contract, WP-12) |
| 49 | LB-APP-049 | return banner and home offer on screen together | WP-30 | fixed (one slot with a priority; the home half is WP-31's) |
| 50 | LB-APP-050 | nudges counted as shown before they render | WP-30 | fixed |
| 51 | LB-APP-051 | unknown card style crashes the settings | WP-31 | fixed (and refused by the contract, WP-11) |
| 52 | LB-APP-052 | sample button hangs on an answer without JSON | WP-31 | fixed (and never sent by the contract, WP-11) |
| 53 | LB-APP-053 | sample result outlives the sub-page | WP-31 | legacy behaviour kept, `decision` open |

Totals: 39 fixed, 13 flagged, 1 kept as legacy (LB-APP-053). Four more flags exist without a client defect behind
them — off, except the five that legacy adopted (DEC-58): of these four `dev051RentedUndo`, of the 13 above
rows 25, 27 and the pets half of 29, and the new `dev010AgentMarkedToast` of WP-34 — (paged saved lists, the paging part of DEV-003, are not among them: DEC-53
made them plain behaviour). WP-34 adds rows 5 and 6 when it splits two flags. The approved differences without a
flag gain DEV-053 (DEC-67):

| # | Flag | Deviation | Package |
| - | ---- | --------- | ------- |
| 1 | `dev005RadarDropsPostedDays` | DEV-005 | WP-22 (used by WP-30) |
| 2 | `dev010RealtorVoteWording` | DEV-010, the hint half since WP-34; off | WP-26 |
| 3 | `dev051RentedUndo` | DEV-051; on by default since the intake of `index-CIa0Ldj2.js` (DEC-58) | WP-26 |
| 4 | `dev052UnifiedBelowMedianRule` | DEV-052 | WP-22 |
| 5 | `dev010AgentMarkedToast` | DEV-010, the toast half; on by default (DEC-58) | WP-34 |
| 6 | `dev016SuccessToastOnDestructive` | DEV-016, the success half; off | WP-34 |

### Telegram points (45)

| # | Points | Group | Package | Automated by | By hand in Telegram |
| - | ------ | ----- | ------- | ------------ | ------------------- |
| 1 | TMA-001 … TMA-005 | SDK loading and boot | WP-21 | `launch.spec.ts`, `boot-failure.spec.ts`; fake without SDK and with a late SDK | no white screen on any client |
| 2 | TMA-006 … TMA-009 | launch data, sign-in, language, privacy | WP-21 | `session.spec.ts`; the address holds no launch data after boot; `analytics.spec.ts` | — |
| 3 | TMA-010 … TMA-013 | launch parameters and links the app builds | WP-21 | journey 2; link-builder unit tests | open a shared listing link from a chat |
| 4 | TMA-014 … TMA-016 | ready, expand, vertical swipes, fullscreen | WP-21 | the fake's call log per version | fullscreen on iOS and Android; a downward swipe does not close the app |
| 5 | TMA-017, TMA-018 | safe areas; viewport height | WP-20 | token snapshot; source check that no viewport unit is used | notch, home indicator, Android gesture bar |
| 6 | TMA-019 … TMA-021 | theme parameters, header colour, own theme | WP-21 | theme unit tests; render pass in dark | switch Telegram's theme with the app open |
| 7 | TMA-022 … TMA-024 | BackButton, SettingsButton, main button | WP-21 | `back.spec.ts`, `coverage/routes.spec.ts`; the fake's log holds no main-button call | Back order; hardware Back; Settings in the menu |
| 8 | TMA-025 … TMA-027 | haptics, confirm, other popups | WP-21 | call log; confirm accepted and cancelled | feel of haptics; the native confirm |
| 9 | TMA-028 … TMA-032 | links, calls, sharing, other hand-offs | WP-21 | call log; the 1.5 s repeat guard; share fallback | open a post, the call flow, the share link |
| 10 | TMA-033 … TMA-040 | write access, contact, location, home screen, storage, closing, visibility | WP-21 | fake answers for each; DeviceStorage restore unit tests | location prompt; home-screen dialog; reopen after closing |
| 11 | TMA-041 … TMA-045 | platform, version gates, outside Telegram, callback isolation, emulator | WP-21 | `miniapp-old`; `gates.spec.ts` outside case; bundle check | — |

Six of the 45 are confirmed absences — nothing is built, and the check is that the adapter exposes no such call:
viewport height, main button, other popups, other hand-offs, contact request, cloud and sensor interfaces (`05`
§5). Since WP-81 the contact request is no longer one of them: `tg.requestContact()` serves the phone step of the
owner form (*added by the owner-cabinet plan*). The `no_chat` flow that uses the write-access call is WP-30's code; the report endpoint of the boot watchdog
is WP-32's.

### The owner cabinet

The trace of the cabinet's audit items to WP-81 … WP-83 (*added by the owner-cabinet plan*). "DEV" means an
approved deviation that is on without a flag (DEC-74, DEC-80) and is checked as the build's behaviour.

| # | Rules | Package | Proved by |
| - | ----- | ------- | --------- |
| 1 | BR-APP-075 … BR-APP-087, BR-APP-096, BR-APP-097, the form's half of BR-APP-093 | WP-81 | `owner-form.spec.ts`, `owner-picker.spec.ts`, `owner-phone.spec.ts`; the unit tests of `features/owner/form`, `photos`, `place`, `steps` |
| 2 | BR-APP-088 … BR-APP-092, BR-APP-094, BR-APP-095, BR-APP-103, the panel's half of BR-APP-093 | WP-82 | `owner-lists.spec.ts`, `owner-requests.spec.ts`, `owner-panel.spec.ts`, `owner-signals.spec.ts`; `status.test.ts` |
| 3 | BR-APP-098 … BR-APP-102 | WP-83 | `contact-request.spec.ts`, `listing-owner.spec.ts`; `ctaOwner.test.ts` |

| # | Defect | Short name | Package | State |
| - | ------ | ---------- | ------- | ----- |
| 1 | LB-APP-054 | a new draft on every entry | WP-81 (server: WP-84) | DEV-054 |
| 2 | LB-APP-055 | «Сохранить изменения» after live saves | WP-81 | DEV-062 |
| 3 | LB-APP-056 | publish without a mode | WP-81 | DEV-055 |
| 4 | LB-APP-057 | limits in the texts | WP-81, WP-82, WP-83 | fixed |
| 5 | LB-APP-058 | no owner funnel events | WP-81, WP-82 | fixed |
| 6 | LB-APP-059 | stale counters after a panel action | WP-82 | fixed |
| 7 | LB-APP-060 | old client cannot return to the draft | WP-81 (the bot's button: WP-88) | fixed |
| 8 | LB-APP-061 | original photo uploaded | WP-81 (re-encoding: WP-84) | fixed |
| 9 | LB-APP-062 | weekday initials, device-clock days | WP-82 | fixed |
| 10 | LB-APP-063 | "inside Uzbekistan" is a rectangle | WP-81 (the check: WP-84) | fixed |
| 11 | LB-APP-064 | unknown value crashes owner screens | WP-81, WP-82 | fixed |
| 12 | LB-APP-065 | no way forward after a rejection | WP-81, WP-82 | DEV-056 |
| 13 | LB-APP-066 | pending count read for everyone | WP-82 | fixed |
| 14 | LB-APP-067 | photo delete without undo | WP-81 | DEV-057 |
| 15 | LB-APP-068 | silent loss of place data | WP-81 | DEV-058 |
| 16 | LB-APP-069 | request tip leads to Settings | WP-82 | DEV-059 |
| 17 | LB-APP-070 | empty own-listing footer | WP-82 | fixed |
| 18 | LB-APP-071 | waitlist not remembered | WP-81 | not applicable: no realtor waitlist is offered, since HOMI rejects nobody as a realtor (default 26; DEC-82); `me.owner.waitlisted` stays in the contract |
| 19 | LB-APP-072 | chip tap before the card | WP-83 | fixed |
| 20 | LB-APP-073 | stale card after `open`, `closed`, `own` | WP-83 | fixed |
| 21 | LB-APP-074 | `given` without a phone | WP-83 | fixed |
| 22 | LB-APP-075 | label hidden by string matching | WP-83 | fixed |
| 23 | LB-APP-076 | expired closes contact for good | WP-83 | DEV-060 (and the response time in hours and days, fixed) |
| 24 | LB-APP-077 | `who` overwrites the count | WP-83 | fixed |
| 25 | LB-APP-078 | gate point after the number was given | WP-83 | fixed |

Totals of the cabinet: 16 fixed, 8 approved deviations on without a flag and 1 not applicable (LB-APP-071); none
flagged, none kept as legacy.

| # | Points | Group | Package | Automated by | By hand in Telegram |
| - | ------ | ----- | ------- | ------------ | ------------------- |
| 1 | TMA-034 | contact request of the phone step | WP-81 | `contact.test.ts` per version; `owner-phone.spec.ts` at 6.8 and 6.9 | «Поделиться номером» on iOS and Android; the bot path on a client below 6.9 |
| 2 | TMA-046 | the launch `owner_new` | WP-81 | `owner.test.ts` (deep links); `owner-phone.spec.ts` | open the app with `startapp=owner_new` from a chat |

## Tests

The suite is the deliverable; these are the tests of the suite and its tools.

- Fake Telegram: a call to a member the fake does not implement fails the test (WP-03); a spec lists the members
  `lib/telegram/sdk.ts` reads and compares them with the fake's surface.
- Mode fixture: a planted `localStorage.setItem` of the token in header mode fails; a planted `Authorization`
  header in cookie mode fails.
- Scenarios: `setScenario('empty')` empties a server-rendered list in cookie mode and a client-fetched one in
  header mode; with `NEXT_PUBLIC_APP_ENV=production` the cookie changes nothing.
- `e2e-coverage.mjs`: removing the annotation of one screen makes it fail and name that screen.
- `check-bundle.mjs`: a planted forbidden string in a client module fails the check; the clean build passes.
- `check-budgets.mjs`: a planted oversize measurement fails; a missing measurement fails.
- Stability: the pull-request projects pass five times in a row on `main` before the package is closed — run on the
  local stack (`scripts/dev/e2e-local.sh`), not on Actions, to keep the minutes of DEC-100. The suite took 17.8 minutes
  on CI before this package (#110), so the 15-minute ceiling is replaced by the measured time of the pull-request
  projects, stated in the PR.

## Acceptance checklist

Run rows 1–47 on staging in ru, uz and en and in light and dark; tick each in the PR with a screenshot. The states
named here are the minimum; the full list for a screen is the checklist of its owning specification, which is
ticked there and re-read here. Texts must be the legacy ones with HOMI in place of the legacy brand.

### Screens (48)

| # | Screen | Name | Package | Address or trigger | States to tick |
| - | ------ | ---- | ------- | ------------------ | -------------- |
| 1 | SCR-001 | «Обновите Telegram» | WP-21 | inline boot guard | three languages; light and dark; «Вернуться в бота» closes; «Попробовать ещё раз» reloads; not shown when only the SDK fails |
| 2 | SCR-002 | Outside Telegram | WP-23 | `/outside` | the one sentence in three locales; no request to `/bff/*` |
| 3 | SCR-003 | No access | WP-23 | `/no-access` | six reasons (`paused` since `index-CIa0Ldj2.js`), unknown as private; checking line, never for blocked; post, bot or close, support buttons; leaves by itself on success. Stubs only |
| 4 | SCR-004 | Language picker | WP-23 | `/welcome/language` | headings in Telegram's language; that language first; buttons disabled while saving; failure re-enables; success moves to the chosen locale |
| 5 | SCR-005 | First-launch city | WP-23 | `/welcome/city` | no close, no Back; counts; location row with its three errors; a pick enters the feed; a linked listing comes first |
| 6 | SCR-006 | Shell | WP-23 | layout of the main group | top bar per tab; four tabs with the lens; list / map toggle; collapse after 24 px, first tap only expands; safe areas |
| 7 | SCR-007 | Feed | WP-24 | `/` | chips in order; card content; paging; no duplicates; favourite toggle; open a card |
| 8 | SCR-008 | List loading and errors | WP-24 | `/`, `/saved`, `/saved/history` | three skeletons; offline and server states; inline retry with items; spinner at the end |
| 9 | SCR-009 | Empty and few results | WP-24 | `/` and the saved lists | search empty with reset; few-results note with its three buttons and their conditions; favourites empty; history empty |
| 10 | SCR-010 | Pull-to-refresh | WP-23 | gesture on lists and the radar tab | arms at 72 px with a haptic; spinner at least 0.7 s; off on map, settings and under layers |
| 11 | SCR-011 | Search map | WP-27 | `/map` | clusters, stacks, pins with tones; camera; the "N of M" note; locate ok, denied, failed; loading, empty and error states; both engines |
| 12 | SCR-012 | Area drawing | WP-28 | `/map` with `draw=1` | hints; draw; too small; applied area and its pill; cancel, Back; hand-off from filters |
| 13 | SCR-013 | Map selection card | WP-27 | pin tap on `/map` | single; stack with its counter; failed slot with retry; × and background close; the shield after the price for a verified owner (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `ListingCard` for a later package (`wave-1/baseline.md`, built code behind the pin, row 2); WP-35 closed it) |
| 14 | SCR-014 | Filters | WP-25 | `/filters` | every section with its visibility rule; live count and flow; relax chips; reset; «Показать N» and «Ничего нет»; radar button states; pets tip |
| 15 | SCR-015 | Quick filter | WP-25 | `/filters/rooms`, `/price`, `/owner` | three bodies; own reset; live count |
| 16 | SCR-016 | Sort | WP-25 | `/sort` | six options with their availability; a pick closes and scrolls up |
| 17 | SCR-017 | City picker | WP-25 | `/city`; `pick=city` in filters | rows with counts and ✓; location row; header variant saves at once; nested variant changes the draft only |
| 18 | SCR-018 | Listing | WP-26 | `/listing/<number>`, over a list and direct | hero; title row; key facts; market block; facts; stats; history; location rows; author with «Показать номер»; description; source, original with masked numbers, translation; no phone number before a tap, the digits after it; each CTA variant; share; the entrance and the leave animation of the layer, none after a swipe, in lite graphics or under reduced motion (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `RouteOverlay`, `ListingLayer` and `closeListing` for a later package (`wave-1/baseline.md`, built code behind the pin, row 5); WP-36 closed it) |
| 19 | SCR-019 | Listing loading and errors | WP-26 | same | skeleton; section skeletons over a preview; «Объявление не загрузилось»; error with retry |
| 20 | SCR-020 | Photo viewer | WP-26 | `/listing/<number>/photos` | counter; zoom; swipe down; ×; Back |
| 21 | SCR-021 | Spot map | WP-28 | `/listing/<number>/location` | circle; locate with the distance line or an error; Yandex and Google buttons; ×; Back; both engines |
| 22 | SCR-022 | Market sheet | WP-26 | `/listing/<number>/market` | the three paragraphs per scope and tone; "updated" steps; «Подробнее» only when the brand has a link |
| 23 | SCR-023 | Actions and report | WP-26 | `/listing/<number>/actions`, `step` | menu rows; report rows; detail step; every toast and undo; support row only with an account |
| 24 | SCR-024 | Favourites | WP-29 | `/saved` | list, 20 at a time with the next page on scroll; removing a favourite removes the card; empty; error; pull |
| 25 | SCR-025 | History | WP-29 | `/saved/history` | list without the eye, 20 at a time; «Очистить» with its confirm; empty; failure; re-created once on the return after a listing was opened (DEV-053, approved difference) |
| 26 | SCR-026 | Radar tab | WP-30 | `/radars` | the "soon" state while radars are switched off; spinner; error; tiles with status; switch on and off; resumed toast; «+» |
| 27 | SCR-027 | Radar empty | WP-30 | `/radars` with none | sweep, still in lite; texts; button opens the new-radar sheet |
| 28 | SCR-028 | Radar sheet | WP-30 | `/radars/<id>` | header; finds strip in its three states; delivery switch and mode; hidden row; delete with confirm; «Смотреть найденное» and Back returns here |
| 29 | SCR-029 | Radar editor | WP-30 | `/radars/<id>/edit` | title; no «Опубликовано»; «Сейчас подходит: N»; each save toast; «Расширить» |
| 30 | SCR-030 | New radar | WP-30 | `/radars/new` | starts from the current search; each toast including duplicate, re-enabled and limit |
| 31 | SCR-031 | «Нашли жильё?» | WP-30 | `/radars/found` | ask; where; congratulations with share; the closing toasts |
| 32 | SCR-032 | Settings | WP-31 | `/settings` | spinner; error; the six groups and when each row shows; about block |
| 33 | SCR-033 | Theme | WP-31 | `/settings/theme` | three options; applied at once; rollback on failure |
| 34 | SCR-034 | Graphics | WP-31 | `/settings/graphics` | three options with the auto label; hint; kept on the device |
| 35 | SCR-035 | Language | WP-31 | `/settings/language` | options and hint; the address segment changes without a reload |
| 36 | SCR-036 | Currency | WP-31 | `/settings/currency` | options and hint; prices change without a reload |
| 37 | SCR-037 | Quiet hours | WP-31 | `/settings/quiet-hours` | presets; immediate with rollback |
| 38 | SCR-038 | Digest time | WP-31 | `/settings/digest` | presets; both hints |
| 39 | SCR-039 | «Скрытое» | WP-31 | `/settings/hidden` | authors; listings; return one; return all with confirm; empty |
| 40 | SCR-040 | Follow nudge | WP-30 | card on `/` | appears 1.8 s after custom filters; flow line or none; 10 s; ×; «Включить» |
| 41 | SCR-041 | Home-screen nudge | WP-31 | card on `/` | after three visit days; 10 s; ×; «Добавить»; added toast |
| 42 | SCR-042 | Toast | WP-23 | any result | 4 s plain, 6 s with an action; one at a time; tap closes; a drag down past 36 px closes, a shorter one returns; the offset by what is below it (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `ToastHost` for a later package (`wave-1/baseline.md`, built code behind the pin, row 4)) |
| 43 | SCR-043 | Confirm | WP-23 | clear history, delete radar, return all, restart bot | native on current clients, browser dialog on old ones; cancel changes nothing |
| 44 | SCR-044 | Telegram system sheets | WP-21 | write access, share, home screen, location, links | each result handled; real clients only |
| 45 | SCR-045 | Crash screen | WP-23 | `error.tsx`, `global-error.tsx` | three texts per locale; «Обновить» reloads; one report |
| 46 | SCR-046 | Return banner | WP-30 | card on `/` after a visit ≥ 6 h ago | «С вашего прошлого захода — N новых» only for N > 0; «Включить» or «Настроить» by the filters; 15 s; ×; once per filters in 2 days; never with another nudge; absent while radars are off |
| 47 | SCR-047 | Radar card in the search list | WP-30 | inside the list on `/` | after the 8th card or after a short complete list without the note; rent and sale titles; «Включить радар» or «Настроить радар»; × for 7 days; absent with a radar for the search and while radars are off |
| 48 | SCR-048 | Card style «Вид карточек» | WP-31 | `/settings/cards` | both mocks, the current one checked; a pick saves and the settings row follows; «Прислать пример в чат»: spinner, the sent line with the minimise hint, or the failure line (`card_sample_unsent`); no «Новое» pill (DEC-57) |

### Screens of the owner cabinet (14)

Ticked once WP-81 … WP-83 are merged, on a local stack with the cabinet on and inside Telegram on staging when WP-89
switches it on there (DEC-81; *added by the owner-cabinet plan*).

| # | Screen | Name | Package | Address or trigger | States to tick |
| - | ------ | ---- | ------- | ------------------ | -------------- |
| 1 | SCR-049 | Limit sheet | WP-82 | `/owner/limit` from Settings or the list | the numbers from `max`; «Мои объявления» or «Понятно» by the entry |
| 2 | SCR-050 | Owner form | WP-81 | `/owner/new`, `/owner/<id>` | loading, error with retry, the limit state, the cross without the SDK; the same draft on a second opening (DEV-054) |
| 3 | SCR-051 | Place picker | WP-81 | `/owner/<id>/place` | GL and Leaflet; the label; «Найти меня»; the fill and its «Вернуть»; edge swipe |
| 4 | SCR-052 | Questionnaire | WP-81 | `/owner/<id>` | every section; autosave; the gate; photos with undo (DEV-057); «Вернуть» after a city change (DEV-058) |
| 5 | SCR-053 | Phone confirmation | WP-81 | `/owner/<id>/phone` | yes, no, old client, late hint, `not_uz`, `not_own` |
| 6 | SCR-054 | Rejection | WP-81 | the phone step of a rejected listing | `denied` and `limit` (default 32), the support button (DEV-056); no realtor text and no waitlist (default 26; DEC-82) |
| 7 | SCR-055 | Contact mode and preview | WP-81 | `/owner/<id>/mode` | «Через HOMI» preselected (DEV-055); the preview; «Опубликовать» or «Готово» (DEV-062) |
| 8 | SCR-056 | Done | WP-81 | `/owner/<id>/done` | confetti and haptics, the mascot, the edit form, «На проверке» after a held publish (default 26), no radar sentence while radars are off |
| 9 | SCR-057 | «Мои объявления» | WP-82 | `/settings/owner` | two tabs with dots; every status, «На проверке» for a held one; the actions with their confirms; the rejected card; with the cabinet off only the actions DEC-81 keeps |
| 10 | SCR-058 | «Отклики» | WP-82 | `/settings/owner/<id>/requests`, `/listing/<n>/requests` | every status line; the answers, reasons, undo, «Оказался риелтором» |
| 11 | SCR-059 | The owner's own listing | WP-82 | stub 10000008 | the title row, «Цена», no «Источник», the panel and its footer, never an empty footer |
| 12 | SCR-060 | Request signals | WP-82 | the pending count | the dot on every tab, the tab tip to the listing (DEV-059), the card tip, `homi-req-tip` |
| 13 | SCR-061 | Request sheet | WP-83 | `/listing/<n>/contact` | the form, the note, every error line, the card effects |
| 14 | SCR-062 | Owner info sheet | WP-83 | `/listing/<n>/owner` | the points by tier and origin; the reworded check (DEC-77); no gate point after `given` |

### Scenarios of legacy release `index-CIa0Ldj2.js` (32)

That release added 28 scenarios to legacy's base parity suite and 4 to its MapLibre GL suite. One line per scenario,
next to the screen row it belongs to. Most are built by the catch-up packages WP-34 … WP-38 and are ticked here once
those are merged; "built" means the merged code already does it (*added by the intake of `index-CIa0Ldj2.js`*).

| # | Screen row | Legacy scenario | Package | What to tick |
| - | ---------- | --------------- | ------- | ------------ |
| 1 | 3 | `no-access-paused` | WP-36 | `paused` (scenario `access_paused`): «Бот на паузе» with its text; no source in the bot link |
| 2 | 6 | `fresh-pill` | WP-38 | 7 h in the background with a listing open: after the close «Показать 3 новых» in the top bar |
| 3 | 6 | `fresh-pill-show` | WP-38 | a tap on the pill reloads the list from page one, at the top |
| 4 | 7 | `fresh-reload` | WP-38 | 7 h in the background at the top of the list with nothing open: a silent reload, no pill |
| 5 | 7 | `feed-age` | WP-35 | the ages from `posted.at` with a frozen clock: 20 s, 5 min, 3 h, 50 h |
| 6 | 7 | `feed-floor` | WP-35 | floor `0` and `-1` on the cards (the stub listings `100022` and `100023`) |
| 7 | 7 | `fav-fail` | WP-34 | a failed favourite: the heart rolls back and «Не получилось сохранить» shows |
| 8 | 7 | `radar-link` | WP-57 | a launch with `?radar=<id>` opens the feed with the radar's filters (DEC-61; ticked with the bot) |
| 9 | 11 | `map-cut-leaflet` | WP-37 | scenario `map_cut` on Leaflet: «На карте — N самых свежих. Остальные — в списке» |
| 10 | 11 | `map-fail-leaflet` | built (WP-27, WP-28) | a failed points request: the pill «Не загрузилось» |
| 11 | 11 | `map-fail-leaflet-retry` | built (WP-27, WP-28) | «Повторить» repeats the request |
| 12 | 11 | `map-leaflet-return` | WP-37 | map → list → map: the camera is restored and there is no second fit |
| 13 | 11 | `gl-cut` | WP-37 | the cut note on GL |
| 14 | 11 | `gl-fail` | built (WP-27) | the error pill on GL |
| 15 | 11 | `gl-fail-retry` | built (WP-27) | the retry on GL |
| 16 | 11 | `gl-return` | WP-37 | the camera restored on GL |
| 17 | 18 | `deep-link-listing-done` | WP-36 | the mark of the launch is already set: the listing of the link does not open |
| 18 | 18 | `deep-link-listing-again` | WP-36 | the first open writes the mark; after a reload the listing does not open again |
| 19 | 18 | `listing-floor-ground` | WP-35 | the tile «Цокольный этаж» (`100022`) |
| 20 | 18 | `listing-floor-basement` | WP-35 | the tile «Подвал» (`100023`) |
| 21 | 18 | `no-sdk-listing` | WP-36 | without the SDK (`launchApp(page, { sdk: false })`): the close cross on the listing |
| 22 | 18 | `no-sdk-listing-close` | WP-36 | the cross closes the listing |
| 23 | 19 | `listing-gone` | WP-36 | `404` (number `999404`): «Этого объявления уже нет», in place of «Объявление не загрузилось» of row 19 |
| 24 | 19 | `listing-gone-fresh` | WP-36 | «Смотреть свежие» closes the listing |
| 25 | 19 | `listing-day-limit` | WP-36 | scenario `daily_limit`: «Лимит на сегодня» with «Повторить» |
| 26 | 23 | `listing-report-rented-undo` | WP-34 | «Уже сдано» → «Вернуть» → `DELETE /listings/{number}/reports`; the listing returns |
| 27 | 23 | `listing-report-agent` | WP-34 | `agent_marked: false` → «Спасибо, учёл вашу отметку» |
| 28 | 23 | `listing-report-agent-marked` | WP-34 | scenario `agent_marked` → «Отметили номер как риелторский» |
| 29 | 24 | `favorites-pages` | built (WP-29, DEC-53) | the second page of favourites by the cursor: the paging of row 24 |
| 30 | 28 | `radar-sheet-listing` | WP-38 | a find opened from the sheet loses «новое»; legacy parks the sheet, HOMI re-opens it (DEC-64) |
| 31 | 28 | `radar-sheet-listing-back` | WP-38 | Back from that listing returns to the sheet, with the strip and the sheet's scroll where they were |
| 32 | 28 | `radar-sheet-age` | WP-35 | the age of a find from `posted.at`, as on the card |

### Scenarios of legacy release `index-YX9bFVws.js` (17)

That release added 17 scenarios to legacy's base parity suite (113 → 130; `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs`
at r38). One line per scenario, next to the screen row it belongs to ("cabinet n" is a row of "Screens of the owner
cabinet"). The cabinet's lines are ticked only with the cabinet switched on (DEC-89); "WP-39" lines once WP-39 is
merged (*added by the intake of `index-YX9bFVws.js`*).

| # | Screen row | Legacy scenario | Package | What to tick |
| - | ---------- | --------------- | ------- | ------------ |
| 1 | 7 | `feed-end-many` | WP-39 | «Это всё по вашему поиску» after the last card of a search feed loaded to its end, also with the cabinet off (DEC-90) |
| 2 | 7 | `feed-owner-entry` | WP-82 | under it the row «Сдаёте квартиру? Разместите бесплатно ›»; none while the cabinet is off |
| 3 | 9 | `feed-empty-owner-entry` | WP-82 | the line under the empty search feed; none in favourites or history |
| 4 | 9 | `feed-empty-owner-entry-open` | WP-82 | its tap: `owner_entry {src: empty}`, then the form (`can_add`) |
| 5 | 18 | `listing-owner-entry` | WP-82 | «Тоже сдаёте квартиру? Разместите бесплатно ›» last on a card with `owner.entry` (DEC-94) |
| 6 | 18 | `listing-owner-entry-open` | WP-82 | its tap with `can_add`: a new form |
| 7 | 18 | `listing-owner-entry-limit` | WP-82 | its tap without `can_add`: Settings › «Мои объявления» |
| 8 | 7 | `fav-like` | WP-39 | the heart springs on each tap; the burst only on an add |
| 9 | 14 | `leave-filters-sheet` | WP-39 | the closed filters sheet leaves (a copy slides down); none after a drag |
| 10 | 32 | `leave-subpage` | WP-39, WP-31 | a closed settings sub-page leaves; none after the swipe |
| 11 | 42 | `leave-toast` | WP-39 | a toast leaves; none when another toast replaces it or after a drag |
| 12 | 29 | `radar-edit-save-phase` | WP-39 | «Сохранить»: spinner, then the tick, then the close and the toast |
| 13 | 31 | `found-moved-landlord` | WP-39, WP-82 | a "where found" answer shows «Поздравляем!» (WP-39); with the cabinet on, the landlord block with its buttons (DEC-91) |
| 14 | 31 | `found-kvadro-landlord-uz` | WP-82 | in uz the landlord block on the «через HOMI» congratulation; the shared link of the locale |
| 15 | cabinet 4 | `owner-form-limit` | WP-81 | the description ring near the limit and full at 600 |
| 16 | cabinet 4 | `owner-form-limit-shake` | WP-81 | typing beyond 600 shakes the ring |
| 17 | cabinet 4 | `owner-form-photo-upload` | WP-81 | the ring with the percent, the waiting pulse, the tick on the new photo (DEC-92) |

### Statements

- [ ] Rows 1–48 are ticked in ru, uz and en and in light and dark, with staging screenshots; the reviewer signed.
- [ ] The 17 scenarios of `index-YX9bFVws.js` are ticked; the cabinet's rows (2 – 7, 13 and 14 for the landlord
      block, 15 – 17) on a local stack with `OWNER_CABINET_ENABLED=true` (DEC-89) (*added by the intake of `index-YX9bFVws.js`*).
      Rows 26 … 31 carry the staging screenshot of the "soon" state and local screenshots of the radar screens;
      rows 40, 46 and 47 a staging screenshot of the feed without them and local screenshots of each; all of them
      are ticked inside Telegram in WP-57 (DEC-51).
- [ ] Every line of the acceptance checklists of WP-20 … WP-32 is ticked in its own PR or re-ticked here.
- [ ] Every spec runs in cookie mode and in header mode in every PR (DEC-101): `miniapp-header` runs every test that
      does not name its mode, and a test that names it loops over both modes. A spec cannot opt out of a mode.
- [ ] The mode assertions pass after every test: cookie attributes in cookie mode; bearer header and no stored
      token in header mode.
- [ ] `e2e-coverage.mjs` reports no screen without a test; the tables of this file name every rule, defect and
      Telegram point once (the check of step 10 and a count: 47, 73, 50, 45).
- [ ] The 37 fixed defects each have a passing test that would fail on the legacy behaviour; the 13 flagged ones
      and the 4 other flags each have tests for both branches; before WP-34 `lib/flags.ts` had 17 flags, all `false`.
      After WP-34 and WP-35: 20 flags, each with tests for both branches; five are `true` — the behaviours legacy
      adopted in `index-CIa0Ldj2.js` (DEC-58): `dev014TashkentDates`, `dev016ErrorToastOnFailure`,
      `dev051RentedUndo`, `dev010AgentMarkedToast` and `dev017PetsLongRentOnly` — and the rest `false`.
- [ ] The 31 scenarios of legacy release `index-CIa0Ldj2.js` that WP-34 … WP-38 build are ticked, each with its
      package; scenario 8 (`radar-link`) is ticked with WP-57 (DEC-61).
- [ ] The six decided differences from legacy hold on the merged build: the "soon" state with radars off — and with
      it no follow nudge, no return banner and no radar card in the search list —, no phone number before a tap,
      saved lists paged by 20, «{city} целиком», the card-style row without the «Новое» pill (DEC-57), and «Смотрели»
      re-created once on the return after a listing was opened (DEV-053, DEC-67).
- [ ] The eight journeys pass in both modes; the state table has a scenario or a named lower-layer test per row.
- [ ] No test reaches an external host; no test contains real launch data, a real phone or a real name.
- [ ] `render.spec.ts` finds no raw key, no missing-message report and no legacy brand word in three locales.
- [ ] No `securitypolicyviolation` event occurs in any spec; `CSP_REPORT_ONLY` is off on staging and production.
- [ ] The demo-data marker is visible on every stub-backed screen on staging and on production.
- [ ] The pass inside Telegram is recorded for iOS, Android, Desktop and Web on staging and on production, with
      the mode noted per client; header mode was seen at least once on Telegram Web.
- [ ] The hand-only list is ticked per client; what stubs cannot show inside Telegram is listed for WP-48.
- [ ] `perf-budgets.json` holds measured limits with their dates; `check-budgets.mjs` and the on-demand chunk
      rules run in CI; map and PostHog code are absent from the feed's first load.
- [ ] `check-bundle.mjs` passes on the production-environment build: no emulator, no test double, no gallery, no
      scenario forwarding, no server-only key, no legacy key name, no legacy brand word, no public source map.
- [ ] The pull-request projects passed five times in a row on `main` on the local stack (DEC-100); no test is skipped
      or marked to fix.
- [ ] `make ci-frontend`, `make e2e` and `make bundle-check` are green; the queue row is `DONE`; the session
      handoff names WP-40 as next.

Exit to stage C: all statements above, plus every contract gap found during stage B written back into
WP-11 … WP-13 with regenerated types, and no open defect that blocks a scenario of the checklist. WP-40 is the
exception: it starts once part 4 is merged and does not wait for steps 14–17 (*changed by DEC-102, 2026-11-22*).

## As built

The package ships in parts, like WP-82: each part is one PR under the 3 000-line rule. **Part 1** (2026-11-22) is the
suite's plumbing and the bundle check; part 2 the passes over all addresses with the screen annotations and
`e2e-coverage.mjs`; part 3 the eight journeys; part 4 the performance specs and budgets. Steps 14 and 15 are run
with the production track, step 16 brings what they find back to the development track, and step 17 closes the
package. They stay open after the parts merge.

Part 1:

- **Projects** (`frontend/playwright.config.ts`, DEC-100, DEC-101). Every launch takes the session mode and the
  Telegram profile of its project from `metadata.profile`, unless the spec names its own. Every PR runs
  `miniapp-cookie` and `miniapp-header` (`weba`). The other five projects exist only with `E2E_FULL=1`, the manual run
  (`workflow_dispatch` input `full`, which also installs WebKit). The `perf` project comes with part 4.
  - Deviation: `miniapp-cookie` keeps the fake's default profile (`ios`, version 9.0), not `android`. The specs were
    written against it, and a test about Android names its platform.
  - A test about the modes loops over both and names the mode in its title (`(cookie mode)`, `header mode:`). Both
    copies run in `miniapp-cookie`, and `miniapp-header` leaves every test that names its mode out. So header mode
    covers 80 more tests, for about 2 minutes. That number is what corrected the first answer of DEC-101.
- **The mode checks** are in `@homi/testing` (`src/modes.ts`, run by the `test` fixture of `./playwright`), not in
  `e2e/support/modes.ts`: `launchApp` and the `test` every spec imports live there. The rules:
  - Cookie mode requires `HttpOnly`, `Secure`, `SameSite=None` and a partition key. Chromium reports the key for
    `http://localhost`, verified on the whole suite.
  - Header mode: once a request of a document carried the bearer, every later `/bff/` request of it must too. A
    reload's reads before its own sign-in carry no token and are not findings.
  - The token must not be in storage, in a Telegram storage call or in an address.
  - Console errors, CSP violations and missing messages are findings. Chromium's lines about an answer's status do
    not count.
  - A test that provokes an error declares it (`allowConsoleErrors`, `allowCspViolations`): `crash`, `errors`, `csp`
    and the not-found test of `foundation`.
- The header mode's handler of `/bff/session` is a **context route**, so a spec's own answer of the exchange wins
  whether it was registered before the launch or after. Two `gates` tests had been passing only in cookie mode.
- **Scenarios**: `setScenario` and `withScenario` of `@homi/testing` (`src/scenarios.ts`) replace the 15 copies of
  `stubScenario` and `useScenario` and the inline cookie calls. No `e2e/support/scenarios.ts` was needed.
- **Found by the mode checks and fixed:** React error 418 on every direct load or reload with a session, 27 tests of
  the survey. The demo marker's `useSyncExternalStore` used the live store as its server snapshot. A page's boundary
  hydrated first and reported `stub`, so the marker's own boundary hydrated into a pill the server never rendered.
  The server snapshot is now constant (`lib/data/sources.ts`), with a hydration test.
- **Found and left (low):** React error 419 at an unknown address, about one launch in sixteen. It comes from the
  `notFound()` under `<Suspense>` of AM-57: when the boundary streams after the shell, React finishes it on the client.
  The global error listener may send it as an `app_error`.
- **Bundle check** (`app/scripts/check-bundle.mjs`, `make bundle-check`, the last step of the e2e job). On its first
  run it found three things, all fixed:
  - Row 3: the gallery's client chunk. The page now imports the gallery only in the branch of the builds that show
    it, which the bundler drops in production.
  - Row 4: the scenario cookie's name in server code. The names are empty in a production build.
  - Row 7: the raw `legacy` and `homi` catalogues of all three locales, about 150 KB, in a client chunk. The client's
    `IntlClientProvider` imported `createIntlHandlers` from the module that imports the catalogue files. It is now in
    `src/handlers.ts` of `@homi/i18n`, and the package is marked `"sideEffects": false`.
- Row 7 does not count the legacy catalogue's key `found.kvadro`. The importer keeps legacy key names (its rule 6 and
  `keys.json`), a key path is never shown, and rule 5 of `25` §2 is about what the interface shows. Server source
  maps are not scanned: they are not served. The 404 of `/dev/ui` in production is the unit test
  `tests/gallery/page.test.tsx`, not a request of the script.
- `sources:publish-stub-media` is not a CI step. CI has no name for `cdn.homi.loc`, and the specs answer stub photos
  themselves (`stubMedia`).

Part 2:

- **The address table** `e2e/support/pages.ts` has 48 entries for 46 addresses: the feed and the radar tab have a
  second entry for their empty state. Each entry holds the screens, the element that proves the state it claims, the
  parent of a direct load and the scenario its state needs. The element is the loaded state, never a route root that
  also wraps the loading or the error state: the feed's cards (`[data-card]`), the radar tab's tiles (SCR-026) and
  `[data-radar-state="empty"]` (SCR-027), `[data-listing-state="loaded"]` and `"not_found"`, the own listing's
  `[data-owner-panel]`, the owner steps `[data-owner-step="phone|mode|done"]`, the place picker
  (`[data-owner-picker]` with «Готово» enabled, which needs the map ready), and `[data-reject-reason]` of the rejection state (`[data-owner-step="rejected"]`) at the rejected listing's `/phone`
  address (SCR-054). A probe of every
  address read their `data-route` names first.
- **`coverage/routes.spec.ts`:** every address loaded directly shows its entry's element, and Back goes to its parent
  or is hidden. The fake starts with the BackButton hidden, so on a root tab or a gate the test first waits until the
  app has decided (a `BackButton.hide` call in the fake's log), then asserts that it is hidden. Opening a layer over
  its base stays with the feature specs. A pushed page or a layer covers the tab bar, so a tab press always starts
  from a tab, and "a tab press resets the depth" is `shell.spec.ts`'s round trip.
- **`coverage/render.spec.ts` (`@render`):** every address, with no raw key path in the text, no legacy brand word,
  and the bottom bar inside the viewport. It reads the text only once no loading state is left, so the checks see the
  content, not a skeleton. `miniapp-cookie` and `miniapp-header` render `ru`. In the manual run,
  `miniapp-locales` renders `uz` and `en`, and `miniapp-dark` the dark theme.
  - The locale guard follows the stub profile's saved language, so `uz` and `en` need profiles of their own. The `en`
    profile is new: the fixture `me/en.json`, `MeController::SCENARIOS` and WP-11's scenario list (*corrected by
    WP-40:* the list is now `NativeStubs::ME_SCENARIOS`).
  - An address whose state needs another scenario keeps the `ru` profile and is checked as rendered.
- **`coverage/version-gates.spec.ts` (`@gates`):** at 6.0 the app starts, a card opens its listing and settings
  loads, and none of them calls a member above 6.0; a confirm falls back to the browser's dialog. The fake's call log
  belongs to one document, so the first test stays in the one it launched: it reaches settings through Back and the
  tab bar (6.0 has no SettingsButton), never by a load, and checks that no load happened and that the log still holds
  the listing's `BackButton.show`. The tests name the version themselves, so they hold in every project that runs
  `@gates`: `miniapp-cookie`, `miniapp-header` and the manual run's `miniapp-old`. The other projects of the manual run
  take only `@smoke`, `@gesture` or `@render`.
  - The e2e build has no bot name, so the listing shows no share button. The share link's fallback at 6.0 is the
    unit tests' of `useShareListing` and `lib/telegram/share.ts`.
  - Deviation: no test asks for the location at 6.0. The browser path below 8.0 is the unit tests' of
    `lib/telegram/location.ts` (`tests/telegram/location.test.ts`, at 7.10).
- **`coverage/brand.spec.ts`:** in each of ru, uz and en, the feed, a listing, the map, the radar tab and the owner
  list. The documents and every answer of the app's origin that they load (scripts, styles, SVG images, the RSC
  payloads with the messages, the screens' `/bff` reads) hold no pattern of `brand-words.json`.
- **Found by the render pass and fixed:** an aborted read of the owner form rejected unhandled ("signal is aborted
  without reason"). It surfaced as an uncaught page error, which the session-mode checks fail on. The journal never
  sent it, because `reportsRejection` (`lib/errors/global.ts`) already ignores an `AbortError`. With a PostHog key,
  `capture_exceptions` would have taken it as an `$exception`. `bffFetch` rethrows the caller's abort, and
  `usePlaceLabel` and `useDemand` did not catch it. Both now drop the abort and take any other rejection as a failed
  read (`none`, no demand), as `useCursorFeed` and `useMapPoints` do. `tests/owner/abortedReads.test.tsx` checks that
  the read is in flight when it is aborted, and it fails without the fix.
- **Screen annotations** name only screens that a test under them opens and asserts. Most sit on the test that
  proves the screen, the rest on a `test.describe` that at least one of its tests proves it in. Passing through a
  screen, waiting for it to be ready, or checking that it is absent does not count. The passes over all addresses
  annotate each test with its entry's screens; the self-tests of the checks and the brand pass name none. Annotations of both levels reach each test in
  `playwright test --list --reporter=json`. `app/scripts/e2e-coverage.mjs` lists with `E2E_LIST_ALL=1`, so the
  `@radars-off` and `@analytics` tests count. It fails on a screen without a test or on an unknown identifier. It is a
  step of the e2e job, which also runs when `docs/migration/data/screens.json` changes, and it has a unit test.
- **Found by the brand pass on CI and fixed:** a launch at `/en/…` with an English profile could end on the not-found
  screen. The locale guard moved the address to `/ru` before sign-in and back to `/en` after it; while the address was
  already `/en/…` and the page's locale still `ru`, next-intl left the `/en` segment in the pathname and the second
  move built `/en/en/…`. `LocaleGuard` now makes no second move while one to the wanted locale is underway and drops
  any locale segment from the path it hands the router, with a test that fails without the fix.
- **Found while drafting journey 8 and fixed:** the demo marker showed on `/outside`. The layout's reference read
  reports `stub` on every pathname, and the screen outside Telegram shows no data. `DemoDataMarker` now renders nothing
  there, with a unit test.
- **Header mode's exchange** (found by the passes: header-mode tests flaked). `route.fetch` stores the answer's
  `Set-Cookie` in the browser's context before the strip clears it, and a request sent in between carried the session
  cookie: `GET /bff/session` answered "cookie mode" and the app switched modes. The exchange is now sent with Node's
  `fetch`, which keeps no cookies, with the browser's other cookies of the address. The checks add "no request of the
  app carries `homi_session`" in header mode. Chromium's snapshot of an intercepted request's headers leaves a
  `Partitioned` cookie out, so a real partitioned cookie is caught by the end-of-test check of the context's cookies;
  the self-test plants a plain one. Against `https://app.homi.loc` the runner itself must trust mkcert
  (`NODE_EXTRA_CA_CERTS`). `main` had the same race since #111.

Part 3:

- **The eight journeys** live in `e2e/journeys/`. Each is one `test.describe` tagged `@journey` and names no session
  mode, so both projects run it in every PR: 63 tests in each project. Each journey names only the screens it
  asserts, as Part 2's rule asks: the feed by its cards (the `<article>` of `ListingCard`), never by its route root,
  which also wraps the skeleton and the error state. The two long ones (`moderation`, `search-to-radar`) are split into
  `test.step`s.
- **How they were made.** Eight agents drafted one journey each from its row, the feature specs and the app code.
  An independent reader checked each draft against the code, and the findings were applied before the first run.
  - The first run, at 60 tests in each project, passed 116 of 120.
  - `--repeat-each 10` passed 1 197 of 1 200.
  - The failures were all locators that a kept copy of the listing screen inside one layer made ambiguous. Every
    lookup inside a listing layer now takes the visible copy, and the three journeys that use them passed 60 of 60
    at `--repeat-each 6`.
  - After the review fixes (63 tests in each project, the gates of journey 8 included): `--repeat-each 5` passed
    630 of 630, and the whole suite 919 in the strict run, with `@radars-off` 20 and `@analytics` 8.
- **What the stubs cannot show, and where it is proved instead:**
  - Persistence of any write: stubs store nothing. Stage C's API tests and WP-48 prove it.
  - The `PATCH /settings` bodies: the app server sends them. The unit tests of `updateSettings` cover them.
  - The radar just created, on its tab or in its sheet: the stub list does not change.
  - That a drawn area limits the listings: the stub ignores the polygon, so only the area's parameters are checked.
  - Card prices in сум: the stub's prices are formatted by the server, as the fixture has them. WP-48 checks them.
  - The demo marker's absence when a screen's answers are `meta.source = native`: no stub answers `native`, and
    `tests/shell/demo-marker.test.tsx` proves it.
- **Two journeys follow the code rather than their row.** Both rows are corrected.
  - Row 4: the rented report's toast offers «Вернуть», which withdraws the report, because `dev051RentedUndo` is on
    by default (DEC-58; DEC-68 says what is withdrawn). The cards come back before the undo's answer and the stub
    stores no write, so the journey tells the undos apart by the `Next-Action` id of their Server Action, kept across
    the steps. The rented undo is a sixth action, none of the report, the hide, the unhide, the block or the block's
    undo. That the rented undo is `unreportListing` and the block's is `unblockAuthor` is
    `tests/listing/useListingActions.test.tsx`'s, and the request `DELETE /listings/{number}/reports` is
    `tests/actions/reports.test.ts`'s. The
    branch with the flag off, a toast without an action, is `tests/listing/useListingActions.test.tsx`'s.
  - Row 7: a failed save shows «Не получилось сохранить», because `dev016ErrorToastOnFailure` is on by default
    (DEC-58).
- **The session-expired screen has no `screens.json` identifier.** It is WP-23's: the locale layout draws it in place
  of its children (`SessionExpired`), not the error boundary, so it is not SCR-045, the crash screen. Journey 6
  therefore annotates only the screens it asserts: the feed by its cards (twenty, then forty with the first twenty in
  their order) and the listing by its loaded state with its title row (the title, the heart and «⋯»). It checks the
  expired screen by `[data-screen="session-expired"]` without an annotation, as `gates.spec.ts` and `feed.spec.ts` do.
- **Journey 8 covers the gates.** Its direct loads take every entry of the address table, the three gates included:
  `/welcome/language` (SCR-004), `/welcome/city` (SCR-005) and `/no-access?reason=private` (SCR-003), each with its
  scenario. Each waits for its entry's element with `SHOWS_TIMEOUT_MS`, as the coverage passes do. The pill shows on
  the gates as well: the layout's reference and cities reports put it there, and `DemoDataMarker` withholds it only on
  `/outside`, which has its own test.
- **Collapsed chrome.** After a scroll of the feed the chrome is mini, and a first tap on a tab or the view toggle only
  expands it. The journeys expand it before they press, as `feed-continuity.spec.ts` does.

Part 4 (2026-11-23; the step numbers below are those of the handoff of 2026-11-22, which this part replaced):

- **The `perf` project** exists only in the manual run (`E2E_FULL=1`, DEC-100): `testDir` `e2e/perf/`, the tests tagged
  `@perf`, cookie mode, the `android` profile, the 390 × 844 phone, and no trace recording, which would add work to
  the timed tests. Every other project leaves `@perf` out.
  - Each test throttles its own page as its row asks, through a DevTools session it keeps open. Rows 1, 2, 7 and 8
    take the whole profile: 562.5 ms of latency, 1 474.56 kbit/s down, 675 kbit/s up and the CPU four times slower.
    That is Lighthouse's mobile "slow 4G" as DevTools applies it to each request (`e2e/support/perf.ts`). Row 9 takes
    the CPU factor alone, and row 10 nothing.
  - The profile is defined there, not measured. Probes on 2026-11-23: the throttling reaches every request the guard's
    `**/*` route passes on and survives the `/` → `/ru` redirect; a CPU loop ran about 2× slower on a 10-core Mac;
    Chromium then reports `effectiveType` `3g`.
- **Where each row lives** (step 1). `startup.spec.ts`: rows 1, 2, 7 and 8; rows 7 and 8 come from the
  same 20 relaunches, one test per run, each in a fresh context. `chunks.spec.ts`: rows 3, 4 and 5 from one launch, row
  6 from one launch per locale, row 4 with a key, and row 10. `scroll.spec.ts`: row 9.
- **How rows 3 to 6 reach a pull request** (step 2). They are `@budget` tests, which run unthrottled in
  `miniapp-cookie` and `miniapp-header` in the default run, so in both session modes. The workflow's step "Performance
  budget" runs `check-budgets.mjs --runs pr` right after the e2e run, and `--runs pr,perf` in the manual run. Row 4 with
  a key is an `@analytics` test, so it runs only in the analytics run, whose build has the fake key. The step
  "Performance budget of the analytics build" checks it with `--runs analytics`.
- **The check.** Specs write one JSON file per measurement under `test-results/perf/`, and only `check-budgets.mjs`
  judges them against `perf-budgets.json`. The check has to run right after each run, because Playwright empties
  `test-results/` at the start of the next one.
  - "Missing" is a row of the runs named by `--runs` that has no measurement (step 4). A row with `samples` also
    needs that many: 2 for rows 3, 4, 5 and 4 with a key (both modes), 6 for row 6 (three locales in both modes), 20
    for rows 7 and 8. So a mode or a locale that stops running is caught too. A measurement of a row the budget does
    not name fails.
  - A row marked `provisional` is reported, over its limit too, without failing (DEC-103): rows 7 to 9, whose limits
    come from the developer's Mac until the first manual run on GitHub's runner.
  - The report prints every value, so a new limit can be read from the log of the run. `make perf` runs the
    `perf` project against an API of its own (`scripts/dev/e2e-local.sh`) and then the check.
- **Deviation: row 3's method.** `next analyze --output` does not build the app, and the chunk names it reports are
  not `next build`'s: on 2026-11-23 only 1 of 95 client chunk names matched. So the chunk files cannot be taken from
  it.
  - Instead the specs read the body of every script response and look for a marker string per package. The markers
    are `MAP_MARKERS`, `POSTHOG_MARKER`, `SCREEN_MARKERS` and `LOCALE_MARKERS` in `e2e/support/perf.ts`. Each was
    checked against the package's `dist` files and the built chunks.
  - The MapLibre worker files under `/maplibre/` count as map code. They are public files, not chunks. CSS is not
    scanned, because the first-load stylesheet holds Leaflet's class names.
  - Every `@budget` test proves its markers still find what they name, so a renamed string cannot make it pass empty:
    - the map's code, package by package: once the map opens, the marker of every package of the engine it opened
      (`maplibre-gl`, `pmtiles`, `supercluster` for GL; `leaflet`, `leaflet.markercluster`, `protomaps-leaflet`,
      `pmtiles` for Leaflet) must match a chunk, and then the other engine is opened with `?map=` and proved the
      same way; the worker's path does not count here;
    - each screen's code once its address loads (`/listing/<n>/photos`, `/filters`, `/radars/new`, `/settings`); the
      filters form and the radar forms share `filters-footer`;
    - its own locale's message in the launch's bodies.
- **Row 1's moment.** With a session, the cards are in the server's HTML and can show before any script runs.
  "Requested before the first card is visible" would then be a race with the parser. The moment is the first visible
  card with `html[data-session="ready"]`, so the page is hydrated and the feed works. Row 2's moment, on a first launch,
  is the first card itself, which comes after the sign-in. The page marks both moments with a `MutationObserver` from
  an init script (`markMoments`). A script's send time is the browser's (`request.timing().startTime`), on the same
  wall clock as the page's moments.
- **Session present** means a relaunch: a first launch without throttling leaves the cookie, and then the page reloads
  throttled. Playwright turns the HTTP cache off while routes are set, and the guard always sets one, so the relaunch
  downloads every file again, as a cold start does.
- **Bytes** are the compressed bodies, `request.sizes().responseBodySize`. `next start` answers with gzip, as the
  production nginx does. Resource timing's `encodedBodySize` is about 18 bytes per file smaller.
- **Photos of rows 7 and 8.** An answer that a route fulfils itself never crosses the throttled network: a stub photo
  took 4 ms under the throttle. `stubMedia`'s 8 × 6 image is also too small to paint like a photo. So the `perf`
  tests answer the stub photos with the placeholders of `sources:publish-stub-media` (`perfMedia`). While throttled,
  each answer waits the latency plus its bytes at the download rate, which models a CDN on slow 4G. Under the
  throttle the app takes the small photos (`.s.jpg`, about 2.7 KB), as a phone on `3g` would. The LCP element of every
  run was the first card's photo.
  - A limit of the model: each photo waits as if it had the line to itself, so photos never share the bandwidth with
    the scripts. With a session the photo is in the server's HTML, so row 7 mostly measures the document and the
    photo's own transfer. The growth of the scripts shows in rows 1 and 2, not in row 7.
- **Row 9's feed.** The stubs end after 45 cards (20 + 20 + 5), so the whole stub feed stands in for "five feed pages".
  Adding a scenario for it was left out because it would change the contract.
  - The scroll is real touch gestures (`Input.synthesizeScrollGesture`, 600 px at 1 200 px/s) until `[data-feed-end]`
    shows.
  - Frame intervals are sampled only while a gesture runs, so the idle frames between gestures do not dilute the
    share.
  - Full graphics are forced (`homi-graphics=full`), which also keeps the app's own measurement from switching to lite
    in the middle.
- **Found and fixed: the map warm-up raced a first launch.** On a throttled first launch, the warm-up asked for about
  313 KB of map code (MapLibre's chunk alone is 283 KB compressed) 6.9 s after the navigation, before the first card
  showed at 7.3 s. `MapWarmup` started its 2.5 s at the list's mount, as legacy counts 2.5 s on the list view.
  - It now waits first for the list's first content: the first card photo (`firstContent.ts`, whose 8 s cap
    `FIRST_CONTENT_WAIT_MS` the PostHog loader shares), or 8 s without one. Then the 2.5 s start. This changes WP-27's
    rule, whose text says so.
  - The unit tests are in `tests/map/MapWarmup.test.tsx`: the wait, the 8 s cap, StrictMode and a list hidden by
    `<Activity>` while it waits. The tests of the wait and of the 8 s cap fail on the old code; the `<Activity>` and
    StrictMode tests pin the new code's behaviour and would also pass on the old one.
  - Row 2 has no map file since the fix.
- **The first measurement** (2026-11-23; local stack, macOS on Apple Silicon with 10 cores, the build with
  `NEXT_PUBLIC_APP_ENV=ci`, the whole `perf` project with 24 tests in 2.4 min):

  | Row | Measured | Limit in `perf-budgets.json` |
  | --- | -------- | ---------------------------- |
  | 1 | 273 674 bytes (19 files) | 301 042 bytes (+10 %) |
  | 2 | 273 674 bytes (19 files, no map code) | 301 042 bytes (+10 %) |
  | 3, 4, 5, 6 | 0 in both session modes | 0 |
  | 4 with a key (the analytics run) | 0: PostHog's files were asked for about 502 ms after the photo | 0 |
  | 10 | 0 (the `perf` project, cookie mode) | 0 |
  | 7 | p75 1 380 ms of 20 | 1 656 ms (+20 %) |
  | 8 | p75 1 644 ms of 20 | 2 500 ms |
  | 9 | 0.7 % of 1 007 frames | under 20 % |

  - The feed's first load is 274 KB compressed. That replaces the 170 KB proposal of `10` §5.12.
  - Rows 7 to 9 depend on the machine: CPU × 4 is relative to the host. Their limits are `provisional` until the
    first manual run on GitHub's runner, which is done with the run before the pass inside Telegram (DEC-103); a small
    PR then writes the runner's values and drops the flag. Rows 1 and 2 count bytes of the same build, so they should
    not depend on the machine.
- **Route interceptions** (step 7). Before part 4 the specs had 53 `page.route` calls in 24 files (`main` on
  2026-11-23), and none of them is `context.route`. Part 4 adds two, both of class A: the PostHog host in
  `perf/chunks.spec.ts` and `perfMedia` in `e2e/support/perf.ts`. The classes:

  | Class | What the call does | Calls | Verdict |
  | ----- | ------------------ | ----- | ------- |
  | A | Answers a host outside the app | 3 | stays |
  | B | Injects a fault or a delay, or holds or rewrites what the app server serves itself | 26 | stays |
  | C | Watches a request, or switches the scenario cookie as it passes | 2 | stays |
  | D | Fakes a normal API answer | 22 | see below |

  **The rule.** A spec answers a request itself only in these cases:
  1. a host outside the app: telegram.org, tile servers, the stub photos of `cdn.homi.loc`, PostHog;
  2. a fault or a delay: an abort, a held request, a status or a body the API does not send, or the refusal of one
     request among others that a scenario would refuse together, since a reserved scenario also refuses the sign-in;
  3. what the app server answers or serves itself: documents, RSC renders, Server Actions, chunks, and
     `GET /bff/session` without a token;
  4. watching requests, or switching the scenario cookie as a request passes (`switchOnSignIn`);
  5. the sign-in's refusals on `POST /bff/session`, as "Stub scenarios" above keeps them;
  6. the geometry of a read the browser makes in both modes (map points), or a stand-in for a write that the stateless
     stubs do not store.

  Every other fake of a normal API answer is a scenario (`setScenario`, `withScenario`). A fake of a read that cookie
  mode makes on the server holds only in header mode.

  The 22 calls of class D, each with its reason:
  - **Kept by the rule (13).**
    - Rule 2, one refusal among requests a scenario would refuse together: `feed:378` and `gates:328`
      (`unauthenticated` would also refuse the sign-in), and `feed:541` (a 500 the stub does not send, then one
      refused page while `forbidden` would refuse every request of the window). `feed:378` and `gates:328` are
      header-only, and journey 6 proves the same state in both modes.
    - Rule 5, the sign-in's refusals: `feed:167`, `gates:55`, `gates:299`, `session:75`.
    - Rule 6, map geometry: `map:458`, `map:491`, `map-leaflet:520`, `map-leaflet:695`, `map-leaflet:903`.
    - Rule 6, the radar just created: `radar-subscribe:362`.
  - **Not moved yet (9).** Part 4 added no backend scenario, and none of these could move with its meaning unchanged.
    - A new scenario, which is a contract change of WP-12 or WP-13 and their fixtures:
      - a "no radars" answer for the radar list alone: `feed-radar:109`, `return-nudge:154`, `radar-subscribe:246`.
        `empty` also empties the feed, and those tests wait for cards;
      - listing radii: `spot-map:626`, which would then also run in cookie mode.
    - An existing scenario whose answer differs: `new_one` answers 1 where the fake answers 3 (`feed-continuity:60`);
      the test's text changes with it, or it reads the stub's default count as `return-nudge.spec.ts` does.
    - Possibly no fake at all, by the code (not run): a search that matches nothing may give the empty map
      (`map:554`, `map-leaflet:593`), and a `deal=rent_daily` search the note's state (`map:571`,
      `map-leaflet:611`).

    These nine are a small follow-up PR of the development track.
- **What part 4 leaves to steps 14 to 17:** the statements that need staging, Telegram or the closed package. Also:
  - the first manual run on GitHub's runner, which judges rows 7 to 9 and gives their limits (DEC-103);
  - the five runs in a row on `main` (step 9).
- The empty record of the pass inside Telegram is `docs/testing/wave-1-telegram-pass.md` (step 6).

## Handoff

Updated on 2026-11-23, when part 4 was finished.

**Finished.**
- Part 1 (#111, `61d78c6`), part 2 (#112, `27142e3`) and part 3 (#113, `a9e8955`) are merged.
- Part 4 (step 13) is merged as #121 (`a27b277`, 2026-11-23): the `perf` project, `e2e/perf/`,
  `e2e/support/perf.ts`, `perf-budgets.json`, `check-budgets.mjs` with its tests, the CI steps, `make perf`, the
  warm-up fix and the record of the pass inside Telegram. CI of its last commit: `ci` pass, `e2e` pass (927 passed;
  runs 45107265847, 45107265874). Two review rounds; the second found nothing at medium or above.
- "As built" says what each part ships and where it left the design.

**Planned files that do not exist, on purpose.** `e2e/support/modes.ts` and `e2e/support/scenarios.ts` live in
`@homi/testing` (part 1). `e2e/support/annotations.ts` was not written: the tests carry their screen annotations
inline.

**Next, in this order.**
1. **Five runs in a row on `main`** after part 4 is merged, of the pull-request projects on the local stack
   (`scripts/dev/e2e-local.sh`; `HOMI_E2E_API_PORT` when 8080 is taken). One whole run took 25.3 minutes for 919
   tests (#113). Record the result in the next PR of the queue.
2. **Rows 7 to 9 on GitHub's runner** (DEC-103), with the manual run before the pass inside Telegram: `gh workflow
   run frontend-e2e.yml --ref main -f full=true`. The limits of rows 7 and 8 and the measured value of row 9 come from
   a developer's Mac (row 9's 20 % is the app's own lite rule), and CPU × 4 is relative to the host, so the three rows
   are `provisional`: the step "Performance budget" prints them without failing. A small PR writes
   the runner's p75 of rows 7 and 8 with the rule's headroom, keeps row 9 under 20 %, and drops `provisional`. A
   runner that cannot keep row 9 under 20 % is a finding for the developer, not a limit to raise. Rows 1 and 2 should
   match the local values; a difference means the builds differ.
3. **Steps 14 and 15** with the production track: staging, then the pass inside Telegram, recorded in
   `docs/testing/wave-1-telegram-pass.md` and the verification log. What they find comes back as step 16, and step 17
   closes the package.
4. **The nine class-D interceptions** of "As built", part 4: a small follow-up PR.
5. **The lows of part 4's second review**, for any small PR of the development track:
   - `scripts/migration/collect_ids.py` matches `DEC-` and `RK-` with two digits only, so DEC-100 … DEC-103 are
     neither indexed in `ids.csv` nor checked; `\d{2,3}` fixes it (tried on a copy: `--check` exits 0).
   - `check-budgets.mjs` has no test of its entry point: a guard that evaluated false would exit 0 with no output.
     A test that runs it through a symlink, or a CI step that requires the `check-budgets:` line, closes it.
   - The proof of the second map engine in `perf/chunks.spec.ts` counts markers from both launches, so its `pmtiles`
     is satisfied by the GL chunks; count only the scripts after the relaunch.

**WP-40 starts right after part 4 is merged (DEC-102).** It does not wait for steps 14 to 17, although rule 1 of the
queue and "Exit to stage C" would make it wait until this package is `DONE`. A defect that the pass inside Telegram
finds is fixed ahead of the queue (step 16).

**Decisions.**
- The developer's: DEC-100, DEC-101, DEC-102 and DEC-103.
- The choices made while building: the deviations in "As built" and the descriptions of #111, #112, #113 and part 4's
  PR.

**Commands.**
- A spec before its push: `scripts/dev/e2e-local.sh app/e2e/<spec> --repeat-each 10` (step 11, rule 8).
- The throttled rows: `make perf`. The unthrottled rows: `node app/scripts/check-budgets.mjs --runs pr` after a run of
  the PR projects.
- `make e2e` is the run that "Environment" describes; the checklist asks for it green.
- The gates: `make ci-frontend`, `make bundle-check`, and from `frontend/`, `node app/scripts/e2e-coverage.mjs`.
