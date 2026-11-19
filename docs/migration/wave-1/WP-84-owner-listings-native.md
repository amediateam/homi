# WP-84 — Owner listings: native service, boundaries, harvested medians

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-40, WP-42, WP-44, WP-46, WP-47 |
| Size | about 3 600 changed lines with tests, L — above the guide: two PRs, part A = tables, drafts, form, photos, boundaries and the place lookup, the shown point; part B = the phone window and number, publish and checks, statuses, limits, the operators' commands, the waitlist, the harvester and the demand method, erasure entries, the switch |
| Behaviour reference | `02` §12a (BR-API-159 … BR-API-178, BR-API-182), LB-API-056; `08` API-037 … API-046, API-050 … API-053; `03` LB-APP-054, LB-APP-061, LB-APP-063; `07` §2.5 (BR-API-057, BR-API-059, BR-API-060); `16` SEC-036, SEC-037, SEC-040, SEC-REQ-051, SEC-REQ-052, SEC-REQ-045 |
| Needs from the production track | (1) Approval of the migrations: `owner_listings` (with the plain `phone`, `phone_author_key`, the true and the shown point as `geography(Point,4326)`), `owner_listing_photos`, `owner_listing_opens`, `owner_waitlist`, `owner_phone_denials`, `owner_moderation_actions`, `geo_boundaries` (`geometry(MultiPolygon,4326)`), `harvested_medians`, the native number sequence. (2) PostGIS in `homi_db` before the deploy (`docs/infrastructure/deployment.md:140`, its own go). (3) Env `SHOWN_POINT_SECRET` (random, at least 32 bytes, per environment, in the password manager) and `OWNER_MODERATOR_IDS` (blank until the switch-on), through a shared-file PR; `OWNER_CABINET_ENABLED` stays unset. (4) The CDN host serves `owner/` of the public disk on staging and production. (5) `php artisan geo:load-boundaries` once per environment after the deploy (Q-DATA-051). (6) The PostgreSQL service of `.github/workflows/backend.yml` (today `postgres:18`) gains PostGIS, a shared-file change, because the migrations and `composer openapi:export` run on it |

## Goal

The owner methods of WP-80 answer from HOMI's own tables. The owner's number is kept as DEC-72 says, in plain text
with the listing and readable by two code paths only. Publish runs the automatic checks of DEC-73 and DEC-77 and
the listing is active at once; votes and the operators can take it down later. City and district come from HOMI's
own boundaries in PostGIS, and the usual price and the market verdict from the medians HOMI harvests from the
legacy cards it reads.

## Scope

In, part A (first PR):

- The migrations, models and factories of `owner_listings`, `owner_listing_photos`, `owner_listing_opens`,
  `geo_boundaries` and the native number sequence.
- Drafts with reuse (DEV-054); the form and its validation, with the ranges of WP-80 and the server's own checks;
  `PATCH` live on a published listing (DEC-80); delete of a draft or a rejected listing.
- Photos through `HashedUploader`: private until publish; public copies on publish and on every change; removed when
  the listing leaves the feed for good.
- The true point (5 decimals) and the shown point; `geo:load-boundaries`; the point check against the country and
  the city (LB-APP-063); `GET /owner/place`.

In, part B (second PR):

- The phone window and the number (DEC-72): set by the seam WP-88 builds, read only by the owner's view and by
  WP-85 / WP-43's disclosure.
- Publish with the automatic checks; statuses and their effects; the limits per account and per phone; `held` and
  `withdrawn` by votes (WP-44) and by the operators' commands; the waitlist (`owner_waitlist`, `owner_phone_denials`,
  `owner_moderation_actions`).
- The harvester (`harvested_medians`) on WP-42's card read and `GET /owner/demand`; the stats of a listing.
- Erasure entries in WP-47's registry and the 90-day purge; `GET /me`'s `owner.has_listings` and `owner.waitlisted`;
  the switch of DEC-81 kept on its three routes.
