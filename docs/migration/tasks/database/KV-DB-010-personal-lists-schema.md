# KV-DB-010 — Personal lists schema

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-FAV-001, F-FAV-002, F-HISTORY-001, F-HIDE-001, F-HIDE-002, F-HIDE-003, F-REPORT-001, F-REPORT-002, F-REPORT-003, F-OWNER-001, F-OWNER-002, F-DELIVERY-007 |
| Dependencies | KV-DB-007, KV-DB-008 |

## Goal

The per-user list and feedback tables exist with the composite keys that make every legacy write idempotent:
`favorites`, `listing_views`, `hidden_listings`, `blocked_authors` (with a preserved public entry `number`),
`listing_votes`, `owner_verifications` and `found_answers`.

## Legacy reference

- ENT-014 (`06:412-427`), ENT-015 (`06:428-440`), ENT-016 (`06:441-458`), ENT-017 (`06:459-477`), ENT-018
  (`06:478-498`), ENT-019 (`06:499-514`), ENT-020 (`06:515-531`); mapping `06` §4.2 lines 1229-1235.
- Contracts: API-011 (toggle `{favorite}`), API-012/013, API-014 (`{listing_ids, label}`), API-016 (`{hidden}`),
  API-026 (`authors[{id, kind, label, count}]`), API-027 (delete by author entry id), API-029/030 (whole lists),
  API-032/033 (`answer`, `trigger`, `where`) — `08` §2.
- BR-DATA-005, BR-DATA-017, BR-DATA-018, BR-DATA-028, BR-DATA-032; BR-API-094 … BR-API-106; LB-API-039, LB-API-040,
  LB-API-043, LB-DATA-005, LB-DATA-010, LB-DATA-012, LB-DATA-013.
- Migration rules `14` §3 (blocked-author `number`, `blocked_authors_number_seq`), §4.2 (favourites, history,
  hidden, blocked author, vote, owner verification, found answer rows).
- Open: Q-API-009 (caps), Q-API-035 (what records history), Q-API-037 (report-hidden in «Скрытое»), Q-API-038
  (repeat semantics), Q-API-039 (vote thresholds), Q-DATA-019 (owner hash algorithm), Q-SEC-016 (votes of erased
  users).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 1, 3, 5, 6) and the KV-DB-004 ADR.
2. `php artisan make:model Favorite -mfs --no-interaction`: `user_id`, `listing_id` (ULID), `created_at`; PK
   `(user_id, listing_id)`; index `(user_id, created_at desc)`.
3. `php artisan make:model ListingView -mfs --no-interaction`: `user_id`, `listing_id`, `last_viewed_at`,
   `view_count int`; PK `(user_id, listing_id)`; index `(user_id, last_viewed_at desc)`. **Not partitioned:** `10`
   §4.9 proposes monthly partitions, but a per-(user, listing) upsert key cannot span month partitions without
   duplicating rows, and the table is bounded by users × the history cap (DEV-003 / LB-DATA-010 `PROPOSED`). Record
   this as a decision for the developer in the PR; revisit only if the cap is rejected and growth is measured.
4. `php artisan make:model HiddenListing -mfs --no-interaction`: `user_id`, `listing_id`, `reason` (`manual`,
   `report_rented`, `report_fraud`), `created_at`; PK `(user_id, listing_id)`.
5. Migration `create_blocked_authors_number_sequence` (pgsql) and `php artisan make:model BlockedAuthor -mfs
   --no-interaction` (`HasUlids`): `number bigint unique not null` default `nextval('blocked_authors_number_seq')`,
   `user_id`, `author_id` (→ `listing_authors`), `created_at`; unique `(user_id, author_id)`.
6. `php artisan make:model ListingVote -mfs --no-interaction`: `id` bigint identity, `user_id`, `listing_id`,
   `reason` (`rented`, `agent`, `wrong_data`, `fraud`), `weight numeric(4,3)`, `created_at`, `withdrawn_at`; unique
   `(user_id, listing_id, reason)`; index `(listing_id, reason) WHERE withdrawn_at IS NULL` for threshold counts.
7. `php artisan make:model OwnerVerification -mfs --no-interaction`: `user_id` PK, `phone_hmac bytea` nullable
   (indexed), `verified_at`, `legacy_hash bytea` nullable, `legacy_hash_alg text` nullable, `reverify_due_at`;
   check: `phone_hmac IS NOT NULL OR legacy_hash IS NOT NULL`.
8. `php artisan make:model FoundAnswer -mfs --no-interaction`: `id`, `user_id`, `answer` (`kvadro`, `elsewhere`,
   `searching`, `stopped`), `trigger` (`pause`, `delete`, null), `where` (`telegram`, `olx`, `site`, `agent`,
   `friends`, `street`, `other`, null), `radar_id` nullable (no FK cascade — keep the answer if the radar is deleted;
   `nullOnDelete`), `channel` (`app`, `bot`), `created_at`; index `(user_id, created_at desc)`.
