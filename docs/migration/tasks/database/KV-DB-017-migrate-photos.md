# KV-DB-017 — Migrate photos

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (media access) |
| Owner | Backend (track: development); transfer and buckets **[PT]** |
| Complexity | L |
| Feature IDs | F-MEDIA-001, F-LISTING-002 |
| Dependencies | KV-DB-016, KV-BE-026; Q-DATA-026 |

## Goal

Every photo of every migrated, non-purged, non-taken-down listing is stored through HOMI's Media module: one
content-addressed `media_files` original (the largest legacy file available), the byte-copied legacy 480 px JPEG and
the 800 px JPEG as legacy renditions, and a `listing_photos (listing_id, n)` row keeping the legacy photo number — so
`/media/<number>/<n>.jpg` and `.s.jpg` on HOMI return the same bytes as legacy for a 1 % sample, and V-RI-6 passes.

## Legacy reference

- ENT-027 (`06` §2.4); `14` §5 (inventory, what is migrated, process, serving, validation, retention); `14` §6.3 V-RI-6;
  load order `14` §7.3 step 4 (bulk copy in parallel from step 3).
- RES-001, RES-002 (`08` §3): `/media/<listing_id>/<n>.jpg` 800 px and `.s.jpg` 480 px, signed `?e=&s=`; BR-API-054,
  BR-API-055, BR-DATA-025 (numbered from 0; signature binds number and `n`).
- Questions: Q-DATA-026 (storage layout, originals, count, bytes, Telegram file ids), Q-DATA-027 (signing secret —
  default option (b): not transferred), Q-DATA-050 (size and bandwidth); P9 of `14` §1.1.
- LB-DATA-016 (landing snapshots not migrated, regenerated); CF-012 (`10` §3.12).

## Implementation

1. Read `14` §5, ADR-0014 with its listing-photo section (KV-BE-004), `backend/config/media.php`,
   `.ai/agents/security-reviewer.md` and the `ListingPhotoStore` API of KV-BE-026.
2. **[PT]** The legacy side produces a manifest on the media host (owner or our read-only tool):
   `listing_id, n, rendition (800|480|original), bytes, sha256` for every file; it is stored with the run
   (`migration_runs.config`) — no file content in the repository.
3. **[PT]** Transfer over an encrypted channel with checksum verification (e.g. `rclone copy --checksum`, an existing
   operator tool on the host, not a project dependency) into the staging transfer prefix of `homi-tmp`, parallel by
   listing id range; resumable.
4. `php artisan make:command Migration/ImportListingPhotos --no-interaction` (`migration:photos {run} {--from=} {--to=}`),
   resumable by `(listing_id, n)`: skip listings whose `number` is absent, purged or taken down (`14` §5 table); verify
   each file's SHA-256 against the manifest (mismatch → excluded with reason `invalid`, reported); call
   `ListingPhotoStore::importLegacy(listing, n, original, jpeg800, jpeg480)` which stores the original content-addressed
   on the private listing-photo disk (`media_files` unique `(disk, sha256)` — a re-run finds the row), byte-copies the
   legacy JPEGs under the legacy rendition keys (`listing_photos.legacy_jpeg_800_key`, `legacy_jpeg_480_key`), and
   upserts `listing_photos(listing_id, n, media_file_id, …)` with `n` preserved (0-based).
5. Variants: queue only the WebP widths ≤ the original width (320, 640 for 800 px sources — no upscaling,
   `backend/config/media.php`) on the `media` queue; the import command does not wait for them.
6. Write `migration_run_steps` rows per listing range with counts read / written / excluded by reason, and
   `legacy_id_map` entity `photo` keyed `<legacy_listing_id>:<n>`.
7. **[PT]** Sample check: for 1 % of migrated photos (random, seeded), fetch the legacy URL shape on HOMI staging
   (`/media/<number>/<n>.jpg` and `.s.jpg` with a HOMI-issued signature) and compare bytes with the legacy file from the
   transfer bucket; record the result in the run report.
