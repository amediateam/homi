# KV-BE-026 — Listing photo store, legacy renditions and signed photo URLs

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-MEDIA-001, F-LISTING-002 |
| Dependencies | KV-BE-002, KV-BE-004, KV-DB-033; decision CF-012 (ADR-0014 section of KV-BE-004); question Q-APP-001 |

## Goal

Third-party listing photos are stored privately through the existing Media pipeline, referenced per listing and photo
number, rendered once into the two legacy JPEG sizes (800 and 480 px), addressed by HMAC-signed, day-bucketed URLs of
the legacy shape, and erasable with reference counting — the building blocks that the legacy media route (KV-BE-027),
the serializers (KV-BE-028, KV-BE-034), ingestion (M6) and the photo migration (KV-DB-017) use.

## Legacy reference

- Photos are copied and served locally as `/media/<listing_id>/<n>.jpg` (800 px) and `.s.jpg` (480 px)
  (BR-API-054; `$KVADRO_ROOT/docs/about.md:139`, `:178`); signed `?e=<expiry>&s=<32 hex>`, `e` at midnight **UTC**
  issued about 1–2 days ahead, one URL per photo per day, the signature binds listing id and photo number, not the size
  (BR-API-055, BR-API-152, BR-DATA-025; `$KVADRO_ROOT/docs/seo-pages.md:379-387`).
- The client derives thumbnails only from the relative form `/media/<digits>/<digits>.jpg?` → `.s.jpg?`
  (`$KVADRO_ROOT/demo/app/src/lib/images.js:9-14`, `:9-60`; LB-API-031) and preloads the first two feed photos
  (`$KVADRO_ROOT/demo/app/src/main.jsx:26-33`).
- Photos erased 90 days after withdrawal (BR-API-065); takedowns remove them at once (BR-API-068).
- HOMI: content-addressed `media_files`, WebP variants, unsigned immutable public URLs (`backend/config/media.php`;
  `backend/app/Services/Media/HashedUploader.php:63-75` writes `CacheControl: public, max-age=31536000, immutable`);
  SEC-029 forbids that path for third-party photos; CF-012 option A (`10` §3.12, §4.15); SEC-REQ-024, SEC-REQ-025;
  JPEG kept because the legacy build targets `safari13.1` without WebP (`06` §4.3 item 5; Q-APP-001).

## Implementation

1. Read the ADR-0014 section of KV-BE-004, `.claude/skills/laravel-queues/`, `.ai/agents/security-reviewer.md` and the
   KV-BE-002 reference model (`media_file_references`).
2. Extend `HashedUploader::storeBytes()` (backwards compatible) with a key prefix and storage options so listing
   photos land under `listing-photos/originals/{sha256}.{ext}` on the private disk with `CacheControl: private`
   (existing callers keep `originals/…`; re-encoding already strips metadata, `HashedUploader.php:81`).
3. `php artisan make:class --no-interaction Services/Media/ListingPhotoStore`:
   - `store(Listing $listing, int $n, string $bytes): ListingPhoto` — `MediaVisibility::Private`, upsert
     `listing_photos (listing_id, n)` → `media_file_id`, queue `BuildLegacyRenditions` `afterCommit()`;
   - `storeMigrated(Listing $listing, int $n, string $jpeg800, ?string $jpeg480, ?string $original)` for KV-DB-017
     (byte copies of the legacy renditions under the legacy keys, verified by SHA-256);
   - `erase(Listing $listing, ?int $n = null)` — sets `erased_at`, deletes objects and renditions that no other
     `listing_photos` row or `media_file_references` row uses, raises `ListingPhotosErased` (edge purge listener is
     M6/M7 work).
4. `php artisan make:job --no-interaction Media/BuildLegacyRenditions` on queue `media` (300 s, 3 tries): decode the
   original with `intervention/image`, scale down to width 800 and 480 (never upscale), encode JPEG
   (`config('media.legacy.jpeg_quality')`), store `listing-photos/legacy/{sha256}/{800,480}.jpg`, set
   `legacy_jpeg_800_key` / `legacy_jpeg_480_key` on every `listing_photos` row of that media file. Idempotent.
5. `php artisan make:class --no-interaction Services/Media/SignedPhotoUrl`:
   - `forPhoto(ListingNumber $number, int $n, CarbonImmutable $now): string` → `/media/{number}/{n}.jpg?e={e}&s={s}`,
     `e` = UTC midnight of today + 2 days (24–48 h ahead), `s` = first 32 hex of HMAC-SHA-256 over `"{number}:{n}:{e}"`
     with `MEDIA_URL_SIGNING_KEY`;
   - `verify(int $number, int $n, int $e, string $s, CarbonImmutable $now): bool` — `e` not past, `e ≤ now + 48 h`,
     `hash_equals` against the current and `MEDIA_URL_SIGNING_KEY_PREVIOUS` keys; one boolean, no reason leaked.
