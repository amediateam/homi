# WP-25 — Filters, quick filter, sort, city

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-24 |
| Size | about 2 900 changed lines, L |
| Behaviour reference | `03` §2 (SCR-014, SCR-015, SCR-016, SCR-017; SCR-029 and SCR-030 for the two radar layouts), §3.4 (debounce, focus delay, area cap), §3.5 (price input), §4 (BR-APP-001 … BR-APP-023, BR-APP-057), §5/§5b (LB-APP-007, LB-APP-023, LB-APP-029, LB-APP-030, LB-APP-043); `05` (TMA-012, TMA-022, TMA-025, TMA-035, TMA-037); task files `tasks/frontend/KV-FE-050` … `KV-FE-056`, `KV-FE-044` (sheet variants), `KV-FE-020` (functions the sheet calls). Their file layout, navigation stack, API paths and transport are not taken |
| Needs from the production track | nothing beyond the usual deploy of the merge to staging and production |

## Goal

The four sheets a user reaches from the feed header and the map — full filters, quick filter (rooms, price, owner),
sort and city — exist as intercepting routes with direct-load pages, edit a draft with a live result count and radar
forecast, and write the result into the search parameters that the feed and the map share. The full form also has its
two radar layouts ready for WP-30.

## Scope

In: the route files of `/filters`, `/filters/[kind]`, `/sort`, `/city` in the `@sheet` slot and as direct-load pages;
`FiltersForm` with its 16 sections and three modes; the footer with live count, flow line and relax chips;
`QuickFilterForm`; `SortList`; `CityPickerSheet` (header and nested variants); `IntInput` and `PriceInput` in
`@homi/ui`; the apply function shared by every surface that applies filters; the `focus=pets` entry and the «Новое»
pill.

Out: the filter model, summaries, sort availability, URL mapping and money parsing (WP-22, used here); the feed
header chips that open these sheets and the feed that re-creates itself (WP-24); `CityList`, its geolocation row and
`nearestCity`, the first-launch city page, `RouteSheet`, the toast and the settings action (WP-23); the map and its
filters button (WP-27); lasso drawing (WP-28); mounting the radar modes, the subscribe flow and the follow nudge
(WP-30); screen tracking (WP-32).

## Decisions that bind this package

- Route per screen (DEC-44, 25 §3.2): each sheet has an address. Opening is `router.push`, closing is `back()`; the
  sheets are intercepted into `@sheet`, so the feed or the map stays mounted below, and a direct load of the address
  renders the same form.
- One search state (25 §3.2, §3.5): the 25 filter keys and `sort` live in the address of `/` and `/map`. A sheet
  receives the same parameters, edits a local draft and writes back only on apply. Parameter names are WP-22's
  (`toSearchParams`, `fromSearchParams`); this package never spells a filter key into a URL by hand.
- Contract (DEC-41, 25 §4.2): `GET /listings/count`, `GET /listings/flow`, `GET /cities`, `PATCH /settings`. Field
  names are those of `@homi/types`; where this text names a field by meaning ("count", "week", "days", "options"),
  the generated type decides the spelling. A missing field is fixed in the contract spec in the same PR.
- Defects and flags (DEC-36): defects without a `DEV` row are fixed; the rest sit behind `devFlags`, all off. The
  rules are WP-22's; this package passes the flags into them and must show both branches in its tests. Wherever
  this text writes `devFlags` as an argument of a `@homi/search` function (`sectionsFor`, `belowMedianAvailable`,
  `resetAll`, `fixRanges`), the value passed is `searchRules(devFlags)` of WP-22 (`lib/search/rules.ts`): the
  package takes a `rules` argument and never imports `lib/flags.ts`.
