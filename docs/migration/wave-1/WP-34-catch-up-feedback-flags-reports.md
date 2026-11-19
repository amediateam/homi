# WP-34 — Catch-up: failure feedback, flags and reports

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | intake `index-CIa0Ldj2` (the method `DELETE /listings/{number}/reports`, the field `agent_marked` of the report answer, the texts `toast.showForMe` and `toast.reportedAgentNoted`), WP-30 |
| Size | about 430 changed lines with tests, M |
| Behaviour reference | `03` §2 (SCR-004, SCR-023, SCR-042), §4 (BR-APP-036, BR-APP-039, BR-APP-048, BR-APP-067, BR-APP-069), §5 (LB-APP-025, LB-APP-027), §5b (LB-APP-081); `02` (BR-API-190, BR-API-191); `08` (API-055); `09` §4.2 (DEV-010, DEV-014, DEV-016, DEV-051); `wave-1/baseline.md`, built code behind the pin, rows 4, 21, 22, 23, 24, 25, 27, 30 |
| Needs from the production track | the regular deploy; then the manual checks inside Telegram on staging that the acceptance checklist names |

## Goal

The flags of `frontend/app/lib/flags.ts` carry the defaults of the pinned release `index-CIa0Ldj2.js`, and each of
the six flags this package touches keeps both branches tested. Every failed save that legacy now reports shows «Не
получилось сохранить», the heart included; the contact failures still only vibrate, and the first-launch language
picker shows the text as a line under its list. The report toasts behave as legacy's: «Вернуть» withdraws «Уже
сдано» on the server, the `fraud` undo reads «Показывать у меня», the realtor toast follows `agent_marked`, and the
realtor reason is offered only for a phone author. History dates are Tashkent's, and the toast follows a drag.

## Scope

In (sizes are the estimates of `baseline.md`; paths under `frontend/app/` unless they start with `frontend/packages/`):

- Row 21, about 120 lines: the flags' header and defaults, `failed()` with its `toast` option, the heart's failure,
  the success toast of a deleted radar behind its own flag.
- Row 22, about 45: the Server Action `unreportListing` and the undo of «Уже сдано».
- Row 23, about 15: the label of the `fraud` undo.
- Row 24, about 35: the realtor toast by `agent_marked`; the `homi` text `toast.reportedAgentReview` removed.
- Row 25, about 20: the realtor reason only for a phone author.
- Row 27, about 40: history dates in Asia/Tashkent by default.
- Row 30, about 35: the language picker's failure line.
- Row 4, about 120: the toast's drag and its offsets by context.

Out:

- The pets half of DEV-017 and its rule key: WP-35, which edits `lib/flags.ts` after this package.
- The "gone" and day-limit states of the listing, the fallback close: WP-36.
- The failures of the settings tab and of «Скрытое»: not built; WP-31 calls `failed()` and inherits the toast.
- The success toast of destructive actions («Радар удалён»): stays off behind its own flag; nothing else changes.
- The server side of the realtor vote (weighted threshold, undo, audit) and the server's calendar aggregates of
  DEV-014: `PROPOSED`, WP-44 and later. The withdrawal on the server: WP-44 (stubs answer it since the intake).
- The radar limit on the switch, which legacy now reports with the generic text (LB-APP-081): reproduced, no fix.
- Screen events and error reports: WP-32.

## Decisions that bind this package

- DEC-58, amending DEC-36 (`25` §2): a flag's default is the behaviour of the pinned legacy release. The flags stay
  and both branches stay tested; a half that legacy did not adopt keeps a flag of its own, off. Here:
  `dev014TashkentDates`, `dev016ErrorToastOnFailure` and `dev051RentedUndo` go on; the new `dev010AgentMarkedToast`
  is on; the new `dev016SuccessToastOnDestructive` is off; `dev010RealtorVoteWording` stays off and governs the hint
  under the realtor reason alone. Approved by DEC-58: the toast half of DEV-010, the Mini App half of DEV-014, the
  error half of DEV-016 and all of DEV-051.
- DEC-68 (`25` §4.2): `DELETE /listings/{number}/reports` withdraws only the caller's `rented` vote and the hidden
  row it made; a repeat answers `204`. So only «Уже сдано» calls it; the `fraud` undo keeps `unhideListing`
  (`DELETE /listings/{number}/hide`).
