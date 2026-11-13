# KV-FE-051 — Filters: deal, city, housing, rent term, rooms

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FILTER-001 |
| Dependencies | KV-FE-050 (sheet frame), KV-FE-044 (nested city picker); uses the transitions of KV-FE-020 (`switchDeal`, `switchRentTerm`, `toggleType`, `pickRooms`, `selectCity`); decisions: DEV-017 `PROPOSED` (rent-term side effects), DEV-052 `PROPOSED` |

## Goal

Sections 1–5 of the full filters sheet (SCR-014) — deal, city, housing, rent term and rooms — behave exactly as in
legacy, including every reset the transitions imply, and the rooms picker is a reusable component for the quick sheet
(KV-FE-055).

## Legacy reference

- SCR-014 sections 1–5 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/filters/sheet/DealSections.jsx:11-103`
  (`DealSection`, `RentTermSection`, `TypeSection`); `sheet/LocationSections.jsx:9-22` (`CitySection`);
  `$KVADRO_ROOT/demo/app/src/features/filters/RoomsPicker.jsx:13-33`; `options.js:7-13` (`TYPES_BY_DEAL`,
  `ROOM_OPTIONS`); `model.js:5` (`NO_ROOMS_TYPES`), `:145-176` (`pickRooms`, `isRoomPicked`);
  `FiltersSheet.jsx:113-136,195-206` (visibility).
- Rules: BR-APP-002, BR-APP-003, BR-APP-004, BR-APP-005, BR-APP-006, BR-APP-007, BR-APP-009, BR-APP-017 (below-median
  survives only for apartment-only). Defects: LB-APP-007 (city booleans), LB-APP-029 → DEV-017.
- Visual baseline (KV-QA-019): `filters-sheet` → `SCR-014-*.png` (top of the sheet).

## Implementation

1. `frontend/app/app/(miniapp)/features/filters/sections/{DealSection,CitySection,TypeSection,RentTermSection}.tsx` and
   `frontend/app/app/(miniapp)/features/filters/RoomsPicker.tsx`; all stateless, `{filters, update}` props.
2. Deal (section 1): segmented `deal.rent_long` / `deal.sale` (daily shows as «Аренда» active); switching calls
   `switchDeal()` — defaults of the new deal, keep `districts`, `zones`, `polygon` (BR-APP-002); the active option is a
   no-op.
3. City (section 2): only when `meta.cities` has more than one city; a field with MapPin, caption `sheet.city`, the
   city name and a chevron; tap opens the nested city picker (KV-FE-044); the pick goes through `selectCity()` with
   booleans coerced (BR-APP-009, LB-APP-007) and a light haptic.
4. Housing (section 3): heading `sheet.housing`; chips from `TYPES_BY_DEAL[filters.deal]` (rent `apartment, house,
   room, commercial`; daily `apartment, house, room`; sale `apartment, house, commercial, land`) labelled `type.*`;
   multi-select; the last selected type cannot be removed (re-selecting it keeps it); `below_median` stays only when
   types are exactly `['apartment']` (BR-APP-005).
5. Rent term (section 4): heading `sheet.rentTerm`; chips `rent.long` «Надолго» / `deal.rent_daily` «Посуточно»;
   shown only when the base deal is rent **and** (daily is selected **or** `cityStats.counts.rent_daily > 0`)
   (BR-APP-004). Switching keeps only types allowed for the new term (else `['apartment']`), clears `price_min`,
   `price_max`, `below_median`; to daily also clears `tenant`, `pets`, `pets_only` (BR-APP-003). DEV-017 (flag
   `dev017TenantPetsDailyRule`, default off, owned by KV-FE-020) applies the single tenant/pets rule decided by the
   product owner.
6. Rooms (section 5): heading `sheet.rooms` + muted `sheet.roomsHint`; buttons `sheet.roomsAny`, 1, 2, 3, `4+`; hidden
   when every selected type is `room`, `commercial` or `land` (BR-APP-006). `pickRooms` (BR-APP-007): a tap picks one
   value; a second tap on another value while one value (or 4+) is picked makes a range; `4` means «4 or more»
   (`rooms_max = null`); «Любые» clears; light haptic on numbers.
7. Accessibility fix (not a legacy behaviour change): segmented controls and chips are real buttons with
   `aria-pressed`; the rooms group has `role="group"` labelled by its heading.

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| deal | always | `deal.rent_long` «Аренда», `deal.sale` «Продажа» |
| city field | > 1 city | `sheet.city` «Город» + city name |
| housing | always | `sheet.housing` «Жильё»; `type.apartment` «Квартира», `type.house` «Дом», `type.room` «Комната», `type.commercial` «Помещение», `type.land` «Участок» |
| rent term | BR-APP-004 | `sheet.rentTerm` «Срок аренды»; `rent.long` «Надолго», `deal.rent_daily` «Посуточно» |
| rooms | not only no-room types | `sheet.rooms` «Комнаты», `sheet.roomsHint` «— два числа задают диапазон», `sheet.roomsAny` «Любые», «1», «2», «3», «4+» |
| rooms hidden | only room/commercial/land | section absent |
| city stats loading | API-002 pending | rent-term section hidden unless daily is already selected |
| disabled | — | no disabled state (all options always tappable; the last type tap is a no-op) |

## Interaction

- Taps only; light haptic on rooms and city; deal and term changes re-run the live count (KV-FE-050).
- Chip rows wrap; no horizontal scroll in these sections.
- Responsive: segmented control full width; rooms row of five equal buttons down to 320 px.

## Telegram integration

TMA-025 (haptics). The nested city picker uses TMA-035 through KV-FE-044.

## Storage and analytics

- Storage: none here (the city is saved on apply, KV-FE-050).
- Analytics: none (the sheet's `$pageview filters` covers it).

## Files

- `frontend/app/app/(miniapp)/features/filters/sections/{DealSection,CitySection,TypeSection,RentTermSection}.tsx`
- `frontend/app/app/(miniapp)/features/filters/RoomsPicker.tsx`
- `frontend/app/tests/filters/{RoomsPicker,DealSections}.test.tsx`

## API contract

n/a — draft changes only; the sheet sends the count/flow requests (API-005, API-006). Reads `meta.cities` (API-001) and
`CityStats.counts.rent_daily` (API-002).

## Business rules

- Kept: BR-APP-002, BR-APP-003, BR-APP-004, BR-APP-005, BR-APP-006, BR-APP-007, BR-APP-009.
- Defect fix `APPROVED` (policy): LB-APP-007.
- DEV-017 `PROPOSED` (test `todo('DEV-017 PROPOSED')`); DEV-052 `PROPOSED` affects only the price section (KV-FE-052).

## Acceptance criteria

- Sale → «Аренда» with districts `[chilonzor]` keeps the district and resets types to `['apartment']`.
- Long → daily with types `[apartment, commercial]` keeps `[apartment]`, clears price and below-median, tenant and pets.
- Removing the only selected type keeps it; adding `house` to `apartment` clears `below_median`.
- Rooms: tap 2 → `2..2`; tap 4 → `2..null`; tap «Любые» → `null..null`; tap 3 then 1 → `1..3`.
- The rent-term section is hidden for a city with `rent_daily = 0` unless daily is selected.
- Visual: the top of the `filters-sheet` baseline (`SCR-014`) matches section by section.

## Tests

- Unit (in KV-FE-020's suite, referenced): transition tables for BR-APP-002…BR-APP-007.
- Component (`RoomsPicker.test.tsx`): every two-tap combination of `ROOM_OPTIONS`, `aria-pressed` states.
- Component (`DealSections.test.tsx`): type chips per deal, last-type guard, rent-term visibility table, DEV-017 `todo`.

## Edge cases

- A server-stored radar with a type not offered for its deal (bot radar): the chip list shows the deal's types; the
  unknown type stays in the draft and is dropped by the normaliser of KV-FE-019 on save (DEV-004 server side).
- `meta.cities` empty: no city section; the default city is `tashkent`.
- Rooms range set, then types changed to `land` only: section hidden, the range kept (legacy) — sent as in legacy.

## Security

- SEC-REQ-021: city and type labels are text; city names are server strings.

## Definition of done

`make ci-frontend` green; component tests green (or added when KV-FE-010 lands); side-by-side review of the SCR-014
baseline (sections 1–5) recorded in the PR; parity gate G4 for F-FILTER-001 (with KV-FE-050, KV-FE-052…KV-FE-054)
ticked (`15` §4); the `09` row updated; PR reviewed by the other developer.
