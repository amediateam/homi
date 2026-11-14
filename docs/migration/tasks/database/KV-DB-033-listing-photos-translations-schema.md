# KV-DB-033 — Listing photos and translations schema

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-MEDIA-001, F-LISTING-002, F-LISTING-005, F-PRIVACY-003 |
| Dependencies | KV-DB-008, KV-BE-002 |

## Goal

`listing_photos` links a listing's numbered photos to content-addressed `media_files` (and to the legacy JPEG 800/480
rendition keys) and counts as a media reference for the reference-counting rule of KV-BE-002; `listing_translations`
caches on-demand translations per (listing, locale).

## Legacy reference

- ENT-027 (photo, `06:672-692`), ENT-035 (translation, `06:849-857`); mapping `06` §4.2 lines 1242, 1248; forced
  design `06` §4.3 item 5 (JPEG at legacy paths).
- `/media/<listing_id>/<n>.jpg` (800 px) and `.s.jpg` (480 px), `n` from 0 (RES-001, RES-002, BR-API-054,
  BR-DATA-025); `photos`, `photos_preview`, `photos_count`, `cover` (`08` §1.8); 90-day erase (BR-API-065,
  BR-DATA-006); translation on demand into the profile locale (BR-API-070, BR-DATA-040, API-010).
- Media pipeline `14` §5 (`legacy_jpeg_800_key`, `legacy_jpeg_480_key`, `n` preserved); CF-012 decision and ADR-0014
  extension (KV-BE-004); SEC-026/SEC-029 findings.
- Open: Q-API-025 (translation cache), Q-DATA-026 (media inventory), Q-DATA-037 (legacy translation cache size).

## Implementation

1. Read KV-BE-002 (media references and reference counting) and KV-BE-004 (ADR-0014 extension); read
   `backend/app/Models/MediaFile.php` and `backend/config/media.php`.
2. `php artisan make:model ListingPhoto -mfs --no-interaction`: `listing_id` (ULID) FK cascade, `n smallint`,
   `media_file_id` (ULID) FK `media_files` `restrictOnDelete` (an object cannot vanish while referenced),
   `legacy_jpeg_800_key`, `legacy_jpeg_480_key` (keys on the private listing-photo disk), `width`, `height`,
   `erased_at`; PK `(listing_id, n)`; index `(media_file_id)` for reference counting.
3. Extend the KV-BE-002 reference-counting query (`MediaReferenceCounter` or equivalent) to count live
   `listing_photos` rows (`erased_at IS NULL`) together with `media_file_references`; add a test that an object
   shared by two listings survives the erasure of one.
4. `php artisan make:model ListingTranslation -mfs --no-interaction`: `listing_id` FK cascade, `locale`
   (`uz`, `en`; `ru` never stored — the translate target is never `ru`), `text`, `model`, `created_at`; PK
   `(listing_id, locale)`.
5. Factories (`ListingPhoto` with a `MediaFile` factory state `listingPhoto()` on the private disk; `erased()`),
   synthetic seeds for the seeded listings (placeholder images generated in tests, never real channel photos).
6. Pint, PHPStan, tests.

## Files

- `backend/database/migrations/<ts>_create_listing_photos_table.php`, `…_create_listing_translations_table.php` (new)
- `backend/app/Models/{ListingPhoto,ListingTranslation}.php`; `Listing` gains `photos()`, `translations()`
- `backend/app/Services/Media/` reference counter (extended, from KV-BE-002)
- `backend/database/factories/*`, `backend/database/seeders/ListingPhotoSeeder.php`
- `backend/tests/Feature/Database/ListingPhotoSchemaTest.php`

## API contract

n/a for endpoints — the rows must produce `photos[]`, `photos_preview[]` (relative signed `/media/<number>/<n>.jpg`
URLs, built by KV-BE-026), `photos_count`, `cover`, the `.s.jpg` thumbnail for every `.jpg` (RES-002), and
`{"text": "…"}` for API-010.

## Business rules

Keep BR-DATA-025 (numbering from 0, two sizes), BR-API-065 / BR-DATA-006 (photos erased after 90 days — `erased_at`),
BR-DATA-040 (translations only on demand, never for `ru`). Apply LB-API-031 (explicit sizes stored, defect fix
`APPROVED`). DEV-008 (`PROPOSED`, cached GET with quota) uses the same table.

## Acceptance criteria

- A photo number is unique per listing; `n` is kept as migrated.
- A `media_files` row referenced by any live `listing_photos` row cannot be deleted; after the last reference is
  erased the object is eligible for deletion.
- Translations are unique per (listing, locale) and disappear with the listing's text purge (service in KV-DB-028).

## Tests

- `ListingPhotoSchemaTest`: `it('rejects a duplicate photo number')`, `it('blocks deleting a referenced media file')`,
  `it('keeps a shared object when one listing erases its photo')`, `it('deletes the object after the last
  reference')`, `it('stores one translation per locale')`, `it('cascades photos and translations with the listing')`.

## Edge cases

- The same bytes posted in two listings (content-addressed `media_files` unique by `(disk, sha256)`): two
  `listing_photos` rows, one object.
- Migrated listings that only have the 800 px file: `legacy_jpeg_800_key` = original, 480 px rendition built later.
- PII-purged listings keep no `listing_photos` live rows (`erased_at` set) — V-RI-7.

## Security

SEC-REQ-016 (references separate from content-addressed objects), SEC-REQ-025 (erasure removes references and
unreferenced objects; third-party photos stay on the private disk, never on immutable public URLs, SEC-029),
SEC-REQ-038 (translations purged with the text), SEC-REQ-041 (no real photos in fixtures).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist; data-impact note in the PR.