- Functional parity (DEC-46): same sections, order, options, texts and results as legacy; visual detail may differ.
- Read before coding (bundled Next.js docs under `frontend/app/node_modules/next/dist/docs/01-app/`):
  `03-api-reference/03-file-conventions/parallel-routes.md` (slots, `default.js`, "Modals"),
  `…/intercepting-routes.md`, `…/dynamic-routes.md` (the Cache Components section),
  `03-api-reference/04-functions/use-search-params.md` (the `<Suspense>` requirement),
  `…/use-router.md` (`scroll: false`, `bfcacheId`), `02-guides/single-page-applications.md` ("Shallow routing on
  the client"), `02-guides/preserving-ui-state.md` (Activity keeps hidden routes and their state).

## Design

### Routes

| Address under `/[locale]` | Slot file (soft navigation) | Direct-load file | Mounts |
| ------------------------- | --------------------------- | ---------------- | ------ |
| `/filters` | `(main)/@sheet/(.)filters/page.tsx` | `(main)/filters/page.tsx` | `FiltersSheetRoute` |
| `/filters/[kind]` | `(main)/@sheet/(.)filters/[kind]/page.tsx` | `(main)/filters/[kind]/page.tsx` | `QuickFilterSheetRoute` |
| `/sort` | `(main)/@sheet/(.)sort/page.tsx` | `(main)/sort/page.tsx` | `SortSheetRoute` |
| `/city` | `(main)/@sheet/(.)city/page.tsx` | `(main)/city/page.tsx` | `CitySheetRoute` |

- Route files hold no logic. Each is a Server Component that renders its client `…SheetRoute` inside `<Suspense>`:
  the bundled `use-search-params.md` says a Client Component that calls `useSearchParams` must sit under a Suspense
  boundary in a prerendered route, or the production build fails.
- `[kind]` accepts `rooms`, `price`, `owner`; anything else calls `notFound()`. Under Cache Components a dynamic
  parameter is runtime data unless `generateStaticParams` lists it (`dynamic-routes.md`): either return the three
  kinds from `generateStaticParams` or read `params` inside the Suspense boundary. Which of the two combines with the
  `[locale]` root parameter, and whether `notFound()` behaves inside a slot page, is **verify before use**; the
  fallback is `null` in the slot and the 404 on the direct-load page.
- Reserved, non-filter parameters used here: `from` (`map` when the opener is the map), `focus` (`pets`), `pick`
  (`city`, the nested picker layer). They belong to `RESERVED_PARAMS` of `lib/navigation/routes.ts` (WP-20);
  `fromSearchParams` reads only the 25 filter keys and `sort` and ignores everything else (WP-22), and
  `toSearchParams` output is merged with a reserved parameter only when opening a sheet, never when applying.
- A direct load renders the same form through `RouteSheet` with `presentation="standalone"` (WP-23: no page below,
  no backdrop tap, no drag-to-close). Leaving it lands on the parent with the search state intact:
  `parentOf(pathname, searchParams)` of WP-20 returns `/map` when `from=map`, else `/`, with the 25 filter keys and
  `sort` carried over and the reserved parameters dropped.

### State and navigation

- Opening (done by WP-24's chips and WP-27's map button): `router.push(routes.filters(q), { scroll: false })`,
  `routes.quickFilter(kind, q)`, `routes.sort(q)`, `routes.city(q)`, with `q` = the current search parameters.
- `useDraft(initial)` in `features/filters/useDraft.ts`: `{ draft, update(patch), replace(filters), relaxed,
  setRelaxed }`. Every `update` goes through `normalizeFilters`, so no `undefined` reaches comparison or the API
  (fix of LB-APP-007, owned by WP-22). Nothing reaches the address before apply.
- A fresh open must start from the address, never from a draft left by an earlier visit. With `cacheComponents`,
  Next.js hides routes with Activity and keeps their state (`preserving-ui-state.md`). The form is therefore keyed
  on `useRouter().bfcacheId`, which `use-router.md` documents as changing on a push or replace navigation and staying
  the same on back/forward and on search-parameter-only navigations — so the draft resets on every open and survives
  the nested `pick=city` layer. The docs call `bfcacheId` a last resort and prefer a reset in the close handler; that
  handler cannot see Telegram's Back or the hardware Back, which is why the key is used. Whether next-intl's router
  wrapper exposes `bfcacheId` is **verify before use**; if not, read it from `next/navigation` in the `…SheetRoute`
  files only.
- `applyFilters(next, { sort, target })` in `features/filters/applyFilters.ts` is the one place that applies:
  1. `fixRanges(next, devFlags)` and `normalizeFilters`;
  2. `normalizeSort(sort, sortOptions(next, city))` — an unavailable sort becomes `new`, and `new` is not written;
  3. navigation: `closeThen(target(q))` in both cases — WP-21 defines it as "go back, then replace" when the sheet
     was opened in the app and as the replace alone at depth zero, which is the direct load;
  4. `window.scrollTo(0, 0)`;
  5. `notifyFiltersApplied(next)` — a listener list exported from the same file (`onFiltersApplied(cb)`), which the
     follow nudge of WP-30 and the lasso of WP-28 use. Tab switches, deal tabs and the header city pick do not call it.
- `target` is `routes.map` when `from=map`, else `routes.feed`.
- Nested city picker inside the full sheet: `useLayerState('pick')`. It pushes `pick=city` with
  `window.history.pushState` (documented as integrated with the router in `single-page-applications.md`); Back closes
  the picker first, then the sheet.
- «Обвести на карте» (the draw hand-off): save the city if it changed, call `requestDraw()` of
  `lib/ui/shellState.ts` (add it there if WP-23 did not), then `closeThen(routes.map(q))` with districts and zones
  cleared. The navigation carries **no** `draw` parameter: `closeThen` lands at an unchanged history depth, where a
  `draw=1` would leave the BackButton hidden and Back unable to cancel drawing as legacy does. The map screen
  consumes the request once and opens drawing as a pushed layer (`useLayerState('draw')`, WP-28); until WP-28 lands
  the request is simply not consumed and the user sees the map.

### Components

| File | Role |
| ---- | ---- |
| `features/filters/FiltersForm.tsx` | Frame: sticky header (×, title, «Сбросить»), scrolling body with a shadow when scrolled, sticky footer. Props: `mode: 'search' \| 'radar-new' \| 'radar-edit'`, `initial`, `focus?`, `onApply`, `onSubscribe`, `onSave`, `onDraw?`, `submitting` |
| `features/filters/sections/*.tsx` | `DealSection`, `CitySection`, `TypeSection`, `RentTermSection`, `RoomsSection`, `PriceSection`, `WhereSection`, `OwnerSection`, `TenantSection`, `PetsSection`, `FurnitureSection`, `RenovationSection`, `FloorSection`, `AreaSection`, `MarketSection`, `AppliancesSection`, `PostedSection`; stateless, props `{ filters, update, city, stats }` |
| `features/filters/RoomsPicker.tsx` | «Любые», 1, 2, 3, 4+; used by the full and the quick form |
| `features/filters/FiltersFooter.tsx` | Flow line, relax chips, buttons per mode |
| `features/filters/useLiveStats.ts` | Debounced count and flow with abort; exports `normalizeFlow` |
| `features/filters/QuickFilterForm.tsx` | Compact form for one `kind` |
| `features/filters/SortList.tsx` | Radio list of the available sorts |
| `features/filters/newFeatures.ts` | `isNewFeature('pets')`, `markFeatureSeen('pets')` on `homi-new-pets` through `lib/storage.ts` |
| `features/filters/{Filters,QuickFilter,Sort}SheetRoute.tsx` | Client glue: `useSearchState`, `RouteSheet`, apply and close |
| `features/city/CityPickerSheet.tsx`, `CitySheetRoute.tsx`, `useCityPick.ts` | Sheet around WP-23's `CityList`; header and nested variants |
| `packages/ui/src/components/{IntInput,PriceInput}.tsx` | Presentational inputs; no money or Telegram knowledge |

`FiltersForm` renders sections from `sectionsFor(draft, city, mode, devFlags)` and never decides visibility itself.
Section order is fixed: deal, city, housing, rent term, rooms, price, where, who posts, tenant, pets, furniture,
renovation, floor, area and market (sale) or appliances (rent), posted (search mode only).

### Data

- Reference data, cities, city statistics and the currency come from WP-22's client hooks (`useReference()`,
  `findCity(code)`, `useCityStats()`, `useMoney()`); the sheets fetch nothing on the server.
