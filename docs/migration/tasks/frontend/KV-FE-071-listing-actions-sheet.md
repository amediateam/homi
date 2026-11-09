# KV-FE-071 — Listing actions sheet: hide, block, report, support

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-HIDE-001, F-HIDE-002, F-REPORT-001 |
| Dependencies | KV-FE-063, KV-FE-013, KV-FE-014; backend KV-BE-040 (API-012/013), KV-BE-041 (API-014/015), KV-BE-043 (API-016), KV-BE-022 (API-003); decisions: DEV-051 `PROPOSED`, DEV-010 `PROPOSED`, FD-2 |

## Goal

The «⋯» sheet (SCR-023) lets the user hide the listing, block its author, report it (rented, realtor, wrong data,
fraud) or write to support; results close the listing where legacy does, hide affected listings from every list of the
session, and show the legacy toasts with «Вернуть» where an undo exists. With DEV-051 approved, a «rented» report gets
an undo too; with DEV-010 approved, the realtor wording stops promising an immediate relabel.

## Legacy reference

- Screen: SCR-023 (`03` §2, results table).
- Code: `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:12-202` (views `menu` / `report`, Back on
  the report view returns to the menu, `busy`, `BLOCK_COUNT_MIN = 20`, support row from API-003, `agent` hidden when
  `is_owner === false`), `$KVADRO_ROOT/demo/app/src/app/useListingActions.js:15-87` (local hide map, close, toasts,
  undo calls and their failure path).
- Rules: BR-APP-036 (moderation effects on the client), BR-APP-037 (block hint count), BR-API-104 (`fraud` hides for
  the reporter, undone with API-013), BR-API-105 (`agent` not offered for `is_owner: false`), BR-API-103 (realtor
  vote, server).
- Deviations: DEV-051 (undo for «rented»), DEV-010 (realtor vote wording, threshold server side); LB-API-042.
- Links: URL-051 (`t.me/<support>?start=l_<id>`), TMA-013.
- Visual baselines (KV-QA-019): `listing-actions` → `SCR-023-*.png`; `listing-hide` → `SCR-042-*.png` (the hide toast).

## Implementation

1. `features/listing/actions/ListingActionsSheet.tsx` on the sheet primitive of KV-FE-013 (drag-to-close, backdrop,
   ×). Views: `menu` (title `actions.title`) and `report` (title `report.title`, a back chevron aria `actions.back`).
   Back handler (KV-FE-025): on `report` → `menu`, on `menu` → close.
2. Menu rows: hide (`actions.hide` / `actions.hideHint`); block (`actions.block` / hint
   `actions.blockHintPhone` with `label` when `author.kind = phone`, `actions.blockHintSource` for a source,
   `actions.blockHint` without an author, plus « — » + plural `actions.blockCount` when `author.count ≥ 20`; the phone
   hint carries the replay-mask class); report (`actions.report` / `actions.reportHint`, chevron) → `report` view;
   support (`actions.support` / `actions.supportHint`) only when API-003 returns `support` → `openLink
   ('https://t.me/<support>?start=l_<id>')` and close.
3. Report rows: `rented`, `agent` (hidden when `details.is_owner === false`), `wrong_data`, `fraud` with
   `report.<reason>` / `report.<reason>Hint`.
4. `runAction`: ignore taps while `busy`; light haptic; on success success haptic + result; on failure error haptic +
   toast `common.saveFailed`.
5. `features/listing/actions/useListingActions.ts` (session state of KV-FE-023):
   - hide → mark `[id]` hidden, close the listing, toast `{text: toast.hidden, action: toast.undo, run: API-013}`;
   - block → mark `unique([id, ...listing_ids])` hidden, close, toast `toast.blocked` with `label`, undo API-015;
   - report `fraud` with `hidden: true` → as hide with `toast.reportedFraud`, undo API-013;
   - report `rented` → mark hidden and close, toast `toast.reportedRented`; **no undo** (legacy) unless DEV-051;
   - report `agent` → toast `toast.reportedAgent`; others → `toast.reported`;
   - undo failure → re-hide and toast `common.saveFailed`.
   The hidden map filters the feed, favourites and the map (KV-FE-048, KV-FE-072, KV-FE-058) for the session.
