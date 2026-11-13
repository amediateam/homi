# KV-FE-024 — Telegram adapter core

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-002, F-TMA-003 |
| Dependencies | — (consumed by KV-FE-025…KV-FE-031, KV-FE-037, KV-FE-040); test kit KV-QA-003 (signed `initData` for tests) |

## Goal

One typed module owns every access to `window.Telegram.WebApp` in the new Mini App: it waits for the SDK like legacy,
falls back to the native bridge, exposes `initData`, the Telegram language, platform and version gates, prepares the
window (`ready`, `expand`, vertical swipes, fullscreen) and isolates exceptions in Telegram callbacks. No other module
touches the SDK directly.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:9-202` (live `webApp` binding, `postNativeEvent`,
  `waitForTelegramSdk`, `readHashInitData`, `getTelegramLanguage`, `safeCallback`, `initTelegramApp`);
  `$KVADRO_ROOT/demo/app/src/main.jsx:19,40` (3 000 ms wait, `initTelegramApp` as the late-SDK callback).
- TMA-004 (3 s wait, late SDK adopted only when it carries `initData`), TMA-005 (native bridge: `TelegramWebviewProxy`,
  `window.external.notify`, `parent.postMessage`), TMA-006 (initData from SDK, else `#tgWebAppData` read once at module
  load), TMA-008 (language from `initDataUnsafe.user.language_code` or the hash `user` JSON), TMA-014 (`ready`,
  `expand`), TMA-015 (`disableVerticalSwipes` 7.7+), TMA-016 (`requestFullscreen` 8.0+ on `ios`/`android`/`android_x`,
  `fullscreenChanged` → `html.fullscreen`), TMA-040 (`visibilitychange`, not `activated`/`deactivated`), TMA-041
  (platform and User-Agent checks), TMA-042 (version gates), TMA-043 (outside Telegram), TMA-044 (`safeCallback`).
- Startup order: `03` §1.3 steps 5–6; port notes `05` §4.
- Defects: LB-APP-032 → DEV-020 (one language detector; the detector itself lives in KV-FE-015).

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` and
   `03-api-reference/03-file-conventions/instrumentation-client.md` (what may run before hydration). This module is
   plain TypeScript with no React import, so the boot shell (KV-FE-032) and providers can both use it.
2. `frontend/app/lib/telegram/types.ts`: a narrow interface of the WebApp members the app uses (no third-party type
   package; adding `@types/telegram-web-app` would be a dependency change).
3. `frontend/app/lib/telegram/webApp.ts`:
   - `getWebApp()` returns the live instance (re-read after the wait; replaced by a late SDK);
   - `waitForTelegramSdk(timeoutMs = 3000, onLateSdk)`: resolves at once when `Telegram.WebApp` exists, when there is
     no `#tg-sdk` element, or when the boot shell marked `__kvBoot.sdk = 'error'`; else on `load`, `error` or the
     timeout. On settle without an SDK post `web_app_ready` and `web_app_expand` through the native bridge in the legacy
     order (proxy, `external.notify`, `parent.postMessage('*')`), each in `try`. A later `load` with `initData` swaps the
     instance and calls `onLateSdk` (which re-runs `initTelegramApp`);
   - `getInitData()` = SDK `initData` || the hash value captured **once at module evaluation**
     (`#tgWebAppData`), because analytics later strips the hash (TMA-009); `hasInitData()`;
   - `getTelegramLanguageCode()` returns the raw two-letter code (SDK user, else the hash `user` JSON); mapping to a
     locale is KV-FE-015's single detector (DEV-020);
   - `getPlatform()`, `isAndroidPlatform()` (`platform.startsWith('android')`), `getUserAgentPerformanceClass()`
     (`Telegram-Android/… (…; LOW|AVERAGE|HIGH)`, used by KV-FE-027), `getClientVersion()`;
   - `supports(feature)` over one table (below) instead of scattered `isVersionAtLeast` calls; every call site degrades,
     never throws, when the gate is closed;
   - `safeCallback(fn)`: catch, then rethrow on `setTimeout(0)` so the global handler of KV-FE-034 reports it;
   - `initTelegramApp()`: `ready()`, `expand()`, `disableVerticalSwipes()` (7.7), `requestFullscreen()` (8.0 and
     mobile platform), sync `html.fullscreen` from `isFullscreen` and subscribe `fullscreenChanged`, call the theme hook
     of KV-FE-026 and subscribe `themeChanged` — all handlers wrapped in `safeCallback`;
   - `onVisible(cb)`: `visibilitychange` → `visible` subscription (TMA-040); used by KV-FE-040 and KV-FE-068;
   - timing for `app_launch`: `getJsStartTime()` (performance.now at module evaluation) and `getSdkLoadTime()`
     (Resource Timing `responseEnd` of `#tg-sdk`).
4. Outside Telegram (no SDK, no hash): every helper is a no-op or returns `null`; fallbacks for links, share, confirm
   and location live in their tasks (KV-FE-029, KV-FE-030, KV-FE-014, KV-FE-031) and are listed in `README` comments.