- The events `OwnerListingPublished`, `OwnerListingWithdrawn` and `OwnerListingRented` for WP-86, WP-85 and WP-89.

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
- DEC-73: post-moderation. Publish runs the automatic checks and the listing is `active` at once; HOMI's report
  votes and the operators take it down later, and each publication reaches the operators' private chats with a
  «Снять» button (the notice is WP-89's; this package provides the event and the hold).
- DEC-74, DEC-80: DEV-054 (one open draft), DEV-055 (the contact mode is always chosen), DEV-056 (a way forward
  after a rejection), DEV-061 (no IP lookup) and DEV-062 (every save is live) are on without flags.
- DEC-77: «Проверенный хозяин» on a native listing means that the owner confirmed his own number with Telegram;
  HOMI runs its own realtor check at publish. It labels people, so the security review of WP-70 checks it
  (SEC-REQ-045).
- DEC-78: the medians of the `comparison` block of the legacy cards HOMI reads are harvested; wherever one exists the
  owner listing has the verdict, the form shows the usual price, and `stats.price_delta` is set. Sparse at first.
- DEC-79: city and district come from HOMI's own boundaries in PostGIS, loaded from an open source with its
  attribution — `UNVERIFIED` until checked (Q-DATA-051). The owner types the landmark; there is no street address.
- DEC-81: the switch `OWNER_CABINET_ENABLED` stays on its three routes; on the servers it stays off until WP-89.
- DEC-48: HOMI's report votes act on native listings too, and are never passed to legacy.
- DEC-51: while radars are off, `GET /owner/demand` answers `count: 0` and `stats.sent` is 0.
- DEC-12 (retention, open): the 90-day period below is a configurable default.
- *Integrator defaults, listed for the reviewer* (the owner-cabinet plan's defaults, not decisions of the developer;
  listed in that PR):
  - the native number floor is 10 000 000 (`owner.native_number_floor`), one PostgreSQL sequence, a number at the
    first publish;
  - the shown point is the true point moved by a stable offset of at most 250 m, from an HMAC of the listing ULID and
    the point keyed with `SHOWN_POINT_SECRET`; `geo_radius_m` is 500;
  - the phone window: `POST /owner/listings/{id}/phone-request` opens ten minutes in which an own `+998` contact
    shared with HOMI's bot becomes the draft's number; outside a window a contact goes to `/owner`;
  - the realtor check of DEC-77: `agent` when the number's author key (`phone:` + HMAC with `AUTHOR_KEY_SECRET`,
    WP-42) was seen on legacy listings of three or more different flats (the `/owner` threshold, BR-API-109) or is
    marked by HOMI's votes; `fraud` from an operators' deny list (console command, empty at start); `limit` at two
    listings per phone across accounts;
  - limits: two listings per account and two per phone; drafts do not count; ten photos;
  - the operators' notice goes from HOMI's main bot to `OWNER_MODERATOR_IDS` (empty: no notice); «Снять» sets
    `held` with reason `moderator`; console commands `owner:hold`, `owner:release`, `owner:withdraw`,
    `owner:deny-phone` with `--reason`, logged with who; WP-59's operator list is not used, because WP-59 comes after
    WP-89;
  - harvested medians: from `comparison` with `scope` `district` or `city` of every legacy card read through WP-42,
    kept per city, district, rooms and deal with `n` and `updated`, ignored when older than 60 days (BR-API-057); the
    usual price is the median ± 10 % (BR-API-059); the verdict's tone by BR-API-059 and BR-API-060;
  - retention: an owner listing's number, texts and photos are erased 90 days after it left the feed for good
    (`rented`, `removed`, `withdrawn`), the period legacy's privacy text promises (BR-BOT-093);
  - the cabinet is long-term rent only, as legacy's form (`03` SCR-052): `deal` of a native listing is always
    `rent_long`;
  - `publish` of a `paused` listing keeps it paused (only `PUT …/status active` resumes it); a `rejected` listing can
    be published again only after the operators release it (`owner:release`);
  - no relisting from «История»: legacy has none;
  - defaults of this specification: the shown offset is at least 100 m, so the shown point never equals the true
    point; the sanity range of the price at publish is 50 … 20 000 USD a month (the median's bounds of BR-API-057);
    the tone of a verdict is `good` at 10 % or more below the median, `same` within 10 %, `null` above, because the
    thresholds of `check` and `suspicious` are unknown (Q-API-021); a number that reaches the phone limit at its
    confirmation rejects the listing (`reject_reason: limit`), while a limit reached later answers `409 owner_limit`
    with `limit: phone` at publish; three more tables than the plan named (`owner_listing_opens`,
    `owner_phone_denials`, `owner_moderation_actions`).

## Design

The controllers of WP-80 keep their routes, requests and resources and get real bodies; the stub bodies move into
`NativeStubs` (WP-40, "Stub mode for the end-to-end suite"). Every owner query is scoped to the caller
(`OwnerListing::query()->whereBelongsTo($user)`), so a foreign id is `404 not_found` without a policy branch
(SEC-REQ-014). Classes live in `App\Services\Owner`; models in `App\Models`.

### Tables (part A unless marked)

| Table | Columns | Notes |
| ----- | ------- | ----- |
| `owner_listings` | `id` (ULID, primary key); `user_id` (foreign key, cascade); `number` (`unsignedBigInteger`, unique, nullable); `status` (string 16); `withdrawn_at`, `held_at` (`timestampTz`, nullable); `hold_reason`, `withdraw_reason` (string 32, nullable); `published_at`, `left_feed_at`, `purged_at` (nullable); `city`, `district_code` (string 64, nullable); `landmark` (string 120, nullable); `location`, `shown_location` (`geography(Point,4326)`, nullable); `room` (boolean, default false); `rooms`, `floor`, `floors_total` (smallint, nullable); `area_m2` (`decimal(7,1)`, nullable); `price` (bigint, nullable); `currency` (char 3, default `USD`); `price_usd` (integer, nullable); `renovation` (string 32, nullable); `furniture`, `pets` (boolean, nullable); `tenants` (json); `description` (text, nullable); `contact_mode` (string 8, default `request`); part B: `phone` (string 16, nullable, E.164, plain), `phone_author_key` (string 96, nullable, indexed), `phone_error`, `reject_reason` (string 8, nullable), `phone_window_until` (`timestampTz`, nullable); timestamps | index (`user_id`, `created_at`); partial index (`city`, `status`) for the listed rows; GiST on `shown_location` |
| `owner_listing_photos` | `id` (ULID); `owner_listing_id` (foreign key, cascade); `position` (smallint); `original_path` (string; the key of `HashedUploader` on the private disk); `version` (char 8: the first 8 hex of the stored bytes' SHA-256); timestamps | unique (`owner_listing_id`, `position`) |
| `owner_listing_opens` | `owner_listing_id` (foreign key, cascade); `day` (date, Asia/Tashkent); `opens` (integer) | primary key (`owner_listing_id`, `day`); the source of `stats.daily` |
| `geo_boundaries` | `id`; `kind` (`country`, `city`, `district`); `code` (string 64); `city_code` (string 64, nullable); `geom` (`geometry(MultiPolygon,4326)`); `source`, `licence`, `attribution` (string); `loaded_at` | unique (`kind`, `code`); GiST on `geom` |
| `owner_waitlist` (B) | `user_id` (primary key, foreign key, cascade); `created_at` | |
| `owner_phone_denials` (B) | `phone_author_key` (primary key); `reason` (string 64); `added_by` (string 64); `created_at` | the `fraud` list; holds no number |
| `owner_moderation_actions` (B) | `id`; `owner_listing_id` (ULID, no foreign key); `action` (`hold`, `release`, `withdraw`, `deny_phone`); `reason`; `by` (string 64); `created_at` | audit, no user link |
| `harvested_medians` (B) | `city`, `district_code` (string 64; empty for the city scope), `rooms` (smallint), `deal` (string 16); `value_usd`, `n` (integer); `updated` (date); `harvested_at` | primary key (`city`, `district_code`, `rooms`, `deal`) |

The sequence `owner_listing_numbers` starts at `config('owner.native_number_floor')` and is created by a migration
with a PostgreSQL statement; `App\Services\Owner\NativeNumbers::next(): int` reads `nextval()`, and on SQLite (the
default test suite) takes the larger of the floor and `max(number) + 1` under a lock. The geography and geometry
columns use the schema builder's `geography()` and `geometry()` types; every PostGIS function runs behind
`App\Services\Owner\Contracts\PlaceLookup` and is tested in `tests/Pgsql` (`Tests\PgsqlTestCase`, `make
test-pgsql`), while the SQLite suites bind a fake lookup.

Models with factories (`php artisan make:model OwnerListing --factory --migration` and the same for the others):
`OwnerListing` (`HasUlids`; `phone` in `$hidden`, cast `tenants` to an array), `OwnerListingPhoto`,
`OwnerListingOpen`, `GeoBoundary`, `OwnerWaitlistEntry`, `OwnerPhoneDenial`, `OwnerModerationAction`,
`HarvestedMedian`.

### Drafts and the form (`OwnerListingService`)

- `draft(User): array{OwnerListing, bool}` — the caller's untouched draft (no form key set beyond the defaults and
  no photo) when one exists, else a new one (DEV-054); the boolean says whether it was created (`201` / `200` of
  WP-80). Refused with `OwnerLimitReached` (`limit: account`) while the caller has `limits.listings` listings that
  count: `active` or `paused`, not `withdrawn`. A new draft: `contact_mode: request` (DEV-055), `currency: USD`,
  `city` from the user's settings (WP-40).
- `update(OwnerListing, array $fields)` — the validated keys of `UpdateOwnerListingRequest` (WP-80); `lat` and `lon`
  are stored as a point rounded to 5 decimals. Server checks after the form request: `district_code` must belong to
  `city`; a point must lie inside the country and inside `city` (the point check below) → `422` with
  `errors.point`; `floor ≤ floors_total`. `price_usd` is computed from `price` and `currency` with the rate of
  `GET /reference` (`rates.usd_uzs`) at save, and `php artisan owner:reprice` (daily, 05:00 Asia/Tashkent) recomputes
  it for `UZS` rows. A changed point recomputes the shown point. A `held`, `withdrawn`, `rented` or `removed` listing
  → `OwnerListingLocked`.
- A change of a published listing is live at once (DEC-80, DEV-062): there is no revision and no second save.
- `destroy(OwnerListing)` — a draft or a `rejected` listing: its photos (private originals) and the row are deleted
  in one transaction (DEV-056); else `OwnerListingLocked`.
- The description is stored as the owner wrote it and shown to him so; every public answer masks it through
  `ListingDetails::fromArray()` (WP-12, "Phone numbers in listing texts"; BR-API-165). Publish does not refuse a text
  with a number in it.

### Photos (`OwnerPhotoService`)

- Upload: `HashedUploader::storeUploadedFile($file, MediaVisibility::Private)` sniffs the type, decodes, applies the
  orientation, drops EXIF and every other metadata block, re-encodes and stores the original under
  `originals/{sha256}.{ext}` of the private disk (`backend/app/Services/Media/HashedUploader.php:19-24`). That is the
  fix of LB-APP-061 (a failed client conversion sent the original with its GPS position; SEC-037) at no extra cost.
  Its `MediaException` answers keep their codes. The photo becomes the last position; at `limits.owner_photos` →
  `OwnerPhotoLimit`.
- Addresses: a listing without a number shows its photos through temporary URLs of the private disk
  (`MediaUrlBuilder`, `media.temporary_url_minutes`); the Mini App's `img-src` must allow that host (WP-81 checks it
  on staging). A published listing's photos are public copies on the public disk: `owner/<number>/<n>.jpg` (JPEG,
  long side at most 2 048 px) and `owner/<number>/<n>.s.jpg` (480 px), `<n>` the position from 1, with the address
  `<MEDIA_PUBLIC_URL>/owner/<number>/<n>.jpg?v=<version>`. That keeps the form `…/<digits>/<digits>.jpg?…` from
  which the client derives the small variant (`frontend/app/features/feed/images.ts:3-7`), so WP-24, WP-26 and the bot
  cards need no change. The media module's own WebP variants stay for other uses.
