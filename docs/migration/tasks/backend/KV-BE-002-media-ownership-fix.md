# KV-BE-002 — Media ownership fix (SEC-026, SEC-027)

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-MEDIA-001 |
| Dependencies | — |

## Goal

A media file can be read or deleted only by an actor that holds a reference to it; ownership is a reference table
separate from the content-addressed object, so two uploaders of the same bytes delete independently and the bytes go
away only with the last reference. Users and sources (both Sanctum token holders) can never collide.

## Legacy reference

Technical migration task for HOMI's own defect, required before listing photos share objects (CF-012, F-MEDIA-001):

- `backend/app/Http/Controllers/Api/V1/Media/MediaController.php:46-49` — `show` returns any `MediaFile` resolved by
  route binding, including temporary URLs of private files; `:54-60` — `destroy` deletes any file for any
  `media:write` token; routes `backend/routes/api.php:16`, `:22`.
- `backend/app/Models/MediaFile.php:64-79` — `firstOrCreate` by (`disk`, `sha256`): the first uploader "owns"
  everybody's bytes (`uploaded_by`).
- `backend/app/Http/Controllers/Api/V1/Media/PresignController.php:40`, `:60-62` and `MediaController.php:34` — upload
  prefix and `uploaded_by` use only `getAuthIdentifier()`, so user 5 and source 5 collide (SEC-027).
- Findings SEC-026, SEC-027 (`16` §3.2); requirement SEC-REQ-016 (`16` §4.3); IDOR row "Media" (`16` §5.2); `15` §3.1
  #13; `10` §7 (Media module, "fix first").
- No existing test covers a second actor (`backend/tests/Feature/Media/MediaApiTest.php`).

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/laravel-owasp-security/`,
   `.claude/skills/laravel-testing/` and `.ai/agents/security-reviewer.md` (rule 6: load through the owner relation).
2. Write the failing tests first (step 8 cases) in `backend/tests/Feature/Media/MediaOwnershipTest.php`
   (`php artisan make:test --pest Media/MediaOwnershipTest --no-interaction`).
3. `php artisan make:migration create_media_file_references_table --no-interaction`: `id` bigint identity,
   `media_file_id` ULID FK → `media_files` (cascade on delete), `owner_type` string (morph alias), `owner_id` string
   (ULID or bigint as text), `created_at`; unique (`media_file_id`, `owner_type`, `owner_id`); index (`owner_type`,
   `owner_id`). Backfill in the same migration: one `user` reference per existing row with `uploaded_by` (additive,
   small table; no lock concern).
4. `php artisan make:model MediaFileReference --factory --no-interaction`; `Relation::enforceMorphMap` aliases `user`,
   `source` (and later `listing_photo`, KV-DB-033) in `AppServiceProvider`; `MediaFile::references()` HasMany;
   `MediaFile::attachOwner(Model $owner)` (`firstOrCreate` on the unique key, race-safe).
5. Change `store` and `PresignController::register` to attach a reference for the authenticated actor; build the upload
   prefix as `uploads/{owner_type}/{owner_id}/…` (`PresignController.php:40`, `:60`) and check it on `register`;
   keep `uploaded_by` for history only.
6. `php artisan make:policy MediaFilePolicy --model=MediaFile --no-interaction`: `view` and `delete` return true when
   the actor holds a reference (query through the reference, not by loading and comparing); ARM roles are added later
   (SEC-REQ-046). In `show`/`destroy` authorize, and map a refusal to the same `404` envelope as an unknown id
   (`Gate::inspect` → `abort(404)` or `denyAsNotFound()`), so foreign = unknown.
7. `destroy`: in one transaction delete the actor's reference; if no reference remains (also counting `listing_photos`
   once KV-DB-033 adds it — implement as a `MediaFile::isReferenced()` method that later tasks extend), delete the
   object and its variants and the row; dispatch storage deletion `afterCommit()`.
8. Run `vendor/bin/pint --dirty --format agent`, `composer types:check`, `php artisan test --compact`.

## Files

- `backend/database/migrations/<date>_create_media_file_references_table.php` (new)
- `backend/app/Models/MediaFileReference.php`, `backend/database/factories/MediaFileReferenceFactory.php` (new)
- `backend/app/Policies/MediaFilePolicy.php` (new)
- `backend/app/Models/MediaFile.php`, `backend/app/Http/Controllers/Api/V1/Media/MediaController.php`,
  `backend/app/Http/Controllers/Api/V1/Media/PresignController.php`, `backend/app/Providers/AppServiceProvider.php`
- `backend/tests/Feature/Media/MediaOwnershipTest.php` (new); existing `MediaApiTest.php` adjusted only where it
  asserted the old prefix

## API contract

`/api/v1/media*` keeps the ADR-0007 envelope and its shapes. Changes: `GET`/`DELETE /api/v1/media/{id}` for a media
file the actor has no reference to → `404 {"success": false, "message": "Resource not found."}` (identical to an
unknown id); `DELETE` by one of two owners → `204`, the file stays readable for the other owner; upload keys returned by
presign are `uploads/<owner_type>/<owner_id>/<ulid>.<ext>`.

## Business rules

No legacy rule (HOMI-only module). Applies SEC-REQ-016 and the reviewer rule "foreign = unknown" (SEC-REQ-014).

## Acceptance criteria

- User B cannot read (`show`) or delete A's media: `404`, and A's file, variants and reference are unchanged.
- Two actors upload identical bytes: one `media_files` row, two references; the first `DELETE` removes only that
  reference (`204`), the object disappears after the second.
- A source token with id 5 cannot `register` a key under `uploads/user/5/…` and vice versa.
- The existing 28 media cases stay green; private temporary URLs are issued only to referencing actors.

## Tests

`backend/tests/Feature/Media/MediaOwnershipTest.php`:
- `it('returns 404 when another user shows a private media file')` and the same for a public one.
- `it('returns 404 when another user deletes a media file and keeps it intact')` — storage and row asserted.
- `it('deletes only the caller reference when two owners share the bytes')`; `it('deletes the object after the last reference')`.
- `it('refuses to register an upload under another actor type prefix')` — `User` 5 vs `Source` 5 factories.
- `it('answers foreign and unknown ids with identical bodies')` — compare status and JSON.
- `it('backfills a user reference for existing rows')` — migration test with a pre-existing row.
- PostgreSQL group (KV-QA-001): `it('creates one reference under concurrent identical uploads')`.

## Edge cases

- Media uploaded before the migration with `uploaded_by = null` (presign path without a user): no reference → only an
  ARM role can manage it later; listed in the PR.
- Deleting while a `GenerateImageVariantsJob` runs: the job re-checks that the row exists and stops.
- Re-uploading bytes after their deletion recreates the object and a fresh reference.

## Security

SEC-REQ-016 (references, policy, last-reference deletion, owner type in prefixes), SEC-REQ-014 (foreign = unknown),
SEC-026 and SEC-027 closed; IDOR row "Media" of `16` §5.2. Review by `.ai/agents/security-reviewer.md` before merge.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint clean, PHPStan level 7 clean, SEC-026/SEC-027 marked fixed in `16` (by the
PR description), the media module docs (`docs/architecture/overview.md` Media row or ADR-0014 draft) mention the
reference model.
