# WP-33 — Frontend acceptance on stubs

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-24 … WP-32, WP-34 … WP-38 |
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
  the build, WebKit, the nightly schedule and the check steps. The built-in server is for CI only; on a
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
| `perf` | Chromium, CPU × 4, slow 4G | cookie | `android` | `e2e/perf/*`, nightly and on demand |

Pull requests run `miniapp-cookie`, `miniapp-header`, `miniapp-old` and the two render projects; the others run
nightly and before the pass. The full cross product of locale, theme and mode is done by people, on the checklist.

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
| 4 | `moderation.spec.ts` | listing → «⋯» → hide → «Вернуть»; block author; report fraud; report rented; settings → «Скрытое» → return one → «Показать всё снова» | card leaves and returns; toasts with and without undo; the rented report has no undo; confirm before returning all; «Ничего не скрыто» |
| 5 | `locale-currency.spec.ts` | settings → language `uz` → currency UZS (`uz` scenario) → feed → listing | address segment changes, no reload (a value set on `window` survives); tab labels in Uzbek; numbers with a space as thousands separator; amounts the client formats (price presets, market scale) in сум — the stub's server-formatted card prices stay as the fixture has them and are checked in WP-48 |
| 6 | `session-expiry.spec.ts` | launch → `unauthenticated` → any request → then `auth_expired` on the next sign-in | one silent `POST /bff/session`, the request repeats, the screen continues; then the session-expired screen, «Закрыть» calls the fake `close`, no further request, no BackButton |
| 7 | `source-unavailable.spec.ts` | `source_unavailable` on feed, map, listing, live count, a save | «Не загрузилось» with «Повторить» and recovery; the map error state; the count label keeps its last value; a failed save vibrates only (flags off) and rolls back |
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
| 1 | JavaScript requested before the first feed card is visible, session present | 170 KB compressed (the figure of the earlier plan, `10` §5.12; replace with the measured one) | `perf/startup.spec.ts`: sum of the transfer sizes of script responses up to that moment |
| 2 | The same on a first launch (shell, sign-in, refresh) | measured value + 10 % | same spec, empty context |
| 3 | Map code before the map is opened or warmed up | 0 bytes of MapLibre, Leaflet, PMTiles, supercluster, protomaps | `perf/chunks.spec.ts`: chunk files that hold these packages are taken from `next analyze --output` (`.next/diagnostics/analyze`); none may be requested on the feed within 2 s |
| 4 | PostHog code before first content + 0.5 s, and at all without a key | 0 bytes | same technique |
| 5 | Photo viewer, filters form, radar forms, settings pages on the feed's first load | not requested | same technique |
| 6 | Messages of other locales | not sent | response bodies do not contain a marker string of another locale |
| 7 | First card photo loaded, throttled profile, p75 of 20 runs | measured value + 20 % | `perf/startup.spec.ts`, project `perf` |
| 8 | Largest Contentful Paint on the feed, same profile, p75 | 2.5 s, to be confirmed by the first run | `PerformanceObserver` in the page |
| 9 | Frames over 28 ms while scrolling five feed pages, CPU × 4, full graphics | under 20 % (the share at which the app itself would switch to lite, `03` §1.7) | `perf/scroll.spec.ts`: frame intervals sampled in the page |
| 10 | Second opening of the map | no map chunk requested again | network log |

`frontend/app/scripts/check-budgets.mjs` compares the JSON written by the `perf` project with
`perf-budgets.json`. Rows 3–6 run on every pull request (they need no throttling); rows 1, 2, 7–10 nightly.

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
- `frontend/app/scripts/{e2e-coverage,check-bundle,check-budgets}.mjs`, `frontend/app/perf-budgets.json`
- `docs/testing/wave-1-telegram-pass.md`

Changed:

- `frontend/playwright.config.ts` (projects, tags, reporters), existing `frontend/app/e2e/*.spec.ts` (tags,
  annotations, scenarios instead of interception)
- `frontend/app/lib/api/server.ts`, `frontend/app/app/bff/[...path]/route.ts`, `frontend/app/app/bff/session/route.ts`,
  `frontend/app/lib/actions/run.ts` — only where a path does not forward the scenario cookie of WP-22
- `.github/workflows/frontend-e2e.yml` (stub media, WebKit, the nightly schedule, the check steps), `Makefile`
  (`e2e`, new `bundle-check`) — shared files: announce them in the PR as `docs/handoff/parallel-work.md` asks
- `docs/testing/verification-log.md`, `docs/migration/wave-1/README.md` (status), the specifications of owning
  packages where the acceptance corrected them

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
    nightly job.
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
LB-APP-054 … LB-APP-078 and TMA-046, and TMA-034 is no longer an absence in legacy; they join this checklist with
the owner-cabinet plan.

