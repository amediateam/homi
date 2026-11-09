# KV-FE-038 — Dev-only Telegram emulator

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-010 |
| Dependencies | KV-FE-024 (adapter it emulates against); dev bot KV-INF-001 (source of real `initData`), local hosts KV-INF-002; shares its fake bridge with the E2E fixture of KV-FE-170 |

## Goal

Developers can open the new Mini App in a desktop browser on `*.homi.loc`, paste an `initData` from their own dev bot,
and use it like Telegram Desktop: Back and Settings buttons in a dev bar, popups as `confirm()`, links in new tabs,
theme from the system, write access and prepared-message requests answered — without any of this reaching a
production build.

## Legacy reference

- `$KVADRO_ROOT/demo/app/tools/dev/telegram.mjs:1-31` (Vite plugin, `apply: 'serve'`, first script in `<head>`);
  `$KVADRO_ROOT/demo/app/tools/dev/telegram-client.js:1-14` (purpose, stored `kvdev-initData`, hash parameters),
  `:15-45` (skip inside real Telegram; emulated version `8.0`, platform `tdesktop`, Desktop theme palettes),
  `:209-281` (bridge handlers `web_app_setup_back_button`, `web_app_setup_settings_button`, `web_app_request_theme`,
  `web_app_request_viewport`, `web_app_request_safe_area`, `web_app_request_content_safe_area`, `web_app_open_popup`,
  `web_app_open_link`, `web_app_open_tg_link`, `web_app_check_home_screen`, `web_app_request_write_access`,
  `web_app_send_prepared_message`, `web_app_request_fullscreen`, `web_app_close`).
- TMA-045 (dev tooling, not product behaviour), `03` SCR-002 edge cases (the emulator overlays the outside-Telegram
  state).

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/local-development.md` and
   `03-api-reference/02-components/script.md`. The emulator must run **before** `telegram-web-app.js` (the SDK picks
   the bridge at load), so it is an inline script rendered by the `(miniapp)` root layout (KV-FE-032) only when
   `process.env.NODE_ENV === 'development'` (statically removed from production builds) and only outside a real
   Telegram (`!window.TelegramWebviewProxy && window.parent === window`).
2. `frontend/app/dev/telegram-emulator.ts` (compiled to an ES5 string by the same helper as the boot scripts):
   - overlay form on the SCR-002 state: paste an `initData` (or a Mini App URL with `#tgWebAppData=…`); store it in
     **sessionStorage** `kvdev-initData` (the tab session only; legacy used localStorage — dev tooling, no product key);
   - put launch parameters into the hash like a Telegram client: `tgWebAppData`, `tgWebAppVersion` (selectable
     `6.0`…`9.1`, default `8.0`), `tgWebAppPlatform` (`tdesktop`, `ios`, `android`), `tgWebAppThemeParams` (Desktop
     light/dark palettes by `prefers-color-scheme`);
   - emulate `window.TelegramWebviewProxy.postEvent(type, data)` and answer through
     `window.Telegram.WebView.receiveEvent` for every handler listed above; Back/Settings appear in a fixed dev bar;
     `web_app_open_popup` → `confirm()`; links → `window.open`; `web_app_request_write_access` → a dev prompt
     (allowed/denied); `web_app_send_prepared_message` → logs the id; `web_app_close` → a banner;
   - DeviceStorage and LocationManager calls answered with in-memory values when the chosen version ≥ 9.0 / 8.0;
   - a red bar when the API answers `401` (expired `initData`; paste a fresh one).
3. Version and platform switches let developers check every gate of TMA-042 and the Android/iOS branches (TMA-041)
   locally.
4. Export the bridge core (`createFakeTelegram({version, platform, theme, initData})`) for the Playwright fixture of
   KV-FE-170 so E2E and manual runs behave the same.
5. A build check (`next build` output scan in CI) fails when the string `kvdev-initData` appears in production
   artefacts.

## States and texts

Dev-only English UI (no catalogue keys): «Paste initData from your dev bot», «Version», «Platform», «Back»,
«Settings», «initData expired (401) — paste a fresh one». Not translated; never shown in production.

## Interaction

Dev bar fixed top-right; Back and Settings buttons visible only while the app has shown them through the bridge
(`web_app_setup_back_button` / `web_app_setup_settings_button`).

## Telegram integration

TMA-045 (the emulator itself); it exercises TMA-004…TMA-044 through the real SDK, which talks to the emulated bridge.

## Storage and analytics

- `kvdev-initData` in sessionStorage, development only (not a `kv-*` product key, excluded from KV-FE-028's registry).
- Analytics: development builds should run with `meta.analytics` of the developer's environment (no production PostHog
  key locally, `17` §6).

## Files

- `frontend/app/dev/telegram-emulator.ts`, `frontend/app/dev/fakeTelegram.ts` (new)
- `frontend/app/app/(miniapp)/layout.tsx` (dev-only injection, with KV-FE-032)
- `frontend/app/tests/dev/fakeTelegram.test.ts`; CI artefact scan in `frontend.yml` (with KV-FE-010)

## API contract

n/a — the app's own requests go to the local backend (`api.homi.loc` or the legacy-host alias of KV-INF-002), which
verifies the dev bot's `initData` signature.

## Business rules

n/a — dev tooling, not product behaviour (TMA-045).

## Acceptance criteria

- `pnpm --filter app dev` on `https://app.homi.loc` (or the legacy alias) shows the paste form over SCR-002; after
  pasting a dev-bot `initData` the app boots and the dev bar mirrors Back and Settings.
- Switching the version to `6.0` hides SettingsButton and colour calls; `9.0` enables DeviceStorage writes.
- A production build contains no emulator code (artefact scan green).
- Inside real Telegram (dev bot) the emulator does nothing.

## Tests

- Unit (`fakeTelegram.test.ts`): each handler answers with the right event; Back/Settings visibility follows setup
  events.
- CI scan: `kvdev-initData` absent from `.next/static` in production builds.

## Edge cases

- A pasted Mini App URL whose hash contains `tgWebAppData` plus other parameters: only `tgWebAppData` is kept.
- `initData` signed by another bot (staging): the backend answers `401` → red bar (bot tokens differ per environment,
  SEC-REQ-034).

## Security

`initData` of a developer's own dev bot only; never committed, never logged, sessionStorage only and only in
development (SEC-REQ-007 applies to product builds); no production bot token or `initData` is used locally
(SEC-REQ-034).

## Definition of done

`make ci-frontend` green; unit test and artefact scan green (with KV-FE-010); short usage note in `frontend/app/README.md`
(how to get `initData` from the dev bot); parity gate G4 for F-TMA-010 ticked (`n/a` for G10: dev tooling); PR
reviewed by the other developer.
