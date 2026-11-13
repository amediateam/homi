# KV-FE-055 — Quick filter sheet: rooms, price, owner

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FILTER-002 |
| Dependencies | KV-FE-051 (`RoomsPicker`), KV-FE-052 (`PriceSection`); uses the compact sheet of KV-FE-013, the live count hook of KV-FE-050 and the header chips of KV-FE-048; decisions: LB-APP-042 (owner chip label, fixed in KV-FE-048) |

## Goal

Tapping the rooms, price or owner chip in the feed header opens a compact sheet that edits only that filter with a live
result count (SCR-015), resets only that filter, and applies like the full sheet.

## Legacy reference

- SCR-015 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/filters/QuickFilterSheet.jsx:20-120` (reset per kind
  `:35-51`); wiring `$KVADRO_ROOT/demo/app/src/app/App.jsx:636-646` (apply = `applyFilters`, `:314-324`).
- Rules: BR-APP-022 (quick reset resets only its filter; price also `below_median`), BR-APP-007, BR-APP-014,
  BR-APP-017. Defect: LB-APP-042 (the chip that opens the owner kind; fix lives in KV-FE-048).
- Visual baseline (KV-QA-019): `quick-rooms` → `SCR-015-*.png`; price and owner kinds have no baseline — compare with
  the legacy layout.

## Implementation

1. `frontend/app/app/(miniapp)/features/filters/QuickFilterSheet.tsx` with `kind: 'rooms' | 'price' | 'owner'`,
   `initial`, `onApply`, `onClose`; compact sheet (`csheet qsheet`) with a grab handle and a header (spacer, title,
   × with aria `common.close`).
2. Title: rooms → `sheet.rooms`; price → the price title of KV-FE-052 (`sheet.priceMonth` / `sheet.priceDay` /
   `sheet.price` with `{cur}`); owner → `sheet.who`.
3. Body: rooms → `RoomsPicker` + muted `sheet.roomsHint`; price → `PriceSection` (inputs, presets, typical line,
   below-median chip); owner → three-way segmented `owner.any` / `owner.no_agents` / `owner.owners`.
4. Draft copy of the filters; live count `GET /api/feed/count` 250 ms after a change, previous request aborted, errors
   keep the old value (no flow request in this sheet).
5. Footer: secondary «Сбросить» (`sheet.reset`) resets only the kind: rooms → `rooms_min = rooms_max = null`; price →
   `price_min = price_max = null` and `below_median = false`; owner → `owner = 'any'`. Primary button `sheet.show` /
   `sheet.showN` / `sheet.nothing` → medium haptic, close, apply to the feed (scroll to top, nudge candidate, sort
   fallback).
6. Back handler, drag-to-close from the grab area, backdrop tap closes (KV-FE-013, KV-FE-025).
7. Report `$pageview filters/rooms`, `filters/price`, `filters/owner` (KV-FE-035).

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| rooms | kind rooms | `sheet.rooms` «Комнаты», `sheet.roomsAny` «Любые», «1»…«4+», `sheet.roomsHint` «— два числа задают диапазон» |
| price | kind price | price title and texts of KV-FE-052 |
| owner | kind owner | `sheet.who` «Кто размещает»; `owner.any` «Все», `owner.no_agents` «Без риелторов», `owner.owners` «Только хозяева» |
| count loading | before the first count | `sheet.show` «Показать» |
| count | `n > 0` / `0` | `sheet.showN` «Показать {n}» / `sheet.nothing` «Ничего нет» |
| reset | always | `sheet.reset` «Сбросить» |
| error | count failed | previous label kept |

## Interaction

- Gestures: drag down on the grab area (6 px / 25 % / 0.5 px/ms / 200 ms), backdrop tap, Back.
- Haptics: light on room taps (picker), medium on apply.
- Animation: compact sheet `rise`; reduced motion → none.
- Responsive: compact height (content-sized), bottom safe area, column ≤ 608 px.

## Telegram integration

TMA-022 (Back closes), TMA-025 (haptics). The Settings button does not close this sheet in legacy (LB-APP-046); with the
KV-FE-025 fix it does.

## Storage and analytics

- Storage: none.
- Analytics: `$pageview filters/<kind>` (legacy names).

## Files

- `frontend/app/app/(miniapp)/features/filters/QuickFilterSheet.tsx` (new)
- `frontend/app/tests/filters/QuickFilterSheet.test.tsx`; E2E case in `frontend/app/e2e/filters.spec.ts`

## API contract

- API-005 `GET /api/feed/count?<FilterQuery>` → `200 {"count": number}`; errors ignored.
- Apply re-creates the feed (API-004, KV-FE-048).

## Business rules

- Kept: BR-APP-022 (quick reset), BR-APP-007, BR-APP-014, BR-APP-017.
- LB-APP-042 fix in KV-FE-048 (the chip label); this sheet keeps the legacy owner options.

## Acceptance criteria

- The price kind «Сбросить» clears both bounds and the below-median chip, nothing else; the rooms kind clears only the
  rooms range; the owner kind sets «Все».
- Changing a value updates «Показать N» after 250 ms; closing without applying leaves the feed unchanged.
- Visual: side by side with the `quick-rooms` baseline (`SCR-015`) — grab handle, header, picker, footer equal.

## Tests

- Component (`QuickFilterSheet.test.tsx`): title per kind and deal, reset per kind, footer label per count, apply
  callback payload.
- E2E: `quick-rooms` — chip → pick 2 → «Показать N» → feed request with `rooms_min=2&rooms_max=2`.

## Edge cases

- Price kind opened for a daily search: title «Цена за сутки, $»; no below-median chip.
- Rooms chip hidden for no-room types (BR-APP-006) — the sheet cannot open for them.
- Count request still pending on apply: apply proceeds; the request is aborted on unmount.

## Security

- SEC-REQ-021: labels are text. No new data leaves the client beyond `FilterQuery`.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); side-by-side review of the SCR-015 baseline
recorded in the PR; parity gate G4 for F-FILTER-002 ticked (`15` §4); the `09` row updated; PR reviewed by the other
developer.
