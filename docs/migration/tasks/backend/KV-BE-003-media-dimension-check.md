# KV-BE-003 — Media uploader: dimensions checked before decoding (SEC-028)

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-MEDIA-001 |
| Dependencies | — |

## Goal

The uploader refuses an image whose declared dimensions or pixel count exceed the limits **before** `intervention/image`
decodes it, so a small file that declares huge dimensions cannot exhaust worker memory. The same guard protects listing
photos fetched later (KV-BE-026, M6).

## Legacy reference

Technical migration task (HOMI defect on the path every listing photo will take, F-MEDIA-001):

- `backend/app/Services/Media/HashedUploader.php:50-58` — `decodeBinary($bytes)` runs first, the dimension check
  (`media.max_dimension`) after it.
- `backend/config/media.php` — `max_bytes` 25 MB, `max_dimension` 8000, allowed MIME types.
- Finding SEC-028 (`16` §3.2); requirement SEC-REQ-023 (header dimensions checked before decoding, pixel cap, e.g.
  40 MP *PROPOSED*); test plan `16` §5.6 ("pixel flood"), `15` §3.8 #3.
- Re-encoding already strips metadata (`HashedUploader.php:61`, `:78-80`), which covers the EXIF part of SEC-REQ-023 for
  uploads.

## Implementation

1. Read `.claude/skills/laravel-owasp-security/` (file upload section) and `.claude/skills/laravel-testing/`.
2. Write the failing tests (below) in `backend/tests/Feature/Media/HashedUploaderTest.php` (extend the existing file).
3. Add `media.max_pixels` to `backend/config/media.php` (`MEDIA_MAX_PIXELS`, default `40_000_000`, PROPOSED value) next
   to `max_dimension`.
4. In `HashedUploader::storeBytes()` (after the MIME sniff at `:42-48`, before `decodeBinary` at `:51`) read the header
   with `getimagesizefromstring($bytes)`; refuse when it returns `false` (`MediaException::undecodable()`), when width or
   height exceeds `max_dimension`, or when `width × height` exceeds `max_pixels` (new `MediaException::tooManyPixels()`
   with the same 422 envelope as `tooBig`). Keep the post-decode check as a second line of defence (orientation can swap
   axes).
5. Optionally set a decoder memory guard: compute the expected decode size (`w × h × 4`) and compare with a configured
   budget; no `ini_set` changes.
6. Pint, PHPStan, tests.

## Files

- `backend/app/Services/Media/HashedUploader.php`
- `backend/app/Exceptions/MediaException.php`
- `backend/config/media.php`
- `backend/tests/Feature/Media/HashedUploaderTest.php`
- `backend/.env.example` (`MEDIA_MAX_PIXELS`, in the separate shared-file PR)

## API contract

`POST /api/v1/media` and `POST /api/v1/media/register`: an oversized image answers the existing `422` envelope
(`{"success": false, "message": …, "errors": {"file": […]}}`) as `tooBig` does today; nothing is written to any disk.

## Business rules

No legacy rule. SEC-REQ-023 (dimension part). Legacy photos are ≤ 800 px (BR-API-054), far below the limits.

## Acceptance criteria

- A PNG of a few kilobytes declaring 50 000 × 50 000 pixels is refused without calling the decoder.
- An image of 7 000 × 7 000 (49 MP) is refused by the pixel cap even though each side is under `max_dimension`.
- Every existing uploader case stays green.

## Tests

`backend/tests/Feature/Media/HashedUploaderTest.php`:
- `it('refuses a pixel flood before decoding')` — a crafted PNG header (IHDR 50000×50000, tiny IDAT); bind a spy
  `ImageManager` in the container and assert `decodeBinary` is never called.
- `it('refuses images over the pixel cap')` with `config(['media.max_pixels' => 1_000_000])` and a 1 200 × 1 000 JPEG
  generated in the test.
- `it('refuses bytes whose header cannot be read')`.
- `it('accepts an image exactly at the limits')`.

## Edge cases

- GIF with several frames: the header gives the logical screen size; frames larger than it are refused by the decoder.
- WebP with an extended header: `getimagesizefromstring` supports VP8/VP8L/VP8X; a failure is treated as undecodable.
- EXIF orientation 90°: the post-decode check uses the oriented size.

## Security

SEC-REQ-023 (dimensions before decoding), SEC-028 closed; no file written before validation passes; error messages do
not echo file contents.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint and PHPStan level 7 clean; `MEDIA_MAX_PIXELS` announced in the PR and added to
`backend/.env.example` in its own small PR.
