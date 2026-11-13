# KV-DB-020 — Load personal lists, votes, verifications, answers

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy schema) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-FAV-001, F-HISTORY-001, F-HIDE-001, F-HIDE-002, F-HIDE-003, F-REPORT-001, F-OWNER-001, F-OWNER-002, F-DELIVERY-007 |
| Dependencies | KV-DB-010, KV-DB-016 |

## Goal

One idempotent, restartable migration step copies favourites, view history, hidden listings, blocked authors (with
their public entry numbers), votes, owner verifications and «Нашли жильё?» answers from `legacy_stage` into the
KV-DB-010 tables, re-pointed through listing aliases, so every user keeps the personal state they had in kvadro².

## Legacy reference

- Scope and decisions: `14` §2 (ENT-014 … ENT-020 — favourite, history, hidden and blocked mandatory; votes,
  verifications, answers migrate), §3 (blocked-author entry `number` preserved; composite keys elsewhere), §4.2 rows
  "Favourite, history, hidden", "Blocked author", "Vote", "Owner verification", "Found answer", §7.3 step 6.
- Rules: BR-DATA-017 (per-user sets), BR-DATA-018 (vote reasons and weights), BR-DATA-005 (owner hash and date),
  BR-DATA-019 (merged ids resolve to the survivor), BR-DATA-028 (author = phone else channel), BR-DATA-032 (survey
  literals, `where` only after `elsewhere`).
- Defects fixed during the load: LB-DATA-012 (duplicate rows from repeated taps), LB-DATA-005 (owner hashes),
  LB-DATA-013 (realtor marks under a new threshold), LB-DATA-010 (unbounded history).
- Open questions that fix the source columns: Q-DATA-016 (timestamps, caps, which action writes history), Q-DATA-017
  (blocked-author key), Q-DATA-018 (votes, marks), Q-DATA-019 (owner-hash algorithm), Q-DATA-020 (survey storage).
- Client contract the data must keep serving: `08` API-026 … API-033 (`GET /api/hidden` author `id`s, `DELETE
  /api/hidden/:id` with a pre-switch entry id from an open Mini App session).

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rule 5: `INSERT … ON CONFLICT … DO UPDATE … WHERE … IS DISTINCT FROM`),
   `.ai/agents/security-reviewer.md`, `.claude/skills/laravel-queues/`, `.claude/skills/testing-best-practices/`.
2. `php artisan make:command --no-interaction Migration/LoadPersonalListsCommand` (`migration:load personal-lists`
   through the KV-DB-013 driver) and one step class per entity under `app/Services/Migration/Steps/`
   (`make:class --no-interaction`): `FavouritesStep`, `ViewHistoryStep`, `HiddenListingsStep`, `BlockedAuthorsStep`,
   `VotesStep`, `OwnerVerificationsStep`, `FoundAnswersStep`. Each reads `legacy_stage` over the read-only
   `legacy_import` connection in key-ordered batches and writes through the KV-DB-013 batch runner (rows +
   `legacy_id_map` + `migration_run_steps` in one transaction per batch).
3. Listing re-pointing: every legacy listing id goes through `listing_aliases` (flattened by KV-DB-016) to the survivor
   ULID; collisions after re-pointing keep the earliest `created_at` (history: latest `last_viewed_at`, summed
   `view_count`); rows whose listing does not exist are excluded with reason `orphan` and counted.
4. Blocked authors: resolve the legacy author key (Q-DATA-017) to `listing_authors.id` (phone → HMAC lookup, source →
   `source_channels.id` by lower-cased handle); keep the legacy entry id as `blocked_authors.number` when numeric, else
   allocate a new number and write `legacy_id_map(entity='blocked_author')`; duplicates per (user, author) → earliest.
5. Votes: dedupe per (user, listing, reason) keeping the earliest, copy `weight`; snapshot the current realtor marks
   and "rented for all" states with `source = 'legacy'`, `at = run start` (LB-DATA-013). The DEV-010 recompute of marks
   under the new weighted threshold runs only with the run-config flag `recompute_vote_marks` (default off) and writes
   one `migration_changes` row per changed author.
6. Owner verifications: copy `legacy_hash`, `legacy_hash_alg`, `verified_at`; `phone_hmac = null`;
   `reverify_due_at = cut-over date + transition window` from run config (DEC-29). Legacy hashes are never
   brute-forced (SEC-REQ-041).
7. Found answers: copy answer, trigger, channel; attach each `where` row to the latest `elsewhere` answer of the same
   user (BR-DATA-032); unmatched `where` rows excluded with reason `invalid`.
