# KV-FE-011 — Design tokens and the brand layer in `@homi/ui`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-SETTINGS-002, F-SETTINGS-003 |
| Dependencies | — ; FD-8 (brand assets in the new apps, CF-008, DEC-04) for the brand layer contents |

## Goal

`@homi/ui` exposes the legacy colour roles, radii, insets, z-index ladder, typography and motion as CSS custom
properties with light and dark values, mapped into Tailwind 4 through `@theme`, and a separate brand layer (the yellow
accent, logos, mascots) so the S6 brand move touches one file. The Mini App's `(miniapp)` root layout and the landing
phone demo (LND-036) import the same tokens.

## Legacy reference

- Tokens: `$KVADRO_ROOT/demo/app/src/styles/tokens.css:1-69` (`03` §3.6): roles `--bg`, `--bg2`, `--text`, `--hint`,
  `--sheet`, `--material`, `--dim`, `--link`, `--accent` `#ffd23f` + `--accent-text` `#0b0b0b`, `--sep`, `--fill`,
  `--good` `#16a34a`, `--high` `#ea7a0c`, `--warn` `#b45309`, `--heart` `#ff385c`, badge pairs `--badge-good|high|warn|same`
  (+ `-bg`); radii `--r-s 12px`, `--r-m 16px`, `--r-l 24px`, `--r-photo 18px`; `--tabbar-h 62px`;
  `--bottom-chrome = tabbar + bottom inset + 90px`; insets `--top-inset`, `--bottom-inset` (TMA-017).
- Theme selectors: `:root[data-theme='light']` fixed light palette; `:root[data-scheme='dark']` dark palette;
  Telegram `--tg-theme-*` used only in auto + light (TMA-019, TMA-021).
- Typography: `$KVADRO_ROOT/demo/app/src/styles/base.css:13-22` (`15px/1.4 -apple-system, BlinkMacSystemFont,
  SF Pro Text, Segoe UI, Roboto, sans-serif`, antialiased, tabular numbers), `.small` 13 px.
- Effects: glass `blur(22px) saturate(190%)`; easing `cubic-bezier(.2,.9,.3,1)` 0.25–0.35 s; reduced motion
  (`$KVADRO_ROOT/demo/app/src/styles/states.css:70-77`); lite overrides (`lite.css`, F-SETTINGS-003).
- Z-index ladder (`03` §3.6): map note 5 → topbar 10 → CTA 20 → view toggle 29 → tab bar 30 → map card and mini title 31
  → nudge 35 → sub-page 40 → listing layer 45 → sheet backdrop 50 → toast and city sheet 60 → photo viewer and
  fullscreen map 100 → active pin 1000.
- Assets: mascots `empty-magnifier.svg`, `empty-shrug.svg`, `hooray.webp`, `favicon.svg` (`$KVADRO_ROOT/demo/app/src/assets/`,
  `public/`).
