# KV-FE-026 — Theme, safe areas and fullscreen

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-SETTINGS-002, F-TMA-003 |
| Dependencies | KV-FE-011 (tokens), KV-FE-024 (adapter, gates), KV-FE-028 (storage); consumers: KV-FE-040 (applies `meta.theme`), KV-FE-082 (theme sub-page), KV-FE-032 (pre-paint) |

## Goal

The Mini App applies the user's theme choice (`auto | light | dark`) before first paint, uses Telegram `themeParams`
only in auto + light, colours Telegram's header and window background like legacy, and lays out against Telegram's
safe-area and fullscreen variables.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/telegram/theme.js:5-74` (`kv-theme`, `data-scheme` / `data-theme`, header and
  background colour with the 6.1 / 6.9 gates); `$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:196-201`
  (`fullscreenChanged`, `themeChanged`); `$KVADRO_ROOT/demo/app/src/styles/tokens.css:2-68` (roles), `:30-31`
  (insets); `$KVADRO_ROOT/demo/app/src/styles/chrome.css:223-230` and `listing.css:35-43` (`.fullscreen` rules).
- `03` §3.6 (colour roles, theme switching, safe areas, z-index); `05` TMA-016…TMA-021.
- Rules: BR-APP-051 (theme applied at once, saved, rolled back on error — the setting UI is KV-FE-082).

## Implementation

1. `frontend/app/lib/telegram/theme.ts`:
   - `readThemePreference()` from `kv-theme` (`light`/`dark`, anything else `auto`), read synchronously at module load
     and again by the boot shell's pre-paint step (KV-FE-032) so the first frame has the right `data-scheme`;
   - `applyTheme()`: scheme = preference, or `WebApp.colorScheme` (default `light`) in auto; set
     `html[data-scheme]` always, `html[data-theme]` only for an explicit choice; from gate 6.1 call
     `setHeaderColor` / `setBackgroundColor` with the exact `--bg` hex (gate 6.9, `^#[0-9a-f]{6}$`) except auto + light,
     which passes `'bg_color'` — both in `try`;
   - `setThemePreference(pref)`: normalise, write `kv-theme` locally (**not** mirrored to DeviceStorage, as legacy),
     apply; `getThemePreference()`, `isDarkScheme()`.
2. CSS (in `@homi/ui` tokens of KV-FE-011): light roles read `--tg-theme-bg-color`, `--tg-theme-secondary-bg-color`,
   `--tg-theme-text-color`, `--tg-theme-hint-color` only under `html[data-scheme=light]:not([data-theme])`; dark and
   explicit light use the fixed palette; no `prefers-color-scheme` CSS (legacy has none).
3. Safe areas: `--top-inset: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))`,
   `--bottom-inset: var(--tg-safe-area-inset-bottom, 0px)`; no `env(safe-area-inset-*)`, no left/right insets, no
   `--tg-viewport-*`, no `dvh`/`svh`: full-screen layers stay `position: fixed; inset: 0` (TMA-017, TMA-018 absence).
   `viewport-fit=cover` in the root layout's viewport export (KV-FE-032).
4. Fullscreen: KV-FE-024 keeps `html.fullscreen` in sync; this task ports the `.fullscreen` CSS (mini title in
   Telegram's header row, listing hero gradient) into the tokens/utility layer.
5. `themeChanged` (from KV-FE-024) re-runs `applyTheme`; `meta.theme` at boot (KV-FE-040) calls
   `setThemePreference(meta.theme)` and replaces the local value on every start (TMA-021).

## States and texts

| State | `data-scheme` | `data-theme` | Window colour call |
| ----- | ------------- | ------------ | ------------------ |
| auto, Telegram light | `light` | absent | `bg_color` (6.1+) |
| auto, Telegram dark | `dark` | absent | exact `--bg` (6.9+), else `bg_color` |
| explicit light | `light` | `light` | exact `--bg` (6.9+), else `bg_color` |
| explicit dark | `dark` | `dark` | exact `--bg` (6.9+), else `bg_color` |
| outside Telegram / no SDK | from preference; auto → `light` | as above | none |

Setting labels (rendered by KV-FE-082): `settings.theme` «Тема», `settings.theme.auto` «Как в Telegram»,
`settings.theme.light` «Светлая», `settings.theme.dark` «Тёмная».

## Interaction

- No gestures. Theme change is immediate, no transition flash: colour variables switch in one frame; the
  `prefers-reduced-motion` rule of KV-FE-011 applies to any transition.
- Responsive: single column; insets apply in Telegram Desktop as 0.

## Telegram integration

TMA-016 (fullscreen class), TMA-017 (safe areas via CSS variables only), TMA-018 (viewport height: absence kept),
TMA-019 (`themeParams` only in auto + light, four variables), TMA-020 (`setHeaderColor`/`setBackgroundColor`, gates 6.1
and 6.9; `setBottomBarColor` unused), TMA-021 (app theme overrides Telegram; `meta.theme` wins at start).

## Storage and analytics

- `kv-theme`: `auto` / `light` / `dark`; written directly to localStorage, no DeviceStorage mirror (policy table of
  KV-FE-028).
- Analytics: none.

## Files

- `frontend/app/lib/telegram/theme.ts` (new)
- `frontend/packages/ui/src/tokens/telegram.css` (Telegram variable mapping, insets, `.fullscreen` rules)
- `frontend/app/tests/telegram/theme.test.ts`

## API contract

n/a here. The preference is saved by KV-FE-082 through API-025 `PUT /api/settings {"theme": …}` and read from API-001
`meta.theme`.

## Business rules

- Kept: BR-APP-051 (theme applied at once; rollback on save error is KV-FE-082's job).
- No DEV.

## Acceptance criteria

- Each row of the states table produces the listed attributes and colour call on stub SDK versions `6.0`, `6.1`,
  `6.9`.
- With `kv-theme=dark` the first painted frame is dark (no light flash) in the emulator.
- `themeChanged` while in auto switches the scheme without reload; in explicit light it changes nothing.
- Safe-area variables move the top bar and tab bar on a fullscreen iOS client; Desktop shows no extra padding.
- Visual: the feed baselines `feed` (ru light) and `feed-dark-uz` (dark) of KV-QA-019 match in colours and spacing.

## Tests

- Unit (`theme.test.ts`): preference normalisation (`light`, `dark`, `auto`, `x`, missing, storage throwing); the state
  table on versions `6.0`/`6.1`/`6.9`; hex check rejects `rgb(...)` and short hex.
- Visual: `feed`, `feed-dark-uz` side by side (KV-FE-171).

## Edge cases

- `getComputedStyle(--bg)` returns a non-hex value (colour-mix fallback): use `bg_color`.
- localStorage disabled: preference stays `auto` in memory.
- `colorScheme` undefined on very old clients: treated as `light`.

## Security

No user data. `kv-theme` holds no personal data; nothing here touches credentials (SEC-REQ-007).

## Definition of done

`make ci-frontend` green; unit tests green (with KV-FE-010); visual review of the two feed baselines recorded; parity
gate G4 for F-SETTINGS-002 and F-TMA-003 ticked; `09` rows updated; PR reviewed by the other developer.
