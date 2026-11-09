# KV-FE-027 — Graphics lite mode

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-SETTINGS-003 |
| Dependencies | KV-FE-011 (tokens, `lite` CSS layer), KV-FE-028 (storage policy); consumers: KV-FE-032 (applied before mount), KV-FE-035 (no replay in lite), KV-FE-047 (small photos), KV-FE-057 (forces Leaflet / pixel ratio 1), KV-FE-082 (setting UI) |

## Goal

The new Mini App switches to the legacy "облегчённая" graphics mode on weak Android devices, on a measured janky scroll
or on the user's choice, before the first paint, with the same CSS and JS effects, so slow Telegram WebViews stay
usable.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/graphics.js:5-159` (modes, `kv-graphics`, `kv-graphics-measured`, low-end detection,
  scroll measurement); `$KVADRO_ROOT/demo/app/src/main.jsx:21-22` (`applyGraphicsMode`, `measureScrollPerformance`
  before mount); `$KVADRO_ROOT/demo/app/src/styles/lite.css` (effects).
- `03` §1.7 (mechanism and effects), §3.4 (constants: 150 frames, slow > 28 ms, ≥ 20 %, ≤ 4 cores or ≤ 3 GB);
  TMA-041 (User-Agent performance class `Telegram-Android/… (…; LOW|AVERAGE|HIGH)`, `/Android/`).
- Rules: BR-APP-052 (the setting is shown only on Android or after a change; UI in KV-FE-082).

## Implementation

1. `frontend/app/lib/graphics.ts`:
   - `getGraphicsMode()`: `kv-graphics` `full`/`lite`, else `auto`;
   - `isLowEndDevice()`: UA performance class present → `!== 'HIGH'`; else Android with `hardwareConcurrency ≤ 4` or
     `deviceMemory ≤ 3` (missing values count as 8); iOS and desktop never low-end;
   - `isLiteGraphics(mode)`: `lite`, or `auto` and (`isLowEndDevice()` or `kv-graphics-measured === 'lite'`);
   - `applyGraphicsMode()`: toggles `html.lite`;
   - `setGraphicsMode(mode)`: writes `kv-graphics` (`auto` removes it and also `kv-graphics-measured`), applies;
   - `measureScrollPerformance()`: only Android, mode `auto`, not already lite; sample `requestAnimationFrame`
     intervals while scrolling (pause after 150 ms without scroll, the paused gap is not counted); after 150 intervals
     remove listeners; if ≥ 20 % are > 28 ms and the mode is still `auto`, write `kv-graphics-measured = 'lite'` and
     apply.
2. Run `applyGraphicsMode()` in the pre-paint step of the boot shell (KV-FE-032) and `measureScrollPerformance()` after
   mount; both use local storage only (no DeviceStorage mirror, policy of KV-FE-028).
3. `lite` CSS layer in `@homi/ui` (KV-FE-011): no `backdrop-filter`, solid glass, simpler shadows, translate-only chrome
   collapse, no mini title, `content-visibility: auto` on cards, no radar sweep animation.
4. JS consumers read `isLiteGraphics()` once per mount: map engine forced to Leaflet / raster per FD-3 and pixel ratio 1
   with smaller tile budgets (KV-FE-057, KV-FE-062); thumbnails only (KV-FE-047); no PostHog session replay
   (KV-FE-035).
5. Export a `useGraphicsMode()` hook for the settings sub-page (KV-FE-082), which shows «Авто · <полная|облегчённая>».

## States and texts

| State | `html.lite` | Setting label (KV-FE-082) |
| ----- | ----------- | ------------------------- |
| auto, capable device | off | `settings.graphics.auto` «Авто» · `settings.graphics.full` «Полная» |
| auto, low-end or measured | on | «Авто» · `settings.graphics.lite` «Облегчённая» |
| explicit full | off | `settings.graphics.full` «Полная» |
| explicit lite | on | `settings.graphics.lite` «Облегчённая» |

Hint text `settings.graphics.hint` (blur and slow phones) is rendered by KV-FE-082; full value from
`$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js`.

## Interaction

- No user gesture here. The scroll measurement is passive (`{passive: true}`) and never blocks scrolling.
- Switching mode at runtime toggles the class at once; consumers that read the mode once per mount (map) apply it on
  their next mount — same as legacy.

## Telegram integration

TMA-041: the Telegram-Android performance class in the User-Agent and the `/Android/` test (helpers from KV-FE-024).

## Storage and analytics

- `kv-graphics` (`full` / `lite`, absent = auto) and `kv-graphics-measured` (`lite`): localStorage only, never mirrored.
- Analytics: PostHog super property is unchanged; lite only disables session replay (KV-FE-035). The proportion of lite
  sessions feeds FD-3 (Q-APP-018) through KV-FE-001.

## Files

- `frontend/app/lib/graphics.ts` (new)
- `frontend/packages/ui/src/tokens/lite.css` (new)
- `frontend/app/tests/graphics.test.ts`

## API contract

n/a — device-local only (BR-APP-051: graphics is not saved to the server).

## Business rules

- Kept: BR-APP-051 (graphics is device-local), BR-APP-052 (row visibility, implemented in KV-FE-082); all thresholds of
  `03` §3.4.
- No DEV; no LB item applies.

## Acceptance criteria

- UA `Telegram-Android/11.0 (Pixel; Android 14; SDK 34; LOW)` → lite in auto; `…; HIGH)` → full even with 4 cores.
- Android without the UA class, 4 cores → lite; 8 cores and 4 GB → full; iOS → never auto-lite.
- A synthetic scroll trace with 30 of 150 intervals at 40 ms → `kv-graphics-measured=lite` and `html.lite`; 29 of 150 →
  unchanged.
- Choosing «Авто» after an explicit choice removes both keys and re-detects.
- Visual: `feed-uzs-en-lite` baseline of KV-QA-019 matches (glass replaced by solid surfaces).

## Tests

- Unit (`graphics.test.ts`): the UA and hardware matrix above; mode read/write with storage throwing; measurement with
  fake `requestAnimationFrame` and timers (pause gap excluded, threshold exactly 20 %).
- Visual: `feed-uzs-en-lite` (KV-FE-171).

## Edge cases

- `navigator.deviceMemory` absent on iOS/Firefox: treated as 8.
- The user switches to explicit `full` during a measurement: the result is discarded (mode no longer `auto`).
- localStorage unavailable: mode stays `auto`; measurement result lives only for the session.

## Security

No personal data; the User-Agent is read locally and not sent anywhere by this module.

## Definition of done

`make ci-frontend` green; unit tests green (with KV-FE-010); lite baseline reviewed; parity gate G4 for F-SETTINGS-003
ticked; `09` row updated; PR reviewed by the other developer.
