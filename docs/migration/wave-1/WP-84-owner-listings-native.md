# WP-84 — Owner listings: native service, boundaries, harvested medians

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-40, WP-42, WP-44, WP-46, WP-47 |
| Size | about 3 600 changed lines with tests, L — above the guide: two PRs, part A = tables, drafts, form, photos, boundaries and the place lookup, the shown point; part B = the phone window and number, publish and checks, statuses, limits, the operators' commands, the waitlist, the harvester and the demand method, erasure entries, the switch |
| Behaviour reference | `02` §12a (BR-API-159 … BR-API-178, BR-API-182), LB-API-056; `08` API-037 … API-046, API-050 … API-053; `03` LB-APP-054, LB-APP-061, LB-APP-063; `07` §2.5 (BR-API-057, BR-API-059, BR-API-060); `16` SEC-036, SEC-037, SEC-040, SEC-REQ-051, SEC-REQ-052, SEC-REQ-045 |
| Needs from the production track | (1) Approval of the migrations: `owner_listings` (with the plain `phone`, `phone_author_key`, the phone consent columns, `photo_token`, the true and the shown point as `geography(Point,4326)`), `owner_listing_photos`, `owner_listing_opens`, `owner_waitlist`, `owner_phone_denials`, `owner_moderation_actions` (append-only by a trigger), `owner_check_results`, `geo_boundaries` (`geometry(MultiPolygon,4326)`), `harvested_medians`, the native number sequence. (2) PostGIS in `homi_db` before the deploy (`docs/infrastructure/deployment.md:140`, its own go). (3) Env `SHOWN_POINT_SECRET` (random, at least 32 bytes, per environment, in the password manager) and `OWNER_MODERATOR_IDS` (blank until the switch-on), through a shared-file PR; `OWNER_CABINET_ENABLED` stays unset and `OWNER_CABINET_ALLOWED_IDS` blank (WP-80); `AUTHOR_KEY_SECRET` (WP-42) is set, because the realtor check and the native author key read it. (4) The CDN host serves `owner/` of the public disk on staging and production. A deleted `owner/` key can stay in the edge cache for up to an hour (`docs/infrastructure/cdn.md`, "What the CDN vhost does"); an automatic purge of such keys, if the production track can offer one, closes that gap, and until then the privacy text says "up to one hour". (5) `php artisan geo:load-boundaries` once per environment after the deploy (Q-DATA-051). (6) The PostgreSQL service of `.github/workflows/backend.yml` (today `postgres:18`) gains PostGIS, a shared-file change, because the migrations and `composer openapi:export` run on it. (7) Before the switch goes on anywhere, Telescope must not record the cabinet's requests and jobs with values: this package's filter does it in code ("Leak protections"); whether `TELESCOPE_RECORD_ALL` changes on the servers is the production track's decision. (8) `upload_max_filesize`, `post_max_size` and nginx `client_max_body_size` of the API host equal `media.max_bytes` |

## Goal

The owner methods of WP-80 answer from HOMI's own tables. The owner's number is kept as DEC-72 says, in plain text
with the listing and readable by two code paths only. Publish runs the automatic checks of DEC-73 and DEC-77: a
listing that passes is active at once, one that the realtor check flags waits on hold for the operators; votes put a
listing on hold, and the operators decide. City and district come from HOMI's
own boundaries in PostGIS, and the usual price and the market verdict from the medians HOMI harvests from the
legacy cards it reads. The protections against a leak of the number, the point and the request texts ship here,
before any of them is stored.

## Scope

In, part A (first PR):

- The migrations, models and factories of `owner_listings`, `owner_listing_photos`, `owner_listing_opens`,
  `geo_boundaries` and the native number sequence.
- Drafts with reuse (DEV-054); the form and its validation, with the ranges of WP-80 and the server's own checks;
  `PATCH` live on a published listing (DEC-80); delete of a draft or a rejected listing.
- Photos through `HashedUploader`, its declared size checked before decoding and GIF refused: private until publish;
  public copies under an unguessable path on publish and on every change; deleted at once when the listing is held
  or leaves the feed for good; an original shared by identical uploads is deleted only with its last reference.
- The leak protections: the cabinet's Telescope filter and the exception mapping of its tables ("Leak protections").
- The true point (5 decimals) and the shown point; `geo:load-boundaries`; the point check against the country and
  the city (LB-APP-063); `GET /owner/place`.

In, part B (second PR):

- The phone window and the number (DEC-72): set by the seam WP-88 builds, held in a masking cast, read only by the
  owner's view and by WP-85's disclosure inside `ContactService::disclose()` (WP-43); the moment of consent.
- Publish with the automatic checks; statuses and their effects; the limits per account and per phone; the
  allow-list `owner.allowed_ids`; `held` by the realtor check, the votes (WP-44) and the operators, with the evidence
  in `owner_check_results`, kept until an operator decides, with the reminder after 24 h (DEC-83); `withdrawn` by
  the operators' commands; the waitlist (`owner_waitlist`,
  `owner_phone_denials`, `owner_moderation_actions`).
- The harvester (`harvested_medians`) on WP-42's card read and `GET /owner/demand`; the stats of a listing.
- Erasure entries in WP-47's registry, the 90-day purge and the purge of stale drafts; `GET /me`'s
  `owner.has_listings` and `owner.waitlisted`; the switch of DEC-81 kept on the routes WP-80 names.
- The events `OwnerListingPublished`, `OwnerListingWithdrawn`, `OwnerListingRented`, `OwnerListingHeld`,
  `OwnerListingEdited`, `OwnerHoldOverdue` and `OwnerListingErased` for WP-86, WP-85 and WP-89.

Out:

- Requests, their limits, answers and `owner.pending` — WP-85.
- The owner listings in the feed, count, new-since, flow, map and card, and their presenter — WP-86.
- Every bot message: the contact branch of the phone window (WP-88), the operators' notice with «Снять» and the
  request messages (WP-89).
- The relay (WP-87).

## Decisions that bind this package

- DEC-70: owner listings live in HOMI's tables; they are the first listing data HOMI owns in Wave 1. Their numbers
  come from one sequence that starts at the native floor of WP-80 ("Native numbers").
- DEC-72: the owner's number is stored in plain text in `owner_listings.phone`, as legacy keeps it (BR-API-172,
  `UNVERIFIED`; LB-API-056). It is shown to the owner himself and given to a seeker only by the contact method. The
  `/owner` verification of the bot keeps its keyed hash (DEV-011); the phone window keeps the two apart. Because the
  number is readable, SEC-036 and SEC-REQ-051 are requirements of this package, not options: the database dumps are
  not encrypted (`docs/infrastructure/backup-recovery.md:19`), so nothing else may hold the number.
- DEC-73: post-moderation. Publish runs the automatic checks and a listing that passes is `active` at once; HOMI's
  report votes and the operators take it down later, and each publication reaches the operators with a «Снять»
  button. The notices are WP-89's; this package raises the events: `OwnerListingPublished` at every publish (`first`,
  and `released` when a listing returns to the feed after an operator released its hold), `OwnerListingHeld` when the
  checks or the votes hold a listing, and `OwnerListingEdited` when the photos or the description of an `active`
  listing change; a resume (`resumed`) carries the groups changed while the owner had the listing paused. That WP-89
  sends them to the operators' private chats from HOMI's main bot, and announces an edit at most once per listing per
  hour, are integrator defaults (below).
- DEC-74, DEC-80, DEC-84: DEV-054 (one open draft), DEV-055 (the contact mode is always chosen), DEV-056 (a way
  forward after a rejection), DEV-061 (no IP lookup), DEV-062 (every save is live) and DEV-063 (a small demand is
  «несколько человек») are on without flags.
- DEC-77: «Проверенный хозяин» on a native listing means that the owner confirmed his own number with Telegram;
  HOMI runs its own realtor check at publish. It labels people, so it never decides alone (below) and the security
  review of WP-70 checks it (SEC-REQ-045).
- DEC-78: the medians of the `comparison` block of the legacy cards HOMI reads are harvested; wherever one exists the
  owner listing has the verdict, the form shows the usual price, and `stats.price_delta` is set. Sparse at first.
- DEC-79: city and district come from HOMI's own boundaries in PostGIS, loaded from an open source with its
  attribution — `UNVERIFIED` until checked (Q-DATA-051). The owner types the landmark; there is no street address.
- DEC-81: the switch `OWNER_CABINET_ENABLED` stays on the routes WP-80 names ("The switch (DEC-81)"); this package
  adds the allow-list `owner.allowed_ids` to the create, phone-request and publish routes. On the servers the switch
  stays off until WP-89.
- DEC-82: `PUT /owner/waitlist` records the caller and `GET /me` says so; no screen of Wave 1 calls it.
- DEC-83: a held listing stays held until an operator decides; nothing releases it by time, and the operators get a
  reminder after 24 h ("Moderation").