- `useLiveStats(draft, { flow })`: `bffFetch('listings/count', { query, signal })` 250 ms after any draft change
  and `bffFetch('listings/flow', { query, signal })` 500 ms after, `query` from `toApiQuery(draft)`. Each change
  aborts the pending request.
  An error (including `source_unavailable`) keeps the previous value. `normalizeFlow` returns `null` unless the
  answer is an object with a numeric weekly total and a day count above zero; `null` hides the flow line and the
  chips. Both session modes use the same code (`bffFetch` adds the bearer token in header mode).
- On opening the full sheet: `useCityStats().refetch()`, errors ignored (legacy refreshed city statistics on every
  open).
- City save: `updateSettings({ city })` (Server Action of WP-23, through `useAction`) plus `homi-city` in
  `lib/storage.ts`. Errors are ignored; the local choice stands.

### Seams

- `radarsReady` comes from `features/radars/capability.ts`; `subscribe(filters, entry, relaxed?)` and
  `useHasActiveRadar(filters)` come from `features/radars/subscribe.ts`. WP-24 creates both files (the second as a
  stub: `subscribe` resolves `{ ok: false }`, `useHasActiveRadar` returns `false`); WP-30 writes the real bodies
  and flips the constant. While `radarsReady` is `false` the search footer shows no radar button.
- `onFiltersApplied(cb)` for WP-30 and WP-28 (above). `normalizeFlow` (exported from `useLiveStats.ts`) is the one
  validator of a flow answer; WP-30 imports it for its nudge and radar sheet and does not write another.
- Screen names expected from `screenNameOf` (WP-20, reported by WP-32): `filters`, `filters/rooms`, `filters/price`,
  `filters/owner`, `sort`, `city`; the nested picker keeps `filters`; the radar modes report `radar/new` and
  `radar/edit` (WP-30).

## Files

New, under `frontend/app/`:

- `app/[locale]/(main)/@sheet/(.)filters/page.tsx`, `(.)filters/[kind]/page.tsx`, `(.)sort/page.tsx`,
  `(.)city/page.tsx` (replace the WP-20 placeholders)
- `app/[locale]/(main)/filters/page.tsx`, `filters/[kind]/page.tsx`, `sort/page.tsx`, `city/page.tsx` (same)
- `features/filters/{FiltersForm,FiltersFooter,QuickFilterForm,SortList,RoomsPicker}.tsx`
- `features/filters/{FiltersSheetRoute,QuickFilterSheetRoute,SortSheetRoute}.tsx`
- `features/filters/{useDraft,useLiveStats,applyFilters,newFeatures}.ts`
- `features/filters/sections/` — the 17 section components listed above
- `features/city/{CityPickerSheet,CitySheetRoute}.tsx`, `features/city/useCityPick.ts`
- `tests/filters/*.test.tsx`, `tests/city/CityPickerSheet.test.tsx`, `e2e/filters.spec.ts`, `e2e/city.spec.ts`

New, under `frontend/packages/ui/`: `src/components/IntInput.tsx`, `src/components/PriceInput.tsx`, exports in
`src/index.ts`, `tests/inputs.test.tsx`.

Changed: `features/radars/subscribe.ts` (only if the stub of WP-24 lacks `useHasActiveRadar`);
`lib/ui/shellState.ts` (only if `requestDraw` / `consumeDrawRequest` are missing); `lib/api/bffAllowList.ts` (only
if `listings/count`, `listings/flow` or `cities` are not yet allowed for `GET`).

## Steps

1. Read the docs listed under "Decisions". Confirm on a throwaway branch that `(.)filters` under
   `(main)/@sheet` intercepts a push from `/` and from `/map`, and that a reload of `/ru/filters` renders the
   direct-load page. Record the result in the PR.
2. `IntInput` and `PriceInput` in `@homi/ui` with their tests.
3. `useDraft`, `applyFilters` (with `onFiltersApplied`), unit tests for both.
4. `useLiveStats` and `normalizeFlow`, unit tests with fake timers.
5. `FiltersForm` frame and `FiltersFooter` for the three modes, with stub sections; component test of titles,
   footers and the posted section per mode.
6. Sections 1–5 (deal, city field, housing, rent term, rooms) and `RoomsPicker`.
7. Section 6 (`PriceSection`): title, inputs, presets, unit hint, typical line, «Не дороже рынка».
8. Section 7 (`WhereSection`): area row, zones, metro, districts; the draw hand-off callback.
9. Sections 8–16 (owner, tenant, pets with pill and tips, furniture, renovation, floor, area, market, appliances,
   posted); `newFeatures.ts`.
10. `FiltersSheetRoute` and the two `/filters` route files: draft from the address, `bfcacheId` key, apply, close,
    `from=map`, `focus`, city save, statistics refresh.
11. `CityPickerSheet`, `useCityPick`, the nested layer in the full form, `CitySheetRoute` and the `/city` route files.
12. `QuickFilterForm`, `QuickFilterSheetRoute`, the `/filters/[kind]` route files.
13. `SortList`, `SortSheetRoute`, the `/sort` route files.
14. Wire the radar button to the seam; component test with `radarsReady` forced on.
15. End-to-end specs in both session modes; run the acceptance checklist on staging in ru, uz, en and light, dark.

## Behaviour to reproduce

