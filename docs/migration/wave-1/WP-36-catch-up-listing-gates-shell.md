# WP-36 — Catch-up: listing states, gates and the Telegram shell

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (#94) |
| Depends on | WP-35 (and through it WP-34: `failed()` and `lib/flags.ts`) |
| Size | about 565 changed lines with tests, M – L |
| Behaviour reference | `03` §1.2, §2 (SCR-003, SCR-006, SCR-008, SCR-018, SCR-019, SCR-033), §3.3 (`app_launch`), §4 (BR-APP-054, BR-APP-106), §5 (LB-APP-080); `05` (TMA-010, TMA-022, TMA-047); `02` (BR-API-193, BR-API-194); `16` SEC-REQ-007; `wave-1/baseline.md`, built code behind the pin, rows 5, 6, 8, 9, 10, 15, 17, 18, 19, 28, 29 |
| Needs from the production track | the regular deploy; then the manual checks inside Telegram on staging that the acceptance checklist names |

## Goal

A missing listing shows «Этого объявления уже нет» with «Смотреть свежие», and the daily limit «Лимит на сегодня».
Without the Telegram SDK the listing layer and every sub-page carry a close cross of the app's own. The access gate
knows the reason `paused`, and the bot link of the gate carries the interface language for the SEO source. A listing
link opens once per launch, also across a reload, with a mark that holds no launch data in the clear. The listing
layer enters and leaves with its animation, the chrome stays collapsed under it, `app_launch` carries `tg`, the page
under a sub-page does not scroll, and the spot map's controls stay above Leaflet's panes.

## Scope

In (sizes are the estimates of `baseline.md`; paths under `frontend/app/` unless they start with `frontend/packages/`):

- Row 17, about 70 lines: the "gone" state of the listing.
- Row 18, about 40: the day-limit state.
- Row 19, about 110: `FallbackClose` on the listing layer and on sub-pages.
- Row 28, about 35: the access reason `paused`.
- Row 29, about 25: `s_seo_en` and `s_seo_uz`.
- Row 15, about 45: the once-per-launch mark of a listing link.
- Row 5, about 180: the listing layer's entrance and leave, with one close path.
- Row 6, about 30: the collapsed chrome under an open listing.
- Row 8, about 10: `tg` in `app_launch`.
- Row 9, about 15: `body.subpage-open`.
- Row 10, about 5 after the check: the spot map's controls above Leaflet's panes.

Out:

- HOMI's own per-user daily cap on opening listings and the server switch that pauses the product: WP-40 (DEC-59,
  DEC-60). On stubs the scenarios `daily_limit` and `access_paused` answer them.
- The sale switch of a launch listing (DEC-65) and the feed's scroll memory: WP-38, which builds on the close path
  and the launch module of this package.
- The launch link `?radar=<id>`: WP-57 with WP-52 (DEC-61).
- The other readers of the launch that legacy leaves unmarked — the gate's start link, the launch's analytics entry
  (LB-APP-080): reproduced, no fix here.
- The owner form's close cross: WP-81, which renders this package's `FallbackClose` in every state of the form
  (*added by the owner-cabinet plan*).

## Decisions that bind this package

- DEC-59 (`25` §4.1, §4.5): the contract marks the daily limit as `429 rate_limited` with `reason: "daily"`; the Mini
  App shows «Лимит на сегодня» for that answer and the generic error for any other `429`. The cap itself is WP-40's.
- DEC-60: the sixth access reason `paused` and its screen exist now; the switch is WP-40's and is off by default.
- SEC-REQ-007 (`16`): launch data and tokens never go into a store; `lib/storage.ts` refuses them.
- Default of the intake of `index-CIa0Ldj2.js`, not a decision of the developer (listed in that PR for the reviewer):
  the "launch listing already opened" mark keeps a digest of the launch `hash` and the number, never the raw `hash`.
  Legacy stores `<hash>:<id>` in the clear (`kv-start-done`).
