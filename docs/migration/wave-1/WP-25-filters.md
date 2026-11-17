# WP-25 — Filters, quick filter, sort, city

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (this PR) |
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
`FiltersForm` with its 16 sections (17 components, row 14 is two) and three modes; the footer with live count, flow
line and relax chips; `QuickFilterForm` and `QuickFilterPage`; `SortList`; `CityPickerSheet` (header and nested
variants); `IntInput` and `PriceInput` in `@homi/ui`; the apply function shared by every surface that applies
filters; `refreshCitiesStats()` in `lib/reference/useReference.ts`; the `focus=pets` entry and the «Новое» pill.

Out: the filter model, summaries, sort availability, URL mapping and money parsing (WP-22, used here); the feed
header chips that open these sheets and the feed that re-creates itself (WP-24); `CityList`, its geolocation row and
`nearestCity`, the first-launch city page, `RouteSheet`, the toast and the settings action (WP-23); the map and its
filters button (WP-27); lasso drawing (WP-28); mounting the radar modes, the subscribe flow and the follow nudge
(WP-30); screen tracking (WP-32).

## Decisions that bind this package

- Route per screen (DEC-44, 25 §3.2): each sheet has an address. Opening is `nav.push`, closing is `back()`; the
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
  components take a `rules` prop, and only `FiltersSheetRoute` and `QuickFilterSheetRoute` import `lib/flags.ts` (the
  full sheet also passes `oneVocabulary = devFlags.dev021OneFlowVocabulary`). Accepted exception: WP-23's
  `features/city/CityList.tsx` keeps its `flags = devFlags` default, so the city sheets pass no flags.
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
| `/filters/[kind]` | `(main)/@sheet/(.)filters/[kind]/page.tsx` | `(main)/filters/[kind]/page.tsx` | `QuickFilterPage` → `QuickFilterSheetRoute` |
| `/sort` | `(main)/@sheet/(.)sort/page.tsx` | `(main)/sort/page.tsx` | `SortSheetRoute` |
| `/city` | `(main)/@sheet/(.)city/page.tsx` | `(main)/city/page.tsx` | `CitySheetRoute` |

- Route files hold no logic. Each is a Server Component that renders its client `…SheetRoute` with its
  `presentation` inside `<Suspense fallback={null}>`: the bundled `use-search-params.md` says a Client Component that
  calls `useSearchParams` must sit under a Suspense boundary in a prerendered route, or the production build fails.
- `[kind]` accepts `rooms`, `price`, `owner`; anything else calls `notFound()`. Under Cache Components the parameter is
  runtime data, so both `[kind]` route files keep the WP-20 pattern and need no `generateStaticParams`: they pass the
  `params` promise inside the Suspense boundary to `features/filters/QuickFilterPage.tsx`, an async Server Component
  that awaits it, calls `notFound()` unless `isQuickFilterKind(kind)`, and renders `QuickFilterSheetRoute`. The
  direct load of an unknown kind renders the not-found screen (`e2e/foundation.spec.ts` "an invalid parameter…",
  `e2e/filters.spec.ts` `/filters/foo`); a soft navigation to one is not reachable from the UI and is not covered.
  WP-20's `QuickFilterPlaceholder` is removed from `features/shell/RouteParamPlaceholder.tsx`.
- Reserved, non-filter parameters used here: `from` (`map` when the opener is the map), `focus` (`pets`), `pick`
  (`city`, the nested picker layer). They belong to `RESERVED_PARAMS` of `lib/navigation/routes.ts` (WP-20);
  `fromSearchParams` reads only the 25 filter keys and `sort` and ignores everything else (WP-22), and
  `toSearchParams` output is merged with a reserved parameter only when opening a sheet, never when applying.
- A direct load renders the same form through `RouteSheet` with `presentation="standalone"` (WP-23: no page below,
  no backdrop tap, no drag-to-close; rendered in place, so the server HTML holds `data-route`). Interception of
  `(.)filters` from `/` and from `/map` and the direct load after a reload are proven by `e2e/foundation.spec.ts`
  ("layers") and `e2e/filters.spec.ts` ("opened from the map", "a reload on /filters…"). Leaving it lands on the
  parent with the search state intact: `parentOf(pathname, searchParams)` of WP-20 returns `/map` when `from=map`,
  else `/`, with the 25 filter keys and `sort` carried over and the reserved parameters dropped.

### State and navigation

- Opening (done by WP-24's chips, the few-results note and WP-27's map button): `nav.push(routes.filters(q))`
  (`lib/navigation/nav.ts`, `scroll: false`), `routes.quickFilter(kind, q)`, `routes.sort(q)`, `routes.city(q)`, with
  `q` = the current search parameters; the map button adds `from=map`. Opening plays no haptic of its own.
- `useDraft(initial)` in `features/filters/useDraft.ts`: `{ draft, update(patch), replace(filters), relaxed,
  setRelaxed }`, `initial` read once. `update` merges the patch and `replace` takes a whole filter set; both go
  through `normalizeFilters`, so no `undefined` reaches comparison or the API (fix of LB-APP-007, owned by WP-22), and
  `replace` keeps the draft's city when the set has none (a relax option, SEC-REQ-017). Both keep their identity;
  `relaxed` survives a `replace`. Nothing reaches the address before apply.
