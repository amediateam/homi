# KV-BE-040 — Hidden listings: API-012 and API-013

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-HIDE-001 |
| Dependencies | KV-BE-018, KV-DB-010 (and the M0 legacy layer: KV-BE-005, KV-BE-007, KV-BE-009, KV-BE-010; exclusion predicate of KV-BE-023) |

## Goal

`POST /api/listings/:id/hide` and `DELETE /api/listings/:id/hide` work on the legacy surface with server-side,
idempotent per-user hiding: a hidden listing disappears at once from the user's feed, count, flow and map, and the
undo returns it — including listings hidden by a `rented` or `fraud` report.

## Legacy reference

- API-012 and API-013 (`08-api-inventory.md:635-683`): bodiless `POST`/`DELETE`, response not read, recommended `204`;
  client `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:47-50`, `:56-59`;
  `$KVADRO_ROOT/demo/app/src/app/useListingActions.js:35-51` (local hide + «Отменить»), `:61-62` (undo after a
  `fraud` report); `$KVADRO_ROOT/demo/app/src/features/settings/HiddenScreen.jsx:53` (return from «Скрытое»);
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:71`; parity mocks
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:178`, `:183-189`.
- Rules: `02-legacy-backend-audit.md:541-565` (§10: BR-API-096, Q-API-036, Q-API-037), `:567-593` (§11: BR-API-104,
  Q-API-038, Q-API-040).
- Defects fixed by policy (`09` §4.3): LB-API-041 (server-side exclusion), LB-API-043 (idempotency), LB-DATA-012
  (unique key). Decision rows: DEV-034 (`PROPOSED`, scope of hide rules), DEV-051 (new client only).
