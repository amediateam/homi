# KV-INF-020 — Buckets and the private listing-photo route

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | M |
| Feature IDs | F-MEDIA-001, F-MEDIA-004 |
| Dependencies | KV-INF-009 (local `X-Accel-Redirect` location to mirror), KV-INF-015 (vhosts), KV-INF-016 (staging legacy hosts); CF-012 (ADR-0014 extension for listing photos); the signed legacy media route of F-MEDIA-001 (RES-001, RES-002) from the backend track |

## Goal

Staging and production have their buckets, IAM users and policies, and nginx can serve a private listing photo only
after Laravel has checked the signed `/media/{number}/{n}(.s).jpg?e=&s=` URL and answered with `X-Accel-Redirect` to an
internal location that reads the object from MinIO. Listing photos are never anonymous and never `immutable`.
Landing data and snapshots get their public prefixes. Serves stage **S1** (`18` §2) and `17` §15 item 5.

## Legacy reference

- Legacy media: `/media/<listing_id>/<n>.jpg` (800 px) and `.s.jpg` (480 px), signed `?e=&s=` with a daily expiry, on
  both kvadro hosts; robots disallow `/media/` (RES-001, RES-002, RES-013; BR-API-054…056; `08` §3).
- Target: CF-012 option A (`10` §3.12), file storage table `10` §4.15, path routing `17` §3.2 row `/media/*`, storage
  table `17` §7, onboarding pattern `docs/ai/reports/phase-3-notes.md` §A (anonymous `GetObject` only on public buckets,
  one IAM user per environment, CORS global in MinIO).
- Findings: SEC-029 (immutable public originals), SEC-013/SEC-014 (erasure); requirements SEC-REQ-024, SEC-REQ-025.

## Implementation

1. Buckets per environment with the onboarding script pattern (dry-run first, apply only after review):
   `homi-staging-public`, `homi-staging-private`, `homi-staging-tmp` and the production trio; quotas agreed with the
   storage owner; `homi-tmp` lifecycle 1 day; versioning on private buckets with non-current versions expired within
   14 days (the privacy promise, KV-INF-026). **Needs first developer approval** (storage host change).
2. IAM: one user per environment with a read-write policy scoped to its three buckets; anonymous `GetObject` only on
   the public bucket; no `ListBucket` for anonymous users.
3. nginx on the legacy hosts (and the landing host for `/media`): `location /media/` → php-fpm; an `internal`
   location (e.g. `/_private_media/`) that `proxy_pass`es to the storage endpoint with the environment's private bucket
   and signed upstream request (or a presigned URL returned in `X-Accel-Redirect` — choose with the backend task of
   F-MEDIA-001 and record it in ADR-0014); `proxy_intercept_errors on` (missing key → 404); response headers
   `Content-Type: image/jpeg`, `Cache-Control: public, max-age=86400` (never `immutable`), `X-Content-Type-Options:
   nosniff`; access log format without query strings (SEC-REQ-047).
4. Public prefixes: `landing/data/`, `landing/snap/`, `exports/` on the public bucket (or the web host's public disk),
   served on the landing host paths of `17` §3.2 with `max-age=1800` for data.
5. Server `.env`: `MEDIA_*` and `AWS_*` names of `backend/.env.example`, plus `MEDIA_URL_SIGNING_KEY`,
   `MEDIA_URL_SIGNING_KEY_PREVIOUS`, `MEDIA_LEGACY_SIZES`, `MEDIA_LISTING_PHOTO_DISK` (`17` §4) from the vault.
6. Edge purge on deletion: if Cloudflare stays (DEC-16), the purge token of KV-INF-032 is configured; otherwise
   nginx `proxy_cache` purge rules.
7. Development track supplies: the legacy media route and `SignedPhotoUrl` (F-MEDIA-001), the photo erasure job
   (SEC-REQ-025), the internal location name agreed in KV-INF-009.

## Files

- `infra/server/minio/provision.sh` (or the existing onboarding script invocation recorded), `infra/server/minio/policies/*.json`
- `infra/staging/nginx/snippets/private-media.conf`, `infra/production/nginx/snippets/private-media.conf` (new)
- `docs/infrastructure/cdn.md` § "Private listing photos", `docs/infrastructure/environments.md` (bucket rows)

## API contract

`GET /media/{number}/{n}.jpg?e=&s=` and `.s.jpg` on the legacy hosts: `200 image/jpeg` for a valid signature, `404`
for an invalid or expired signature, a taken-down listing, or a missing object (no difference observable). Internal
location answers only to `X-Accel-Redirect`; a direct request to it gets `404`.

## Business rules

BR-API-054…BR-API-056 (sizes, signing, expiry), BR-API-065 (photos erased 90 days after withdrawal), robots disallow
`/media/` (served by the landing robots file). DEV-012 (landing snapshots through the media pipeline, `PROPOSED`).

## Acceptance criteria

- An anonymous request to the private bucket returns 403/404; the public bucket allows only `GetObject`.
- A valid signed URL on staging returns the JPEG; changing `n`, `number` or `e` returns 404; a direct request to the
  internal location returns 404.
- Response headers never contain `immutable`; access logs for `/media/` contain no query string.
- Non-current object versions disappear after 14 days (lifecycle rule shown by the storage tool).

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `curl -sI "https://kvadro-app.staging.homi.uz/media/<n>/1.jpg?e=…&s=…"` (URL from the staging API) | `200`, `image/jpeg`, `max-age=86400`, no `immutable` |
| 2 | same URL with `s` changed | `404` |
| 3 | `curl -sI https://kvadro-app.staging.homi.uz/_private_media/<key>` | `404` |
| 4 | anonymous `GET` on the private bucket endpoint | `403` or `404` |
| 5 | `tail` of the media access log after test 1 | path without `?e=` and `s=` |
| 6 | lifecycle listing for the private bucket | non-current expiry 14 days |

## Edge cases

- MinIO answers 403 for a missing key when anonymous `ListBucket` is absent — map to 404 at nginx.
- The legacy client derives `.s.jpg` from the relative URL by regex: both sizes must be served under the same path.
- Old signed URLs from the legacy backend expire within ~2 days; after S2 only HOMI-issued URLs must work (CF-012).

## Security

SEC-REQ-024 (signed capability URLs), SEC-REQ-025 (erasure-compatible storage), SEC-029 (no immutable public listing
photos), SEC-REQ-033 (`nosniff`), SEC-REQ-034 (signing keys per environment, ≥ 32 bytes), SEC-REQ-047 (logs without
query strings). Narrowing MinIO's global CORS affects every bucket on the host — only with the storage owner's OK.

## Definition of done

Buckets, policies and nginx snippets in place on staging (production before S2), checks recorded in
`docs/infrastructure/cdn.md`, G9 evidence for F-MEDIA-001 noted, `17` §15 item 5 (media part) ticked by the first
developer.
