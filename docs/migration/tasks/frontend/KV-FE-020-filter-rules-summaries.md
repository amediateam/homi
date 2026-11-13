# KV-FE-020 — Filter transitions, sort availability and summaries

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-FILTER-001, F-FILTER-003, F-FILTER-004, F-RADAR-001 |
| Dependencies | KV-FE-019 (model), KV-FE-016 (catalogue keys `sum.*`, `deal.*`, `type.*`, `sort.*`); money labels from KV-FE-017; fixes LB-APP-023; DEV-015, DEV-017, DEV-018, DEV-052 `PROPOSED` |

## Goal

The pure rules that every filter UI shares live in `@homi/search`: what happens to the other filters when the deal,
rent term, types, geography or city change; which sections and sorts are available for a filter set and city; what
"reset" means; and the summary strings (collapsed title, radar title, area summary, room and price labels). Screens
only call these functions, so the filters sheet, quick sheets, radar editor and summaries cannot disagree.

## Legacy reference

- Transitions: BR-APP-002 (rent ↔ sale resets all but `districts`, `zones`, `polygon`; `App.jsx:271-281`,
  `$KVADRO_ROOT/demo/app/src/features/filters/sheet/DealSections.jsx:20-28`), BR-APP-003 (long ↔ daily keeps allowed
  types, resets price and `below_median`; daily clears `tenant`, `pets`, `pets_only`; `DealSections.jsx:51-65`),
  BR-APP-004 (rent-term choice shown only for rent and when daily is selected or `counts.rent_daily > 0`), BR-APP-005
  (types per deal; last type cannot be removed; `below_median` survives only for `['apartment']`), BR-APP-006 (rooms
  hidden for room/commercial/land only), BR-APP-008 (polygon, zones, districts mutually exclusive; zones canonical
  order; `near_metro` independent), BR-APP-009 (city change clears `districts`, `polygon`; keeps `zones` only if the
  city has zones, `near_metro` only if `city.metro`, `below_median` only if `city.median`; `App.jsx:283-303`,
  `FiltersSheet.jsx:119-131`), BR-APP-019/BR-APP-020 (tenant and pets for rent incl. daily; area and market sale only;
  appliances rent only), BR-APP-021 (posted days search only), BR-APP-022 (reset).
- Below-market availability: BR-APP-017 (non-daily apartment-only search in a city with `median !== false`); DEV-052
  `PROPOSED` (one server rule, KV-BE-024).
- Sorts: BR-APP-023 (`new`, `cheap`, `expensive` always; `deal` for non-daily apartment-only where `median !== false`;
  `center` when the city has zones; `ppm` for sale; unavailable → `new`; `new` never sent) —
  `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:17-34`; LB-APP-023 (offered before meta loads, throws).