- WP-26 "Layers, Back and z-order": the listing is an intercepted overlay over the page below, and the page below
  cannot change its address while the overlay shows. The leave is designed together with Back and the new cross, so
  one function closes the layer whatever asked for it; WP-38 relies on that function.

## Design

### Listing states

- Error reason: `ApiError` of `@homi/api-client` keeps the body's `reason` when it is a string;
  `lib/api/server.ts:98` and `lib/api/browser.ts:116` pass it on; `ApiFailure` (`lib/api/errors.ts:25-32`) gains
  `reason?: "daily"`, set only for a `429` whose body says `reason: "daily"`. `UiError` keeps its members:
  screens still decide by `error`, and the day limit is `rate_limited` with that reason.
- `features/listing/useListing.ts` `errorView` (`:80-91`): `rate_limited` with `reason === "daily"` → the state
  `day_limit` with `retry`; any other `rate_limited` stays `server`.
- `features/listing/ListingScreen.tsx:85-104`:
  - `not_found` → a tall block with `role="alert"`: the `SearchX` icon (28 px, exported by
    `frontend/packages/ui/src/icons/index.ts`), `listing.gone` and the button `listing.goneFresh`. `EmptyState`
    takes an image address, so the block is local to the listing (or `EmptyState` gains an icon prop; decide in the
    PR). The button gives a light haptic and closes the listing through the close path below; it does not reload
    the feed.
  - `day_limit` → the tall `ErrorState` with `error.dayLimit`, `error.dayLimitText`, its icon and «Повторить».
- The map card's preview (`?preview=1`) is unchanged: no special text for `404` or `429` there.

### Close path and the layer's motion