6. Config `config/media.php` gains a `legacy` block (`sizes` from `MEDIA_LEGACY_SIZES` = `800,480`, `jpeg_quality`,
   `photo_disk` from `MEDIA_LISTING_PHOTO_DISK`) and `config/media_signing.php` (or a `signing` block) for the keys;
   env keys go to `.env.example` in a separate small PR (`17` §4).

## Files

- `backend/app/Services/Media/{ListingPhotoStore,SignedPhotoUrl}.php`
- `backend/app/Jobs/Media/BuildLegacyRenditions.php`, `backend/app/Events/Media/ListingPhotosErased.php`
- `backend/app/Services/Media/HashedUploader.php` (prefix and options), `backend/config/media.php`
- `backend/tests/Feature/Media/{ListingPhotoStoreTest,BuildLegacyRenditionsTest}.php`
- `backend/tests/Unit/Media/SignedPhotoUrlTest.php`

## API contract

Emits the relative URL used in `photos`, `photos_preview` and `cover` (`08` §1.8):
`/media/{number}/{n}.jpg?e={unix seconds}&s={32 lowercase hex}` — `.s.jpg` is never emitted (the client derives it).
Internal:

```php
ListingPhotoStore::store(Listing $listing, int $n, string $bytes): ListingPhoto
ListingPhotoStore::storeMigrated(Listing $listing, int $n, string $jpeg800, ?string $jpeg480, ?string $original): ListingPhoto
ListingPhotoStore::erase(Listing $listing, ?int $n = null): void
SignedPhotoUrl::forPhoto(ListingNumber $number, int $n, CarbonImmutable $now): string
SignedPhotoUrl::verify(int $number, int $n, int $e, string $s, CarbonImmutable $now): bool
```

## Business rules

- Kept: BR-API-054, BR-API-055, BR-API-152, BR-DATA-025 (numbering from 0, two sizes, signature without size),
  BR-API-065 / BR-API-068 (erase primitives; the schedule is M7).
- Defect fixes (`APPROVED`): LB-API-031 (keep the relative legacy shape on legacy routes; explicit variants only in v1),
  LB-API-054 / SEC-029 (no unsigned immutable public URLs for third-party photos).
- No DEV applies; legacy-issued URLs are not honoured (HOMI signs its own, `14` §5 option b) — no user-visible change
  beyond one placeholder session.

## Acceptance criteria

- A stored photo has a private original under `listing-photos/originals/`, a `listing_photos` row, and after the job
  two JPEG renditions no wider than 800 and 480 px (smaller originals are not upscaled) without EXIF/GPS.
- Two listings sharing identical bytes share one `media_files` row; erasing one listing keeps the object; erasing the
  second deletes original and renditions (reference counting, SEC-REQ-025).
- `forPhoto()` at 00:00:00 and 23:59:59 UTC yields `e` 48 h and ≈ 24 h ahead and the same URL for the whole UTC day;
  `verify()` accepts it until `e` and with the previous key during rotation; it rejects a changed `n`, `number`, `e`,
  `s`, an `e` more than 48 h ahead and a past `e`.
- Re-running `BuildLegacyRenditions` writes nothing new.

## Tests

- `ListingPhotoStoreTest` (`Storage::fake`, `Queue::fake` then sync): store, shared bytes, erase with reference counts,
  `storeMigrated` SHA-256 check, event raised on erase.
- `BuildLegacyRenditionsTest`: widths for 2000/900/500-px originals; JPEG MIME; EXIF-GPS fixture stripped (`15` §3.8
  #4); idempotent rerun; failed decode → job failed, no keys written.
- `SignedPhotoUrlTest`: frozen-clock dataset around midnight UTC (`15` §3.10 #8); tamper dataset (`15` §3.8 #7);
  previous-key rotation; constant-time comparison used (`hash_equals` asserted via a spy-free code review note).

## Edge cases

- Photo `n` gaps (a deleted photo): numbering keeps the gap; `photos` lists existing numbers only.
- Migrated listings whose only file is the 800-px JPEG: it becomes the original; WebP variants for v1 only 320/640.
- A listing purged after 90 days: `photos` empty, every signed URL answers `404` in KV-BE-027 because the status is
  checked per request.
- Key rotation: keep the previous key for at least 48 h (the maximum `e` horizon).

## Security

- SEC-REQ-024 (HMAC over number, `n`, `e`; per-environment key ≥ 32 bytes, SEC-REQ-034), SEC-REQ-025 (erasure-compatible
  storage), SEC-REQ-023 (re-encode, EXIF stripped; header dimension check from KV-BE-003).
- Keys never logged; signatures are capability tokens — access logs drop query strings on `/media` (`17` §3.2, **[PT]**).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; existing 28 media cases still green; the env keys
`MEDIA_URL_SIGNING_KEY`, `MEDIA_URL_SIGNING_KEY_PREVIOUS`, `MEDIA_LEGACY_SIZES`, `MEDIA_LISTING_PHOTO_DISK` announced in
the PR for the production track.
