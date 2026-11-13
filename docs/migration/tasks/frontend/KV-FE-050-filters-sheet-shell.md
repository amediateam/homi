# KV-FE-050 — Filters sheet: shell, footer, live count and flow

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FILTER-001, F-FILTER-005 |
| Dependencies | KV-FE-013 (sheet primitive, drag, body lock), KV-FE-014 (toast, second in-sheet instance), KV-FE-020 (filter model, reset, `sameFilters`); backend KV-BE-032 (API-005, API-006); decisions: DEV-018 and DEV-021 `PROPOSED` (flags owned by KV-FE-020 and KV-FE-018), Q-APP-005 |

## Goal

The full filters sheet (SCR-014) exists as a frame that hosts the 16 sections of KV-FE-051…KV-FE-054 in legacy order,
keeps a draft copy of the filters, shows a live result count and the radar flow forecast with relax chips, and ends in
«Показать N» / «Включить радар» (search mode) or «Сохранить» (radar create/edit modes used by KV-FE-078).

## Legacy reference

- SCR-014 (`03` §2), SCR-029 and SCR-030 differences; `$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:54-261`
  (draft state `:68-80`, focus scroll `:83-94`, chrome `:101-111`, section order `:194-229`, footer `:230-243`, tip
  toast `:244-248`, nested city picker `:250-257`); `sheet/SheetFooter.jsx:14-71`; `useLiveFeedStats.js:12-45`;
  `sheet/useSheetChrome.js:8-34`.
- App wiring: `$KVADRO_ROOT/demo/app/src/app/App.jsx:166-171` (`GET /api/cities` on open), `:385-392` (`applyFromSheet`),
  `:393-402` (`drawFromSheet`), `:314-324` (`applyFilters`); `?news=pets` focus `useAppBootstrap.js:115-124`.
- Rules: BR-APP-022 (reset), BR-APP-012 (same filters → «Радар включён»), BR-APP-041 (subscribe, entry `filters`),
  BR-APP-044 (flow wording), BR-APP-057 (`?news=pets` focus). Defects: LB-APP-030 → DEV-018, LB-APP-033 → DEV-021,
  LB-APP-006 (empty flow response) handled by the normaliser.
- Visual baseline (KV-QA-019): `filters-sheet` → `SCR-014-*.png`.

## Implementation

1. `frontend/app/app/(miniapp)/features/filters/FiltersSheet.tsx` with `mode: 'search' | 'create' | 'edit'`, `initial`
   filters, `onApply`, `onSubscribe(filters, relaxed?)`, `onSave(filters, relaxed?)`, `onDraw(filters)`, `focus?`.
   Built on the full-height sheet of KV-FE-013: sticky header (× aria `common.close`, title, «Сбросить»), scrollable
   body with a shadow when scrolled, sticky footer; header and footer heights written to `--fsheet-head` /
   `--fsheet-foot` with a `ResizeObserver`; `body.locked` while open; Back handler; drag-to-close from the header;
   backdrop tap closes.
2. Title: `sheet.title` (search), `sheet.createTitle` (create), `sheet.editTitle` (edit).
3. Draft state: the sheet edits a copy; `update(patch)` merges; nothing reaches the feed until apply. Section
   components receive `{filters, update, meta, stats, city}`; order: deal, city, housing, rent term, rooms, price,
   where, who, tenant, pets, furniture, renovation, floor, area + market (sale) **or** appliances (rent), posted
   (search mode only).
4. Reset: `resetFilters(filters)` of KV-FE-020 — defaults of the base deal and current city (legacy leaves daily rent,
   LB-APP-030); with flag `dev018ResetKeepsDaily` on, the current deal including daily (DEV-018).
5. Live stats (KV-FE-021 with `AbortSignal`): `GET /api/feed/count` 250 ms after any draft change, `GET /api/feed/flow`
   500 ms after; each change aborts the pending request; errors keep the previous value. The flow response is
   normalised to `null` unless it is an object with numeric `week` and `days > 0` (LB-APP-006 guard).
