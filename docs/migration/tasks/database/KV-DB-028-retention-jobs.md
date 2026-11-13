# KV-DB-028 — Retention jobs in HOMI

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PRIVACY-003, F-ANALYTICS-003, F-MEDIA-001 |
| Dependencies | KV-DB-008, KV-DB-009, KV-BE-049 |

## Goal

The retention promises of the legacy `/privacy` text are enforced by scheduled, tested jobs in HOMI: listing PII
(phone, texts, photos, translations, raw intake fields) is erased 90 days after withdrawal, log partitions older than
180 days are dropped, delivered-card messages of purged listings are removed, and legacy owner hashes expire at the end
of their transition window.

## Legacy reference

- Promises: `$KVADRO_ROOT/docs/about.md:264-275`; BR-API-065, BR-API-125, BR-DATA-004, BR-DATA-006, BR-DATA-016;
  `02` §18 (purges inferred).
- HOMI decisions: CF-019 (`10` §3.19), the retention ADR of KV-BE-049, SEC-REQ-025 and SEC-REQ-038 (one time-travel
  test per rule), `10` §4.11 (withdrawn-listing purge daily 03:30 Asia/Tashkent; action-log partitions daily, next
  month created on the 25th).
- Migration: `14` §7.9 ("the HOMI purge job runs immediately after the load"), §5 "Retention" (`listing_photos.erased_at`,
  media deletion when no reference remains), §6.3 V-RI-7; LB-DATA-005 (owner hashes deleted at window end).
- Events: `ListingPurged` (`10` §4.12) → media deletes renditions and unreferenced objects, edge purge requested.

## Implementation

1. Preconditions in code: the retention ADR (KV-BE-049, DEC-12), the tables of KV-DB-032 and KV-DB-033, the partition
   manager of KV-DB-035 and the media reference counting of KV-BE-002. Read `.ai/agents/security-reviewer.md`,
   `.ai/agents/postgis-geo-engineer.md` (rule on partitions and batching),
   `.claude/skills/laravel-queues/`, `.claude/skills/testing-best-practices/`.
2. `php artisan make:command --no-interaction Privacy/PurgeWithdrawnListingsCommand` (`privacy:purge-listings`):
   selects listings with `withdrawn_at < now − 90 days` and `pii_purged_at is null` (plus taken-down listings at once)
   in batches; per listing in one transaction: `phone_encrypted`, `original_text`, `summary`, `contact_url` → null;
   `listing_publications.text` → null; `listing_translations` rows deleted; `listing_photos.erased_at` set; the
   matching `intake_events` payload fields redacted (SEC-REQ-038); `pii_purged_at` set; `listing_status_events` row
   with cause `retention`; then `ListingPurged` dispatched `afterCommit()`.
3. Listener on `ListingPurged` (Media): releases the photo references and deletes objects and renditions whose
   reference count reaches zero (KV-BE-002 model), requests an edge purge through a fakeable client.
4. Authors: `listing_authors.phone_encrypted` → null when no listing of the author is still inside the window;
   `phone_hmac` stays (blocks and opt-outs keep working).
5. Delivered log: `bot_listing_messages` rows of purged listings deleted (the `(chat_id, message_id)` link has no use
   after the «Объявление снято» edit); `radar_deliveries` rows stay (ids only) so a re-published flat is never re-sent
   — record this choice in the PR against the KV-BE-049 ADR.
6. Logs: `php artisan make:command --no-interaction Privacy/DropExpiredPartitionsCommand` uses the KV-DB-035 partition
   manager to drop monthly partitions of `user_action_log` (when M7 creates it) and `bot_listing_messages` older than
   their retention; it never deletes row by row.
7. Owner hashes: `privacy:expire-legacy-owner-hashes` sets `legacy_hash` and `legacy_hash_alg` to null where
   `reverify_due_at < now` (KV-DB-030 sends the reminders first).
