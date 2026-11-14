# WP-32 — Analytics and error reporting

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-23 |
| Size | ≈ 1 700 changed lines, M |
| Behaviour reference | `03` §1.1 (screen-name precedence), §1.6 (error layers), §1.7 (no replay in lite mode), §1.9 (lazy chunks), §3.3 (journal events and PostHog), §3.4 (constants), defect LB-APP-037; `05` TMA-003, TMA-009, TMA-041, TMA-044; `08` API-034, RES-006; `16` SEC-021, SEC-REQ-022, SEC-REQ-036, SEC-REQ-047; task files KV-FE-034, KV-FE-035, KV-FE-036 (reporting parts) — behaviour, constants, edge cases and test ideas only; their file layout, navigation stack, API paths and transport are not taken |
| Needs from the production track | One PostHog project per environment (staging, production) with its key and host in the environment files of the app as `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` (DEC-47); the same host in `CSP_ANALYTICS_HOSTS`; `NEXT_PUBLIC_BUILD_VERSION` set by the deploy. Until the keys exist the package ships as a no-op for PostHog and is complete for the journal |

## Goal

The two facades that every earlier package already calls — `track()` and `reportError()` — start doing real work:
the 16 legacy journal events reach `POST /api/v1/events`, uncaught errors and render crashes are reported with the
legacy filtering and limits, and the boot guard of WP-21 has an endpoint to report to. PostHog loads lazily under
the legacy rules into HOMI's own project, with screen names derived from routes: the 16 legacy names are kept and
every layer legacy never tracked gets a name. Nothing personal — no `initData`, token, phone or address query —
leaves the browser through either channel.

## Scope

**In.**

- The journal transport behind `lib/analytics/events.ts` and the audit of every `track()` call site.
- Global `error` and `unhandledrejection` handlers, sanitising, de-duplication and the per-launch cap behind
  `lib/errors/report.ts`; the hand-over from the boot guard (TMA-003 is owned by WP-21, its report endpoint is here).
- `app/bff/boot-error/route.ts` and the `events` entry of the pass-through allow-list of WP-22.
- The PostHog loader, its privacy configuration, the manual `$pageview` and the render-error hook.
- Screen tracking: the complete route → screen-name table in `screenNameOf` and the `ScreenTracker` component.
- Defect owned here: LB-APP-037 (fixed, no flag). No screen and no business rule is owned by this package.
- v1 method: `POST /events`.

**Out.**

- The places that call `track()`: WP-21 (`app_launch`, `app_opened`), WP-26 (listing events), WP-30 (follow prompt
  and chat access), WP-31 (home screen). This package only verifies them.
- The boot guard, its inline script and the update screen — WP-21. Crash screen, `error.tsx`, `global-error.tsx`
  and the session-expired screen — WP-23 (they call `reportError`).
- The server side of the journal, server-side PostHog capture and person deletion — WP-47. Until then
  `POST /events` answers from a stub.
- The end-to-end proof across all screens and the bundle check for analytics code — WP-33.
- Landing analytics — WP-61.

## Decisions that bind this package

| Topic | Source | Consequence here |
| ----- | ------ | ---------------- |
| Own analytics | DEC-47, `25` §3.9 | PostHog key and host come from the environment of the app, one project per environment; nothing is read from or sent to the legacy project |
| Defects and flags | DEC-36, `09` §4.3 | LB-APP-037 is a fix without a `DEV` row: every route reports a screen name. No flag belongs to this package |
| One contract | DEC-41, `25` §4.2 | Events go to `POST /events` only; event and property names are the legacy ones (`03` §3.3) so one vocabulary serves both products |
| Session modes | DEC-44, `25` §3.4 | The journal posts through `/bff/events` with the cookie, or with `Authorization: Bearer` in header mode; no event is sent before a session exists |
| No legacy access | DEC-33 | Tests and local runs never reach PostHog or legacy; an absent key means no PostHog code is loaded |
| Replay masking | `25` §3.9, SEC-021, SEC-REQ-036 | Session replay is default-deny: all text and inputs masked, off in lite mode, off unless sampled |
| Logging without personal data | SEC-REQ-047, SEC-REQ-022, TMA-009 | Every payload is scrubbed in the browser and again in the route handler; bodies stay under 8 KB |
| Security headers | `25` §3.10, SEC-REQ-031 | The PostHog host is allowed through `CSP_ANALYTICS_HOSTS`, read by `proxy.ts` (WP-21); SDK code is bundled, so no script host is added |
| Rendering | `25` §3.1 | Nothing here reads cookies during render; all of it is client code plus two route handlers |