5. `frontend/app/lib/telegram/useTelegram.ts`: a tiny hook exposing `{webApp, platform, supports, isFullscreen}` with a
   subscription to `fullscreenChanged`, for components that need re-render on changes.

Version gates (TMA-042), the single table in `supports()`:

| Gate | Features |
| ---- | -------- |
| none (optional call) | `ready`, `expand`, `close`, `HapticFeedback`, `openLink`, `openTelegramLink`, `BackButton`, `onEvent` |
| 6.1 | `setHeaderColor`, `setBackgroundColor` with `bg_color` |
| 6.2 | `showConfirm` |
| 6.9 | exact hex header/background colour, `requestWriteAccess` |
| 7.0 | `SettingsButton` |
| 7.7 | `disableVerticalSwipes` |
| 8.0 | `requestFullscreen` (mobile only), `shareMessage`, home-screen API, `LocationManager` |
| 9.0 | `DeviceStorage` |

## States and texts

n/a — no UI. The states this module reports to others: `sdk: 'loaded' | 'late' | 'missing' | 'error'`,
`initData: present | absent` (absent → SCR-002 via KV-FE-040/KV-FE-041).

## Interaction

- No gestures. Vertical swipes are disabled from 7.7 so sheets and pull-to-refresh own the vertical drag (TMA-015).
- Fullscreen only on `ios`, `android`, `android_x`; Telegram Desktop and Web keep the windowed mode; `exitFullscreen`
  and `fullscreenFailed` stay unused (as legacy).

## Telegram integration

TMA-004, TMA-005, TMA-006, TMA-008, TMA-014, TMA-015, TMA-016, TMA-040, TMA-041, TMA-042, TMA-043, TMA-044. Absences
kept: `viewportChanged`, `safeAreaChanged`, `activated`/`deactivated`, `exitFullscreen` are not subscribed.

## Storage and analytics

- Storage: none.
- Analytics: provides `platform`, `tg` (client version), `js` and `sdk` timings for `app_launch` and `app_error`
  (sent by KV-FE-040 and KV-FE-034); never exposes `initData` to callers other than the API client (KV-FE-021).

## Files

- `frontend/app/lib/telegram/types.ts`, `webApp.ts`, `versionGates.ts`, `useTelegram.ts` (new)
- `frontend/app/tests/telegram/webApp.test.ts`, `versionGates.test.ts` (after KV-FE-010)

## API contract

n/a — no HTTP calls. `initData` is handed only to the API client, which sends it per FD-2 (KV-FE-004, KV-FE-021).

## Business rules

- Kept: TMA-004 3 000 ms wait; late SDK adopted only with `initData`; hash `initData` read once; fullscreen rule.
- DEV-020 `PROPOSED`: the language code feeds the one detector of KV-FE-015 (flag lives there).

## Acceptance criteria

- With a stub SDK present at boot: `waitForTelegramSdk` resolves in the same tick; `ready` and `expand` are called once.
- With `#tg-sdk` never loading: resolves after 3 000 ms; `web_app_ready` and `web_app_expand` are posted through the
  first available bridge; a later SDK `load` with `initData` re-runs `initTelegramApp` exactly once.
- With `__kvBoot.sdk = 'error'`: resolves immediately, bridge events posted.
- `getInitData()` still returns the hash value after the hash is removed from the address bar.
- Each gate of the table is honoured: on version `6.0` no colour call, on `7.6` no `disableVerticalSwipes`, on `7.9`
  no fullscreen, on `8.0` desktop platform no fullscreen.
- An exception thrown inside a `themeChanged` handler does not break later Telegram events and reaches the global
  error handler once.

## Tests

- Unit (`webApp.test.ts`, fake `window.Telegram` and bridges): SDK present / late with and without `initData` / error /
  timeout; bridge priority (proxy → `external.notify` → `postMessage`); hash parsing of `tgWebAppData` with `user` JSON
  (`language_code` `uz-UZ`, `en`, `ru`, missing, malformed JSON).
- Unit (`versionGates.test.ts`): the table for versions `6.0`, `6.1`, `6.2`, `6.9`, `7.0`, `7.7`, `8.0`, `9.0`, and an
  unparsable version string (treated as the lowest).
- Unit: `safeCallback` rethrows asynchronously (fake timers).

## Edge cases

- `isVersionAtLeast` missing on very old SDKs: treat as no gate open except the "none" row.
- Two `load` events (cached script): adoption runs once.
- `requestFullscreen` throws on some clients: caught, `html.fullscreen` stays in sync with `isFullscreen`.
- Telegram Web inside an iframe without the SDK: `parent.postMessage` with origin `'*'` (legacy); the CSP of KV-FE-033
  decides `frame-ancestors` (Q-SEC-012).

## Security

- TMA-009 / SEC-REQ-003: `initData` is never logged, stored, put into a URL or passed to analytics; only the API
  client reads it.
- SEC-REQ-007: nothing here writes to any storage.

## Definition of done

`make ci-frontend` green; unit tests green (added with KV-FE-010); version-gate table reviewed against `05` TMA-042;
parity gate G4 for F-TMA-002 and F-TMA-003 ticked with the PR link (`15` §4); `09` rows updated; PR reviewed by the
other developer.