8. Telegram file ids, if the legacy schema stores them, are kept as references only (ADR-0009 item 5), never used to
   re-download.

## Files

- `backend/app/Console/Commands/Migration/ImportListingPhotos.php`
- `backend/app/Services/Migration/PhotoManifest.php` (parses and verifies the manifest)
- `backend/tests/Feature/Migration/Photos/*Test.php`, `backend/tests/Fixtures/Migration/photos/` (tiny synthetic JPEGs)

## API contract

RES-001 / RES-002 on HOMI for a migrated listing: `GET /media/<number>/<n>.jpg?e=&s=` and `.s.jpg` with a
HOMI-issued signature return `200 image/jpeg` with the same bytes as the legacy 800 px / 480 px file,
`Cache-Control: public, max-age=86400`; API-008 `photos`, `photos_preview`, `cover` list the same `n` values in the
same order as legacy (`14` §6.4 allows only the signature to differ). URLs signed by legacy before the switch are not
honoured (option (b), Q-DATA-027): the old client shows its placeholder for at most one session.

## Business rules

- Kept: BR-DATA-025 (numbering from 0, 800/480 renditions), BR-DATA-006 (photos of listings withdrawn > 90 days are not
  migrated), BR-DATA-022 (no photos for taken-down listings), BR-API-056 (video is a flag, not hosted).
- Defect fixes (`APPROVED`): LB-API-023 / LB-SEO-006 (uniform `404`, served by KV-BE-027), LB-DATA-016 (snapshots
  regenerated, not migrated).

## Acceptance criteria

- Per listing, `count(listing_photos where erased_at is null)` equals the legacy photo count from the manifest.
- Every copied file's SHA-256 equals the manifest; mismatches are listed and excluded.
- V-RI-6 returns zero (every live photo has a `ready` media file) once the variant jobs drain.
- The 1 % byte-equality sample passes; a visual spot check of 50 photos is recorded.
- A re-run writes zero rows and copies no file twice.

## Tests

`backend/tests/Feature/Migration/Photos/` (`pgsql` group; `Storage::fake` for the disks; `Queue::fake` for variants):
- `ImportIdempotentTest` — same manifest twice → one `media_files` row per distinct sha256, zero writes on run 2.
- `SharedBytesTest` — the same bytes on two listings → one `media_files` row, two `listing_photos` rows (reference
  model of KV-BE-002).
- `ChecksumMismatchTest` — manifest sha256 differs → excluded with reason `invalid`, no row written.
- `PurgedAndTakenDownSkippedTest` — no `listing_photos` for those listings.
- `NumberingPreservedTest` — legacy `n` 0, 1, 3 (gap) → `n` 0, 1, 3 kept.
- `NoUpscaleVariantsTest` — an 800 px source queues only 320 and 640 variants.
- `ResumeTest` — failure after listing range 2 → `--from` resumes; final state equals a clean run.

## Edge cases

- Only 800 px exists (no larger original): the 800 px file is the `media_files` original (`14` §5).
- A 480 px file missing for an existing 800 px file: generated by `BuildLegacyRenditions` (KV-BE-026) and flagged.
- Corrupt JPEG: excluded with reason `invalid`; the listing keeps its other photos and numbering.
- Very large media store (Q-DATA-050): ranges are processed in parallel workers; the run report records throughput.
- EXIF in legacy photos: re-encoding of variants strips it; the legacy JPEG renditions are byte copies — check for GPS
  EXIF in the sample and strip at copy if found (SEC-REQ-023), recording the change rows.

## Security

- SEC-REQ-025 (listing photos private, never on unsigned immutable public URLs; erasure-compatible references),
  SEC-REQ-024 (served only through the signed legacy route), SEC-REQ-041 (transfer encrypted, bucket destroyed after
  validation — KV-DB-031), SEC-REQ-034 (no legacy signing secret imported).
- No photo content or URLs with signatures in logs; reports list numbers, counts and hashes.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: R0 run on synthetic photos green, the staging
sample run report reviewed, `14` §5 updated with the real inventory (Q-DATA-026, Q-DATA-050 closed).
