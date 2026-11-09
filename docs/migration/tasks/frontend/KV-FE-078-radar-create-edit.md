# KV-FE-078 — New radar and radar editor sheets

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-RADAR-002, F-RADAR-003 |
| Dependencies | KV-FE-050…KV-FE-054 (filters sheet and its sections), KV-FE-074 (radar actions); backend KV-BE-103 (API-019, API-020), KV-BE-032 (API-005, API-006 live count and flow), KV-BE-105 (API-023); decisions: DEV-005, DEV-006 `PROPOSED`; Q-APP-006, Q-API-031 |

## Goal

The full filters sheet runs in two radar modes: **create** (SCR-030, «Новый радар», button «Включить радар», opened from
«+» or the empty state, starting from the current search filters) and **edit** (SCR-029, «Условия радара», «Сейчас
подходит: N» and «Сохранить», starting from the radar's filters). Both hide «Опубликовано», keep the live count, flow
line and relax chips, save through the shared radar actions and never report a failure after a successful save
(LB-APP-005).

## Legacy reference

- SCR-029, SCR-030 (`03` §2); mode switch in `$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:38-50`,
  `:142-160`, `:186` (title), `:228` (posted section only without `onSave`), `:232-233` (footer).
- Footer: `$KVADRO_ROOT/demo/app/src/features/filters/sheet/SheetFooter.jsx:1-45` (`FlowHint`, `SaveActions`).
- Wiring: `$KVADRO_ROOT/demo/app/src/app/App.jsx:560-602` (editor with `editingSub.filters`, create sheet with the
  search filters, `subscribe(next, 'empty', relaxed)` closes the sheet only on success).
- Toasts: `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:94-180` (KV-FE-074).
- Rules: BR-APP-021 (no «Опубликовано» in radar modes), BR-APP-041, BR-APP-042, BR-APP-012.
- Defects: LB-APP-005 (create sheet stays open after a successful save); LB-API-026 → DEV-005; LB-API-027 → DEV-006.
- Visual baselines: KV-QA-019 scenario `radar-edit-save` (before saving) → `docs/migration/visual-baseline/SCR-029-*.png`;
  SCR-030 has no baseline — compare with `filters-sheet` (SCR-014) plus the create-mode differences listed here.

## Implementation

1. Extend the sheet of KV-FE-050 with a `mode: 'search' | 'radarCreate' | 'radarEdit'` prop instead of the legacy
   callback-presence switch; sections come from KV-FE-051…KV-FE-054 unchanged, except that `PostedSection` is not
   rendered in radar modes.
2. Title: `sheet.title` (search), `sheet.createTitle` «Новый радар» (create), `sheet.editTitle` «Условия радара» (edit).
3. Footer in radar modes: the flow line and relax chips of KV-FE-050 (a relax chip replaces the draft with
   `option.filters` and remembers `relaxed = option.code`), then the count line `sheet.matchingNow` «Сейчас подходит: {n}»
   (empty while unknown) and one primary button — `sheet.subscribe` «Включить радар» (create) or `sheet.save`
   «Сохранить» (edit); medium haptic on tap; disabled while submitting.
4. Create: `actions.subscribe(draft, 'empty', relaxed)` (KV-FE-074); `ok: true` → close the sheet, bump `subsVersion`,
   show the returned toast; `ok: false` → keep the sheet open with the draft. LB-APP-005 fixed because a `2xx` is always
   `ok: true`.
5. Edit: `actions.saveEdit(radar.id, draft, relaxed)`; success → close, bump `subsVersion`, toast; failure → keep open.
6. Opening: create starts from the current search filters (`filters` of the search tab, including the city); edit starts
   from `radar.filters` normalised by KV-FE-019. Both open over the radar tab (create may also open over the empty state)
   and register their Back handler through the sheet primitive.
7. DEV-005 (flag `dev005RadarDropsPostedDays`): when on, the draft's `posted_days` is reset to `null` on open in radar
   modes, so a value inherited from the search is neither shown nor sent; off → kept and sent (legacy; the section is
   hidden either way).
8. DEV-006 (`PROPOSED`, money): on the legacy transport the price bounds stay USD numbers (UZS input converted by the
   price section of KV-FE-052, `max(1, round(value·10⁶ / rate))`); with FD-2 = B the editor would send the bound with its
   entered currency — out of scope until FD-2 and DEV-006 are decided.

## States and texts

| State | Texts (keys, ru) / behaviour |
| ----- | ---------------------------- |
| create title | `sheet.createTitle` «Новый радар» |
| edit title | `sheet.editTitle` «Условия радара» |
| count loading | count line empty |
| count | `sheet.matchingNow` «Сейчас подходит: {n}» |
| flow | `sheet.flowDay` «📡 Радар: ≈{n} в день» / `sheet.flowWeek` «📡 Радар: {n} за неделю» / `sheet.flowNone` «📡 За неделю таких не было — радар будет срабатывать редко» (DEV-021 vocabulary via KV-FE-018 when approved) |
| relax chips | `{option.label} · {option.rate}` (server strings) |
| submit | `sheet.subscribe` «Включить радар» / `sheet.save` «Сохранить» |
| submitting (disabled) | button disabled, no spinner (legacy) |
| success | sheet closes; toast from KV-FE-074 (`toast.subSaved…`, `toast.subUpdated…`, `toast.alreadyOn`, `toast.alertOn`) |
| error | sheet stays open; toast `toast.noChat`, `toast.subLimit` (create) or `common.saveFailed` |
| reset | `sheet.reset` «Сбросить» → defaults of the base deal and city (BR-APP-022; DEV-018 via KV-FE-050) |

## Interaction

- Close: ×, backdrop, drag down, Telegram Back; a successful save. Unsaved drafts are dropped (legacy; no closing
  confirmation, TMA-039).
- Live count 250 ms and flow 500 ms after each change, in-flight requests aborted (KV-FE-050).
- Layout and gestures as the filters sheet (sticky header and footer, `body.locked`).

## Telegram integration

TMA-022 (Back closes the sheet), TMA-033 (write access through KV-FE-074 / KV-FE-030), TMA-025 (medium haptic on submit).

## Storage and analytics

- Storage: none (`kv-new-pets` only through the pets section).
- `$pageview radar/new` (create) and `$pageview radar/edit` (edit) — legacy screen names, precedence
  `listing > radar/edit > radar/new > filters` (`03` §1.1).

## Files

- `frontend/app/app/(miniapp)/features/filters/FiltersSheet.tsx` (mode prop; from KV-FE-050)
- `frontend/app/app/(miniapp)/features/filters/sheet/SaveActions.tsx` (new)
- `frontend/app/app/(miniapp)/features/radar/RadarCreateSheet.tsx`, `RadarEditSheet.tsx` (thin wrappers, new)
- `frontend/app/tests/radar/RadarSheets.test.tsx`, `frontend/app/e2e/radar-create-edit.spec.ts`

## API contract

- API-019 `POST /api/subscriptions` `{"filters": SearchFilters, "entry": "empty", "relaxed"?: string}` → `200
  SubscriptionMutationResult`.
- API-020 `PUT /api/subscriptions/:id` `{"filters": SearchFilters, "relaxed"?: string}` → `200
  SubscriptionMutationResult`; `409 no_chat` before any change; `409 duplicate` (the edit would create a twin, DEV-009)
  → `toast.alreadyOn`; `404` (radar gone) → `common.saveFailed` and a list reload.
- API-023 `POST /api/subscriptions/:id/relax` from the «Расширить» toast action (KV-FE-074).
- API-005 / API-006 for the footer (KV-FE-050).

## Business rules

- Kept: BR-APP-021, BR-APP-041, BR-APP-042, BR-APP-012 (`posted_days` ignored when comparing).
- Defect fix `APPROVED` (policy): LB-APP-005.
- DEV-005, DEV-006 `PROPOSED` (above); DEV-018 and DEV-025 apply through the shared sections (KV-FE-050, KV-FE-052).

## Acceptance criteria

- Create mode shows «Новый радар», no «Опубликовано» section, «Сейчас подходит: N» and «Включить радар»; edit mode shows
  «Условия радара» and «Сохранить».
- A create answered `200` with `starter: 0` and no `relaxed` closes the sheet and shows «Радар включён — новые придут в
  чат, как только появятся» (LB-APP-005 regression).
- Choosing a relax chip and saving sends `relaxed` with the option code; saving without one omits the key.
- Visual: edit mode side by side with the `radar-edit-save` baseline (ru light); create mode against `filters-sheet` with
  the listed differences.

## Tests

- Component: titles and buttons per mode; posted section absent in radar modes; count line empty/loaded; submit disabled
  while pending; `todo('DEV-005 PROPOSED')`.
- E2E (contract mocks): create from «+» → toast and closed sheet; create with `no_chat` granted; create at the limit
  (`409 subscription_limit`) keeps the sheet; edit → «Радар обновлён…»; edit with `few` result → «Расширить» → relax
  request.

## Edge cases

- The radar's stored filters carry a type the current deal does not allow → normalised by KV-FE-019 on open; the user
  sees the corrected selection.
- City list changed and the radar's city is unknown → city field shows the code; save still sends it (server validates).
- The editor is open while the Settings button is pressed → closed by the navigation reset (KV-FE-025).

## Security

- SEC-REQ-017 (filters normalised before sending), SEC-REQ-014 (radar id from the user's list), SEC-REQ-021 (server
  `label`/`rate` strings rendered as text).

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); visual review of `SCR-029` (and SCR-030 against
SCR-014) recorded in the PR; parity gate G4 for F-RADAR-002 and F-RADAR-003 ticked (`15` §4); rows in `09` updated; PR
reviewed by the other developer.
