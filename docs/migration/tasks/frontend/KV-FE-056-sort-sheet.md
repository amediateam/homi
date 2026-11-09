# KV-FE-056 — Sort sheet

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FILTER-003 |
| Dependencies | KV-FE-013 (compact sheet), KV-FE-020 (`sortOptions`, sort fallback); backend sort semantics KV-BE-031 (API-004); decisions: Q-API-010 |

## Goal

The sort chip opens a compact radio sheet (SCR-016) with only the sorts available for the current filters and city;
picking one re-creates the feed in that order. Options are never offered before the city configuration is known
(LB-APP-023).

## Legacy reference

- SCR-016 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:17-107` (`sortOptions` `:17-34`, hints
  `:37-41`); pick `$KVADRO_ROOT/demo/app/src/app/App.jsx` (`pickSort`: set, close, `scrollTo(0,0)`), fallback
  `ensureSortFits` (`App.jsx:259-263`); `new` never sent (`$KVADRO_ROOT/demo/app/src/lib/api/feed.js:78`).
- Rules: BR-APP-023, BR-API-024 (server availability). Defect: LB-APP-023 (`city?.zones.length !== 0` is `true` for a
  `null` city and throws on a city without `zones`).
- Visual baseline (KV-QA-019): `sort-sheet` → `SCR-016-*.png`.

## Implementation

1. `frontend/app/app/(miniapp)/features/sort/SortSheet.tsx` (`filters`, `city`, `sort`, `onPick`, `onClose`) on the
   compact sheet of KV-FE-013: grab handle, header (spacer, `sort.title`, ×), a `role="radiogroup"` list of rows with
   ✓ on the selected one (`role="radio"`, `aria-checked`).
2. Options from `sortOptions(filters, city)` of KV-FE-020: `new`, `cheap`, `expensive` always; `deal` for exactly
   `['apartment']`, not `rent_daily`, and `city.median !== false`; `center` when the city has zones; `ppm` for sale.
   **LB-APP-023 fix:** with `city = null` (meta not loaded) only `new`, `cheap`, `expensive` are offered and nothing
   throws for a city object without `zones`.
3. Each row: `sort.<value>` in bold plus the muted hint for `deal`, `center`, `ppm` (`sort.dealHint`, `sort.centerHint`,
   `sort.ppmHint`).
4. Pick: light haptic, set the sort, close, `scrollTo(0, 0)`; the feed list is re-created (its key includes the sort,
   KV-FE-048); `sort=new` is omitted from the query.
5. Whenever filters or city change elsewhere, the current sort falls back to `new` when no longer offered
   (`ensureSortFits`, KV-FE-020) — this sheet only displays the result.
6. Back handler, drag-to-close, backdrop tap closes. Report `$pageview sort` (KV-FE-035).

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| title | always | `sort.title` «Сортировка» |
| base options | always | `sort.new` «Сначала новые», `sort.cheap` «Сначала дешевле», `sort.expensive` «Сначала дороже» |
| deal | BR-APP-023 | `sort.deal` «Выгоднее к рынку», hint `sort.dealHint` «Сначала те, что дешевле обычной цены — ближайших похожих или района» |
| center | city has zones | `sort.center` «Ближе к центру», hint `sort.centerHint` «По расстоянию до центра города» |
| ppm | sale | `sort.ppm` «Дешевле за м²», hint `sort.ppmHint` «По цене за квадратный метр» |
| meta loading | `city = null` | base options only (LB-APP-023 fix) |
| selected | current sort | ✓ and `aria-checked="true"` |

## Interaction

- Tap a row: light haptic, immediate close and feed reload.
- Gestures: drag-to-close, backdrop tap, Back.
- Responsive: content-height compact sheet; long uz/en hints wrap.

## Telegram integration

TMA-022 (Back closes), TMA-025 (haptic). With the LB-APP-046 fix of KV-FE-025 the Settings button also closes it.

## Storage and analytics

- Storage: none (the sort lives in memory for the session, as legacy).
- Analytics: `$pageview sort`.

## Files

- `frontend/app/app/(miniapp)/features/sort/SortSheet.tsx` (new)
- `frontend/app/tests/sort/SortSheet.test.tsx`

## API contract

- API-004 `GET /api/feed?…&sort=cheap|expensive|deal|center|ppm` (absent for `new`); an unavailable sort would get
  `422 {"detail":"invalid_sort"}` from HOMI (KV-BE-031) — the client never sends one.

## Business rules

- Kept: BR-APP-023, BR-API-024 (Q-API-010 defines the orders server-side).
- Defect fix `APPROVED` (policy): LB-APP-023.

## Acceptance criteria

- Sale, `[apartment]`, Tashkent with zones and medians: six options in the order new, cheap, expensive, deal, center,
  ppm; daily rent: no `deal`, no `ppm`.
- Before meta loads only three options are shown and no exception is thrown.
- Picking «Сначала дешевле» sends `sort=cheap` and resets the scroll; picking «Сначала новые» sends no `sort`.
- Visual: side by side with the `sort-sheet` baseline (`SCR-016`) — rows, hints, checkmark equal.

## Tests

- Unit (in KV-FE-020's suite): `sortOptions` table (deal × types × city flags × `null` city).
- Component (`SortSheet.test.tsx`): rows and hints per case, radio semantics, pick callback, close paths.

## Edge cases

- The selected sort becomes unavailable while the sheet is open (filters cannot change then) — n/a; on later filter
  changes the fallback of KV-FE-020 applies.
- City object from an old `meta` without `zones`: treated as no zones.

## Security

n/a — local state and labels only.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); side-by-side review of the SCR-016 baseline
recorded in the PR; parity gate G4 for F-FILTER-003 ticked (`15` §4); the `09` row updated; PR reviewed by the other
developer.