6. Footer:
   - flow line from the flow formatter of KV-FE-018 (`sheet.flowNone` / `sheet.flowWeek` / `sheet.flowDay`;
     DEV-021 flag switches to the shared vocabulary);
   - relax chips `«{label} · {rate}»` from `flow.options[]`: tap → light haptic, replace the draft with
     `option.filters`, remember `relaxed = option.code`;
   - search mode: secondary «Включить радар» (RadarIcon) or ✓ `head.followOn` «Радар включён» when an **active** radar
     has the same filters (`sameFilters`, BR-APP-012), disabled while submitting; primary `sheet.show` /
     `sheet.showN` / `sheet.nothing` from the count;
   - create/edit mode: `sheet.matchingNow` «Сейчас подходит: {n}» and one primary button (`sheet.save`, or
     `sheet.subscribe` in create mode), disabled while submitting.
7. Apply (search): medium haptic; if the city changed, `kv-city` + `PUT /api/settings {city}`; close; apply to the
   feed (scroll to top, set the follow-nudge candidate of KV-FE-080, reset an unavailable sort).
8. Draw: «Обвести на карте» (KV-FE-053) → save the city if changed, close, set the filters, switch to the map and
   start drawing (KV-FE-060).
9. Subscribe / save → KV-FE-074 (`subscribe(filters, 'filters', relaxed)`) or the editor of KV-FE-078; the sheet closes
   on success.
10. On open, refresh city stats (`GET /api/cities`, errors ignored). `focus` scrolls the `[data-focus]` section into
    view 350 ms after opening (smooth, centred).
11. Host the nested city picker (KV-FE-044 `variant="nested"`) and the in-sheet toast for tips (KV-FE-014).

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| header | always | `sheet.title` «Фильтры» / `sheet.createTitle` «Новый радар» / `sheet.editTitle` «Условия радара», `sheet.reset` «Сбросить» |
| count loading | first 250 ms / request pending | `sheet.show` «Показать» (no number) |
| count | `count > 0` | `sheet.showN` «Показать {n}» |
| count zero | `count = 0` | `sheet.nothing` «Ничего нет» |
| count (radar modes) | count known | `sheet.matchingNow` «Сейчас подходит: {n}» (empty while unknown) |
| flow none | `week = 0` | `sheet.flowNone` «📡 За неделю таких не было — радар будет срабатывать редко» |
| flow week | `week / days < 1` | `sheet.flowWeek` «📡 Радар: {n} за неделю» |
| flow day | otherwise | `sheet.flowDay` «📡 Радар: ≈{n} в день» (rounded) |
| flow error / absent | request failed or normalised to `null` | no flow line, no relax chips |
| relax chips | `options` non-empty | `«{label} · {rate}»` (server strings) |
| followed | active identical radar | `head.followOn` «Радар включён» with ✓ |
| subscribe | otherwise | `sheet.subscribe` «Включить радар» |
| submitting (disabled) | request in flight | subscribe / save disabled |
| save | edit mode | `sheet.save` «Сохранить» |

## Interaction

- Gestures: drag down on the header (6 px start, close at 25 % or 0.5 px/ms, 200 ms settle); the body scrolls; chip
  strips scroll horizontally without starting the drag; backdrop tap closes.
- Animation: `rise` entrance; the footer flow line appears without layout jump (min height reserved).
- Haptics: medium on apply/save; light on relax chip and on section toggles (sections own theirs).
- Responsive: full-height sheet on phones with safe-area insets; max column 608 px centred in Telegram Desktop.
- Pull-to-refresh and the collapsing chrome are disabled while the sheet is open (KV-FE-045, KV-FE-046).

## Telegram integration

TMA-022 (Back closes the sheet; the nested city picker is above it in the stack), TMA-025 (haptics), TMA-023 (the
Settings button closes the filters sheet through KV-FE-025).

## Storage and analytics