8. History cap (DEV-003 / LB-DATA-010, `PROPOSED`): run-config `history_cap` (default `null` = keep all); when set, the
   trimmed count is reported per user bucket, never silently applied.
9. Every rule that changes a value writes `migration_changes(run_id, entity, legacy_key, rule, before_hash,
   after_hash)`; the step balances `rows_read = written + merged + excluded` (V-CNT-1).

## Files

- `backend/app/Console/Commands/Migration/LoadPersonalListsCommand.php` (new)
- `backend/app/Services/Migration/Steps/{Favourites,ViewHistory,HiddenListings,BlockedAuthors,Votes,OwnerVerifications,FoundAnswers}Step.php` (new)
- `backend/config/migration.php` (run-config keys `recompute_vote_marks`, `history_cap`, `owner_reverify_window_days`; file owned by KV-DB-013)
- `backend/tests/Feature/Migration/LoadPersonalListsTest.php` (new, `pgsql` group)

## API contract

The loaded rows must make HOMI's legacy routes answer as legacy did for the same user: `GET /api/favorites` and
`GET /api/history` (API-029, API-030) return every migrated item with `next_cursor: null`; `GET /api/hidden`
(API-026) returns `authors[].id` equal to the legacy entry id; `DELETE /api/hidden/:id` (API-027) with that id
removes the entry; `viewed` and `favorite` flags on previews reflect the migrated rows.

## Business rules

Keep BR-DATA-005, BR-DATA-017, BR-DATA-018, BR-DATA-019, BR-DATA-028, BR-DATA-032; apply LB-DATA-012 (dedupe,
`APPROVED` by policy) and LB-DATA-005 (owner hashes kept only for the window, `APPROVED` as a defect fix with DEV-011
`PROPOSED` for the visible part). DEV-003 (history cap) and DEV-010 (mark recompute) are `PROPOSED`: implemented
behind run-config flags, off by default, volumes reported.

## Acceptance criteria

- On R0 synthetic stage data the step balances for every entity (V-CNT-1) and V-SUM-2 (favourites) plus the analogous
  fingerprints for hidden listings, blocked authors with entry numbers, votes with reason and found answers are equal
  on both sides; V-RI-5 returns zero.
- A second run over unchanged stage data writes zero rows; a run killed mid-batch resumes after the last committed
  batch.
- No `owner_verifications.phone_hmac` value is produced from a legacy hash; no plaintext phone lands in any column.

## Tests

- `favourites re-pointed through a flattened alias chain keep the earliest created_at` (alias `a → b → c`).
- `history collision keeps latest last_viewed_at and sums view_count`.
- `orphan favourite excluded with reason orphan and counted`.
- `blocked author keeps legacy entry number; non-numeric legacy id gets a new number and a legacy_id_map row`.
- `phone author resolved by HMAC, source author by lower-cased handle`.
- `duplicate votes per user listing reason collapse to the earliest` (LB-DATA-012).
- `recompute_vote_marks off leaves legacy marks; on writes migration_changes per changed author` (DEV-010 todo).
- `owner verification keeps legacy_hash and sets reverify_due_at from run config; phone_hmac stays null`.
- `where answer attached to the latest elsewhere answer; orphan where excluded`.
- `history_cap reports trimmed counts without deleting when null`.
- `re-run writes nothing; restart resumes` (uses the KV-QA-008 kit only for the interrupted batch).
- Validator coverage of V-SUM/V-RI for these entities lives in KV-QA-018.

## Edge cases

- A listing purged or taken down in legacy (`taken_down_stub`): personal rows still point to the stub, previews show
  the status label, never PII.
- A user on the erasure list (`14` §7.9): every row excluded at extract (KV-DB-027).
- A blocked author whose phone appears in no migrated listing: the author row is still created (HMAC only) so the
  block keeps working on future listings.
- Votes from users later erased: per Q-SEC-016 / Q-DATA-042 (anonymise or drop — follow the KV-BE-049 ADR).

## Security

SEC-REQ-014 (rows owned by the right user after re-pointing), SEC-REQ-036 (no names or phones in clear), SEC-REQ-039
and SEC-REQ-041 (erased users excluded; owner hashes never brute-forced; sanitised samples only outside staging), no
PII in `migration_run_steps` or reports — counts, ids and hashes only.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4), docs and the feature rows in 09
updated, PR reviewed by the other developer. R1 report lists the change volumes per rule of this step and the
developer has reviewed them.