## Design

Read before coding: `03-api-reference/03-file-conventions/instrumentation-client.md` (execution timing, the 16 ms
warning, `onRouterTransitionStart`), `03-api-reference/03-file-conventions/error.md` (`error.tsx`, `global-error`),
`02-guides/analytics.md` ("Client Instrumentation"), `02-guides/lazy-loading.md` (dynamic `import()`),
`03-api-reference/03-file-conventions/route.md`, `03-api-reference/04-functions/use-search-params.md` (the
`<Suspense>` requirement), `02-guides/content-security-policy.md` — all under
`frontend/app/node_modules/next/dist/docs/01-app/`. `posthog-js` option names below are the ones recorded from the
legacy client (`posthog-js` 1.434.15, `03` §3.3 and KV-FE-035); confirm each against the installed version —
**verify before use**.

### Modules

| Module | Role |
| ------ | ---- |
| `lib/analytics/events.ts` | Exists since WP-20 (typed map of the 16 events, `track(name, props)`). The no-op body is replaced by a call to the journal; the in-memory record of the last 20 calls stays for tests |
| `lib/analytics/journal.ts` | Queue and transport: `enqueue(event)`, `flush()`, `discard()`; posts `/bff/events` |
| `lib/analytics/scrub.ts` | `scrubText(value)`, `scrubDeep(value, depth = 6)`, `stripUrl(url)`; one implementation for the journal, PostHog and the route handler |
| `lib/analytics/buildVersion.ts` | `BUILD_VERSION` from `NEXT_PUBLIC_BUILD_VERSION`, at most 40 characters, `dev` when unset; reuse the constant of WP-21 if the boot script already defines one |
| `lib/analytics/firstContent.ts` | Exists since WP-24 (`markFirstContent()`); gains `whenFirstContent(timeoutMs)` used by the loader |
| `lib/analytics/posthog.ts` | `initAnalytics(config)`, `trackScreen(screen, props)`, `captureOnce(name)`; owns the dynamic imports |
| `lib/analytics/screens.ts` | `currentScreen()`, `setScreen(name, props)`, `useScreenLayer(name)` for layers that are not addresses |
| `lib/errors/report.ts` | Exists since WP-20 (`reportError(error, { kind, source? })`); gains the real body |
| `lib/errors/sanitize.ts` | Field limits and the source extractor |
| `lib/errors/global.ts` | `installGlobalErrorHandlers()`, `markAppStarted()` |
| `features/shell/ScreenTracker.tsx` | Client Component: address → screen name → `trackScreen` |
| `features/shell/AnalyticsBoot.tsx` | Client Component: watches `useSession()`, flushes or discards the journal, calls `markAppStarted()` and `initAnalytics()` |
| `instrumentation-client.ts` | Installs the global handlers before hydration |
| `app/bff/boot-error/route.ts` | Report endpoint of the boot guard |

### Journal transport

- `track(name, props)` hands `{ name, props }` to the journal — the body of `POST /events` in the WP-11 contract
  (legacy sent the properties at the top level; the contract moved them into `props` and renamed nothing).
  `journal.ts` is the only place that knows the body shape.
- Before the session is `ready` events wait in a queue of at most 20 (oldest dropped). `AnalyticsBoot` calls
  `flush()` when `useSession().status` becomes `ready` and `discard()` when it becomes `outside`, `denied` or
  `expired`. Values measured at call time (`ms` of `app_launch`) are not recomputed at flush time.
- Sending: `fetch('/bff/events', { method: 'POST', keepalive: true, … })`, JSON body. In header mode the
  `Authorization: Bearer` value comes from the session store of WP-21. The journal does **not** use `bffFetch`:
  it must never start a re-authentication, retry, or surface an error state. Every failure, including `401`, is
  swallowed.
- Size: a body over 8 KB after scrubbing is cut (`message` and `source` first) and, if still over, dropped.
- `events` (POST only) is added to `lib/api/bffAllowList.ts`. `boot-error` is registered there as a reserved name
  that the catch-all refuses, so the dedicated handler cannot be bypassed.

### Boot-error endpoint