- HOMI: `10` §5.9 (tokens in `@homi/ui`, brand layer, Geist fonts removed); `frontend/packages/ui/src/index.ts` (`cn()`).

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/tailwind-v3-css.md` only for contrast; Tailwind 4
   is configured by `@import "tailwindcss"` + `@theme` in CSS (the apps already use the turbopack loader).
2. `frontend/packages/ui/src/tokens.css`: `:root` roles exactly as legacy (same names and values, including the
   `color-mix` expressions and the `--tg-theme-*` fallbacks), `[data-theme='light']`, `[data-scheme='dark']`, the
   `@supports not (color: color-mix(in srgb, red 50%, transparent))` fallback for `--material`, `--sep`, `--fill`
   (legacy `fallbacks.css`).
3. `frontend/packages/ui/src/brand.css`: `--accent`, `--accent-text`, the logo and mascot URLs as custom properties,
   the product name string for `aria-label`s; the only file to change at S6 (FD-8).
4. `frontend/packages/ui/src/theme.css`: `@theme` mapping roles to Tailwind colours (`--color-bg`, `--color-bg2`,
   `--color-text`, `--color-hint`, `--color-accent`, `--color-good`, …), radii (`--radius-s|m|l|photo`), the z-index
   ladder as named tokens (`--z-topbar: 10`, …, `--z-pin-active: 1000`), font stack, easing `--ease-out-sheet`,
   durations; `.small` text utility.
5. `frontend/packages/ui/src/motion.css`: `@media (prefers-reduced-motion: reduce) { * { transition: none !important } }`
   and stopped `shimmer` / `spin` animations (legacy `states.css`); `html.lite` overrides (no `backdrop-filter`, solid
   glass, simpler shadows) — the switch itself is KV-FE-027.
6. Export the CSS files from `@homi/ui` (`exports` entries `./tokens.css`, `./theme.css`, `./brand.css`) and import
   them in `frontend/app/app/(miniapp)/globals.css`; remove the Geist `next/font/google` imports from the template
   layouts of `app` and `landing` (`10` §5.9: no external font fetch from Telegram WebViews).
7. Copy the mascots and favicon into `frontend/packages/ui/assets/` only after FD-8 says "copy"; until then reference
   placeholders with the same dimensions (120 px mascots, 132 px `hooray`).
8. Token parity check: a test that parses `tokens.css` and compares every legacy role name and light/dark value with a
   table transcribed from the legacy file (values only; no legacy file is read at test time).

## States and texts

n/a — tokens. Light (Telegram auto + light), light explicit, dark: the three palettes are the "states".

## Interaction

Motion tokens: sheet rise 0.25–0.35 s with `cubic-bezier(.2,.9,.3,1)`; reduced motion stops transitions. No width
breakpoints in the Mini App (phone layout, feed column ≤ 608 px); the landing defines its own breakpoints (KV-FE-109).

## Telegram integration

TMA-017 (safe-area variables feed `--top-inset` / `--bottom-inset`), TMA-019 (`--tg-theme-bg-color`,
`--tg-theme-secondary-bg-color`, `--tg-theme-text-color`, `--tg-theme-hint-color` only, in auto + light), TMA-021
(`data-theme` overrides Telegram). Applying the attributes is KV-FE-026.

## Storage and analytics

n/a (`kv-theme`, `kv-graphics` are read by KV-FE-026 / KV-FE-027).

## Files

- `frontend/packages/ui/src/{tokens,theme,brand,motion}.css` (new), `frontend/packages/ui/package.json` (exports)
- `frontend/packages/ui/assets/` (mascots per FD-8)
- `frontend/app/app/layout.tsx`, `frontend/landing/app/layout.tsx` (Geist removed)
- `frontend/packages/ui/tests/tokens.test.ts` (after KV-FE-010)

## API contract

n/a.

## Business rules

Keeps the product-encoding colours: verdict tones `good / high / same / mixed / no_repair / suspicious / check` map to
`--good` / `--high` / `--warn` / `--badge-*` (`03` §3.6); `.danger-row` `#ff5c5c`.

## Acceptance criteria

- Every legacy role, radius, inset and z-index value exists under the same custom-property name with the same light and
  dark values; the parity test passes.
- Switching `data-scheme="dark"` on `<html>` gives the legacy dark palette; `data-theme="light"` ignores Telegram's
  `themeParams`.
- No `next/font/google` import remains in `frontend/app` or `frontend/landing`.
- Brand-dependent values live only in `brand.css`.
- Visual: a token swatch page in the dev build compared with the colours of the `feed` and `feed-dark-uz` baselines of
  KV-QA-019 (`docs/migration/visual-baseline/SCR-007-*.png`).

## Tests

`tokens.test.ts`: role list equality; light/dark value table; `@theme` exports every role; reduced-motion rule present.

## Edge cases

- Engines without `color-mix` (old WebViews, depends on DEC-06): the `@supports not` fallback values render.
- Telegram sends no `themeParams`: the `var(--tg-theme-*, <fallback>)` defaults apply.

## Security

n/a (no data). Assets are first-party; no remote font or CSS URL (CSP `font-src 'self'`).

## Definition of done

`make ci-frontend` green; parity test green (after KV-FE-010); visual swatch review recorded; PR reviewed by the other
developer.
