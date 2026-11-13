# KV-BE-041 — Blocked authors: API-014 and API-015

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-HIDE-002 |
| Dependencies | KV-BE-018, KV-DB-010, KV-DB-008 (and the M0 legacy layer: KV-BE-005, KV-BE-007, KV-BE-009, KV-BE-010; exclusion predicate of KV-BE-023) |

## Goal

A user blocks the author of a listing — by phone, or by source channel when the listing has no phone — and every
listing of that author disappears from their results; `DELETE` on the same listing undoes it. Each block is an entry
with a stable public integer `number` so «Скрытое» (KV-BE-042) and migrated sessions can address it.

## Legacy reference

- API-014 and API-015 (`08-api-inventory.md:637-685`): client `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:65-68`,
  `:74-77`; `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:79-85`;
  `$KVADRO_ROOT/demo/app/src/app/useListingActions.js:52-60` (spread of `listing_ids`, undo); toast «Автор {label}
  заблокирован» (`$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:203`); masked label in
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:187`; `$KVADRO_ROOT/docs/api.md:657-673`.
- Rules: `02-legacy-backend-audit.md:516-540` (BR-API-097, BR-API-098, BR-API-099, Q-API-036, Q-API-038);
  `$KVADRO_ROOT/docs/about.md:227` (block by phone or channel).
- Data: ENT-017, ENT-030 (`06` §2.3–§2.4, §4.2 `blocked_authors`, `listing_authors`); entry ids preserved by the
  migration (`14` §3, KV-DB-020).
- Fixes by policy (`09` §4.3): LB-API-040 (two unblock routes kept as aliases), LB-API-041, LB-API-043, LB-DATA-012.

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/laravel-database-optimization/` and
   `.ai/agents/security-reviewer.md` (PII rules for phones).
2. In `App\Services\Engagement\PersonalListService` add `blockAuthor(User, Listing): BlockResult` and
   `unblockAuthorOf(User, Listing): void`. The author is `listing.author_id` (`listing_authors.kind` `phone` when the
   listing has a phone HMAC, else `source` = channel, BR-DATA-028). A listing without any author → `404` (spec).
3. Insert `blocked_authors (id ULID, number, user_id, author_id, created_at)` with `insertOrIgnore` on the unique
   `(user_id, author_id)`; `number` comes from `blocked_authors_number_seq` (KV-DB-010, CF-003). A repeat returns the
   existing entry.
4. `BlockResult` = the author's active listing numbers (status `active`, not taken down) and the label:
   `php artisan make:class Services/Engagement/AuthorLabel` — phone → `+998 ** *** ** 67` (last two digits only,
   from the decrypted number; never the full number), source → `@<channel handle>`. The label is plain text.
5. `php artisan make:controller Legacy/BlockedAuthorController --no-interaction` (`store`, `destroy`) extending
   `LegacyController`; resolve the number through `ListingNumberResolver` (KV-BE-018).
6. Routes in `routes/legacy.php` (`auth:tma`, `legacy.access`, `throttle:legacy-lists`):
   `POST listings/{number}/block-author`, `DELETE listings/{number}/block-author`.
7. Confirm KV-BE-023 excludes listings whose `author_id` is in the user's `blocked_authors` from feed, count, flow and
   map (LB-API-041); add the regression test here.
8. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/app/Services/Engagement/PersonalListService.php` (changed)
- `backend/app/Services/Engagement/AuthorLabel.php`, `backend/app/Domain/Engagement/BlockResult.php` (new)
- `backend/app/Http/Controllers/Legacy/BlockedAuthorController.php` (new)
- `backend/routes/legacy.php` (changed)
- `backend/tests/Feature/LegacyApi/Api014BlockAuthorTest.php`, `Api015UnblockAuthorTest.php` (new)
- `backend/tests/Unit/Engagement/AuthorLabelTest.php` (new)

## API contract

- `POST /api/listings/:id/block-author` — no body. `200 {"listing_ids": [<integer>, …], "label": "<string>"}`.
  `listing_ids` is always an array of JSON integers (the client spreads it, `useListingActions.js:55`); it may omit
  `:id`; `label` is a masked phone or `@channel`. A repeated call returns the same body.
- `DELETE /api/listings/:id/block-author` — no body; `204`; a listing whose author is not blocked → `204`.
- Errors: unknown number or a listing without author → `404 {"detail":"Not Found"}`; `401 {"detail":"unauthorized"}`;
  `403 {"detail":"<reason>"}`; `429 {"detail":"rate_limited"}`. Any error makes the client show «Не получилось
  сохранить».

## Business rules

- Keep: BR-API-097 (all the author's listings hidden for this user), BR-API-098 (response lists them with a label),
  BR-API-099 (entry appears in `GET /api/hidden.authors`), BR-DATA-017, BR-DATA-028 (author = phone else channel; labels
  masked).
- Defect fixes `APPROVED`: LB-API-040 (`DELETE` by listing and `DELETE /api/hidden/:id` both stay and act on the same
  entry), LB-API-041, LB-API-043, LB-DATA-012.
- `PROPOSED`: DEV-034 (user-wide hide rules shared with the bot's «Скрыть похожие») — not applied; DEV-007 does not
  apply (no phone is returned, only a masked label).

## Acceptance criteria

- Phone author: `listing_ids` equals every active listing with that phone HMAC; source author: every active listing of
  the channel without a phone author (spec — a phone-less listing of the channel).
- The entry has an integer `number`; it shows in `GET /api/hidden.authors` with `kind`, `label`, `count`.
- Repeat → same body, one row. Unblock → `204`, entry gone, listings back in the feed.
- `label` never contains more than two digits of the phone.

## Tests

- `Api014BlockAuthorTest`: phone author with 3 active and 1 withdrawn listing → 3 ids, all integers; source author;
  repeat idempotent (`15` §3.4 #4); unknown number → `404`; listing without author → `404`; label masking dataset;
  feed/count/map exclusion; contract via KV-QA-004 (`listing_ids` array of integers).
- `Api015UnblockAuthorTest`: unblock → `204`, entry gone; unblock when not blocked → `204`; equivalence with
  `DELETE /api/hidden/:id` (KV-BE-042) on the same author.
- IDOR (`15` §3.1 #6): B blocks the author of L → A's `blocked_authors` unchanged and A still sees L.
- `pgsql` race (KV-QA-008): 10 concurrent blocks → one entry, one `number`, identical bodies.
- `AuthorLabelTest`: synthetic `+998 00 000 00 67` → `+998 ** *** ** 67`; channel `example_channel` →
  `@example_channel`; markup in a handle is stripped (BR-DATA-029).

## Edge cases

- Phone shared by several channels: one author row, one entry (HMAC is the key).
- Author with zero active listings left (all withdrawn) → `{"listing_ids": [], "label": …}`.
- Channel later opted out (BR-DATA-022): block still allowed; listings already excluded.
- Listing purged after 90 days (phone erased): the author row survives with its HMAC; the label falls back to
  `+998 ** *** ** **` if no encrypted phone remains (spec).

## Security

- SEC-REQ-014 (owner-scoped), SEC-REQ-015 (upsert per (user, author)), SEC-REQ-006, SEC-REQ-027 `legacy-lists`.
- SEC-REQ-036: the phone is decrypted only to build the two-digit mask, in memory; it is never logged
  (SEC-REQ-047) and never returned.
- SEC-REQ-018/BR-DATA-029: the label is plain text without markup.

## Definition of done

Tests green (`make ci-backend` + `pgsql` group), parity gate items for F-HIDE-002 ticked (`15` §4), API-014/API-015
contract cases real in KV-QA-004, the F-HIDE-002 row in `09` updated, PR reviewed by the other developer.