Texts are quoted in Russian with their key; uz and en come from the same keys. A legacy key that is both a message
and a prefix is addressed as `<key>._` (the one rule of WP-20's importer): the section titles below are
`sheet.market._` and `sheet.posted._`, their options stay `sheet.market.new`, `sheet.posted.1` and so on.

### Full filters sheet (SCR-014)

Opens from the filters chip of the feed, the filters button of the map, «Другой город» in the few-results note and
the `focus=pets` entry. Closes by ×, backdrop tap, drag down, Telegram Back, «Показать N», a successful «Включить
радар» and «Обвести на карте». Closing without apply leaves the feed unchanged.

Header: × (aria `common.close`), title `sheet.title` «Фильтры», `sheet.reset` «Сбросить».

| # | Section | Visible when | Options and texts | Result |
| - | ------- | ------------ | ----------------- | ------ |
| 1 | Deal | always | segmented `deal.rent_long` «Аренда» / `deal.sale` «Продажа»; daily rent shows «Аренда» active | `switchDeal`: defaults of the new deal, keeps `districts`, `zones`, `polygon` (BR-APP-002); tapping the active option does nothing |
| 2 | City | more than one city | field `sheet.city` «Город» + city name + chevron | opens the nested picker; the pick changes the draft only (BR-APP-009), light haptic |
| 3 | Housing | always | `sheet.housing` «Жильё»; chips per deal: rent `type.apartment` «Квартира», `type.house` «Дом», `type.room` «Комната», `type.commercial` «Помещение»; daily without «Помещение»; sale «Квартира», «Дом», «Помещение», `type.land` «Участок» | multi-select; the last selected type cannot be removed; `below_median` survives only for exactly `['apartment']` (BR-APP-005) |
| 4 | Rent term | base deal is rent and (daily is selected or the city has daily listings) (BR-APP-004) | `sheet.rentTerm` «Срок аренды»; `rent.long` «Надолго» / `deal.rent_daily` «Посуточно» | `switchRentTerm`: keeps allowed types (else `['apartment']`), clears `price_min`, `price_max`, `below_median`; to daily also `tenant`, `pets`, `pets_only` (BR-APP-003) |
| 5 | Rooms | not every selected type is room, commercial or land (BR-APP-006) | `sheet.rooms` «Комнаты» + muted `sheet.roomsHint` «— два числа задают диапазон»; `sheet.roomsAny` «Любые», «1», «2», «3», «4+» | `pickRooms` (BR-APP-007): one tap picks a value; a second tap on another value makes a range; «4+» means no upper bound; «Любые» clears; light haptic |
| 6 | Price | always | title `sheet.priceMonth` «Цена в месяц, {cur}» / `sheet.priceDay` «Цена за сутки, {cur}» / `sheet.price` «Цена, {cur}» with `{cur}` = «$» or `money.unitMln` «млн сум»; inputs `sheet.from` «от», `sheet.to` «до», placeholders «0» and `sheet.anyPrice` «любая»; chips `sheet.upto` «до {amount}»; hint `sheet.unitPriceHint` «Цена за сотку или м² — умножаем на площадь из объявления»; typical line `sheet.typicalRent` «{city}: половина квартир — до {price} в месяц» / `sheet.typicalDaily` / `sheet.typicalSale`; chip `sheet.belowMedian` «📊 Не дороже рынка» with hint `sheet.belowMedianHintRent` / `sheet.belowMedianHintSale` while on | see "Price section" below |
| 7 | Where | always (rows as below) | `sheet.where` «Где искать»; `sheet.drawArea` «Обвести на карте» / `sheet.drawAreaOn` «Своя область на карте»; `sheet.zone.center` «🏛 Центр», `sheet.zone.near_center` «🏙 Ближе к центру»; `sheet.nearMetro` «🚇 Рядом с метро»; caption `sheet.orDistricts` «Или районы:» / `sheet.districts` «Районы:» / `sheet.districtsRegion` «Районы области (необязательно):»; district chips with server names | see "Where section" below |
| 8 | Who posts | always | `sheet.who` «Кто размещает»; segmented `owner.any` «Все» / `owner.no_agents` «Без риелторов» / `owner.owners` «Только хозяева» | sets `owner` |
| 9 | Tenant | base deal is rent, daily included (BR-APP-019) | `sheet.tenant` «Кто будет жить»; `tenant.family` «Семья», `tenant.men` «Парни», `tenant.women` «Девушки» | single choice; tapping the selected chip clears it |
| 10 | Pets | base deal is rent, daily included (BR-APP-019) | `sheet.petsTitle` «Животные» + pill `sheet.new` «Новое»; segmented `sheet.any` «Не важно» / `sheet.pets` «Не запрещены» / `sheet.petsOnly` «Разрешены» | sets `pets`, `pets_only`; any tap sets `homi-new-pets`; a new non-neutral choice shows a tip toast inside the sheet: `sheet.petsTip` «🐾 Скроем объявления, где животных прямо запрещают. Где разрешают — покажем первыми.» or `sheet.petsOnlyTip` «🐾 Покажем только объявления, где прямо написано «можно с животными». Таких пока немного.»; «Не важно» clears the tip |
| 11 | Furniture | always | `sheet.furniture` «Мебель»; `sheet.any` «Не важно» / `sheet.furnished` «С мебелью» / `sheet.unfurnished` «Без мебели» | `furnished` = `null` / `true` / `false` |
| 12 | Renovation | always | `sheet.renovation` «Ремонт»; chips from the reference list for the draft's deal (server names) | multi-select |
| 13 | Floor | always | `sheet.floor` «Этаж»; `sheet.notFirst` «Не первый», `sheet.notLast` «Не последний» | two independent toggles |
| 14 | Area and market | sale only (BR-APP-020) | `sheet.area` «Площадь, м²» with `sheet.from` / `sheet.to`, placeholders «0» and `sheet.anyArea` «любая»; `sheet.market._` «Дом»: `sheet.any` / `sheet.market.new` «Новостройка» / `sheet.market.secondary` «Вторичка» | `IntInput`: non-digits stripped, 0 → no filter, capped at 10 000 |
| 15 | Appliances | rent only, daily included (BR-APP-020) | `sheet.appliances` «Техника»; chips from the reference list (server names) | multi-select |
| 16 | Posted | search mode only (BR-APP-021) | `sheet.posted._` «Опубликовано»; `sheet.posted.1` «За сутки», `sheet.posted.3` «За 3 дня», `sheet.posted.7` «За неделю»; hint `sheet.postedHint` «Только для ленты: в чат и так приходят лишь новые.» while a value is set | single choice; tapping the selected chip clears it |

Price section (also the body of the price quick sheet):

- Display currency and rate from `useMoney()`; values are stored in USD. UZS is typed in millions with one decimal;
  conversion and parsing are WP-22's (`parseInput`, fix of LB-APP-011: `1.000.000` parses, one `,` or `.` is the
  decimal mark). `inputMode` is `decimal` for UZS and `numeric` for USD; `enterKeyHint="done"`.
