# KV-BE-042 — «Скрытое»: API-026, API-027, API-028

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-HIDE-003 |
| Dependencies | KV-BE-040, KV-BE-041, KV-BE-028 |

## Goal

The settings screen «Скрытое» lists the user's hidden listings and blocked authors, removes one author entry by its
entry `number`, and clears both lists at once — owner-scoped, byte-compatible with `08`.

## Legacy reference

- API-026 `GET /api/hidden`, API-027 `DELETE /api/hidden/:id`, API-028 `DELETE /api/hidden`
  (`08-api-inventory.md:1435-1499`); client `$KVADRO_ROOT/demo/app/src/lib/api/user.js:5`, `:11-14`, `:17-20`;
  `$KVADRO_ROOT/demo/app/src/features/settings/HiddenScreen.jsx:26-37` (optimistic removal), `:45`, `:53`, `:62`, `:66`
  (both `.length` summed); `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:64`, `:135`; confirmation
  text «Снова показывать все скрытые объявления и заблокированных авторов?» (`ru.js:216`); mock
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:108-112`; `$KVADRO_ROOT/docs/api.md:901-924`.
- Rules: `02-legacy-backend-audit.md:637-666` (BR-API-099, Q-API-037).
- Fixes by policy (`09` §4.3): LB-API-040 (author entry ids preserved; two unblock routes kept). DEV-034 `PROPOSED`.

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/testing-best-practices/`.
2. In `PersonalListService`: `hiddenOverview(User): HiddenOverview` — hidden listings (all reasons: `manual`,
   `report_rented`, `report_fraud`; Q-API-037 spec) ordered by `created_at desc`, and author entries with `count` =
   the author's active listings; `removeAuthorEntry(User, int $number): void` resolved as
   `$user->blockedAuthors()->where('number', $number)->firstOrFail()`; `clearHidden(User): void` deletes the user's
   `hidden_listings` and `blocked_authors` in one transaction.
3. `php artisan make:controller Legacy/HiddenController --no-interaction` (`index`, `destroy`, `clear`).
4. Serialization: listings through `ListingPreviewSerializer` (KV-BE-028, batched per-user flags, no N+1); authors
   through `php artisan make:class Http/Serializers/Legacy/BlockedAuthorSerializer` → `{id, kind, label, count}` with
   `id` = entry `number` (JSON integer) and `label` from `AuthorLabel` (KV-BE-041).
5. Routes (`auth:tma`, `legacy.access`): `GET hidden` with `throttle:legacy-reads`; `DELETE hidden/{number}` and
   `DELETE hidden` with `throttle:legacy-lists`.
6. Radar hide rules (`radar_hide_rules`, KV-DB-009) are not read or written here.
7. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/app/Services/Engagement/PersonalListService.php` (changed)
- `backend/app/Domain/Engagement/HiddenOverview.php` (new)
- `backend/app/Http/Controllers/Legacy/HiddenController.php` (new)
- `backend/app/Http/Serializers/Legacy/BlockedAuthorSerializer.php` (new)
- `backend/routes/legacy.php` (changed)
- `backend/tests/Feature/LegacyApi/Api026HiddenListTest.php`, `Api027HiddenEntryDeleteTest.php`,
  `Api028HiddenClearTest.php` (new)

## API contract

- `GET /api/hidden` → `200 {"listings": ListingPreview[], "authors": [{"id": <integer entry number>, "kind":
  "phone"|"source", "label": "<masked phone or @channel>", "count": <integer>}]}`. Both arrays always present, never
  `null`; empty → `{"listings": [], "authors": []}`. `ListingPreview` with all strict keys (`08` §1.8). Errors are
  ignored by the settings screen (row hidden).
- `DELETE /api/hidden/:id` — `:id` is the **author entry id**, not a listing id → `204`. A listing number, another
  user's entry or an unknown number → `404 {"detail":"Not Found"}` (identical bodies). Client rolls back with haptic on
  error.
- `DELETE /api/hidden` → `204`; nothing to clear → `204`.
- Common: `401 {"detail":"unauthorized"}`, `403 {"detail":"<reason>"}`, `429 {"detail":"rate_limited"}`.

## Business rules

- Keep: BR-API-099 (shape and semantics), BR-API-020 (`204` only where the body is ignored), BR-DATA-017.
- Defect fix `APPROVED`: LB-API-040 — API-027 and API-015 act on the same entry; entry ids are the preserved legacy
  values after migration.
- Spec-tested (no legacy oracle): report-hidden listings listed and cleared (Q-API-037); listing order newest first.
- `PROPOSED`: DEV-034 — if approved, user-wide hide rules may appear here only if the old client tolerates them (else
  v1 only); not applied.

## Acceptance criteria

- After a hide and a block, `GET /api/hidden` lists them; `count` equals the author's active listing count; labels are
  masked.
- `DELETE /api/hidden/:id` removes exactly that entry; the author's listings return to the feed.
- `DELETE /api/hidden` empties both lists for this user only; radar hide rules unchanged.

## Tests

- `Api026HiddenListTest`: empty → both arrays `[]`; mixed reasons listed; author `count` correct; every listing item
  passes the `ListingPreview` shape (KV-QA-004 `assertLegacyShape`); entry `id` is an integer; query count constant
  for 1 and 20 items (no N+1).
- `Api027HiddenEntryDeleteTest`: own entry → `204`; second call → `404`; listing number passed as `:id` → `404`,
  nothing removed (`15` §3.1 #4); B deletes A's entry → `404` with the same body bytes as an unknown id and the same
  query count (`15` §3.1 #8).
- `Api028HiddenClearTest`: A's hidden listings and entries cleared; B's untouched (`15` §3.1 #5); radar hide rule rows
  untouched (Q-API-037 spec).
- Contract via KV-QA-004 for all three routes; limiter cases for `legacy-lists`.

## Edge cases

- Entry whose author lost all listings (`count: 0`) still listed.
- Hidden listing that was later purged or taken down: listed while the row exists, with whatever preview data
  survives (`photos_preview: []`, nulls) — strict keys still present.
- `:id` larger than 2^53 or non-numeric → `404`.
- Concurrent `DELETE /api/hidden` and a new hide → per-statement outcome, no `500`.

## Security

- SEC-REQ-014: every lookup through `$user->blockedAuthors()` / `$user->hiddenListings()`; foreign = unknown, identical
  body and query count.
- SEC-REQ-006, SEC-REQ-027 (`legacy-reads`, `legacy-lists`); SEC-REQ-036 (labels masked; no phone in the response).

## Definition of done

Tests green (`make ci-backend`), parity gate items for F-HIDE-003 ticked (`15` §4), API-026…API-028 contract cases real
in KV-QA-004, the F-HIDE-003 row in `09` updated, PR reviewed by the other developer.
