# KV-BE-156 — Landing photo snapshots from the media pipeline

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); nginx alias for `/img/snap/` **[PT/INF]** |
| Complexity | M |
| Feature IDs | F-MEDIA-004 |
| Dependencies | KV-BE-026 (`ListingPhotoStore`), KV-BE-138 (takedown events), KV-BE-002 (reference counting); DEV-012 (`PROPOSED`) |

## Goal

The landing's pin photos `img/snap/<id>.webp` keep their public paths for the unchanged legacy landing, but every file
is a derived variant of a listing photo held by the media pipeline, exists only while the listing is a current pin,
is deleted at once on withdrawal, takedown or purge, and never outlives the 30-day photo-copy promise.

## Legacy reference

- RES-013 (`08` lines 2544-2554): `GET /img/snap/<listing_id>.webp`, 316 files (fixture of 2026-11-08), unsigned, `robots.txt` disallows
  `/img/snap/` and `/*/img/snap/`; producer `scripts/landing_snapshot.py` (`$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:69-70`).
- Robots: `$KVADRO_ROOT/demo/landing/site/robots.txt:6-8`; privacy promise «копии фото — до 30 дней» cited in
  LB-LND-012 (`03b` lines 2114-2123, `PRV:72`).
- Rules: BR-API-134 (pin `photo` = `img/snap/<id>.webp`); defects LB-API-054, LB-DATA-016, LB-LND-012; DEV-012
  `PROPOSED` (signed or short-lived landing photos); SEC-014; ENT-027, ENT-054; URL-020 (public pattern).

## Implementation

1. Read the KV-BE-026 and KV-BE-002 tasks (photo store, references, variants) and `.claude/skills/laravel-queues/`.
2. `php artisan make:class Services/PublicData/LandingSnapshotService --no-interaction`:
   - `syncFor(Collection $listings): SnapshotSet` — for each candidate pin listing, take photo `n = 0` from
     `ListingPhotoStore`, derive a WebP 400 × 300 (cover crop, quality from config, EXIF never copied — the source is
     already re-encoded) and write it to `media_public` at `landing/snap/{number}.webp`; register a media reference
     of owner type `landing_snapshot` (KV-BE-002 model) so purges see it; skip and report listings without a
     deliverable photo (the pin is then dropped by KV-BE-155).
   - After the pin set is published, delete every `landing/snap/*.webp` that is not in the current set (the folder
     holds only current pins).
   - `remove(ListingNumber $number)` — immediate delete + reference release; requests an edge purge for
     `/img/snap/{number}.webp` through the fakeable edge client of KV-DB-028 (if the edge caches it).
3. Listeners (queued, `media`): `ListingWithdrawn`, `ListingPurged`, takedown (KV-BE-138) → `remove()` at once; the pins
   rebuild of KV-BE-155 follows.
4. 30-day cap: `landing:prune-snapshots` (daily) deletes any snapshot whose listing's first pin appearance is older
   than 30 days, even if still selected (`landing.snapshot_max_age_days` = 30) — normally pins are ≤ 14 days old.
5. Serving: nginx alias `/img/snap/` → `media_public/landing/snap/`, `Cache-Control: public, max-age=1800`,
   `X-Robots-Tag: noindex`, robots disallow unchanged **[PT/INF]**.
6. DEV-012 option (signed, short-lived URLs instead of the static path) is prepared behind
   `landing.snapshots.signed` (default off): the legacy landing builds the path from the `photo` field, so the
   signed form can ship only with the new landing (S4).

## Files

- `backend/app/Services/PublicData/LandingSnapshotService.php` (new)
- `backend/app/Listeners/PublicData/RemoveLandingSnapshot.php`, `backend/app/Console/Commands/PublicData/PruneLandingSnapshots.php` (new)
- `backend/config/public_data.php` (`landing.snapshots.*`); `backend/routes/console.php`
- `backend/tests/Feature/PublicData/LandingSnapshotTest.php` (new)

## API contract

Static `GET /img/snap/<number>.webp` → `200 image/webp` while the listing is a current pin; `404` otherwise.
`/*/img/snap/` (the `<base href="../">` form on `/uz/`, `/en/`) resolves to the same files **[PT/INF]**.

## Business rules

- Kept: BR-API-134 (path and format of `photo`).
- LB-API-054, LB-DATA-016, LB-LND-012 fixed compatibly: same paths, but files come from the media pipeline, are removed
  on withdrawal, takedown and purge, and capped at 30 days. The full DEV-012 (signed or short-lived URLs) stays
  `PROPOSED`; test `->todo('DEV-012 PROPOSED')`.

## Acceptance criteria

- After a build, `landing/snap/` contains exactly the snapshots of the published pins; each has a media reference.
- A takedown or withdrawal deletes the listing's snapshot before the next request (listener test) and the edge purge
  is requested.
- No snapshot older than 30 days exists after the daily prune.
- Snapshot files carry no EXIF and are WebP at 400 × 300.

## Tests

- `LandingSnapshotTest`: `snapshot_written_for_each_pin_with_reference`, `stale_snapshots_deleted_after_publish`,
  `listing_without_photo_is_reported_not_written`, `takedown_deletes_snapshot_at_once` (event → listener, file gone),
  `withdrawal_deletes_snapshot_at_once`, `purge_releases_reference_and_object_when_last`,
  `prune_removes_snapshots_older_than_30_days` (time travel 30 days ± 1 s), `output_has_no_exif_and_is_400x300_webp`,
  `edge_purge_requested_on_remove` (fake client), `->todo('DEV-012 PROPOSED')`.

## Edge cases

- The same photo object referenced by the listing and by its snapshot: purging the listing releases both references;
  the object goes when the last reference goes (KV-BE-002).
- Merge: the alias number's snapshot is deleted; the survivor gets its own on the next build.
- A build failing half-way: snapshots already written for unpublished pins are removed by the next successful build;
  the published pins never reference a missing file because removal of stale files runs only after publication.
- Concurrent rebuild (takedown listener + schedule): `withoutOverlapping` lock shared by `landing:build`.

## Security

- SEC-REQ-025 (landing snapshots from the media pipeline, removed by takedown and purge), SEC-REQ-040 (takedown clears
  snapshots), SEC-REQ-023 (only re-encoded media), SEC-014 (unsigned third-party photo copies) closed for withdrawn
  listings.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (`15` §4) for F-MEDIA-004, docs and the feature row in `09`
updated, the nginx alias request handed to the production track in the PR, PR reviewed by the other developer.