6. DEV-051 (flag `dev051RentedUndo`): the «rented» toast gets «Вернуть», which unhides (API-013) **and** withdraws the
   user's vote. The legacy surface has no vote-withdrawal route (KV-BE-043 has the `withdraw()` service only): with
   FD-2 = A the flag stays off until a route exists; with FD-2 = B the v1 adapter provides it. Test
   `todo('DEV-051 PROPOSED')`.
7. DEV-010 (flag `dev010RealtorVoteWording`): the `agent` hint and toast switch to the honest wording — new keys (not
   in legacy) `report.agentHintReview` «Проверим номер — если это риелтор, отметим его» and `toast.reportedAgentReview`
   «Спасибо, проверим»; ru copy to be approved with DEV-010, uz/en to be translated (product owner review). Test
   `todo('DEV-010 PROPOSED')`.

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| menu | title `actions.title` «Объявление»; rows `actions.hide` «Скрыть объявление» — `actions.hideHint` «Больше не покажем ни его, ни его копии»; `actions.block` «Заблокировать автора» — `actions.blockHintPhone` «Не показывать объявления с номера {label}» / `actions.blockHintSource` «Не показывать объявления из {label}» / `actions.blockHint` «Не показывать его объявления» (+ « — » `actions.blockCount` «скроет {n} объявлений»); `actions.report` «Пожаловаться» — `actions.reportHint` «Сдано, риелтор, ошибка или обман»; `actions.support` «Написать в поддержку» — `actions.supportHint` «Уже сдано, мошенник или это ваше объявление — разберёмся» |
| report | title `report.title` «Что не так?»; `report.rented` «Уже сдано» — `report.rentedHint` «Объявление больше не актуально»; `report.agent` «Это риелтор, а не хозяин» — `report.agentHint` «Отметим номер как риелторский»; `report.wrong_data` «Неверные данные» — `report.wrong_dataHint` «Цена, район или комнаты не совпадают»; `report.fraud` «Мошенничество или спам» — `report.fraudHint` «Просят предоплату, чужие фото, реклама» |
| busy (disabled) | taps ignored; list dimmed (`busy` class) |
| support loading | support row appears when API-003 answers; hidden on failure |
| success toasts | `toast.hidden` «Объявление скрыто», `toast.blocked` «Автор {label} заблокирован», `toast.reportedFraud` «Спасибо, посмотрим. Это объявление у вас скрыли», `toast.reportedRented` «Отметили: уже сдано», `toast.reportedAgent` «Отметили номер как риелторский», `toast.reported` «Спасибо! Посмотрим»; action `toast.undo` «Вернуть» |
| error | toast `common.saveFailed` «Не получилось сохранить» |

Aria: `common.close` (×), `actions.back` «Назад» (chevron), `actions.menu` «Ещё» (the «⋯» opener in KV-FE-063).

## Interaction

- Opening: light haptic on «⋯». Close: ×, backdrop tap, drag down (start 6 px, close at 25 % or 0.5 px/ms, settle
  200 ms), Telegram Back (report view → menu first), or a successful action.
- Toast with an action lives 6 s, a plain toast 4 s (KV-FE-014); one toast at a time.
- Sheet over the listing layer (z 50), full width up to 608 px, bottom safe-area padding.

## Telegram integration

TMA-022 (two-level Back), TMA-028 (`openTelegramLink` for support), TMA-013 (support deep link), TMA-025 (light,
success and error haptics).

## Storage and analytics

- Storage: none; the hidden map is session memory (`03` §1.11).
- Analytics: none in legacy (LB-APP-037: the sheet and the report view are untracked); keep the event set unchanged.

