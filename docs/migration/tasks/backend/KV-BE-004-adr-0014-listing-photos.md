# KV-BE-004 — ADR-0014 extension: listing photos and signed legacy URLs

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); CDN and edge-purge parts reviewed by the first developer **[PT]** |
| Complexity | S |
| Feature IDs | F-MEDIA-001, F-LISTING-002 |
| Dependencies | KV-BE-002; CF-012; HANDOFF T4 |

## Goal

ADR-0014 "media stack and Scramble", which HANDOFF T4 writes, also decides how third-party listing photos are stored and
served: private originals, JPEG 800/480 legacy renditions, HMAC-signed `/media/{number}/{n}(.s).jpg?e&s` URLs checked
against the listing status on every request, and erasure with reference counting. KV-BE-026, KV-BE-027 and KV-DB-033
implement exactly what this section says.

## Legacy reference

- Legacy photo URLs: `GET /media/<listing_id>/<n>.jpg?e=<unix>&s=<32 hex>` (800 px) and `.s.jpg` (480 px) on
  `kvadro.app` and `app.kvadro.app` (RES-001, RES-002; `$KVADRO_ROOT/docs/seo-pages.md:379-387`); `e` = midnight UTC
  1–2 days ahead, signature binds listing id + photo number, not the size (BR-API-055, BR-API-152); `Cache-Control:
  public, max-age=86400`, `ETag` (`seo-pages.md:385-386`); missing params → `422`, bad signature → `404` (LB-API-023).
- Client derives thumbnails only from the relative form (`$KVADRO_ROOT/demo/app/src/lib/images.js:9-14`;
  LB-API-031); build target `safari13.1` predates WebP (`03` §1.10; Q-APP-001).
- 90-day erase and takedowns (BR-API-065, BR-API-068); unsigned immutable CDN URLs defeat them (SEC-029,
  `backend/app/Services/Media/HashedUploader.php:71`, `backend/app/Services/Media/MediaUrlBuilder.php:41-53`).
- Decision text: `10` §3.12 (CF-012 A), §4.15 (storage layout), §7 (Media row); requirements SEC-REQ-024, SEC-REQ-025;
  ADR-0012 (local disk, public immutable URLs) is narrowed to first-party content.

## Implementation

1. Read ADR-0012, `backend/config/media.php`, `10` §3.12, §4.15, `14` §5, `17` §3.2 and §7, SEC-REQ-023…025, and
   `.ai/agents/security-reviewer.md`.
2. Coordinate with whoever writes T4 (development track): this task adds a section "Listing photos (CF-012)" to the
   ADR-0014 draft, or, if T4 is already merged, writes a short follow-up ADR (next free number) that amends it.
3. Rules to write: (a) listing photo originals on the private disk (`listing-photos/originals/{sha256}.{ext}`, local
   `storage/app/private`, `homi-private` in staging/production **[PT]**), never on unsigned public URLs; (b) legacy
   renditions JPEG 800 and 480 (`listing-photos/legacy/{sha256}/{800,480}.jpg`), no upscaling; WebP variants for new
   clients under `listing-photos/derived/…`; (c) URL `/media/{number}/{n}.jpg|.s.jpg?e=&s=` with
   `s = substr(hex(HMAC-SHA256(key, "{number}:{n}:{e}")), 0, 32)`, `e` = a midnight UTC 24–48 h ahead, keys
   `MEDIA_URL_SIGNING_KEY` and `MEDIA_URL_SIGNING_KEY_PREVIOUS`; (d) Laravel checks signature, expiry and listing status
   on every request and answers with `X-Accel-Redirect` to an internal nginx location; one uniform `404`; (e)
   `listing_photos (listing_id, n, media_file_id)` is a reference; erasure deletes the reference, then objects and
   renditions with no remaining reference (KV-BE-002 model), then asks the edge to purge **[PT]**; (f) legacy-issued
   URLs are not honoured (no legacy secret imported, `14` §5 option b) — placeholder for at most one session;
   (g) re-encoding strips EXIF including GPS.
4. Record consequences (tasks KV-BE-026, KV-BE-027, KV-DB-033, KV-DB-017; env keys; nginx internal location for the
   production track) and alternatives (CF-012 B, C).
5. Docs-only PR; first developer reviews the CDN/edge items.

## Files

- `docs/architecture/decisions/0014-<slug>.md` (ADR-0014 "media stack and Scramble"; file name chosen in T4), or
  `docs/architecture/decisions/NNNN-listing-photos.md` if 0014 is already accepted

## API contract

Fixed by the ADR for RES-001/RES-002: `GET /media/{number}/{n}.jpg?e={unix}&s={32 hex}` and `.s.jpg` with the same
`e`/`s`; `200 image/jpeg` with `Cache-Control: public, max-age=86400`, `ETag`, `X-Content-Type-Options: nosniff`;
any missing, malformed, wrong or expired parameter, unknown number, taken-down or purged listing → `404` with an empty
or `{"detail":"Not Found"}` body (the client shows a placeholder either way).

## Business rules

Kept: BR-API-054, BR-API-055 (shape and binding; HOMI signs with its own key), BR-API-065, BR-API-152, BR-DATA-025.
Defect fixes (APPROVED by policy): LB-API-023 / LB-SEO-006 (uniform `404`), LB-API-031 (relative URLs keep the
`.s.jpg` derivation working). DEV-012 (landing snapshots through the media pipeline) is `PROPOSED` and only referenced.

## Acceptance criteria

- The ADR section contains rules (a)–(g), the key layout of `10` §4.15 and the env keys.
- It states that ADR-0012's public immutable rule applies to first-party uploads only.
- The first developer has reviewed the CDN purge and nginx `X-Accel-Redirect` items.

## Tests

No code. Review checklist: each SEC-REQ-024 acceptance item maps to a named test in KV-BE-027
(`tests/Feature/LegacyApi/LegacyMediaRouteTest.php`), each SEC-REQ-025 item to KV-BE-026 / KV-DB-028
(`tests/Feature/Media/ListingPhotoStoreTest.php`, time-travel purge test).

## Edge cases

- One object referenced by two listings (reposts): erasing one listing keeps the bytes for the other.
- Signing-key rotation: URLs signed with the previous key stay valid until their `e`.
- Old iOS WebViews: JPEG on legacy routes until Q-APP-001 shows WebP is safe.

## Security

SEC-REQ-024 (signature, expiry ≤ 48 h, status check per request, uniform `404`, `nosniff`), SEC-REQ-025 (erasure,
purge), SEC-REQ-023 (EXIF), SEC-029 resolved for listing photos; access logs without query strings on `/media`
(SEC-REQ-047) **[PT]**.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: ADR section merged and accepted; `10` CF-012 row points at it.
