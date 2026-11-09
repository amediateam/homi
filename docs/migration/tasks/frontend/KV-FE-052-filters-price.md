# KV-FE-052 — Filters: price section and «Не дороже рынка»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FILTER-006, F-FILTER-007 |
| Dependencies | KV-FE-050 (sheet frame), KV-FE-017 (money formatting, UZS presets, input parsing); backend KV-BE-024 (`below_median` predicate, `cities[].median`); decisions: DEV-025 and DEV-052 `PROPOSED`, DEV-006 `PROPOSED` (radar bounds, server side), DEC-10, Q-API-011 |

## Goal

Section 6 of the full filters sheet (SCR-014) and the body of the price quick sheet (SCR-015) — from/to inputs in the
display currency, «до N» presets, the land/house unit hint, the typical-price line and the «📊 Не дороже рынка» chip —
work as in legacy, with the UZS parsing defects fixed and inverted ranges caught behind DEV-025.

## Legacy reference

- SCR-014 section 6, SCR-015 price body (`03` §2); `$KVADRO_ROOT/demo/app/src/features/filters/PriceSection.jsx:10-124`
  (`priceTitle` `:10-19`, presets `:35-38`, typical `:40-42,93-100`, below-median `:101-121`);
  `$KVADRO_ROOT/demo/app/src/components/inputs/PriceInput.jsx:13-31`; `$KVADRO_ROOT/demo/app/src/lib/money.js:14-140`
  (`isUzs`, `formatPrice`, `parsePriceInput`, `toPriceInput`, `pricePresets`, `priceUnitLabel`).
- Rules: BR-APP-014 (presets), BR-APP-015 (UZS presets), BR-APP-016 (typical price), BR-APP-017 (below-median chip),
  BR-APP-018 (unit hint), BR-APP-060 (display), BR-API-031 (UZS → USD conversion), BR-API-153.
- Defects: LB-APP-011 (UZS boundary and parsing; fixed in KV-FE-017), LB-APP-043 → DEV-025; contradiction C-07 →
  DEV-052.
- Visual baselines (KV-QA-019): `filters-sheet` → `SCR-014-*` (price block), `feed-uzs-en-lite` (UZS labels).

## Implementation

1. `frontend/app/app/(miniapp)/features/filters/sections/PriceSection.tsx` (shared by the full and the quick sheet) and
   `frontend/app/app/(miniapp)/features/filters/inputs/PriceInput.tsx`; helpers from `@homi/utils` money module
   (KV-FE-017).
2. Title (`priceTitle`): sale → `sheet.price`; daily → `sheet.priceDay`; rent → `sheet.priceMonth`; `{cur}` = `$` or
   `money.unitMln` «млн сум» when the display currency is UZS **and** `meta.usd_uzs > 0`.
3. Inputs: labels `sheet.from` / `sheet.to`; placeholders «0» and `sheet.anyPrice`; the field keeps the typed text and
   only re-syncs when the outside value no longer equals the parsed text; `inputMode` `decimal` for UZS, `numeric` for
   USD; values stored in USD: UZS millions → `max(1, round(value · 10⁶ / rate))` (BR-API-031); parsing per the
   LB-APP-011 fix (spaces and thousands separators stripped, one `,` or `.` = decimal mark; `1.000.000` parses).
4. Presets (BR-APP-014, BR-APP-015): city presets `CityStats.presets[deal]` (API-002) win over
   `meta.price_presets[deal]`; in UZS city presets are converted and rounded (50 млн sale, 0.1 млн daily, 0.5 млн
   rent, duplicates dropped), fixed UZS lists when no city presets; chip label `sheet.upto` «до {amount}»; a chip is
   on only when `price_max === preset && price_min === null`; tap sets `price_max` (toggles off when already set) and
   clears `price_min`; horizontal chip strip.
5. Unit hint (BR-APP-018): sale with `land` or `house` among the types → `sheet.unitPriceHint`.
6. Typical price (BR-APP-016): apartment-only (daily included) in a city with a name and `CityStats.typical[deal]` →
   `sheet.typicalRent` / `sheet.typicalDaily` / `sheet.typicalSale` with `{city}` and `{price}` formatted by
   `formatPrice`.
7. «Не дороже рынка» (BR-APP-017): only for non-daily apartment-only searches in a city with `median !== false`; chip
   `sheet.belowMedian`; when on, the hint `sheet.belowMedianHintSale` / `sheet.belowMedianHintRent`. DEV-052 (flag
   `dev052UnifiedBelowMedianRule`, default off): availability follows the single server rule of KV-BE-024 through a
   shared rule table; until approved, the legacy client rule stays.
8. DEV-025 (flag `dev025ValidateRanges`, default off): before apply/save, an inverted price range (`min > max`) is
   swapped and the inputs show the swapped values; the same helper `normaliseRange()` is used by the area inputs of
   KV-FE-054. Legacy sends inverted ranges as they are (LB-APP-043).
