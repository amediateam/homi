# KV-BE-027 — RES-001 / RES-002 legacy media route

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); nginx internal location by the infrastructure track, staging/production **[PT]** |
| Complexity | M |
| Feature IDs | F-MEDIA-001, F-LISTING-002 |
| Dependencies | KV-BE-026, KV-BE-005 (and the `legacy-media` limiter of KV-BE-010; CF-012 option A via ADR-0014 of KV-BE-004; the internal `X-Accel-Redirect` location of `17` §3.2 from the infrastructure track) |

## Goal

`GET /media/{number}/{n}.jpg` and `.s.jpg` with `?e=&s=` answer on both legacy hosts with the JPEG 800 / 480 rendition
of a listing photo when the HOMI signature is valid and the listing may still show photos; every other request gets one
uniform empty `404`.

## Legacy reference

- RES-001 / RES-002 (`08` §3): `$KVADRO_ROOT/docs/api.md:1054-1055`, `:1061-1063`; `$KVADRO_ROOT/docs/about.md:139`,
  `:178`, `:305-307`; `$KVADRO_ROOT/docs/seo-pages.md:379-387` (signature, expiry, cache headers, `422` without
  signature, `404` for bad/expired), `:133-134` (robots disallow `/media/`).
- Client derivation of thumbnails only from the relative form: `$KVADRO_ROOT/demo/app/src/lib/images.js:9-14`, `:9-60`
  (`srcset` 480w/800w); first two feed photos preloaded `$KVADRO_ROOT/demo/app/src/main.jsx:26-33`; parity
  `$KVADRO_ROOT/demo/app/tools/parity/parity.mjs:50`.
- Rules: BR-API-054, BR-API-055, BR-API-152, BR-DATA-025, BR-API-065, BR-API-068; LB-API-023, LB-API-031, LB-SEO-006;
  SEC-029; URL-042, URL-043.