## Files

- `frontend/app/app/(miniapp)/features/listing/actions/{ListingActionsSheet.tsx,useListingActions.ts,ActionRow.tsx}` (new)
- `frontend/app/lib/deviations.ts` (flags `dev051RentedUndo`, `dev010RealtorVoteWording`)
- `frontend/packages/i18n/src/catalogues/*` (new keys `report.agentHintReview`, `toast.reportedAgentReview`)
- Tests: `frontend/app/tests/listing/{ListingActionsSheet,useListingActions}.test.tsx`, `frontend/app/e2e/listing-actions.spec.ts`

## API contract

- API-012 `POST /api/listings/:id/hide` (no body; response not read) · API-013 `DELETE /api/listings/:id/hide` (undo).
- API-014 `POST /api/listings/:id/block-author` → `200 {"listing_ids": (number|string)[], "label": string}` · API-015
  `DELETE /api/listings/:id/block-author` (undo).
- API-016 `POST /api/listings/:id/report` with `{"reason": "rented"|"agent"|"wrong_data"|"fraud"}` → `200 {"hidden":
  boolean}` for every reason (a `204` would read as failure in legacy; the new client accepts both).
- API-003 `GET /api/bot` (no `Authorization`) → `{username, support}`.
- Errors: any non-2xx or timeout → `common.saveFailed`; `401` / `403` routed by KV-FE-036 / KV-FE-042.

## Business rules

- Kept: BR-APP-036, BR-APP-037, BR-API-104, BR-API-105.
- DEV-051 `PROPOSED` (rented undo; needs a withdrawal route — FD-2), DEV-010 `PROPOSED` (wording; threshold and audit
  are server side, KV-BE-043).

## Acceptance criteria

- Hide closes the listing, removes it from the feed and favourites of the session, and «Вернуть» restores it (one
  API-013); a failing undo re-hides it with «Не получилось сохранить».
- Block hides the listing and every id of `listing_ids`; the toast shows the server `label`; undo calls API-015.
- `agent` is absent for `is_owner: false`; the block hint gets « — скроет 23 объявления» for `count: 23` and nothing
  for 19.
- Back on the report view returns to the menu; Back on the menu closes the sheet, not the listing.
- Taps during a running request do nothing.
- Visual: side by side with the `listing-actions` baseline (menu) and the `listing-hide` toast baseline.

## Tests

- Unit `useListingActions.test.ts`: each result kind → hidden ids, close, toast text, undo call, undo failure path;
  DEV-051 and DEV-010 `todo`s.
- Component `ListingActionsSheet.test.tsx`: hint variants (phone, source, none, count 19/20), support row with and
  without `support`, two-level Back, busy guard, `agent` filter.
- E2E `listing-actions.spec.ts` (contract mocks): hide → toast → undo; report `fraud` with `hidden: true`; API failure.

## Edge cases

- `listing_ids` contains the current id and string ids: de-duplicated by string value.
- The user opens another listing while a report request runs: the result applies to the original id only.
- API-003 slow: the menu renders immediately; the support row appears later without shifting the selected row.
- Report on a listing opened from history: hiding removes it from favourites but history keeps it (legacy:
  `ListingFeed` filters hidden only for the feed and favourites).

## Security

- SEC-REQ-014: every call targets the listing id of the open screen; no client-side author ids are sent.
- SEC-REQ-045: the client never claims a global effect the server did not confirm (DEV-010 wording).
- SEC-REQ-021: `label` and `author.label` rendered as text; phone labels replay-masked (TMA-009).
- SEC-REQ-019: the support link is built from the API-003 username only.

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review of `SCR-023` and `SCR-042`
baselines recorded in the PR; parity gate G4 for F-HIDE-001, F-HIDE-002 and F-REPORT-001 ticked (`15` §4); the feature
rows in `09` updated; PR reviewed by the other developer.
