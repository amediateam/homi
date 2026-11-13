# KV-FE-073 — History «Смотрели»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-HISTORY-001 |
| Dependencies | KV-FE-072, KV-FE-014; backend KV-BE-039 (API-030, API-031); decisions: DEV-003 `PROPOSED`, DEV-016 `PROPOSED`, Q-API-035 |

## Goal

The «Смотрели» sub-tab (SCR-025) shows the server list of opened listings, refreshed whenever the user opened a new
listing in this session, and offers «Очистить» with a confirmation; a failed clear tells the user so (DEV-016) instead
of only vibrating.

## Legacy reference

- Screen: SCR-025 (`03` §2); shared states SCR-008, SCR-009 (history empty); confirm SCR-043.
- Code: `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:93-113` (confirm, `clearHistory`, success / error
  haptic, tool row only with items), `:120` (no viewed eye in history), `$KVADRO_ROOT/demo/app/src/app/App.jsx:516` (list
  key `history-<seen count>`), `$KVADRO_ROOT/demo/app/src/lib/api/user.js:26-32`.
- Rules: BR-APP-067 (confirmation, server clear, no undo), BR-APP-040 (no viewed eye here), BR-API-095 (a view is
  recorded on open, UNVERIFIED, Q-API-035), BR-API-100.
- Defects and deviations: LB-APP-022 (single page, fixed with KV-FE-072), LB-APP-027 → DEV-016 (error toast), DEV-003
  (history cap and v1 pagination), LB-DATA-010 (trimming migrated history is visible).
- Integration: TMA-026 (`showConfirm` 6.2+, else `window.confirm`), TMA-025.
- Visual baseline (KV-QA-019): `x-history` → `SCR-025-*.png`.

## Implementation

1. `features/saved/HistoryList.tsx` on the single-page list renderer of KV-FE-072: one request API-030; `next_cursor`
   ignored by design; the viewed eye is never shown (`viewed = false` for every card here).
2. List key = `history-<number of ids in the session seen map>` so a listing opened in this session appears after
   returning to the tab (legacy behaviour; the server records the view, BR-API-095).
3. Tool row above the list, only when items exist: text button with the trash icon `feed.clear` «Очистить».
4. Clear flow: `confirm(t('feed.clearConfirm'))` through KV-FE-014 (TMA-026); on OK → `DELETE /api/history` →
   clear the list, success haptic; on failure → error haptic and, with the DEV-016 flag of KV-FE-014 on, toast
   `common.saveFailed`; on cancel nothing happens.
5. Favourite toggles and hidden-listing filtering behave as in legacy: history shows every returned item (hidden
   listings are not filtered here, `ListingFeed.jsx:81-86`).
6. DEV-003 (flag `dev003PaginatedLists` of KV-FE-072): with FD-2 = B v1 cursor pagination; the history cap itself is
   server side (KV-BE-039, `HISTORY_MAX_ITEMS`). Test `todo('DEV-003 PROPOSED')`.

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| loading | 3 card skeletons |
| success | cards, no viewed eye; tool row `feed.clear` «Очистить» |
| empty | shrug mascot, `feed.histEmpty` «Вы ещё ничего не открывали», `feed.histEmptyHint` «Здесь будут объявления, которые вы смотрели»; no tool row |
| confirm | native dialog with `feed.clearConfirm` «Очистить историю просмотров?» |
| clearing (disabled) | the tool button is disabled until the request settles |
| clear failed | error haptic; with DEV-016: toast `common.saveFailed` «Не получилось сохранить» |
| error, no items / with items / 403 | as KV-FE-072 (`ErrorState`, `feed.retry`, `common.noAccess`) |

`feed.historyHint` «Последние открытые — сверху» is a dead key in legacy (`03` §3.1) and stays unused.

## Interaction

- Tap a card → listing; heart toggles as on the feed.
- «Очистить» → confirm → clear; no undo (BR-APP-067).
- Pull-to-refresh re-creates the list (KV-FE-046).
- Layout as KV-FE-072; the tool row is right-aligned above the first card.

## Telegram integration

TMA-026 (`showConfirm` with the version gate 6.2, `window.confirm` fallback), TMA-025 (success / error haptics),
SCR-043 (confirm dialog).

## Storage and analytics

- Storage: none.
- Analytics: `$pageview` `saved/history` on entering the sub-tab (`03` §3.3); no event for clearing (legacy).

## Files

- `frontend/app/app/(miniapp)/features/saved/HistoryList.tsx` (new)
- Tests: `frontend/app/tests/saved/HistoryList.test.tsx`, `frontend/app/e2e/history.spec.ts`

## API contract

- API-030 `GET /api/history` (no cursor) → `200 {"items": ListingPreview[], "next_cursor": null}`; errors as API-029.
- API-031 `DELETE /api/history` → response not read (`204` recommended); any non-2xx → failure path.
- Whether clearing also resets `viewed` on feed items is server behaviour (Q-API-035); the client clears only its list.

## Business rules

- Kept: BR-APP-067, BR-APP-040, BR-API-095, BR-API-100.
- LB fix `APPROVED`: LB-APP-022 (via KV-FE-072).
- DEV-016 `PROPOSED` (error toast; flag of KV-FE-014, test `todo('DEV-016 PROPOSED')`), DEV-003 `PROPOSED`.

## Acceptance criteria

- Opening a listing from the feed and returning to «Смотрели» re-fetches the history once.
- «Очистить» shows the confirm text; OK sends one API-031 and empties the list with the empty state; Cancel sends nothing.
- A failing API-031 keeps the list; with DEV-016 on, «Не получилось сохранить» appears.
- No viewed eye on any history card; the tool row is absent for an empty list.
- Visual: side by side with the `x-history` baseline.

## Tests

- Component `HistoryList.test.tsx`: key change on `seen` growth triggers one refetch; clear OK / cancel / failure;
  DEV-016 and DEV-003 `todo`s; empty state.
- E2E `history.spec.ts` (contract mocks, fake `showConfirm`): open listing → back → history shows it → clear.

## Edge cases

- Telegram < 6.2: `window.confirm` is used (Desktop and old clients).
- Clearing while a listing opened from history is still in the layer stack: the open listing stays; the list behind it
  empties.
- The server cap (DEV-003, LB-DATA-010) trims old items: the client shows what it gets; no client limit.

## Security

- SEC-REQ-014: the requester's own history only; API-031 affects only the requester.
- SEC-REQ-021: card strings as text (KV-FE-047).

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review against the `SCR-025`
baseline recorded in the PR; parity gate G4 for F-HISTORY-001 ticked (`15` §4); the feature row in `09` updated; PR
reviewed by the other developer.
