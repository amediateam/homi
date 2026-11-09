# KV-FE-013 — Sheet and sub-page primitives with gestures

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-004, F-FILTER-001 |
| Dependencies | KV-FE-011 (tokens, z-index ladder), KV-FE-012 (buttons, `UiFeedbackContext`); registers with the layer stack of KV-FE-025 through a callback prop |

## Goal

Two layer primitives reproduce the legacy gestures exactly: a bottom `Sheet` (backdrop, drag-to-close on the handle
area, scroll lock of the page beneath, ref-counted `body.sheet-open`, optional non-dismissible mode) and a full-screen
`SubPage` (slide-in, header shadow when scrolled, swipe-back from the left edge except on Android). Every sheet and
settings sub-page of FE-2 is built from them, and each registers a Back handler with the layer stack.

## Legacy reference

- Sheet drag: `$KVADRO_ROOT/demo/app/src/hooks/useSheetDrag.js:1-212` (`03` §1.2): drag start 6 px; close at 25 % of
  the sheet height or 0.5 px/ms; settle 200 ms; backdrop dims with the drag (fallback alpha 0.4); touchmove on the
  backdrop is cancelled except for horizontal chip strips (`.radar-strip, .fchips.scroll, .hchips`) and the sheet's
  own scrollable body; `body.sheet-open` ref-counted; backdrop tap closes every sheet except the first-launch city
  picker (SCR-005).
- Swipe-back: `$KVADRO_ROOT/demo/app/src/hooks/useSwipeBack.js:24-148`: start 10 px; close at 33 % of width or
  0.5 px/ms; settle 180 ms; disabled on Android (`:27`) and inside `.strip, .scroll, .leaflet-container, input,
  textarea, select, [data-no-swipe]`.
- Sub-page: `$KVADRO_ROOT/demo/app/src/features/settings/SubPage.jsx:1-40` (fixed layer z 40, 24 % slide-in,
  `pushBackHandler`, `useScrolled` header shadow, optional hint under the card, `bare` mode); SCR-033 note in `03`.
- Filters sheet chrome: header/footer heights written to `--fsheet-head` / `--fsheet-foot`, body class `locked`
  (`$KVADRO_ROOT/demo/app/src/features/filters/sheet/useSheetChrome.js:8-26`).
- Constants table: `03` §3.4 rows "Sheet drag", "Swipe-back"; z-index ladder `03` §3.6 (sheet backdrop 50, city sheet
  60, sub-page 40).
- Portals: `MarketSheet` and `FoundSheet` render into `document.body` (`03` §1.1).

## Implementation

1. `frontend/packages/ui/src/layers/Sheet.tsx` (`'use client'`): props `open`, `onClose`, `dismissible = true`
   (false → no drag-to-close, backdrop tap ignored, no Back registration — SCR-005), `variant: 'full' | 'compact'`
   (`csheet qsheet` look), `portal` (render into `document.body`), `header`, `footer`, `registerBack?: (handler) =>
   unregister` (provided by KV-FE-025), `zIndex` token.
2. `useSheetDrag(handleRef, sheetRef, onClose, enabled)` ported with the constants above as named exports in
   `frontend/packages/ui/src/layers/gestures.ts`; pointer/touch handlers read the latest `onClose` through a ref (the
   LB-APP-004 pattern fix applied to every gesture hook).
3. Scroll lock: cancel `touchmove` on the backdrop unless the target is inside an element marked
   `data-scroll-x` (chip strips) or the sheet body is scrollable in the gesture direction; ref-counted
   `body.sheet-open` and `body.locked` helpers (`useBodyClass(name)`), shared with the pull-to-refresh guard of
   KV-FE-046.
4. Sheet chrome measurement: `useSheetChrome()` writes header and footer heights to `--fsheet-head` /
   `--fsheet-foot` with a `ResizeObserver`.