- Storage: `kv-city` on apply/draw when the city changed; `kv-new-pets` written by the pets section (KV-FE-054).
- Analytics: `$pageview filters` (search mode), `radar/new` (create), `radar/edit` (edit) — names reported to
  KV-FE-035; the nested city picker keeps `filters`.

## Files

- `frontend/app/app/(miniapp)/features/filters/{FiltersSheet,SheetFooter}.tsx`, `useLiveFeedStats.ts` (new)
- `frontend/app/app/(miniapp)/features/filters/useSheetChrome.ts` (if not covered by KV-FE-013)
- `frontend/app/tests/filters/{FiltersSheet,useLiveFeedStats}.test.tsx`, `frontend/app/e2e/filters.spec.ts`

## API contract

- API-005 `GET /api/feed/count?<FilterQuery>` → `200 {"count": number}`; errors ignored.
- API-006 `GET /api/feed/flow?<FilterQuery>` → `200 {"week": number, "days": number, "options"?: [{"code", "label",
  "rate", "filters": SearchFilters}]}`; errors ignored; `options[].count` unread.
- API-002 `GET /api/cities` on open; API-025 `PUT /api/settings {"city"}` on apply/draw when changed.
- Subscribe/save requests belong to KV-FE-074 / KV-FE-078.

## Business rules

- Kept: BR-APP-012, BR-APP-022, BR-APP-041, BR-APP-044, BR-APP-057.
- Defect fix `APPROVED` (policy): LB-APP-006 guard on the flow response.
- DEV-018, DEV-021 `PROPOSED` (flags in KV-FE-020 / KV-FE-018; tests `todo('DEV-018 PROPOSED')`,
  `todo('DEV-021 PROPOSED')`).

## Acceptance criteria

- Opening the sheet requests `/api/cities`; changing three chips within 200 ms sends exactly one `/api/feed/count`
  (250 ms after the last change) and one `/api/feed/flow` (500 ms), earlier ones aborted.
- The footer shows «Показать», then «Показать 37», «Ничего нет» for 0; «📡 Радар: ≈3 в день» for `{week: 21, days: 7}`
  and «📡 Радар: 4 за неделю» for `{week: 4, days: 7}`.
- A relax chip replaces the draft and the next radar save carries its `code` as `relaxed`.
- Closing without apply leaves the feed unchanged; apply re-creates the feed with the draft.
- `?news=pets` opens the sheet scrolled to the pets section after 350 ms.
- Visual: side by side with the `filters-sheet` baseline (`SCR-014`) — header, section order, footer buttons and flow
  line equal.

## Tests

- Unit (`useLiveFeedStats.test.ts`, fake timers): debounce 250/500 ms, abort on change, error keeps the old value, flow
  normalisation (`undefined`, `204`, `{}` → `null`).
- Component (`FiltersSheet.test.tsx`): three modes (title, footer, posted section presence), followed state, relax
  chip, reset (legacy) and DEV-018 `todo`.
- E2E (`filters.spec.ts`): open → change rooms → count updates → «Показать N» → feed re-created; draw → map in drawing
  mode; `?news=pets` focus.

## Edge cases

- Flow returns `{week: 0, days: 7}` → «За неделю таких не было…», no division.
- Count request aborted on close: no state update after unmount.
- City stats missing for the city: rent-term section and typical price hidden (sections handle it).
- The Settings button while the sheet is open closes it (KV-FE-025, LB-APP-046 fix).

## Security

- SEC-REQ-017: the client sends only the 25 known keys built by KV-FE-019; relax `option.filters` from the server are
  re-normalised before use.
- SEC-REQ-021: relax labels and rates are server strings rendered as text.

## Definition of done

`make ci-frontend` green; unit, component and E2E tests green (or added when KV-FE-010 lands); side-by-side review of
the SCR-014 baseline recorded in the PR; parity gate G4 for F-FILTER-001 and F-FILTER-005 ticked (`15` §4); the `09`
rows updated; PR reviewed by the other developer.
