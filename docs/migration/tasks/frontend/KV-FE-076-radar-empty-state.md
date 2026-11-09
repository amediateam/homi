# KV-FE-076 — Radar empty state

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-RADAR-001 |
| Dependencies | KV-FE-075 (radar tab) |

## Goal

When the user has no radars, the «Радар» tab shows the legacy empty state (SCR-027): the animated radar sweep with three
blips, the explanation and the primary «Включить радар» that opens the new-radar sheet; the «Нашли жильё?» survey can
still render inside it after the last radar was deleted.

## Legacy reference

- SCR-027 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/radar/RadarEmptyState.jsx:12-51` (blips at 64 %/26 %,
  28 %/62 %, 70 %/70 %; children slot for the survey).
- Rendered by `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:203-205`.
- Animations `radar-turn`, `radar-blip` (`03` §3.6); static in lite mode and under `prefers-reduced-motion`.
- Visual baseline: KV-QA-019 scenario «subscriptions `[]`» → `docs/migration/visual-baseline/SCR-027-*.png`.

## Implementation

1. `frontend/app/app/(miniapp)/features/radar/RadarEmptyState.tsx` (Client Component) with a `children` slot rendered
   after the button (the survey sheet of KV-FE-079 portals itself, so the slot only keeps it mounted).
2. Art: a `div` with the sweep span and three blip `i` elements at the legacy positions; CSS keyframes `radar-turn`
   and `radar-blip` from the tokens of KV-FE-011; disabled under `html.lite` (KV-FE-027) and
   `prefers-reduced-motion: reduce`.
3. Button: primary style, `RadarIcon` 18 px + `sheet.subscribe`; light haptic, then `onCreate()` opens KV-FE-078 in
   create mode starting from the current search filters.
4. The custom `RadarIcon` SVG lives in `@homi/ui` (KV-FE-012).

## States and texts

| State | Texts (keys) |
| ----- | ------------ |
| success (empty list) | `subs.empty` «Радар следит за каналами за вас»; `subs.emptyHint` «Задайте, что ищете: радар круглосуточно проверяет десятки Telegram-каналов и сразу присылает новые подходящие объявления в чат. Выключить можно в любой момент.» |
| action | `sheet.subscribe` «Включить радар» |
| loading / error | owned by KV-FE-075 (spinner, ErrorState) |
| disabled | never; the create sheet handles its own submitting state |

## Interaction

- Tap «Включить радар»: light haptic (TMA-025), open the new-radar sheet.
- Pull-to-refresh still works on this state (KV-FE-046) and reloads the list.
- Layout: the tall empty block centred in the content area above the tab bar; one column, 16 px gutters.
- Motion: the sweep turns continuously and the blips pulse; static frame in lite and reduced motion.

## Telegram integration

TMA-025 (light haptic). No Back handler (base tab).

## Storage and analytics

- Storage: none. Analytics: `$pageview subs` (sent by the tab).

## Files

- `frontend/app/app/(miniapp)/features/radar/RadarEmptyState.tsx` (new)
- `frontend/packages/ui/src/icons/RadarIcon.tsx` (if not added by KV-FE-012)
- `frontend/app/tests/radar/RadarEmptyState.test.tsx`

## API contract

n/a — rendered when API-018 returns `[]` (KV-FE-075).

## Business rules

- Kept: the empty state offers creation (SCR-027); the created radar uses `entry: "empty"` (BR-APP-041, via KV-FE-078).

## Acceptance criteria

- `GET /api/subscriptions → []` shows the art, both texts and the button in ru, uz and en.
- The button opens the new-radar sheet prefilled with the current search filters.
- With lite mode or reduced motion the art is static (no running animation in computed styles).
- Visual: side by side with the `SCR-027` baseline (ru light) — art size and position, text block, button.

## Tests

- Component: renders texts per locale; button calls `onCreate` once; `children` rendered; reduced-motion class applied.
- E2E: delete the last radar → empty state → survey rendered over it when `ask_found: true` (with KV-FE-079).

## Edge cases

- The list becomes empty after a delete while the radar sheet was open → sheet closed first, then this state.
- The radar limit is irrelevant here (0 radars).

## Security

n/a beyond SEC-REQ-021 (texts from catalogues only).

## Definition of done

`make ci-frontend` green; component test green (or added with KV-FE-010); visual review of `SCR-027` recorded in the PR;
parity gate G4 for F-RADAR-001 updated; PR reviewed by the other developer.