`POST /bff/boot-error` exists for the inline boot script of WP-21, which runs when the bundle cannot start and
therefore has no session helper. That script posts by `XMLHttpRequest`, only when launch data exists, and never
puts launch data into the body.

| Step | Rule |
| ---- | ---- |
| 1 | Accept `application/json` up to 2 KB from the app's own origin (`Origin` equal to the request host, or absent); anything else gets `204` and is ignored |
| 2 | Keep only `v` and `error.{kind, name, message, source, stage, screen, tg, platform}`; force `kind = 'boot'`, `stage = 'boot'`; apply the limits and scrubbers of `lib/errors/sanitize.ts` again on the server |
| 3 | With a `homi_session` cookie: forward as `app_error` to `POST /events` with that token; ignore the answer |
| 4 | Without the cookie (first launch, header mode, an engine below the floor): write one server log line with `v`, `name`, `tg` and `platform` only — no message, no source, no address, no client address — and store nothing |
| 5 | Always answer `204` with an empty body |

Step 4 is what keeps failures of old engines countable: such a client never gets a session. The line carries no
personal data (SEC-REQ-047).

### Error reporting

- `reportError(error, { kind, source? })` accepts `kind` `error`, `rejection`, `render` and `i18n` (`boot` is
  produced only by the boot guard). It builds `{ v, error: { kind, name, message, source, stage, screen, tg,
  platform } }` and calls `track('app_error', …)`. The catalogue of WP-11 knows four kinds (`boot`, `error`,
  `rejection`, `render`), so an `i18n` report is sent as `kind: 'error'` with `name: 'MissingMessage'` and the key
  path as the message — no contract change.
- Field rules (`lib/errors/sanitize.ts`): `name` = `error.name` or the `typeof` of the thrown value, characters
  outside `[\w.$/-]` removed, at most 40; `message` at most 300; `source` = the given one or the first
  `http(s)://…:line:col` of the stack with `?…` and `#…` removed and `:line:col` kept, at most 300; `screen` =
  `currentScreen()`, at most 40; `tg` = `tg.version()`, at most 10; `platform` = `tg.platform()`, at most 20;
  missing values are `""`.
- `stage` is `boot` until `markAppStarted()` — called by `AnalyticsBoot` when the session is `ready` — then `app`.
- De-duplication by `kind|name|message`; at most 5 distinct reports per launch. Missing-message reports (one per
  key, from WP-20) have their own cap of 3 so that a broken catalogue cannot hide real errors.
- `render` reports also call the hook set by the PostHog loader (`captureException`) when PostHog is loaded.
- `installGlobalErrorHandlers()`:
  - `error` listener: ignores «Script error.» and events without a message;
  - `unhandledrejection` listener: ignores `ApiError` of `@homi/api-client`, results already mapped to a `UiError`,
    and `AbortError`;
  - marks the hand-over for the boot guard of WP-21: once the listeners exist, `BootGuard` sets
    `window.__homiBoot.watching = true` and the guard stops reporting on its own. Entries already collected in
    `window.__homiBoot.errors` are not sent a second time.
- Whether the control-flow errors that `redirect()` and `notFound()` throw can reach these two listeners is not
  stated in the bundled documents: **verify before use**, and ignore them by their marker if they do.
- **Where it is installed.** `frontend/app/instrumentation-client.ts`. The bundled reference says the file runs
  after the document is loaded and before hydration, and that only synchronous top-level code is guaranteed to
  finish before hydration — so the handlers are installed synchronously there and hydration errors are caught.
  The file imports `lib/errors/global.ts` only; that module must not import the PostHog loader, React or the
  catalogue (the reference warns above 16 ms of initialisation in development). If WP-21 already created the file
  for its history counter (`onRouterTransitionStart`), extend it.
- Errors thrown inside Telegram callbacks are re-thrown asynchronously by `safeCallback` of WP-21 (TMA-044) and
  arrive here once.
- Session expiry is not an error report: the journal can no longer authenticate. `AnalyticsBoot` calls
  `captureOnce('session_expired')` (PostHog only, no properties, once per launch).

### PostHog loader

- Configuration has two sources. From the environment: `key` = `NEXT_PUBLIC_POSTHOG_KEY`, `host` =
  `NEXT_PUBLIC_POSTHOG_HOST`, `env` = `NEXT_PUBLIC_APP_ENV`, `build` = `BUILD_VERSION`. From `GET /me` (WP-11):
  `analytics.distinct_id` (a random server-issued value, never the Telegram identifier), `analytics.autocapture`,
  `analytics.replay`, `analytics.replay_rate`, and `team`. `analytics: null` means analytics is off for this
  environment.
