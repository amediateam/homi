# KV-FE-054 — Filters: owner, tenant, pets, furniture, renovation, floor, area, market, appliances, posted

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FILTER-001 |
| Dependencies | KV-FE-050 (sheet frame, in-sheet tip toast), KV-FE-028 (`kv-new-pets` storage with DeviceStorage mirror); uses `normaliseRange` of KV-FE-052; decisions: DEV-017, DEV-025, DEV-005 `PROPOSED` |

## Goal

Sections 8–16 of the full filters sheet (SCR-014) — who posts, tenant, pets (with the «Новое» pill and tips),
furniture, renovation, floor, area and market (sale), appliances (rent) and «Опубликовано» (search mode only) — exist
with the legacy options, visibility rules and texts.

## Legacy reference

- SCR-014 sections 8–16 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/filters/sheet/PreferenceSections.jsx:9-173`
  (`OwnerSection`, `TenantSection`, `PetsSection` `:62-94`, `FurnitureSection`, `RenovationSection`, `FloorSection`);
  `sheet/ExtraSections.jsx:9-115` (`AreaSection`, `MarketSection`, `AppliancesSection`, `PostedSection`);
  `$KVADRO_ROOT/demo/app/src/components/inputs/IntInput.jsx:10-21`; `options.js:14-23`;
  `$KVADRO_ROOT/demo/app/src/lib/newFeatures.js:11-30`; visibility `FiltersSheet.jsx:212-228`.
- Rules: BR-APP-019 (tenant and pets for base deal rent), BR-APP-020 (area/market sale, appliances rent), BR-APP-021
  (posted days search-only, ignored for radar matching), BR-APP-057 (pets news and pill). Defects: LB-APP-029 →
  DEV-017, LB-APP-043 → DEV-025 (area). DEV-005 (radars do not store `posted_days`, server side).
- Visual baseline (KV-QA-019): `filters-sheet` → `SCR-014-*.png` (lower sections when captured; otherwise the legacy
  layout).

## Implementation

1. `frontend/app/app/(miniapp)/features/filters/sections/{OwnerSection,TenantSection,PetsSection,FurnitureSection,
   RenovationSection,FloorSection,AreaSection,MarketSection,AppliancesSection,PostedSection}.tsx` and
   `inputs/IntInput.tsx`.
2. Who posts (section 8): heading `sheet.who`; three-way segmented `owner.any` / `owner.no_agents` / `owner.owners`.
3. Tenant (section 9, base deal rent — daily included, BR-APP-019): heading `sheet.tenant`; chips `tenant.family`,
   `tenant.men`, `tenant.women`; tapping the selected one clears it (`null`).
4. Pets (section 10, base deal rent): `data-focus="pets"`; heading `sheet.petsTitle` + pill `sheet.new` while
   `meta.new_features` includes `pets` and `kv-new-pets` is unset; segmented `sheet.any` / `sheet.pets` /
   `sheet.petsOnly` → `{pets, pets_only}`; any tap writes `kv-new-pets = '1'`; switching to a new non-`any` mode shows
   the in-sheet tip toast `sheet.petsTip` or `sheet.petsOnlyTip`, otherwise clears it.
5. DEV-017 (flag `dev017TenantPetsDailyRule` of KV-FE-020, default off): when approved, the tenant and pets sections
   follow the single rule chosen by the product owner (proposal: tenant for both rent terms, pets only long-term), and
   the rent-term switch of KV-FE-051 stops clearing what stays valid. Legacy: both sections stay visible on daily while
   the switch clears them (LB-APP-029).
6. Furniture (section 11): heading `sheet.furniture`; segmented `sheet.any` (`null`) / `sheet.furnished` (`true`) /
   `sheet.unfurnished` (`false`).
7. Renovation (section 12): heading `sheet.renovation`; chips from `meta.renovations[filters.deal]` (server names),
   multi-select toggle.
8. Floor (section 13): heading `sheet.floor`; chips `sheet.notFirst`, `sheet.notLast` (independent booleans).
9. Sale only (section 14): area — heading `sheet.area`, two `IntInput`s (`sheet.from` / `sheet.to`, placeholders «0» and
   `sheet.anyArea`), non-digits stripped, 0 → `null`, capped at 10 000; DEV-025 (`dev025ValidateRanges`) swaps an
   inverted area range via `normaliseRange`. Market — heading `sheet.market`; segmented `sheet.any` / `sheet.market.new`
   / `sheet.market.secondary`.
10. Rent only (section 15, daily included): appliances — heading `sheet.appliances`; chips from `meta.appliances`.
11. Search mode only (section 16): posted — heading `sheet.posted`; chips `sheet.posted.1`, `sheet.posted.3`,
    `sheet.posted.7` (toggle; tapping the selected one clears); hint `sheet.postedHint` while a value is set. Radar
    modes never render it; the radar save strips `posted_days` (BR-APP-021; DEV-005 on the server).

## States and texts

| Section | Visible when | Texts (keys, ru) |
| ------- | ------------ | ---------------- |
| who | always | `sheet.who` «Кто размещает»; `owner.any` «Все», `owner.no_agents` «Без риелторов», `owner.owners` «Только хозяева» |
| tenant | base deal rent | `sheet.tenant` «Кто будет жить»; `tenant.family` «Семья», `tenant.men` «Парни», `tenant.women` «Девушки» |
| pets | base deal rent | `sheet.petsTitle` «Животные», pill `sheet.new` «Новое»; `sheet.any` «Не важно», `sheet.pets` «Не запрещены», `sheet.petsOnly` «Разрешены» |
| pets tips | mode changed to pets / pets_only | `sheet.petsTip` «🐾 Скроем объявления, где животных прямо запрещают. Где разрешают — покажем первыми.», `sheet.petsOnlyTip` «🐾 Покажем только объявления, где прямо написано «можно с животными». Таких пока немного.» |
| furniture | always | `sheet.furniture` «Мебель»; `sheet.any`, `sheet.furnished` «С мебелью», `sheet.unfurnished` «Без мебели» |
| renovation | always (chips from meta) | `sheet.renovation` «Ремонт» + server names |
| floor | always | `sheet.floor` «Этаж»; `sheet.notFirst` «Не первый», `sheet.notLast` «Не последний» |
| area | sale | `sheet.area` «Площадь, м²»; `sheet.from` «от», `sheet.to` «до», placeholder `sheet.anyArea` «любая» |
| market | sale | `sheet.market` «Дом»; `sheet.any`, `sheet.market.new` «Новостройка», `sheet.market.secondary` «Вторичка» |
| appliances | rent (incl. daily) | `sheet.appliances` «Техника» + server names |
| posted | search mode | `sheet.posted` «Опубликовано»; `sheet.posted.1` «За сутки», `sheet.posted.3` «За 3 дня», `sheet.posted.7` «За неделю»; hint `sheet.postedHint` «Только для ленты: в чат и так приходят лишь новые.» |
| meta loading | `meta = null` | renovation and appliances sections render their headings with no chips |

## Interaction

- Taps only; the pets tip toast lives 4 s inside the sheet (second toast instance, KV-FE-014) and is replaced by the
  next tip.
- `?news=pets` opens the sheet scrolled to `[data-focus="pets"]` after 350 ms (KV-FE-050, BR-APP-057).
- Responsive: segmented controls of three equal parts; long uz/en labels wrap inside the segment.

## Telegram integration

TMA-037 (`kv-new-pets` mirrored to DeviceStorage on Telegram 9.0+, through KV-FE-028), TMA-025 (chip haptics).

## Storage and analytics

- Storage: writes `kv-new-pets = '1'` (mirrored; restore policy per KV-FE-028 and LB-APP-012).
- Analytics: none.

## Files

- `frontend/app/app/(miniapp)/features/filters/sections/*` (ten section components listed above), `inputs/IntInput.tsx`
- `frontend/app/tests/filters/{PreferenceSections,ExtraSections}.test.tsx`

## API contract

n/a — draft only. Keys sent in `FilterQuery`: `owner`, `tenant`, `pets`, `pets_only`, `furnished` (`true|false` when not
`null`), `renovation` (repeated), `floor_not_first`, `floor_not_last`, `area_min`, `area_max`, `market`, `appliances`
(repeated), `posted_days` (`08` §1.7). Reads `meta.renovations`, `meta.appliances`, `meta.new_features` (API-001).

## Business rules

- Kept: BR-APP-019, BR-APP-020, BR-APP-021, BR-APP-057.
- DEV-017, DEV-025 `PROPOSED` behind flags (tests `todo('DEV-017 PROPOSED')`, `todo('DEV-025 PROPOSED')`); DEV-005 is
  server-side (radar filters store `posted_days: null`).

## Acceptance criteria

- Sale shows area and market and no appliances, tenant or pets; rent and daily show appliances, tenant and pets.
- The posted section is absent in the radar create/edit sheets; selecting «За 3 дня» shows the hint; tapping again
  clears it.
- With `new_features: ['pets']` and no `kv-new-pets`, the pill shows; after any pets tap it disappears and stays gone
  after a relaunch (localStorage, DeviceStorage).
- Area input `12a3` stores 123; `0` stores `null`; `20000` stores 10 000.
- Visual: the lower sections match the legacy layout and texts in ru, uz and en.

## Tests

- Component (`PreferenceSections.test.tsx`): visibility per deal × mode, tenant toggle-off, pets mode mapping and tip
  logic, pill condition with mocked storage, furniture tri-state.
- Component (`ExtraSections.test.tsx`): IntInput parsing table, market tri-state, appliances/renovation from meta,
  posted toggle and hint; DEV-017 and DEV-025 `todo`s.

## Edge cases

- `meta.renovations[deal]` missing for daily rent → empty chip row (legacy reads `renovations[filters.deal]`).
- Tenant set, then the deal switches to sale → the transition of KV-FE-020 resets it with the other deal defaults.
- Pets tip while the sheet closes: the toast unmounts with the sheet.

## Security

- SEC-REQ-021: renovation and appliance names are server strings rendered as text.
- SEC-REQ-007: `kv-new-pets` is a UI flag, never a credential.

## Definition of done

`make ci-frontend` green; component tests green (or added when KV-FE-010 lands); side-by-side review recorded in the
PR; parity gate G4 for F-FILTER-001 (with KV-FE-050…KV-FE-053) ticked (`15` §4); the `09` row updated; PR reviewed by
the other developer.