- HOMI: CF-012 (`10` §3.12), `10` §4.6 endpoint table (`LegacyMediaController`), `10` §4.15 storage layout,
  `17` §3.2 path routing.

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/laravel-owasp-security/` and
   `.ai/agents/security-reviewer.md` (capability URLs).
2. `php artisan make:controller Legacy/LegacyMediaController --invokable --no-interaction`.
3. In `routes/legacy.php` (outside the `api` prefix, without `auth:tma` and `legacy.access`): two routes
   `media/{number}/{n}.jpg` and `media/{number}/{n}.s.jpg` with `whereNumber`, host-bound by the KV-BE-005 middleware to
   `LEGACY_APP_HOSTS` and `LEGACY_SITE_HOSTS`, `throttle:legacy-media` (IP 1 200/min).
4. The controller calls `SignedPhotoUrl::verify($number, $n, $e, $s)` (KV-BE-026; current and previous key, `e` not in
   the past, at most 48 h ahead) **before** any database read; then `ListingNumberResolver` (no alias redirect for media:
   an alias number answers `404`, since HOMI only signs survivor numbers) and the listing status check (`taken_down`,
   `pii_purged_at`, erased photo → `404`).
5. Resolve the `listing_photos` row `(listing_id, n)` and its rendition key (`legacy_jpeg_800_key` /
   `legacy_jpeg_480_key`, or the rendition built by `BuildLegacyRenditions`). Missing rendition → `404` and a queued
   rebuild (no synchronous image work in the request).
6. Response: empty body, `X-Accel-Redirect: /_protected/listing-photos/legacy/{sha256}/{800|480}.jpg`,
   `Content-Type: image/jpeg`, `Cache-Control: public, max-age=86400`, `ETag` (quoted sha256 + size),
   `X-Content-Type-Options: nosniff`. Config `legacy.media_delivery` = `accel` (default) | `stream` (local without the
   nginx internal location: `Storage::disk(...)->response()` with the same headers).
7. Every failure path throws one `LegacyMediaNotFound` rendered as `404` with an empty body (not `{detail}`): images
   fall back to the placeholder either way.
8. Access log hygiene: document in the PR that nginx logs `/media/*` without query strings **[PT]** (SEC-REQ-047).

## Files

- `backend/app/Http/Controllers/Legacy/LegacyMediaController.php` (new)
- `backend/app/Exceptions/Legacy/LegacyMediaNotFound.php` (new)
- `backend/routes/legacy.php` (two routes)
- `backend/config/legacy.php` (`media_delivery`)
- `backend/tests/Feature/LegacyApi/Res001MediaTest.php` (new)

## API contract

- `GET /media/<number>/<n>.jpg?e=<unix>&s=<32 hex>` → `200`, empty body with `X-Accel-Redirect` (or the streamed JPEG),
  `Content-Type: image/jpeg`, `Cache-Control: public, max-age=86400`, `ETag`, `nosniff`; width 800 px (or the original
  width when smaller, no upscaling).
- `GET /media/<number>/<n>.s.jpg?e=&s=` → same, width ≤ 480 px; the **same** signature is valid for both sizes
  (BR-API-055: it binds number and photo index, not size).
- Any failure → `404`, empty body, no framework validation details (legacy answered `422` without `e`/`s` — fixed by
  LB-API-023).
- No `Authorization`, no cookies; `n` is 0-based (BR-DATA-025).

## Business rules

- Kept: BR-API-054 (two sizes), BR-API-055 and BR-API-152 (`e` midnight UTC, issued 1–2 days ahead), BR-DATA-025,
  BR-API-065 / BR-API-068 (purged or taken down → no photo), robots disallow kept by the landing (`/media/`).
- Defect fixes `APPROVED` (`09` §4.3): LB-API-023 / LB-SEO-006 (uniform `404`), LB-API-031 (relative URL with matching
  `.s.jpg`).
- No DEV. URLs signed by the legacy backend are not honoured (`14` §5 option b; Q-API-024 stops mattering).

## Acceptance criteria

- A URL produced by `SignedPhotoUrl` for an active listing returns `200` with the headers above on both legacy hosts and
  `404` on `api.*`.
- Altered `s`, other `n`, other `number`, past `e`, `e` more than 48 h ahead, missing `e` or `s`, unknown number,
  alias number, taken-down listing, purged photo → `404` with an empty body.
- A URL signed with the previous key is accepted during rotation; with a third key it is refused.
- No database query runs for a request with an invalid signature (query log).

## Tests

`backend/tests/Feature/LegacyApi/Res001MediaTest.php` (`stream` mode, faked private disk):

- `valid_signature_serves_800_jpeg_with_cache_headers`; `same_signature_serves_480_thumbnail`;
  `thumbnail_is_at_most_480px_wide` (decoded with `intervention/image` in the test).
- Dataset `uniform_404` (`15` §3.8 #7): altered `s`, other `n`, other number, past `e` (frozen clock), `e` = now + 49 h,
  missing `s` (asserts `404`, not `422`), missing `e`.
- `taken_down_listing_returns_404_at_once` (`15` §3.8 #8); `purged_photo_returns_404`.
- `alias_number_returns_404`; `served_on_both_legacy_hosts`; `refused_on_api_host`.
- `accel_mode_returns_x_accel_redirect_and_empty_body`.
- `invalid_signature_runs_no_query` (`DB::getQueryLog()`).
- `limiter_1201st_request_per_minute_is_429` (IP key).
- `pgsql` group: none needed.

## Edge cases

- `e` issued at 23:59:59 vs 00:00:00 UTC (`15` §3.10 #8): both URLs valid until their midnight.
- `n` beyond the listing's photo count; `n` with leading zeros (`/media/12/01.jpg`) → `404` (canonical only).
- Listing withdrawn but within 90 days: photos still served (purge happens later).
- Rendition missing because the job has not run yet → `404` once, rebuild queued.

## Security

- SEC-REQ-024 (HMAC over number, `n`, `e`; 128-bit truncation; key rotation; status per request; uniform `404`;
  `nosniff`), SEC-REQ-025 (third-party photos private, never immutable public URLs), SEC-REQ-033 (headers),
  SEC-REQ-047 (no query strings in logs **[PT]**), SEC-REQ-027 (`legacy-media` limiter).
- Constant-time signature comparison (`hash_equals`); verification before any lookup.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for F-MEDIA-001 (G3, G7), docs and the feature rows
in 09 updated, PR reviewed by the other developer; the PR names the internal nginx location and the `MEDIA_URL_SIGNING_KEY`
/ `MEDIA_URL_SIGNING_KEY_PREVIOUS` keys for the other track.