- WP-13 "Reports" (the contract on stubs): `agent_marked` is always present, `true` when the author is marked as a
  realtor by this vote or already. The client reads the boolean as given.
- DEC-51: radars are off in production, so the radar failure toasts are reached only with radars on — in the unit
  tests and in the radar end-to-end run on stubs.
- Defaults of the intake of `index-CIa0Ldj2.js`, not decisions of the developer (listed in that PR for the reviewer):
  - the four contact failures of the listing keep the error haptic alone when the failure toast goes on, because
    legacy shows no toast there;
  - the `homi` text `toast.reportedAgentReview` is removed, because nothing reads it once the toast follows
    `agent_marked`.

## Design

### Flags

`lib/flags.ts`: the header says that a flag's default is the behaviour of the pinned legacy release (DEC-58), that
the flag stays so both branches can be tested, and that a half legacy did not adopt has a flag of its own, off. The
line "Every flag is `false`, so the app reproduces legacy" goes. Each new flag gets its doc comment in the file's
form ("DEV-010: …").

| Flag | Default | Switches |
| ---- | ------- | -------- |
| `dev010AgentMarkedToast` (new) | `true` | the realtor toast follows `agent_marked`; off: always `toast.reportedAgent` |
| `dev010RealtorVoteWording` | `false` | only the hint under the realtor reason: `report.agentHintReview` instead of `report.agentHint` |
| `dev014TashkentDates` | `true` | the dates and times of the listing's price history |
| `dev016ErrorToastOnFailure` | `true` | the toast `common.saveFailed` of `failed()`, nothing else |
| `dev016SuccessToastOnDestructive` (new) | `false` | the success toast `toast.subDeleted` «Радар удалён» |
| `dev051RentedUndo` | `true` | «Вернуть» on «Отметили: уже сдано» |

Tests that relied on "every flag is off" set their flag through `withDevFlags` (`tests/helpers/flags.ts`).

### `failed()`

`lib/ui/feedback.ts`: `failed(options?: { flags?: DevFlags; toast?: boolean })`. The error haptic always; the toast
`common.saveFailed` when `toast !== false` and `dev016ErrorToastOnFailure`. The options object stays, so
`promise.catch(failed)` still reads the app's flags.

| Caller | After this package |
| ------ | ------------------ |
| `features/feed/FavButton.tsx` (save and rollback at `:35-41,58-66`) | rolls back, then `failed()`; today it rolls back silently |
| `features/saved/ClearHistoryButton.tsx:51` | unchanged; now toasts by default |
| `radarActionFailed` (`features/radars/RadarTiles.tsx:77-93`: switch, mode, unhide, delete) | unchanged; now toasts by default. `radars_disabled` and `no_chat` keep their own toasts |
| `features/gates/LanguagePicker.tsx:156` | `failed({ flags, toast: false })` and the line below |
| `features/listing/cta/useContact.ts:150,160,171,182` | `failed({ toast: false })` |
| `features/gallery/UiGallery.tsx` (entry `feedback`) | shows the default, `toast: false`, and the flag off |

`features/radars/RadarSheet.tsx:215` reads `dev016SuccessToastOnDestructive` instead of `dev016ErrorToastOnFailure`
for «Радар удалён»; its doc comment (`:83`) says so.

### Language picker

`features/gates/LanguagePicker.tsx`: a `failedSave` state. A failed save calls `failed({ flags, toast: false })`,
enables the buttons again and shows `common.saveFailed` as a line under the list with `role="alert"`. The next tap
clears the line before it saves. No toast on this screen. The doc comment (`:85-95`) is updated.

### Reports

- `lib/api/server.ts`: the typed call `unreport(number)` → `DELETE /listings/{number}/reports`.
- `lib/actions/reports.ts`: `unreportListing(input: { number: number }, auth?, locale?)` →
  `ActionResult<null>`, the shape of `unhideListing`: a `204` is `{ ok: true, data: null }`; a number that fails the
  check of `inputOf` makes no request. `reportListing` (`:49-62`) already returns `agent_marked`.