- Bot: «↩️ Не сдано» is assumed to map here (`$KVADRO_ROOT/docs/telegram-bot.md:987`, 🔶) — the bot (M5) calls the
  same service.

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/testing-best-practices/` and the IDOR section of
   `.ai/agents/security-reviewer.md`.
2. `php artisan make:class Services/Engagement/PersonalListService` (or extend it if KV-BE-038 created it first):
   `hide(User $user, Listing $listing, HiddenReason $reason = HiddenReason::Manual): void` — `insertOrIgnore` on
   `hidden_listings (user_id, listing_id, reason, created_at)`, PK `(user_id, listing_id)`; a manual hide over a
   report-induced row keeps the existing row (first reason wins, spec).
   `unhide(User $user, Listing $listing): void` — deletes the row whatever its reason; never touches `listing_votes`
   (Q-API-040 spec: the vote stays; DEV-051 undo of the vote is a new-client feature).
3. `php artisan make:enum Enums/Engagement/HiddenReason --no-interaction` with `Manual`, `ReportRented`, `ReportFraud`
   (values `manual`, `report_rented`, `report_fraud`).
4. `php artisan make:controller Legacy/HiddenListingController --no-interaction` extending `LegacyController`:
   `store()` and `destroy()` resolve the path id through `ListingNumberResolver` (KV-BE-018; an alias resolves to its
   survivor) and return `204`.
5. Register in `routes/legacy.php` inside the `auth:tma` + `legacy.access` group with `throttle:legacy-lists`:
   `POST listings/{number}/hide`, `DELETE listings/{number}/hide` (`whereNumber`), names `legacy.listings.hide`,
   `legacy.listings.unhide`.
6. Make sure `ListingSearchService` (KV-BE-023) reads `hidden_listings` for the current user in feed, count, flow and
   map; add the regression tests here if KV-BE-023 has not.
7. `vendor/bin/pint --dirty --format agent`, `composer types:check`, `make ci-backend`.

## Files

- `backend/app/Services/Engagement/PersonalListService.php` (new or changed)
- `backend/app/Enums/Engagement/HiddenReason.php` (new)
- `backend/app/Http/Controllers/Legacy/HiddenListingController.php` (new)
- `backend/routes/legacy.php` (changed)
- `backend/tests/Feature/LegacyApi/Api012HideTest.php`, `Api013UnhideTest.php` (new)
- `backend/tests/Feature/Pgsql/HiddenListingRaceTest.php` (new, `pgsql` group)

## API contract

- `POST /api/listings/:id/hide` — `Authorization: tma <initData>`; path `id` = positive integer listing number; no
  body, no `Content-Type`. Response `204` (no body). The client ignores the body; any non-2xx shows «Не получилось
  сохранить» (`useListingActions.js:82`).
- `DELETE /api/listings/:id/hide` — same input; response `204`; a listing that is not hidden → `204` (no-op).
- Errors (legacy dialect): unknown, malformed or purged-to-nothing number → `404 {"detail":"Not Found"}`; no or
  invalid `initData` → `401 {"detail":"unauthorized"}`; gated user → `403 {"detail":"<reason>"}`; over the limiter →
  `429 {"detail":"rate_limited"}` + `Retry-After`. Never an empty `200` (BR-API-020).

## Business rules

- Keep: BR-API-096 (only this user, undoable), BR-API-104 (undo of a `fraud` hide through this route), BR-API-020
  (`204` allowed here), BR-DATA-017 (per-user set).
- Defect fixes `APPROVED` (asserted now): LB-API-041 (excluded server-side from feed, count, flow, map), LB-API-043
  (repeat = no error, no duplicate), LB-DATA-012 (unique key).
- `PROPOSED`, not applied: DEV-034 (user-wide hide rules shared with the bot) — radar hide rules are untouched here;
  DEV-051 (vote undo) — new client only.

## Acceptance criteria

- Hide → `204`; the listing is in `GET /api/hidden.listings` (KV-BE-042) and absent from feed, count, map and flow for
  this user only; another user still sees it.
- A second identical `POST` → `204` and still one row.
- Unhide → `204`; the listing is back in the feed; unhide again → `204`.
- After a `fraud` report with `{"hidden": true}` (KV-BE-043) the undo restores the listing and the `fraud` vote row
  remains.
- An alias number hides the survivor.

## Tests

- `Api012HideTest`: hide → `204`, row with reason `manual`; repeat → one row; unknown number, `0`, `abc`, `2^53` →
  `404 {"detail":"Not Found"}`; no auth → `401`; `blocked` user → `403 {"detail":"blocked"}`; alias → survivor row;
  feed/count/map exclusion (`15` §3.7 #3); contract case from KV-QA-002 via KV-QA-004 (`204`, no body).
- `Api013UnhideTest`: unhide existing → `204`, row gone; unhide absent → `204`; unhide of a `report_fraud` row →
  row gone, vote kept; unhide of a `report_rented` row → same.
- IDOR (`15` §3.1 #6): user B hides and unhides listing L → A's rows unchanged (fingerprint before/after).
- `HiddenListingRaceTest` (`pgsql`, KV-QA-008): 10 concurrent hides of one (user, listing) → one row, no `500`
  (`15` §3.4 #4).
- Limiter: the 61st write in a minute → `429 {"detail":"rate_limited"}` (SEC-REQ-027).

## Edge cases

- Listing withdrawn or taken down after it was hidden: unhide still deletes the row (`204`); feed exclusion is moot.
- Hide of a listing that a merge later aliases: the row is re-pointed by the merge listener (M6, `ListingsMerged`);
  here the alias resolution path is tested.
- Bodiless request with `Content-Length: 0` and no `Content-Type` — accepted (`08` §1.3).
- A path id with a leading `+` or spaces — `404`.

## Security

- SEC-REQ-014: rows are written and deleted only for `auth()->user()`; there is no way to name another user.
- SEC-REQ-015: idempotent upsert per (user, listing).
- SEC-REQ-006: gate applies; SEC-REQ-027 `legacy-lists` 60/min per user.
- SEC-REQ-017: path id positive integer < 2^53. No PII involved.

## Definition of done

Tests green (`make ci-backend` and the `pgsql` group), parity gate items G3, G5–G8 for F-HIDE-001 ticked with
evidence (`15` §4), API-012 and API-013 contract cases real (not `todo`) in KV-QA-004, the F-HIDE-001 row in `09`
updated, PR reviewed by the other developer.