- The field keeps the typed text and re-syncs only when the outside value no longer equals the parsed text. Text that
  does not parse means "no filter"; the text stays as typed.
- Presets (BR-APP-014, BR-APP-015): from `useMoney().presets(deal, …)` of WP-22 (`createMoney(…).presets`), with
  `applyPreset` and `isPresetSelected` of `@homi/search` — city presets win over reference presets; UZS lists are
  converted and rounded by WP-22. A chip is on only when `price_max` equals the preset and `price_min` is empty. A tap
  sets `price_max` and clears `price_min`; a tap on the chip that is on clears `price_max`. The strip scrolls
  horizontally without starting the sheet drag.
- Unit hint: sale with land or house among the types (BR-APP-018).
- Typical line: apartment-only searches (daily included) in a city with a name and a typical price for the deal
  (BR-APP-016); absent while city statistics are loading or failed.
- «Не дороже рынка»: `belowMedianAvailable(draft, city, devFlags)` — legacy rule: non-daily, apartment-only, city
  whose median flag is not `false` (BR-APP-017). With `dev052UnifiedBelowMedianRule` on, the function applies the
  single rule of DEV-052; the section only renders the answer.
- Inverted ranges (LB-APP-043): with `dev025ValidateRanges` off, `min > max` is sent as typed. With the flag on,
  `fixRanges` swaps price and area bounds on apply, save and subscribe, and the inputs show the swapped values.