- Summaries: `$KVADRO_ROOT/demo/app/src/features/filters/summary.js:1-140` — `roomsLabel` (BR-APP-066:
  `sum.roomsExact` «{n}-комн.», `sum.roomsFrom` «{n}+ комн.», `sum.roomsRange` «{lo}–{hi} комн.»), `priceLabel`
  (`sum.priceUpto` «до {hi}», `sum.priceFrom` «от {lo}», `X–Y`), `findCity` (fallback Tashkent from top-level
  `meta.districts`/`meta.zones`), `areaLabel` (`sum.polygon` «Своя область», `sum.zonesBoth` «Центр и ближе к центру»,
  zone name before « (», two districts `+N`), `filtersSummary` (BR-APP-064 order: city · area · Посуточно · у метро ·
  rooms · price · ≤ медианы · без риелторов / от хозяев), `filtersTitle` (BR-APP-065), `filtersAreaSummary`.
- Questionable decisions: LB-APP-026 (`sum.wholeCity` «Весь Ташкент» for every city → DEV-015), LB-APP-029 (tenant and
  pets visible for daily → DEV-017), LB-APP-030 (reset leaves daily → DEV-018).

## Implementation

1. `frontend/packages/search/src/transitions.ts`: `switchDeal(f, deal)`, `switchRentTerm(f, term)`, `toggleType(f,
   type)`, `setGeography(f, {polygon | zones | districts})`, `pickCity(f, city)`, `resetAll(f, city)`,
   `resetQuick(f, kind)` (`rooms`, `price` — also clears `below_median` — and `owner`). All return normalised filters
   (KV-FE-019).
2. `src/availability.ts`: `sectionsFor(f, city, mode)` → booleans for rent term, rooms, tenant, pets, area, market,
   appliances, posted days (`mode` = `search | radar-new | radar-edit`), `belowMedianAvailable(f, city)`,
   `sortOptions(f, city)`. With `city === null` (meta not loaded) `sortOptions` returns only `new`, `cheap`,
   `expensive` (LB-APP-023 fix: never `center` before meta). `normalizeSort(sort, options)` → `new` when unavailable.
3. Deviation flags in `frontend/app/lib/deviations.ts`:
   - `dev017TenantPetsDailyRule`: tenant and pets sections follow the approved single rule for daily rent (DEV-017
     text: "tenant allowed for …" — exact rule taken from the approved row); off = legacy (visible for daily, cleared on
     switch);
   - `dev018ResetKeepsDaily`: `resetAll` keeps `rent_daily`; off = legacy (back to `rent_long`);
   - `dev015NeutralWholeCity`: the whole-city summary uses `sum.wholeCityGeneric` «Весь город» (new key, KV-FE-016) or
     the city name; off = `sum.wholeCity` «Весь Ташкент».
4. `src/summary.ts`: `roomsLabel`, `priceLabel(f, money)`, `areaLabel(f, city)`, `filtersSummary(f, meta, money)`,
   `filtersTitle(f, money)`, `filtersAreaSummary(f, meta)`, `findCity(meta, code)`; translation and money functions are
   injected. `filtersTitle` uses the enum tables of KV-FE-015 for `type.*` (LB-APP-002 fix for server-stored radar
   filters).
5. No React here; KV-FE-050…KV-FE-056 and KV-FE-078 consume these functions.

## States and texts

| Function | Example (ru) | Keys |
| -------- | ------------ | ---- |
| `filtersSummary` | «Ташкент · Юнусабадский · у метро · 2-комн. · до $600 · без риелторов» | `sum.nearMetro` «у метро», `sum.roomsExact`, `sum.priceUpto`, `sum.belowMedian` «≤ медианы», `sum.noAgents` «без риелторов», `sum.owners` «от хозяев», `deal.rent_daily` «Посуточно» |
| no city name (meta not loaded) | «Весь Ташкент · …» (DEV-015 on: «Весь город · …») | `sum.wholeCity`, `sum.wholeCityGeneric` (new key) |
| `filtersTitle` | «Посуточно · Дом, Комната · 1–3 комн. · от $40»; empty → «Аренда» | `deal.*`, `type.*`, `sum.roomsRange`, `sum.priceFrom` |
| `areaLabel` | «Своя область» / «Центр и ближе к центру» / «Центр» / «Юнусабадский, Чиланзарский +2» | `sum.polygon`, `sum.zonesBoth` |
| `sortOptions` labels | «Сначала новые», «Сначала дешевле», «Сначала дороже», «Выгоднее к рынку», «Ближе к центру», «Дешевле за м²» | `sort.new`, `sort.cheap`, `sort.expensive`, `sort.deal`, `sort.center`, `sort.ppm` (+ `sort.dealHint`, `sort.centerHint`, `sort.ppmHint`) |

## Interaction

n/a (pure rules). Haptics and focus are the screens' concern.

## Telegram integration

n/a.

## Storage and analytics

n/a. `pickCity` callers persist `kv-city` and `PUT /api/settings {city}` (KV-FE-044).

## Files

- `frontend/packages/search/src/{transitions,availability,summary}.ts` (new)
- `frontend/app/lib/deviations.ts` (flags `dev015NeutralWholeCity`, `dev017TenantPetsDailyRule`, `dev018ResetKeepsDaily`)
- `frontend/packages/search/tests/{transitions,availability,summary}.test.ts` (after KV-FE-010)

## API contract

Consumes `CityMeta` (`code`, `name`, `zones[]`, `districts[]`, `metro`, `median`) from API-001 and `CityStats.counts`
(`rent_daily`) from API-002. Produces filter objects for API-004…API-007 and API-019/API-020.

## Business rules

- Kept: BR-APP-002, BR-APP-003, BR-APP-004, BR-APP-005, BR-APP-006, BR-APP-008, BR-APP-009, BR-APP-017, BR-APP-019,
  BR-APP-020, BR-APP-021, BR-APP-022, BR-APP-023, BR-APP-064, BR-APP-065, BR-APP-066.
- LB-APP-023 fix `APPROVED` (policy).
- DEV-015, DEV-017, DEV-018 `PROPOSED` (flags, `todo` tests); DEV-052 `PROPOSED` is server-side — the client keeps
  BR-APP-017 for showing the chip.

## Acceptance criteria

- Each transition reproduces the legacy result on a table of before/after cases taken from the legacy code paths
  (`App.jsx:271-303`, `DealSections.jsx:20-89`, `FiltersSheet.jsx:119-136`).
- `sortOptions(f, null)` never contains `center` or `deal`; a stored `center` sort falls back to `new` when unavailable.
- Summaries equal the legacy strings for the filter fixtures used by the `filters-sheet` and `tab-radar` baselines of
  KV-QA-019 (collapsed title and radar tile titles).

## Tests

Unit: deal switch keeps geography; daily switch clears tenant and pets (flag off) / applies the DEV-017 rule (flag on,
`todo`); type toggling refuses removing the last type; city change matrix (`metro`, `median`, zones presence); reset
with and without DEV-018; sort availability matrix (sale/rent/daily × apartment-only × city median × zones × meta
null); summary snapshots in ru, uz, en.

## Edge cases

- City object without a `metro` field: treated as `false` (LB-APP-007 root cause).
- Districts that no longer exist in `meta` (renamed): shown by code, as legacy (`?? code`).
- Polygon plus zones arriving from a server radar (invalid combination): the summary shows «Своя область» (polygon
  wins), the model keeps what the server sent.

## Security

n/a (no user data). Summaries are text.

## Definition of done

`make ci-frontend` green; unit tests green (after KV-FE-010); summary snapshots reviewed against the baselines; PR
reviewed by the other developer.
