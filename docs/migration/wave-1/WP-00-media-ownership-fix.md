# WP-00 — Media ownership fix

| Field | Value |
| ----- | ----- |
| Stage | 0 |
| Status | WAITING (PR #27 merged; the production track's counts, migration approval and deploy) |
| Depends on | — |
| Size | about 500 changed lines, S |
| Behaviour reference | Task `tasks/backend/KV-BE-002-media-ownership-fix.md`; `16` §3.2 (SEC-026, SEC-027), §4.3 (SEC-REQ-014, SEC-REQ-016), §5.2 row "Media"; `15` §3.1 row 13; known issue KI-25 in `.ai/memory/known-issues.md` |
| Needs from the production track | Approve the new migration on production (`homi-deploy production --migrate`, `docs/handoff/parallel-work.md` §3): one additive table plus a small backfill, a momentary lock on `media_files` while the foreign key is added, no downtime. Before it runs, report two counts from staging and from production (numbers only, see "Design", backfill): rows in `media_files`, and rows in `media_files` with `uploaded_by` null (they stay without an owner). Until the fix is deployed, keep issuing `media:write` tokens only to first-party clients (KI-25) |

## Goal

A media file can be read or deleted only by an actor that holds a reference to it. Ownership is a reference table
separate from the content-addressed object, so two uploaders of the same bytes delete independently and the bytes go
away only with the last reference. A user and a source with the same numeric id can never collide.

## Scope

In: the reference table and model, owner-scoped loading in `MediaController`, the policy, the upload prefix with the
actor type, reference-counted deletion, tests, the KI-25 row.

Out: listing photos as a third kind of reference (Wave 2, with HOMI's own listings); ARM roles in the policy (after
Wave 1); the media dimension check (`KV-BE-003`, not in this queue); any change to `/api/v1/media*` shapes.

## Decisions that bind this package

- Order of work (DEC-45): this is the first package of the queue; the defect is live on `main`, staging and production.
- Defects are fixed, not copied (DEC-36); this one is HOMI's own.
- Envelope and errors stay as ADR-0007 defines them. A foreign media id answers exactly like an unknown id
  (SEC-REQ-014): same status, same body, same number of queries.

## Design

**Table `media_file_references`** (new):

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `bigIncrements` | |
| `media_file_id` | `foreignUlid` → `media_files.id`, `cascadeOnDelete` | |
| `owner_type` | `string(16)` | `user` or `source` |
| `owner_id` | `string(32)` | the actor's key as text, so ULID owners fit later |
| `created_at` | `timestampTz`, default current time | no `updated_at`; the backfill copies the media row's `created_at` |

Unique (`media_file_id`, `owner_type`, `owner_id`); index (`owner_type`, `owner_id`). The same migration backfills one
`user` reference for every existing `media_files` row with a non-null `uploaded_by`.

Backfill and sources. `media_files.uploaded_by` is a foreign key to `users`. Before this package a `Source` token
could not upload at all: the upload rate limiter (`AppServiceProvider::actorKey()`) and both controllers called
`getAuthIdentifier()`, which a `Source` — a plain model, not `Authenticatable` — does not have, so every source
request to the upload routes ended in a `500` before any row was written (the source cases of the tests below fail
that way on the old code). Every non-null `uploaded_by` is therefore a real user upload, and the backfill gives that
user the reference. An earlier draft of this specification assumed a source upload could have stored the source's
number as a user id and asked the production track to count `Source` tokens first; that count is not needed. The
production track reports the number of rows with `uploaded_by` null; they stay without an owner, and the PR
description quotes the count.

**Owner type without a global morph map.** `App\Enums\MediaOwnerType` (`User = 'user'`, `Source = 'source'`) with
`fromActor(Model $actor): self` (a `match` on the class; any other class throws `LogicException`) and
`ownerId(Model $actor): string` (the key as stored). The earlier task
proposed `Relation::enforceMorphMap`. Do not use it: a global morph map changes `personal_access_tokens.tokenable_type`
for every new Sanctum token (both `User` and `Source` use `HasApiTokens`), so `$user->tokens()` would stop finding the
tokens that exist today. The reference table stores plain columns and needs no polymorphic relation.

**Model `App\Models\MediaFileReference`** (`const UPDATED_AT = null`, so Eloquent fills `created_at` and nothing
else; `owner_type` cast to the enum; `scopeHeldBy(Builder $query, Model $actor)` on the actor's type and id; factory
with a `heldBy($actor)` state). On `MediaFile`:

- `references(): HasMany`;
- `scopeOwnedBy(Builder $query, Model $actor): void` — `whereHas('references', …)` with `heldBy`;
- `attachOwner(Model $actor): MediaFileReference` — `createOrFirst` on the unique key (race-safe);
- `isReferencedBy(Model $actor): bool` and `isReferenced(): bool` (the method Wave 2 extends for listing photos);
- `recordFor(Model $actor, StoredOriginal $stored, MediaVisibility $visibility): self` — the upload path below;
- `contentIsRecorded(): bool` — a row exists for the same (`disk`, `sha256`), used by the delete and by the job.

`uploaded_by` stays for history only; nothing reads it for authorisation.

**Loading and authorising.** `show` and `destroy` take the id as a string and load
`MediaFile::query()->ownedBy($actor)->findOrFail($id)`; the actor comes from `ApiController::actor()`, which returns
the authenticated model (a `User` or a `Source`). The scoped load is one query for an owner, a stranger and an unknown
id; a stranger and an unknown id stop there with the same `404`, so they cannot be told apart by status, body or
query count (an owner then runs one more query in the policy). `App\Policies\MediaFilePolicy` (`view`, `delete`)
returns `Response::allow()` when `isReferencedBy` is true and `Response::denyAsNotFound('Resource not found.')`
otherwise; the controller calls `Gate::authorize` after the scoped load. Today the policy always allows what the scope
found; it is the single place where ARM roles are added later (SEC-REQ-016).

**Uploads.** `MediaController::store` and `PresignController::register` call `MediaFile::recordFor()`, which runs
`MediaFile::fromStored()` and `attachOwner($actor)` in one transaction; `fromStored()` takes the row lock
(`lockForUpdate()->firstOrCreate()`), so a concurrent last-reference delete cannot remove the row between the two
statements. The presign key becomes
`uploads/{owner_type}/{owner_id}/{ulid}.{ext}`; `register` checks the same prefix for the authenticated actor.

- `RegisterUploadRequest` validates the key with a pattern that allows only `uploads/{digits}/…`. Change the pattern
  to `^uploads\/(user|source)\/[0-9A-Za-z]+\/[A-Za-z0-9]+\.(jpg|png|webp|gif)$` and the comment above it; without
  this every new key is refused with `422` before the controller runs. A key in the old form (presigned before the
  deploy, valid for 15 minutes) answers `422` afterwards and the client asks for a new URL. No compatibility branch.
- `uploaded_by` is written only when the actor is a `User`; for a `Source` it is `null`. Put the rule in one
  place: `MediaOwnerType::uploaderId(Model $actor): ?int`.
- The rate-limit key of `throttle:uploads` and `throttle:intake` (`AppServiceProvider::actorKey()`) is built from the
  model class and `getKey()` instead of `getAuthIdentifier()`. For users the key is unchanged; for sources it stops
  the `500` described under "Backfill and sources".

**Delete.** In one transaction: lock the row, delete the caller's reference, and when `isReferenced()` is false delete
the row. Storage objects are deleted in `DB::afterCommit()`: the original key and the whole directory
`{media.paths.derived}/{sha256}` (`deleteDirectory`), not only the variants listed in the row, because a running job
may have written variants that the row does not list yet. The callback first checks that no row exists for the same
(`disk`, `sha256`): the same bytes may have been uploaded again in between, and then nothing is removed. The window
between that check and the removal is accepted in Wave 1 (no storage lock); a row that loses its original this way
ends as `failed` in the variants job and is logged by `media.variants.failed`.

**Variants job.** `GenerateImageVariantsJob` holds the model (`SerializesModels`), so a row deleted before the job
starts makes the job fail while the model is restored, before `handle()` runs. Set
`public bool $deleteWhenMissingModels = true;` so that job is dropped quietly. Before the final `save()` the job
checks that its row still exists; when it does not, and no other row exists for the same (`disk`, `sha256`), it
deletes the variants it wrote in this run and returns. `failed()` stays as it is: when the model is missing at
unserialisation the job is deleted and `failed()` never runs, and a `save()` on a row deleted later updates nothing
and cannot bring it back (a test keeps this). An earlier draft added a row-exists guard there; it has no effect.

**API contract.** Unchanged shapes. Changes in behaviour:

| Request | Before | After |
| ------- | ------ | ----- |
| `GET /api/v1/media/{id}` by an actor without a reference | `200` with URLs | `404 {"success": false, "message": "Resource not found."}` |
| `DELETE /api/v1/media/{id}` by an actor without a reference | `204`, object deleted | the same `404`; nothing changes |
| `DELETE` by one of two owners | `204`, object deleted for both | `204`; the file stays readable for the other owner |
| `POST /api/v1/media/presign` | key `uploads/{id}/…` | key `uploads/{owner_type}/{owner_id}/…` |
| `POST /api/v1/media/register` with a key under another actor's prefix | accepted when the numeric ids match | `403` `forbidden_upload` (existing `MediaException::foreignUpload`) |
| `GET` / `DELETE /api/v1/media/{id}` with an id that is not a ULID | `404` from the implicit binding, no query | the same `404` from the route constraint `whereUlid('media')`, no query |
| Any `/api/v1` read | not throttled: the `api` limiter was defined but never attached | `throttle:api` (120 per minute per actor) on the whole v1 group |
| `DELETE` by the uploader while another owner keeps the file | — | `uploaded_by` becomes `null` |
| Upload of bytes whose row is `failed` | no variants job | the job runs again (`MediaFile::needsVariants()`) |

Added after the security review of the diff (step 10). The scoped load takes the id as a string, so without the route
constraint any string reached the query; on PostgreSQL a NUL byte (`%00`, valid UTF-8, refused by the database) gave
a `500` where the old implicit binding answered `404`. The key pattern of `RegisterUploadRequest` ends in `$/D`, so a
trailing newline cannot match. A file kept by another owner no longer names the user who let go of it. A row left
`failed` by the accepted delete window (the original removed while the same bytes arrive again) recovers on the next
upload of those bytes instead of staying `failed`.

## Files

- `backend/database/migrations/<date>_create_media_file_references_table.php` (new)
- `backend/app/Enums/MediaOwnerType.php` (new)
- `backend/app/Models/MediaFileReference.php`, `backend/database/factories/MediaFileReferenceFactory.php` (new)
- `backend/app/Policies/MediaFilePolicy.php` (new)
- `backend/app/Models/MediaFile.php`, `backend/app/Http/Controllers/Api/V1/Media/MediaController.php`,
  `backend/app/Http/Controllers/Api/V1/Media/PresignController.php`,
  `backend/app/Http/Requests/Api/V1/Media/RegisterUploadRequest.php`,
  `backend/app/Jobs/Media/GenerateImageVariantsJob.php` (changed)
- `backend/app/Http/Controllers/Api/V1/ApiController.php` (`actor()`), `backend/app/Providers/AppServiceProvider.php`
  (`actorKey()`), `backend/routes/api.php` (`whereUlid`, `throttle:api`) (changed)
- `backend/tests/Feature/Media/MediaOwnershipTest.php` (new); `backend/tests/Feature/Media/MediaApiTest.php` where
  it asserts the old upload prefix, and its show and delete cases, which now give the acting user a reference
- No seeder: `MediaFile` has none, and references without media objects mean nothing
- `.ai/memory/known-issues.md` (KI-25 → resolved; shared file, see step 9)

## Steps

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/laravel-owasp-security/`,
   `.claude/skills/laravel-testing/` and rule 6 of `.ai/agents/security-reviewer.md`.
2. `php artisan make:test --pest Media/MediaOwnershipTest --no-interaction`; write the cases of "Tests" first and see
   them fail.
3. `php artisan make:migration create_media_file_references_table --no-interaction`: the table above and the backfill
   (`insertUsing` from `media_files` where `uploaded_by` is not null). `down()` drops the table.
4. `php artisan make:enum MediaOwnerType --string --no-interaction` (the folder `app/Enums` exists, so the command
   puts the class there; do not prefix the name with `Enums/`) and
   `php artisan make:model MediaFileReference --factory --no-interaction`; add the relation, the scope and the three
   methods to `MediaFile`.
5. `php artisan make:policy MediaFilePolicy --model=MediaFile --no-interaction`; keep only `view` and `delete`, typed
   on `Illuminate\Database\Eloquent\Model` for the actor (users and sources both authenticate through Sanctum).
6. `MediaController`: change `show` and `destroy` to the scoped load plus `Gate::authorize`; change `store` to the
   transaction with `attachOwner`. The route parameter stays `{media}`; the methods take `string $media`.
7. `PresignController`: build and check the prefix with `MediaOwnerType::fromActor()`; `register` attaches the owner
   in the same transaction as `fromStored()`. Change the key pattern in `RegisterUploadRequest`. Both controllers
   pass `MediaOwnerType::uploaderId($actor)` as `uploaded_by`.
8. `GenerateImageVariantsJob`: `$deleteWhenMissingModels` and the check before the final save ("Design", variants
   job).
9. Run `vendor/bin/pint --dirty --format agent`, `composer types:check`, `php artisan test --compact`. Mark KI-25
   resolved in `.ai/memory/known-issues.md` in a **separate small PR** (shared file) that merges right after this one.
10. Ask `.ai/agents/security-reviewer.md` for a review of the diff before the PR leaves draft.

## Behaviour to reproduce

No legacy behaviour: the module is HOMI's own. Rules that must hold:

- Foreign equals unknown (SEC-REQ-014): identical status, identical body bytes, identical query count.
- One `media_files` row per (`disk`, `sha256`), any number of references; the object lives while one reference exists
  (SEC-REQ-016).
- A private temporary URL is issued only to an actor that holds a reference (closes SEC-026).
- The actor type is part of the upload prefix and of the reference (closes SEC-027).

Edge cases:

- A row uploaded before the migration with `uploaded_by = null` has no reference; nobody can read or delete it through
  the API. List such rows in the PR description (count only).
- Deleting while variants are being generated: the job stops; no orphan variant is written after the delete commits.
- Re-uploading bytes after their deletion creates the object again with a fresh reference.

## Tests

`backend/tests/Feature/Media/MediaOwnershipTest.php` (Pest, factories, `Storage::fake`). A `Source` signs in with a
real token (`createToken()` and `withToken()`): `Sanctum::actingAs()` needs an `Authenticatable` and throws a
`TypeError` for a `Source`. Presign runs against an S3 disk defined in the test; presigning signs locally and sends
nothing.

- `it('returns 404 when another user shows a private media file')` and the same for a public one.
- `it('returns 404 when another user deletes a media file and keeps it intact')` — row, reference, original and
  variants asserted.
- `it('answers foreign and unknown ids with identical status, body and query count')` — `DB::enableQueryLog()`.
- `it('creates one row and two references when two actors upload identical bytes')`.
- `it('deletes only the caller reference when two owners share the bytes')`;
  `it('deletes the object and its variants after the last reference')`.
- `it('refuses to register an upload under another actor type prefix')` — `User` 5 and `Source` 5 from factories, both
  directions.
- `it('issues presign keys under the actor type prefix')`.
- `it('rejects a register key in the old form with 422')` and `it('accepts a register key in the new form')`.
- `it('stores no uploader for a source actor')` — `uploaded_by` is `null`, the reference has `owner_type = source`.
- `it('backfills a user reference for rows that existed before the migration')` — run the migration file's `down()`,
  insert a row with an uploader and one without, run `up()`. The file is called directly, so a later migration cannot
  change which one is rolled back.
- `it('drops the variants job when the media row was deleted before it ran')` — the job has
  `deleteWhenMissingModels`; `it('removes its own variants when the row disappears during the run')`.
- `it('keeps the objects when the same bytes were uploaded again before the delete finished')`.
- `it('never confuses a user and a source with the same id')`; `it('lets the media policy allow only actors that hold
  a reference')` — the policy's refusal is a `404` with the body of an unknown id.
- `it('stores the uploader and a user reference for a user actor')`;
  `it('re-creates the object with a fresh reference when deleted bytes are uploaded again')`.
- `it('keeps the variants when the same bytes were uploaded again during the run')`;
  `it('does not bring a deleted row back when the variants job fails')`.
- `it('keeps existing sanctum tokens resolvable without a morph map')`.
- From the security review: `it('answers a malformed media id like an unknown one without touching the database')`
  (GET and DELETE; `not-a-ulid`, `%00`, a 28-character id), `it('rejects a register key with a trailing newline')`,
  `it('derives the variants again when the same bytes arrive for a failed row')`,
  `it('clears the uploader when the uploader leaves and another owner stays')`,
  `it('throttles reads of media files per actor')`.
- `it('keeps one reference when the same actor attaches twice')` — `attachOwner` called twice. The case with
  parallel uploads needs PostgreSQL and child processes; WP-03 writes it as the first test of the `pgsql` group
  (`backend/tests/Pgsql/MediaOwnershipRaceTest.php`).

The existing media suites stay green; only assertions on the old key prefix change.

## Acceptance checklist

- [ ] User B cannot read or delete user A's media: `404`, and A's row, reference, original and variants are unchanged.
- [ ] Two actors uploading the same bytes produce one row and two references; the first `DELETE` returns `204` and
      the file stays readable for the other; the object disappears after the second.
- [ ] A source token with id 5 cannot register a key under `uploads/user/5/…`, and a user cannot register one under
      `uploads/source/5/…`.
- [ ] Foreign and unknown ids give byte-identical bodies and the same query count.
- [ ] No global morph map was registered; existing Sanctum tokens still resolve (`$user->tokens()->count()` in a test).
- [ ] An upload by a source token writes `uploaded_by = null` and a `source` reference; a new-form key registers and
      an old-form key answers `422`.
- [ ] The two counts from the production track are quoted in the PR description, and the backfill rule that followed
      from them is named.
- [ ] `make ci-backend` is green; Pint and PHPStan level 7 are clean.
- [ ] The PR description names the migration, the backfill and the count of rows without an owner.
- [ ] KI-25 is marked resolved in a separate shared-file PR.
- [ ] Deployed to staging and production; `GET` of a foreign id on staging answers `404`.

## Handoff

2026-11-14, development track (Claude Code). Branch `feat/wp-00-media-ownership-fix`; status `REVIEW`.

- **Done:** every step of "Steps" except the deploy. Tests first (RED: 27 of 54 media tests passed, every new case
  failed for the missing feature), then the code; `make ci-backend` exit 0 (Pest 92 of 92, PHPStan 0 errors, Pint
  clean). Specification corrected against the code (backfill premise, `actorKey()`, `failed()` guard, test notes).
  Security review by `.ai/agents/security-reviewer.md`: no blocker; S1, S2, S4 (minimum), S5 and S6 fixed in this
  branch (see "API contract").
- **Open, outside this package:** deleting the objects is a single attempt after commit; with `throw => false` on the
  S3 disks a storage failure leaves the original and variants in the bucket without a log or a retry (review S3;
  queued delete with retries and a sweep for objects without a row: KI-27). A presigned upload has no size bound and
  `register` reads the whole object into memory before the size check (review N4, existed before: KI-28). A second
  uploader of identical bytes learns that they were uploaded before, and when (review N1; matters once private
  documents arrive). References have no foreign key to their owner; the erasure package (WP-47) must delete them.
- **PostgreSQL:** the migration ran on the developer's dev database (PostgreSQL 18.6); `down()`, backfill and `up()`,
  a double `attachOwner()` and the owner scope under `FOR UPDATE` were checked there in a rolled-back transaction.
  **Not verified:** the parallel-upload race; it is WP-03's first `pgsql` test.
- **Next step:** review and merge of the PR by the other developer; the production track reports the two counts,
  approves the migration on production and deploys; then `GET` of a foreign id on staging must answer `404`, the
  queue row becomes `DONE`, and the KI-25 PR merges.