Where section (BR-APP-008 — exactly one geography mode; rule owned by WP-22's `setGeography`):

- Area row, search mode: without a polygon the chip «Обвести на карте» starts the draw hand-off; with a polygon the
  highlighted chip «Своя область на карте» removes it. Radar modes: the row exists only when a polygon is set, and
  only removes it.
- Zones row, when the city has zones: one chip per zone; several may be on; stored in the order `center`,
  `near_center`; turning one on clears districts and polygon.
- «🚇 Рядом с метро», when the city has metro: independent toggle.
- Districts, when the city has districts: caption «Или районы:» when the city has zones, «Районы:» for a city
  without zones, «Районы области (необязательно):» for a region; turning one on clears zones and polygon. Chips wrap.
- Reference not loaded (city unknown): only the area row.

Tenant and pets on daily rent (LB-APP-029): with `dev017TenantPetsDailyRule` off both sections stay visible for
daily rent although the term switch has cleared them. With the flag on, `sectionsFor` and `switchRentTerm` follow the
single rule of DEV-017.

Reset (BR-APP-022, LB-APP-030): «Сбросить» calls `resetAll(draft, city, devFlags)`. Flag `dev018ResetKeepsDaily`
off: defaults of the base deal and the current city, so daily rent becomes long-term rent. On: the current deal is
kept, daily included. The remembered relax code survives a reset, as in legacy (LB-API-035 is the server's concern).

Pets entry (BR-APP-057): WP-21 turns the launch parameter `news=pets` (TMA-012) into `routes.filters({ focus:
'pets' })`. Here: if the draft's deal is not long-term rent, the draft starts from `defaultFilters('rent_long',
city)`; 350 ms after opening, the section marked `data-focus="pets"` scrolls into view (smooth, centred). The pill
«Новое» shows while `features` of `GET /reference` (WP-11) contains `pets` and `homi-new-pets` is unset. The
daily-rent case of "if needed" is not spelled out in the audit: check
`$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:115-124` when implementing.

Tip toast: a second toast lives inside the sheet (SCR-042). It uses the scope WP-23 built for this:
`FiltersForm` mounts `<ToastHost scope="sheet" />`, a tip is `showToast({ key }, 'sheet')` and «Не важно» calls
`dismissToast('sheet')`; 4 s, replaced by the next tip, gone with the sheet. It never appears in the `app` scope.

### Footer and live data

| State | Trigger | Text |
| ----- | ------- | ---- |
| count unknown | first 250 ms, or the first request pending | `sheet.show` «Показать» |
| count above zero | answer | `sheet.showN` «Показать {n}» |
| count zero | answer | `sheet.nothing` «Ничего нет» (the button still applies) |
| count failed | network, timeout, `503 source_unavailable` | previous label kept |
| flow, none this week | weekly total is 0 | `sheet.flowNone` «📡 За неделю таких не было — радар будет срабатывать редко» |
| flow, under one a day | weekly total / days < 1 | `sheet.flowWeek` «📡 Радар: {n} за неделю» |
| flow, daily | otherwise | `sheet.flowDay` «📡 Радар: ≈{n} в день», rounded |
| flow absent | request failed or `normalizeFlow` returned `null` | no flow line, no chips; height reserved, no layout jump |
| relax chips | the flow answer carries options | `«{label} · {rate}»`, server strings as text |
| radar on | search mode, `radarsReady`, an active radar has the same filters (BR-APP-012) | ✓ `head.followOn` «Радар включён» |
| radar off | search mode, `radarsReady`, no such radar | `sheet.subscribe` «Включить радар», disabled while submitting |
| radar modes | `radar-new`, `radar-edit` | `sheet.matchingNow` «Сейчас подходит: {n}» (empty while unknown) and one primary button: `sheet.subscribe` (new) or `sheet.save` «Сохранить» (edit), disabled while submitting |

- Flow wording comes from WP-22 (BR-APP-044): `formatFlow(flowRate(flow), 'sheet', t, { oneVocabulary })` with
  `oneVocabulary = devFlags.dev021OneFlowVocabulary`. Off: the three sheet texts above. On: the shared vocabulary
  of DEV-021 (LB-APP-033).
- Relax chip: light haptic, `replace(normalizeFilters(option.filters))`, remember the option's code as `relaxed`.
  The code travels with a later subscribe or save.
- «Показать …»: medium haptic; if the city changed, save it; then `applyFilters`.
- «Включить радар» (search mode): `subscribe(draft, 'filters', relaxed)`; on success the sheet closes without
  applying the draft to the feed; on failure the sheet stays open (toasts are WP-30's).
- Titles per mode: `sheet.title` «Фильтры», `sheet.createTitle` «Новый радар», `sheet.editTitle` «Условия радара».
- Pull-to-refresh and the collapsing header are inactive while a sheet is open (WP-23).

### Quick filter sheet (SCR-015)

Opens from the rooms, price and owner chips of the feed header. Closes by ×, backdrop, drag on the grab handle,
Telegram Back, apply. Compact sheet with a grab handle and a header (title, ×).

| Kind | Title | Body | «Сбросить» resets |
| ---- | ----- | ---- | ----------------- |
| `rooms` | `sheet.rooms` «Комнаты» | `RoomsPicker` + `sheet.roomsHint` | the rooms range only |
| `price` | the price title of section 6 | the whole `PriceSection`, «Не дороже рынка» included | both price bounds and `below_median` |
| `owner` | `sheet.who` «Кто размещает» | segmented «Все» / «Без риелторов» / «Только хозяева» | `owner` to `any` |

- Footer: `sheet.reset` «Сбросить» (through `resetQuick(draft, kind)`, BR-APP-022) and the primary button with the
  same three labels as the full sheet. Count only, 250 ms debounce; no flow request.
- Apply: medium haptic, `applyFilters` to the feed. A count still pending does not block apply.
- Price kind for daily rent: title «Цена за сутки, $», no «Не дороже рынка».
- Rooms kind when the filter set hides rooms (reachable only by direct load): `router.replace(routes.feed(q))`.

### Sort sheet (SCR-016)

Opens from the sort chip. Closes by pick, ×, backdrop, drag, Telegram Back. Compact sheet: grab handle, header
`sort.title` «Сортировка», ×; a `radiogroup` with ✓ and `aria-checked` on the current sort.

| Sort | Row | Hint | Offered when (BR-APP-023) |
| ---- | --- | ---- | ------------------------- |
| `new` | `sort.new` «Сначала новые» | — | always |
| `cheap` | `sort.cheap` «Сначала дешевле» | — | always |
| `expensive` | `sort.expensive` «Сначала дороже» | — | always |
| `deal` | `sort.deal` «Выгоднее к рынку» | `sort.dealHint` «Сначала те, что дешевле обычной цены — ближайших похожих или района» | exactly apartments, not daily, city median flag not `false` |
| `center` | `sort.center` «Ближе к центру» | `sort.centerHint` «По расстоянию до центра города» | the city has zones |
| `ppm` | `sort.ppm` «Дешевле за м²» | `sort.ppmHint` «По цене за квадратный метр» | sale |

- Rows come from `sortOptions(filters, city)`. With an unknown city (reference not loaded or a stale city code) only
  the first three are offered and nothing throws (fix of LB-APP-023, owned by WP-22).
- Pick: light haptic, `closeThen(routes.feed({ …q, sort }))`, scroll to top; the feed re-creates itself. `new`
  removes the `sort` parameter. This equals `setSort` followed by closing, done as one navigation instead of two.

### City picker sheet (SCR-017)

| Variant | Opens from | Pick does |
| ------- | ---------- | --------- |
| header (`/city`) | the city chip of the feed header (more than one city) | `pickCity(filters, city)` on the live filters, sort fallback, `homi-city`, `PATCH /settings` with the city (errors ignored), `closeThen(routes.feed(q))`, scroll to top |
| nested (`pick=city`) | the city field of the full sheet | `pickCity` on the draft only; the city is saved on «Показать» or on the draw hand-off |

- Layout: title `city.title` «Город», ×; WP-23's `CityList`: optional geolocation row, city rows with the name, the
  counts line `city.counts` «{rent} аренда · {sale} продажа» when statistics exist, and ✓ on the current city. Rows
  without a counts line while statistics are loading or failed. The nested sheet lies above the filters sheet.
- Geolocation row (only when location can be requested, TMA-035): `city.locate` «Определить по геопозиции»; while
  pending `city.locating` «Определяем…» with a spinner, row disabled; denied → `city.locateDenied` «Нет доступа к
  геопозиции — выберите город из списка. Разрешить можно в настройках Telegram.»; failed or timed out →
  `city.locateFail` «Не получилось определить, где вы, — выберите город из списка.»; no city in range →
  `city.locateFar` «Рядом с вами наших городов пока нет — выберите из списка.»; found → success haptic and immediate
  pick. A result that arrives after the sheet closed is dropped. Coordinates never leave the device.
- `pickCity` (BR-APP-009): clears districts and polygon; keeps zones only if the new city has zones, metro only if
  it has metro, `below_median` only if it has medians; booleans are never `undefined` (LB-APP-007).
- Row tap: light haptic. Closes by pick, ×, backdrop, drag, Telegram Back.
- Counts (LB-APP-035, owned by WP-23): `dev023CityCountsIncludeDaily` off shows long-term rent and sale only; on,
  `CityList` adds daily rent.

### Edge cases and error paths

- Only one city in the reference data: no city section, no city chip; `/city` by direct load →
  `router.replace(routes.feed(q))`.
- City statistics missing for the city: rent-term section hidden unless daily is selected; reference presets; no
  typical line.
- Reference lists missing for a deal (renovations for daily rent): heading with an empty chip row.
- A stored radar with a type its deal does not offer (WP-30 passes it in): the chip list shows the deal's types; the
  normaliser decides what is saved.
- Rooms range set, then types changed to land only: section hidden, range kept and sent, as in legacy.
- Polygon set and the city changes: the polygon is cleared by `pickCity`.
- The Settings button while a sheet is open: the route change closes it (LB-APP-046, WP-21).
- Count request pending when the sheet closes: aborted, no state update afterwards.
- Relax option filters from the server are re-normalised before use; only the 25 known keys are ever sent
  (SEC-REQ-017). City, district, renovation, appliance names, relax labels and rates render as text (SEC-REQ-021).
- Demo marker: count, flow and cities answers with `meta.source = stub` are reported by `bffFetch`; no extra code
  here (25 §4.4).

## Tests

Unit (Vitest):

- `tests/filters/useLiveStats.test.ts` (fake timers): one count request 250 ms and one flow request 500 ms after
  the last of three quick changes; earlier requests aborted; an error keeps the old value; `normalizeFlow` for
  `undefined`, `null`, `{}`, a zero day count, and a valid answer; no update after unmount.
- `tests/filters/applyFilters.test.ts`: sort fallback to `new`; `new` not written; `from=map` targets the map;
  `closeThen` versus `replace`; listeners called once; `fixRanges` with `dev025ValidateRanges` off and on.
- `tests/filters/useDraft.test.ts`: `update` normalises; `replace` from a relax option; `relaxed` survives reset.
- `tests/city/useCityPick.test.ts`: the keep-or-clear table of BR-APP-009 (zones, metro, median); sort fallback;
  header variant saves and navigates, nested variant touches only the draft.
- `packages/ui/tests/inputs.test.tsx`: `IntInput` (`12a3` → 123, `0` → empty, `20000` → 10 000); `PriceInput` keeps
  typed text and re-syncs only on a foreign value.

Component (Vitest + Testing Library):

- `FiltersForm.test.tsx`: three modes — title, footer buttons, posted section present only in `search`; section
  order; reset with `dev018ResetKeepsDaily` off and on; footer labels for unknown, positive and zero counts; flow
  line for `{21 in 7 days}` → «≈3 в день», `{4 in 7 days}` → «4 за неделю», `{0}` → the "none" text, with
  `dev021OneFlowVocabulary` off and on; relax chip replaces the draft and sets `relaxed`; radar button hidden when
  `radarsReady` is false, «Радар включён» when `useHasActiveRadar` is true.
- `DealSections.test.tsx`: deal switch keeps geography; long → daily with `[apartment, commercial]` keeps
  `[apartment]` and clears price, below-median, tenant and pets; last type cannot be removed; adding «Дом» clears
  `below_median`; rent-term visibility table.
- `RoomsPicker.test.tsx`: tap 2 → 2–2; then 4 → 2 and up; «Любые» clears; 3 then 1 → 1–3; `aria-pressed`.
- `PriceSection.test.tsx`: title per deal × currency; preset source priority and the on/off rule; unit hint;
  typical line conditions; «Не дороже рынка» availability with `dev052UnifiedBelowMedianRule` off and on; UZS at a
  rate of 12 650: `1,2` → 95 USD, `1.000.000` accepted.
- `WhereSection.test.tsx`: exclusivity table (polygon, zones, districts × each action); canonical zone order; caption
  per city kind; area row per mode; draw callback payload has no districts and no zones.
- `PreferenceSections.test.tsx`: visibility per deal × mode with `dev017TenantPetsDailyRule` off and on; tenant
  toggle-off; pets mapping, tip logic and pill with mocked storage; furniture tri-state; posted toggle and hint.
- `QuickFilterForm.test.tsx`: title per kind and deal; reset per kind; footer label per count; apply payload.
- `SortList.test.tsx`: six rows for sale + apartments + zones + medians; daily rent has no `deal` and no `ppm`;
  unknown city → three rows, no throw; radio semantics; pick payload.
- `CityPickerSheet.test.tsx`: header and nested variants (×, ✓, pick semantics); each geolocation outcome with a
  mocked location service; counts with and without statistics.

End to end (Playwright, fake Telegram, stubs; every case in cookie mode and header mode):

- `e2e/filters.spec.ts`: chip → sheet over the feed (feed still in the DOM) → change rooms → one request to
  `/bff/listings/count` carrying the rooms range → «Показать N» → address of `/` carries the new parameters, history
  length unchanged, feed re-created; close without apply → address unchanged; Telegram Back closes the nested city
  picker first, then the sheet; reload on `/ru/filters?…` → direct-load form → apply lands on `/`; open from the map
  → apply lands on `/map`; launch with `news=pets` → sheet scrolled to «Животные»; quick rooms: chip → pick 2 →
  apply → the address carries `rooms_min=2&rooms_max=2` and the feed is re-created (in header mode the
  `/bff/listings` request carries the same range; in cookie mode page one is fetched on the server and is not
  visible to the test); quick price reset clears bounds and «Не дороже рынка» only; `/filters/foo` →
  not found; sort: pick «Сначала дешевле» → `sort=cheap` in the address, pick «Сначала новые» → no `sort`.
- `e2e/city.spec.ts`: header chip → pick another city → feed for that city, one settings Server Action request
  (the `PATCH /settings` itself is sent by the server; its body is covered by the unit test of `updateSettings`),
  districts and polygon gone from the address; filters sheet → nested pick → close without «Показать» → city unchanged; nested
  pick → «Показать» → city saved.
- Use role-based selectors: hidden Activity routes stay in the DOM (`preserving-ui-state.md`, "Testing").

## Acceptance checklist

Run in ru, uz and en, light and dark, in Telegram on staging. Flag lines marked "test" are verified by the named
component test, because flags are constants that stay off.

Full filters sheet:

- [ ] Opens from the feed chip and from the map button over the screen below; ×, backdrop, drag down and Telegram
      Back close it without changing the feed.
- [ ] Header shows «Фильтры» and «Сбросить»; the 16 sections appear in the legacy order with the legacy texts.
- [ ] Deal switch resets everything except districts, zones and the drawn area; daily rent shows «Аренда» active.
- [ ] City field appears only with more than one city and opens the nested picker; picking changes only the draft.
- [ ] Housing chips match the deal; the last selected type cannot be removed; adding a second type turns «Не дороже
      рынка» off.
- [ ] Rent term appears only for rent when daily is selected or the city has daily listings; switching clears price
      and «Не дороже рынка», and to daily also tenant and pets.
- [ ] Rooms: single value, range by a second tap, «4+», «Любые»; hidden for room, commercial or land only.
- [ ] Price title follows deal and currency; inputs accept `1,2` and `1.000.000` in UZS; preset chip sets the upper
      bound, clears the lower one, and toggles off on a second tap.
- [ ] Unit hint appears for sale with land or house; the typical line appears only for apartment-only searches.
- [ ] «Не дороже рынка» is absent for daily rent, for mixed types and in a city without medians; turning it on shows
      the rent or the sale hint.
- [ ] Test: `dev052UnifiedBelowMedianRule` on changes availability as `belowMedianAvailable` says.
- [ ] Inverted price or area range is applied as typed (flag off). Test: `dev025ValidateRanges` on swaps the bounds.
- [ ] «Обвести на карте» closes the sheet and opens the map with districts and zones cleared and a pending draw
      request (no `draw` parameter in that navigation; from WP-28 on the map then enters drawing as a layer that
      Back cancels); with an area set, «Своя область на карте» removes it.
- [ ] Zones keep the order centre, nearer-centre and clear districts; a district clears zones; «Рядом с метро» is
      independent and absent in a city without metro; the districts caption matches the city kind.
- [ ] Who posts, furniture, floor behave as three-way and toggle controls; tenant chip clears on a second tap.
- [ ] Tenant and pets are visible for long-term and daily rent and absent for sale (flag off). Test:
      `dev017TenantPetsDailyRule` on follows `sectionsFor`.
- [ ] Pets: pill «Новое» until the first tap, gone after relaunch; each new non-neutral choice shows its tip inside
      the sheet for 4 s.
- [ ] Sale shows area and market and no appliances; rent and daily show appliances; area accepts digits only, 0 means
      empty, maximum 10 000.
- [ ] «Опубликовано» exists only in search mode; a choice shows the hint; a second tap clears it.
- [ ] «Сбросить» returns the defaults of the base deal and current city; from daily rent it lands on long-term rent
      (flag off). Test: `dev018ResetKeepsDaily` on keeps daily.
- [ ] Footer: «Показать» → «Показать N» → «Ничего нет»; three quick changes send one count and one flow request.
- [ ] Flow line shows the three legacy texts for none, weekly and daily rates (flag off). Test:
      `dev021OneFlowVocabulary` on uses the shared wording.
- [ ] A relax chip replaces the draft; the count follows.
- [ ] «Показать N» closes the sheet, writes the filters into the address, scrolls to top and re-creates the feed; an
      unavailable sort falls back to «Сначала новые»; a changed city is saved once.
- [ ] Opened from the map, apply returns to the map with the new parameters.
- [ ] Launch with `news=pets` opens the sheet on long-term rent, scrolled to «Животные».
- [ ] Reopening the sheet after closing without apply shows the applied filters, not the abandoned draft.
- [ ] Reload on the sheet's address shows the form; apply and Back both land on the feed with the search state.
- [ ] Count or flow failure (stub switched to `source_unavailable`) keeps the previous label and hides the flow line;
      no error screen.
- [ ] Radar layouts (component test until WP-30): «Новый радар» with «Включить радар», «Условия радара» with
      «Сохранить», both with «Сейчас подходит: N», neither with «Опубликовано» nor «Обвести на карте».

Quick filter sheet:

- [ ] Rooms, price and owner chips open the compact sheet with the right title and body.
- [ ] «Сбросить» resets only its filter; for price also «Не дороже рынка».
- [ ] «Показать N» updates after a change and applies like the full sheet; closing without apply changes nothing.
- [ ] Price for daily rent shows «Цена за сутки» and no «Не дороже рынка».

Sort sheet:

- [ ] Sale, apartments, city with zones and medians: six rows in the order new, cheap, expensive, deal, centre, per
      m², with the three hints; daily rent has no «Выгоднее к рынку» and no «Дешевле за м²».
- [ ] The current sort carries ✓; a pick closes the sheet, scrolls to top and reloads the feed; «Сначала новые»
      leaves no `sort` in the address.

City picker sheet:

- [ ] Header chip opens «Город» with rows, counts and ✓; a pick changes the feed city, clears districts and the drawn
      area, keeps zones, metro and «Не дороже рынка» only where the new city supports them, and saves the city.
- [ ] Geolocation row: pending, denied, failed, too far and success each show the legacy text or pick the city.
- [ ] Counts show long-term rent and sale (flag off). Test: `dev023CityCountsIncludeDaily` on adds daily rent.
- [ ] Nested picker lies above the filters sheet; Back closes it first.

All sheets:

- [ ] Every scenario above passes in cookie mode and in header mode (`e2e/filters.spec.ts`, `e2e/city.spec.ts`).
- [ ] The Telegram Settings button closes any of the four sheets and opens settings.
- [ ] With stub answers the demo marker is visible while a sheet shows count or flow.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, unit, component and end-to-end suites are green.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web.

## Handoff

Empty.
