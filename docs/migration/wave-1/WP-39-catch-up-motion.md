# WP-39 — Catch-up: motion and small UX

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | intake `index-YX9bFVws`; WP-38 (the queue's order of 2026-11-20, `decisions/2026-11-20-developer-answers.md`; both edit `FeedScreen` and `RadarSheetRoute`) |
| Size | about 2 100 changed lines with tests, L (the integrator's estimate; if the PR passes 3 000 lines, split it at the line between "Leave" and the rest, and give the second half the next free number) |
| Behaviour reference | `03` §1.2, §2 (SCR-007, SCR-014, SCR-015, SCR-022, SCR-028 … SCR-031, SCR-032, SCR-042), §2.1, §3.4, §3.6, §4 (BR-APP-112 … BR-APP-118, BR-APP-121), §5 / §5b (LB-APP-085, LB-APP-086, LB-APP-087, LB-APP-089, LB-APP-091); `wave-1/baseline.md`, built code behind the pin, rows 44 – 54 |
| Needs from the production track | the regular deploy; then the manual checks inside Telegram on staging that the acceptance checklist names |

## Goal

The built screens move as the pinned release `index-YX9bFVws.js` does. A sheet, a sub-page and a toast leave instead
of vanishing; the counters of the filter sheets roll; «Сохранить» and «Включить радар» show a spinner and then a tick
before the sheet closes; the favourite heart springs and bursts; an action toast shows its countdown; the segmented
control's thumb slides; the chrome's springs and the market marker take the release's curves. The survey congratulates
after "where found" instead of closing, and the search feed says «Это всё по вашему поиску» at its end (DEC-90).

## Scope

In (paths under `frontend/app/` unless they start with `frontend/packages/`; sizes are estimates):

- Rows 44 – 46, about 650 lines: the leave of sheets, sub-pages and toasts (BR-APP-112).
- Row 47, about 230: the rolling numbers of the filter footers (BR-APP-113).
- Row 48, about 320: the save phases of the radar sheets (BR-APP-114).
- Row 49, about 200: the favourite's heart and burst (BR-APP-117).
- Row 50, about 100: the countdown ring of action toasts (BR-APP-118).
- Row 51, about 120: the segmented control's thumb (BR-APP-121).
- Row 52, about 70: the changed curves, the market marker by transform, the clip radii.
- Row 53, about 130: the survey's «Поздравляем!» step (BR-APP-116, its first half).
- Row 54, about 80: «Это всё по вашему поиску» (DEC-90).
- The end-to-end spec that reads the animations in the browser, about 200.

Out:

- The tips' leave (the request tip, the owner chip's tip), the fill hints' and the photos' rolling numbers, the owner
  form's save phase, the upload ring and the limit ring: the cabinet's packages (WP-81, WP-82, WP-83), which reuse
  the leave helper, `RollNumber` and the save phase of this package.
- The owner invitations and the survey's landlord block: WP-82, only while the cabinet is on (DEC-89, DEC-91).
- The settings sub-pages themselves: WP-31. This package gives `SubPageFrame` its leave, so WP-31's pages have it.
- No motion in lite graphics beyond legacy's own rule (LB-APP-086): a proposal, not adopted (DEC-93). The leave is off
  in lite, as legacy has it; the rolling numbers, the heart, the burst, the thumb and the save tick play in lite, as
  legacy has them.

## Decisions that bind this package

- DEC-93: everything of the release's motion on built screens is ported, as legacy has it; lite graphics follow legacy.
- DEC-90: «Это всё по вашему поиску» shows at the end of the search feed also while the cabinet is off (DEV-064).
- DEC-64: HOMI re-opens the radar sheet after a listing instead of legacy's parked mount; the close of the radar sheet
  for a listing opened from it plays no leave, as legacy's parked sheet does not.
- DEC-89: nothing of the owner invitations or the landlord block is built here.

## Design

### Leave

Legacy plays the leave from a copy: when a sheet, a sub-page or a toast unmounts, a layout effect's cleanup clones the
node while it is still in the document, inserts the clone where the node was, marks it inert and animates it out by
the Web Animations API (`03` §1.2, BR-APP-112). HOMI's sheets are routes (`RouteSheet` closes by `back()`), its
sub-pages are routes too, and Next hides a route in `<Activity>`, which also runs the layout effects' cleanups. So the
copy is the one approach that does not depend on how the layer closes (Back, ×, backdrop, Escape, a route change).

- `frontend/packages/ui/src/lib/leave.ts` (new): `playLeave(node, kind)` and `useLeave(ref, kind)` (a layout effect
  whose cleanup plays the leave), with legacy's durations and curves per kind:
  - sheet: 280 ms; the backdrop's colour to transparent (`ease-out`), the sheet `translateY(100%)`
    (`cubic-bezier(0.3, 0, 0.2, 1)`), other children opacity 0 in 160 ms;
  - sub-page: 200 ms, `translateX(24%)` and opacity 0, `cubic-bezier(0.4, 0, 1, 1)`;
  - toast: 180 ms, `translateY(10px)` and opacity 0, the same curve.
  - Every animation `fill: forwards`; the copy goes when all finish or after 600 ms at the latest.
- The copy: `cloneNode(true)`, the scroll positions of the node and its descendants copied, class `leave`,
  `aria-hidden`, `inert`; `.leave, .leave *` stop every CSS animation and transition and every pointer event, so no
  entrance replays on the copy (`frontend/packages/ui/src/styles/motion.css`).
- Where the copy goes: legacy inserts it into the node's parent. HOMI's sheets are portalled by Radix
  (`BottomSheet.tsx:209`), and a hidden route's host nodes get `display: none`, so the copy goes into one leave layer
  at the end of `body` with the node's box (position and size read before the clone), unless the parent is a portal
  container that stays shown. The browser check of the end-to-end spec decides.
- Skip rules, all of legacy's: reduced motion; `html.lite`; a close by gesture (the drag of `useSheetDrag` and the
  swipe of `useSwipeBack` mark the node `data-gone`, the toast's drag leaves an inline transform); the radar sheet
  closed for a listing opened from it (DEC-64, legacy's `.parked`); a parent no longer in the document; and a new node
  of the same kind in the same commit (a toast replaced by a toast, a sheet by a sheet), checked in a microtask
  against a snapshot taken in the cleanup.
- Wiring: `BottomSheet` (every sheet: `RouteSheet`, the city picker, the gallery's samples), `SubPageFrame`, and the
  toast surface of `ToastHost`. Focus does not move to the copy; the focus return of the sheets stays as built.

### Rolling numbers

`frontend/packages/ui/src/components/RollNumber.tsx` (new): one column per digit of `max(0, round(value))`, a hidden
digit giving the width, a strip of 0 – 9 shifted by `translateY(-digit × 10 %)`; 0.62 s on legacy's spring
(`linear()` with `--ease-spring` as the fallback); the rightmost digit first, 45 ms apart; columns keyed from the end;
`aria-label` the plain number, the columns `aria-hidden`; no transition under reduced motion.

`rollText(format, value)` in the app: the message formatted with a sentinel in place of `{n}` and split around it, as
legacy does; it serves only messages with a plain `{n}` (no plural), which holds for `sheet.showN`,
`sheet.matchingNow`, `sheet.flowDay` and `sheet.flowWeek`. Call sites: the apply button of `FiltersFooter` and
`QuickFilterForm` («Показать {n}»), the «Сейчас подходит: {n}» line, and the radar flow line (`formatFlow` of
`@homi/i18n/format` gains a `parts` form, legacy's `flowParts`, so the footer can roll the number; `sheet.flowNone`
stays plain text). A count of 0 or none keeps its other text.

### Save phases

`frontend/packages/ui/src/components/SaveState.tsx` (new): `useSavePhase()` → `{ phase, setPhase, confirm }` with
`idle | busy | done`; `confirm()` sets `done` and resolves after 900 ms (250 ms under reduced motion); the button's
styles per phase (busy: clipped to a 48 px pill `inset(0 calc(50% - 24px) round 999px)` with a 22 px spinner turning
in 0.7 s; done: full width, `--good`, the tick drawn in 0.4 s after 0.15 s; the clip transition 0.66 s on the spring;
no shrink and a still tick under reduced motion).

- Buttons: the primary of `FiltersFooter` in the two radar modes — «Сохранить» of the radar editor, «Включить радар»
  of the new radar — and «Включить радар», its secondary in search mode.
- Order, legacy's: the answer arrives → success haptic → `done` and the 900 ms wait → the sheet closes and the
  success toast shows in the app's host in the same step. `subscribe` and `saveEdit` (`features/radars/subscribe.ts`) take an optional `confirm` and
  await it before they show the toast and resolve; the sheets call `back()` after they resolve, as built.
- Not for an already active radar (it closes at once with `toast.alreadyOn`), not on an error (back to `idle`, the
  sheet stays open with its toast in the sheet's scope).

### Favourite

`FavButton`: a tap counter keys the heart, which plays `like` (0.8 s) when the tap adds and `dip` (0.6 s) when it
removes; a tap that adds also renders the burst — eight sparks at `index / 8 × 2π + 0.2` rad, 6 px, from 8 px to
24 px (odd, `--heart`) or 29 px (even, `--accent`), 0.55 s, opacity 1 → 0.64 at 60 % → 0. None under reduced motion.
A failed save flips the heart back without a burst (LB-APP-087: the burst follows the tap, not the prop; a default of
the integrator, listed for the reviewer).

### Countdown ring

The action toast of `ToastHost` shows a 16 px ring on its button: a circle whose dash offset runs from 0 to 1 in
`TOAST_ACTION_MS` (6 s), linear, keyed by the toast's id (LB-APP-085: a replacement toast restarts both the timer and
the ring); at the end the toast goes without running its action, as built; under reduced motion the ring stays full.

### Segmented thumb

`SegmentedControl` gains a thumb: an element behind the segments, `width = (100 % − 2 × pad − (n − 1) × gap) / n`,
moved by `translateX(k × (100 % + gap))` to the checked segment in 0.42 s on `--ease-spring`, transparent until a
segment is checked; the checked segment's own background becomes transparent over it. `pad` and `gap` as the
control's padding and gap. Legacy has no reduced-motion rule for it; HOMI adds none.

### Curves

- `frontend/packages/ui/src/styles/theme.css`: the release's tokens `--ease-out: cubic-bezier(0.2, 0.9, 0.3, 1)` (the
  value of `--ease-ios`, which stays as its alias), `--ease-spring: cubic-bezier(0.3, 1.2, 0.45, 1)` and
  `--ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1)`.
- `styles/shell.css`: `--ease-chrome` (1.1) and `--ease-lens` (1.35) become the spring (1.2), as legacy's chrome
  rules do; the clip radii 60 px, `calc(var(--tabbar-h) / 2)` and 22 px become 999 px.
- `features/listing/sections/MarketBlock.tsx`: the marker moves by `translateX` of a full-width wrapper (the marker at
  its right edge, `translate(50%)`), 0.7 s on `--ease-out`, instead of `left`; the first-show rule stays.
  `features/listing/market/MarketSheet.tsx`: the demonstration dot on `--ease-out`.

### Survey

`FoundSheet`: a row of the step `where` sends `sendFoundWhere` as built (not awaited) and then shows the step `moved`
— «Поздравляем!» (`found.movedTitle`), «Спасибо, что рассказали — это помогает нам стать лучше.»
(`found.movedText`) and «Готово», scrolled to the top — instead of closing with the toast `found.thanksYes`. The
header shows only on `ask` and `where`, as legacy. `found.thanksYes` is no longer shown (LB-APP-091); its `homi`
override, if any, goes. The landlord block is WP-82's (DEC-89).

### End of the search feed

`ListingFeed` of the search feed (not favourites, not history): when the feed is loaded to its end, has no error,
shows at least one card and no few-results note, a muted line «Это всё по вашему поиску» (`feed.end`) follows the
last card (and the in-feed radar card, when it is the last row), above the sentinel; a `data-feed-end` block that
WP-82 extends with the invitation row (DEC-90).

## Files

New: `frontend/packages/ui/src/lib/leave.ts`, `frontend/packages/ui/src/components/{RollNumber,SaveState}.tsx`, their
tests `frontend/packages/ui/tests/{leave,RollNumber,SaveState}.test.tsx`, `frontend/app/lib/ui/rollText.ts` with
`tests/ui/rollText.test.ts`, and `frontend/app/e2e/motion.spec.ts`.

Changed in `frontend/packages/`: `ui/src/components/{BottomSheet,SubPageFrame,SegmentedControl}.tsx`,
`ui/src/hooks/{useSheetDrag,useSwipeBack}.ts` (the `data-gone` mark), `ui/src/styles/{theme,motion}.css`,
`ui/src/index.ts`, `i18n/src/format/flow.ts` (`flowParts`), their tests (`ui/tests/{BottomSheet,SubPageFrame,controls}
.test.tsx`, `ui/tests/tokens.test.ts`, `i18n/tests/format/flow.test.ts`).

Changed under `frontend/app/`:

- `features/shell/ToastHost.tsx`, `lib/ui/toast.ts`, `features/filters/{FiltersFooter,QuickFilterForm,
  FiltersSheetRoute}.tsx`, `features/radars/{subscribe.ts,RadarCreateSheet.tsx,RadarEditSheet.tsx,FoundSheet.tsx,
  RadarSheetRoute.tsx}`, `features/feed/{FavButton,ListingFeed,FeedScreen}.tsx`,
  `features/listing/sections/MarketBlock.tsx`, `features/listing/market/MarketSheet.tsx`, `styles/shell.css`,
  `features/gallery/UiGallery.tsx` (the new components)
- tests: `tests/shell/{route-sheet,sub-page}.test.tsx`, `tests/ui/{toast-host.test.tsx,toast.test.ts}`,
  `tests/filters/{QuickFilterForm,FiltersForm,FiltersSheetRoute}.test.tsx`,
  `tests/radars/{subscribe.test.ts,FoundSheet.test.tsx,RadarForms.test.tsx,RadarSheetRoute.test.tsx}`, `tests/feed/{FavButton,ListingFeed}.test.tsx`, `tests/listing/MarketBlock.test.tsx`

In `docs/migration/wave-1/baseline.md`, built code behind the pin: rows 44 – 54 are marked closed.

## Steps

1. The tokens, the curves and the clip radii; the market marker by transform.
2. The leave helper with its skip rules and unit tests; wired into `BottomSheet`, `SubPageFrame` and `ToastHost`;
   the `data-gone` mark of the drag and the swipe; the radar sheet's no-leave close for a listing.
3. `RollNumber`, `rollText` and `flowParts`; the three footers.
4. `SaveState`; the `confirm` of `subscribe` and `saveEdit`; the three buttons.
5. The favourite's heart and burst; the countdown ring; the segmented thumb.
6. The survey's `moved` step; the end line of the search feed.
7. Unit, component and end-to-end tests; the acceptance checklist on staging; tick rows 44 – 54 in `baseline.md`.

## Behaviour to reproduce

### Leave (BR-APP-112; rows 44 – 46)

Durations, curves and skip rules as in "Design"; legacy at r38: `$KVADRO_ROOT/demo/app/src/lib/leave.js`, the callers
`hooks/useSheetDrag.js`, `features/settings/SubPage.jsx`, `components/Toast.jsx`. A sheet closed by its drag slides
out as built and plays no leave; a sub-page closed by the swipe likewise.

### Rolling numbers (BR-APP-113; row 47)

`$KVADRO_ROOT/demo/app/src/components/RollNumber.jsx` at r38 and its call sites in `features/filters/sheet/
SheetFooter.jsx` and `features/filters/QuickFilterSheet.jsx`; the CSS of `styles/listing-details.css`.

### Save phases (BR-APP-114; row 48)

`$KVADRO_ROOT/demo/app/src/components/SaveState.jsx`, `app/subscriptionActions.js` (the three branches that await
`confirm`), `features/filters/FiltersSheet.jsx` at r38; the CSS of `styles/filters.css`.

### Favourite, ring, thumb, curves (BR-APP-117, BR-APP-118, BR-APP-121; rows 49 – 52)

`components/FavButton.jsx` with `styles/listing-card.css`; `components/Toast.jsx` with `styles/feedback.css`;
`styles/owner-shared.css` (the thumb under `@supports selector(:has(*))`) and `styles/fallbacks.css`;
`styles/tokens.css`, `styles/chrome.css`, `styles/listing.css` and `features/listing/sections/MarketBlock.jsx` — all
at r38.

### Survey and the end of the feed (BR-APP-116; DEC-90; rows 53, 54)

`features/radar/FoundSheet.jsx` (`pickWhere`, the step `moved`) and `features/feed/ListingFeed.jsx` (the `feed-end`
block; HOMI shows its text without the invitation) at r38.

## Tests

Unit (Vitest):

- `ui/tests/leave.test.tsx`: the copy (inert, `aria-hidden`, scroll copied) and its removal on finish and at 600 ms;
  every skip rule — reduced motion, lite, `data-gone`, an inline transform, a parent gone, a new node of the kind in
  the same commit; the per-kind keyframes and timings (`Element.animate` stubbed).
- `ui/tests/RollNumber.test.tsx`: the digits, the 45 ms stagger from the right, the columns keyed from the end, the
  label; no transition under reduced motion.
- `ui/tests/SaveState.test.tsx` (fake timers): `confirm` resolves after 900 ms, after 250 ms under reduced motion.
- `tests/ui/rollText.test.ts`, `i18n/tests/format/flow.test.ts` (`flowParts` equals the numbers of `formatFlow`).
- `tests/radars/subscribe.test.ts`: the toast after `confirm`; none awaited for an already active radar or on an
  error.

Component (Vitest + Testing Library):

- Each sheet route, `SubPageFrame` and `ToastHost` call the leave on unmount, and not after a drag or a swipe; the
  radar sheet closed for a listing plays none.
- `FiltersFooter` and `QuickFilterForm` roll the count; `RadarCreateSheet` / `RadarEditSheet` / the search sheet go
  busy → done → close → toast, and back to idle on an error.
- `FavButton`: `like` / `dip` per tap, the burst only on an add, none after a failed save.
- `ToastHost`: the ring on an action toast only, restarted by a replacement.
- `FoundSheet`: a `where` row shows `moved`, sends the answer once, shows no toast; «Готово» closes.
- `ListingFeed`: the end line only on the search feed, loaded to its end, with cards and without the few-results note.
- `SegmentedControl`: the thumb's transform for each checked index.

End-to-end (`e2e/motion.spec.ts`, Playwright with the fake Telegram): `document.getAnimations()` read in the browser,
as WP-36 read `listing-in` and `listing-out` — a sheet closed by Back leaves a copy that animates and is gone after
300 ms; a sheet closed by its drag leaves none; a toast's leave; the save tick before the sheet closes; with
`prefers-reduced-motion` and with `html.lite` no leave.

## Acceptance checklist

Run in ru, uz and en, light and dark, in Telegram on staging.

- [ ] Every sheet, the settings sub-page frame and every toast leave as legacy does, and do not after a drag or a
      swipe, under reduced motion or in lite graphics.
- [ ] The radar sheet closed for a listing opened from it plays no leave and re-opens as built.
- [ ] «Показать N», «Сейчас подходит: N» and the radar flow roll; 0 and none keep their texts.
- [ ] «Сохранить» and both «Включить радар» go spinner → tick → close with the toast; an already active radar closes at once; an
      error leaves the sheet open.
- [ ] The heart springs on every tap and bursts only on an add.
- [ ] The countdown ring runs 6 s on every action toast.
- [ ] Every segmented control's thumb slides to the checked segment.
- [ ] The chrome's collapse and the tab lens spring as legacy; the market marker moves without a layout per frame.
- [ ] A "where found" answer shows «Поздравляем!» and no toast.
- [ ] «Это всё по вашему поиску» ends a search feed loaded to its end, not favourites or history, not with the
      few-results note.
- [ ] Every case of `e2e/motion.spec.ts` passes in cookie mode and in header mode.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, unit, component and end-to-end suites are green.
- [ ] Rows 44 – 54 of `baseline.md` (built code behind the pin) are marked closed.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web.

## Handoff

Empty.