9. Every table: FK `user_id` → users `cascadeOnDelete` (erasure, SEC-REQ-039); `listing_id` FKs to `listings`
   (`cascadeOnDelete` for the lists; votes keep `restrictOnDelete` because listings are never hard-deleted — merges
   re-point, purges keep stubs).
10. Factories and a `PersonalListSeeder` (synthetic) with states: hidden by report, withdrawn vote, legacy-hash owner
    verification.

## Files

- `backend/database/migrations/<ts>_create_favorites_table.php`, `…_create_listing_views_table.php`,
  `…_create_hidden_listings_table.php`, `…_create_blocked_authors_number_sequence.php`,
  `…_create_blocked_authors_table.php`, `…_create_listing_votes_table.php`, `…_create_owner_verifications_table.php`,
  `…_create_found_answers_table.php` (new)
- `backend/app/Models/{Favorite,ListingView,HiddenListing,BlockedAuthor,ListingVote,OwnerVerification,FoundAnswer}.php`
- `backend/database/factories/*`, `backend/database/seeders/PersonalListSeeder.php`
- `backend/tests/Feature/Database/PersonalListSchemaTest.php`, `backend/tests/Feature/Pgsql/PersonalListSchemaPgsqlTest.php`

## API contract

n/a for endpoints — the tables must produce `{"favorite": bool}` (API-011), `ListingPreview.favorite` and `viewed`,
`{items, next_cursor: null}` ordered lists (API-029, API-030), `{"listing_ids": [...], "label": "..."}` (API-014),
`authors[].id` = `blocked_authors.number` (JSON integer), `kind`, `label`, `count` (API-026), `{"hidden": bool}`
(API-016), `owner_verified` inputs (BR-API-108) and the survey answers of API-032/API-033.

## Business rules

Keep BR-DATA-017 (per-user sets), BR-DATA-018 (four reasons, weighted), BR-DATA-028, BR-DATA-032, BR-API-099,
BR-API-101. Apply LB-API-043 and LB-DATA-012 (unique keys; migration keeps the earliest row), LB-API-040 (author
entry ids preserved), LB-DATA-005 transitional `legacy_hash` — defect fixes `APPROVED`. DEV-003 (history cap),
DEV-010 (weighted threshold, undo via `withdrawn_at`), DEV-011 (keyed owner hash), DEV-034 (user-wide hide rules) are
`PROPOSED`; the schema supports them without later migrations.

## Acceptance criteria

- A second favourite, hide, block or same-reason vote for the same keys is rejected by the database (the services
  turn that into idempotent responses).
- `blocked_authors.number` is unique and drawn from its own sequence; migrated entries can keep their legacy value.
- `owner_verifications` stores no phone in clear; a row needs an HMAC or a legacy hash.
- Deleting a user removes every row of these tables; deleting a radar keeps found answers with `radar_id = null`.

## Tests

- `PersonalListSchemaTest` (SQLite): `it('rejects a duplicate favourite')`, `it('rejects a duplicate hidden
  listing')`, `it('rejects blocking the same author twice')`, `it('allows two reasons from one voter')`,
  `it('rejects the same reason twice')`, `it('requires a hash on owner verifications')`, `it('cascades all lists on
  user delete')`, `it('nulls radar_id on found answers when the radar is deleted')`.
- `PersonalListSchemaPgsqlTest` (`pgsql`): `blocked_authors_number_seq` `setval` above preserved numbers; EXPLAIN of
  `favorites` and `listing_views` list queries uses `(user_id, … desc)`; vote-threshold count uses the partial index;
  concurrent duplicate inserts (KV-QA-008) end in one row without `500`.

## Edge cases

- A listing merged after being favourited: the merge re-points rows and keeps the earliest (`14` §4.2); the PK
  prevents duplicates after re-pointing.
- Votes of an erased user (Q-SEC-016): cascade deletes them; global marks already applied stay (author-level) — the
  erasure task records the choice.
- A `where` value sent without a preceding `elsewhere` answer: `answer` is NOT NULL, so no orphan row can exist; the
  service (KV-BE-044) attaches `where` to the user's latest `elsewhere` row and decides the no-answer case.

## Security

SEC-REQ-014 (all lookups through `user_id`; entry `number` is resolved only within the owner's rows), SEC-REQ-015
(unique keys behind idempotency), SEC-REQ-036 (owner phone only as HMAC with `PHONE_HMAC_PEPPER`), SEC-REQ-039
(cascade on erasure), SEC-REQ-045 (votes keep weight and withdrawal for the audit trail).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist; data-impact note in the PR (none on
existing tables).