- On publish, and on every photo change of a published listing (add, delete, order), the public copies are written
  again for every position (a job on the `media` queue, unique per listing); the `?v=` part changes with the bytes.
- The public copies are deleted when the listing leaves the feed for good (`rented`, `removed`, `withdrawn`) and
  kept while it is `active` or `paused`, `held` included (API-041). The private originals stay for the owner's
  «История» until the purge below.
- Order: the full list of ids; another set → `422` naming `ids` (WP-80).

### Location (`ShownPoint`, `PlaceLookup`)

- `ShownPoint::for(string $ulid, GeoPoint $true): GeoPoint` — `h` = HMAC-SHA-256 of `"<ulid>|<lat>|<lon>"` (5
  decimals) keyed with `config('owner.shown_point.secret')` (`SHOWN_POINT_SECRET`); the bearing is the first two
  bytes of `h` scaled to 0 … 360°, the distance the next two scaled to `min_offset_m` … `max_offset_m` (100 … 250 m).
  The shown point is the same on every read and changes only when the owner moves the point; `geo_radius_m` (500)
  is the radius of the circle seekers see, which therefore always contains the true point («ищущие видят только
  круг около 500 м», SCR-052). An empty secret outside `local` and `testing` fails closed: publish answers `503
  source_unavailable` and logs once; WP-70's `security:check` knows the key.
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