- `features/listing/actions/useListingActions.ts`:
  - `undoToast(text, numbers, revert, label = t("toast.undo"))` takes the label of its button. Its failure path
    (hide again, error haptic, `common.saveFailed`) stays.
  - `rented`: with `dev051RentedUndo` the toast `toast.reportedRented` carries «Вернуть»; its `run` removes the
    number from the session's `hidden` map at once, calls `unreportListing` through `useAction` (header mode passes
    the token), and on failure hides it again with the error haptic and «Не получилось сохранить». Flag off: the
    plain toast, no action.
  - `fraud` with `hidden: true`: the toast `toast.reportedFraud` keeps its undo through `unhideListing`; the label is
    `toast.showForMe`.
  - `agent`: with `dev010AgentMarkedToast`, `toast.reportedAgent` when `agent_marked`, else
    `toast.reportedAgentNoted`; flag off: always `toast.reportedAgent`. `dev010RealtorVoteWording` no longer touches
    the toast.
  - The `it.todo` of `tests/listing/useListingActions.test.tsx:267` becomes real tests.
- `features/listing/actions/ListingActionsSheet.tsx:114`: the `agent` row is left out when `isOwner === false` or
  `author?.kind !== "phone"`, so also while the author is unknown. The hint keeps its prop `agentReview`, fed by
  `dev010RealtorVoteWording` (`ListingActionsRoute.tsx:53`).
- `frontend/packages/i18n/messages/homi/{ru,uz,en}.json`: `toast.reportedAgentReview` is removed;
  `frontend/packages/i18n/tests/catalogue.test.ts` counts one `homi` text fewer per locale. The `homi` texts
  `report.agentHintReview` and `toast.subDeleted` stay: their flags still read them.

### History dates

Only the default changes. `HistoryDate` (`features/listing/sections/HistoryDate.tsx:18-27`) keeps both branches: with
the flag it renders the Tashkent date on the server and in the first client render; without it, the device zone
after hydration. `ListingScreen.tsx:206` passes the flag as today.

### Toast drag and offsets

`features/shell/ToastHost.tsx` (`:14-17` the offset, `:40-53` the host): the drag, the fade, the 36 px release and
the offsets by context exactly as WP-23 "Toast (SCR-042) and confirm (SCR-043)" specifies them since the intake of
`index-CBlEKxdL.js`. The host reads what is below it from the shell state (view toggle shown, sub-page, the listing's
CTA bar); the scope `sheet` keeps its offset. Reduced motion: no rise; the drag still works.

## Files

Changed, under `frontend/app/`:

- `lib/flags.ts`, `lib/ui/feedback.ts`, `lib/api/server.ts`, `lib/actions/reports.ts`
- `features/feed/FavButton.tsx`, `features/gates/LanguagePicker.tsx`, `features/listing/cta/useContact.ts`,
  `features/radars/RadarSheet.tsx`, `features/gallery/UiGallery.tsx`, `features/shell/ToastHost.tsx`
- `features/listing/actions/{useListingActions.ts,ListingActionsSheet.tsx}`
- tests: `tests/ui/feedback.test.ts`, `tests/ui/toast-host.test.tsx`, `tests/feed/FavButton.test.tsx`,
  `tests/saved/HistoryScreen.test.tsx`, `tests/radars/RadarSheet.test.tsx`, `tests/radars/RadarTiles.test.tsx`,
  `tests/gates/LanguagePicker.test.tsx`, `tests/listing/{useListingActions,ListingActionsSheet}.test.tsx`,
  `tests/listing/{HistorySection,useContact}.test.tsx`, `tests/actions/reports.test.ts`, and every test that read a
  flag's old default
- end to end: `e2e/feed.spec.ts`, `e2e/listing-actions.spec.ts`, `e2e/radars.spec.ts` (a comment only)

Changed in `frontend/packages/i18n/`: `messages/homi/{ru,uz,en}.json`, `tests/catalogue.test.ts`.

In `docs/migration/wave-1/baseline.md`, built code behind the pin: rows 4, 21 – 25, 27 and 30 are marked closed.

## Steps

1. `lib/flags.ts`: header, defaults, the two new flags. Run the unit suites; give every test that broke on a
   default its flag through `withDevFlags`, so both branches stay covered.
