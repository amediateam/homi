# KV-BE-127 — Post photo fetching under SEC-REQ-023 and perceptual hashes

| Field | Value |
| ----- | ----- |
| Status | TODO (copying third-party photos in production BLOCKED by Q-SEC-007 legal basis) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-MEDIA-001, F-PIPELINE-003 |
| Dependencies | KV-BE-026 (`ListingPhotoStore`), KV-BE-003 (header dimension check), KV-BE-124 (`FetchPhotos` stage) |

## Goal

Photos referenced by an intake payload are copied into HOMI's private listing-photo store safely — https only, host
allowlist, no private addresses, no redirects, size and pixel caps, re-encoded without EXIF — numbered from 0 per
listing, rendered into the legacy 800/480 JPEGs by the existing pipeline, and fingerprinted with a perceptual hash that
the duplicate matcher uses as evidence.

## Legacy reference

- BR-API-054 (photos copied and served locally in two sizes), BR-DATA-025 (numbered from 0, 800 px `.jpg`, 480 px
  `.s.jpg`), BR-API-056 (video not hosted — a flag only), BR-API-047 (duplicates detected by photos among others),
  `$KVADRO_ROOT/docs/about.md:139`, `:178`; ENT-027.
- Target: CF-012 (`10` §3.12), ADR-0014 photo section (KV-BE-004), `10` §4.10 (`CopyListingPhoto` on `media`), §4.15
  (layout `listing-photos/originals/{sha256}.{ext}`); `telegram.uz` already stores `phash` as 16-hex dHash
  (`docs/api/intake-sources.md`) — HOMI computes its own.
- SEC-REQ-023 acceptance list; LB-API-054 (snapshots must also be purgeable — handled by KV-BE-156).

## Implementation

1. Read `.ai/agents/security-reviewer.md` (reviewer rule 7, SSRF), `.ai/agents/intake-pipeline-engineer.md` (rules 6,
   7), `.claude/skills/laravel-owasp-security/` (file handling), the KV-BE-026 and KV-BE-003 tasks. Tests first.
2. `php artisan make:class Services/Media/SafeImageFetcher --no-interaction`: `fetch(string $url): FetchedImage`
   - `https://` only; host in `config('intake.photo_hosts')` (Telegram CDN hosts `cdn*.telesco.pe`,
     `cdn*.cdn-telegram.org`, the collector CDNs per source — values confirmed from fixtures, `PROPOSED`);
   - resolve the host once (`dns_get_record`/`gethostbynamel`), refuse private, loopback, link-local, CGNAT and
     multicast ranges (IPv4 and IPv6), then connect to the resolved IP with the original `Host` (no second
     resolution — prevents DNS rebinding);
   - `withoutRedirecting()`, 5 s connect + read timeout, streamed with a byte cap (`media.max_bytes`, 10 MB) — the
     body is aborted past the cap;
   - MIME sniffed from bytes (`finfo`), only JPEG, PNG, WebP; header dimensions and pixel cap checked before decoding
     (KV-BE-003 `max_pixels`, 40 MP `PROPOSED`).
3. `php artisan make:job Media/CopyListingPhoto --no-interaction` (queue `media`, `tries` 5, retry only on 429/5xx/
   timeouts with `2^attempt` s + jitter, agent rule 6; 4xx other than 429 → photo recorded `unavailable`, no retry):
   fetch → `ListingPhotoStore::store($listing, $n, $bytes)` (re-encode strips EXIF incl. GPS) → perceptual hash →
   `listing_photos.phash` (additive column `bigint` via `php artisan make:migration add_phash_to_listing_photos_table
   --no-interaction`, btree index for exact matches; Hamming search is done in PHP over candidates).
