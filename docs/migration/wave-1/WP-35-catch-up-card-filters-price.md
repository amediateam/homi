# WP-35 — Catch-up: card, facts, filters and price input

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | WAITING (merged in #93 on 2026-11-20; production track: the regular deploy; then the manual checks inside Telegram on staging) |
| Depends on | WP-34 (`lib/flags.ts` with the defaults of the pinned release) |
| Size | about 420 changed lines with tests, M |
| Behaviour reference | `03` §2 (SCR-006, SCR-007, SCR-013, SCR-018), §3.5 (price input), §3.6 (tokens), §4 (BR-APP-007, BR-APP-019, BR-APP-020, BR-APP-026, BR-APP-059, BR-APP-064, BR-APP-109, BR-APP-110), §5 (LB-APP-011, LB-APP-029), §5b (LB-APP-083); `02` (BR-API-195, BR-API-196); `09` §4.2 (DEV-017); `wave-1/baseline.md`, built code behind the pin, rows 1, 2, 11, 12, 20, 26, 31, 32, 38, 39, 40, 41, 42 |
| Needs from the production track | the regular deploy; then the manual checks inside Telegram on staging that the acceptance checklist names |

## Goal

The feed card and the radar strip compute the age from `posted.at`, and the card's label follows a minute clock. A
ground floor and a basement read as words on the card and on the listing's tile. The card badge has its kinds and
the compact card its shield; `Photo` forgets its state when its address changes. The collapsed title of daily rent
is the summary alone. The filter sheet offers «Площадь» for every deal and «С животными» only for long-term rent,
and rooms «до N» highlights 1 … N. The price field accepts a `$` beside a dollar amount and prints сум without a
thousands separator. Two cosmetic rules of the shell come with them.

## Scope

In (sizes are the estimates of `baseline.md`; paths under `frontend/app/` unless they start with `frontend/packages/`):

- Row 20, about 150 lines: the age label from `posted.at`, the minute clock, the radar strip.
- Row 26, about 45: the floor words on the card and on the tile.
- Row 31, about 20: `Photo` resets on a new address.
- Row 32, about 10: the collapsed title of daily rent.
- Row 38, about 20: «Площадь» for every deal.
- Row 39, about 25: the pets section for long-term rent only, with its own rule key.
- Row 40, about 20: rooms with only an upper bound.
- Rows 41 and 42, about 10 each: the `$` in the dollar field; the сум field without grouping.
- Rows 1 and 2, about 60 and 40: the badge kinds and the compact card's shield.
- Rows 11 and 12, a few lines each: the tab tint and the disabled primary button.

Out:

- The author section's age (`features/listing/sections/AuthorSection.tsx:34`) keeps the server's string: legacy's
  author section does not use the computed label.
- Server time instead of the device clock, and an age form beyond days (LB-APP-083): not adopted; legacy is
  reproduced.
- The server half of the area rule (stubs keep `area_*` for every deal since the intake; WP-42 for legacy) and the
  API and bot halves of DEV-017 (`PROPOSED`).
- Districts and zones in one summary: HOMI's filters cannot hold both (`baseline.md`, "Not in the table").
- The listing states, gates and shell close: WP-36. The fresh pill and the scroll memory, which touch `TabBar.tsx`
  after this package: WP-38.

## Decisions that bind this package

- DEC-58, amending DEC-36 (`25` §2): a flag's default is the behaviour of the pinned release. The pets half of
  DEV-017 is legacy behaviour since `index-CIa0Ldj2.js`, so it gets the flag `dev017PetsLongRentOnly` and the rule
  key of the same name, both on; `dev017TenantPetsDailyRule` stays off and governs the tenant section alone (the
  half legacy did not adopt). Both branches of both keys are tested.
- DEC-62 (`25` §4.1): «Площадь» is a filter of every deal; the sheet shows the section for rent, daily rent and
  sale, in search and in both radar sheets; a rent radar may carry an area.
- DEC-66: the collapsed title of daily rent is the summary alone, as legacy since `index-CIa0Ldj2.js`. It amends
  D-SH-3 of WP-23, which printed the base deal first.
- WP-22 (the money formatter `useMoney`, its fix of LB-APP-011 under DEC-36): HOMI's own reading of separators
  stays («1.000.000» is a million); only the `$` and the field's text follow legacy.

## Design

### Age

- `features/feed/cardText.ts`: `ageLabel(item, now, t)` beside `ageText`. With a parsable `posted.at`,
  `minutes = max(0, floor((now − at) / 60 000))`: under 1 → `card.ageNow`; 1 … 59 → `card.ageMin` with `n =
  minutes`; 60 … 1 439 → `card.ageHours` with `n = floor(minutes / 60)`; from 1 440 → `card.ageDays` with `n =
  floor(minutes / 1 440)`. A missing, empty or unparsable `at`, or `now === null`, falls back to `ageText(item)`
  (the server's `posted.when`, else `posted.label`), which stays exported for the author section.
- New `features/feed/minuteClock.ts`: an external store of the current minute. It starts a 15 s interval and a
  `visibilitychange` listener when the first subscriber comes and stops both when the last one goes; it notifies
  only when the minute number changes. `useMinute(live: boolean)` reads it with `useSyncExternalStore`; the server
  snapshot is `null`, so the server render and the hydration render print `posted.when` and the computed label
  replaces it after hydration (the pattern of `features/listing/sections/HistoryDate.tsx:18-27`). With `live:
  false` the hook reads the minute once after hydration and does not subscribe.
- New `features/feed/CardAge.tsx`: a small client leaf that renders the label, so a new minute re-renders the leaf,
  not the card. `features/feed/ListingCard.tsx:98,187` render it with `live`.
- `features/radars/RadarStrip.tsx:26-28`: the same label without `live`, so it is computed at render and does not
  follow the clock.

### Floor

- `cardText.ts` `factsLine` (`:52-75`): `floor === 0` → `fmt.floorGround`, `floor < 0` → `fmt.floorBasement`,
  both without the total; `null` or a missing key shows nothing; a positive floor is unchanged (with or without the
  total). The doc comment's "floor left out at zero" goes.
- `features/listing/KeyFacts.tsx:31-34`: the tile's value is `listing.floorGround` or `listing.floorBasement` with an
  empty caption; only `null` leaves the tile out.

### Photo

`features/feed/Photo.tsx:76-77`: "loaded" and "failed" reset when `src` changes (the previous address is kept in
state and compared during render), so a reused `Photo` — the radar strip keys by listing only
(`RadarStrip.tsx:62,69`) — shows a new cover from the start. An `eager` photo starts as loaded again.

### Collapsed title

`features/shell/MiniTitle.tsx:32,42`: for `deal === "rent_daily"` the title is the summary alone, which already says
«Посуточно»; other deals keep «<deal> · <summary>»; until the summary is known the title is the deal alone, as now.
The doc comment drops the D-SH-3 sentence and cites DEC-66.

### Filters

- `frontend/packages/search/src/availability.ts:53-69`: `area: true`. `pets`: with the rule key
  `dev017PetsLongRentOnly`, only for `filters.deal === "rent_long"`; without it, for both rents (legacy up to
  `index-CBlEKxdL.js`). `tenant`: both rents, except daily rent with `dev017TenantPetsDailyRule`. The one switch
  `tenantAndPets` is split. The market section «Дом» stays sale-only and «Техника» rent-only.
- The rule key: `SearchRules` in `frontend/packages/search/src/types.ts` gets `dev017PetsLongRentOnly` with its doc
  comment, `DEFAULT_RULES` in `defaults.ts` sets it `true`, and `lib/search/rules.ts` maps the app flag of the same
  name. The doc comments "Every member is `false` by default" (`types.ts`) and "Every flagged branch off: the legacy
  behaviour" (`defaults.ts`) change to the rule of DEC-58: a member's default is the pinned release's behaviour.
- `lib/flags.ts`: `dev017PetsLongRentOnly: true`, with the comment "DEV-017: the pets section only for long-term
  rent"; the comment of `dev017TenantPetsDailyRule` says it governs the tenant section only.
- `features/filters/FiltersForm.tsx:201` renders by `sections.area` and needs no change; the radar sheets reuse the
  form. `focus=pets` already forces long-term rent.
- `frontend/packages/search/src/rooms.ts:28-33`: `isRoomPicked` counts from 1 when only `rooms_max` is set.
  `features/filters/RoomsPicker.tsx:34`: «Любые» is pressed only when both bounds are `null`.

### Price input

`frontend/packages/i18n/src/format/money.ts` (`createMoney`):

- `parseInput(text)` in dollars drops one `$` before or after the amount, with the spaces around it, before
  `parseAmount` (`:156-169`), which stays currency-blind; in сум a `$` still reads as `null`.
- `toInput(usd)` in сум (`:118-123`) prints millions with at most one decimal and no thousands separator («1500»,
  «1500,5» in `ru`, «1500.5» in `en`), so the field's own text parses back.

### Badges, shield, tint, button

- Rows 1 and 2: `features/feed/badges.ts` and `features/feed/ListingCard.tsx` as WP-24 "Card" specifies since the
  intake of `index-CBlEKxdL.js` — the kinds `warn`, `verified` (with the shield) and `quiet`, and the compact
  card's shield after the price for `owner_verified`. `ShieldCheck` is exported by
  `frontend/packages/ui/src/icons/index.ts` (with `tests/controls.test.tsx` there) and shown in
  `features/gallery/UiGallery.tsx`.
- Row 11: `features/shell/TabBar.tsx:115`: an inactive tab is tinted with the text colour at 55 % (`color-mix`),
  with opacity 0.55 as the fallback where `color-mix` is missing (`03` SCR-006, §3.6).
- Row 12: `frontend/packages/ui/src/components/Button.tsx:12`: the `primary` variant has opacity 0.5 when disabled
  (`03` §3.6); the other variants keep theirs.

As built *(rule 6)*:

- **The clock.** The store's snapshot is the minute read from the device clock itself (`currentMinute()`), not a
  value that only the interval refreshes: React reads the snapshot before it subscribes, and the strip never
  subscribes, so both get the minute of their render. The listeners hear of a new minute only; the first listener
  records the minute it came in. The label is computed with the device clock at render (`clockNow()`, legacy
  `ageLabel(item, Date.now())`); the minute only decides when the card's label renders again. `CardAge.tsx` holds
  the hook `useAgeLabel(item, live)` beside the card's leaf `CardAge`; the strip renders its sub-line as a leaf of its
  own (`SubLine` in `RadarStrip.tsx`) that calls the hook without `live`.
- **The badge.** `CardBadge.kind` stays HOMI's name of the badge (`ownerVerified`, `owner`, …, the `data-badge`
  attribute); the legacy kind is its `tone`, now `warn | verified | quiet | plain` (`plain` for «Ниже рынка», which
  has no legacy kind), written as `data-badge-tone` (`data-tone` is the market chip's). The tag's shield is legacy's
  fixed `#16a34a`; the compact card's is `--good`, as legacy's `.lc-verified`.
- **The tab tint** is a rule of `styles/shell.css`, not a class of `TabBar.tsx`: `[data-tab]:not([aria-current])`
  takes `color-mix(in srgb, var(--text) 55%, transparent)`, and `@supports not (color: color-mix(…))` gives the
  text colour with opacity 0.55 (and 0.8 while pressed), as legacy's `chrome.css` and `fallbacks.css`.
- **The button.** `primary` carries `disabled:opacity-50`; `cn` (tailwind-merge) drops the base `disabled:opacity-40`.
- **The floor tile.** A tile's value used to be cut off with an ellipsis in its quarter of the row, which made
  «Цокольный этаж» read «Цоко…» (and «Вторичка» was cut already). It now wraps, hyphenated where the browser can
  (`break-words hyphens-auto`), as legacy's `.fact b` wraps. The columns stay equal: legacy's tiles have no padding,
  and sizing HOMI's padded tiles by their longest word would push the row past a 375 px screen. A row with a ground
  floor can therefore be three or four lines tall.
- **The tab's transition** lists `color 0.2s` again, now that the tint is a colour (legacy `.tabbtn`).
- **The collapsed title of daily rent** reads «Ташкент · Посуточно» and, with rooms, «Ташкент · Посуточно · 1-комн.»:
  `filtersSummary` names the day rate right after the place.

## Files

New, under `frontend/app/`: `features/feed/minuteClock.ts`, `features/feed/CardAge.tsx`,
`tests/feed/minuteClock.test.ts`. As built *(rule 6)*: the photo cases joined `Photo`'s own tests in
`tests/feed/PhotoStrip.test.tsx` instead of a new `tests/feed/Photo.test.tsx`; `tests/listing/AuthorSection.test.tsx`
existed and gained its case.

Changed, under `frontend/app/`:

- `features/feed/{cardText.ts,ListingCard.tsx,Photo.tsx,badges.ts}`, `features/radars/RadarStrip.tsx`,
  `features/listing/KeyFacts.tsx`, `features/shell/{MiniTitle.tsx,TabBar.tsx}`, `features/filters/RoomsPicker.tsx`,
  `features/gallery/UiGallery.tsx`, `lib/flags.ts`, `lib/search/rules.ts`; as built also `styles/shell.css` (the tab
  tint)
- tests: `tests/feed/{cardText,ListingCard,badges,PhotoStrip}.test.ts(x)`, `tests/listing/{KeyFacts,AuthorSection}.test.tsx`,
  `tests/radars/RadarSheet.test.tsx`, `tests/shell/{MiniTitle,TabBar}.test.tsx`, `tests/filters/RoomsPicker.test.tsx`;
  as built also `tests/filters/{FiltersForm,PreferenceSections}.test.tsx` (the section order and visibility over both
  rule keys), `tests/search/useSearchState.test.tsx` (`searchRules` maps the new key) and `tests/shell/facades.test.ts`
  (20 flags, five on)
- end to end: `e2e/feed.spec.ts`, `e2e/listing-open.spec.ts`, `e2e/filters.spec.ts`, `e2e/map.spec.ts`; as built
  also `e2e/radars.spec.ts` (both radar sheets show «Площадь, м²»; it runs with radars on, so in CI)

Changed in `frontend/packages/`: `search/src/{availability,rooms,types,defaults}.ts`,
`search/tests/{availability,rooms,defaults,transitions}.test.ts`, `i18n/src/format/money.ts`,
`i18n/tests/format/money.test.ts`, `ui/src/icons/index.ts`, `ui/src/components/Button.tsx`,
`ui/tests/{controls,components}.test.tsx`.

In `docs/migration/wave-1/baseline.md`, built code behind the pin: rows 1, 2, 11, 12, 20, 26, 31, 32 and 38 – 42 are
marked closed.

## Steps

1. The minute clock and `ageLabel` with their unit tests; then `CardAge` in the card and the label in the strip.
2. The floor words in `factsLine` and `KeyFacts`.
3. `Photo` resets on a new `src`; its test.
4. The collapsed title of daily rent; its test.
5. The pets rule key and flag, the area rule, the rooms rule; the package and component tests.
6. The price input; its tests.
7. Badge kinds, the compact shield and `ShieldCheck`; the tab tint; the disabled primary button.
8. End-to-end cases; the acceptance checklist on staging; tick the rows in `baseline.md`.

## Behaviour to reproduce

### Age (BR-APP-109; BR-API-196; row 20)

- Card and radar strip: «только что» under a minute, «5 мин назад», «3 ч назад», «2 дн. назад»; no week, month or
  date form and no plural forms; a `posted.at` in the future reads «только что». Without a parsable `posted.at` the
  server's string shows, as today.
- The card's label changes when the minute changes (checked every 15 s and when the app becomes visible); the
  strip's label is computed when it renders. The comparison uses the device clock (LB-APP-083, kept as legacy).
- The listing's author section keeps the server's string (`AuthorSection.tsx:34`).

### Floor (BR-APP-110; BR-API-195; row 26)

- Card facts: `floor: 0` → «цокольный этаж», a negative floor → «подвал», both without «/{total}»; `null` → no floor
  part; a positive floor as before.
- Listing tile: «Цокольный этаж» or «Подвал» with an empty caption; only `null` leaves the tile out.

### Card (BR-APP-026, BR-APP-059; SCR-007, SCR-013; rows 1, 2, 31)

- Badge kinds and the compact card's shield as WP-24 "Card (SCR-007, 03 §2.1)".
- A photo whose address changes starts unloaded and unfailed.

### Shell (SCR-006; BR-APP-064; `03` §3.6; rows 11, 12, 32)

- Daily rent collapsed: «Ташкент · Посуточно» instead of «Аренда · Ташкент · Посуточно».
- An inactive tab is tinted 55 %; a disabled primary button has opacity 0.5.

### Filters (BR-APP-007, BR-APP-019, BR-APP-020; LB-APP-029; rows 38 – 40)

- «Площадь, м²» shows for long-term rent, daily rent and sale, in the search sheet and in both radar sheets. A rent
  ↔ sale switch still clears it with the other filters; a long ↔ daily switch keeps it.
- The pets section «Животные» (the «С животными» filter) only for long-term rent; «Кто будет жить» for both
  rents. Switching to daily rent still clears `tenant`, `pets` and `pets_only` (`transitions.ts`), as legacy.
- Rooms with only `rooms_max` (a radar's or a flow option's filters): the buttons 1 … max are highlighted and
  «Любые» is not; «Любые» is pressed only without both bounds.

### Price input (`03` §3.5; LB-APP-011; rows 41, 42)

- Dollars: «$1 200», «1 200 $», «$1,200» → 1200. Сум: a `$` makes the text unreadable, as before.
- Сум: 1 500 млн shows as «1500», 1 500,5 млн as «1500,5» (`ru`); both parse back to the same value.
- HOMI's own reading of separators stays: «1.000.000» in dollars is a million, «1,234.5» is 1235 in every locale.

## Tests

Unit (Vitest):

- `tests/feed/cardText.test.ts`: `ageLabel` at 20 s, 5 min, 3 h and 50 h (the values of legacy's parity scenario
  `feed-age`), at 59 min and 1 439 min, for a future `at`, a missing and an unparsable `at`, and `now === null`;
  `factsLine` with floor `0`, `-1`, `null`, `3` with and without a total.
- `tests/feed/minuteClock.test.ts` (fake timers and `freezeClock` of `@homi/testing`): no timer without a
  subscriber; a notification only when the minute changes; a `visibilitychange` checks at once; the last
  unsubscribe stops the interval.
- `frontend/packages/search/tests/availability.test.ts` (`:59-93`): `area` for the three deals; the pets and tenant
  matrix over the deal and both rule keys, on and off.
- `frontend/packages/search/tests/rooms.test.ts`: only `rooms_max = 2` picks 1 and 2, not 3; both `null` picks
  nothing.
- `frontend/packages/i18n/tests/format/money.test.ts`: `:113-114` without grouping in `ru` and `en`; `:167-171`
  «$1200», «1 200 $» and «$1,200» → 1200 in dollars, still `null` in сум; a two-`$` text is `null`; the round trip
  of «1500,5».

Component (Vitest + Testing Library):

- `tests/feed/ListingCard.test.tsx`: the server render prints `posted.when`; after hydration the computed label;
  a new minute changes the label and does not re-render the card (a render counter on the card's body; as built the
  calls of `factsLine`, which runs once per render of the body); the verified badge with its shield and the quiet
  owner badge; the compact card's shield for `owner_verified`.
- `tests/feed/badges.test.ts`: the kind of each badge.
- `tests/radars/RadarSheet.test.tsx`: the strip's label is computed at render and does not change with the minute.
- `tests/listing/KeyFacts.test.tsx`: the two floor tiles with an empty caption; `null` leaves the tile out.
- `tests/listing/AuthorSection.test.tsx`: the author's age is the server's `posted.when`, also with a `posted.at`.
- `tests/feed/Photo.test.tsx` (as built `tests/feed/PhotoStrip.test.tsx`, beside `Photo`'s other tests): a failed
  photo given a new `src` is no longer failed; a loaded one starts loading.
- `tests/shell/MiniTitle.test.tsx` (`:69-72`): «Ташкент · Посуточно»; the other deals unchanged.
- `tests/filters/RoomsPicker.test.tsx`: «до 2» from a radar's filters highlights 1 and 2 and not «Любые».
- `tests/shell/TabBar.test.tsx` and `frontend/packages/ui/tests/components.test.tsx`: the tint class of an inactive
  tab (as built: no `opacity-55`, and the rule and its fallback in `styles/shell.css`); the disabled opacity of
  `primary`.

End to end (Playwright, fake Telegram, stubs; cookie mode and header mode):

- `e2e/feed.spec.ts`: with Playwright's clock fixed at a time after the stub listings' `posted.at`, the cards show
  the computed ages; advancing the clock by a minute changes a card's label.
- `e2e/feed.spec.ts` and `e2e/listing-open.spec.ts`: the feed of the city `tashkent_region` (the stub set of
  100018 … 100023) shows «цокольный этаж» on the card of 100022 and «подвал» on that of 100023; opening each shows
  the tile «Цокольный этаж» or «Подвал».
- `e2e/filters.spec.ts`: long-term rent shows «Площадь, м²» and «Животные»; daily rent shows «Площадь, м²» and no
  «Животные»; sale shows «Площадь, м²»; the radar create sheet (radars on) shows «Площадь, м²» for rent.
- `e2e/map.spec.ts`: the selection card of a stub listing with `owner_verified` shows the shield after the price.
- `search/tests/transitions.test.ts`: a rent ↔ sale switch clears the area range; a long ↔ daily switch keeps it; a
  switch to daily rent clears `tenant`, `pets` and `pets_only`.

## Acceptance checklist

Run in ru, uz and en, light and dark, in Telegram on staging.

- [ ] Card ages read «только что», «N мин назад», «N ч назад», «N дн. назад», and the server's string without
      `posted.at`.
- [ ] A card's age changes when the minute changes; the radar strip's does not.
- [ ] «цокольный этаж» and «подвал» on the card, «Цокольный этаж» and «Подвал» on the listing's tile.
- [ ] The verified badge carries its shield, «Хозяин» is the quiet tag, and the compact card shows the shield.
- [ ] A photo that changes its address shows the new one, not the old failure.
- [ ] The collapsed title of daily rent has no «Аренда».
- [ ] «Площадь» shows for long-term rent, daily rent and sale, in search and in both radar sheets.
- [ ] The pets section «Животные» shows only for long-term rent; «Кто будет жить» for both rents.
- [ ] Both branches are tested for `dev017PetsLongRentOnly` and `dev017TenantPetsDailyRule`.
- [ ] «до 2» from a radar's filters highlights 1 and 2.
- [ ] «$1 200» in the dollar field is 1200; a сум value of 1 500 млн shows without a separator and parses back.
- [ ] An inactive tab is tinted 55 %; a disabled primary button has opacity 0.5.
- [ ] Every new or changed case of `e2e/feed.spec.ts`, `e2e/listing-open.spec.ts`, `e2e/filters.spec.ts` and
      `e2e/map.spec.ts` passes in cookie mode and in header mode.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, unit, component and end-to-end suites are green.
- [ ] An area set on rent survives a switch to daily rent and is cleared by a switch to sale; daily rent clears the
      tenant and pets filters.
- [ ] The listing's author section shows the server's own string, unchanged.
- [ ] Rows 1, 2, 11, 12, 20, 26, 31, 32 and 38 – 42 of `baseline.md` (built code behind the pin) are marked closed.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web.

## Handoff

- **Done** on `wp-35-catch-up-card-filters-price` (from `main` = `5949365`, after #92) by the main session. Steps 1 –
  7 as written; step 8's end-to-end cases in both session modes; the checklist on staging waits for the production
  track.
- **Departures recorded under rule 6** (in Design, Files and Tests above): the clock's snapshot read from the device
  clock and the label computed at render; the badge's legacy kind as `tone` (`data-badge-tone`); the tab tint in
  `styles/shell.css`; the photo cases in `PhotoStrip.test.tsx`; the radar sheets' area case in `radars.spec.ts`.
- **Review.** One independent review subagent read `61fd4bf`. Its findings, fixed in `93cdf16`: the floor word was cut
  off in its tile (now it wraps; the end-to-end case checks nothing is cut); the tab's tint no longer faded (the
  transition lists the colour). Left as legacy: an address with `deal=rent_daily&pets=1` keeps `pets`, whose section
  daily rent no longer shows; only «Сбросить» clears it, as in legacy.
- **Checks.** `pnpm test` (every project): app 216 files, 3 553 tests passed after the review fixes; `pnpm -r lint` and `pnpm -r typecheck`
  exit 0. Mutation checks: the card's age without `live`, the card's body following the clock, `Photo` without its
  reset and `isRoomPicked` without the upper-bound rule each fail their new tests.
- **Local end-to-end runs**, each spec alone (KI-32), cookie and header mode: `feed.spec.ts` 23, `listing-open.spec.ts`
  18, `filters.spec.ts` 22, `map.spec.ts` 18 and `shell.spec.ts` 16 passed. `radars.spec.ts` cannot pass on this
  machine, whose backend has radars off (AM-99, KI-65); its two new cases run in CI.
- **Left for the production track:** the regular deploy, then the acceptance checklist inside Telegram on staging on
  iOS, Android, Desktop and Web.