8. Schedule in `routes/console.php`: `privacy:purge-listings` daily 03:30, partition drop daily 04:00, owner-hash
   expiry daily 04:15 — all `->timezone('Asia/Tashkent')->onOneServer()->withoutOverlapping()`; announce the new
   scheduled commands in the PR (`docs/handoff/parallel-work.md` §8).
9. Each job logs counts only and records a metric for the monitor (`17` §12).

## Files

- `backend/app/Console/Commands/Privacy/{PurgeWithdrawnListingsCommand,DropExpiredPartitionsCommand,ExpireLegacyOwnerHashesCommand}.php` (new)
- `backend/app/Services/Privacy/ListingPiiPurger.php` (new)
- `backend/app/Listeners/Media/ReleaseListingPhotos.php` (new)
- `backend/routes/console.php` (schedule entries)
- `backend/tests/Feature/Privacy/RetentionJobsTest.php` (new, time-travel; `pgsql` group for partitions)

## API contract

After the purge, legacy routes still answer for the listing number: `GET /api/listings/:id` (API-008) returns the
statistical stub with `phone: null`, `phone_display: null`, `call_url: null`, `original_text: null`, `photos: []`,
`photos_preview: []` and every strict key present (exact status per Q-API-023); `/media/<number>/<n>.jpg` answers `404`
(SEC-REQ-024); `POST …/translate` answers the not-found error.

## Business rules

BR-API-065, BR-DATA-006 (price, district, area stay for statistics), BR-API-125, BR-DATA-004 (180 days), BR-DATA-016,
BR-DATA-022 (taken-down listings stripped at once); LB-DATA-005 (owner hashes expire). No DEV; DEV-012 (landing
snapshots through the media pipeline, `PROPOSED`) is handled by M7.

## Acceptance criteria

- Time-travel: a listing withdrawn at T is untouched at T + 90 days − 1 s and fully purged after `schedule:run` at
  T + 90 days + 1 s; V-RI-7 returns zero afterwards.
- A photo shared by two listings survives the purge of one and disappears after the purge of the second.
- A 180-day-old partition is dropped; the current and previous months stay.
- Expired legacy owner hashes are null; re-verified owners keep their badge.
- Every job is idempotent and logs counts only.

## Tests

- `withdrawn listing purged exactly at the 90-day boundary` (`travelTo`, ± 1 s, `artisan schedule:run`).
- `taken-down listing stripped without waiting 90 days`.
- `purge clears publications text, translations, intake_events payload phone and text fields`.
- `shared photo object deleted only after the last reference is released; edge purge requested on the fake`.
- `author phone_encrypted kept while another listing of the author is inside the window`.
- `bot_listing_messages of purged listings deleted; radar_deliveries kept`.
- `partition older than 180 days dropped; boundary month kept` (`pgsql`).
- `legacy owner hash expired at reverify_due_at; re-verified owner keeps phone_hmac`.
- `jobs scheduled with onOneServer, withoutOverlapping and Asia/Tashkent` (schedule inspection test).
- `second run is a no-op`.

## Edge cases

- Listing re-published after withdrawal but before 90 days: `withdrawn_at` cleared by the status machine (M6), purge
  skipped.
- A purge batch failing half-way: the per-listing transaction keeps every listing either fully purged or untouched.
- Migrated listings already past 90 days: stripped at extract (`14` §4.1) and the first purge run is a no-op for them.
- Clock: UTC storage; the 90-day rule is an instant comparison, not a Tashkent calendar day.

## Security

SEC-REQ-025, SEC-REQ-038 (one time-travel test per rule), SEC-REQ-036 (minimisation), SEC-REQ-040 (takedowns reach every
surface), SEC-REQ-047 (no PII in job logs).

## Definition of done

Tests green (`make ci-backend`, incl. the `pgsql` group), parity gate items ticked (15 §4), docs and the feature rows in
09 updated, PR reviewed by the other developer. The scheduled commands are announced to the production track and the
first run after the R1 load is a recorded no-op on already-stripped rows.
