# KV-BE-039 — View history: API-030 and API-031

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-HISTORY-001 |
| Dependencies | KV-BE-036, KV-DB-010 (and the `legacy-reads` / `legacy-lists` limiters of KV-BE-010) |

## Goal

«Смотрели» works on HOMI: `GET /api/history` returns the listings the user opened, most recent first, as one page with
`next_cursor: null`; `DELETE /api/history` clears it; the `viewed` flag of previews comes from the same rows. Recording
on a full open is done by KV-BE-036.

## Legacy reference

- API-030 (`08` §2): `$KVADRO_ROOT/docs/api.md:133`, `:926-941`; client `$KVADRO_ROOT/demo/app/src/lib/api/user.js:26`,
  `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:34-35`; mocks `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:123`,
  `$KVADRO_ROOT/demo/app/tools/parity/mocks-filters.mjs:85`.
- API-031 (`08` §2): `$KVADRO_ROOT/docs/api.md:134`, `:943-945`; client `$KVADRO_ROOT/demo/app/src/lib/api/user.js:29-32`,
  `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:93-103` (confirmation «Очистить историю просмотров?»,
  haptic on error).
- Rules: BR-API-023, BR-API-095, BR-API-100, BR-DATA-017; LB-API-004, LB-API-024, LB-DATA-010; DEV-003; Q-API-009,
  Q-API-035.

## Implementation

1. Read `.claude/skills/laravel-database-optimization/`.
2. Extend `PersonalListService` (`App\Services\Engagement`): `history(User): Collection` ordered by
   `listing_views.last_viewed_at desc`, purged and taken-down listings skipped; `clearHistory(User): void` deletes the
   user's `listing_views` rows only.
3. Cap: `config('history.max_items')` (`HISTORY_MAX_ITEMS`), default `null` = unlimited while DEV-003 / LB-DATA-010 are
   `PROPOSED`; when set, `recordView()` (KV-BE-036) trims the oldest rows beyond the cap in the same transaction and
   `history()` never returns more than the cap.
4. `SavedController@history` and `SavedController@clearHistory` (`App\Http\Controllers\Legacy\SavedController`, created
   by KV-BE-038 or here): `GET api/history` (`throttle:legacy-reads`) → `{"items": ListingPreview[], "next_cursor":
   null}`; `DELETE api/history` (`throttle:legacy-lists`, bodiless) → `204`.
5. `viewed` in `ListingPreviewSerializer` (KV-BE-028) = a `listing_views` row exists for (user, listing); clearing history
   resets `viewed` (Q-API-035 spec).

## Files

- `backend/app/Services/Engagement/PersonalListService.php` (`history()`, `clearHistory()`, cap)
- `backend/app/Http/Controllers/Legacy/SavedController.php`; `backend/routes/legacy.php`; `backend/config/history.php` (new)
- `backend/tests/Feature/LegacyApi/Api030HistoryTest.php`, `backend/tests/Feature/LegacyApi/Api031ClearHistoryTest.php` (new)

## API contract

- API-030: `GET /api/history` → `200 {"items": ListingPreview[], "next_cursor": null}`; the whole list in one page,
  `next_cursor` strictly JSON `null`; the client never sends a cursor. Errors: `403` → «Нет доступа»; others → error state.
- API-031: `DELETE /api/history` (no body) → `204` (body not read; BR-API-020 allows `204` here). Errors: haptic only.
- `Cache-Control: private, no-store`; `401`, `403 <reason>`, `429 {"detail":"rate_limited"}` in the `{detail}` dialect.

## Business rules

- Kept: BR-API-023 (whole list, `next_cursor: null`), BR-API-095 (opening records history and `viewed`), BR-API-100
  (`DELETE` clears history), BR-DATA-017.
- Defect fixes `APPROVED`: LB-API-004.
- DEV-003 `PROPOSED` (v1 pagination and a history cap; legacy keeps one page): cap behind config, tests
  `->todo('DEV-003 PROPOSED')`; trimming migrated history is LB-DATA-010 (decided with DEV-003).
- Q-API-009 (order, cap) and Q-API-035 (which action records) spec-tested.

## Acceptance criteria

- Opening a listing (full `GET`) puts it at the top of `GET /api/history`; re-opening moves it to the top without a
  duplicate.
- `GET /api/history` returns `next_cursor: null` and preview strict keys; after `DELETE /api/history` it returns
  `{"items": [], "next_cursor": null}`; favourites are untouched.
- `viewed: true` appears in previews after an open and disappears after clearing.
- `DELETE` twice → `204` twice (idempotent).

## Tests

- `Api030HistoryTest`: `full_open_adds_to_top` (with KV-BE-036), `reopen_moves_to_top_without_duplicate`,
  `preview_open_not_recorded`, `next_cursor_null_and_strict_keys`, `purged_listing_absent`, `only_own_rows`
  (`15` §3.1 #7), auth/access dataset, `cap_applies_when_configured` + `->todo('DEV-003 PROPOSED')`.
- `Api031ClearHistoryTest`: `clear_returns_204_and_empties_history`, `favourites_untouched`, `viewed_flag_reset`,
  `idempotent_second_delete`, `b_clearing_does_not_touch_a` (`15` §3.1 #6), `bodiless_delete_accepted`.

## Edge cases

- History item merged into another listing: shown once under the survivor (M6 merge re-points; duplicate rows collapse
  with the latest `last_viewed_at`).
- Very long history with no cap configured: still one page (performance measured in KV-QA-020).
- Concurrent open and clear: either order leaves a consistent state (no orphan row with a stale listing).

## Security

- SEC-REQ-014 (owner-scoped reads and deletes), SEC-REQ-006, SEC-REQ-027; history is personal data covered by the
  erasure procedure (KV-BE-050) and contains no texts.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for F-HISTORY-001, docs and the feature row in 09
updated, PR reviewed by the other developer.