Since the intake of `index-CIa0Ldj2.js` the audit also holds SCR-063, BR-APP-104 … BR-APP-111, LB-APP-079 …
LB-APP-083 and TMA-047; their lines are in the specifications of WP-34 … WP-38 (for BR-APP-107 and LB-APP-079: WP-57) and join this
checklist with them.
The numbers in the headings below are unchanged (*added by the intake of `index-CIa0Ldj2.js`*).

### Rules (74)

| # | Rules | Package | Proved by |
| - | ----- | ------- | --------- |
| 1 | BR-APP-001 … BR-APP-023 | WP-22 | unit tests of `@homi/search`; visible through `filters.spec.ts` and journey 3 |
| 2 | BR-APP-029, BR-APP-031, BR-APP-044, BR-APP-060 | WP-22 | unit tests of `@homi/i18n/format` (distance, flow, money) |
| 3 | BR-APP-064 … BR-APP-066 | WP-22 | summary and title snapshots in three locales |
| 4 | BR-APP-050 | WP-21 | `launch.spec.ts`, journey 1 |
| 5 | BR-APP-054 … BR-APP-056, BR-APP-058 | WP-23 | `gates.spec.ts`, `shell.spec.ts`, nearest-city unit test |
| 6 | BR-APP-024 … BR-APP-027, BR-APP-030, BR-APP-039, BR-APP-040, BR-APP-059 | WP-24 | `feed.spec.ts`; badge, verdict and photo unit tests; the badge kinds of BR-APP-026 in the badge and card tests (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `badges.ts` and `ListingCard` for a later package (`wave-1/baseline.md`, built code behind the pin, row 1)) |
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
§5). The `no_chat` flow that uses the write-access call is WP-30's code; the report endpoint of the boot watchdog
is WP-32's.

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
- Stability: the pull-request projects pass five times in a row on `main` before the package is closed; the full
  run stays under 15 minutes.

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
| 13 | SCR-013 | Map selection card | WP-27 | pin tap on `/map` | single; stack with its counter; failed slot with retry; × and background close; the shield after the price for a verified owner (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `ListingCard` for a later package (`wave-1/baseline.md`, built code behind the pin, row 2)) |
| 14 | SCR-014 | Filters | WP-25 | `/filters` | every section with its visibility rule; live count and flow; relax chips; reset; «Показать N» and «Ничего нет»; radar button states; pets tip |
| 15 | SCR-015 | Quick filter | WP-25 | `/filters/rooms`, `/price`, `/owner` | three bodies; own reset; live count |
| 16 | SCR-016 | Sort | WP-25 | `/sort` | six options with their availability; a pick closes and scrolls up |
| 17 | SCR-017 | City picker | WP-25 | `/city`; `pick=city` in filters | rows with counts and ✓; location row; header variant saves at once; nested variant changes the draft only |
| 18 | SCR-018 | Listing | WP-26 | `/listing/<number>`, over a list and direct | hero; title row; key facts; market block; facts; stats; history; location rows; author with «Показать номер»; description; source, original with masked numbers, translation; no phone number before a tap, the digits after it; each CTA variant; share; the entrance and the leave animation of the layer, none after a swipe, in lite graphics or under reduced motion (*added by the intake of `index-CBlEKxdL.js`*; a parity item of `RouteOverlay`, `ListingLayer` and `closeListing` for a later package (`wave-1/baseline.md`, built code behind the pin, row 5)) |
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

### Statements

- [ ] Rows 1–48 are ticked in ru, uz and en and in light and dark, with staging screenshots; the reviewer signed.
      Rows 26 … 31 carry the staging screenshot of the "soon" state and local screenshots of the radar screens;
      rows 40, 46 and 47 a staging screenshot of the feed without them and local screenshots of each; all of them
      are ticked inside Telegram in WP-57 (DEC-51).
- [ ] Every line of the acceptance checklists of WP-20 … WP-32 is ticked in its own PR or re-ticked here.
- [ ] `miniapp-cookie` and `miniapp-header` run every spec; a spec cannot opt out of a mode.
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
- [ ] The pull-request projects passed five times in a row on `main`; no test is skipped or marked to fix.
- [ ] `make ci-frontend`, `make e2e` and `make bundle-check` are green; the queue row is `DONE`; the session
      handoff names WP-40 as next.

Exit to stage C: all statements above, plus every contract gap found during stage B written back into
WP-11 … WP-13 with regenerated types, and no open defect that blocks a scenario of the checklist.

## Handoff

Empty.
