# WP-38 — Catch-up: feed continuity

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (#97) |
| Depends on | WP-36 (and through it WP-35 and WP-34: `TabBar.tsx`, the listing's one close path, `lib/deeplinks/launch.ts`) |
| Size | about 630 changed lines with tests, L |
| Behaviour reference | `03` §2 (SCR-006, SCR-007, SCR-028, SCR-046, SCR-063), §4 (BR-APP-070, BR-APP-104, BR-APP-105, BR-APP-108), §5b (LB-APP-082); `05` (TMA-010, TMA-023); `24` Q-APP-030; `wave-1/baseline.md`, built code behind the pin, rows 13, 14, 16, 37 |
| Needs from the production track | the regular deploy; then the manual checks inside Telegram on staging that the acceptance checklist names |

## Goal

After six hours in the background the search feed is re-created silently, or offers «Показать N новых» when the
list is scrolled or covered. The feed's scroll survives the map, the other tabs and Telegram's Settings button. A
sale listing opened by a launch link over a rent feed leaves a sale feed behind it when it closes. The radar sheet
re-opened after a listing keeps the strip's sideways scroll and its own scroll. The feed epoch and the scroll memory
are exported for WP-31.

## Scope

In (sizes are the estimates of `baseline.md`; paths under `frontend/app/` unless they start with `frontend/packages/`):

- Row 13, about 290 lines: the feed epoch, the long-return rule, the fresh pill.
- Row 14, about 180: the scroll memory per list key.
- Row 16, about 120: the sale switch of a launch listing, on close.
- Row 37, about 40: the radar sheet's two scrolls.

Out:

- A feed kept mounted by the app: not built (DEC-63); Next's route cache keeps the pages.
- The hidden list's feed reload and its forgetting of the scroll: WP-31, through the exports of this package.
- The launch link `?radar=<id>`: WP-57 with WP-52 (DEC-61).
- One request and one count for the pill and the return banner, `since` from the first page (LB-APP-082): not
  adopted, except that the pill's request is aborted on a new list key (a default of the integrator).
- The return banner itself (SCR-046): unchanged; it must keep working after the silent reload.

## Decisions that bind this package

- DEC-63: Next's route cache stays (it keeps up to three routes); HOMI adds a scroll memory per list key instead of a
  feed that is always mounted. How often the list is lost is measured on staging (`24` Q-APP-030). The sentences of
  WP-24 and WP-23 that a new list key and a tab press scroll to the top stay for a new key and for the other tabs.
- DEC-64: HOMI keeps its instant re-open of the radar sheet instead of legacy's parked mount, and restores the
  strip's sideways scroll and the sheet's own scroll.
- DEC-65: a sale listing opened by a launch link over a rent feed changes the feed below to the sale defaults of the
  feed's city when that listing closes; legacy switches it while the listing is open. HOMI cannot change the address
  of the page under an intercepted overlay while the overlay shows (WP-26 "Layers, Back and z-order").
- DEC-51: the pill is not a radar offer; it shows with radars off too.

## Design

### Feed epoch

- `features/feed/feedQuery.ts` (`:27-34`): a module store `feedEpoch()`, `bumpFeedEpoch()`, `subscribeFeedEpoch`;
  `feedListKey(filters, sort, version, epoch)` joins the search key, the pull version and the epoch.
- `features/feed/FeedServer.tsx:52` builds the key with `FIRST_VERSION` and epoch 0. After a bump the client's key
  differs from the server's page one, so the list reads page one itself, as after a pull (`feedQuery.ts:6-10`).
  While the feed is hidden the bumped list does not read; it reads page one when it is shown again.
- Only the list moves: the filters and the sort stay, so the return banner's candidate survives the reload.
- Exported for WP-31 (the hidden list's success path bumps the epoch).

*As built (rule 6):* the epoch is not a fourth part of the key. `FeedScreen` keeps the epoch it last took beside the
pull version, and a bump counts as one more pull of the search shown (`Refreshed.epoch`), so the key differs from the
server's page one; another search starts again from `FIRST_VERSION` and adopts its server page one. A global epoch in
the key would have kept every later search from adopting it. `feedListKey` keeps its three arguments.

### Long return

- `features/nudges/visits.ts` (`:104-109`, `:176-185`): the tracker gets a third callback, `onLongReturn`, called
  after `onSession` when the app becomes visible after `RETURN_AWAY_MS` (6 h) hidden.
- New `features/feed/fresh.ts` with `useFreshFeed()`, wired by `NudgeHost` beside the tracker. On `onLongReturn`:
  - the active tab (`activeTabOf`, `features/shell/shellVariant.ts`) is not search → `bumpFeedEpoch()` and
    `forgetFeedScroll()`; no request;
  - search tab, nothing covers the list (the feed or the map is its own address) and the list's scroll is under
    60 px (`MINI_CHROME_TOP_ZONE_PX`) → `bumpFeedEpoch()`; no request. On the map the list's scroll is the
    remembered one when its key matches, else 0;
  - otherwise (scrolled, or a listing, the filters sheet, a quick filter, the city or sort sheet, the radar create
    or edit sheet or the draw layer covers it) → `GET /bff/listings/new` (`lib/api/bffAllowList.ts:13`) with the
    feed's filters and `since` = the moment the list on screen was created, in seconds; the count is `newCount()`
    (`features/nudges/returnRules.ts:64-70`). An answer for another list key is dropped and the request is aborted
    on a new key; an error shows nothing.
- The count is kept in the store of `fresh.ts` and resets to 0 on a new list key.

*As built (rule 6):*
- `useFreshFeed(context)` returns a stable `onLongReturn`, which `NudgeHost` passes through the options of
  `useReturnNudge` to the tracker; the tracker keeps the callbacks of its first render, so the handler reads the host's
  context (`searchTab`, `env.layer`, the route for the view) from a ref.
- The list on screen is handed to `fresh.ts` by `FeedScreen` (`freshFeed.show(key, filters)`); `since` is the first
  time that key was shown, in whole seconds.
- `newCount` moved to `features/nudges/newCount.ts` (`returnRules.ts` re-exports it), so the feed's module does not
  load the radar rules.
- The clock is read through `Date` on every call, so a clock installed later (tests, Playwright) counts.

### Fresh pill

- `features/shell/TopBar.tsx:136-151` (`SearchListBar`): the pill under the header while the count is above 0 and
  nudges may show (`NudgeHost.tsx:48`: the feed's own address, no layer, the session ready). With a listing open the
  request goes at once and the pill shows after the listing closes; on the map, after the return to the list.
- A glass button, 36 px high, 18 px radius, centred 10 px under the bar; with the collapsed chrome it moves down by
  `--top-inset` + 54 px, in lite graphics by 42 px (`styles/shell.css:74-131,147-220`). Icon `ArrowUp` 16 px,
  exported by `frontend/packages/ui/src/icons/index.ts`; text the plural `app.freshShow`.
- Tap: light haptic, scroll to the top, `bumpFeedEpoch()`; the count goes with the new key. No timer, no event.

*As built (rule 6):*
- The pill is `features/feed/FreshPill.tsx`, rendered by `SearchListBar`.
- It is an opaque pill on `--sheet` with a shadow and a fade, as legacy `.fresh-pill` (`chrome.css:183-213`), not
  glass.
- Its rule is `feedListFree`, which `NudgeEnv.allowed` now uses too.

### Scroll memory

- New `features/feed/feedScroll.ts`: one entry `{ listKey, y }` with `rememberFeedScroll`, `takeFeedScroll(listKey)`
  and `forgetFeedScroll()`; in memory only. Exported for WP-31.
- `features/feed/FeedScreen.tsx:58,99-105`: when the feed stops being its own address (map, another tab, Settings
  button, a layer) it remembers `window.scrollY` with its key; in the layout effect where it is its own address again
  with the same key it restores that position instead of scrolling to the top. A new key still scrolls to the top.
- `features/shell/TabBar.tsx:65-70,78-84,89`: arriving on the search tab does not scroll to 0 when a memory matches;
  a press of the active tab forgets it and scrolls to the top.
- «Смотреть найденное» (`features/radars/RadarSheet.tsx:141-142`) and the Back from a radar's feed forget it.

*As built (rule 6):*
- The memory key is the `FeedScreen` instance (`useId`) and the list key, so a list re-created by Next's route cache
  scrolls to the top instead of taking the position of the list it replaced. `takeFeedScroll` says `"other"` for such
  an entry, and the list goes to the top.
- While the list is its own address its position is followed by the scroll events; it is not read when it stops being
  its own, since that commit may already have shrunk the document or scrolled the next tab to its top. The restore is
  repeated in the next frame, after the browser's own restoration on a Back, and is skipped when the window is already
  there (under a layer).
- `TabBar` decides at the press whether the arrival scrolls to 0, because the list's layout effect runs before the
  bar's in the arrival commit.
- The Back from a radar's feed is told by `RadarReturn.via === "feed"` in `RadarSheetRoute`; a find's return keeps the
  memory.

### Sale switch

- `lib/deeplinks/launch.ts`: `launchListing()` gives the number of the consumed launch's listing, else `null`.
- New `features/listing/saleSwitch.ts`: when `useListing` receives the first full record of that number, the record's
  deal is `sale` and the feed's own search (`useScreenSearchState("feed")`) is not a sale, it sets a mark for that
  number. Daily rent sets nothing; a later load of the same listing changes nothing; opening another listing clears
  the mark.
- The one close function of WP-36 (`features/listing/closeListing.ts`): closing the marked listing to the feed — by
  Back, the swipe, the fallback cross, the "gone" button or `closeListing` — goes back and then replaces the feed's
  address with the sale defaults of the feed's city (`defaultFilters("sale", city)`, `toSearchParams`), as
  `applyFilters` does (back, then replace). The mark goes with it. Write the design note of every close path into
  the PR first. *As built by WP-36 (rule 6):* the one close is `close` of `ListingLayerContext`, owned by
  `features/listing/ListingLayer.tsx`; every path that closes through it ends in `leaveListingRoute()` of
  `closeListing.ts` — the swipe at once (`close("swipe")`), the others after the leave — so the switch belongs in
  that route change (back, then the replace) or in `close`. One path bypasses it: `closeListing()` on a directly
  loaded listing (the app's history holds no page below) moves back over the sheet and the listing in one step and
  replaces the address with the feed; that replace must carry the sale defaults too.

*As built (rule 6):*
- The feed's search is the list `FeedScreen` shows (`freshFeed.feed()`). Without one in this launch it is the default
  rent feed of the profile's city.
- `leaveListingRoute(number)` takes the mark at once. When the page below is the feed (the app's stack) it runs
  `closeThen(sale)`: back, then the replace. It does not use `applyFilters`, which would tell the apply listeners and
  arm the follow nudge. At depth 0 it is the replace alone; another page below only goes back.
- `closeListing(step, close, number)` takes the mark before its await in the direct-load branch.
- The layer's hide drops the mark of its number (a Back of the browser), and so does opening another listing.

### Radar sheet

- `features/radars/radarReturn.ts:16-22`: `RadarReturn` also holds `stripX` and `sheetY`.
- `features/radars/RadarStrip.tsx:48-53`: the strip's root takes a ref; a find opened from it stores `scrollLeft`.
- `frontend/packages/ui/src/components/BottomSheet.tsx:257,328-331`: the sheet exposes its scroll body (a `bodyRef`
  prop); the radar sheet stores its `scrollTop`.
- `features/radars/RadarSheetRoute.tsx:143-145,160-165`: the instant opening restores the tab's scroll as today, and
  then the sheet's and the strip's.

*As built (rule 6):*
- `RadarReturn` holds `via`, `stripX` and `sheetY`.
- `RadarSheet` finds its scroll body with `closest('[data-slot="bottom-sheet-body"]')` and the strip with
  `querySelector`, as `ListingLayer` finds its scroller. `BottomSheet` and `RadarStrip` are unchanged.
- The body's scroll is restored once the radar renders, and the strip's once its finds replace the ghosts (a ghost
  strip would clamp it). Both are restored once per opening, for a find and for «Смотреть найденное».

## Files

New, under `frontend/app/`: `features/feed/{fresh,feedScroll}.ts`, `features/listing/saleSwitch.ts`, their tests
`tests/feed/{fresh,feedScroll}.test.ts`, `tests/listing/saleSwitch.test.ts`, and `e2e/feed-continuity.spec.ts`. *As
built:* also `features/feed/FreshPill.tsx` and `features/nudges/newCount.ts`.

Changed, under `frontend/app/`:

- `features/feed/{feedQuery.ts,FeedServer.tsx,FeedScreen.tsx}`, `features/nudges/{visits.ts,NudgeHost.tsx}`,
  `features/shell/{TopBar,TabBar}.tsx`, `styles/shell.css`, `lib/deeplinks/launch.ts`,
  `features/listing/{useListing,closeListing}.ts`, `features/radars/{radarReturn.ts,RadarStrip.tsx,RadarSheet.tsx}`,
  `features/radars/RadarSheetRoute.tsx`, `features/gallery/UiGallery.tsx` (`ArrowUp`)
- tests: `tests/nudges/visits.test.ts`, `tests/feed/{FeedScreen.test.tsx,FeedServer.test.ts}`,
  `tests/shell/{TopBar,TabBar}.test.tsx`, `tests/radars/{RadarSheetRoute,RadarSheet}.test.tsx`,
  `tests/deeplinks/launch.test.tsx`, `tests/listing/closeListing.test.ts`, `tests/nudges/ReturnNudge.test.tsx`

Changed in `frontend/packages/ui/`: `src/icons/index.ts`, `src/components/BottomSheet.tsx`,
`tests/{controls,BottomSheet}.test.tsx`. *As built:* only `src/icons/index.ts` and `tests/controls.test.tsx`; also
changed under `frontend/app/`: `features/nudges/{useReturnNudge,returnRules}.ts`, `features/listing/ListingLayer.tsx`,
`features/listing/actions/useListingActions.ts` and `tests/listing/useListingActions.test.tsx`; not changed:
`features/radars/RadarStrip.tsx`.

In `docs/migration/wave-1/baseline.md`, built code behind the pin: rows 13, 14, 16 and 37 are marked closed.

## Steps

1. The feed epoch in the key, with the server's key unchanged; unit tests.
2. The scroll memory in `FeedScreen` and `TabBar`; the forgetting by the active tab and the radar's feed.
3. The third callback of the visit tracker; `useFreshFeed` with its rule matrix; the abort on a new key.
4. The pill in the top bar with its CSS and `ArrowUp`.
5. The design note of the close paths; the sale mark and the switch in the one close function.
6. The radar sheet's two scrolls.
7. Unit, component and end-to-end tests; the measurement of Q-APP-030 and the acceptance checklist on staging;
   tick the rows in `baseline.md`.

## Behaviour to reproduce

### Long return (BR-APP-104, BR-APP-070; SCR-063; row 13)

- After at least 6 h in the background: a new visit session and the radar list read again (as today), then one of
  three outcomes. Not on the search tab → the search feed is re-created silently and its scroll memory dropped. On
  the search tab, uncovered and within 60 px of the top → re-created silently, no pill. Otherwise → the count of new
  listings since the list was created; «Показать 1 новое» / «Показать 3 новых» (en «Show 3 new», uz «3 ta yangisini
  koʻrsatish») while the count is above 0.
- The pill shows only where nudges may show; it has no timer and goes with a new search, sort or reload. A tap
  scrolls to the top and reloads from page one.
- The return banner keeps its own rules (SCR-046); both may ask and both may show after one long return, as legacy
  (LB-APP-082). After a long return the banner's `since` is the last recorded visit (`inferred` in legacy).

### Scroll memory (BR-APP-105; TMA-023; row 14)

- Remembered when the list leaves for the map, another tab or the Settings button; restored when the list shows
  again with the same key. Dropped by a press of the active tab, by «Смотреть найденное» and its Back, by a long
  return on another tab and by a changed search, sort or reload.

### Sale switch (BR-APP-108; TMA-010; row 16)

- Only the listing of the launch link, only on its first full load, only `deal: sale` over a feed that is not a
  sale: on close the feed shows the sale defaults of the feed's city. Daily rent switches nothing; no sort check.

### Radar sheet (SCR-028; row 37)

- A find opened from a radar's strip and closed: the sheet re-opens at once with the strip and its own scroll where
  they were, and the tab below as today.

## Tests

Unit (Vitest):

- `tests/nudges/visits.test.ts` (`:161`): `onLongReturn` after `onSession`, only after 6 h hidden.
- `tests/feed/fresh.test.ts`: the rule matrix — tab (search or not) × covered × scroll (under or from 60 px, on the
  list and on the map with and without a matching memory) × count (0, 3, invalid); the abort on a new key; an answer
  for an old key dropped; an error shows nothing.
- `tests/feed/feedScroll.test.ts`: remember, take by key, forget; another key restores nothing.
- `tests/listing/saleSwitch.test.ts` and `tests/deeplinks/launch.test.tsx`: the mark only for the launch listing,
  its first full record, `sale` over a non-sale feed; none for daily rent; cleared by another listing.

Component (Vitest + Testing Library):

- `tests/feed/FeedScreen.test.tsx` and `tests/feed/FeedServer.test.ts`: the server key with epoch 0 is adopted; a bump
  reads page one; a hidden feed reads only when shown; the scroll restores with the same key and goes to the top
  with a new one.
- `tests/shell/TabBar.test.tsx`: no scroll to 0 on arrival with a matching memory; a press of the active tab forgets.
- `tests/shell/TopBar.test.tsx`: the pill with a count and nudges allowed, also with radars off; none with 0 or under
  a layer; its text in ru, uz and en; a tap bumps and scrolls.
- `tests/nudges/ReturnNudge.test.tsx`: a bump of the feed epoch keeps the banner's candidate (the filters stay), and
  the banner still shows after the silent reload.
- `tests/listing/closeListing.test.ts`: each close path of the marked listing ends in back, then the replace.
- `tests/radars/RadarSheetRoute.test.tsx`: the instant opening restores the strip's `scrollLeft` and the sheet's
  `scrollTop`.

End to end (`e2e/feed-continuity.spec.ts`; Playwright, fake Telegram, stubs, Playwright's clock and a dispatched
`visibilitychange`; cookie mode and header mode):

- A listing open, 7 h hidden → visible → one request to `/bff/listings/new` (answered `count: 3` by `page.route`);
  after the close «Показать 3 новых»; a tap reloads from page one.
- At the top with nothing open, 7 h hidden → visible → a silent reload and no pill; on the radar tab → the feed is
  re-created and opens at the top.
- List scrolled → map → list; feed → the Heart tab → feed; SettingsButton → Back: the scroll is kept each time.
- A find opened from a radar's strip and closed leaves the strip and the sheet where they were (radars on).
- A sale launch link (`start_param` `l_<number>` of a stub sale listing) over the rent feed → close → the sale feed
  of the same city; a daily-rent one changes nothing.

## Acceptance checklist

Run in ru, uz and en, light and dark, in Telegram on staging.

- [ ] A long return gives each of its three outcomes: a silent reload on another tab, a silent reload at the top,
      the pill when scrolled or covered.
- [ ] The pill counts in three locales and disappears on a new search; a tap reloads from page one.
- [ ] The return banner still works after the silent reload.
- [ ] The feed's scroll survives the map, the tabs and the Settings button, and is dropped by a second tap on the
      tab, by a radar's feed and by a changed search.
- [ ] A walk over all four tabs and the map was measured on staging and the result is written into the PR and into
      `24` Q-APP-030.
- [ ] The radar sheet re-opens with the strip and its own scroll where they were.
- [ ] A sale launch listing leaves a sale feed behind it; a daily-rent one changes nothing.
- [ ] Every case of `e2e/feed-continuity.spec.ts` passes in cookie mode and in header mode.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, unit, component and end-to-end suites are green.
- [ ] Rows 13, 14, 16 and 37 of `baseline.md` (built code behind the pin) are marked closed.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web, including
      a real return after six hours on one device.

## Handoff

- **Done** on `wp-38-catch-up-feed-continuity` (from `main` = `efa4f9b`, after #96) by the main session. Steps 1 – 6
  as written. Step 7 is partly done: the unit, component and end-to-end tests are written. The Q-APP-030 measurement
  and the checklist on staging wait for the production track.
- **Departures recorded under rule 6:** under Design and Files above.
- **The close paths of the sale switch:**
  - Telegram's Back at the listing's own address, the swipe, the fallback cross, «Смотреть свежие» and the layer's
    `close` all reach `leaveListingRoute(number)` through `ListingLayer`'s `changeRoute`.
  - `closeListing()` reaches it through `close`, except on a directly loaded listing, whose single move replaces with
    the taken mark.
  - A Back of the browser hides the layer, which drops the mark.
- **Checks.** `make ci-frontend` exit 0 (generated types, lint, typecheck, the three builds; app 220 files, 3 698 tests).
- **End to end.** `e2e/feed-continuity.spec.ts` was not run locally: this machine's API answered `500`, because its
  database host was unreachable (`No route to host`). The spec runs in CI. Its radar case needs radars on, which CI
  has.