### The phone window and the number (part B; `PhoneWindow`)

- `open(OwnerListing): OwnerListing` — behind `POST /owner/listings/{id}/phone-request`: sets `phone_window_until =
  now + owner.phone_window_minutes` (10) and clears `phone_error`. A second call extends the window.
- `accept(int $senderTelegramId, int $contactUserId, string $phone): ?OwnerListing` — the seam WP-88 calls from the
  contact branch, before WP-50's redactor hashes the contact. It finds the newest listing of the user with that
  Telegram id whose window is open; none → `null`, and the contact goes to `/owner` as today (DEV-011). Then:
  - `contactUserId !== senderTelegramId` → `phone_error: not_own` (a forwarded contact);
  - a number that is not `+998` → `phone_error: not_uz`;
  - else `phone` = the number in E.164, `phone_author_key` = `AuthorKey` of WP-42 ("`listing_refs` and author
    keys"): `phone:` + the first 32 hex of HMAC-SHA-256 of the E.164 number with `AUTHOR_KEY_SECRET`; the window
    closes; then the checks of "Checks" run, and a refused number sets `status: rejected` with `reject_reason`.
  The Mini App learns the outcome from its poll of `GET /owner/listings/{id}` (BR-API-170).
- The number is read by two code paths only: `OwnerListing::phoneForOwnerView()` (the show answer's
  `phone_display`) and `OwnerListing::phoneForDisclosure()` (WP-85's rule inside `ContactService::disclose()`). It is
  never in a log line, an exception context, a job payload (jobs carry the listing id), the update ledger of WP-50
  (only its HMAC), analytics or an operators' notice (SEC-REQ-051). A unit test scans `app/` for any other read of
  the attribute.
- A new number replaces the old one; deleting the listing or the purge erases it.

### Publish and checks (part B; `OwnerPublisher`, `OwnerChecks`)

`publish(OwnerListing)`, in this order:

1. `held`, `withdrawn`, `rented`, `removed` → `OwnerListingLocked`; `rejected` → `OwnerRejected` with its reason
   until `owner:release`.
2. Missing parts → `422` naming `city`, `place` (no point), `rooms` (neither `rooms` nor `room`), `price`, `photos`
   (none).
3. No number → `OwnerPhoneRequired`.
4. The account limit → `OwnerLimitReached` (`account`); the phone limit reached since the confirmation →
   `OwnerLimitReached` (`phone`).
5. `OwnerChecks::check($listing)` → `agent`, `fraud` or `limit` sets `status: rejected` and `reject_reason`, and
   answers `OwnerRejected`.
6. Sanity: `price_usd` within 50 … 20 000 (`errors.price`); the point check (`errors.point`).
7. `active` already → the listing unchanged (DEC-80); `paused` → stays paused. Otherwise `status: active`, the number
   from `NativeNumbers::next()` at the first publish, `published_at`, the public photo copies, and
   `OwnerListingPublished` after commit. The listing is in the feed at once and reaches radars by the next poll of
   WP-46 (BR-API-175 `UNVERIFIED` in legacy).

`OwnerChecks` (DEC-77), on the listing's `phone_author_key`:

| Reason | Rule |
| ------ | ---- |
| `agent` | `listing_refs` (WP-42) holds that author key on three or more different listing numbers that are not merged into another, or `author_marks` (WP-44) marks it as a realtor's (HOMI's votes, DEC-48) |
| `fraud` | the key is in `owner_phone_denials` |
| `limit` | the key is on `limits.listings` listings that count, of any account, other than this one |

The rules are this package's defaults, not legacy's: legacy's own rules behind `agent` and `fraud` are known only
from its texts (BR-API-171 `UNVERIFIED`, Q-API-072). The checks run at the confirmation of the number and again at
publish. The rejection screen and the waitlist are WP-81's; the support button is DEV-056's.

### Statuses and their effects (part B)

| From | To | Through | Effect |
| ---- | -- | ------- | ------ |
| `draft` | `active` | publish | number, public copies, `OwnerListingPublished` |
| `active` | `paused` | status | out of the feed and the radars; `OwnerListingWithdrawn` (`paused`) |
| `paused` | `active` | status | back in the feed; `OwnerListingPublished` (not first) |
| `active`, `paused` | `rented` | status | `left_feed_at`; public copies deleted; `OwnerListingRented` — WP-85 cancels the pending requests and WP-89 tells the waiting seekers (BR-API-176) |
| `active`, `paused` | `removed` | status | `left_feed_at`; public copies deleted; `OwnerListingWithdrawn` (`removed`) |
| any listed | `held` | `owner:hold`, «Снять» (WP-89) | `status: paused`, `held_at`, `hold_reason`; out of the feed; `OwnerListingWithdrawn` (`held`); the owner cannot resume it (BR-API-177) |
| `held` | as before | `owner:release` | `held_at` cleared |
| any listed | `withdrawn` | `owner:withdraw`; votes | `withdrawn_at`, `withdraw_reason`, `left_feed_at`; public copies deleted; `OwnerListingWithdrawn` (`withdrawn`); moves to «История» |
| `rejected` | `draft` | `owner:release` | `reject_reason` cleared; the owner may publish again |

Nothing leaves `rented` or `removed`, and `withdrawn` is final; there is no relisting from «История». The events carry
the listing id, the number and the reason, never the number of the phone; WP-57 turns `OwnerListingWithdrawn` into
«Объявление снято» on sent cards (WP-89).

### Moderation (part B; `OwnerModeration`)

- `hold`, `release`, `withdraw` and `denyPhone` are one service used by the commands and by WP-89's «Снять»
  (`hold(…, reason: 'moderator', by: <the operator's Telegram id>)`). Each writes an `owner_moderation_actions` row
  and a log line with the listing id, never the number.
- Commands: `owner:hold {listing} --reason= --by=`, `owner:release {listing} --by= --reason=`, `owner:withdraw
  {listing} --reason= --by=` (`{listing}` a number or a ULID), `owner:deny-phone {phone} --reason= --by=` (stores
  only the author key of the number; a listing with that key is withdrawn).
- `config('owner.moderator_ids')` ← `OWNER_MODERATOR_IDS` (comma-separated Telegram ids; empty: no notice). WP-89
  sends the notice on `OwnerListingPublished`.
- Votes: WP-84 adds to `VoteService` (WP-44, "Reports and votes") the event
  `App\Events\Personal\VoteThresholdCrossed` (listing number, kind `rented` or `agent`), dispatched once when step 5
  writes a mark. The listener `WithdrawOwnerListingByVotes` acts on native numbers only: `rented` → `withdrawn`
  (`votes_rented`); `agent` → `withdrawn` (`votes_agent`) and an `author_marks` row for the listing's
  `phone_author_key`, so the realtor check refuses that number next time.

### Waitlist and `GET /me` (part B)

- `PUT /owner/waitlist` upserts `owner_waitlist` for the caller (BR-API-182); idempotent, `204`. The broadcast «когда
  откроем» is a later broadcast of WP-57's tool (BOT-091, `UNVERIFIED`).
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
  whose `n` is set and whose `updated` is at most `owner.medians.max_age_days` (60) old (BR-API-057); `near`
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
  `radar.creation_enabled` is false (DEC-51).

### Erasure and retention (part B; WP-47)

- `config/erasure.php` (WP-47, "Erasure — the service the bot calls"): `owner_listings` — strategy `custom`,
  `App\Services\Owner\OwnerListingEraser`, placed before `users`: deletes the user's owner listings with their photos
  (private originals and public copies) and opens rows, and dispatches `OwnerListingWithdrawn` for those that were
  in the feed; `owner_waitlist` — `delete`. `owner_phone_denials`, `owner_moderation_actions`, `harvested_medians` and
  `geo_boundaries` hold no user link.
- `config/retention.php` (WP-47, "Retention"): `owner_listings` — 90 days (`owner.retention_days`) after `left_feed_at`, executed by
  `php artisan owner:purge` (registered as the executor, like `radar:prune` of WP-46): `phone`, `phone_author_key`,
  `description`, `landmark`, `location` and `shown_location` set to `null`, the private originals and photo rows
  deleted, `purged_at` set; price, city, district, rooms and area stay for statistics, as legacy keeps them
  (BR-API-065). Drafts are kept until the owner deletes them. `owner_listing_opens` goes with its listing;
  `owner_waitlist` is kept while the user exists; the other four tables are kept with their reason.

### Configuration

`backend/config/owner.php` (WP-80) gains: `phone_window_minutes` (10), `shown_point.secret`
(`env('SHOWN_POINT_SECRET')`), `shown_point.min_offset_m` (100), `shown_point.max_offset_m` (250), `geo_radius_m`
(500), `moderator_ids` (`OWNER_MODERATOR_IDS`, a list of integers), `retention_days` (90), `medians.max_age_days`
(60), `price_usd.min` (50) and `price_usd.max` (20 000). `limits.listings` is read for the account and the phone
alike.

## Files

- Migrations for the tables and the sequence; `backend/app/Models/{OwnerListing,OwnerListingPhoto,OwnerListingOpen,GeoBoundary,OwnerWaitlistEntry,OwnerPhoneDenial,OwnerModerationAction,HarvestedMedian}.php`
  with factories and seeders
- `backend/app/Services/Owner/{OwnerListingService,OwnerPhotoService,PublicPhotoWriter,ShownPoint,PostgisPlaceLookup,NativeNumbers,PhoneWindow,OwnerPublisher,OwnerChecks,OwnerModeration,OwnerSummary,OwnerStats,MedianBook,MarketVerdict,DemandEstimator,DemandMatcher,OwnerListingEraser}.php`,
  `backend/app/Services/Owner/Contracts/PlaceLookup.php`
- `backend/app/Jobs/Owner/WritePublicPhotos.php`; `backend/app/Listeners/Owner/{HarvestMedian,WithdrawOwnerListingByVotes}.php`
- `backend/app/Events/Owner/{OwnerListingPublished,OwnerListingWithdrawn,OwnerListingRented}.php`,
  `backend/app/Events/Listings/LegacyCardFetched.php`, `backend/app/Events/Personal/VoteThresholdCrossed.php`
- `backend/app/Console/Commands/Owner/{GeoLoadBoundaries,OwnerHold,OwnerRelease,OwnerWithdraw,OwnerDenyPhone,OwnerPurge,OwnerReprice}.php`;
  `backend/routes/console.php` (the schedule of `owner:reprice`)
- The owner controllers of WP-80 (real bodies); `backend/app/Services/Sources/Stub/NativeStubs.php` (WP-40; the stub
  bodies)
- Created by earlier packages and changed here: `backend/app/Services/Sources/Legacy/LegacyListingSource.php` (WP-42;
  the dispatch), `backend/app/Services/Listings/ViewRecorder.php` (WP-42; the opens row),
  `backend/app/Services/Personal/VoteService.php` (WP-44; the event), `backend/app/Http/Controllers/Api/V1/MeController.php`
- `backend/config/owner.php` (WP-80), `backend/config/{erasure,retention}.php` (WP-47)
- `backend/tests/Feature/Owner/{DraftTest,FormTest,PhotoTest,PhoneWindowTest,PublishTest,ChecksTest,StatusTest,ModerationTest,WaitlistTest,StatsTest,MedianHarvesterTest,DemandTest,ErasureTest,PurgeTest,PhoneLeakTest}.php`,
  `backend/tests/Feature/Api/V1/Owner/OwnerIdorMatrixTest.php`, `backend/tests/Unit/Owner/{ShownPointTest,MarketVerdictTest,DemandMatcherTest}.php`,
  `backend/tests/Pgsql/Owner/{GeographyColumnsTest,PlaceLookupTest,NativeNumberSequenceTest,PublishRaceTest}.php`
- `backend/resources/fixtures/geo/boundaries.test.geojson` (synthetic polygons around the stub cities, for the tests)
- `backend/.env.example` (`SHOWN_POINT_SECRET`, `OWNER_MODERATOR_IDS`), `docs/infrastructure/environments.md`,
  `.github/workflows/backend.yml` (PostGIS) — separate shared-file PR

## Steps

Part A:

1. Read `02` §12a, the rows API-037 … API-046 and API-050 … API-053 of `08`, and WP-80 again; take no rule from
   legacy that this specification does not name.
2. The shared-file PR: `SHOWN_POINT_SECRET`, the PostGIS image of CI, `docs/infrastructure/environments.md`.
3. Migrations and models for `owner_listings` (part A columns), `owner_listing_photos`, `owner_listing_opens`,
   `geo_boundaries`, the sequence; `NativeNumbers` with its SQLite path; the Pgsql tests of the columns and the
   sequence.
4. `ShownPoint` with its unit tests; `PlaceLookup`, `PostgisPlaceLookup`, the fake for SQLite; `geo:load-boundaries`
   with the synthetic test file; `PlaceLookupTest` in `tests/Pgsql`.
5. `OwnerListingService` (draft, update, destroy) and the point check; the controllers' bodies for list, store,
   show, update, destroy, place; the stub bodies into `NativeStubs`.
6. `OwnerPhotoService`, `PublicPhotoWriter`, `WritePublicPhotos`; the photo controllers; the EXIF test.
7. The IDOR matrix of the part A methods; Pint, PHPStan, `make ci-backend`, `make test-pgsql`; the first PR.

Part B:

8. Migrations for the part B columns, `owner_waitlist`, `owner_phone_denials`, `owner_moderation_actions`,
   `harvested_medians`; `OWNER_MODERATOR_IDS` in a shared-file PR.
9. `PhoneWindow` (open, accept) and the two read paths of the number; `PhoneLeakTest`.
10. `OwnerChecks`, `OwnerPublisher`; publish and contact mode controllers.
11. Statuses with their events; `OwnerModeration` and the four commands; `VoteThresholdCrossed` in `VoteService`
    and its listener.
12. Waitlist; `OwnerSummary` in `GET /me`; `OwnerStats` and the line in `ViewRecorder`.
13. `LegacyCardFetched`, `HarvestMedian`, `MedianBook`, `MarketVerdict`; `DemandMatcher`, `DemandEstimator`, the
    demand controller; `owner:reprice`.
14. Erasure and retention entries, `OwnerListingEraser`, `owner:purge`; the registry tests pass.
15. The IDOR matrix of every owner method; with the switch on locally, every scenario of WP-80 answered by the real
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
  currency (BR-API-169).
- The phone is confirmed through the bot and the client polls (BR-API-170); the refusals `not_own`, `not_uz`, `agent`,
  `fraud`, `limit` (BR-API-171, `UNVERIFIED`); the number is kept itself (BR-API-172, `UNVERIFIED`; DEC-72).
- The contact mode is `request` or `phone` and is never empty (BR-API-173; DEV-055).
- Publish names what is missing (BR-API-174); the listing appears at once and reaches radars by the next poll
  (BR-API-175, `UNVERIFIED`).
- `paused` leaves the feed and the radars, `active` returns, `rented` tells the waiting seekers through their
  cancelled requests, `removed` withdraws; nothing leaves `rented` or `removed` (BR-API-176, `UNVERIFIED`).
- `withdrawn` and `held` are set by the service, not by the owner (BR-API-177).
- `stats` with `daily`, the last value today (BR-API-178); dated in Asia/Tashkent (fix of LB-APP-062 on the server's
  side).
- The waitlist records a refused realtor (BR-API-182).

## Tests

- Pgsql (`tests/Pgsql/Owner`): the geography columns round-trip a point at 5 decimals; `PostgisPlaceLookup` on the
  synthetic boundaries — a point in a district answers city and district, a point in the city outside every
  district answers the city and `null`, a point abroad answers both `null`; the sequence starts at 10 000 000 and
  two concurrent publishes get two numbers (`concurrently()` of `tests/Pest.php`); `geo:load-boundaries` with an
  unknown district code loads nothing.
- Drafts: two `store` calls give one draft; a draft with one key set is not reused; the account limit with two
  `active` listings → `409 owner_limit` (`account`); a third draft is allowed while one listing is `rented`.
- Form: each range of WP-80 at its edges; a district of another city → `422`; a point outside the city → `422
  errors.point`; a `UZS` price gets `price_usd` from the reference rate, and `owner:reprice` with a new rate changes
  it; a moved point changes the shown point, an unmoved save keeps it; `PATCH` of an `active` listing is visible in
  the next read without a second call.
- Photos: an upload of a JPEG with EXIF and GPS blocks is stored without them (read the stored bytes); a PNG and a
  WebP are accepted; a text file → `unsupported_mime`; the eleventh → `409 owner_photo_limit`; on publish the public
  copies exist at `owner/<number>/<n>.jpg` and `.s.jpg` with the sizes above and their addresses match the client's
  rule; an order change rewrites them with new `?v=`; `rented` deletes them; a draft's addresses are temporary URLs.
- Shown point: stable for the same ULID and point; different for another ULID; always 100 … 250 m from the true
  point; the true point lies inside the 500 m circle; shrinking polygons of `DemandMatcher` around the true point
  that exclude the shown point never match, and polygons around the shown point match whatever the true point.
- Phone window: an own `+998` contact inside the window sets the number and closes the window; a forwarded contact
  → `not_own`; a `+7` number → `not_uz`; after ten minutes → `null` (time travel), the listing unchanged; a second
  `phone-request` extends the window.
- Leak scan (SEC-REQ-051): after a confirmation, a publish and a show, no digit sequence of the number appears in the
  log files of the test, the serialised payloads of the queued jobs, the update ledger rows or the captured
  analytics; `PhoneLeakTest` fails when a new read of `phone` appears outside the two paths.
- Checks: a key on three distinct legacy numbers → `agent`; on two → passes; a key marked in `author_marks` →
  `agent`; a key in `owner_phone_denials` → `fraud`; a key on two counted listings of other accounts → `limit` at the
  confirmation; the same reached between confirmation and publish → `409 owner_limit` (`phone`); a rejected listing
  → `409 owner_rejected` until `owner:release`.
- Publish: each missing part named; no number → `409 owner_phone_required`; success → `active`, a number at or above
  the floor, `OwnerListingPublished` once; publish of an `active` listing → unchanged, no event; of a `paused` one →
  stays paused; price 30 USD → `422 errors.price`.
- Statuses: every row of the table, with its event; `active` for `held` and `withdrawn` → `409`; anything from
  `rented` → `409`.
- Moderation: each command writes its action row and log line without the number; «Снять» through
  `OwnerModeration::hold()` sets `held` with `moderator`; `VoteThresholdCrossed` for a native number withdraws it,
  for a legacy number does nothing.
- Waitlist: `204` twice, one row; `GET /me` says `waitlisted: true`, `has_listings` follows the rows.
- Stats: `daily` has seven values, the last today in Tashkent at 23:30 UTC; `opened`, `favorites`, `sent` count
  their rows.
- Harvester: a `district` comparison is stored; a `near` one is skipped; an `updated` of 61 days ago is skipped; an
  older `updated` never replaces a newer one; `MedianBook` falls back to the city row; the usual price is ± 10 %;
  `MarketVerdict` at −12 %, −5 % and +15 % gives `good`, `same`, `null`.
- Demand: two matching radars and one that does not → `count: 2`; `count: 0` with `radar.creation_enabled` off.
- Erasure: `ErasureService::erase()` of an owner removes his listings, photos (both disks) and waitlist row;
  `ErasureRegistryTest` and `RetentionRegistryTest` pass with the new tables. Purge (time travel): at 90 days − 1 s
  nothing changes, at + 1 s the number, texts, points and photos are gone and price, district and rooms stay.
- IDOR (`OwnerIdorMatrixTest`): every owner method with another user's `{id}` or `{photo}` → `404`, and nothing
  changes.

## Acceptance checklist

- [ ] Every owner method of WP-80 answers from native code locally and in CI with the switch on, in the shapes of
      WP-80, with `meta.source = native`.
- [ ] The number is stored only in `owner_listings.phone`, read by the two named paths, and found in no log, job
      payload, ledger row or analytics event.
- [ ] A stored photo has no EXIF block; public copies exist only for a listing in the feed and keep the
      `…/<digits>/<digits>.jpg?…` form.
- [ ] No public answer built from this package's data can carry the true point; the shown point is 100 … 250 m away
      and stable.
- [ ] City and district of the picker come from `geo_boundaries`; a point outside the city is refused; the dataset,
      its licence and its attribution are recorded (Q-DATA-051).
- [ ] Publish runs the checks in the specified order; a passing listing is `active` at once with a number at or
      above 10 000 000.
- [ ] `owner:hold`, `owner:release`, `owner:withdraw` and `owner:deny-phone` work and are logged with who; votes
      withdraw a native listing.
- [ ] The usual price and `stats.price_delta` appear wherever a harvested median exists, and nowhere else.
- [ ] Erasure and the 90-day purge are registered and tested with time travel.
- [ ] Both PRs name their migrations and env keys; `make ci-backend` and `make test-pgsql` are green.
- [ ] On staging the switch stays off and `POST /api/v1/owner/listings` answers `403 owner_disabled`; the end-to-end
      run with the switch on belongs to WP-89.

## Handoff

Empty.