4. `php artisan make:class Services/Media/PerceptualHash --no-interaction`: 64-bit dHash with `intervention/image`
   (installed): grayscale, resize to 9×8, compare adjacent pixels; `distance(a, b)` = popcount of XOR. Unit-tested on
   synthetic images (same image re-encoded, resized, slightly cropped → distance ≤ 6; different images → > 20;
   thresholds `PROPOSED`, calibrated by KV-BE-135's golden set).
5. Order and numbering: `n` follows the post's media order (album order); a `media_added` event appends with the next
   free `n`; a photo that fails permanently leaves a gap closed by renumbering only before the first publication
   (after publication numbers are public in `/media/<number>/<n>.jpg` and never shift — later failures are skipped in
   `photos[]`).
6. Dedup of bytes: identical `sha256` → the existing `media_files` object is referenced (KV-BE-002 reference model), no
   second copy.
7. Video: never downloaded; `listings.video = true` when the post has one (BR-API-056).
8. Kill switch: `config('media.copy_listing_photos')` (env `MEDIA_COPY_LISTING_PHOTOS`, default `true` locally,
   production value per Q-SEC-007) — off → photos recorded as URLs only, listing published with `photos: []`.

## Files

- `backend/app/Services/Media/{SafeImageFetcher,FetchedImage,PerceptualHash}.php`, `backend/app/Jobs/Media/CopyListingPhoto.php` (new)
- migration `add_phash_to_listing_photos_table`; `backend/config/intake.php` (`photo_hosts`), `backend/config/media.php`
- `backend/tests/Feature/Media/SafeImageFetcherTest.php`, `backend/tests/Feature/Media/CopyListingPhotoTest.php`,
  `backend/tests/Unit/Media/PerceptualHashTest.php` (new)

## API contract

n/a (internal job). Outbound: `GET <photo url>` without redirects, honest `User-Agent`.

## Business rules

- BR-API-054, BR-DATA-025 (0-based numbering, two renditions), BR-API-056 (video flag only), BR-API-047 (photo
  evidence for dedup). Public numbering never shifts after publication (public links, URL-042, URL-043).

## Acceptance criteria

- `http://…`, `https://127.0.0.1/…`, `https://169.254.169.254/…`, a redirect to a private address and a host
  resolving into `10.0.0.0/8` are refused without a connection to that address (SEC-REQ-023).
- A 50 000 × 50 000 PNG header is refused before decoding; a GPS-tagged JPEG is stored without EXIF.
- The same photo posted in two channels is stored once and both listings reference it.
- Two re-encodings of one image have a dHash distance ≤ the configured threshold.

## Tests

- `SafeImageFetcherTest` (`Http::fake`, resolver fake): `refuses_http_scheme`, `refuses_host_outside_allowlist`,
  `refuses_loopback_and_metadata_ip`, `refuses_private_resolution` (10/8, 172.16/12, 192.168/16, fc00::/7),
  `refuses_redirect`, `aborts_body_over_cap`, `refuses_non_image_mime`, `refuses_pixel_flood_without_decode`,
  `times_out_after_5s` (fake).
- `CopyListingPhotoTest`: `stores_reencoded_without_exif`, `numbers_follow_album_order`, `media_added_appends_next_n`,
  `same_bytes_reference_existing_object`, `404_marks_unavailable_without_retry`, `429_retries_with_backoff`,
  `kill_switch_skips_copy`, `numbers_never_shift_after_publication`.
- `PerceptualHashTest`: `reencoded_image_distance_small`, `resized_image_distance_small`, `different_images_distance_large`.

## Edge cases

- Telegram CDN URLs expire: a `403/404` after a delay → `unavailable`; the reader can refresh the URL from the next
  page read (`media_added` with a new URL).
- An animated WebP or GIF: first frame only, stored as a still.
- A 1×1 tracking image or a tiny image (< 200 px on the long side): skipped as `too_small` (not a listing photo).
- A photo containing a phone number as text: stored as is (OCR is out of scope; a takedown handles complaints).

## Security

- SEC-REQ-023 (fully), SEC-REQ-025 (private storage, reference counting, erasable), SEC-REQ-016 (references, not
  public URLs), SEC-REQ-047 (URLs logged without query strings). Legal basis Q-SEC-007 before production copying.

## Definition of done

Tests green (`make ci-backend`), the security-reviewer agent's SSRF checklist attached to the PR, `09` rows
F-MEDIA-001 and F-PIPELINE-003 updated, PR reviewed by the other developer.