2. `failed()` with `toast`; the contact failures and the radar success toast; the gallery entry; unit tests.
3. The heart's failure; its unit and end-to-end cases.
4. The language picker's line; its test.
5. `unreportListing` with its typed call and test; the undo of «Уже сдано»; the label of the `fraud` undo; the
   realtor toast; the reason's visibility; the `homi` text removed.
6. History dates: tests for both branches with the device in another zone.
7. The toast host: drag, fade, release, offsets; its test.
8. End-to-end cases in both session modes; the acceptance checklist on staging; tick the rows in `baseline.md`.

## Behaviour to reproduce

### Failure toast (LB-APP-027, fixed in legacy since `index-CIa0Ldj2.js`; rows 21, 30)

- A failed save shows «Не получилось сохранить» (`common.saveFailed`) with the error haptic on: the heart
  (BR-APP-039; the heart also returns to its state before the tap), «Очистить» (BR-APP-067; the list stays), the
  radar switch, mode, unhide and delete (BR-APP-048; the optimistic change is reverted first).
- On the radar tab `radars_disabled` keeps «Радар скоро заработает» and `no_chat` its chat text; a `409` limit
  answer on the switch reads «Не получилось сохранить», as legacy since this release (LB-APP-081).
- A failed contact (call, chat, reveal, copy) gives the error haptic and no toast.
- The first-launch language picker (SCR-004): the error haptic, the buttons unlocked, «Не получилось сохранить»
  under the list as an alert; the next tap clears it; no toast.