9. Price reset belongs to the quick sheet (KV-FE-055: also clears `below_median`) and to the full reset (KV-FE-050).

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| title | always | `sheet.priceMonth` «Цена в месяц, {cur}», `sheet.priceDay` «Цена за сутки, {cur}», `sheet.price` «Цена, {cur}» |
| inputs | always | `sheet.from` «от», `sheet.to` «до», placeholder `sheet.anyPrice` «любая» |
| preset chips | presets exist | `sheet.upto` «до {amount}» (amount `$1 200`, `5 млн сум` …) |
| unit hint | sale + land/house | `sheet.unitPriceHint` «Цена за сотку или м² — умножаем на площадь из объявления» |
| typical price | BR-APP-016 | `sheet.typicalRent` «{city}: половина квартир — до {price} в месяц», `sheet.typicalDaily` «… за сутки», `sheet.typicalSale` «{city}: половина квартир — до {price}» |
| below-median chip | BR-APP-017 | `sheet.belowMedian` «📊 Не дороже рынка» |
| below-median hint | chip on | `sheet.belowMedianHintRent` «Цена не выше обычной у ближайших объявлений с тем же числом комнат (иначе — по району) и не дороже района — с допуском до +10%: это «на уровне». Где обычной цены пока нет, объявления не покажем.» / `sheet.belowMedianHintSale` (per m² variant) |
| stats loading / failed | API-002 pending or failed | meta presets; no typical line |
| invalid input | text does not parse | value `null` (no filter), text kept as typed |

## Interaction

- Typing updates the draft on every keystroke (the sheet debounces the count); chips give a light haptic via the chip
  primitive; the preset strip scrolls horizontally without starting the sheet drag.
- Inputs scroll into view above the keyboard; `enterkeyhint="done"` closes the keyboard.
- Responsive: two inputs side by side with an em dash, down to 320 px.

## Telegram integration

TMA-025 (chip haptics). No Telegram API otherwise.

## Storage and analytics

n/a — no storage keys, no events.

## Files

- `frontend/app/app/(miniapp)/features/filters/sections/PriceSection.tsx`, `inputs/PriceInput.tsx` (new)
- `frontend/packages/search/src/range.ts` (`normaliseRange`, DEV-025)
- `frontend/app/lib/deviations.ts` (flags `dev025ValidateRanges`, `dev052UnifiedBelowMedianRule`)
- `frontend/app/tests/filters/PriceSection.test.tsx`

## API contract

n/a for requests (draft only). Reads `meta.currency`, `meta.usd_uzs`, `meta.price_presets` (API-001),
`CityStats.presets`, `CityStats.typical` (API-002); the resulting `price_min`/`price_max` (USD integers) and
`below_median` travel in `FilterQuery` (`08` §1.7).

## Business rules

- Kept: BR-APP-014, BR-APP-015, BR-APP-016, BR-APP-017, BR-APP-018, BR-APP-060, BR-API-031.
- Defect fix `APPROVED` (policy): LB-APP-011 (via KV-FE-017).
- DEV-025, DEV-052 `PROPOSED` behind flags (tests `todo('DEV-025 PROPOSED')`, `todo('DEV-052 PROPOSED')`); DEV-006 is a
  server-side radar change and does not alter this section.

## Acceptance criteria

- USD: presets from `/api/cities` render «до $400 … до $1 500»; tapping «до $600» sets `price_max = 600`,
  `price_min = null`; tapping it again clears it.
- UZS at rate 12 650: typing `1,2` stores 95 USD; typing `1.000.000` is accepted (LB-APP-011); presets show «до 5 млн
  сум» rounded to 0.5 млн for rent.
- The below-median chip is absent for daily rent, for `[apartment, house]` and for a city with `median: false`; turning
  it on shows the rent or sale hint.
- Typical line «Ташкент: половина квартир — до $650 в месяц» appears only for apartment-only searches.
- Visual: the price block of the `filters-sheet` baseline (`SCR-014`) and the UZS labels of `feed-uzs-en-lite` match.

## Tests

- Component (`PriceSection.test.tsx`): title per deal × currency; preset source priority; chip on/off rule; unit hint;
  typical line conditions; below-median availability table; DEV-025 and DEV-052 `todo`s.
- Unit (money module of KV-FE-017, referenced): the KV-QA-006 money fixtures (parse, round-first, presets).

## Edge cases

- `usd_uzs` 0 or missing with currency UZS → USD display (BR-APP-060).
- A preset equal to the current `price_max` but `price_min` set → chip off.
- Very large typed values (`10000000000`) are kept; the server validates (SEC-REQ-017).
- City stats for another deal only: no typical line for this deal.

## Security

- SEC-REQ-017: values sent are integers produced by the parser; the server remains authoritative.
- SEC-REQ-021: preset labels and city names rendered as text.

## Definition of done

`make ci-frontend` green; component tests green (or added when KV-FE-010 lands); side-by-side review of the price block
recorded in the PR; parity gate G4 for F-FILTER-006 and F-FILTER-007 ticked (`15` §4); the `09` rows updated; PR
reviewed by the other developer.