- `features/listing/closeListing.ts` gets the one function that closes the listing layer: it plays the leave, then
  changes the route — `back()` of `useBack()` (`lib/navigation/useBack.ts:21-27`) when a page is below, else the
  replace to the parent. Telegram's Back on the layer, the "gone" button, `FallbackClose` and `closeListing(step)`
  (the nested sheets' step-back first) all end there; the swipe back has already slid the layer out and changes the
  route at once. WP-38 adds the sale switch to this function.
- Entrance and leave as WP-26 "Layers, Back and z-order" specifies since the intake of `index-CBlEKxdL.js`:
  `features/shell/RouteOverlay.tsx:46-55` gets the entrance class; `features/listing/ListingLayer.tsx:123` and
  `closeListing.ts:34-39` play the leave before `backBy`. None in lite graphics or under reduced motion; a new
  opening during the leave cancels it.
- `features/shell/AppShell.tsx:79`: `useMiniChrome` stays on while the listing layer lies over the feed, so the
  collapsed chrome stays collapsed under it (`03` SCR-006).

### Fallback close

- New `features/shell/FallbackClose.tsx`: renders while `webApp() === null`, read with `useSyncExternalStore` over
  `subscribeSdk` (`lib/telegram/sdk.ts:50-52,102-105`); the server snapshot renders nothing, so the cross appears
  after hydration only when the SDK is absent. It goes when the SDK arrives. A round glass button, 44 × 44 px, fixed
  at `--top-inset` + 10 px from the top and 12 px from the right, opacity 0.88, icon `X` 20 px, accessible name
  `common.close` «Закрыть».
- `features/shell/RouteOverlay.tsx` renders it in every state of the listing layer (skeleton, preview, content,
  "gone", day limit, error); it calls the close path above.
- `features/shell/SubPage.tsx:20` passes it as the `back` slot of `SubPageFrame`
  (`frontend/packages/ui/src/components/SubPageFrame.tsx:11-12`); it calls `back()` of `useBack()`.

### Gates

- `lib/session/types.ts:21-28`: `AccessReason` gains `paused`.
- `features/gates/accessReason.ts:41-44` `mainRow`: no start link for `blocked` and `paused`, so the main button is
  «Вернуться в бот» and closes the Mini App; the post and support rows keep their own rules. The doc comments ("the
  five reasons") follow.
- `lib/deeplinks/build.ts:40-46` `noAccessStartUrl(source, number?, locale?)`: the source `seo` becomes `seo_en` in
  `en` and `seo_uz` in `uz`, `seo` in `ru`; other sources are unchanged. The locale is the address segment.
- `features/gates/useBootRetry.ts:67,127`: unchanged; only `blocked` stops the automatic re-check, so `paused` is
  checked again three times and on the return to the app.

### Launch mark

- `lib/storage.ts`: a third policy, `session`, for one key `homi-launch-done` in `sessionStorage` (never mirrored);
  the secret check (`:42-47`) applies to it as to every write.
- `lib/deeplinks/launch.ts`: the mark is `<digest>:<number>`, where the digest is a synchronous, non-reversible hash
  (for example cyrb53) of the `hash` field of `tg.initData()` (empty when absent). `launchTarget()` (`:53-58`)
  returns no target for a listing whose mark matches, so `consumeLaunch()` (`:115-129`) and `launchPending()`
  (`:141-153`) see none; `?news=pets` is not marked. The mark is written when the address has shown the target
  (`launchPending()` at `:148-150`). A storage failure reads as "not opened yet".
- A new launch brings a new `hash` (`inferred` in legacy, `03` Q-APP-029), so it opens the listing again.

### Small rules

- `lib/session/bootstrap.ts:263` sends `tg: tg.version()` in `app_launch`; `lib/analytics/events.ts:11` types it
  (WP-11's catalogue and WP-32's table already name it).
- `frontend/packages/ui/src/components/SubPageFrame.tsx:86`: while mounted it sets `body.subpage-open`;
  `frontend/packages/ui/src/styles/layout.css:50-56` locks the body for it as for `sheet-open` and `locked`.
- Spot map: on the Leaflet engine, check that the mini map's expand chip (`features/listing/spot/SpotMap.tsx:88`) and
  the fullscreen controls (`SpotMapFullscreen.tsx:110-125`) receive taps above Leaflet's panes. Where one does not,
  give it a z-index above the panes (legacy: 1000). Record the result in the PR.

### As built *(rule 6)*

- **The close path.** The one close is `close` of `ListingLayerContext`, owned by `ListingLayer` (the layer holds the
  leave state, its latch and its timers, so a hidden or remounted layer drops them); `closeListing.ts` keeps the parts
  without React: `LISTING_LEAVE_MS` (200), `listingLeavePlays()` (not under `html.lite`, not under reduced motion),
  `leaveListingRoute()` and `closeListing(step, close)`. `leaveListingRoute()` reads the app's stack live (`depth()`):
  one step back when a page is below, else the replace to the feed — what `back()` of `useBack()` does at the
  listing's own address, but safe after an await, where a captured `back()` would see the sheet's depth.
  - Telegram's Back reaches it through `lib/navigation/backHandler.ts` (new): the layer registers its close with
    `takeOverBack()` while its own address shows (no child route; a standalone copy only while no overlay copy covers
    it), and `TelegramButtons` calls the last registered handler instead of `back()`.
  - The swipe passes `swipe` through the new `onClose` prop of `RouteOverlay` and changes the route at once; the
    fallback cross passes `leave`. Without `onClose` (the fullscreen spot map) `RouteOverlay` keeps `back()` and shows
    no cross.
  - The leave is a keyframe animation held at its end (`animate-listing-out`, `forwards`) that moves the layer's
    insets (`left: 24%; right: -24%`), not a transform: the layer is its own scroller, and a transform would make it
    the containing block of its fixed children (the CTA bar, the fallback cross), which would jump by the scroll
    offset (review of WP-36; the swipe still does, KI-67). The entrance keeps the transform: it starts at the top. The
    entrance class is dropped while the layer leaves (both utilities set `animation`, and `cn` keeps both), and the
    leave clears the inline `animation: none` that a swipe which slid back leaves behind (`useSwipeBack` stops the
    entrance that way). The layer takes no taps while it leaves (legacy `.leaving { pointer-events: none }`). After 200 ms the route changes
    only when neither the address nor the app's stack moved meanwhile; otherwise the leave is dropped and the layer
    shows again.
  - An overlay copy at the app's depth 0 changes the route at once, without a leave: it lies over a standalone copy
    (a merged number's replace, a depth-0 close of a directly loaded child), not over the page Back reveals.
  - A step back whose address has not changed `LISTING_CLOSE_SETTLE_MS` (1 s) later releases the latch and shows the
    layer again, so a refused history step cannot leave it faded for good; a replace is never released, since Next
    keeps the old address until the new page is there.
  - The entrance (`animate-listing-in`, no fill mode) plays for the overlay copy only: a directly loaded listing is
    the first paint and does not slide in. `data-layer-motion` lets `lite.css` stop both animations.
  - `closeListing(step, close)`: when the app pushed the listing over a page, it steps back over the sheet and its
    steps first and awaits it, then calls the layer's close. When the listing itself was loaded directly, the sheet's
    soft push had opened an overlay copy over the standalone one, so the copy whose close this is would hide on the
    step back and drop its leave (review of WP-36); there the sheet and the listing go in one move and the feed
    replaces the address, without a leave, as before.
- **The "gone" block** stays local to the listing (`ListingGone` in `ListingScreen.tsx`; `EmptyState` is unchanged),
  laid out with the classes of the tall `ErrorState`. The day limit is `ErrorState` with `kind="server"` (CloudOff,
  as legacy's `ErrorState.jsx`) and `data-reason="day_limit"`. `SpotMapRoute` counts `day_limit` among the failed
  states, so its address goes back as for the other errors.
- **The error reason** is typed on the envelope as well: `ApiFailure.reason?: string` of `@homi/types` (hand-written
  part). `failureOf` keeps it only as `"daily"` on a `429`; the access gate's reason never reaches `ApiFailure`.
- **The fallback cross** sits at z-index 3 of the layer it is in, as legacy's `.fallback-close`; it gives no haptic
  (without the SDK there is none). In `SubPage` it fills the header's `back` slot, so `SubPageProps` no longer passes
  `back` through.
- **Gates.** `noAccessView` and `mainRow` take the address's locale (`useLocale()` in `NoAccessScreen`), and
  `noAccessStartUrl(source, number, locale)` tags `seo` only.
- **The launch mark** is `<cyrb53 of the hash, base36>:<number>`. `looksSecret` of `lib/storage.ts` is exported for
  the tests.
- **Row 10.** The check found the controls under Leaflet's panes: the map pane carries z-index 400 and nothing
  between it and the listing layer (z-index 45) or the fullscreen layer (z-index 100) made a stacking context, so the
  tiles and the circle painted over the expand chip and over the fullscreen ×, «Где я», attribution and card, and the
  mini map's panes painted over the whole fullscreen map opened inside the same listing layer. A tap still reached
  every control: the map's box takes no pointer events and the panes' own boxes are empty, which is why WP-28's
  clicks passed. Each map's box is now a stacking context (`isolate`, `data-spot-map-frame`) in `SpotMap.tsx` and
  `SpotMapFullscreen.tsx`. Legacy's z-index 1000 on the controls was not copied: inside the listing layer it would lift
  the chip over the CTA bar and the fallback cross. The search map is not affected: its box is `position: fixed`,
  itself a stacking context.
- **The collapsed chrome** stays on for a listing address drawn over the `search-list` variant, not for the variant
  alone (the filter sheets over the feed share it and must not keep the chrome collapsed).

## Files

New, under `frontend/app/`: `features/shell/FallbackClose.tsx`, `tests/shell/FallbackClose.test.tsx`; as built also
`lib/navigation/backHandler.ts`.

Changed, under `frontend/app/`:

- `lib/api/{errors,server,browser}.ts`, `lib/session/{types,bootstrap}.ts`, `lib/analytics/events.ts`,
  `lib/deeplinks/{launch,build}.ts`, `lib/storage.ts`
- `features/listing/{useListing.ts,ListingScreen.tsx,ListingLayer.tsx,closeListing.ts}`,
  `features/shell/{RouteOverlay,SubPage,AppShell}.tsx`, `features/gates/accessReason.ts`, and the spot map's two
  files if the check needs it (it did: `features/listing/spot/{SpotMap,SpotMapFullscreen}.tsx`); as built also
  `features/shell/TelegramButtons.tsx`, `features/gates/NoAccessScreen.tsx`, `features/listing/actions/useListingActions.ts`
  (the layer's close for `closeListing`) and `features/listing/spot/SpotMapRoute.tsx` (`day_limit` is a failure)
- tests: `tests/listing/{ListingScreen,useListing,ListingLayer}.test.tsx`, `tests/listing/closeListing.test.ts`,
  `tests/api/errors.test.ts`, `tests/gates/{accessReason.test.ts,NoAccessScreen.test.tsx}`,
  `tests/deeplinks/{launch.test.tsx,build.test.ts}`, `tests/shell/{route-overlay,sub-page,AppShell}.test.tsx`,
  `tests/session/bootstrap.test.ts`
- end to end: `e2e/listing-open.spec.ts`, `e2e/gates.spec.ts`, `e2e/launch.spec.ts`, `e2e/shell.spec.ts`,
  `e2e/spot-map.spec.ts`

Changed in `frontend/packages/`: `api-client/src/{index,index.test}.ts`, `ui/src/icons/index.ts` (`SearchX`),
`ui/src/components/SubPageFrame.tsx`, `ui/src/styles/layout.css`, `ui/tests/{controls,SubPageFrame}.test.tsx`; as
built also `types/src/index.ts` (`reason` on the failure envelope), `ui/src/styles/{motion,theme,lite}.css` (the
layer's keyframes, their tokens and the lite rule), `ui/tests/tokens.test.ts`, and `i18n/src/labels.ts` with
`i18n/tests/labels.test.ts` (the no-access tables know `paused`).

In `docs/migration/wave-1/baseline.md`, built code behind the pin: rows 5, 6, 8, 9, 10, 15, 17, 18, 19, 28 and 29
are marked closed.

## Steps

1. The error reason through the client and the mapping; the `day_limit` and "gone" states; `SearchX`.
2. Write the design note of the close path (who calls it, where the leave plays, the swipe case) in the PR; then
   the one close function, the entrance and leave, and the chrome under the listing.
3. `FallbackClose` in the listing layer and in `SubPage`.
4. `paused`, the start-link rule and the SEO source with the language.
5. The session policy of `lib/storage.ts` and the launch mark.
6. `tg` in `app_launch`; `body.subpage-open`; the spot-map check.
7. Unit, component and end-to-end tests; the acceptance checklist on staging; tick the rows in `baseline.md`.

## Behaviour to reproduce

### Listing (SCR-019, SCR-008; BR-API-193; rows 17, 18)

- A `404` of the full card: «Этого объявления уже нет — квартиру, похоже, сдали или продали» with «Смотреть свежие»;
  the button closes the listing (to the feed below, or to the parent address on a direct load). No retry.
- `429` with `reason: "daily"`: «Лимит на сегодня» and «За сутки открыто очень много объявлений. Попробуйте позже —
  Радар продолжит присылать новые в чат.» with «Повторить». Any other `429` shows «Не загрузилось».

### Shell (TMA-047, TMA-022; SCR-006, SCR-018, SCR-033; `03` §1.2; rows 5, 6, 9, 10, 19)

- Without the SDK a cross «Закрыть» sits on the listing in every state and on every sub-page; it closes as Back
  does; it disappears when the SDK arrives.
- The listing slides in and out as WP-26 specifies; after a swipe it closes without the leave; none in lite or
  under reduced motion.
- The collapsed chrome stays collapsed while a listing is open over the feed.
- While a sub-page is open the page under it does not scroll.
- On Leaflet the spot map's expand chip, close, locate and attribution receive taps.

### Gates (SCR-003; BR-APP-054; BR-API-194; rows 28, 29)

- `paused`: «Бот на паузе», «Скоро вернёмся. Ваши Радары и избранное на месте.», the main button «Вернуться в бот»
  with no source passed to the bot; the checking line and the automatic re-checks as for the other reasons.
- A listing link with the SEO source opened in en offers `?start=s_seo_en--l<number>`, in uz `s_seo_uz--l<number>`,
  in ru `s_seo--l<number>`.

### Launch (BR-APP-106; TMA-010; row 15)

- A listing link opens its listing once per launch: a reload of the page inside the same launch does not open it
  again; a new launch does. The mark holds a digest, never the `hash`.

### Analytics (`03` §3.3; row 8)

- `app_launch` carries `tg`, Telegram's WebApp version, not truncated.

## Tests

Unit (Vitest):

- `tests/api/errors.test.ts`: a `429` with `reason: "daily"` keeps the reason; a `429` without it and another
  status with it have none; the `@homi/api-client` test reads `reason` from an error body.
- `tests/gates/accessReason.test.ts` (`:46,75`): `paused` is known, has no start link and keeps the checking line;
  `blocked` unchanged.
- `tests/deeplinks/build.test.ts`: `seo` in the three locales; other sources unchanged.
- `tests/deeplinks/launch.test.tsx`: the mark is written once the address showed the target; a matching mark means
  no target; another `hash` or number opens again; the stored value contains neither the `hash` nor launch data and
  passes `looksSecret`; a throwing `sessionStorage` means "not opened yet".
- `tests/session/bootstrap.test.ts`: `app_launch` carries `tg`.

Component (Vitest + Testing Library):

- `tests/listing/ListingScreen.test.tsx` (`:276-286`): the "gone" block with `role="alert"`, its text and button;
  the button's light haptic and one close; the day-limit state with «Повторить», which reads again.
- `tests/shell/FallbackClose.test.tsx`: absent on the server render; present after hydration without the SDK;
  gone when `subscribeSdk` reports the SDK; a tap calls the close.
- `tests/shell/route-overlay.test.tsx` and `tests/shell/sub-page.test.tsx`: the cross in each listing state and on
  a sub-page without the SDK, none with it; the entrance class; no motion in lite and reduced motion.
- `tests/listing/closeListing.test.ts` and `tests/listing/ListingLayer.test.tsx`: Back, the cross, the "gone"
  button and `closeListing` each play the leave once and change the route once; the swipe changes it at once.
- `tests/shell/AppShell.test.tsx`: the mini chrome stays on with a listing over the feed.
- `frontend/packages/ui/tests/SubPageFrame.test.tsx`: `body.subpage-open` while mounted, removed on unmount.

End to end (Playwright, fake Telegram, stubs; cookie mode and header mode):

- `e2e/listing-open.spec.ts` (`:242-251`): the number `999404` shows «Этого объявления уже нет»; «Смотреть свежие»
  closes to the feed. The stub scenario `daily_limit` (cookie `homi_stub_scenario`) shows «Лимит на сегодня» on a
  listing; «Повторить» without the scenario loads it.
- `e2e/gates.spec.ts`: the scenario `access_paused` shows «Бот на паузе» and «Вернуться в бот», and no link with
  `start=`; a listing link with the SEO source in en under `access_private` offers `s_seo_en--l<number>`.
- `e2e/launch.spec.ts`: a listing link opens the listing; `page.reload()` in the same launch shows the feed, not the
  listing; a launch with another `initData` opens it again.
- `e2e/shell.spec.ts` with `launchApp(page, { sdk: false })`: the cross on the listing in its skeleton, content and
  error states (`999503`) and on `/settings/theme`; each closes; the page below a sub-page does not scroll.
- `e2e/spot-map.spec.ts`: on the Leaflet engine the mini map's expand chip opens the fullscreen map.
- `tests/listing/ListingLayer.test.tsx`: a new opening during the leave cancels the leave and shows the new listing.
- `tests/gates/useBootRetry.test.tsx`: `paused` is checked again three times and on the return to the app; `blocked`
  is not.

As built *(rule 6)*:

- Unit and component tests also changed: `tests/api/{browser,server}.test.ts` (the reason through both readers),
  `tests/storage.test.ts` (the `session` policy), `tests/gates/useBootRetry.test.tsx` (`paused` re-checks),
  `tests/listing/useListingActions.test.tsx` (`closeListing` receives the layer's close),
  `tests/listing/SpotMapFullscreen.test.tsx` (`day_limit` goes back), the contexts of
  `tests/listing/{ListingActionsSheet,MarketSheet,PhotoViewer}.test.tsx`, `frontend/packages/ui/tests/tokens.test.ts`
  (the keyframes, the lite rule, the body lock) and `frontend/packages/i18n/tests/labels.test.ts`.
- `tests/listing/closeListing.test.ts` also covers `leaveListingRoute` and `listingLeavePlays`, and the single move of
  a directly loaded listing; `tests/listing/ListingLayer.test.tsx` the overlay copy at depth 0, the settle of a step
  back and the replace that is never released.
- `e2e/launch.spec.ts`: the new launch opens in a new page (a new webview has a new `sessionStorage`, as in
  Telegram); that another `hash` alone opens the listing again is proven by `tests/deeplinks/launch.test.tsx`.
- `e2e/gates.spec.ts`: the `seo_en` case checks the bot link only in a build with a bot name; without one (CI, and
  the local build of this package) it sees «Back to the bot» and the unit tests prove the payload.
- `e2e/spot-map.spec.ts`: the Leaflet check reads the nearest stacking context around `.leaflet-map-pane` (the
  map's box, `data-spot-map-frame`) rather than pixels: the raster tiles are drawn translucent, so a control under
  them still changes the screenshot when hidden.
- Also added: `e2e/listing-open.spec.ts` the entrance (`listing-in` running as the layer appears) and, on a scrolled
  listing, the leave held half way (`listing-out` running, the layer moved right, the CTA bar at the bottom of the
  screen); `e2e/listing-actions.spec.ts` «Скрыть» on a directly loaded listing; `tests/shell/route-overlay.test.tsx`
  the leave after a swipe that slid back.
- WP-38's text on the one close function says where its sale switch hooks as built (rule 6).

## Acceptance checklist

Run in ru, uz and en, light and dark, in Telegram on staging.

- [ ] A missing listing shows «Этого объявления уже нет»; «Смотреть свежие» returns to the feed.
- [ ] The day limit shows «Лимит на сегодня» with its text and «Повторить»; another `429` shows «Не загрузилось».
- [ ] `paused` shows «Бот на паузе» and «Вернуться в бот», with no source in the bot link.
- [ ] A `seo` launch in en builds `s_seo_en--l<number>`, in uz `s_seo_uz--l<number>`.
- [ ] A reload inside one launch does not reopen the listing; a new launch does.
- [ ] The launch mark holds no launch data in the clear (read in the browser's storage).
- [ ] Without the SDK the listing in its skeleton, content and error states and every sub-page have a close cross,
      and it goes when the SDK arrives.
- [ ] The listing layer enters and leaves; no motion in lite graphics or with reduced motion.
- [ ] The chrome stays collapsed under an open listing.
- [ ] `app_launch` carries `tg`.
- [ ] The page under a sub-page does not scroll.
- [ ] The spot map's controls work on the Leaflet engine (the check is recorded in the PR).
- [ ] Every new or changed case of `e2e/listing-open.spec.ts`, `e2e/gates.spec.ts`, `e2e/launch.spec.ts`,
      `e2e/shell.spec.ts` and `e2e/spot-map.spec.ts` passes in cookie mode and in header mode.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, unit, component and end-to-end suites are green.
- [ ] A listing opened while another is leaving shows the new one at once.
- [ ] With `access_paused` the screen «Бот на паузе» re-checks by itself and leaves when the access is back.
- [ ] Rows 5, 6, 8, 9, 10, 15, 17, 18, 19, 28 and 29 of `baseline.md` (built code behind the pin) are marked closed.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web, including a
      reload inside one launch.

## Handoff

- **Done** on `wp-36-catch-up-listing-gates-shell` (from `main` = `989d041`, after #93) by the main session. Steps 1 –
  7 as written; the design note of the close path is in the PR and, as built, under Design; the checklist on staging
  waits for the production track.
- **Departures recorded under rule 6** (Design, Files and Tests above): the close owned by `ListingLayer` with
  `takeOverBack` for Telegram's Back; the leave by insets; no leave for an overlay copy at depth 0; the settle; the
  single move of `closeListing` on a directly loaded listing; `isolate` instead of z-index 1000 for row 10; the extra
  files.
- **Row 10 check.** Run on the Leaflet engine with opaque red tiles: the stacking chain of `.leaflet-map-pane` (z-index
  400) reached the listing layer (45) and the fullscreen layer (100) with no stacking context between, and the
  screenshots showed the tiles over the chip, the fullscreen ×, «Где я», attribution and card, and the mini map's
  tiles and circle over the whole fullscreen map. With `isolate` the chain stops at the map's box; without it the new
  end-to-end case fails (checked by removing it).
- **Review.** One independent review subagent read `006cb5a`. Its findings, fixed in `5ef3961`: `closeListing` on a
  directly loaded listing called the close of the overlay copy that the step back hid, so «Скрыть» left the hidden
  listing on screen (a regression); the leave's transform moved the CTA bar and the cross on a scrolled listing; an
  overlay copy at depth 0 faded out to its standalone twin; the settle could show the layer again during a slow
  replace; the `@homi/i18n` no-access tables lacked `paused`. Running the tests also showed that `cn` kept both
  animation classes while leaving; the entrance class is now dropped. Left as legacy: the layer takes no taps while
  it leaves. Left for later: the swipe's same jump of the fixed children (KI-67, structural).
- **Checks.** `pnpm test` (every project): app 217 files, 3 628 tests passed on `5ef3961`; `pnpm -r lint` and `pnpm -r
  typecheck` exit 0. Mutation checks: `closeListing` without the direct-load rule, the layer without the depth-0 rule,
  `listingOpened` always false, `failureOf` keeping `daily` on any status, the chrome rule without the listing, and
  `NO_SOURCE` without `paused` each fail their new tests.
- **Local end-to-end runs**, one build per batch, each spec alone (KI-32), cookie and header mode where the spec has
  both. On `006cb5a` with the row-10 fix: `listing-open` 19 of 20 (the second opening of 999404 met two screens in the
  layer; the case now reads the visible one), `gates` 11, `launch` 6, `shell` 19, `spot-map` 14, `listing-actions`
  20, `photo-viewer` 6, `back` 11, `saved` 10, `map` 18, `feed` 23, `listing-contact` 14, `map-leaflet` 17, `map-lasso`
  9, `session` 7, `city` 6, `data` 5, `crash` 4, `csp` 3, `boot-failure` 6, `smoke` 2, `filters` 22 passed;
  `foundation` 18 of 19, `feed-radar` 0 of 10, `follow-nudge` 2 of 12 and `return-nudge` 0 of 16 failed only where
  they need radars, which are off on this machine (KI-65); `radar-forms`, `radar-subscribe` and `radars` were not run
  (KI-65). On `5ef3961`: `listing-open` 21, `listing-actions` 22, `spot-map` 14, `shell` 19, `back` 11, `saved` 10,
  `gates` 11, `launch` 6, `photo-viewer` 6, `map` 18 passed.
- **Left for the production track:** the regular deploy (no environment key, no migration), then the acceptance
  checklist inside Telegram on staging on iOS, Android, Desktop and Web, including a reload inside one launch and the
  spot map on a client that falls to Leaflet.