- DEC-84: `GET /owner/demand` gives the exact count from 5 matching radars, `count: null` with `few: true` for 1 … 4,
  and `count: 0` for none ("Harvested medians and demand").
- DEC-86: a realtor vote from the bot is the same vote of `VoteService` as the Mini App's, so its threshold holds a
  native listing like any other (`votes_agent`, "Moderation").
- DEC-87: the consent text the phone step shows is approved by the lawyer before the production switch-on and marked
  "pending legal review" until then; `consent_version` names the version in force.
- DEC-88: `owner.allowed_ids` is the staging run's allow-list of staff accounts before the legal gate (WP-89).
- DEC-48: HOMI's report votes act on native listings too, and are never passed to legacy.
- DEC-51: while radars are off, `GET /owner/demand` answers `count: 0` with `few: false`, and `stats.sent` is 0.
- DEC-12 (retention, open): the 90-day period below is a configurable default.
- *Integrator defaults, listed for the reviewer* (the owner-cabinet plan's defaults, not decisions of the developer;
  listed in that PR):
  - the native number floor is 10 000 000 (`owner.native_number_floor`), one PostgreSQL sequence, a number at the
    first publish;
  - the shown point is derived from the owner and the 100 m grid cell of the true point with `SHOWN_POINT_SECRET`,
    never from the exact point or the listing: an offset of 50 … 420 m from the cell's centre, so it is at most 491 m
    from the true point and the circle of `geo_radius_m` (500) always contains the true point (default 29);
  - the phone window: `POST /owner/listings/{id}/phone-request` opens ten minutes in which an own `+998` contact
    shared with HOMI's bot becomes the draft's number; outside a window a contact goes to `/owner`;
  - the realtor check of DEC-77: an `agent` signal when the number's author key (`phone:` + HMAC with
    `AUTHOR_KEY_SECRET`, WP-42) was seen on legacy listings of three or more different flats (the `/owner` threshold,
    BR-API-109; native numbers are not counted) or is marked by HOMI's votes. The signal never rejects: the listing is
    held (`hold_reason: check_agent`) with the evidence in `owner_check_results`, the operators decide (`owner:release`,
    `owner:withdraw`, `owner:deny-phone`), and the owner sees «На проверке» without being told he was marked (default
    26; the hold waits for an operator, DEC-83). `denied` (legacy's `fraud`; default 32) from the operators' deny
    list rejects; `limit` at two listings per phone across accounts rejects at the confirmation;
  - a vote threshold of WP-44 on a native number (`agent`, `fraud`, `rented`) holds the listing (`votes_agent`,
    `votes_fraud`, `votes_rented`) with the counts in `owner_check_results`; it never withdraws on its own;
  - limits: two listings per account and two per phone; drafts do not count; ten photos;
  - the operators' notices go from HOMI's main bot to `OWNER_MODERATOR_IDS` (empty: no notice): every publish (the
    first and every return after a released hold), every hold by the checks or the votes, and a change of the photos
    or the description of an `active` listing, at most once per listing per hour, or of a paused one when it is
    resumed (default 25); «Снять» sets `held`
    with reason
    `moderator`; console commands `owner:hold`, `owner:release`, `owner:withdraw`, `owner:deny-phone` with `--reason`
    and `--by`, logged with who and the system user, the audit table append-only; `owner:deny-phone` takes a listing
    or a number on standard input, never a number on the command line; WP-59's operator list is not used, because
    WP-59 comes after WP-89;
  - harvested medians: from `comparison` with `scope` `district` or `city` of every legacy card read through WP-42,
    kept per city, district, rooms and deal with `n` and `updated`, ignored when older than 60 days (after the 60-day
    window of BR-API-057); the usual price is the median ± 10 % (BR-API-059); the verdict's tone by BR-API-059 and
    BR-API-060;
  - retention: an owner listing's number, texts and photos are erased 90 days after it left the feed for good
    (`rented`, `removed`, `withdrawn`), the period legacy's privacy text promises (BR-BOT-093); a draft not changed
    for 180 days is deleted with its photos; a deny-list entry expires three years after its last hit;
  - the cabinet is long-term rent only, as legacy's form (`03` SCR-052): `deal` of a native listing is always
    `rent_long`;
  - `publish` of a `paused` listing keeps it paused (only `PUT …/status active` resumes it); a `rejected` listing can
    be published again only after the operators release it (`owner:release`);
  - no relisting from «История»: legacy has none;
  - a published listing's photos are public copies under `owner/<token>/<n>.jpg?v=<version>`, `<token>` 20 random
    digits new for every version, no listing number in the path; the copies of a `held`, `withdrawn`, `rented` or
    `removed` listing are deleted at once (default 27);
  - the leak protections — the cabinet's Telescope filter, the masking cast of the number, the exception mapping of
    the cabinet's tables — ship here, before any owner data is stored, not with WP-70 (default 28);
  - `OWNER_CABINET_ALLOWED_IDS` (WP-80): when set, only these Telegram ids may create a draft, ask for the phone and
    publish (the staging run with staff accounts of DEC-88; default 30);
  - the moment a number is accepted is recorded with the version of the privacy text in force
    (`phone_consented_at`, `phone_consent_version`) and erased with the number; the wording of the consent is
    approved by the lawyer before the production switch-on, and marked "pending legal review" until then (DEC-87,
    Q-SEC-021);
  - defaults of this specification: the sanity range of the price at publish is 50 … 20 000 USD a month (the
    median's bounds of BR-API-057); the tone of a verdict is `good` at 10 % or more below the median, `same` within
    10 %, `null` above, because the thresholds of `check` and `suspicious` are unknown (Q-API-021); a number that
    reaches the phone limit at its confirmation rejects the listing (`reject_reason: limit`), while a limit reached
    later answers `409 owner_limit` with `limit: phone` at publish; the untouched draft is answered whatever the
    limit; owner uploads refuse GIF and a declared size above `media.max_pixels` (40 megapixels) before decoding; an
    original is deleted only when no reference names it; the demand answers are cached for five minutes; the realtor
    check can be turned off in configuration (`owner.checks.agent`), the kill switch of SEC-REQ-045; four more tables
    than the plan named (`owner_listing_opens`, `owner_phone_denials`, `owner_moderation_actions`,
    `owner_check_results`).

## Design

The controllers of WP-80 keep their routes, requests and resources and get real bodies; the stub bodies move into
`NativeStubs` (WP-40, "Stub mode for the end-to-end suite"). Every owner query is scoped to the caller
(`OwnerListing::query()->whereBelongsTo($user)`), so a foreign id is `404 not_found` without a policy branch
(SEC-REQ-014). Classes live in `App\Services\Owner`; models in `App\Models`. `EnsureOwnerCabinetEnabled` (WP-80)
gains the allow-list: on the create, phone-request and publish routes (the middleware parameter `allowlist`), a
caller whose `telegram_user_id` is not in a non-empty `owner.allowed_ids` answers `403 owner_disabled`.

### Tables (part A unless marked)

| Table | Columns | Notes |
| ----- | ------- | ----- |
| `owner_listings` | `id` (ULID, primary key); `user_id` (foreign key, cascade); `number` (`unsignedBigInteger`, unique, nullable); `status` (string 16); `withdrawn_at`, `held_at`, `hold_reminded_at` (`timestampTz`, nullable); `hold_reason` (string 16, nullable: `check_agent`, `votes_agent`, `votes_fraud`, `votes_rented`, `moderator`), `withdraw_reason` (string 32, nullable); `photo_token` (char 20, nullable: the current version of the public copies); `paused_edits` (json, nullable: the groups `photos`, `description` changed while the owner had the listing paused); `published_at`, `left_feed_at`, `purged_at` (nullable); `city`, `district_code` (string 64, nullable); `landmark` (string 120, nullable); `location`, `shown_location` (`geography(Point,4326)`, nullable); `room` (boolean, default false); `rooms`, `floor`, `floors_total` (smallint, nullable); `area_m2` (`decimal(7,1)`, nullable); `price` (bigint, nullable); `currency` (char 3, default `USD`); `price_usd` (integer, nullable); `renovation` (string 32, nullable); `furniture`, `pets` (boolean, nullable); `tenants` (json); `description` (text, nullable); `contact_mode` (string 8, default `request`); part B: `phone` (string 16, nullable, E.164, plain, cast by `OwnerPhoneCast`), `phone_author_key` (string 96, nullable, indexed), `phone_error`, `reject_reason` (string 8, nullable: `denied`, `limit`), `phone_window_until`, `phone_consented_at` (`timestampTz`, nullable), `phone_consent_version` (string 16, nullable); timestamps | index (`user_id`, `created_at`); partial index (`city`, `status`) for the listed rows; GiST on `shown_location` |
| `owner_listing_photos` | `id` (ULID); `owner_listing_id` (foreign key, cascade); `position` (smallint); `original_path` (string; the key of `HashedUploader` on the private disk, shared by identical uploads); `version` (char 8: the first 8 hex of the stored bytes' SHA-256); timestamps | unique (`owner_listing_id`, `position`); index (`original_path`): a row is a reference, not the object |
| `owner_listing_opens` | `owner_listing_id` (foreign key, cascade); `day` (date, Asia/Tashkent); `opens` (integer) | primary key (`owner_listing_id`, `day`); the source of `stats.daily` |
| `geo_boundaries` | `id`; `kind` (`country`, `city`, `district`); `code` (string 64); `city_code` (string 64, nullable); `geom` (`geometry(MultiPolygon,4326)`); `source`, `licence`, `attribution` (string); `loaded_at` | unique (`kind`, `code`); GiST on `geom` |
| `owner_waitlist` (B) | `user_id` (primary key, foreign key, cascade); `created_at` | |
| `owner_phone_denials` (B) | `phone_author_key` (primary key); `reason` (string 64); `added_by` (string 64); `created_at`; `last_hit_at` (`timestampTz`, nullable) | the deny list behind `reject_reason: denied`; holds no number |
| `owner_moderation_actions` (B) | `id`; `owner_listing_id` (ULID, nullable, no foreign key); `action` (`hold`, `release`, `withdraw`, `deny_phone`); `reason`; `by` (string 64: the operator's Telegram id, the `--by` of a command, or `system`); `system_user` (string 64: `SUDO_USER`, else the process owner; `bot` or `app` inside the application); `created_at` | audit, no user link; append-only: a PostgreSQL trigger refuses `UPDATE` and `DELETE` (SEC-REQ-046) |
| `owner_check_results` (B) | `id`; `owner_listing_id` (foreign key, cascade); `signal` (`check_agent`, `votes_agent`, `votes_fraud`, `votes_rented`); `counts` (json: counts only — distinct legacy numbers seen with the key, vote weight and voters; never a key, a number or a user id); `rule_version` (string 16); `created_at` | the evidence of every automatic hold |
| `harvested_medians` (B) | `city`, `district_code` (string 64; empty for the city scope), `rooms` (smallint), `deal` (string 16); `value_usd`, `n` (integer); `updated` (date); `harvested_at` | primary key (`city`, `district_code`, `rooms`, `deal`) |

The sequence `owner_listing_numbers` starts at `config('owner.native_number_floor')` and is created by a migration
with a PostgreSQL statement; `App\Services\Owner\NativeNumbers::next(): int` reads `nextval()`, and on SQLite (the
default test suite) takes the larger of the floor and `max(number) + 1` under a lock. The geography and geometry
columns use the schema builder's `geography()` and `geometry()` types; every PostGIS function runs behind
`App\Services\Owner\Contracts\PlaceLookup` and is tested in `tests/Pgsql` (`Tests\PgsqlTestCase`, `make
test-pgsql`), while the SQLite suites bind a fake lookup.

Models with factories (`php artisan make:model OwnerListing --factory --migration` and the same for the others):
`OwnerListing` (`HasUlids`; `phone` in `$hidden` and cast by `App\Casts\OwnerPhoneCast`, cast `tenants` to an
array), `OwnerListingPhoto`, `OwnerListingOpen`, `GeoBoundary`, `OwnerWaitlistEntry`, `OwnerPhoneDenial`,
`OwnerModerationAction`, `OwnerCheckResult`, `HarvestedMedian`.

### Drafts and the form (`OwnerListingService`)

- `draft(User): array{OwnerListing, bool}` — the caller's untouched draft (no form key set beyond the defaults and
  no photo) when one exists, whatever the limit (DEV-054); else, while the caller has `limits.listings` listings that
  count (`active` or `paused`, not `withdrawn`), `OwnerLimitReached` (`limit: account`); else a new one. The boolean
  says whether it was created (`201` / `200` of WP-80). A new draft: `contact_mode: request` (DEV-055), `currency: USD`,
  `city` from the user's settings (WP-40).
- `update(OwnerListing, array $fields)` — the validated keys of `UpdateOwnerListingRequest` (WP-80); `lat` and `lon`
  are stored as a point rounded to 5 decimals. Server checks after the form request: `district_code` must belong to
  `city`; a point must lie inside the country and inside `city` (the point check below) → `422` with
  `errors.point`; `floor ≤ floors_total`. `price_usd` is computed from `price` and `currency` with the rate of
  `GET /reference` (`rates.usd_uzs`) at save, and `php artisan owner:reprice` (daily, 05:00 Asia/Tashkent) recomputes
  it for `UZS` rows. A changed point recomputes the shown point. A `held`, `withdrawn`, `rented` or `removed` listing
  → `OwnerListingLocked`.
- A change of a published listing is live at once (DEC-80, DEV-062): there is no revision and no second save. A save
  that changes the description of an `active` listing, and every photo change of one ("Photos"), dispatches
  `OwnerListingEdited` (listing id, the changed groups `photos` and `description`) after commit; WP-89 folds the
  edits of an hour into one notice to the operators (DEC-73). The same change of a listing the owner paused adds the
  group to `paused_edits` instead; the resume raises `OwnerListingPublished` (`resumed`) with `fields` = those groups
  and clears them, so WP-89 announces them at the resume (default 25).
- `destroy(OwnerListing)` — a draft or a `rejected` listing: its photo rows and the listing row are deleted in one
  transaction, and each original that no other reference names with them (DEV-056; "Photos"); else
  `OwnerListingLocked`.
- The description is stored as the owner wrote it and shown to him so; every public answer masks it through
  `ListingDetails::fromArray()` (WP-12, "Phone numbers in listing texts"; BR-API-165). Publish does not refuse a text
  with a number in it.

### Photos (`OwnerPhotoService`)

- Upload: `StoreOwnerPhotoRequest` (WP-80) and an allow-list argument of `HashedUploader::storeUploadedFile()` accept
  `image/jpeg`, `image/png` and `image/webp` only; a GIF answers `unsupported_mime`. Before decoding,
  `HashedUploader` reads the declared size with `getimagesizefromstring()`: an unreadable header → `undecodable`, a
  side above `media.max_dimension` or `width × height` above `media.max_pixels` (40 000 000, new in
  `backend/config/media.php`) → `too_big`, each without decoding (SEC-REQ-023). Today it decodes first
  (`backend/app/Services/Media/HashedUploader.php:50-59`), so a small file declaring a huge canvas costs the worker
  its memory; the change protects `POST /media` of the media module as well (ADR-0012). Then it sniffs the type,
  decodes, applies the orientation, drops EXIF and every other metadata block, re-encodes and stores the original
  under `originals/{sha256}.{ext}` of the private disk (`HashedUploader.php:19-24`). That is the fix of LB-APP-061 (a
  failed client conversion sent the original with its GPS position; SEC-037). Its `MediaException` answers keep
  their codes. The photo becomes the last position; at `limits.owner_photos` → `OwnerPhotoLimit`.
- References: identical bytes give one original (the key is the SHA-256 of the re-encoded bytes), so two owners who
  upload the same photo share it. An `owner_listing_photos` row is a reference; an original is deleted only when no
  `owner_listing_photos` row and no `media_files` row of the media module (which counts its own holders in
  `media_file_references`) names its key, checked in the same transaction as the deletion of the reference, under a
  lock on the key (SEC-REQ-016). Destroy, erasure and the purges delete
  references.
- Addresses: a listing without a number shows its photos through temporary URLs of the private disk
  (`MediaUrlBuilder`, `media.temporary_url_minutes`); the Mini App's `img-src` must allow that host, which WP-81 adds
  to the app's CSP and checks inside Telegram on staging. A published listing's photos are public copies on the
  public disk: `owner/<token>/<n>.jpg` (JPEG, long side at most 2 048 px) and `owner/<token>/<n>.s.jpg` (480 px),
  `<n>` the position from 1, with the address `<MEDIA_PUBLIC_URL>/owner/<token>/<n>.jpg?v=<version>` (`<version>` the
  photo's `version`). `<token>` is 20 random decimal digits (two `random_int()` parts of ten digits), new for every
  version of the copies and stored as `owner_listings.photo_token`; no path holds the listing number, so the copies
  cannot be walked from 10 000 000. The path keeps the form `…/<digits>/<digits>.jpg?…` from which the client derives
  the small variant (`MEDIA_PHOTO` of `frontend/app/features/feed/images.ts:17`, which needs the query), so WP-24,
  WP-26 and the bot cards need no change. The media module's own WebP variants stay for other uses.
- On publish, on the release of a hold, and on every photo change of a published listing (add, delete, order), the
  public copies are written again for every position under a new token (a job on the `media` queue, unique per
  listing); the new token is stored after the copies exist, and then the previous token's keys are deleted. The CDN
  ignores query strings (`docs/infrastructure/cdn.md`, "What the CDN vhost does"), so a new path, not a new `?v=`,
  is what replaces a photo for seekers.
- The public copies are deleted at once, in the same job, when the listing is held (any `hold_reason`) or leaves the
  feed for good (`rented`, `removed`, `withdrawn`), and on erasure; they are kept while it is `active` or paused by
  its owner. The edge cache may still answer a deleted key for up to an hour to a client that already holds its
  address (the production track's need (4)). The private originals stay for the owner's «История» until the purge
  below.
- Order: the full list of ids; another set → `422` naming `ids` (WP-80).

### Location (`ShownPoint`, `PlaceLookup`)

- `ShownPoint::for(int $ownerId, GeoPoint $true): GeoPoint` — the true point is snapped to a cell of a 100 m grid in
  Web-Mercator coordinates (EPSG:3857; `floor(x / 100)`, `floor(y / 100)`); `h` = HMAC-SHA-256 of `"shown|<owner user
  id>|<cell x>|<cell y>"` keyed with `config('owner.shown_point.secret')` (`SHOWN_POINT_SECRET`), never of the exact
  point and never of the listing; the bearing is the first two bytes of `h` scaled to 0 … 360°, the distance
  `sqrt(u × (max² − min²) + min²)` with `u` the next two bytes scaled to 0 … 1 and `min_offset_m` … `max_offset_m`
  = 50 … 420 m (uniform over the ring); the shown point is the cell's centre moved by that vector. The same owner gets
  the same shown point for every listing and season in that cell, a move inside the cell changes nothing, and
  another account's draft at the same point gets another one, so a pin set by an attacker in every nearby cell
  reveals nothing about this owner. The shown point is at most 491 m from the true point (half the cell's diagonal
  plus 420 m), so the circle of `geo_radius_m` (500) that seekers see always contains it («ищущие видят только круг
  около 500 м», SCR-052). An empty secret outside `local` and `testing` fails closed: publish answers `503
  source_unavailable` and logs once; WP-70's `security:check` knows the key. Residuals, recorded for WP-70's review:
  a pin moved across a cell boundary shows two neighbouring cells; an owner who erases his data and returns has a new
  id; `district_code` comes from the true point, so a circle across a district boundary is halved by the district.
- The true point is returned only by `GET /owner/listings/{id}` to its owner. Every public use — `location` of the
  preview, the map points, `center_km`, the metro distance, the polygon filter — reads `shown_location`
  (SEC-REQ-052, SEC-040); WP-86 builds those reads, this package stores the column.
- `PlaceLookup::at(float $lat, float $lon): OwnerPlace` — `PostgisPlaceLookup` with `ST_Contains` over
  `geo_boundaries`: the city whose polygon contains the point and the district of that city, either `null`.
  `GET /owner/place` answers it (DEC-79; API-051). No IP lookup exists (DEV-061; API-052 is not built).
- The point check of `update` and publish: the point lies inside the `country` polygon and inside the polygon of
  `form.city` (fix of LB-APP-063); without loaded boundaries the check refuses every point with `errors.point` and
  logs once, so nothing is published unchecked.
- `php artisan geo:load-boundaries {path} --source= --licence= --attribution=` loads a GeoJSON FeatureCollection whose
  features carry `kind`, `code` and, for a district, `city_code`; every code must be a city or district code of
  `GET /reference` (the command lists the codes it could not map and loads nothing then); a reload replaces the
  rows in one transaction. The dataset is not chosen here: candidates to check are OpenStreetMap administrative
  boundaries, geoBoundaries and GADM, with no licence claimed for any (Q-DATA-051, `UNVERIFIED`). The attribution is
  stored with the rows; how the picker shows it is WP-81's.

### Leak protections (part A; DEC-72, SEC-REQ-051, SEC-REQ-052)

`$hidden` keeps a column out of `toArray()` only; a failed query, a Telescope entry or an exception message would
still carry the value. Three protections ship with the first PR, before any owner data is stored, so that no
staging run of WP-88 or WP-89 meets an unprotected stack:

- Telescope (`backend/app/Providers/TelescopeServiceProvider.php`): its filter rejects, whatever
  `telescope.record_all` says, every request entry under `api/v1/owner` and `api/v1/listings/*/contact*`, every job
  entry of a job class under `App\Jobs\Owner` and `App\Jobs\Requests`, every query entry whose SQL names
  `owner_listings`, `owner_check_results` or `contact_requests`, and every model entry of `OwnerListing` and
  `ContactRequest` (WP-85), failed ones included; outside `local`, `hideRequestParameters` gains `phone`, `lat`,
  `lon`, `init_data`, `initData`, `message` and `move_in` for every other route. An exception of the cabinet is still
  recorded, with the mapped message below.
- Exceptions (`backend/bootstrap/app.php` and `App\Services\Owner\PersonalWrites`): a `QueryException` whose SQL
  names one of those tables becomes `App\Exceptions\Owner\PersonalDataWriteFailed`, which carries `getSql()` (the
  placeholders, never the bindings) and the SQLSTATE only, has no previous exception, and renders as `503
  source_unavailable`. The handler maps it for every report; because a queued job's `failed_jobs.exception` records
  the job's own exception before the handler sees it, the cabinet's writes and jobs also run through
  `PersonalWrites::run()`, which rethrows the same mapped exception at the write.
- The number (part B, with its column): `App\Casts\OwnerPhoneCast` casts `owner_listings.phone` to
  `App\Services\Owner\OwnerPhone`, whose `__toString()`, `jsonSerialize()`, `__debugInfo()` and `__serialize()` give
  `[hidden]`; `reveal(): string` is called only by `phoneForOwnerView()` and `phoneForDisclosure()` (below). The raw
  attributes (`getAttributes()`, `getChanges()`) bypass a cast: they stay out of Telescope by the filter and out of
  the code by `PhoneLeakTest`'s scan.

WP-85 adds its columns to the same mechanisms; the bot side (the contact branch of the phone window) is WP-88's.

### The phone window and the number (part B; `PhoneWindow`)

- `open(OwnerListing): OwnerListing` — behind `POST /owner/listings/{id}/phone-request`: sets `phone_window_until =
  now + owner.phone_window_minutes` (10) and clears `phone_error`. A second call extends the window.
- `accept(int $senderTelegramId, int $contactUserId, string $phone): ?OwnerListing` — the seam WP-88 calls from the
  contact branch, before WP-50's redactor hashes the contact. It finds the newest listing of the user with that
  Telegram id whose window is open; none → `null`, and the contact goes to `/owner` as today (DEV-011). Then:
  - `contactUserId !== senderTelegramId` → `phone_error: not_own` (a forwarded contact);
  - a number that is not `+998` → `phone_error: not_uz`;
  - else `phone` = the number in E.164, `phone_author_key` = `AuthorKey` of WP-42 ("`listing_refs` and author
    keys"): `phone:` + the first 32 hex of HMAC-SHA-256 of the E.164 number with `AUTHOR_KEY_SECRET`;
    `phone_consented_at` = now and `phone_consent_version` = `config('owner.consent_version')`, the version of the
    privacy text the phone step shows (WP-81; its wording is approved by the lawyer, DEC-87); the window closes;
    then the `denied` and `limit` rules of "Checks" run, and a refused number sets `status: rejected` with
    `reject_reason`. The `agent` signal is not read here: it is a matter for the publish, and it never rejects.
  The Mini App learns the outcome from its poll of `GET /owner/listings/{id}` (BR-API-170).
- The number is read by two code paths only: `OwnerListing::phoneForOwnerView()` (`phone_display` of the owner listing
  object) and `OwnerListing::phoneForDisclosure()`, called only by WP-85's `App\Services\Requests\NativeContact`, the
  one implementation of a native number's disclosure inside `ContactService::disclose()` (WP-43; WP-86's merged source
  never serves a native number's contact). It is never in a log line, an exception context, a job payload (jobs carry
  the listing id), the update ledger of WP-50 (only its HMAC), analytics or an operators' notice (SEC-REQ-051).
  `PhoneLeakTest` scans `app/` for any other read of the attribute or call of `reveal(`.
- A new number replaces the old one; deleting the listing or the purge erases it.

### Publish and checks (part B; `OwnerPublisher`, `OwnerChecks`)

`publish(OwnerListing)`, in this order:

1. `held`, `withdrawn`, `rented`, `removed` → `OwnerListingLocked`; `rejected` → `OwnerRejected` with its reason
   until `owner:release`. With `owner.allowed_ids` set, a caller outside it was already refused by the middleware
   (`403 owner_disabled`).
2. Missing parts → `422` naming `city`, `place` (no point), `rooms` (neither `rooms` nor `room`), `price`, `photos`
   (none).
3. No number → `OwnerPhoneRequired`.
4. The account limit → `OwnerLimitReached` (`account`); the phone limit reached since the confirmation →
   `OwnerLimitReached` (`phone`).
5. Sanity: `price_usd` within 50 … 20 000 (`errors.price`); the point check (`errors.point`).
6. `active` already → the listing unchanged (DEC-80); `paused` → stays paused; neither runs the checks again.
7. `OwnerChecks::check($listing)`: `denied` sets `status: rejected`, `reject_reason: denied` and the entry's
   `last_hit_at`, and answers `OwnerRejected`; an `agent` signal (while `owner.checks.agent` is on) holds the
   listing in step 8.
8. The number from `NativeNumbers::next()`, then:
   - without a signal: `status: active`, `published_at`, the public photo copies, and `OwnerListingPublished`
     (`first`) after commit. The listing is in the feed at once and reaches radars by the next poll of WP-46
     (BR-API-175 `UNVERIFIED` in legacy);
   - with the `agent` signal: `status: paused`, `held_at`, `hold_reason: check_agent`, an `owner_check_results` row
     with the counts, no public copies and no `published_at`, and `OwnerListingHeld` (listing id, `check_agent`)
     after commit; the operators decide (WP-89 tells them). The answer is `200` with the listing (`held: true`); the
     Mini App shows «На проверке» and never says why.

`OwnerChecks` (DEC-77), on the listing's `phone_author_key`:

| Rule | When | Effect |
| ---- | ---- | ------ |
| `agent` signal | `listing_refs` (WP-42) holds that author key on three or more different listing numbers below the native floor that are not merged into another, or `author_marks` (WP-44) marks it as a realtor's (HOMI's votes, DEC-48) | holds at publish (`check_agent`); never rejects |
| `denied` | the key is in `owner_phone_denials` | rejects, at the confirmation and at publish |
| `limit` | the key is on `limits.listings` listings that count, of any account, other than this one | rejects at the confirmation; `409 owner_limit` (`phone`) at publish |

The rules are this package's defaults, not legacy's: legacy's own rules behind `agent` and `fraud` are known only
from its texts (BR-API-171 `UNVERIFIED`, Q-API-072). Native numbers never count for the `agent` signal, because
WP-86 files a native listing under its owner's phone key, and an owner's own two listings must not mark him. A legacy
card yields a `phone:` key only when the operator sends no author key of its own (WP-42, "`listing_refs` and author
keys"); with such a key the count sees none of that person's cards, which WP-70's review records. `rule_version` of
`owner_check_results` names the version of these rules. `owner.checks.agent` (default `true`) turns the signal off in
configuration, the kill switch of SEC-REQ-045. The rejection screen and the «На проверке» state
are WP-81's (it offers no waitlist, DEC-82); the support button is DEV-056's.

### Statuses and their effects (part B)

| From | To | Through | Effect |
| ---- | -- | ------- | ------ |
| `draft` | `active` | publish | number, public copies, `OwnerListingPublished` (`first`) |
| `draft` | held (`paused`) | publish with the `agent` signal | number, `hold_reason: check_agent`, an `owner_check_results` row, `OwnerListingHeld`; no public copies, no `published_at` |
| `active` | `paused` | status | out of the feed and the radars; `OwnerListingWithdrawn` (`paused`) |
| `paused` | `active` | status | back in the feed; `OwnerListingPublished` (`resumed`, `fields` = `paused_edits`, then cleared) |
| `active`, `paused` | `rented` | status | `left_feed_at`; public copies deleted; `OwnerListingRented` — WP-85 cancels the pending requests and WP-89 tells the waiting seekers (BR-API-176) |
| `active`, `paused` | `removed` | status | `left_feed_at`; public copies deleted; `OwnerListingWithdrawn` (`removed`) |
| any listed | held (`paused`) | `owner:hold`, «Снять» (WP-89): `moderator`; a vote threshold (WP-44): `votes_agent`, `votes_fraud`, `votes_rented` | `held_at`, `hold_reason`; out of the feed; public copies deleted; `OwnerListingWithdrawn` (`held`); for votes also an `owner_check_results` row and `OwnerListingHeld`; the owner cannot resume it (BR-API-177) |
| held | the status it had (`active` for a listing held at its first publish) | `owner:release` | `held_at`, `hold_reason` and `hold_reminded_at` cleared; back in the feed when `active`: public copies under a new token and `OwnerListingPublished` (`released`, or `first` with `published_at` for a listing held at its first publish) |
| any listed | `withdrawn` | `owner:withdraw`; `owner:deny-phone` | `withdrawn_at`, `withdraw_reason`, `left_feed_at`; public copies deleted; `OwnerListingWithdrawn` (`withdrawn`); moves to «История» |
| `rejected` | `draft` | `owner:release` | `reject_reason` cleared; the owner may publish again |

Nothing leaves `rented` or `removed`, and `withdrawn` is final; there is no relisting from «История». The events carry
the listing id, the number and the reason (`OwnerListingPublished`: `first`, `released` or `resumed`, the last with
its `fields`), never the number of the phone; WP-57 turns `OwnerListingWithdrawn` into «Объявление снято» on sent
cards for every reason except `paused` (WP-89, "Sent cards of a native listing that left the feed").

### Moderation (part B; `OwnerModeration`)

- `hold`, `release`, `withdraw` and `denyPhone` are one service used by the commands, by WP-89's «Снять»
  (`hold(…, reason: 'moderator', by: <the operator's Telegram id>)`), by the publish and by the votes listener (`by:
  system`). Each writes an `owner_moderation_actions` row with `by` and the system user, and a log line with the
  listing id, never the number. The table is append-only: a migration adds a PostgreSQL trigger that refuses `UPDATE`
  and `DELETE` (tested in `tests/Pgsql`), as SEC-REQ-046 asks.
- Commands: `owner:hold {listing} --reason= --by=`, `owner:release {listing} --by= --reason=`, `owner:withdraw
  {listing} --reason= --by=` (`{listing}` a number or a ULID); `owner:deny-phone {listing} --reason= --by=` takes the
  author key from that listing, and `owner:deny-phone --stdin --reason= --by=` reads one number from standard input,
  never from an argument, so no number lands in the shell history, the process list or Telescope's command entries.
  The deny list stores only the author key; every listed owner listing with that key is withdrawn, and a draft with
  it is rejected `denied` at its next check.
- `config('owner.moderator_ids')` ← `OWNER_MODERATOR_IDS` (comma-separated Telegram ids; empty: no notice). WP-89
  sends the notices on `OwnerListingPublished` (`first` and `released`, and `resumed` with `fields`),
  `OwnerListingHeld`, `OwnerListingEdited` and `OwnerHoldOverdue`.
- No automatic release (DEC-83): a held listing stays held until an operator runs `owner:release`, `owner:withdraw`
  or `owner:deny-phone`; no rule releases it by time. `php artisan owner:remind-holds`, scheduled hourly
  (`onOneServer`), takes every listing held by the checks or the votes (`hold_reason` `check_agent`, `votes_agent`,
  `votes_fraud` or `votes_rented`) whose `held_at` is older than `owner.holds.remind_after_hours` (24) and whose
  `hold_reminded_at` is `null`, sets `hold_reminded_at` and dispatches `OwnerHoldOverdue` (listing id, number,
  `hold_reason`, `held_at`) after commit; WP-89 sends the reminder. A release clears `hold_reminded_at`, so a later
  hold is reminded again. One reminder per hold, and none for an operator's own `moderator` hold, which is already
  his decision, are defaults of this specification.
- Votes: WP-84 adds to `VoteService` (WP-44, "Reports and votes") the event
  `App\Events\Personal\VoteThresholdCrossed` (listing number, kind `rented`, `agent` or `fraud`), dispatched once when
  step 5 crosses a threshold. The listener `HoldOwnerListingByVotes` acts on native numbers only: it holds the
  listing (`votes_rented`, `votes_agent`, `votes_fraud`) with an `owner_check_results` row (the vote weight and the
  number of voters) and `OwnerListingHeld`; it never withdraws, and the operators decide. The `author_marks` row of an
  `agent` crossing is WP-44's own step 5 for the listing's author key, which for a native number is its
  `phone_author_key` (WP-80, "Listing items and the card"), so that number's next publish is held as well.

### Waitlist and `GET /me` (part B)

- `PUT /owner/waitlist` upserts `owner_waitlist` for the caller (BR-API-182); idempotent, `204`. No screen of Wave 1
  calls it (DEC-82). The broadcast «когда откроем» is a later broadcast of WP-57's tool (BOT-091, `UNVERIFIED`).
- `App\Services\Owner\OwnerSummary::for(User): array{has_listings: bool, waitlisted: bool}` feeds `GET /me`'s
  `owner` (WP-40's controller); `pending` is WP-85's and `0` until it is merged.

### Stats of a listing (part B; `OwnerStats`)

| Field | Source |
| ----- | ------ |
| `opened` | rows of `listing_views` (WP-42) with the listing's number: users who opened it |
| `daily` | `owner_listing_opens` of the last 7 days in Asia/Tashkent; `ViewRecorder::record()` (WP-42) increments today's row for a native number, a one-line change made here |
| `favorites` | rows of `favorites` (WP-44) with the number |
| `sent` | rows of `radar_deliveries` (WP-46) with the number; 0 while radars are off |
| `pending`, `requests`, `given` | WP-85's counts; 0 until it is merged |
| `days_listed` | whole days since `published_at` in Asia/Tashkent |
| `price_delta`, `price_tone` | `MarketVerdict` below, `null` without a harvested median |

### Harvested medians and demand (part B; `MedianHarvester`, `MedianBook`, `MarketVerdict`, `DemandEstimator`)

- The seam: `LegacyListingSource::details()` (WP-42) dispatches `App\Events\Listings\LegacyCardFetched` (number,
  district code, rooms, deal, the `MarketComparison` or `null`) where it calls `ListingRefs::remember()`, that is on
  a cache miss, at most once a minute per listing; this package adds the dispatch. The listener `HarvestMedian`
  (queue `default`, idempotent) keeps a comparison whose `scope` is `district` or `city`, whose `value` is numeric,
  whose `n` is set and whose `updated` is at most `owner.medians.max_age_days` (60) old (after the 60-day window of
  BR-API-057); `near`
  comparisons and cards without a matched district are skipped. The city is the city of the matched district. It
  upserts `harvested_medians` when the incoming `updated` is not older than the stored one.
- `MedianBook::for(string $city, ?string $district, int $rooms, string $deal = 'rent_long'): ?HarvestedMedian` — the
  district row, else the city row, ignored when older than 60 days; `rooms` is the listing's rooms, `1` for a room.
- `MarketVerdict::for(int $priceUsd, HarvestedMedian $median): array{delta: float, tone: ?string}` — `delta` =
  (price − median) / median; `tone` `good` at −10 % or less, `same` within ±10 %, `null` above (BR-API-059;
  BR-API-060's per-m² comparison does not apply to the flats of the cabinet's rooms 1 … 5 by rooms). WP-86's
  presenter uses the same class for `market`, `comparison` and the `deal` sort.
- Usual price of `GET /owner/demand`: `usual_low_usd` = median × 0.9, `usual_high_usd` = median × 1.1, rounded to
  whole USD (BR-API-059); both `null` without a median.
- `count` of `GET /owner/demand`: the active radars (WP-45) whose filter set (`radar_filter_sets` of WP-46) matches
  the flat by `DemandMatcher::matches(SearchFilters, OwnerListingForm, GeoPoint $shown)`, the in-memory rule that
  WP-86's `NativeListingFilter` must agree with (WP-86 runs one table against both); `0` while
  `radar.creation_enabled` is false (DEC-51). `DemandEstimator` answers the matches `n` as DEC-84 says (DEV-063):
  `n` ≥ `owner.demand.exact_from` (5) → `count: n`, `few: false`; 1 ≤ `n` < 5 → `count: null`, `few: true`; 0 →
  `count: 0`, `few: false`. The matcher reads every active radar, so `DemandEstimator` caches an answer for five
  minutes per city, district, rooms, room and price band of 50 USD (`owner.demand.cache_minutes`); the cache holds
  the answer, not `n`, and nothing logs `n`. The route has its own limiter (WP-80).

### Erasure and retention (part B; WP-47)

- Every listing that has a number and is erased or purged raises `OwnerListingErased` (listing id, number, reason
  `erased` or `purged`) after commit, so WP-89 edits the operators' sent notices of it (WP-89, "Configuration,
  erasure, retention"); a withdrawal raises `OwnerListingWithdrawn` as above.
- Every deletion of a draft or a `rejected` listing (`destroy`, or the 180-day rule below) records an `owner_listing`
  entry with mode `delete`, and every purge one with mode `purge`, in WP-47's erasure ledger
  (`ErasureLedger::record()`: the HMAC of the listing's ULID with `ERASURE_SUBJECT_KEY`, no number), so `php artisan
  privacy:replay-erasures` repeats them after a restore of an older dump (WP-47, "Erasure — the service the bot
  calls"; `16` SEC-REQ-039; default 12). An owner's erasure needs no entry of its own: WP-47's `user` entry removes
  his listings again through `OwnerListingEraser`.
- `config/erasure.php` (WP-47, "Erasure — the service the bot calls"): `owner_listings` — strategy `custom`,
  `App\Services\Owner\OwnerListingEraser`, placed before `users`: deletes the user's owner listings with their photo
  references (and each private original no other reference names, "Photos"), their public copies at once, their
  opens rows and their `owner_check_results` (cascade), and dispatches `OwnerListingWithdrawn` for those that were in
  the feed; `owner_waitlist` — `delete`. `owner_phone_denials`, `owner_moderation_actions`, `harvested_medians` and
  `geo_boundaries` hold no user link.
- `config/retention.php` (WP-47, "Retention"): `owner_listings` — 90 days (`owner.retention_days`) after `left_feed_at`, executed by
  `php artisan owner:purge` (registered as the executor, like `radar:prune` of WP-46): `phone`, `phone_author_key`,
  `description`, `landmark`, `location` and `shown_location` set to `null`, the private originals and photo rows
  references deleted (each original with its last reference), `purged_at` set; price, city, district, rooms and area
  stay for statistics (legacy keeps price, district and area, BR-API-065); `phone_consented_at` and
  `phone_consent_version` go with the number. The same command deletes a draft that has
  not changed for 180 days (`owner.drafts.max_age_days`) with its photo references, and a deny-list entry three years
  after its last hit (`owner.denials.max_age_days`, 1 095; `last_hit_at`, else `created_at`). `owner_listing_opens`
  and `owner_check_results` go with their listing; `owner_waitlist` is kept while the user exists;
  `owner_moderation_actions` (append-only, no user link) and `harvested_medians` are kept.

### Configuration

`backend/config/owner.php` (WP-80) gains: `phone_window_minutes` (10), `shown_point.secret`
(`env('SHOWN_POINT_SECRET')`), `shown_point.grid_m` (100), `shown_point.min_offset_m` (50), `shown_point.max_offset_m`
(420), `geo_radius_m` (500), `moderator_ids` (`OWNER_MODERATOR_IDS`, a list of integers), `checks.agent` (`true`),
`checks.rule_version`, `consent_version` (a string; raised in the same PR as any change of `own.phoneKept`,
`contact.noteLimit`, `contact.noteRelay` or the privacy page), `retention_days` (90), `drafts.max_age_days` (180),
`denials.max_age_days` (1 095), `medians.max_age_days` (60), `demand.cache_minutes` (5), `demand.exact_from` (5,
DEC-84), `holds.remind_after_hours` (24, DEC-83), `price_usd.min` (50) and
`price_usd.max` (20 000). `limits.listings` is read for the account and the phone alike; `allowed_ids` (WP-80) is
read by the middleware. `backend/config/media.php` gains `max_pixels` (40 000 000).

## Files

- Migrations for the tables, the sequence and the append-only trigger of `owner_moderation_actions`;
  `backend/app/Models/{OwnerListing,OwnerListingPhoto,OwnerListingOpen,GeoBoundary,OwnerWaitlistEntry,OwnerPhoneDenial,OwnerModerationAction,OwnerCheckResult,HarvestedMedian}.php`
  with factories and seeders
- `backend/app/Services/Owner/{OwnerListingService,OwnerPhotoService,PublicPhotoWriter,ShownPoint,PostgisPlaceLookup,NativeNumbers,PhoneWindow,OwnerPhone,PersonalWrites,OwnerPublisher,OwnerChecks,OwnerModeration,OwnerSummary,OwnerStats,MedianBook,MarketVerdict,DemandEstimator,DemandMatcher,OwnerListingEraser}.php`,
  `backend/app/Services/Owner/Contracts/PlaceLookup.php`; `backend/app/Casts/OwnerPhoneCast.php`
  (`php artisan make:cast OwnerPhoneCast`); `backend/app/Exceptions/Owner/PersonalDataWriteFailed.php`
- `backend/app/Jobs/Owner/WritePublicPhotos.php`; `backend/app/Listeners/Owner/{HarvestMedian,HoldOwnerListingByVotes}.php`
  (discovered like `App\Listeners\RecordSourceFlagChange`, not registered by hand)
- `backend/app/Events/Owner/{OwnerListingPublished,OwnerListingWithdrawn,OwnerListingRented,OwnerListingHeld,OwnerListingEdited,OwnerHoldOverdue,OwnerListingErased}.php`,
  `backend/app/Events/Listings/LegacyCardFetched.php`, `backend/app/Events/Personal/VoteThresholdCrossed.php`
- `backend/app/Console/Commands/Owner/{GeoLoadBoundaries,OwnerHold,OwnerRelease,OwnerWithdraw,OwnerDenyPhone,OwnerRemindHolds,OwnerPurge,OwnerReprice}.php`;
  `backend/routes/console.php` (the schedules of `owner:reprice` and `owner:remind-holds`)
- The owner controllers of WP-80 (real bodies); `backend/app/Services/Sources/Stub/NativeStubs.php` (WP-40; the stub
  bodies)
- Created by earlier packages and changed here: `backend/app/Services/Sources/Legacy/LegacyListingSource.php` (WP-42;
  the dispatch), `backend/app/Services/Listings/ViewRecorder.php` (WP-42; the opens row),
  `backend/app/Services/Personal/VoteService.php` (WP-44; the event), `backend/app/Http/Controllers/Api/V1/MeController.php`,
  `backend/app/Http/Middleware/EnsureOwnerCabinetEnabled.php` (WP-80; the allow-list),
  `backend/app/Services/Media/HashedUploader.php` and `backend/config/media.php` (the media module; the size probe
  before decoding, `max_pixels`, the allow-list argument), `backend/app/Providers/TelescopeServiceProvider.php` and
  `backend/bootstrap/app.php` (the leak protections)
- `backend/config/owner.php` (WP-80), `backend/config/{erasure,retention}.php` (WP-47)
- `backend/tests/Feature/Owner/{DraftTest,FormTest,PhotoTest,PhotoReferenceTest,PhoneWindowTest,PublishTest,ChecksTest,HoldTest,StatusTest,ModerationTest,WaitlistTest,StatsTest,MedianHarvesterTest,DemandTest,ErasureTest,PurgeTest,PhoneLeakTest,TelescopeRedactionTest}.php`,
  `backend/tests/Feature/Media/HashedUploaderBombTest.php`, `backend/tests/Feature/Api/V1/Owner/OwnerIdorMatrixTest.php`,
  `backend/tests/Unit/Owner/{ShownPointTest,MarketVerdictTest,DemandMatcherTest}.php`,
  `backend/tests/Pgsql/Owner/{GeographyColumnsTest,PlaceLookupTest,NativeNumberSequenceTest,PublishRaceTest,ModerationAuditTest,PersonalWriteFailureTest}.php`
- `backend/resources/fixtures/geo/boundaries.test.geojson` (synthetic polygons around the stub cities, for the tests)
- `backend/.env.example` (`SHOWN_POINT_SECRET`, `OWNER_MODERATOR_IDS`), `docs/infrastructure/environments.md`,
  `.github/workflows/backend.yml` (PostGIS) — separate shared-file PR

## Steps

Part A:

1. Read `02` §12a, the rows API-037 … API-046 and API-050 … API-053 of `08`, and WP-80 again; take no rule from
   legacy that this specification does not name.
2. The shared-file PR: `SHOWN_POINT_SECRET`, the PostGIS image of CI, `docs/infrastructure/environments.md`.
3. The leak protections first: the Telescope filter and hidden fields, `PersonalDataWriteFailed`, `PersonalWrites`
   and the mapping in `bootstrap/app.php`; `TelescopeRedactionTest` and `PersonalWriteFailureTest`.
4. Migrations and models for `owner_listings` (part A columns), `owner_listing_photos`, `owner_listing_opens`,
   `geo_boundaries`, the sequence; `NativeNumbers` with its SQLite path; the Pgsql tests of the columns and the
   sequence.
5. `ShownPoint` with its unit tests; `PlaceLookup`, `PostgisPlaceLookup`, the fake for SQLite; `geo:load-boundaries`
   with the synthetic test file; `PlaceLookupTest` in `tests/Pgsql`.
6. `OwnerListingService` (draft, update, destroy) and the point check; the controllers' bodies for list, store,
   show, update, destroy, place; the stub bodies into `NativeStubs`.
7. The size probe and the allow-list argument of `HashedUploader` with `HashedUploaderBombTest`; `OwnerPhotoService`
   with the references, `PublicPhotoWriter`, `WritePublicPhotos`; the photo controllers; the EXIF test.
8. The IDOR matrix of the part A methods; Pint, PHPStan, `make ci-backend`, `make test-pgsql`; the first PR.

Part B:

9. Migrations for the part B columns, `owner_waitlist`, `owner_phone_denials`, `owner_moderation_actions` with its
   trigger, `owner_check_results`, `harvested_medians`; `OWNER_MODERATOR_IDS` in a shared-file PR.
10. `OwnerPhoneCast` and `OwnerPhone`; `PhoneWindow` (open, accept, the consent columns) and the two read paths of the
    number; `PhoneLeakTest`.
11. `OwnerChecks`, `OwnerPublisher` with the hold of the `agent` signal; the allow-list of the middleware; publish and
    contact mode controllers.
12. Statuses with their events; `OwnerModeration` and the four commands; `owner:remind-holds` and its schedule
    (DEC-83); `VoteThresholdCrossed` in `VoteService` and its listener.
13. Waitlist; `OwnerSummary` in `GET /me`; `OwnerStats` and the line in `ViewRecorder`.
14. `LegacyCardFetched`, `HarvestMedian`, `MedianBook`, `MarketVerdict`; `DemandMatcher`, `DemandEstimator` with its
    cache, the demand controller; `owner:reprice`.
15. Erasure and retention entries, `OwnerListingEraser`, `owner:purge` with the stale drafts and the deny-list
    entries; the registry tests pass.
16. The IDOR matrix of every owner method; with the switch on locally, every scenario of WP-80 answered by the real
    code; Pint, PHPStan, `make ci-backend`, `make test-pgsql`; the second PR, naming the migrations and the env keys.

## Behaviour to reproduce

- The client sends no role and no owner id; the server alone ties `{id}` to the caller (BR-API-161, `UNVERIFIED` in
  legacy); a foreign id answers `404`.
- At most `max` listings at once (2); `can_add` false at the limit; `past` counts the flats listed before
  (BR-API-162). HOMI counts per account and per phone and leaves drafts out (default; Q-API-068 asks legacy).
- One open draft (DEV-054, fix of LB-APP-054; BR-API-163 says legacy creates a new one every time).
- `PATCH` changes only the sent keys, `null` clears (BR-API-164); the ranges are WP-80's.
- Numbers written into the description are hidden from seekers (BR-API-165).
- Ten photos, the first the cover, the order the full list, a `.s.jpg` thumbnail for every photo (BR-API-166); the
  server re-encodes and drops metadata (fix of LB-APP-061).
- Seekers never see the exact point; they see a circle of about 500 m (BR-API-167). HOMI derives the shown point by
  its own rule; how legacy derives it is unknown (Q-API-074).
- The place lookup answers city and district from HOMI's boundaries; the start view of the picker is not looked up
  (BR-API-168; DEV-061).
- The demand method answers the number of matching active radars and the usual price in USD whatever the form's
  currency (BR-API-169); the number is exact only from 5, and 1 … 4 is `few` (DEC-84, DEV-063).
- The phone is confirmed through the bot and the client polls (BR-API-170); of the refusals `not_own`, `not_uz`,
  `agent`, `fraud`, `limit` (BR-API-171, `UNVERIFIED`) HOMI keeps `not_own`, `not_uz` and `limit`, `fraud` becomes
  `denied`, and `agent` becomes a hold for the operators (integrator default); the number is kept itself (BR-API-172,
  `UNVERIFIED`; DEC-72).
- The contact mode is `request` or `phone` and is never empty (BR-API-173; DEV-055).
- Publish names what is missing (BR-API-174); the listing appears at once and reaches radars by the next poll
  (BR-API-175, `UNVERIFIED`).
- `paused` leaves the feed and the radars, `active` returns, `rented` tells the waiting seekers through their
  cancelled requests, `removed` withdraws; nothing leaves `rented` or `removed` (BR-API-176, `UNVERIFIED`).
- `withdrawn` and `held` are set by the service, not by the owner (BR-API-177).
- `stats` with `daily`, the last value today (BR-API-178); dated in Asia/Tashkent (fix of LB-APP-062 on the server's
  side).
- `PUT /owner/waitlist` records the caller (BR-API-182); no screen of WP-81 calls it (DEC-82).

## Tests

- Pgsql (`tests/Pgsql/Owner`): the geography columns round-trip a point at 5 decimals; `PostgisPlaceLookup` on the
  synthetic boundaries — a point in a district answers city and district, a point in the city outside every
  district answers the city and `null`, a point abroad answers both `null`; the sequence starts at 10 000 000 and
  two concurrent publishes get two numbers (`concurrently()` of `tests/Pest.php`); `geo:load-boundaries` with an
  unknown district code loads nothing.
- Drafts: two `store` calls give one draft; a draft with one key set is not reused; the account limit with two
  `active` listings → `409 owner_limit` (`account`), and an untouched draft is still answered `200` at the limit; a
  third draft is allowed while one listing is `rented`. A save of the description of an `active` listing dispatches
  `OwnerListingEdited` once (`description`); a save of a draft dispatches nothing; a photo upload and a description
  save of a listing the owner paused dispatch nothing, and its resume raises `OwnerListingPublished` (`resumed`) with
  `fields` `photos` and `description`; a resume without a change has empty `fields`.
- Form: each range of WP-80 at its edges; a district of another city → `422`; a point outside the city → `422
  errors.point`; a `UZS` price gets `price_usd` from the reference rate, and `owner:reprice` with a new rate changes
  it; a moved point changes the shown point, an unmoved save keeps it; `PATCH` of an `active` listing is visible in
  the next read without a second call.
- Photos: an upload of a JPEG with EXIF and GPS blocks is stored without them (read the stored bytes); a PNG and a
  WebP are accepted; a GIF and a text file → `unsupported_mime`; a PNG of a few KB declaring 50 000 × 50 000 →
  `too_big`, with the peak memory of the test below 32 MB (`HashedUploaderBombTest`); the eleventh → `409
  owner_photo_limit`; on publish the public copies exist at `owner/<token>/<n>.jpg` and `.s.jpg` with the sizes above,
  no key holds the listing number, and their addresses match `MEDIA_PHOTO` of the client; an order change writes them
  under a new token and the old keys are gone; a hold and `rented` delete them at once, a release writes them under a
  new token; a draft's addresses are temporary URLs; a photo change of an `active` listing dispatches
  `OwnerListingEdited` (`photos`). References (`PhotoReferenceTest`): two owners upload the same bytes; A deletes his
  draft; B's original and public copies stay; B deletes his; the object is gone.
- Shown point: over 1 000 random points the distance to the true point is at most 491 m and its mean at least
  200 m, and the distance to the cell's centre is 50 … 420 m; a move inside the cell keeps the shown point; one
  owner's two listings at one point get one shown point; two owners at one point get two different ones; an
  attacker's drafts in every cell near a victim's shown point never reproduce it; polygons of `DemandMatcher` around
  the shown point match whatever the true point, and polygons that exclude the shown point never match.
- Phone window: an own `+998` contact inside the window sets the number and closes the window; a forwarded contact
  → `not_own`; a `+7` number → `not_uz`; after ten minutes → `null` (time travel), the listing unchanged; a second
  `phone-request` extends the window.
- Leak scan (SEC-REQ-051): after a confirmation, a publish and a show, no digit sequence of the number appears in the
  log files of the test, the serialised payloads of the queued jobs, the update ledger rows or the captured
  analytics; `PhoneLeakTest` fails when a new read of `phone` or a call of `reveal(` appears outside the two paths;
  `(string)` and `json_encode()` of the cast give `[hidden]`. `TelescopeRedactionTest` turns Telescope on with its
  database storage and `record_all` for one test, drives a confirmation, a publish, a show and a `PATCH` with a point,
  and finds in `telescope_entries` no digit run of the number, no `lat` or `lon` of the true point and no entry of
  the cabinet's routes or jobs. `PersonalWriteFailureTest` (`tests/Pgsql`, a temporary `CHECK` constraint) forces a
  `QueryException` on the phone write, inside a request and inside a queued job, and finds no digit of the number in
  the log, `failed_jobs` or the rendered `503`.
- Checks: a key on three distinct legacy numbers → publish answers `200` held (`check_agent`), one
  `owner_check_results` row with the count 3 and no key, `OwnerListingHeld` once, no public copies; on two → passes;
  two native numbers and one legacy number of the key → passes; a key marked in `author_marks` → held; with
  `owner.checks.agent` off → active and no row; a key in `owner_phone_denials` → `denied` at the confirmation and at
  publish, `last_hit_at` set; a key on two counted listings of other accounts → `limit` at the confirmation; the same
  reached between confirmation and publish → `409 owner_limit` (`phone`); a rejected listing → `409 owner_rejected`
  until `owner:release`; no path sets `reject_reason` `agent`. Allow-list: with `owner.allowed_ids` set, store, phone
  request and publish of another Telegram id → `403 owner_disabled`, its other methods work.
- Publish: each missing part named; no number → `409 owner_phone_required`; success → `active`, a number at or above
  the floor, `OwnerListingPublished` once; publish of an `active` listing → unchanged, no event; of a `paused` one →
  stays paused; price 30 USD → `422 errors.price`.
- Statuses: every row of the table, with its event; `active` for `held` and `withdrawn` → `409`; anything from
  `rented` → `409`; a release of a listing held at its first publish → `active`, `published_at` set,
  `OwnerListingPublished` (`first`).
- Moderation: each command writes its action row (with `by` and the system user) and log line without the number;
  «Снять» through `OwnerModeration::hold()` sets `held` with `moderator`; `owner:deny-phone` accepts a listing or
  `--stdin` and has no argument for a number; `VoteThresholdCrossed` of each kind for a native number holds it
  (`votes_rented`, `votes_agent`, `votes_fraud`) with an `owner_check_results` row and never withdraws it, for a
  legacy number does nothing; a vote cast through the bot's card holds as one cast in the Mini App (DEC-86).
  `ModerationAuditTest` (`tests/Pgsql`): an `UPDATE` and a `DELETE` of `owner_moderation_actions` are refused.
- Hold reminder (time travel, DEC-83): a `check_agent` hold at 23 h 59 min → no event; at 24 h 1 min one
  `OwnerHoldOverdue` and `hold_reminded_at` set; a second run → none; a `moderator` hold → none; after 7 days the
  listing is still held; `owner:release` clears `hold_reminded_at`, and a new hold is reminded once more.
- Waitlist: `204` twice, one row; `GET /me` says `waitlisted: true`, `has_listings` follows the rows.
- Stats: `daily` has seven values, the last today in Tashkent at 23:30 UTC; `opened`, `favorites`, `sent` count
  their rows.
- Harvester: a `district` comparison is stored; a `near` one is skipped; an `updated` of 61 days ago is skipped; an
  older `updated` never replaces a newer one; `MedianBook` falls back to the city row; the usual price is ± 10 %;
  `MarketVerdict` at −12 %, −5 % and +15 % gives `good`, `same`, `null`.
- Demand: five matching radars and one that does not → `count: 5`, `few: false`; two matching → `count: null`,
  `few: true`, and no log line or answer holds the 2; none → `count: 0`, `few: false`; `count: 0`, `few: false` with
  `radar.creation_enabled` off; a second call within five minutes reads no radar.
- Erasure: `ErasureService::erase()` of an owner removes his listings, photo references (both disks, the originals that
  no other reference names), check results and waitlist row; `ErasureRegistryTest` and `RetentionRegistryTest` pass with
  the new tables; `OwnerListingErased` (`erased`) once per numbered listing. Purge (time travel): at 90 days − 1 s
  nothing changes, at + 1 s the number, texts, points and photos are gone and price, district and rooms stay; a draft
  unchanged for 180 days is deleted, one changed on day 179 stays; a deny-list entry is gone three years after its last
  hit. Ledger (fake ledger disk): a `destroy` and a purge each write one `owner_listing` object that holds no ULID
  and no number; replayed on a copy of the database taken before them, the draft is deleted and the listing purged
  again.
- IDOR (`OwnerIdorMatrixTest`): every owner method with another user's `{id}` or `{photo}` → `404`, and nothing
  changes.

## Acceptance checklist

- [ ] Every owner method of WP-80 answers from native code locally and in CI with the switch on, in the shapes of
      WP-80, with `meta.source = native`.
- [ ] The number is stored only in `owner_listings.phone`, read by the two named paths, and found in no log, job
      payload, ledger row, analytics event, Telescope entry or exception message; the leak protections are in the
      first PR.
- [ ] A stored photo has no EXIF block; an upload declaring a huge canvas is refused before decoding; public copies
      exist only for a listing in the feed, under `owner/<token>/<n>.jpg`, and keep the `…/<digits>/<digits>.jpg?…`
      form; a shared original outlives one owner's delete.
- [ ] No public answer built from this package's data can carry the true point; the shown point is derived from the
      owner and the 100 m cell, at most 491 m away, and stable.
- [ ] City and district of the picker come from `geo_boundaries`; a point outside the city is refused; the dataset,
      its licence and its attribution are recorded (Q-DATA-051).
- [ ] Publish runs the checks in the specified order; a passing listing is `active` at once with a number at or
      above 10 000 000; one the realtor check flags is held with its evidence, and no automatic rule rejects as a
      realtor.
- [ ] `owner:hold`, `owner:release`, `owner:withdraw` and `owner:deny-phone` work and are logged with who and the
      system user in an append-only table; votes hold a native listing and never withdraw it.
- [ ] A held listing stays held until an operator decides; `owner:remind-holds` raises one `OwnerHoldOverdue` per
      hold of the checks or the votes after 24 h (DEC-83).
- [ ] `GET /owner/demand` never answers a count of 1 … 4: `few: true` instead (DEC-84).
- [ ] The usual price and `stats.price_delta` appear wherever a harvested median exists, and nowhere else.
- [ ] Erasure, the 90-day purge and the purge of stale drafts and deny-list entries are registered and tested with
      time travel.
- [ ] Both PRs name their migrations and env keys; `make ci-backend` and `make test-pgsql` are green.
- [ ] On staging the switch stays off and `POST /api/v1/owner/listings` answers `403 owner_disabled`; the end-to-end
      run with the switch on belongs to WP-89.

## Handoff

Empty.
