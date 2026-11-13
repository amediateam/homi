# KV-FE-082 — Settings › Theme and Graphics

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-SETTINGS-002, F-SETTINGS-003 |
| Dependencies | KV-FE-081 (settings screen, sub-page wiring), KV-FE-026 (theme application, Telegram colours), KV-FE-027 (graphics mode); backend KV-BE-045 (API-025); decisions: DEV-016 `PROPOSED` |

## Goal

Two settings sub-pages with the legacy behaviour: **Theme** (SCR-033) applies «Как в Telegram / Светлая / Тёмная» at
once — page colours and Telegram header and background — then saves it to the profile and rolls back on failure;
**Graphics** (SCR-034) switches «Авто · …» / «Полная» / «Облегчённая» on the device only.

## Legacy reference

- SCR-033, SCR-034 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/settings/SettingsPages.jsx:12-44` (`ThemePage`,
  `GraphicsPage`), `SettingsScreen.jsx:97-114` (`pickTheme`), `:128-134` (`pickGraphics`), `ChoiceList.jsx:11-28`,
  `format.js:30-37` (`THEME_OPTIONS`, `graphicsAutoLabel`).
- Theme mechanics: `$KVADRO_ROOT/demo/app/src/lib/telegram/theme.js:7-62` (`kv-theme`, `data-theme` / `data-scheme`,
  header and background colour); TMA-019, TMA-020, TMA-021.
- Graphics mechanics: `$KVADRO_ROOT/demo/app/src/lib/graphics.js:6-103` (`GRAPHICS_MODES = ['auto','full','lite']`,
  `setGraphicsMode` clears `kv-graphics-measured` on `auto`); `03` §1.7.
- Rules: BR-APP-051 (theme: apply, save, roll back; graphics: device-local only), BR-APP-052.
- Defects: LB-APP-027 → DEV-016 (theme save failure only vibrates).
- No KV-QA-019 baseline for SCR-033/SCR-034; compare with the legacy sub-page markup (`SubPage.jsx`) and SCR-032.

## Implementation

1. `frontend/app/app/(miniapp)/features/settings/ThemePage.tsx`: sub-page (KV-FE-013) titled `settings.theme` with a
   choice list of `auto`, `light`, `dark`. Pick a different value → light haptic → `setThemePreference(next)` of
   KV-FE-026 (writes `kv-theme`, sets `data-theme` / `data-scheme`, calls `setHeaderColor` / `setBackgroundColor` per
   the version gates 6.1 / 6.9) → `PUT /api/settings {theme}`; failure → restore the previous preference the same way,
   error haptic, and with DEV-016 (flag `dev016ErrorToastOnFailure`) toast `common.saveFailed`.
2. `GraphicsPage.tsx`: sub-page titled `settings.graphics` with hint `settings.graphics.hint`; options in the order
   `auto`, `full`, `lite`; the `auto` label is «Авто · полная» or «Авто · облегчённая» from the current measured result
   (`graphicsLabel` of KV-FE-081). Pick → light haptic → `setGraphicsMode(mode)` of KV-FE-027 (`kv-graphics` set for
   `full`/`lite`, removed for `auto`, which also clears `kv-graphics-measured`; `html.lite` toggled at once). No API call.
3. Both pages report the new value to the settings screen so the row value updates without a reload.
4. The theme is overwritten by `meta.theme` at the next launch (TMA-021) — the server copy saved here keeps them in sync.

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| theme options | `settings.theme.auto` «Как в Telegram», `settings.theme.light` «Светлая», `settings.theme.dark` «Тёмная»; the selected row shows a check |
| graphics options | `settings.graphics.auto` «Авто» · lower-case `settings.graphics.full` «полная» / `settings.graphics.lite` «облегчённая»; `settings.graphics.full` «Полная»; `settings.graphics.lite` «Облегчённая» |
| graphics hint | `settings.graphics.hint` «Облегчённая — без размытия под панелями и на фото: на слабых телефонах лента листается плавнее. «Авто» включает её сама, если телефон слабый или лента подтормаживает.» |
| theme saving | the new theme is already visible; no spinner |
| theme error | previous theme restored; error haptic; with DEV-016 `common.saveFailed` «Не получилось сохранить» |
| loading / empty | n/a (options are local) |

## Interaction

- Sub-page chrome: slide-in 24 %, swipe-back (not on Android), Telegram Back, header shadow when scrolled (KV-FE-013).
- Theme change re-colours the whole app instantly, including the Telegram header (6.1+) with the exact `--bg` hex from
  6.9 (auto + light passes `bg_color`, TMA-020).
- Graphics change applies `html.lite` immediately: glass blur, shadows and the radar animation switch without reload.

## Telegram integration

TMA-019 (`themeParams` only in auto + light), TMA-020 (header and background colour), TMA-021 (app theme overrides
Telegram; `meta.theme` wins at launch), TMA-041 (Android detection for the graphics row), TMA-022 (Back), TMA-025
(haptics).

## Storage and analytics

- `kv-theme` (`auto` / `light` / `dark`, not mirrored), `kv-graphics` (`full` / `lite`, absent = auto, not mirrored),
  `kv-graphics-measured` (`lite`) — names unchanged (`03` §3.2).
- No events; `$pageview settings/theme`, `settings/graphics` through KV-FE-035 (proposed names).

## Files

- `frontend/app/app/(miniapp)/features/settings/ThemePage.tsx`, `GraphicsPage.tsx` (new)
- `frontend/app/tests/settings/ThemePage.test.tsx`, `GraphicsPage.test.tsx`

## API contract

- API-025 `PUT /api/settings {"theme": "auto"|"light"|"dark"}` → `200 SettingsResponse` (not read for theme).
  Errors: `422`, `401`, `403 <reason>`, `429`, network → rollback.
- Graphics: none.

## Business rules

- Kept: BR-APP-051, BR-APP-052.
- DEV-016 `PROPOSED` (flag).

## Acceptance criteria

- Choosing «Тёмная» switches the app and the Telegram header to the dark palette before the request finishes; a `500`
  restores «Как в Telegram» (or the previous value) and the check moves back.
- Choosing «Облегчённая» sets `kv-graphics=lite` and `html.lite`; choosing «Авто» removes `kv-graphics` and
  `kv-graphics-measured`; no request is sent.
- The «Авто» label reflects the measured mode («Авто · облегчённая» on a low-end Android).
- Review against SCR-032 row styles and the legacy sub-page layout recorded in the PR.

## Tests

- Component: theme pick → `setThemePreference` then `PUT`; failure → rollback; same value → no request;
  `todo('DEV-016 PROPOSED')`.
- Component: graphics pick for each mode → storage writes and `html.lite`; auto label variants.

## Edge cases

- Telegram older than 6.1 → no header colour call (version gate), page colours still change.
- Two quick theme taps → the second waits for the first or supersedes it; the final state equals the last tap if both
  succeed.
- `localStorage` unavailable → theme and graphics apply for the session only.

## Security

n/a beyond SEC-REQ-007 (no credentials stored) and SEC-REQ-021.

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); review recorded in the PR; parity gate G4 for
F-SETTINGS-002 and F-SETTINGS-003 ticked (`15` §4); rows in `09` updated; PR reviewed by the other developer.