- `initAnalytics(config)` runs once per launch and does nothing when the key or the host is missing, when
  `analytics` is `null` or has no `distinct_id`, with Save-Data, or with `navigator.connection.effectiveType` of
  `2g` or `slow-2g`.
- Timing: wait for `whenFirstContent(8000)` (first loaded feed photo, or 8 s), then 500 ms, then
  `import('posthog-js')`. Extensions are imported only when used: web vitals and exception capture always,
  dead-click capture with autocapture, the recorder only when this launch is sampled for replay.
- Before `init`: assert the address has no `tgWebAppData` (WP-21 removes it at boot, TMA-009); if one is found,
  remove it with `history.replaceState` and report once.
- Options, as legacy: `api_host`, `disable_external_dependency_loading: true`, `persistence: 'memory'`,
  `disable_capture_url_hashes: true`, autocapture (unless `analytics.autocapture` is `false`) with
  `dom_event_allowlist ['click','change','submit']`,
  `element_attribute_ignorelist ['href','src','srcset']` and `capture_copied_text: false`, `rageclick`,
  `enable_heatmaps`, `capture_pageview: false`, `capture_pageleave: false`, `disable_surveys: true`,
  `capture_performance { web_vitals: true, network_timing: false }`, `enable_recording_console_log: false`,
  `capture_exceptions: true`, `person_profiles: 'identified_only'`,
  `bootstrap { distinctID: id, isIdentifiedID: true }`.
- Replay: only when `analytics.replay` is true and `Math.random() < (analytics.replay_rate ?? 1)`, never in lite
  mode (`html.lite`). Masking is default-deny:
  `maskAllInputs: true` and a text selector that matches every element (expected `maskTextSelector: '*'` —
  **verify before use**); request names stripped of query and hash. The `.ph-mask` class that WP-26 and WP-31 put on
  phones and author labels stays as a second layer.
- `before_send`: for `$current_url`, `$referrer`, `$initial_current_url`, `$pathname` and every other string that
  parses as an address of the app, keep origin and path only (`stripUrl`); then `scrubDeep` every property except
  `$snapshot`. A drawn search area, filters and deep-link parameters therefore never reach PostHog.
- Super properties: `env`, `build`, `team`, `locale`, `session_mode` (`cookie` or `header`; lets the
  risk of RK-30 be watched and lets WP-33 recognise the mode of a device). `screen` is registered with each
  pageview.
- Scrubbers (`lib/analytics/scrub.ts`), applied to journal bodies and PostHog properties alike: `tgWebAppData=…`
  up to the next `&` or `#`; `Bearer` followed by a token; `homi_session=…`; `+998` phone patterns (masked to
  `+998***`); e-mail addresses.
- The PostHog host is the only new network destination: `connect-src` gets it from `CSP_ANALYTICS_HOSTS`, read by
  `proxy.ts` (WP-21). No `script-src` entry is needed because nothing is loaded from PostHog's asset host.

### Screen tracking

- `screenNameOf(pathname, searchParams)` in `lib/navigation/routes.ts` (WP-20) is completed with the table under
  "Behaviour to reproduce". It reads the reserved parameters `draw` and `step` and no other parameter.
- `ScreenTracker` sits in `app/[locale]/layout.tsx` inside a `<Suspense>` boundary (it uses `useSearchParams`). On
  every change of address it computes the name, calls `setScreen(name, props)` and `trackScreen(name, props)`,
  with `props = { listing_id }` on listing addresses. There is exactly one tracker; route components do not track.
- `useScreenLayer(name)` pushes a name while a component is mounted and visible, for the one layer that has no
  address of its own with flags off: the map selection card (`map/card`). The top layer name wins over the
  address name. `MapSelectionCard` of WP-27 gets this one call in this package's PR.
- `trackScreen` sends `$pageview` with `{ screen, listing_id?, $current_url: origin + '/' + screen, $pathname:
  '/' + screen }`; the same `screen:listing_id` as the previous one is skipped; before PostHog is loaded only the
  last screen is kept and sent right after `init`.