- A deleted radar shows no success toast (DEV-016's other half, off).

### Reports (BR-APP-036, SCR-023; rows 22 – 25)

- «Уже сдано» (API-055, BR-API-190): the listing is hidden and closes; the toast «Отметили: уже сдано» carries
  «Вернуть» (`toast.undo`; the contract's «Отменить» is not in the dictionaries) for 6 s. «Вернуть» shows the
  listing again at once and sends `DELETE /listings/{number}/reports`; a failure hides it again with «Не получилось
  сохранить».
- «Мошенничество или спам» that hid the listing: the toast «Спасибо, посмотрим. Это объявление у вас скрыли»
  (`toast.reportedFraud`) carries «Показывать у меня» (`toast.showForMe`); it un-hides as before.
- «Это риелтор, а не хозяин» (BR-API-191): «Отметили номер как риелторский» (`toast.reportedAgent`) when the answer
  has `agent_marked: true`, else «Спасибо, учёл вашу отметку» (`toast.reportedAgentNoted`). The hint under the reason
  stays «Отметим номер как риелторский» (`report.agentHint`); `dev010RealtorVoteWording` on shows the `homi` hint
  «Проверим номер — если это риелтор, отметим его».
- The realtor reason is offered only when the author is a phone and the listing is not the owner's own
  (`is_owner === false` hides it as before); an author of kind `source`, no author, or an author not loaded yet
  hides it.

### History dates (LB-APP-025, fixed in legacy since `index-CIa0Ldj2.js`; BR-APP-069; row 27)

- The dates and the `HH:MM` times of the price history are formatted in Asia/Tashkent whatever the device's zone.

### Toast (SCR-042; row 4)

- The drag, the fade, the release past 36 px and the offsets as WP-23 "Toast (SCR-042) and confirm (SCR-043)".

## Tests

Unit (Vitest):

- `tests/ui/feedback.test.ts`: the haptic always; the toast with the default flags; none with `toast: false`; none
  with `dev016ErrorToastOnFailure` off.
- `tests/actions/reports.test.ts`: `unreportListing` sends `DELETE /listings/{number}/reports` with the cookie token
  and with the argument token; a `204` is success with `data: null`; a non-2xx maps to a failed `ActionResult`; an
  invalid number sends nothing.

Component (Vitest + Testing Library):

- `tests/feed/FavButton.test.tsx` (the cases at `:116-135`): a failure returns the heart, gives the error haptic and
  the toast; with the flag off, the haptic and no toast.
- `tests/saved/HistoryScreen.test.tsx`: a failed clear shows the toast by default.
- `tests/radars/RadarSheet.test.tsx` (`:466-487`) and `tests/radars/RadarTiles.test.tsx`: a failed switch, mode,
  unhide or delete shows the toast by default; a successful delete shows «Радар удалён» only with
  `dev016SuccessToastOnDestructive`; `dev016ErrorToastOnFailure` alone no longer shows it.
- `tests/listing/useContact.test.tsx`: every contact failure plays the error haptic and shows no toast with the
  default flags.
- `tests/gates/LanguagePicker.test.tsx`: a failure shows the line with `role="alert"` and no toast; the next tap
  clears it; a success after a failure leaves no line.
- `tests/listing/useListingActions.test.tsx`: «Уже сдано» with the flag on calls `unreportListing` from «Вернуть»
  and shows the listing again; a failed undo hides it again with «Не получилось сохранить»; with the flag off there
  is no action. The `fraud` label is «Показывать у меня». The realtor toast in the four combinations of
  `dev010AgentMarkedToast` and `agent_marked`; `dev010RealtorVoteWording` on changes no toast.
- `tests/listing/ListingActionsSheet.test.tsx`: no `agent` row for an author of kind `source` and for no author;
  the row for a phone author; the hint with `agentReview` on and off.
- `tests/listing/HistorySection.test.tsx`: an event at 22:30 UTC prints the next day's date and 03:30 with the flag
  on, the UTC date and 22:30 with it off (unit tests run in UTC).
- `tests/ui/toast-host.test.tsx`: the toast follows a drag and fades; a release past 36 px closes it; a shorter one
  returns it; the offset per context (tab bar, view toggle, sub-page, CTA bar, scope `sheet`).

End to end (Playwright, fake Telegram, stubs; cookie mode and header mode):

- `e2e/feed.spec.ts`: the case "a failed save returns it" also expects the error haptic and «Не получилось
  сохранить».
- `e2e/listing-actions.spec.ts`: «Уже сдано» → «Вернуть» → one `DELETE /listings/{number}/reports` reaches the API
  and the card is back in the feed; the same with that request failing → the card stays hidden and the toast says
  «Не получилось сохранить»; the `fraud` case (`:181`) expects «Показывать у меня»; «Это риелтор, а не хозяин»
  shows «Спасибо, учёл вашу отметку», and with the stub scenario `agent_marked` (cookie `homi_stub_scenario`)
  «Отметили номер как риелторский».
- `e2e/radars.spec.ts:413-415` keeps asserting no toast after a successful delete; its comment names
  `dev016SuccessToastOnDestructive`.

## Acceptance checklist

Run in ru, uz and en, light and dark, in Telegram on staging.

- [ ] A failed heart, «Очистить», radar switch, mode, unhide and delete each show «Не получилось сохранить» with the
      error haptic (the radar ones on stubs with radars on).
- [ ] A failed contact still shows no toast; it only vibrates.
- [ ] The first-launch language picker shows «Не получилось сохранить» under the list and no toast; the next pick
      clears it.
- [ ] «Отметили: уже сдано» offers «Вернуть»; it sends `DELETE /listings/{number}/reports` and the listing is back;
      a failed undo hides the listing again with «Не получилось сохранить».
- [ ] The `fraud` toast's button reads «Показывать у меня».
- [ ] A realtor vote says «Отметили номер как риелторский» only with `agent_marked`, else «Спасибо, учёл вашу
      отметку».
- [ ] The realtor reason is absent for a channel author and while the author is unknown.
- [ ] History dates and times are Tashkent's with the device in another time zone.
- [ ] A toast dragged down past 36 px closes; a shorter drag returns it; its offset follows its context.
- [ ] A deleted radar shows no «Радар удалён».
- [ ] Both branches are tested for `dev010AgentMarkedToast`, `dev010RealtorVoteWording`, `dev014TashkentDates`,
      `dev016ErrorToastOnFailure`, `dev016SuccessToastOnDestructive` and `dev051RentedUndo`.
- [ ] The `homi` text `toast.reportedAgentReview` is gone from the three catalogues.
- [ ] Every new or changed case of `e2e/feed.spec.ts` and `e2e/listing-actions.spec.ts` passes in cookie mode and in
      header mode.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, unit, component and end-to-end suites are green.
- [ ] Rows 4, 21 – 25, 27 and 30 of `baseline.md` (built code behind the pin) are marked closed.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web.

## Handoff

Empty.