5. `frontend/packages/ui/src/layers/SubPage.tsx`: fixed layer at the sub-page z-index, slide-in animation (24 % offset),
   header shadow via an `IntersectionObserver` sentinel, `hint` paragraph, `bare` mode, `registerBack`, swipe-back
   with `useSwipeBack(ref, onClose, {enabled})`.
6. `useSwipeBack` ported with its constants; the platform check comes from an injected `isAndroid` (KV-FE-024), and
   the excluded selectors become `data-no-swipe` plus native form controls and the map container class.
7. Reduced motion: settle animations jump to the end state (legacy: "JS gestures settle instantly").
8. Dev gallery entries (KV-FE-012 route): a full sheet, a compact sheet, a non-dismissible sheet, a sub-page.

## States and texts

| State | Behaviour |
| ----- | --------- |
| opening | sheet rises (`rise` animation), backdrop fades to `--dim` |
| open | page beneath locked; `aria-modal="true"`, focus moved to the sheet title |
| dragging | sheet follows the finger from 6 px; backdrop alpha scales with the remaining height |
| closing | at ≥ 25 % height or ≥ 0.5 px/ms, animate 200 ms then `onClose`; otherwise settle back |
| non-dismissible | no handle drag, backdrop tap ignored, no Back registration |
| sub-page scrolled | header gets the shadow class |

Text: the close button `aria-label` is `common.close` «Закрыть» (passed by the caller).

## Interaction

Gestures and constants as above; horizontal chip strips keep scrolling inside sheets; Android has no swipe-back (the
system Back and Telegram's BackButton remain); the backdrop tap closes. No extra keyboard shortcut is added (navigation
stays as legacy). Phone layout; sheets cap at the 608 px column on wide Telegram Desktop windows.

## Telegram integration

TMA-022 via `registerBack` (the layer stack calls `BackButton.show/hide`); TMA-015 (vertical swipes disabled by the
adapter so sheet drags are not stolen by Telegram's minimise gesture); TMA-041 (Android check for swipe-back).

## Storage and analytics

n/a. Screen tracking is driven by the layer stack (KV-FE-025 / KV-FE-035), not by these primitives.

## Files

- `frontend/packages/ui/src/layers/{Sheet,SubPage,gestures,useBodyClass,useSheetChrome}.ts(x)` (new)
- `frontend/packages/ui/tests/layers/*.test.tsx` (after KV-FE-010)

## API contract

n/a.

## Business rules

n/a (UI mechanics). Backdrop and Back behaviour per `03` §1.2.

## Acceptance criteria

- Constants equal the legacy ones (exported and unit-tested): 6 px / 25 % / 0.5 px/ms / 200 ms for sheets, 10 px /
  33 % / 0.5 px/ms / 180 ms for swipe-back.
- Two stacked sheets: closing the top one keeps `body.sheet-open`; closing both removes it.
- A non-dismissible sheet ignores backdrop taps and drags.
- Swipe-back never starts on Android or inside a `data-no-swipe` area.
- Visual: the `filters-sheet` (SCR-014), `quick-rooms` (SCR-015) and `tab-settings` sub-page transitions match the
  legacy baselines' resting states; the drag feel is reviewed on a device in KV-FE-174.

## Tests

Gesture unit tests with synthetic pointer events: below threshold → settles back; distance threshold; velocity
threshold; callback ref updates (a new `onClose` passed after mount is the one called); ref-count of body classes;
reduced-motion path.

## Edge cases

- A sheet whose body is scrolled to the top and the user drags down inside the body: legacy only drags from the handle
  area — keep that (no body-drag closing).
- iOS rubber-band scroll under the sheet: cancelled by the backdrop `touchmove` handler.
- Unmount during an active drag: listeners removed, body classes decremented exactly once.

## Security

n/a (no data).

## Definition of done

`make ci-frontend` green; gesture tests green (after KV-FE-010); visual review of resting states recorded; PR reviewed
by the other developer.