- With `cacheComponents` a route that was left stays mounted but hidden (`cacheComponents.md`, "Navigation with
  Activity"); effects are cleaned up while hidden, so `useScreenLayer` must register in an effect, not in render.

## Files

New:

- `frontend/app/instrumentation-client.ts` (or extended, see Design)
- `frontend/app/lib/analytics/{journal,scrub,buildVersion,posthog,screens}.ts`
- `frontend/app/lib/errors/{sanitize,global}.ts`
- `frontend/app/features/shell/{ScreenTracker,AnalyticsBoot}.tsx`
- `frontend/app/app/bff/boot-error/route.ts`
- `frontend/app/tests/analytics/{journal,scrub,posthog,screens,callsites}.test.ts`,
  `frontend/app/tests/analytics/ScreenTracker.test.tsx`,
  `frontend/app/tests/errors/{report,sanitize,global}.test.ts`, `frontend/app/tests/bff/boot-error.test.ts`
- `frontend/app/e2e/{journal,errors,analytics}.spec.ts`

Changed:

- `frontend/app/lib/analytics/{events,firstContent}.ts`, `frontend/app/lib/errors/report.ts`
- `frontend/app/lib/navigation/routes.ts` (`screenNameOf`), `frontend/app/lib/api/bffAllowList.ts`
- `frontend/app/app/[locale]/layout.tsx` (mounts `ScreenTracker` and `AnalyticsBoot`)
- `frontend/app/features/map/MapSelectionCard.tsx` (`useScreenLayer('map/card')`)
- `frontend/app/.env.example`: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_BUILD_VERSION`,
  and the note that `CSP_ANALYTICS_HOSTS` must name the same host (names and comments only)
- `frontend/playwright.config.ts` (project `analytics`), `.github/workflows/frontend-e2e.yml` (its job; a shared
  file — announce it in the PR as `docs/handoff/parallel-work.md` asks)
- `docs/migration/03-legacy-frontend-audit.md` is **not** edited: the new screen names live in this specification
  and in the test table

## Steps

1. Read the documents listed under Design and the three task files; confirm in `@homi/types` the body of
   `POST /events` (`name`, `props`) and the `analytics` and `team` fields of `GET /me`. Fix the contract
   specification in this PR if the generated types differ from what this text uses.
2. `lib/analytics/scrub.ts` and `lib/errors/sanitize.ts` with their unit tests (pure functions first).
3. `lib/analytics/journal.ts`: queue, flush, discard, size cap, both session modes; unit tests with a fake `fetch`.
4. Replace the body of `track()`; add `events` to the allow-list; `tests/analytics/callsites.test.ts` (every one of
   the 16 names is called somewhere outside tests, and no other name is).
5. `app/bff/boot-error/route.ts` with its handler tests; reserve the name in the allow-list.
6. Replace the body of `reportError()`; de-duplication, caps, `stage`; unit tests.
7. `lib/errors/global.ts` and `instrumentation-client.ts`; check in the browser that a thrown error during
   hydration is reported and that the boot guard stops reporting after the hand-over.
8. `features/shell/AnalyticsBoot.tsx`: flush or discard, `markAppStarted()`; mount it in the root layout.
9. Complete `screenNameOf` and its table-driven test; `lib/analytics/screens.ts` with `useScreenLayer`.
10. `features/shell/ScreenTracker.tsx`; mount it; add the one call in `MapSelectionCard`.
11. `lib/analytics/posthog.ts`: gating, timing, options, `before_send`, replay sampling, render hook; unit tests
    against a mocked module.
12. Environment keys in `.env.example`; confirm `proxy.ts` puts the host of `CSP_ANALYTICS_HOSTS` into
    `connect-src`.
13. Playwright project `analytics` (a build with a fake key and an unroutable host) and
    `e2e/analytics.spec.ts`; `e2e/journal.spec.ts` and `e2e/errors.spec.ts` in the default project, both modes.
14. Deploy with the production track; with real keys on staging, open the app in Telegram and watch the journal
    stub log and PostHog's live events for one launch; run the acceptance checklist; update the queue.

## Behaviour to reproduce

### Journal events (`03` §3.3)

Names and property names are unchanged. `listing_id` is the listing number.

| # | Event | Properties | Trigger | Called from |
| - | ----- | ---------- | ------- | ----------- |
| 1 | `app_launch` | `entry` (`link` / `news` / `menu`), `ms`, `v`, `sdk?`, `js`, `platform` | once per launch when `initData` exists; queued until the session is ready | WP-21 |
| 2 | `app_opened` | `entry: 'link', listing_id, ms` or `entry: 'news' / 'menu', ms` | session and `GET /me` succeeded; never after a refusal | WP-21 |
| 3 | `app_error` | `v`, `error {kind, name, message, source, stage, screen, tg, platform}` | boot guard (`boot`), global handlers (`error`, `rejection`), error files (`render`), missing catalogue keys (sent as `error`) | WP-21 guard through `/bff/boot-error`; this package; WP-23; WP-20 |
| 4 | `follow_prompt_shown` | — | follow nudge shown | WP-30 |
| 5 | `follow_prompt_expired` | — | follow nudge timed out after 10 s | WP-30 |
| 6 | `follow_prompt_closed` | — | follow nudge closed with × | WP-30 |
| 7 | `home_screen_offered` | — | home-screen nudge shown | WP-31 |
| 8 | `home_screen_closed` | — | home-screen nudge closed with × (not on timeout) | WP-31 |
| 9 | `home_screen_added` | — | Telegram reports the shortcut was added | WP-31 |
| 10 | `chat_access_declined` | — | the write-access request was answered "no" | WP-30 |
| 11 | `chat_access_allowed` | — | the write-access request was answered "yes" | WP-30 |
| 12 | `listing_shared` | `listing_id` | share tap, before trying | WP-26 |
| 13 | `original_opened` | `listing_id`, `src` (`button` / `video` / `sources` / `price_history` / `offers`) | an external post link actually opened | WP-26 |
| 14 | `original_copied` | `listing_id` | copy event on the original text | WP-26 |
| 15 | `contact_call` | `listing_id`, `via` (`tel` / `browser`), `src?` (`text`; the contract also allows `author`) | a call attempt that opened something | WP-26 |
| 16 | `contact_write` | `listing_id` | «Написать» link opened | WP-26 |

Rules: fire-and-forget; survives the app closing (`keepalive`); never read, never retried; nothing is sent
without a session (legacy sent an empty credential that the server rejected); the UI never waits for it.

### Errors (`03` §1.6, §3.4)

| Case | Result |
| ---- | ------ |
| Uncaught error with a message | one `app_error`, `kind: 'error'` |
| Unhandled rejection that is not an API result or an abort | one `app_error`, `kind: 'rejection'` |
| Render exception caught by `error.tsx` or `global-error.tsx` | one `app_error`, `kind: 'render'`, plus `captureException` when PostHog is loaded |
| «Script error.», an error without text, `ApiError`, `AbortError` | nothing |
| The same `kind`, `name` and `message` again | nothing |
| A sixth distinct error in one launch | nothing |
| Error before the session is ready | `stage: 'boot'`; afterwards `stage: 'app'` |
| Error source inside an address with `?…` or `#…` | stored without both, `:line:col` kept |
| Message containing `tgWebAppData=…`, a bearer token, a `+998` number or an e-mail | stored scrubbed |
| Error while the bundle cannot start | the boot guard posts `/bff/boot-error`; the update screen is WP-21's |
| Outside Telegram, refused or expired session | the queue is discarded; nothing is sent |

### PostHog (`03` §3.3, §1.7, §1.9)

| Rule | Value |
| ---- | ----- |
| Load | 0.5 s after the first loaded photo, or 8 s after start if none; never before |
| Not loaded at all | no key or host; `analytics: null` or no `distinct_id` in `GET /me`; Save-Data; `2g` or `slow-2g` |
| Persistence | memory only: no cookie, no local storage |
| Identity | the server-issued identifier, marked as identified |
| Pageviews | manual, with the screen names below; duplicates suppressed; one pending screen before load |
| Autocapture | click, change, submit; rage clicks, dead clicks, heatmaps; no copied text |
| Web vitals and exceptions | captured |
| Session replay | only with `analytics.replay`, sampled by `analytics.replay_rate`; never in lite mode; everything masked |
| Address data | origin and path only; no query, no hash |
| Legacy difference | key and host come from the environment instead of the API answer; replay masks all text instead of chosen elements (SEC-REQ-036) |

### Screen names (fix of LB-APP-037)

Addresses are shown without the locale segment. "Legacy" names are the 16 of `03` §3.3 and must not change; "new"
names cover layers legacy never tracked. The legacy precedence (`listing > radar/edit > radar/new > filters >
filters/<kind> > sort > city > map/draw > tab`) follows from the address: the top layer owns it.

| # | Address | Screen name | Kind |
| - | ------- | ----------- | ---- |
| 1 | `/` | `search/list` | legacy |
| 2 | `/map` | `search/map` | legacy |
| 3 | `/map` with `draw=1` | `map/draw` | legacy |
| 4 | `/map` with the selection card open (`useScreenLayer`) | `map/card` | new |
| 5 | `/filters`, also with `pick=city` (the nested picker was never tracked) | `filters` | legacy |
| 6 | `/filters/rooms`, `/filters/price`, `/filters/owner` | `filters/rooms`, `filters/price`, `filters/owner` | legacy |
| 7 | `/sort` | `sort` | legacy |
| 8 | `/city` | `city` | legacy |
| 9 | `/listing/<number>` | `listing` with `listing_id` | legacy |
| 10 | `/listing/<number>/photos` | `listing/photos` with `listing_id` | new |
| 11 | `/listing/<number>/location` | `listing/location` with `listing_id` | new |
| 12 | `/listing/<number>/market` | `listing/market` with `listing_id` | new |
| 13 | `/listing/<number>/actions` | `listing/actions` with `listing_id` | new |
| 14 | `/listing/<number>/actions` with `step=report` | `listing/report` with `listing_id` | new |
| 15 | `/listing/<number>/actions` with `step=detail` | `listing/report/detail` with `listing_id` | new |
| 16 | `/saved` | `saved/favorites` | legacy |
| 17 | `/saved/history` | `saved/history` | legacy |
| 18 | `/radars` | `subs` | legacy |
| 19 | `/radars/new` | `radar/new` | legacy |
| 20 | `/radars/<id>` | `radar/sheet` | new |
| 21 | `/radars/<id>/edit` | `radar/edit` | legacy |
| 22 | `/radars/found` | `radar/found` | new |
| 23 | `/settings` | `settings` | legacy |
| 24 | `/settings/theme`, `/graphics`, `/language`, `/currency`, `/quiet-hours`, `/digest`, `/hidden` | `settings/<page>` (seven names, the address segment) | new |
| 25 | `/welcome/language` | `welcome/language` | new |
| 26 | `/welcome/city` | `welcome/city` | new |
| 27 | `/no-access`, `/outside` | `no-access`, `outside` — used in error reports only; no pageview, because PostHog is never initialised without a user | new |
| 28 | an unknown address (`not-found.tsx`) | `not-found` | new |
| 29 | `/dev/ui` (gallery of WP-23, never on production) | `dev/ui` | new |

The reserved parameters `from`, `focus`, `pick`, `pin` and `i` never change a name. The session-expired screen is
rendered in place and keeps the name of its address.

## Tests

**Unit (Vitest).**

- `scrub.test.ts`: `tgWebAppData` in a query, in a hash and in the middle of a sentence; bearer token; the session
  cookie pair; `+998 90 123 45 67` and `998901234567` forms; e-mail; nested object to depth 6; `$snapshot` left
  untouched; `stripUrl` for the app's addresses and for foreign ones.
- `sanitize.test.ts`: each field limit; `name` from a thrown string and from an object; source taken from a stack
  with and without `:line:col`; query and hash removed.
- `journal.test.ts`: body shape; `keepalive`; queue of 20 before `ready` with order kept; `discard()` on `denied`;
  `ms` unchanged by a late flush; `Authorization` only in header mode; `401`, a network error and a thrown `fetch`
  are swallowed; no re-authentication is started; 8 KB cut and drop.
- `callsites.test.ts`: the 16 names each have a call site; an unknown name fails type checking (`@ts-expect-error`).
- `report.test.ts`: de-duplication; the cap of 5; the separate cap of 3 for missing messages and their mapping to
  `kind: 'error'`, `name: 'MissingMessage'`; `stage` before and after `markAppStarted()`; render hook called for
  `render` only; `screen` taken from `currentScreen()`.
- `global.test.ts`: the ignore list («Script error.», empty message, `ApiError`, `AbortError`); the `watching`
  field is set; an error rethrown by `safeCallback` is reported once.
- `posthog.test.ts` (module mocked, fake timers): no import without key or host, with `analytics: null` or
  without `distinct_id`; no import with Save-Data or `2g`; import at first content + 500 ms and at 8 500 ms
  without content; options snapshot with `autocapture` true and false; `before_send` drops query and hash and
  scrubs nested values; replay off with `replay: false`, and with `replay: true`, `replay_rate: 0.5` and
  `Math.random` stubbed at 0.4 and 0.6; no recorder import in lite mode; pending pageview sent once after load.
- `screens.test.ts`: every row of the screen table, each legacy name asserted literally; reserved parameters
  ignored; `useScreenLayer` top-of-stack rule and cleanup.

**Component (Vitest + Testing Library).**

- `ScreenTracker.test.tsx`: an address change produces one `trackScreen`; the same listing twice produces one;
  listing 41 then 42 produces two.

**Route handler.**

- `boot-error.test.ts`: over 2 KB → `204`, nothing forwarded; foreign `Origin` → `204`, nothing forwarded; extra
  fields dropped; `kind` forced to `boot`; with the cookie → one forwarded request with the token and a scrubbed
  body; without the cookie → no request, one log line that contains none of `message`, `source`, an address.

**End to end (Playwright, fake Telegram, stubs; cookie mode and header mode).**

- `journal.spec.ts`: a scripted launch from the menu and from a listing link records `app_launch` and `app_opened`
  with the right `entry`; opening the original post, sharing and calling record their events with `listing_id`;
  the follow nudge and the home nudge record theirs; no `/bff/events` request before the session exists; none at
  all outside Telegram.
- `errors.spec.ts`: an error thrown from the gallery of WP-23 gives one `app_error` and the crash screen; the same
  error again gives none; a broken chunk (request aborted by the test) makes the boot guard call
  `/bff/boot-error`.
- `analytics.spec.ts` (project `analytics`, PostHog host intercepted): nothing requested before first content;
  the `$pageview` sequence of a journey feed → filters → listing → photos → back; no captured payload contains
  `tgWebAppData`, `Bearer`, `homi_session`, a `?` query or a `#`; with Save-Data emulated no PostHog request at
  all; in header mode, with the `GET /me` answer fulfilled as `replay: true`, `replay_rate: 1`, recorder code is
  requested and no snapshot payload holds a readable text of the page. In the default project (no key) the test
  asserts zero requests to any PostHog host.

## Acceptance checklist

- [ ] Each of the 16 journal events is sent once at its trigger with exactly the listed property names, in cookie
      mode and in header mode.
- [ ] No journal request is made before the session is ready, outside Telegram, after a refusal or after expiry.
- [ ] A journal failure (network off, `401`, `500`) changes nothing on screen and starts no re-authentication.
- [ ] A thrown error, an unhandled rejection and a render crash each produce one `app_error`; a repeat produces
      none; the sixth distinct error produces none.
- [ ] `ApiError`, `AbortError` and «Script error.» produce nothing.
- [ ] An error during hydration is reported (handlers are installed from `instrumentation-client.ts`).
- [ ] A bundle that cannot start posts `/bff/boot-error`; with a session cookie the event is forwarded, without
      one a single log line with four fields is written and nothing else.
- [ ] No journal body, PostHog payload or server log line contains `initData`, a session token, a phone number,
      an e-mail, an address query or an address hash (checked by the unit tests and by `analytics.spec.ts`).
- [ ] Without `NEXT_PUBLIC_POSTHOG_KEY` no PostHog module is requested (local, CI, end-to-end default project).
- [ ] With the key: PostHog loads 0.5 s after the first photo or at 8.5 s; not at all with Save-Data or 2g.
- [ ] PostHog writes no cookie and nothing to local storage.
- [ ] The 16 legacy screen names appear in PostHog's live events of staging exactly as in `03` §3.3 for the
      matching screens; every other address of the table reports its new name.
- [ ] Opening the same listing twice in a row sends one `$pageview`; a screen opened before load is sent once
      after load.
- [ ] With `replay: true` in the `GET /me` answer a recording shows no readable text and no input value; in lite
      mode, or with `replay: false` (the stub default), no recorder code is requested.
- [ ] `session_mode` is present on every PostHog event and equals the mode of the launch.
- [ ] The response headers of staging and production allow the PostHog host in `connect-src` and nothing from
      PostHog in `script-src`; the browser console shows no CSP violation during a launch.
- [ ] `pnpm test`, `pnpm test:e2e` (both projects) and `make ci-frontend` are green; the queue row is updated.

## Handoff

Empty.
