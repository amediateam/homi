# KV-FE-012 — Shared UI primitives

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-005, F-FEED-001 |
| Dependencies | KV-FE-011 (tokens); KV-FE-016 (catalogue keys) and KV-FE-029 (haptics) are injected, not imported, so this task can land first; FD-8 (mascots); `lucide-react` per KV-FE-005 entry 8 (inline SVG fallback until approved) |

## Goal

`@homi/ui` holds the building blocks every screen reuses, with the legacy look and ARIA: buttons, the two chip kinds,
the switch, settings group / row / choice list, spinner and skeleton bars, the error state (offline vs server) and the
empty state with a mascot, plus the two custom icons. Haptics and texts come in through props or a small context, so
the package stays free of Telegram and i18n imports.

## Legacy reference

- Components (`03` §2.1): `$KVADRO_ROOT/demo/app/src/components/Chip.jsx` (`HeaderChip` `hchip` / `on`, `aria-label`;
  `FilterChip` `fchip` with `aria-pressed`; light haptic on tap), `Switch.jsx` (`role="switch"`, `aria-checked`, click
  does not bubble, light haptic), `ErrorState.jsx:13-26` (`WifiOff` vs `CloudOff`, `tall` variant, retry button with
  `RotateCw`), `icons/RadarIcon.jsx`, `icons/InstagramIcon.jsx`; settings building blocks
  `$KVADRO_ROOT/demo/app/src/features/settings/{SettingsGroup,SettingsRow,ChoiceList}.jsx`.
- Error rules: `03` §1.6 (offline = `ApiError` status 0; otherwise server text); `08` §1.5.
- Empty states use mascots `empty-magnifier.svg` (search) and `empty-shrug.svg` (favourites, history, crash), 120 px
  (`03` §3.6); radar uses its animated sweep (KV-FE-076).
- Styles: `$KVADRO_ROOT/demo/app/src/styles/{header-chips,states,settings,feedback}.css` (read for measurements only).
- Visual baselines: chips in `feed` (SCR-007), error in `x-feed-error` (SCR-008), empty in `x-feed-empty` (SCR-009),
  settings rows in `tab-settings` (SCR-032).

## Implementation

1. Components in `frontend/packages/ui/src/components/` (Client Components where interactive, `'use client'` at file
   top): `Button` (`primary` accent, `secondary`, `danger` `#ff5c5c` row style, `pill` 48 px), `HeaderChip`,
   `FilterChip`, `Switch`, `SettingsGroup` (title + footer hint), `SettingsRow` (label, value, chevron, `danger`),
   `ChoiceList` (radio list with ✓), `Spinner`, `SkeletonBar` / `SectionSkeleton` (3- and 4-line blocks with shimmer),
   `ErrorState`, `EmptyState`, `Badge` (good / high / warn / same pairs), `IconButton`.
2. `UiFeedbackContext` with `haptic(kind)` (`light`, `medium`, `success`, `error`) — the Mini App provides the
   Telegram implementation (KV-FE-029); the landing demo passes a no-op.
3. `ErrorState` props: `kind: 'offline' | 'server'` (the caller maps typed API errors, KV-FE-021), `onRetry`, `tall`,
   `texts` (title, body, retry). Default texts are resolved by the caller with the keys below.
4. `EmptyState` props: `mascot: 'magnifier' | 'shrug'`, `title`, `hint`, optional `action`.
5. Icons: when `lucide-react` is approved, re-export the used icons (Search, Heart, Settings, Lock, Globe, MapPin,
   WifiOff, CloudOff, RotateCw, X, ChevronRight, Trash2, Eye, Play…) from `@homi/ui/icons`; until then the same names
   as inline SVG components with `aria-hidden`. `RadarIcon`, `InstagramIcon` ported as SVG components.
6. Accessibility beyond legacy (defect-class fixes): every icon-only button has an accessible name; `Switch` handles
   Space/Enter natively (it is a `<button>`); focus ring visible with `:focus-visible` (tokens).
7. A dev-only gallery route `frontend/app/app/(miniapp)/dev/ui/page.tsx`, excluded from production builds by an env
   check, to review the primitives against the baselines.

## States and texts

| Component | States | Keys (ru) |
| --------- | ------ | --------- |
| `ErrorState` offline | network or timeout (`status 0`) | `error.offline` «Нет связи», `error.offlineText` «Проверьте интернет и попробуйте ещё раз.», `error.retry` «Повторить» |
| `ErrorState` server | any other failure | `common.loadFailed` «Не загрузилось», `error.serverText` «Сервер не ответил. Попробуйте ещё раз через минуту.», `error.retry` |
| `Button` | enabled, pressed (`opacity .7`), disabled (busy) | — |
| `FilterChip` / `HeaderChip` | off, on (`aria-pressed` / highlighted) | caller texts |
| `Switch` | off, on, disabled | — |
| `SectionSkeleton` | loading (shimmer; static under reduced motion) | — |
| `EmptyState` | magnifier / shrug | caller texts, e.g. `feed.nothing`, `feed.favEmpty` |
| close buttons | — | `common.close` «Закрыть» (`aria-label`) |

## Interaction

Light haptic on chip, switch and button taps (`impactOccurred('light')`; `medium` for primary actions per TMA-025);
`button:active { opacity: .7 }`; `-webkit-tap-highlight-color: transparent`; no hover styles needed for touch, but
desktop Telegram gets a pointer cursor. Phone layout only.

## Telegram integration

TMA-025 through the injected `haptic` function (no direct `Telegram.WebApp` access in `@homi/ui`).

## Storage and analytics

n/a. Elements that legacy masks in session replay (`.ph-mask`) accept a `mask` prop that adds the class (used for
phone numbers by KV-FE-068 and KV-FE-085).

## Files

- `frontend/packages/ui/src/components/*.tsx`, `frontend/packages/ui/src/icons/*.tsx`, `src/feedback.tsx` (new)
- `frontend/packages/ui/src/index.ts` (exports)
- `frontend/app/app/(miniapp)/dev/ui/page.tsx` (dev gallery)
- `frontend/packages/ui/tests/*.test.tsx` (after KV-FE-010)

## API contract

n/a.

## Business rules

n/a beyond `03` §1.6 (offline vs server split).

## Acceptance criteria

- Each primitive renders in light and dark with the legacy measurements (chip height, 48 px pills, 16 px gutters,
  radii from tokens) — side by side with the SCR-007, SCR-008, SCR-009 and SCR-032 baselines of KV-QA-019.
- `ErrorState` shows the offline texts for `kind: 'offline'` and the server texts otherwise; retry calls `onRetry` once
  per tap.
- `Switch` click does not trigger the parent row; `FilterChip` exposes `aria-pressed`.
- No import of Telegram, i18n or API code inside `@homi/ui` (lint rule or a test on the import graph).

## Tests

Component tests: chip `aria-pressed` toggling and haptic callback; switch event isolation; error state kind mapping;
empty state renders the mascot with `alt=""`; skeleton respects `prefers-reduced-motion` (class check).

## Edge cases

- Very long labels in chips (uz strings are longer): ellipsis, no wrap, `title` attribute with the full text.
- Missing mascot asset (FD-8 pending): the placeholder keeps the 120 px box so the layout does not jump.

## Security

Texts rendered as React text nodes only (SEC-REQ-021); no `dangerouslySetInnerHTML` in the package.

## Definition of done

`make ci-frontend` green; component tests green (after KV-FE-010); visual review against the named baselines recorded;
PR reviewed by the other developer.