- A fresh open must start from the address, never from a draft left by an earlier visit. With `cacheComponents`,
  Next.js hides routes with Activity and keeps their state (`preserving-ui-state.md`). The forms are therefore keyed
  on the router's `bfcacheId`, which `use-router.md` documents as changing on a push or replace navigation and
  staying the same on back/forward and on search-parameter-only navigations — so the draft resets on every open and
  survives the nested `pick=city` layer. The docs call `bfcacheId` a last resort and prefer a reset in the close
  handler; that handler cannot see Telegram's Back or the hardware Back, which is why the key is used. Both
  `useRouter` of `next/navigation` and next-intl's wrapper (`@/i18n/navigation`) expose it; it is `_b_0_` on the
  server and in the hydration render, so a direct load hydrates cleanly. Both sheets key their form with
  `formKey(bfcacheId, address, filters.city)` of `features/filters/formKey.ts`, the one place the rule lives:
  `bfcacheId` (of `next/navigation` in `FiltersSheetRoute`, of `@/i18n/navigation` in `QuickFilterSheetRoute`), plus
  `:<city>` when the address has no `city`: the hydration render of a direct load does not know the saved city yet
  (`useSearchState`), and the draft must not keep the fallback it was first seeded with, which an apply would then
  write. Cost (KI-54): on such an address the draft starts over if `me` arrives with another city while the user
  edits, and «Показать» after a nested city pick re-creates the sheet for the moment of the back step.
  `e2e/filters.spec.ts` ("Telegram Back closes the nested city picker first…") and `e2e/city.spec.ts` ("a nested
  pick, then «Показать»…") prove the draft survives `pick=city`.
- `applyFilters(next, { sort, target, city, rules })` in `features/filters/applyFilters.ts` is the one place that
  applies; `city` is `findCity(next.city)`, the applied draft's city, and `rules` is `searchRules(devFlags)`:
  1. `normalizeFilters(fixRanges(next, rules))`;
  2. `normalizeSort(sort, sortOptions(filters, city))` — an unavailable sort becomes `new`, and `new` is not written;
  3. navigation: `closeThen(target(toSearchParams(filters, sort)))` with the sort of step 2, in both cases — WP-21
     defines it as "go back, then replace" when the sheet was opened in the app and as the replace alone at depth
     zero, which is the direct load; the address carries the 25 keys and `sort` only;
  4. `window.scrollTo(0, 0)`;
  5. `notifyFiltersApplied(filters)` — a listener list exported from the same file (`onFiltersApplied(cb)`, returns
     the unsubscribe), which the follow nudge of WP-30 and the lasso of WP-28 use; a listener that throws is
     reported and the others still hear. Tab switches, deal tabs and the header city pick do not call it.

  A second call while one is on its way returns the first call's promise and does nothing: during `closeThen`'s
  wait for the Back step a double tap would otherwise step back twice and leave the feed.
- `target` is `routes.map` when `from=map`, else `routes.feed` (full sheet); the quick sheets always apply to
  `routes.feed`.
- Nested city picker inside the full sheet: `useLayerState('pick')` in `FiltersForm`. It pushes `pick=city` with
  `window.history.pushState` (documented as integrated with the router in `single-page-applications.md`); Back closes
  the picker first, then the sheet.
- «Обвести на карте» (the draw hand-off, `FiltersSheetRoute`): save the city if it changed, call `requestDraw()` of
  `lib/ui/shellState.ts` (WP-23 has it), then `closeThen(routes.map(toSearchParams(cleared, sort)))`, where `cleared`
  is the draft without districts and zones (`WhereSection`'s `setGeography(draft, { polygon: null })`) and `sort` is
  `normalizeSort(sort, sortOptions(cleared, findCity(cleared.city)))` — a nested city pick may have made the sort
  unavailable. It runs once per showing (a second tap would step back twice). The navigation carries **no** `draw`
  parameter: `closeThen` lands at an unchanged history depth,
  where a `draw=1` would leave the BackButton hidden and Back unable to cancel drawing as legacy does. The map screen
  consumes the request once and opens drawing as a pushed layer (`useLayerState('draw')`, WP-28); until WP-28 lands
  the request is simply not consumed and the user sees the map.

### Components

| File | Role |
| ---- | ---- |
| `features/filters/FiltersForm.tsx` | Owns the `full` `RouteSheet`: header (×, title of the mode, «Сбросить» `data-action="reset"`), the sections over `useDraft(initial)`, `FiltersFooter` with `useLiveStats(draft, { flow: true, rules })`, `<ToastHost scope="sheet" />` inside the sheet, the nested `CityPickerSheet`, the `focus` scroll (`FOCUS_DELAY_MS = 350`); the content `<div data-route={route} data-layer=…>` is the child of `RouteSheet`. Props: `mode: 'search' \| 'radar-new' \| 'radar-edit'`, `initial`, `focus?`, `presentation`, `route` (`filters`; WP-30 passes `radar/new`, `radar/edit`), `rules`, `oneVocabulary`, `onApply(draft)`, `onSubscribe(draft, relaxed)`, `onSave(draft, relaxed)`, `onDraw?(cleared)`, `submitting` |
| `features/filters/sections/Section.tsx`, `sections/types.ts` | The section frame `Section` (`name` → `data-section`, `title`, `hint?`, `pill?`, `focus?` → `data-focus`; a labelled `group` with an `h2`), `ChipRow`, `SectionHint`; `SectionProps` = `{ filters, update, city, stats, mode, rules, sections }` |
| `features/filters/sections/*.tsx` | `DealSection`, `CitySection`, `TypeSection`, `RentTermSection`, `RoomsSection`, `PriceSection`, `WhereSection`, `OwnerSection`, `TenantSection`, `PetsSection`, `FurnitureSection`, `RenovationSection`, `FloorSection`, `AreaSection`, `MarketSection`, `AppliancesSection`, `PostedSection`; stateless, props `SectionProps`, plus `onOpenCity` (`CitySection`), `onDraw?` (`WhereSection`), `titleHidden?` (`PriceSection`, which also exports `usePriceTitle(filters)`); `OwnerSection.tsx` also exports `OwnerControl({ value, onChange })` for the owner quick sheet. A section renders whenever it is mounted; the form mounts it by `sections` |
| `features/filters/RoomsPicker.tsx` | «Любые», 1, 2, 3, 4+ (`{ filters, update }`); used by the full and the quick form |
| `features/filters/FiltersFooter.tsx` | Flow line, relax chips, buttons per mode; asks `useRadarsEnabled()` and `useHasActiveRadar(draft)` itself. Props `{ mode, draft, count, flow, oneVocabulary, submitting, onApply, onSubscribe, onSave, onRelax(option) }` |
| `features/filters/useLiveStats.ts` | Debounced count and flow with abort; exports `normalizeFlow`, `COUNT_DELAY_MS`, `FLOW_DELAY_MS` |
| `features/filters/QuickFilterForm.tsx` | Owns the compact `RouteSheet` for one `kind`: title per kind, body, footer «Сбросить» / «Показать …». Props `{ kind, initial, presentation, rules, onApply }` |
| `features/filters/QuickFilterPage.tsx` | Async Server Component of both `[kind]` route files: awaits `params`, `notFound()` unless `isQuickFilterKind`, renders `QuickFilterSheetRoute` |
| `features/filters/SortList.tsx` | Radio list of the available sorts (`{ filters, city, sort, onPick }`) |
| `features/filters/newFeatures.ts` | `isNewFeature('pets')`, `markFeatureSeen('pets')` on `homi-new-pets` through `lib/storage.ts`, and `useNewFeature('pets')` (`false` on the server and in the hydration render) |
| `features/filters/{Filters,QuickFilter}SheetRoute.tsx` | Client glue: `useSearchState`, the flags, the form key, apply, subscribe and the draw hand-off |
| `features/filters/SortSheetRoute.tsx` | Client glue that owns its compact `RouteSheet` around `SortList` |
| `features/city/CityPickerSheet.tsx`, `CitySheetRoute.tsx`, `useCityPick.ts` | Sheet around WP-23's `CityList`; header and nested variants (contract under "City picker sheet"); `useCityPick(target)` and `useSaveCity()` |
| `packages/ui/src/components/{IntInput,PriceInput}.tsx` | Presentational inputs; no money or Telegram knowledge. `IntInput { value, onValueChange, max? }`; `PriceInput { value, onValueChange, toText, parse, inputMode }`; both share `numberFieldClass` |

`FiltersForm` renders sections from `sectionsFor(draft, findCity(draft.city), mode, rules, useCityStats(draft.city))`
and never decides visibility itself; `CitySection` alone hides itself, with at most one city in the reference data.
Section order is fixed: deal, city, housing, rent term, rooms, price, where, who posts, tenant, pets, furniture,
renovation, floor, area and market (sale) or appliances (rent), posted (search mode only).

### Data

- Reference data, cities, city statistics and the currency come from WP-22's client hooks (`useReference()`,
  `findCity(code)`, `useCityStats(code)`, `useCitiesStats()`, `useMoney()`); the sheets fetch nothing on the server.
- `useLiveStats(draft, { flow, rules })` (`flow` defaults to `false`; the full sheet passes `{ flow: true, rules }`,
  the quick sheet `{ rules }`): `bffFetch('listings/count', { query, signal })` 250 ms after the last change and
  `bffFetch('listings/flow', { query, signal })` 500 ms after, `query` from `toApiQuery(draft, { rules })`, so with
  `dev025ValidateRanges` the count is of the ranges that will be applied. A change is a change of that query string,
  not of `filtersKey` (which ignores `posted_days`); it cancels the pending timers and aborts the requests in flight,
  as unmounting or hiding the sheet does, so nothing is written afterwards.
  A failed request (offline, timeout, `503 source_unavailable`) keeps the previous count and the previous flow. An
  answer `normalizeFlow` refuses sets the flow to `null`: `normalizeFlow` returns `null` unless the answer is an
  object with a numeric weekly total and a day count above zero, and drops a malformed option (string `code`,
  `label`, `rate` and an object `filters` are required). `null` hides the flow line and the chips. Both session modes
  use the same code (`bffFetch` adds the bearer token in header mode).
- On opening the full sheet: `void refreshCitiesStats()` of `lib/reference/useReference.ts` once per mount (AM-70: the
  `useCityStats().refetch()` this text first named does not exist). It reads `GET /cities` again through `/bff`,
  replaces only the city statistics, ignores a failed or malformed answer, shares one request between opens close
  together and never rejects (legacy refreshed city statistics on every open). The city sheet does not refresh.
- City save: `useSaveCity()` of `features/city/useCityPick.ts`: `homi-city` in `lib/storage.ts`,
  `updateSettings({ city })` (Server Action of WP-23, through `useAction`, not awaited) and `patchMe({ city })`,
  without which the profile's old city would win `cityFallback` on the next address without a city. Errors are
  ignored; the local choice stands. Only a city of the reference data is saved (`findCity`): a relax option's
  filters may carry a server city, which would otherwise stay on the device while the API refuses it (security
  review S-1). `GET /cities` keeps only elements with a string `code` (`cityStatsOf` of `lib/reference/cityStats.ts`,
  in `refreshCitiesStats` and the server loader; S-2).

### Seams

- `radarsReady` and `useRadarsEnabled()` come from `features/radars/capability.ts`; `subscribe(filters, entry,
  relaxed?)` and `useHasActiveRadar(filters)` come from `features/radars/subscribe.ts`. WP-24 creates both files
  (the second as a stub: `subscribe` resolves `{ ok: false }`, `useHasActiveRadar` returns `false`); WP-30 writes
  the real bodies and flips the constant. The footer asks `useRadarsEnabled()` only: while it is `false` — the
  constant is off, or the server has radars switched off (`radars_enabled` of the reference data, DEC-51) — the
  search footer shows neither the radar button nor the «Радар включён» state.
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
- `features/filters/{FiltersForm,FiltersFooter,QuickFilterForm,QuickFilterPage,SortList,RoomsPicker}.tsx`
- `features/filters/{FiltersSheetRoute,QuickFilterSheetRoute,SortSheetRoute}.tsx`
- `features/filters/{useDraft,useLiveStats,applyFilters,newFeatures}.ts`
- `features/filters/sections/` — the 17 section components listed above, `Section.tsx` and `types.ts`
- `features/city/{CityPickerSheet,CitySheetRoute}.tsx`, `features/city/useCityPick.ts`
- `tests/filters/{FiltersForm,FiltersSheetRoute,DealSections,RoomsPicker,PriceSection}.test.tsx`,
  `tests/filters/{WhereSection,PreferenceSections,QuickFilterForm,SortList}.test.tsx`
- `tests/filters/{useDraft,useLiveStats,applyFilters,newFeatures}.test.ts`
- `tests/city/{CityPickerSheet,useCityPick}.test.tsx`, `tests/reference/refreshCitiesStats.test.ts`
- `e2e/filters.spec.ts`, `e2e/city.spec.ts`

New, under `frontend/packages/ui/`: `src/components/IntInput.tsx`, `src/components/PriceInput.tsx`, exports in
`src/index.ts`, `tests/inputs.test.tsx`.

Changed: `lib/reference/useReference.ts` (`refreshCitiesStats()`, AM-70); `features/shell/RouteParamPlaceholder.tsx`
(`QuickFilterPlaceholder` removed; `ListingPlaceholder` and `RadarPlaceholder` stay); `frontend/app/README.md`.
Needed no change: `features/radars/subscribe.ts` (WP-24's stub has `subscribe` and `useHasActiveRadar`),
`lib/ui/shellState.ts` (WP-23 has `requestDraw` / `consumeDrawRequest`), `lib/api/bffAllowList.ts` (`listings/count`,
`listings/flow` and `cities` are allowed).

## Steps

1. Read the docs listed under "Decisions". Interception of `(.)filters` under `(main)/@sheet` from `/` and from
   `/map`, and the direct-load page after a reload of `/ru/filters`, are proven by `e2e/foundation.spec.ts` and
   `e2e/filters.spec.ts` (see "Routes"); no throwaway branch was needed.
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
10. `FiltersSheetRoute` and the two `/filters` route files: draft from the address, the form key (`formKey`), apply,
    close, `from=map`, `focus`, city save, statistics refresh (`refreshCitiesStats`).
11. `CityPickerSheet`, `useCityPick` / `useSaveCity`, the nested layer in the full form, `CitySheetRoute` and the
    `/city` route files.
12. `QuickFilterForm`, `QuickFilterSheetRoute`, `QuickFilterPage`, the `/filters/[kind]` route files; remove
    `QuickFilterPlaceholder` from `features/shell/RouteParamPlaceholder.tsx`.
13. `SortList`, `SortSheetRoute`, the `/sort` route files.
14. Wire the radar button to the seam; component test (in `FiltersForm.test.tsx`) with `radarsReady` forced on and
    `radars_enabled` `true`, `false` and missing.
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
| 1 | Deal | always | segmented `deal.rent_long` «Аренда» / `deal.sale` «Продажа»; daily rent shows «Аренда» active; no visible heading (the catalogue has none: the `h2` «Аренда / Продажа» is read, not shown) | `switchDeal`: defaults of the new deal, keeps `districts`, `zones`, `polygon` (BR-APP-002); tapping the active option does nothing |
| 2 | City | more than one city (`CitySection` renders nothing with `cities.length <= 1`) | field `sheet.city` «Город» + city name (empty for an unknown code) + chevron; the heading is read, not shown | a tap plays a light impact and opens the nested picker (once: a tap while it is open or opening is ignored); the pick changes the draft only (BR-APP-009); the row's light impact is `CityList`'s |
| 3 | Housing | always | `sheet.housing` «Жильё»; chips per deal: rent `type.apartment` «Квартира», `type.house` «Дом», `type.room` «Комната», `type.commercial` «Помещение»; daily without «Помещение»; sale «Квартира», «Дом», «Помещение», `type.land` «Участок» | multi-select; the last selected type cannot be removed; `below_median` survives only for exactly `['apartment']` (BR-APP-005) |
| 4 | Rent term | base deal is rent and (daily is selected or the city has daily listings) (BR-APP-004) | `sheet.rentTerm` «Срок аренды»; `rent.long` «Надолго» / `deal.rent_daily` «Посуточно» | `switchRentTerm`: keeps allowed types (else `['apartment']`), clears `price_min`, `price_max`, `below_median`; to daily also `tenant`, `pets`, `pets_only` (BR-APP-003) |
| 5 | Rooms | not every selected type is room, commercial or land (BR-APP-006) | `sheet.rooms` «Комнаты» + muted `sheet.roomsHint` «— два числа задают диапазон»; `sheet.roomsAny` «Любые», «1», «2», «3», «4+» | `pickRooms` (BR-APP-007): one tap picks a value; a second tap on another value makes a range; «4+» means no upper bound; «Любые» clears; light haptic |
| 6 | Price | always | title `sheet.priceMonth` «Цена в месяц, {cur}» / `sheet.priceDay` «Цена за сутки, {cur}» / `sheet.price` «Цена, {cur}» with `{cur}` = «$» or `money.unitMln` «млн сум»; inputs `sheet.from` «от», `sheet.to` «до», placeholders «0» and `sheet.anyPrice` «любая»; chips `sheet.upto` «до {amount}»; hint `sheet.unitPriceHint` «Цена за сотку или м² — умножаем на площадь из объявления»; typical line `sheet.typicalRent` «{city}: половина квартир — до {price} в месяц» / `sheet.typicalDaily` / `sheet.typicalSale`; chip `sheet.belowMedian` «📊 Не дороже рынка» with hint `sheet.belowMedianHintRent` / `sheet.belowMedianHintSale` while on | see "Price section" below |
| 7 | Where | always (rows as below) | `sheet.where` «Где искать»; `sheet.drawArea` «Обвести на карте» / `sheet.drawAreaOn` «Своя область на карте»; `sheet.zone.center` «🏛 Центр», `sheet.zone.near_center` «🏙 Ближе к центру»; `sheet.nearMetro` «🚇 Рядом с метро»; caption `sheet.orDistricts` «Или районы:» / `sheet.districts` «Районы:» / `sheet.districtsRegion` «Районы области (необязательно):»; district chips with server names | see "Where section" below |
| 8 | Who posts | always | `sheet.who` «Кто размещает»; segmented `owner.any` «Все» / `owner.no_agents` «Без риелторов» / `owner.owners` «Только хозяева» | sets `owner` |
| 9 | Tenant | base deal is rent, daily included (BR-APP-019) | `sheet.tenant` «Кто будет жить»; `tenant.family` «Семья», `tenant.men` «Парни», `tenant.women` «Девушки» | single choice; tapping the selected chip clears it |
| 10 | Pets | base deal is rent, daily included (BR-APP-019) | `sheet.petsTitle` «Животные» + pill `sheet.new` «Новое»; segmented `sheet.any` «Не важно» / `sheet.pets` «Не запрещены» / `sheet.petsOnly` «Разрешены»; the section is marked `data-focus="pets"` | «Не важно» `{ pets: false, pets_only: false }`, «Не запрещены» `{ pets: true, pets_only: false }`, «Разрешены» `{ pets: false, pets_only: true }`; any tap sets `homi-new-pets` (the segmented control ignores a tap on the selected option, so an `onClick` on its root marks it, `onValueChange` covers the keyboard); a new non-neutral choice shows a tip toast inside the sheet: `sheet.petsTip` «🐾 Скроем объявления, где животных прямо запрещают. Где разрешают — покажем первыми.» or `sheet.petsOnlyTip` «🐾 Покажем только объявления, где прямо написано «можно с животными». Таких пока немного.»; «Не важно» clears the tip |
| 11 | Furniture | always | `sheet.furniture` «Мебель»; segmented `sheet.any` «Не важно» / `sheet.furnished` «С мебелью» / `sheet.unfurnished` «Без мебели» | `furnished` = `null` / `true` / `false` |
| 12 | Renovation | always | `sheet.renovation` «Ремонт»; chips from `renovations[deal]` of the reference data for the draft's deal (server names) | multi-select |
| 13 | Floor | always | `sheet.floor` «Этаж»; `sheet.notFirst` «Не первый», `sheet.notLast` «Не последний» | two independent toggles |
| 14 | Area and market | sale only (BR-APP-020) | `sheet.area` «Площадь, м²» with `sheet.from` / `sheet.to`, placeholders «0» and `sheet.anyArea` «любая»; `sheet.market._` «Дом»: `sheet.any` / `sheet.market.new` «Новостройка» / `sheet.market.secondary` «Вторичка» | `IntInput`: non-digits stripped, 0 → no filter, capped at 10 000 |
| 15 | Appliances | rent only, daily included (BR-APP-020) | `sheet.appliances` «Техника»; chips from the reference list (server names): one list for every deal (`ReferenceResource.appliances`) | multi-select |
| 16 | Posted | search mode only (BR-APP-021) | `sheet.posted._` «Опубликовано»; `sheet.posted.1` «За сутки», `sheet.posted.3` «За 3 дня», `sheet.posted.7` «За неделю»; hint `sheet.postedHint` «Только для ленты: в чат и так приходят лишь новые.» while a value is set | single choice; tapping the selected chip clears it |

Price section (also the body of the price quick sheet):

- Display currency and rate from `useMoney()`; values are stored in USD. UZS is typed in millions with one decimal;
  conversion and parsing are WP-22's (`parseInput`, fix of LB-APP-011: `1.000.000` parses, one `,` or `.` is the
  decimal mark). `inputMode` is `decimal` for UZS and `numeric` for USD; `enterKeyHint="done"`.
- The field keeps the typed text and re-syncs only when the outside value no longer equals the parsed text. Text that
  does not parse means "no filter"; the text stays as typed.
- Presets (BR-APP-014, BR-APP-015): `presetSource(deal, stats, reference.price_presets)` of `@homi/search` picks the
  list — city presets of `GET /cities` win over reference presets — and `useMoney().presets(deal, …)` of WP-22 gets
  it as `{ city }` or `{ reference }` and converts and rounds it for сум; `applyPreset` and `isPresetSelected` of
  `@homi/search` do the rest. A chip is on only when `price_max` equals the preset and `price_min` is empty. A tap
  sets `price_max` and clears `price_min`; a tap on the chip that is on clears `price_max`. The strip
  (`data-scroll-x`) scrolls horizontally without starting the sheet drag, which starts only on the header.
- The price quick sheet shows the same section with `titleHidden` (the heading read, not shown) and puts
  `usePriceTitle(draft)` in its header.
- Unit hint: sale with land or house among the types (BR-APP-018).
- Typical line: apartment-only searches (daily included) in a city with a name and a typical price for the deal
  (BR-APP-016); absent while city statistics are loading or failed.
- «Не дороже рынка»: `sections.belowMedian` = `belowMedianAvailable(draft, city, rules)` — non-daily, apartment-only,
  a city with `has_median === true` (BR-APP-017; WP-22's fix of LB-APP-007 reads a missing mark as `false`, and the
  contract makes the field required, so it equals legacy's "not `false`" in practice). `dev052UnifiedBelowMedianRule`
  has no effect until DEV-052 is approved; the section only renders the answer.
- Inverted ranges (LB-APP-043): with `dev025ValidateRanges` off, `min > max` is sent as typed. With the flag on,
  `fixRanges` swaps price and area bounds where they leave the draft: the live count and flow (`toApiQuery` with the
  rules), the apply (`applyFilters`, so a reopened sheet shows the swapped values) and a radar body (`toRadarFilters`,
  WP-30). The draft keeps the bounds as typed.

Where section (BR-APP-008 — exactly one geography mode; rule owned by WP-22's `setGeography`):

- Area row, search mode: without a polygon the chip «Обвести на карте» hands `setGeography(draft, { polygon: null })`
  (no districts, no zones) to `onDraw` and starts the draw hand-off; it is offered only when the form gets `onDraw`
  (the search route always passes it). With a polygon the highlighted chip «Своя область на карте» removes it through
  `setGeography(draft, { polygon: null })`, so a stored radar carrying zones and a polygon loses its zones too. Radar
  modes: the row exists only when a polygon is set, and only removes it.
- Zones row, when the city has zones: one chip per zone code of `ZONE_OPTIONS` the city lists (another code is not
  shown), labelled `sheet.zone.*`, not with the server name; several may be on; stored in the order `center`,
  `near_center` (`toggleZone`); turning one on clears districts and polygon.
- «🚇 Рядом с метро», when the city has metro (`has_metro === true`): independent toggle, in the zones row.
- Districts, when the city has districts: caption «Районы области (необязательно):» for a region (checked first),
  «Или районы:» after zone chips, «Районы:» otherwise; turning one on clears zones and polygon (`toggleDistrict`).
  Chips wrap.
- Reference not loaded (city unknown): only the area row — in a radar mode without a polygon, a heading over
  nothing.

Tenant and pets on daily rent (LB-APP-029): with `dev017TenantPetsDailyRule` off both sections stay visible for
daily rent although the term switch has cleared them. With the flag on, `sectionsFor` and `switchRentTerm` follow the
single rule of DEV-017.

Reset (BR-APP-022, LB-APP-030): «Сбросить» calls `replace(resetAll(draft, draft.city, rules))`. Flag
`dev018ResetKeepsDaily` off: defaults of the base deal and the current city, so daily rent becomes long-term rent.
On: the current deal is kept, daily included. The remembered relax code survives a reset, as in legacy (LB-API-035
is the server's concern).

Pets entry (BR-APP-057): WP-21 turns the launch parameter `news=pets` (TMA-012) into `routes.filters({ focus:
'pets' })`. Here, in `FiltersSheetRoute`: with `focus=pets` and an address deal other than long-term rent — daily
rent included, as `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:114-123` does — the draft starts from
`defaultFilters('rent_long', city)`; long-term rent keeps the address's filters. 350 ms after mounting, `FiltersForm`
scrolls the section marked `data-focus="pets"` into view, smooth and centred (`scrollIntoView`). The pill «Новое»
(`data-slot="new-pill"`) shows while `features` of `GET /reference` (WP-11) contains `pets` and `useNewFeature('pets')`
says `homi-new-pets` is unset (never on the server or in the hydration render).

Tip toast: a second toast lives inside the sheet (SCR-042). It uses the scope WP-23 built for this:
`FiltersForm` mounts `<ToastHost scope="sheet" />` as a child of the sheet, so it sits above the footer
(`--fsheet-foot`); a tip is `showToast({ key }, 'sheet')` and «Не важно» calls `dismissToast('sheet')`; 4 s, replaced
by the next tip (a tap on the selected option shows none), gone with the sheet. It never appears in the `app` scope.

Haptics (legacy): the city field tap light; a rooms button light; a relax chip light; «Показать …» medium (full and
quick sheet); a sort pick light; a city row or the location row light and a found position success (`CityList`); a
closing drag light (`RouteSheet` and the nested city sheet). No other control plays one, and opening a sheet plays
nothing.

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
| flow failed | network, timeout, `503 source_unavailable` | previous flow line and chips kept; none if there was none |
| flow absent | no answer yet, or an answer `normalizeFlow` refused (`null`) | no flow line, no chips; the line's height reserved (`min-h-[18px]`), no layout jump |
| relax chips | the flow answer carries options | `«{label} · {rate}»`, server strings as text |
| radar on | search mode, `useRadarsEnabled()`, an active radar has the same filters (BR-APP-012) | ✓ `head.followOn` «Радар включён» (`data-state="radar-on"`) |
| radar off | search mode, `useRadarsEnabled()`, no such radar | `sheet.subscribe` «Включить радар», disabled while submitting |
| radars switched off | search mode, `useRadarsEnabled()` is `false` | no radar button and no «Радар включён»; the rest of the footer is unchanged |
| radar modes | `radar-new`, `radar-edit` | the flow line and relax chips as above, then `sheet.matchingNow` «Сейчас подходит: {n}» (empty while unknown) and one primary button: `sheet.subscribe` (new) or `sheet.save` «Сохранить» (edit), disabled while submitting |

- Footer buttons carry `data-action` (`apply`, `subscribe`, `save`; the header's «Сбросить» is `reset`); the footer
  is `[data-slot="filters-footer"]`, its lines `[data-slot="flow-line"]` and `[data-slot="matching-now"]`, a relax
  chip `[data-relax="<code>"]`. They sit outside the `data-route` content, in the sheet's header and footer.
- The count label is `t('sheet.showN', { n })` with the plain number, as in the quick sheet.
- Flow wording comes from WP-22 (BR-APP-044): `formatFlow(flowRate(flow), 'sheet', t, { oneVocabulary })` with
  `oneVocabulary = devFlags.dev021OneFlowVocabulary`. Off: the three sheet texts above. On: the shared vocabulary
  of DEV-021 (LB-APP-033), which on the sheet surface is the same three texts.
- Relax chip: light haptic, `replace(option.filters)` (`useDraft.replace` re-normalises, the draft's city as
  fallback), remember the option's code with `setRelaxed`. The code survives «Сбросить» and travels with a later
  subscribe or save; the chips show in every mode.
- «Показать …» (`FiltersSheetRoute`): medium haptic; if `draft.city !== filters.city`, `useSaveCity()(draft.city)`;
  then `applyFilters(draft, { sort, target, city: findCity(draft.city), rules })`.
- «Включить радар» (search mode, `FiltersSheetRoute`): `subscribe(draft, 'filters', relaxed)` with `submitting` set
  meanwhile (a second tap is ignored, a rejection is reported); on `ok` the sheet closes through `back()` without
  applying the draft to the feed; on failure the sheet stays open (toasts are WP-30's). The search route passes a
  no-op `onSave`.
- Titles per mode: `sheet.title` «Фильтры», `sheet.createTitle` «Новый радар», `sheet.editTitle` «Условия радара».
- Pull-to-refresh and the collapsing header are inactive while a sheet is open (WP-23).

### Quick filter sheet (SCR-015)

Opens from the rooms, price and owner chips of the feed header. Closes by ×, backdrop, drag on the grab handle,
Telegram Back, apply. Compact sheet with a grab handle and a header (title, ×). `QuickFilterForm` owns the
`RouteSheet`, since the title and the footer need the draft; its content is `data-route="filters/<kind>"` (with
`data-layer="sheet"` in the slot).

| Kind | Title | Body | «Сбросить» resets |
| ---- | ----- | ---- | ----------------- |
| `rooms` | `sheet.rooms` «Комнаты» | `RoomsPicker` + `sheet.roomsHint` as a muted line under it | the rooms range only |
| `price` | `usePriceTitle(draft)`, the price title of section 6 | the whole `PriceSection` with `titleHidden`, «Не дороже рынка» included, its sections from `sectionsFor(draft, findCity(draft.city), 'search', rules, useCityStats(draft.city))` | both price bounds and `below_median` |
| `owner` | `sheet.who` «Кто размещает» | `OwnerControl`: segmented «Все» / «Без риелторов» / «Только хозяева» | `owner` to `any` |

- Footer: `sheet.reset` «Сбросить» (`data-action="reset"`, through `replace(resetQuick(draft, kind))`, BR-APP-022) and
  the primary button (`data-action="apply"`) with the same three labels as the full sheet. Count only:
  `useLiveStats(draft, { rules })`, 250 ms debounce; no flow request.
- `QuickFilterSheetRoute` keys the form on `bfcacheId` and is the one place its flags are read. Apply: medium haptic,
  then `applyFilters(draft, { sort, target: routes.feed, city: findCity(draft.city), rules })` — always the feed, `from`
  dropped; the city is not saved (a quick sheet does not change it). A count still pending does not block apply.
- Price kind for daily rent: title «Цена за сутки, $», no «Не дороже рынка».
- Rooms kind when the filter set hides rooms (`sectionsFor(…).rooms` false; reachable only by direct load): the route
  renders nothing and calls `closeThen(routes.feed(toSearchParams(filters, sort)))` once — the replace alone at depth
  0, a back then a replace in the slot. The server HTML of such a direct load has no `data-route`.

### Sort sheet (SCR-016)

Opens from the sort chip. Closes by pick, ×, backdrop, drag, Telegram Back. Compact sheet (`SortSheetRoute` owns the
`RouteSheet`; content `data-route="sort"`): grab handle, header `sort.title` «Сортировка», ×; a `radiogroup` with ✓
and `aria-checked` on the current sort (`normalizeSort(sort, options)`). `SortList` is its own radiogroup, not the
Radix `RadioGroup` of `@homi/ui`, whose arrow keys pick (and every pick closes): one tab stop on the checked row;
arrows, Home and End move the focus only; Enter, Space or a tap picks, the checked row included. A hint is the row's
`aria-describedby`.

| Sort | Row | Hint | Offered when (BR-APP-023) |
| ---- | --- | ---- | ------------------------- |
| `new` | `sort.new` «Сначала новые» | — | always |
| `cheap` | `sort.cheap` «Сначала дешевле» | — | always |
| `expensive` | `sort.expensive` «Сначала дороже» | — | always |
| `deal` | `sort.deal` «Выгоднее к рынку» | `sort.dealHint` «Сначала те, что дешевле обычной цены — ближайших похожих или района» | exactly apartments, not daily, city `has_median === true` (legacy: not `false`; the same in practice, the contract field is required) |
| `center` | `sort.center` «Ближе к центру» | `sort.centerHint` «По расстоянию до центра города» | the city has zones |
| `ppm` | `sort.ppm` «Дешевле за м²» | `sort.ppmHint` «По цене за квадратный метр» | sale |

- Rows come from `sortOptions(filters, city)`. With an unknown city (reference not loaded or a stale city code) only
  the first three are offered and nothing throws (fix of LB-APP-023, owned by WP-22).
- Pick (once per showing; a second tap is ignored until the address changes or the sheet is shown again): light
  haptic, `closeThen(routes.feed(toSearchParams(filters, picked)))`, then scroll to top; the feed
  re-creates itself. `new` removes the `sort` parameter (`toSearchParams`), and `from` is dropped (only the feed has a
  sort chip). This equals `setSort` followed by closing, done as one navigation instead of two.

### City picker sheet (SCR-017)

| Variant | Opens from | Pick does |
| ------- | ---------- | --------- |
| header (`/city`) | the city chip of the feed header (more than one city) | `useCityPick({ variant: 'header', filters, sort })`: `pickCity(filters, city)` on the live filters, the sort `normalizeSort(sort, sortOptions(next, city))`, `useSaveCity()` (`homi-city`, `PATCH /settings` with the city, errors ignored, `patchMe`), `closeThen(routes.feed(toSearchParams(next, sort)))`, scroll to top; not an apply (no `onFiltersApplied`) |
| nested (`pick=city`) | the city field of the full sheet | `useCityPick({ variant: 'nested', draft, update, close })`: `update(pickCity(draft, city))`, then `close()` (Back); nothing saved — the city is saved on «Показать» or on the draw hand-off |

- Contract (`features/city/CityPickerSheet.tsx`): `CityPickerSheet` with the props `variant` (`'header'` or
  `'nested'`), `presentation?`, `current`, `onPick(code)`, `onClose?`. Header: a compact `RouteSheet`
  (`CitySheetRoute`, closed through `useBack`) whose content is `<div data-route="city">`, with `data-layer="sheet"`
  in the slot. Nested: a compact `stacked` `BottomSheet` in a portal (z 60 over 50), rendered by `FiltersForm` while
  `pick=city`, content `data-slot="city-picker-nested"`, no `data-route` and no `data-layer`; ×, backdrop, drag and
  Escape ask `onClose` once per address (a second Back would close the filters sheet too). It is not in the server
  HTML (the portal renders on the client only).
- `useCityPick` takes one pick per showing: a second tap before the address changed is ignored. An unknown code does
  nothing.
- Layout: title `city.title` «Город», ×; WP-23's `CityList` (`current`, `showCheck`, `showLocate`, `stats` of
  `useCitiesStats()`): optional geolocation row, city rows with the name, the counts line `city.counts` «{rent}
  аренда · {sale} продажа» when statistics exist, and ✓ on the current city. Rows without a counts line while
  statistics are loading or failed. The nested sheet lies above the filters sheet.
- Geolocation row (only when location can be requested, TMA-035): `city.locate` «Определить по геопозиции»; while
  pending `city.locating` «Определяем…» with a spinner, row disabled; denied → `city.locateDenied` «Нет доступа к
  геопозиции — выберите город из списка. Разрешить можно в настройках Telegram.»; failed or timed out →
  `city.locateFail` «Не получилось определить, где вы, — выберите город из списка.»; no city in range →
  `city.locateFar` «Рядом с вами наших городов пока нет — выберите из списка.»; found → success haptic and immediate
  pick. A result that arrives after the sheet closed is dropped. Coordinates never leave the device.
- `pickCity` (BR-APP-009): clears districts and polygon; keeps zones only if the new city has zones, metro only if
  it has metro, `below_median` only if it has medians; booleans are never `undefined` (LB-APP-007).
- Row tap: light haptic (`CityList`'s; the sheet and `useCityPick` add none). Closes by pick, ×, backdrop, drag,
  Telegram Back.
- Counts (LB-APP-035, owned by WP-23): `dev023CityCountsIncludeDaily` off shows long-term rent and sale only; on,
  `CityList` adds daily rent. The city sheets pass no flags: `CityList` reads its `devFlags` default.

### Edge cases and error paths

- Only one city in the reference data: no city section (`CitySection`, `cities.length <= 1`), no city chip
  (`FeedHeader`, `cities.length > 1`); `/city` with the reference data loaded and `cities.length < 2`, in either
  presentation, renders nothing and calls `nav.replace(routes.feed(toSearchParams(filters, sort)))`. While the
  reference data is missing (also the server and the hydration render) the city sheet shows without rows and does not
  redirect, so the direct load's server HTML holds `data-route="city"`.
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
  the last of three quick changes; earlier requests aborted; a change detected by value (an equal draft sends
  nothing, a `posted_days` change does); an error keeps the old count and flow; a refused flow answer hides the
  flow; count only without `flow`; the ranges of `rules`; `normalizeFlow` for `undefined`, `null`, `{}`, a zero day
  count, malformed options and a valid answer; no update after unmount.
- `tests/filters/applyFilters.test.ts`: sort fallback to `new`; `new` not written; `from=map` targets the map; only
  the search keys written; `closeThen` versus `replace`; listeners called once, a throwing one does not stop the
  others; a second apply in flight does nothing; `fixRanges` with `dev025ValidateRanges` off and on.
- `tests/filters/useDraft.test.ts`: `update` normalises; `replace` from a relax option keeps the draft's city;
  `relaxed` survives reset; stable `update` and `replace`.
- `tests/city/useCityPick.test.tsx`: the keep-or-clear table of BR-APP-009 (zones, metro, median); sort fallback;
  header variant saves and navigates, nested variant touches only the draft; one pick per showing; no haptic of its
  own; `useSaveCity` writes `homi-city`, patches `me` and sends `PATCH /settings` without awaiting it.
- `tests/reference/refreshCitiesStats.test.ts`: replaces only the city statistics; a failed or malformed answer
  changes nothing; opens close together share one request; never rejects.
- `tests/filters/newFeatures.test.ts`: marked once; `useNewFeature` follows the marker; `false` on the server and in
  the hydration render.
- `packages/ui/tests/inputs.test.tsx`: `IntInput` (`12a3` → 123, `0` → empty, `20000` → 10 000); `PriceInput` keeps
  typed text and re-syncs only on a foreign value.

Component (Vitest + Testing Library):

- `FiltersForm.test.tsx`: three modes — title, footer buttons, posted section present only in `search`; section
  order; reset with `dev018ResetKeepsDaily` off and on; footer labels for unknown, positive and zero counts; flow
  line for `{21 in 7 days}` → «≈3 в день», `{4 in 7 days}` → «4 за неделю», `{0}` → the "none" text, with
  `dev021OneFlowVocabulary` off and on; relax chip replaces the draft and sets `relaxed`, which survives a reset;
  radar button (step 14, `radarsReady` forced on through a mock of `features/radars/capability.ts`) shown with
  `radars_enabled: true`, hidden with `false`, with the reference data missing and with `radarsReady` off, «Радар
  включён» when `useHasActiveRadar` is true; the nested city picker (real `CityPickerSheet`); an unknown city in both
  presentations; the pets tip in the sheet's host; the `focus` scroll after 350 ms.
- `FiltersSheetRoute.test.tsx`: `data-route` / `data-layer` per presentation and the direct load's server HTML
  (`renderToString`); unknown city; `refreshCitiesStats` once per opening; apply (medium haptic, target, sort
  fallback, reserved parameters dropped, city saved after a nested pick); subscribe (`ok` → `back()`, failure stays,
  disabled meanwhile); the draw hand-off (`requestDraw`, no `draw` parameter, city saved); the pets entry per deal and
  its scroll; the form key (`bfcacheId` kept or changed, an address without a city); `dev018ResetKeepsDaily` read
  from `devFlags`.
- `DealSections.test.tsx`: deal switch keeps geography; long → daily with `[apartment, commercial]` keeps
  `[apartment]` and clears price, below-median, tenant and pets; last type cannot be removed; adding «Дом» clears
  `below_median`; rent-term visibility table.
- `RoomsPicker.test.tsx`: tap 2 → 2–2; then 4 → 2 and up; «Любые» clears; 3 then 1 → 1–3; `aria-pressed`.
- `PriceSection.test.tsx`: title per deal × currency; preset source priority and the on/off rule; unit hint;
  typical line conditions; «Не дороже рынка» availability with `dev052UnifiedBelowMedianRule` off and on (the same
  answer: the flag has no effect yet); UZS at a rate of 12 650: `1,2` → 95 USD, `1.000.000` accepted (1 000 000 млн
  сум, about 79 billion USD).
- `WhereSection.test.tsx`: exclusivity table (polygon, zones, districts × each action); canonical zone order; caption
  per city kind; area row per mode; draw callback payload has no districts and no zones.
- `PreferenceSections.test.tsx`: visibility per deal × mode with `dev017TenantPetsDailyRule` off and on; tenant
  toggle-off; pets mapping, tip logic and pill with mocked storage; furniture tri-state; posted toggle and hint.
- `QuickFilterForm.test.tsx`: title per kind and deal; reset per kind; footer label per count; apply payload; also
  `QuickFilterSheetRoute` (medium haptic, sort fallback, the `bfcacheId` key, rooms hidden → `closeThen` once, the
  direct load's server HTML per kind, unknown city) and `QuickFilterPage` (the three kinds, `notFound()` otherwise).
- `SortList.test.tsx`: six rows for sale + apartments + zones + medians; daily rent has no `deal` and no `ppm`;
  unknown city → three rows, no throw; radio semantics; pick payload; also `SortSheetRoute` and its server HTML.
- `CityPickerSheet.test.tsx`: header and nested variants (×, backdrop, Escape, drag, ✓, pick semantics, `onClose`
  once); each geolocation outcome with a mocked location service; counts with and without statistics; `CitySheetRoute`
  (the one-city redirect, no redirect without reference data, the direct load's server HTML); nested use with
  `useCityPick`.

End to end (Playwright, fake Telegram, stubs; every case in cookie mode and header mode):

- `e2e/filters.spec.ts` (10 tests per mode): chip → sheet over the feed (feed still in the DOM) → change rooms → one
  request to `/bff/listings/count` carrying the rooms range → «Показать N» → address of `/` carries the new
  parameters, history not grown (the same `history.length` as while the sheet was open — `closeThen`'s back then
  replace leaves the forward entry counted — and BackButton hidden), one medium impact, feed re-created (in both
  modes one RSC render of `/ru` carrying the range; in header mode also the `/bff/listings` page one; in cookie mode
  nothing through `/bff`, page one is fetched on the server); close by × and by Telegram Back without apply → address
  unchanged, the next open starts from it; Telegram Back closes the nested city picker first (the draft survives it),
  then the sheet; reload on `/ru/filters?…` → direct-load form → apply lands on `/`; open from the map → apply lands
  on `/map`; launch with `news=pets` → sheet scrolled to «Животные»; quick rooms: closed without apply nothing
  changes, reopened it starts from the address, pick 2 → apply → the address carries `rooms_min=2&rooms_max=2` and
  the feed is re-created; quick price reset clears bounds and «Не дороже рынка» only; `/filters/foo` (direct load) →
  not found; sort: pick «Сначала дешевле» → `sort=cheap` in the address, pick «Сначала новые» → no `sort`, each with
  one light impact. Every landing after an apply or a pick is polled until the whole address matches (`landed`):
  `closeThen` shows the old address for a moment before the replace.
- `e2e/city.spec.ts` (3 tests per mode): header chip → pick another city → feed for that city, one settings Server
  Action request (the `PATCH /settings` itself is sent by the server; its body is covered by the unit test of
  `updateSettings`), districts and polygon gone from the address; filters sheet → nested pick → close without
  «Показать» → city unchanged; nested pick → «Показать» → city saved (the field still shows the picked city after the
  layer's Back: the `bfcacheId` proof).
- Selectors: hidden Activity routes stay in the DOM (`preserving-ui-state.md`, "Testing"), so every locator is
  filtered to visible elements. The specs select by data attributes:
  `[data-slot="bottom-sheet"] [data-route="<name>"][data-layer="sheet"]` for a copy in `@sheet` (`filters`,
  `filters/rooms`, `filters/price`, `filters/owner`, `sort`, `city`), `[data-route="<name>"]:not([data-layer])` for a
  direct load,
  `[data-slot="bottom-sheet"] [data-action="reset|apply"]` (outside the `data-route` content),
  `[data-slot="bottom-sheet-close"]`, `[data-section="…"]`, `[data-field="city"]`, `[data-slot="city-picker-nested"]`,
  `[data-focus="pets"]`, `[data-slot="bottom-sheet-title"]`, a city row `[data-city="<code>"]`; roles only inside such
  a scope (the sort radios, the room buttons, the price fields, the dialog «Город»).

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
- [ ] Test: `dev052UnifiedBelowMedianRule` on leaves availability as it is (`belowMedianAvailable` ignores it until
      DEV-052 is approved).
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
- [ ] Count or flow failure (stub switched to `source_unavailable`) keeps the previous label and the previous flow
      line (none if there was none yet); no error screen.
- [ ] Radar layouts (component test until WP-30): «Новый радар» with «Включить радар», «Условия радара» with
      «Сохранить», both with «Сейчас подходит: N», neither with «Опубликовано» nor «Обвести на карте».
- [ ] While the reference data says `radars_enabled: false` the search footer offers no radar (component test;
      DEC-51).

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

- **Steps 1–15 are done** on `wp-25-filters` in two commits: `c41d07c` (the package) and `37ffd27` (the review
  fixes). It ran as plain subagents, at most three at a time, each owning its own files. In wave 1, A wrote
  `useDraft`, `applyFilters`, `useLiveStats`, `useCityPick` and `refreshCitiesStats`; B wrote sections 1–6,
  `RoomsPicker`, `SortList` and the sort sheet; C wrote sections 7–16 and `newFeatures`. In wave 2, C wrote the full
  sheet, B the quick sheet and A the city sheet. B and A then wrote `e2e/filters.spec.ts` and `e2e/city.spec.ts`.
  The orchestrator wrote `IntInput`, `PriceInput`, `Section.tsx` and `types.ts` (step 2 and the section frame), and
  re-ran every part's tests itself. Two independent read-only reviews followed (behaviour and React/Next;
  security), then the fixes of `37ffd27`, then all checks again.
  - **Mutation checks:**
    - B broke the preset source and the below-median gate: 14 tests failed. B broke the quick sheet's key, haptic,
      reset kind and zero label: 5 tests failed.
    - The review fixes were undone one at a time: the sort pick, draw and city-field guards and the quick sheet's key
      each failed their new test. The `bffFetch` cases fail with a `TypeError` on the old
      code without `AbortSignal.any`.
  - **Step 1:** interception needed no throwaway branch.
    - From `/`: `foundation.spec.ts` › "a sheet opened by navigation shows over the feed, Back closes it, reload shows
      the direct page" and `filters.spec.ts` › "chip → the sheet over the feed → …".
    - From `/map`: `filters.spec.ts` › "opened from the map (from=map), «Показать …» lands on /map with the search".
    - The direct load after a reload: both specs.
  - The checklist lines and the tests that prove them are in the PR description. The boxes stay unticked, because
    every line also asks for ru / uz / en and light / dark, and some for Telegram on staging (Next, item 3).
  - Size: 74 files under `frontend/`, +7 875 / −53 against `main`, tests included. The header's estimate was 2 900.
- **Checks** (from `frontend/`):
  - **`c41d07c`:**
    - `make ci-frontend` → exit 0 (types:check, lint, typecheck, every build). Unit tests: app 118 files / 1713,
      `@homi/search` 238 + 1 todo, `@homi/testing` 95, `@homi/ui` 120, `@homi/i18n` 110, `@homi/api-client` 14,
      `@homi/utils` 2.
    - End to end, each file alone against a local `next start` of that build: foundation 19, back + launch 16, feed
      19, city 6 and filters 20 passed; shell 16, of which 2 were rerun after a sign-in stuck at `booting` (KI-32).
    - The first filters run had one real failure, a race in the spec: a landing was asserted on `/ru?` before the
      replace that follows the back step. The spec now polls the whole address (`landed`).
  - **`37ffd27`:**
    - `make ci-frontend` → exit 0. Unit tests: app 120 files / 1731; the packages as above.
    - End to end on a rebuild: city 6, filters 20 (one sign-in stuck at `booting`, rerun green in both modes) and
      feed 19 (`bffFetch` changed) passed.
- **Corrections made in this specification (rule 6)**, by section:
  - **Scope:** `QuickFilterPage`, `refreshCitiesStats`, 16 sections in 17 components.
  - **Binding decisions:** only the two `…SheetRoute` files read `lib/flags.ts`. `CityList` keeps its own `devFlags`
    default.
  - **Routes:** `[kind]` reads `params` in `QuickFilterPage` inside Suspense and calls `notFound()`. Interception is
    proven by e2e.
  - **State and navigation:**
    - `useDraft` (`initial` read once; `replace` keeps the draft's city as fallback);
    - `bfcacheId` is exposed by both routers and is `_b_0_` at hydration; `formKey` in its own module keys both
      sheets;
    - `applyFilters(next, { sort, target, city, rules })` with its in-flight guard;
    - the quick sheets always target the feed;
    - the draw hand-off, with its once guard and its sort check.
  - **Components:**
    - `FiltersForm` and `QuickFilterForm` own their `RouteSheet`; `SortSheetRoute` owns its own;
    - `Section.tsx` and `SectionProps`;
    - the section extras (`onOpenCity`, `onDraw?`, `titleHidden?`, `usePriceTitle`, `OwnerControl`);
    - the props of the footer, the quick form, `SortList` and `RoomsPicker`;
    - `sectionsFor(…, rules, stats)`.
  - **Data:**
    - `useLiveStats(draft, { flow, rules })`, which detects a change by its query string;
    - the flow error rule (a failure keeps the previous count and flow);
    - `refreshCitiesStats()` instead of `useCityStats().refetch()` (AM-70);
    - `useSaveCity` with `patchMe` and the reference check (S-1); `cityStatsOf` (S-2).
  - **Files and Steps:** the real file and test lists, and the changed WP-20 / WP-22 files.
  - **Behaviour:**
    - the deal heading read, not shown;
    - the city field (`<= 1` city, the light impact on the tap, opens once);
    - the pets mapping, «any tap» and the pets entry for daily rent;
    - furniture segmented; renovations per deal; appliances one list;
    - presets through `presetSource`; `has_median === true`; `dev052` without effect;
    - the draw chip only with `onDraw`; the zone and caption rules; the reset call; the tip host's place;
    - a haptics paragraph (legacy);
    - the footer's failed-flow row, its selectors and the plain-number label; the relax chip;
    - the quick sheet's ownership, footer, key, and rooms hidden → `closeThen` once;
    - the sort radiogroup, the `deal` row and the once guard on a pick;
    - the city sheet's contract, the one-pick rule, no flags, the `< 2` redirect.
  - **Tests:** the unit, component and end-to-end bullets as written; the data-attribute selectors instead of "role
    based".
  - **Acceptance checklist:** two lines (`dev052`; a count or flow failure).
- **Assumption mismatch** (`docs/ai/reports/phase-3-notes.md` §W): AM-70. "On opening the full sheet:
  `useCityStats().refetch()`" named a function that does not exist: WP-22's `useCityStats(code)` reads the
  reference store and fetches nothing. `refreshCitiesStats()` in `lib/reference/useReference.ts` reads `GET /cities`
  again through `/bff` and replaces only the statistics.
- **Decisions of the implementation** (no ADR):
  - **Sheet ownership:** each form owns its `RouteSheet`, because the header «Сбросить», the price title and the
    footer need the draft.
  - **Form key:** both drafts are keyed by `formKey` (`bfcacheId`, plus the city when the address has none). The
    nested picker is a stacked `BottomSheet` in a portal, not a route.
  - **Sort list:** an own `role="radiogroup"`. In Radix 1.5.1 an arrow key clicks the item, and every pick closes the
    sheet.
  - **Haptics follow legacy:** RoomsPicker light per tap; the city field light; «Показать» medium (both sheets); a
    relax chip light; a sort pick light. No section plays one, and opening a sheet plays nothing.
  - **Double taps:** one apply in flight (`applyFilters`); once per showing for the sort pick, the city pick and the
    draw hand-off; one `pick=city` push per tap burst.
  - **Data guards:**
    - only a city of the reference data is saved;
    - `GET /cities` keeps only elements with a code;
    - `normalizeFlow` is the one validator of a flow answer and drops malformed options;
    - `bffFetch` combines signals through `anySignal()` where `AbortSignal.any` is missing (KI-55).
  - **Unchanged:** `CityList` (WP-23) is reused unchanged, with its own flags default.
- **Review findings** (reports kept with the session, not committed):
  - **Behaviour and React/Next:**
    - fixed: C-1 (`AbortSignal.any` on Chrome 111–115 and Safari 16.4–17.3; WP-22 code; KI-55); C-3 (the quick
      sheet's key without `city`); P-2 (double taps on a sort row and on «Обвести на карте»); P-3 (a double tap on
      the city field pushed `pick=city` twice); P-4 (the listeners' JSDoc);
    - not fixed: C-2, the sheet rising again for a moment on a city-less address, recorded in KI-54; P-1 is latent
      until WP-30 (Next).
  - **Security:** all six requirements met, with evidence (SEC-REQ-021 text rendering, SEC-REQ-017 re-normalised
    relax filters and the 25 keys, address input, the `{ city }` settings body, geolocation on the device, the
    `/bff` allow-list unchanged). Fixed: S-1 (the saved city checked against the reference data) and S-2 (a `null`
    element of `GET /cities` crashed the render). Info: S-3 (no length cap on relax strings) and S-4 (for WP-30).
- **Open for the reviewer:**
  - **Flow on failure:** the first text contradicted itself — "Data" said an error keeps the previous value, and
    the footer table said a failed request shows no flow line. The code keeps the previous flow line (none if there
    was none). Is that the intended legacy behaviour?
  - **Sort from the map:** a sort pick drops `from=map` and lands on the feed, while Back from a directly loaded
    `/sort?from=map` goes to `/map`. Only the feed has a sort chip today.
  - **One city:** `/city` with one city in the layer presentation replaces the address and leaves one extra feed
    entry. It is unreachable: with one city there is no chip.
  - **Nested picker drag:** a drag that closes the nested city picker plays the light impact every route sheet
    plays (TMA-025).
  - **Appliances:** one list for every deal (`ReferenceResource.appliances`), not one per deal as the audit implies.
  - **Districts caption:** for a region with zone chips, the region is checked first.
  - **Big сум inputs:** «1.000.000» in сум is accepted and parses to about 79 billion USD. Should the field cap it?
  - **Double tap on «Показать»:** it plays two medium impacts, though only the first applies.
  - **Deal heading:** the deal section's heading is the two option labels («Аренда / Продажа»), read but not shown.
    The catalogue has no key for it.
  - **`CityList` with null counts:** `CityList` (WP-23) would throw on a `GET /cities` element whose `counts` is
    `null`. The contract says it is always an object, so only `code` is guarded.
  - **Not covered by an automated test:**
    - the texts per locale;
    - a component test of rooms hidden for room or commercial only;
    - the pill after a real relaunch;
    - a relax tap end to end;
    - `source_unavailable` end to end;
    - the owner sheet's body end to end;
    - Settings from the quick, sort and city sheets;
    - the demo marker over a sheet.
- **For later packages:**
  - **WP-30:** mounts `FiltersForm` with `mode`, `route` (`radar/new` / `radar/edit`), `presentation`, `rules`,
    `oneVocabulary`, `onSubscribe(draft, relaxed)`, `onSave(draft, relaxed)` and `submitting`.
    - The footer already shows «Сейчас подходит: {n}» and the flow line in the radar modes.
    - Imports `normalizeFlow` from `useLiveStats.ts`.
    - Validates the relax code in its Server Action (S-4).
    - Must not call a `back()` captured before an awaited subscribe once the user has left the sheet (P-1).
  - **WP-28:** consumes `requestDraw()` (the draft arrives without districts and zones) and listens through
    `onFiltersApplied`. Listeners run before Next writes the replaced address, so they must use their argument.
  - **WP-27:** the map's filters button opens `routes.filters({ …q, from: "map" })`.
  - **WP-33:** runs the manual lines.
- **Known issues:** KI-54 (low: the draft re-created on an address without `city` when the city arrives; C-2) and
  KI-55 (resolved here).
- **Next:**
  1. Review and merge, on «сливай #N».
  2. The production track deploys.
  3. Check inside Telegram on staging: the sheets' drag, BackButton and haptics, the geolocation row, the pets
     launch. Run the checklist in ru / uz / en, light and dark; WP-33 runs the manual lines.
  4. Set the status to `DONE`. WP-27 (map) and WP-30 (radars) build on this package.
