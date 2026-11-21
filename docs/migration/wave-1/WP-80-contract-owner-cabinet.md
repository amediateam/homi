# WP-80 — Contract: owner cabinet, contact requests, owner fields of the card

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (#104) |
| Depends on | Owner-cabinet plan, WP-13 |
| Size | about 2 800 changed lines with tests and fixtures, L |
| Behaviour reference | `08` §1.8 (`OwnerListing`, `OwnerRequest`), API-037 … API-054; `02` §12a (BR-API-159 … BR-API-189), LB-API-056; `03` SCR-049 … SCR-062, BR-APP-098 … BR-APP-103; `24` DEC-69 … DEC-81; `25` §4.2 |
| Needs from the production track | The regular deploy; `php artisan sources:publish-stub-media` again on staging and production (the new stub numbers). Three new env keys through a shared-file PR (`backend/.env.example`, `docs/infrastructure/environments.md`, `docs/infrastructure/local-development.md`): `OWNER_CABINET_ENABLED` (blank = off; it stays unset on the servers, DEC-81), `OWNER_CABINET_ALLOWED_IDS` (blank = no allow-list) and `OWNER_LISTINGS_PUBLIC` (blank = on). The API host's access log writes `/api/v1/owner/place` without its query string, so no owner's point lands in it (SEC-REQ-052) |

## Goal

The 18 new method–path pairs of the owner cabinet exist as stub routes with form requests, resources, fixtures and
scenarios: 17 owner methods and the seeker's request method `POST /listings/{number}/contact-request`. The card, the
preview, the map points, `GET /me` and `GET /reference` carry the new fields; OpenAPI and `@homi/types` are
regenerated, and the route test pins 59 pairs. The Mini App packages WP-81 … WP-83 can then build every screen of
the cabinet and of the seeker's side on stubs.

## Scope

In:

- The owner routes on `StubResponder` (WP-11) and the request method on the stub, each validating through its final
  form request, so the validation rules do not change when WP-84 and WP-85 give the controllers their real bodies.
- `origin`, `owner {}`, `contact.mode` and `contact.request` on the listing shapes of WP-12; a nullable
  `price_history[].channel`.
- The native number floor and `App\Services\Listings\ListingNumber::isNative()`.
- The native stub entries `10000001` … `10000008` and the legacy-shaped `100024`, `100025` of the listing catalogue,
  with stub photos; `StubListingRefs` resolves the native stub numbers through the card source (WP-13, "Design").
- `backend/config/owner.php` (new) and the switch of DEC-81: `403 owner_disabled`, `owner_enabled`.
- The new error codes and their exceptions.
- `docs/api/README.md`: the error table, the method table, the stub numbers and scenarios, the `meta.source`
  sentence for mixed lists, the count of 59 pairs.

Out:

- Real owner code: tables, drafts, photos, the phone, publish, checks, statuses, boundaries, medians — WP-84.
- Real requests, limits, answers, expiry and the disclosure rule — WP-85.
- The merge of native listings into the feed, count, new-since, flow, map and card — WP-86.
- The relay of requests on legacy `gate` listings — WP-87.
- Every screen: the owner form (WP-81), the owner lists and signals (WP-82), the seeker side (WP-83).
- `CLAUDE.md`: its count of pairs is updated by a separate shared-file PR after the merge, when it describes built
  code.

## Decisions that bind this package

- DEC-69: the owner cabinet of legacy release `index-CBlEKxdL.js` is in Wave 1, owner side and seeker side; this
  package fixes its whole contract. Functional parity (DEC-46) applies; the cabinet's deviations DEV-054 … DEV-063
  are on without flags (DEC-74, DEC-80, DEC-84), and the contract below already carries them.
- DEC-70: HOMI owners' listings live in HOMI's tables and are shown beside the legacy ones. Every listing item says
  where it comes from (`origin`); native numbers come from a range legacy never uses (the floor below).
- DEC-71: the request method covers legacy numbers as well; a legacy self-placed listing in `gate` mode is relayed
  by WP-87. The stub scenario `relay_on` shows that state.
- DEC-72: the owner's own number appears only in the owner listing object (`phone_display`), which `GET
  /owner/listings/{id}` and the owner's writes answer to the owner himself. No card, no list and no other method
  carries it; a seeker gets a number only from `POST /listings/{number}/contact`.
- DEC-75: while the relay does not work, a legacy self-placed listing that hides its number has `contact.mode:
  hidden`: shown in the feed and on the map, with no contact action on its card.
- DEC-76: the Mini App sends the current launch's `init_data` with a request, so that the owner can see the seeker's
  Telegram first name (how: integrator default 7); this package requires the field and never echoes it.
- DEC-77: native items have `owner_verified: true` and `owner.tier: self`.
- DEC-78: native items may carry the market verdict (`market`, `comparison`) and `GET /owner/demand` the usual
  price; both are `null` where no harvested median exists.
- DEC-79: `GET /owner/place` answers `{city, district_code}` only; no street address and no landmark.
- DEC-80: every `PATCH` and photo change of a published listing is live; `publish` on an `active` listing answers it
  unchanged.
- DEC-81: the server switch `OWNER_CABINET_ENABLED`, off by default. While it is off no draft can be created or
  published and the settings have no group «Сдаю квартиру»; taking a listing down, pausing it, «Сдано» and answering a
  request always work. Which methods the switch closes is the plan's reading of DEC-81, below ("The switch (DEC-81)").
- DEC-82: `PUT /owner/waitlist` and `owner.waitlisted` of `GET /me` stay in the contract; no screen of Wave 1 calls
  the method (the Mini App offers no entry), and whether and where to offer one is decided later.
- DEC-84: `GET /owner/demand` gives the exact `count` from 5 matching radars; for 1 … 4 it answers `count: null` with
  `few: true`, which the form shows as «несколько человек»; 0 is `count: 0` and hides the line (DEV-063).
- DEC-85: a seeker whom an owner closed his requests to (`reason_agent`, `late`) gets `409 request_closed` on that
  owner's listings, the same answer as for a let flat; nothing tells him why.
- DEC-88: `OWNER_CABINET_ALLOWED_IDS` is the staging run's allow-list of staff accounts (below).
- DEC-52: no number in any card or preview; `owner.description` is masked in `fromArray()` like every author-written
  text (WP-12, "Phone numbers in listing texts").
- DEC-51: while radars are off, `GET /owner/demand` answers `count: 0` and `few: false`, on stubs too.
- *Integrator defaults, listed for the reviewer* (the owner-cabinet plan's defaults, not decisions of the developer;
  listed in that PR):
  - two contact methods: the request is `POST /listings/{number}/contact-request`, and `POST
    /listings/{number}/contact` keeps its DEC-52 meaning and stays the only method that returns a number;
  - the request limits answer `429 rate_limited` with `reason` `requests_fast`, `requests_day` or `requests_week`
    and `Retry-After`, following the one-code-per-limit rule of WP-10 ("Envelope: codes, source, cursor"); no code of
    its own;
  - `contact.mode` has a fourth value `hidden` for a legacy self-placed listing whose number is hidden while the
    relay is off (DEC-75); it becomes `request` once the relay is on;
  - the native number floor is 10 000 000 (`owner.native_number_floor`), one PostgreSQL sequence, a number at the
    first publish (the sequence is WP-84's);
  - the native stub entries keep the default feed at 45 entries and three pages, with at least one native entry on
    page one;
  - the cabinet's renovation list is HOMI's configuration (`backend/config/owner.php`, served as
    `renovations.owner`), not legacy's `owner` key, which WP-41 drops;
  - the plan's reading of DEC-81 (beside DEC-81 in the plan's list): the switch freezes the content of the cabinet and
    leaves every way down open (the table of "The switch (DEC-81)"); `owner_enabled` of `GET /reference` follows the
    switch, and the Mini App ignores an `owner_new` launch while it is off;
  - a native listing's `author` is a `phone` author without a digit of the number, `{"kind": "phone", "label":
    "Хозяин", "count": …}`; its author key is the owner's phone author key (WP-84), so «Скрыть автора» on it also
    hides that person's legacy listings with the same number, and HOMI's realtor votes and the check of DEC-77 count
    on the same key; no new `kind` (default 24);
  - HOMI's realtor check and the report votes never reject or withdraw on their own: they hold the listing
    (`hold_reason`) for the operators to decide (WP-84); a publish they hold answers `200` with `status: paused`,
    `held: true` and `hold_reason` (default 26); `reject_reason` is `denied` (the operators' deny list, legacy's
    `fraud`; default 32) or `limit` (the phone limit at the confirmation), and legacy's `agent` is not produced;
  - `OWNER_CABINET_ALLOWED_IDS`: when set, only these Telegram ids may create a draft, ask for the phone and publish
    (the staging run with staff accounts of DEC-88; WP-84 enforces it; default 30); `OWNER_LISTINGS_PUBLIC` (on
    unless set to `false`): off takes every native listing out of every public answer at once and closes the seeker's
    side of a native number — the request method answers `409 request_closed`, the contact method `404
    contact_unavailable` — while the owner's cabinet and his answers to requests already open keep working (WP-86 and
    WP-85 enforce it; default 31);
  - the consent of an owner and of a seeker is recorded on the server with the version of the privacy text in force
    (`config('owner.consent_version')`, WP-84 and WP-85), so no method takes a consent field;
  - defaults of this specification: the shapes of the owner listing and owner request objects below (the legacy
    models of `08` §1.8 in v1 form); the value ranges of the form fields; `201` for a created draft, photo or
    request and `200` for an existing one; an untouched draft is answered whatever the limit; `422
    validation_failed` naming `init_data` when the launch data does not verify; `422` (not `409`) for a status
    change that the listing's status does not offer; the place lookup reads its point at 3 decimals; the block answer
    of a native author lists every number HOMI knows with the owner's phone key, native and legacy (WP-13, WP-44); the
    rate limits of the owner routes ("Methods of the owner cabinet").

## Design

### Conventions

All paths are under `/api/v1`. Route names follow `api.v1.<area>.<action>`; `{id}` and `{photo}` are ULIDs
(`whereUlid`), `{number}` a listing number (`whereNumber`). A foreign id answers exactly like an unknown one: `404
not_found` (SEC-REQ-014). Reads need `app:read`, writes `app:write`. Every answer with a body goes through
`sourced()` of `ApiController` with `meta.source = stub` in this package; a `204` has no body. Common errors of
every method: `401 unauthenticated`, `403 access_denied`, `422 validation_failed`, `429 rate_limited`, `503
source_unavailable`; the four reserved scenarios and the six `access_*` of WP-10 apply.

An owner listing has a ULID from its creation and a listing number only from its first publish. The cabinet is long
rent only: a native listing's `deal` is always `rent_long` and its `type` `apartment` or `room` (integrator default 18
of the owner-cabinet plan).

### The switch (DEC-81)

`backend/config/owner.php` (new):

| Key | Value | Read by |
| --- | ----- | ------- |
| `enabled` | `(bool) env('OWNER_CABINET_ENABLED', false)` | the middleware below; `owner_enabled` of `GET /reference` |
| `allowed_ids` | `OWNER_CABINET_ALLOWED_IDS`: comma-separated Telegram ids, a list of integers; empty = no allow-list | WP-84's middleware check (create, phone request, publish) |
| `public` | `env('OWNER_LISTINGS_PUBLIC') !== false`: blank or unset = on, only `false` turns it off (a blank value reads as `''`, which a `(bool)` cast would turn off) | WP-86's merge: off takes every native listing out of every list, count, map, card and radar; WP-85: off closes the request (`409 request_closed`) and the disclosure (`404 contact_unavailable`) of a native number |
| `limits.listings` | `2` — the listings that count, per account and per phone alike | `max` of the list; `limits.owner_listings` |
| `limits.photos` | `10` | `limits.owner_photos`; the photo method |
| `limits.requests` | `['day' => 10, 'week' => 30, 'pause_minutes' => 10]` | `limits.requests`; WP-85 reads them from env |
| `renovations` | the cabinet's renovation codes with a name per locale (`ru`, `uz`, `en`) | `renovations.owner` |
| `native_number_floor` | `10000000` | `ListingNumber`; WP-84's sequence |

Until the codes of legacy's `owner` list are known, `renovations` holds `euro`, `cosmetic` and `none`, the long-rent
codes and names of the stub reference (`backend/resources/fixtures/v1/reference/default.<locale>.json`); WP-86 maps
them to the filter's long-rent codes.

`App\Http\Middleware\EnsureOwnerCabinetEnabled`, the twin of `EnsureRadarsEnabled`: while `owner.enabled` is false
it throws `App\Exceptions\Owner\OwnerCabinetDisabled` (an `ApiException`: 403, `owner_disabled`) after
authentication and before validation or any lookup. The switch freezes the content of the cabinet and leaves every
way down open, so nothing an owner already has is stuck (the plan's reading of DEC-81, listed for the reviewer):

| While the switch is off | Methods |
| ----------------------- | ------- |
| `403 owner_disabled` from the middleware, attached by class | `POST /owner/listings`; `PATCH /owner/listings/{id}`; `POST /owner/listings/{id}/photos`, `DELETE /owner/listings/{id}/photos/{photo}`, `PUT /owner/listings/{id}/photos/order`; `PUT /owner/listings/{id}/contact-mode`; `POST /owner/listings/{id}/phone-request`; `POST /owner/listings/{id}/publish` |
| `403 owner_disabled` from `OwnerStatusController`, after validation and before the lookup | `PUT /owner/listings/{id}/status` with `status: active` (a resume puts a listing back into the feed) |
| allowed | every read (`GET /owner/listings`, `GET /owner/listings/{id}`, `GET /owner/listings/{id}/requests`); `PUT /owner/listings/{id}/status` with `paused`, `rented` or `removed`; `DELETE /owner/listings/{id}` of a draft or a rejected listing; `POST /owner/requests/{id}/answer`; `PUT /owner/waitlist`; `GET /owner/place`; `GET /owner/demand`; the seeker's `POST /listings/{number}/contact-request` on a listing still in the feed |

The middleware and the status check stay when WP-84 gives the controllers real bodies; WP-84 adds the allow-list of
`owner.allowed_ids` to the middleware of the create, phone-request and publish routes (the same `403
owner_disabled`). Listings that exist when the switch goes off stay in the feed until their owner pauses or removes
them or the operators hold them. The Mini App closes the form's addresses while `owner_enabled` is false and keeps
«Мои объявления», «Отклики» and the owner panel for a user whose `GET /me` says `owner.has_listings` (WP-81, WP-82).

`backend/.env.example` carries `OWNER_CABINET_ENABLED=` blank, with the comment «true locally; unset on the servers
until DEC-81's gates», because the servers' env files were built from it; `OWNER_CABINET_ALLOWED_IDS=` and
`OWNER_LISTINGS_PUBLIC=` are blank beside it. `docs/infrastructure/local-development.md` tells the developer to set
`OWNER_CABINET_ENABLED=true` in the local `.env`, and `backend/phpunit.xml` sets it to `true`, so the local stack, the
suites and CI run with the cabinet on; blank or unset means off. The keys enter through a shared-file PR.

### The owner listing object

`GET /owner/listings/{id}` and every owner write that answers the listing use this shape (`OwnerListingResource`);
the list uses the item shape below (`OwnerListingItemResource`):

```json
{"id": "01JF0000000000000000000003", "number": 10000008, "status": "active", "withdrawn": false, "held": false,
 "hold_reason": null, "published_at": "2026-11-18T07:00:00+00:00",
 "photos": [{"id": "01JF0000000000000000000031", "url": "https://cdn.homi.loc/stub/10000008/1.jpg?e=0&s=stub"}],
 "form": {"city": "tashkent", "district_code": "yunusobod", "landmark": "Мегапланет", "lat": 41.36512, "lon": 69.28431,
          "room": false, "rooms": 2, "area_m2": 54, "floor": 3, "floors_total": 9, "price": 600, "currency": "USD",
          "renovation": "euro", "furniture": true, "tenants": ["family"], "pets": null, "description": "Светлая, тихий двор."},
 "stats": {"pending": 2, "requests": 5, "given": 1, "sent": 0, "opened": 41, "favorites": 3, "days_listed": 2,
           "daily": [0, 0, 0, 0, 0, 12, 29], "price_delta": -0.08, "price_tone": "good"},
 "contact_mode": "request", "phone_set": true, "phone_display": "+998 00 000-00-81", "phone_error": null,
 "reject_reason": null, "shown_point": {"lat": 41.36671, "lon": 69.28602, "radius_m": 500}}
```

| Field | Rule | Legacy (`08` §1.8) |
| ----- | ---- | ------------------ |
| `id` | ULID | `id` |
| `number` | the public listing number, `null` before the first publish | `listing_id` |
| `status` | `draft`, `active`, `paused`, `rented`, `removed`, `rejected` | same |
| `withdrawn`, `held` | booleans, always present: `withdrawn` taken down for good by the operators; `held` on hold, with `status: paused` — put there by the operators or, for the operators to decide, by HOMI's realtor check or the report votes (WP-84); not resumable by the owner (BR-API-177) | `withdrawn?`, `held?` |
| `hold_reason` | with `held`: `check_agent` (the realtor check at publish), `votes_agent`, `votes_fraud`, `votes_rented` (a vote threshold), `moderator` (an operator); else `null`. The client shows every hold as «На проверке» and never names a realtor | none |
| `published_at` | ISO 8601 or `null`; `null` until the listing first enters the feed (a listing held at its first publish has a `number` and no `published_at`) | same |
| `photos` | always an array, at most `limits.owner_photos`, the first is the cover; `url` absolute; a published listing's addresses have the media form `…/<digits>/<digits>.jpg?…` (`owner/<token>/<n>.jpg?v=<version>`, WP-84), so the client's small variant `.s.jpg` works (RES-002); a draft's are owner-only addresses valid for at least 10 minutes | `photos` |
| `form` | always an object, every key present, `null` = not set (table below) | `form` |
| `stats` | `null` for a draft; else `pending`, `requests`, `given`, `sent`, `opened` (integers ≥ 0), `favorites`, `days_listed` (integer or `null`), `daily` (opens per day, oldest first, the last value is today in Asia/Tashkent, 7 values), `price_delta` (fraction, negative = below the median) and `price_tone` (a tone of WP-12's `market`), both `null` without a harvested median (DEC-78) | `stats` |
| `contact_mode` | `request` or `phone`, never `null`; a new listing starts with `request` (DEV-055) | `gate`, `open`, `null` |
| `phone_set` | boolean | same |
| `phone_display` | the owner's own number in display form, or `null` (DEC-72) | same |
| `phone_error` | `not_uz`, `not_own` or `null`: the last shared contact was refused (DEV-056) | part of `reject_reason` |
| `reject_reason` | with `status: rejected`: `denied` (the number is on the operators' deny list) or `limit` (the number already had `limits.owner_listings` listings that count at its confirmation); else `null` (DEV-056). Legacy's `agent` is not produced: HOMI's realtor check holds instead (`hold_reason`) | `reject_reason?` (`agent`, `fraud`, `limit`) |
| `shown_point` | `{lat, lon, radius_m}`, the circle seekers see, or `null` without a point | `shown_point?` |

`form`:

| Key | Type and range | Note |
| --- | -------------- | ---- |
| `city` | a city code of `GET /reference` | |
| `district_code` | a district code of that city, or `null` | |
| `landmark` | text, at most 120 characters | «Адрес или ориентир» (SCR-052) |
| `lat`, `lon` | numbers, rounded to 5 decimals; sent together | the true point |
| `room` | boolean | «Комната»; excludes `rooms` |
| `rooms` | integer 1 … 5 (`5` = «5+») | |
| `area_m2` | number 5 … 1 000, one decimal | |
| `floor` | integer −3 … 99 (`0` the ground-level floor, as WP-12) | `floor > floors_total` → `422` naming `floor` |
| `floors_total` | integer 1 … 99 | |
| `price` | integer 1 … 999 999 999 999 (12 digits) | per month, in `currency` |
| `currency` | `USD`, `UZS` | default `USD` |
| `renovation` | a code of `renovations.owner`, or `null` | |
| `furniture`, `pets` | `true`, `false` or `null` (three states) | |
| `tenants` | array of `family`, `students`, `girls`, `boys`, `foreigners`; empty = anyone | |
| `description` | text, at most 600 characters | shown to the owner as written |

`GET /owner/listings` items are the same object without `phone_display` and without `form.lat` and `form.lon`
(`phone_set` and `shown_point` stay): only the owner listing object — the show answer and the owner's writes that
answer the listing, all to the owner himself — carries the true point and the owner's own number. Two resources,
`OwnerListingResource` and `OwnerListingItemResource`, keep the two shapes apart in OpenAPI.

### The owner request object

The items of `GET /owner/listings/{id}/requests` and the answer of `POST /owner/requests/{id}/answer`:

```json
{"id": "01JF0000000000000000000201", "name": "Азиз", "who": "couple", "people": 2, "move_in": "с 1 декабря",
 "message": "Здравствуйте! Можно посмотреть в субботу?", "status": "pending", "agent_marked": false,
 "can_reason": false, "can_undo": false, "can_late": false}
```

`name` is the seeker's Telegram first name, taken from verified launch data at the time of the request (DEC-76),
or `null`. `who` is `one`, `couple`, `family`, `students` or `friends`; `people` 1 … 20; `move_in` and `message`
nullable. The owner side's `status` is `pending`, `given`, `declined`, `agent`, `expired` or `cancelled`; the seeker's
`contact.request.status` never shows `agent` — the seeker sees `declined` instead. `agent_marked`, `can_reason`,
`can_undo` and `can_late` are booleans, always present (`08` §1.8 has them optional): the server decides which
answers the owner may still give (BR-API-180).

### Methods of the owner cabinet

| v1 method | Route name | Access | Legacy | Notes |
| --------- | ---------- | ------ | ------ | ----- |
| `GET /owner/listings` | `api.v1.owner.listings.index` | `app:read` | API-037 | `items`, `max`, `can_add`, `past`; the pending count moved to `GET /me` (fix of LB-APP-066) |
| `POST /owner/listings` | `api.v1.owner.listings.store` | `app:write`, switch, `throttle:owner-writes` | API-038 | the caller's untouched draft when one exists (DEV-054), else `409 owner_limit` at the limit |
| `GET /owner/listings/{id}` | `api.v1.owner.listings.show` | `app:read` | API-039 | also the phone poll; with the owner's writes, the only answers with the true point and the owner's own number |
| `PATCH /owner/listings/{id}` | `api.v1.owner.listings.update` | `app:write`, switch, `throttle:owner-writes` | API-040 | changed fields only, `null` clears; `422 validation_failed` with `errors` per field; `409 owner_listing_locked`; live on a published listing (DEC-80) |
| `DELETE /owner/listings/{id}` | `api.v1.owner.listings.destroy` | `app:write`, `throttle:owner-writes` | part of API-046 | a draft or a rejected listing (DEV-056); anything else `409 owner_listing_locked` |
| `POST /owner/listings/{id}/photos` | `api.v1.owner.listings.photos.store` | `app:write`, switch, `throttle:uploads` | API-041 | multipart `file`; `HashedUploader`; the media codes and `409 owner_photo_limit` |
| `DELETE /owner/listings/{id}/photos/{photo}` | `api.v1.owner.listings.photos.destroy` | `app:write`, switch, `throttle:owner-writes` | API-042 | `{photo}` a ULID |
| `PUT /owner/listings/{id}/photos/order` | `api.v1.owner.listings.photos.order` | `app:write`, switch, `throttle:owner-writes` | API-043 | `{ids}`: the full order, the cover first; another set → `422` |
| `PUT /owner/listings/{id}/contact-mode` | `api.v1.owner.listings.contact-mode` | `app:write`, switch, `throttle:owner-writes` | API-044 | `{mode: "request" \| "phone"}` (legacy `gate` \| `open`); a new listing starts with `request` (DEV-055) |
| `POST /owner/listings/{id}/phone-request` | `api.v1.owner.listings.phone-request` | `app:write`, switch, `throttle:owner-writes`, `throttle:owner-publish` | none | opens the ten-minute phone window; answers the listing |
| `POST /owner/listings/{id}/publish` | `api.v1.owner.listings.publish` | `app:write`, switch, `throttle:owner-writes`, `throttle:owner-publish` | API-045 | `422` naming `city`, `place`, `rooms`, `price`, `photos`; `409 owner_phone_required`; `409 owner_limit`; `409 owner_rejected`; a listing the checks hold answers `200` with `held: true` |
| `PUT /owner/listings/{id}/status` | `api.v1.owner.listings.status` | `app:write`, switch for `active`, `throttle:owner-writes` | API-046 | `{status: "active" \| "paused" \| "rented" \| "removed"}`; `active` refused for `held`; nothing leaves `withdrawn`, `rented` or `removed` |
| `GET /owner/listings/{id}/requests` | `api.v1.owner.listings.requests.index` | `app:read` | API-048 | cursor list, newest first, 20 a page; the "all requests" form is not built |
| `POST /owner/requests/{id}/answer` | `api.v1.owner.requests.answer` | `app:write`, `throttle:owner-writes` | API-049 | `{action}`; `409 request_answer_closed` |
| `PUT /owner/waitlist` | `api.v1.owner.waitlist.update` | `app:write`, `throttle:owner-writes` | API-050 | idempotent; `GET /me` says `owner.waitlisted` (the Mini App offers no entry, so LB-APP-071 has nothing to fix there; DEC-82) |
| `GET /owner/place` | `api.v1.owner.place` | `app:read`, `throttle:owner-place` | API-051 | `?lat=&lon=` (3 decimals) → `{city, district_code}`, either `null` (DEC-79) |
| `GET /owner/demand` | `api.v1.owner.demand` | `app:read`, `throttle:owner-demand` | API-053 | `?city=&district=&rooms=&room=&price=&currency=` → `{count, few, usual_low_usd, usual_high_usd}` (DEC-84) |

Not built: `GET /owner/pending` (API-047: its number is `owner.pending` of `GET /me`); `GET /owner/map-start`
(API-052, DEV-061: the picker starts at the centre of the form's city or at the user's own location).

The owner routes form one group `Route::prefix('owner')->name('owner.')` inside the `auth:sanctum` group of
`backend/routes/api.php`, each route with its own ability, as the personal routes of WP-13 are written. The rate
limits of SEC-REQ-027 (`16`) for the cabinet are named limiters in `AppServiceProvider`, beside `uploads`, keyed like
it per actor: `owner-writes` (60 a minute: every owner write), `owner-publish` (10 an hour for each of publish and the
phone request, keyed per route and actor, on top of `owner-writes`), `owner-place` (60 a minute) and `owner-demand`
(30 a minute); they answer `429 rate_limited` without a `reason`, like every limit but the daily one (WP-10).

#### Drafts, form and status

- `GET /owner/listings` → `200 {"data": {"items": [OwnerListingItem…], "max": 2, "can_add": true, "past": 0}}`.
  `items` holds every listing of the caller, drafts and history included, newest first; `max` is
  `limits.owner_listings`; `can_add` is `false` while the caller has `max` listings that count (`active` or `paused`
  and not `withdrawn`; drafts do not count); `past` is the number of the caller's listings that left the feed for
  good, always present (BR-API-162; «С возвращением!», BR-APP-095).
- `POST /owner/listings` — no body. `200` with the caller's untouched draft when one exists (no form field set and
  no photo; DEV-054), whatever the limit; else `409 owner_limit` (`limit: "account"`, `max`) when `can_add` is false;
  else `201` with a new draft. Behind the switch. A new draft has `contact_mode: "request"`, `currency: "USD"`, the
  caller's city in `form.city` (or `null`) and every other form key `null` or empty.
- `PATCH /owner/listings/{id}` — a body with any subset of the `form` keys; a key with `null` clears it, an absent
  key is unchanged; unknown keys are ignored. `lat` and `lon` come together. `200` with the listing. `422
  validation_failed` names each rejected key in `errors`; a point outside the country or outside `form.city` is
  `errors.point` (WP-84 checks it; the stub accepts every point). `409 owner_listing_locked` for a `held`,
  `withdrawn`, `rented` or `removed` listing. A change of a published listing is live at once (DEC-80). Behind the
  switch.
- `DELETE /owner/listings/{id}` → `204` for a draft or a `rejected` listing (DEV-056); any other status `409
  owner_listing_locked`. A second call → `404 not_found`.
- `PUT /owner/listings/{id}/status` — `{status}` of `active`, `paused`, `rented`, `removed`. Allowed: `active` ↔
  `paused`; `active` or `paused` → `rented` or `removed`. `active` for a `held` listing, and anything for a
  `withdrawn`, `rented` or `removed` one → `409 owner_listing_locked`. A status the current one does not offer (a
  draft, a rejected listing, the same status) → `422` naming `status`. `200` with the listing. `rented` closes the
  pending requests of the listing (`cancelled`, BR-API-176; WP-85). With the switch off `active` answers `403
  owner_disabled` (after validation, before the lookup); `paused`, `rented` and `removed` work.

#### Photos

- `POST /owner/listings/{id}/photos` — `multipart/form-data` with one field `file`. `201` with the listing, the new
  photo last. Errors: the media codes of `HashedUploader` (`unsupported_mime`, `too_large`, `too_big`, `undecodable`;
  `docs/api/README.md`, "Error codes") and `409 owner_photo_limit` when the listing has `limits.owner_photos`
  photos; `409 owner_listing_locked`. The route also carries `throttle:uploads`; the three photo methods are behind
  the switch. The upload never goes through
  `POST /media`, whose `media:write` ability the Mini App's token does not have (`backend/routes/api.php:105`).
- `DELETE /owner/listings/{id}/photos/{photo}` → `200` with the listing; an unknown photo → `404 not_found`. The
  Mini App offers an undo before it sends this (DEV-057).
- `PUT /owner/listings/{id}/photos/order` — `{"ids": [ULID…]}`, exactly the listing's photo ids in the new order,
  the cover first; a missing, extra or repeated id → `422` naming `ids`. `200` with the listing.

#### Phone, contact mode and publish

- `PUT /owner/listings/{id}/contact-mode` — `{"mode": "request" | "phone"}` → `200` with the listing; any other
  value `422`. `request` hides the number and takes requests (legacy `gate`); `phone` shows it through the counted
  contact method (legacy `open`). Behind the switch.
- `POST /owner/listings/{id}/phone-request` — no body. Opens the ten-minute phone window of WP-84: a contact the
  caller shares with HOMI's bot inside it becomes the listing's number (WP-88). `200` with the listing; the client
  then calls `tg.requestContact()` and polls `GET /owner/listings/{id}` (BR-API-170). Behind the switch. The method
  takes no consent field: when the number is accepted, WP-84 records the moment and the version of the privacy text
  the phone step shows (`config('owner.consent_version')`, kept in step with that text), and erases both with the
  number; WP-85 records the same version with a seeker's request.
- `POST /owner/listings/{id}/publish` — no body. `200` with the listing, `status: active` and its `number`.
  Refusals, in this order (WP-84, "Publish and checks"): `409 owner_listing_locked` (`held`, `withdrawn`, `rented`,
  `removed`), and `409 owner_rejected` with its `reason` for a `rejected` listing; `422 validation_failed` whose
  `errors` name the missing parts among `city`, `place` (no point), `rooms` (neither `rooms` nor `room`), `price` and
  `photos` (none); `409 owner_phone_required` (no confirmed number); `409 owner_limit` (`limit` `account` or `phone`,
  `max`); `422 validation_failed` naming `price` (outside 50 … 20 000 USD a month) or `point` (outside the country
  or the city); `409 owner_rejected` (`reason: denied`: the number is on the operators' deny list). A listing that
  HOMI's realtor check flags is not refused: the answer is `200` with its `number`, `status: paused`, `held: true`
  and `hold_reason: check_agent`, and the listing waits for the operators (WP-84); the client shows «На проверке». On
  an `active` listing `publish` answers it unchanged (DEC-80); on a `paused` listing it keeps it paused. Behind the
  switch.

#### Requests and the waitlist (owner side)

- `GET /owner/listings/{id}/requests` — query `cursor` and `limit` of `ListPersonalRequest` (1 … 50, default 20); a
  cursor list of owner request objects, newest first; `meta.next_cursor`; a cursor the list did not give ends it
  quietly.
- `POST /owner/requests/{id}/answer` — `{"action": "give" | "decline" | "reason_found" | "reason_agent" | "undo" |
  "late"}` → `200` with the request. `give` → `given`; `decline` → `declined`, undoable for 10 minutes; `reason_found`
  → `declined` with the reason «уже нашли»; `reason_agent` and `late` → `agent` (the seeker can no longer write to
  this owner's flats); `undo` → the previous answer. An action its flags do not allow, or a request that changed
  meanwhile → `409 request_answer_closed`. Works with the switch off.
- `PUT /owner/waitlist` — no body → `204`, also on a repeat. `GET /me` then says `owner.waitlisted: true`. No screen
  of Wave 1 calls it (DEC-82).

#### Place and demand

- `GET /owner/place?lat=&lon=` — both required numbers; the client sends them rounded to 3 decimals (about 100 m;
  a district needs no more) and the server rounds a finer value to 3 before the lookup, so no owner's exact point
  travels in a query string (SEC-REQ-052) → `200 {"data": {"city": "tashkent", "district_code": "yunusobod"}}`;
  either may be `null` (outside HOMI's boundaries, DEC-79).
- `GET /owner/demand?city=&district=&rooms=&room=&price=&currency=` — `city` required; `district` a district code;
  `rooms` 1 … 5; `room` boolean; `price` an integer and `currency` `USD` or `UZS`, both optional → `200 {"data":
  {"count": 7, "few": false, "usual_low_usd": 550, "usual_high_usd": 680}}`. `count` is the number of active radars
  that would match the flat when it is 5 or more; for 1 … 4 the answer is `count: null` with `few: true`, never the
  number; 0 is `count: 0`, also while radars are off (DEC-51); `few` is `true` only for 1 … 4 (DEC-84, DEV-063). The
  bounds are `null` without a harvested median (DEC-78).

### The request method: `POST /listings/{number}/contact-request`

Route name `api.v1.listings.contact-request.store`, `app:write`, legacy API-054. It is registered outside the
`listings` prefix group, whose middleware is `ability:app:read` for the whole group (`backend/routes/api.php:62`),
next to `listings/{number}/reports`, with `whereNumber('number')`.

| Body field | Type | Rule |
| ---------- | ---- | ---- |
| `who` | string | required; `one`, `couple`, `family`, `students`, `friends` |
| `people` | integer | required; 1 … 20 |
| `move_in` | string or `null` | at most 32 characters, trimmed; empty → `null` |
| `message` | string or `null` | at most 500 characters, trimmed; empty → `null` |
| `init_data` | string | required; the raw `initData` of the current launch, at most 4 096 bytes; never stored, logged or echoed |

Answer `201 {"data": {"status": "pending"}}` when a request was created; `200` with the current status when the
caller already has a request on this listing (a repeat). One open request per user and listing. After `expired` one
new request is allowed (DEV-060); after `declined` a repeat answers `declined`. Native numbers go to WP-85's
service, a legacy self-placed listing in `gate` mode to WP-87's relay; by the number (`ListingNumber::isNative()`).

Errors, checked before anything is created:

| Status and code | When |
| --------------- | ---- |
| `404 not_found` | unknown number |
| `422 validation_failed` | a bad field; `init_data` that does not verify, is too old or belongs to another user names `init_data` |
| `409 no_chat` | HOMI's bot cannot write to the seeker yet; nothing was created (BR-API-184); the client asks for write access and repeats once |
| `429 rate_limited` | `reason` `requests_fast` (the pause after several requests in a row), `requests_day` or `requests_week`; `Retry-After` in seconds |
| `403 requests_blocked` | requests of this user are closed (legacy `blocked` and `harvest` alike) |
| `409 request_closed` | the listing takes no requests: not in `request` mode, let, paused, removed, a legacy `gate` listing while the relay is off, the owner marked this seeker as a realtor (DEC-85), the listing already took its requests of the day (`owner.limits.requests.per_listing_day`, WP-85), or a native listing while `OWNER_LISTINGS_PUBLIC` is off (default 31) |
| `409 own_listing` | the caller's own listing |
| `409 contact_open` | the listing shows its number now (`phone` mode); the client reads the card again |

### Changed shapes

#### `GET /me`

`data` gains `owner: {"pending": 2, "has_listings": true, "waitlisted": false}`, always present: `pending` is the
number of pending requests on the caller's listings; `has_listings` whether the caller has any owner listing, drafts
included; `waitlisted` whether `PUT /owner/waitlist` was called. Values come from WP-84 and WP-85; here from the
`me` fixtures. Sign-in answers the same object.

#### `GET /reference`

`data` gains, for every driver and from `config/owner.php`, not from a fixture or a legacy answer (like
`radars_enabled`, WP-11 "`GET /reference`"):

```json
{"owner_enabled": true,
 "limits": {"radars": 10, "owner_listings": 2, "owner_photos": 10, "requests": {"day": 10, "week": 30, "pause_minutes": 10}},
 "renovations": {"rent_long": ["…"], "rent_daily": [], "sale": [], "owner": [{"code": "euro", "name": "Евроремонт"}]}}
```

`owner_enabled` is a boolean, always present. `renovations.owner` is localised by `Accept-Language` from the names
in the configuration. The answer may be cached for five minutes (`max-age` 300, WP-11); the Mini App's reference
cache revalidates after ten (`REFERENCE_LIFE` of `frontend/app/lib/reference/server.ts`, WP-22), so a running Mini App
sees a change of the switch within about ten minutes.

#### Listing items and the card

Every preview (feed, favourites, history, radar previews, the card's `preview=1` form) and every map point gains
`origin`: `legacy` or `native`. Native items have `is_owner: true` and `owner_verified: true`, so the chip shows from
the preview (BR-APP-100). The full card gains `owner` and two keys of `contact`, and a native card has an `author`
without a digit of the owner's number:

```json
{"origin": "native",
 "author": {"kind": "phone", "label": "Хозяин", "count": 1},
 "owner": {"tier": "self", "mine": false, "listing_id": null, "response_minutes": 15, "description": "…"},
 "contact": {"has_phone": false, "contact_url": null, "contact_paid": false, "mode": "request",
             "request": {"status": "pending", "sent_at": "2026-11-19T07:00:00+00:00"}}}
```

| Field | Rule |
| ----- | ---- |
| `owner` | always present on the full card |
| `owner.tier` | `self` (placed by its owner, in HOMI or in legacy), `verified` (`owner_verified`), `claimed` (`is_owner` and not verified) or `null`; it replaces the string match of labels (fix of LB-APP-075) |
| `owner.mine` | boolean: the caller's own listing (per user) |
| `owner.listing_id` | the owner listing's ULID, only when `mine`, else `null` |
| `owner.entry` | boolean: the card invites the caller to place a listing of his own («Тоже сдаёте квартиру?», `03` BR-APP-115). True when the cabinet is on (`owner_enabled`), the listing is posted by an owner (`is_owner`, of any `tier`) and it is not the caller's own (`mine` false); else false (DEC-94). Legacy's field is `owner_entry` at the top of the card (`$KVADRO_ROOT/docs/api.md` §3, r38); HOMI keeps it with the other per-user owner keys, and counts every `tier` as an owner's listing (both choices of the integrator, listed for the reviewer) (*added by the intake of `index-YX9bFVws.js`*) |
| `owner.response_minutes` | the owner's usual answer time in minutes, or `null` |
| `owner.description` | the owner's own text, masked in `fromArray()` (DEC-52), or `null` |
| `contact.mode` | `phone`, `request`, `hidden` (DEC-75) or `null` (a listing that is not self-placed) |
| `contact.request` | the caller's request on this listing, `{status, sent_at}`, or `null`; `status` is `pending`, `given`, `declined`, `expired` or `cancelled` — never `agent` |
| `author` of a native item | `{"kind": "phone", "label": <the catalogue text «Хозяин» in the request locale>, "count": <the owner's listings in the feed>}`; never a digit of the number, no new `kind` (WP-12's `author` shape). The real driver takes the label from `backend/lang/{ru,uz,en}/listings.php` (WP-86); the stub entries carry «Хозяин» |

For an owner listing `price_history[].channel` and `.url` are `null` (one entry, `kind: published`), `sources` is
`[]`, `original.text` and `original.url` are `null`, `source_ref` is `null`, `owner_label` is `null` (the tier says
it), and `geo_radius_m` is the shown circle's radius. `location`, `center_km` and `metro` of a native item are those
of the shown point (SEC-REQ-052). `market` and `comparison` follow DEC-78.

The author key behind a native `author` is the owner's phone author key (WP-84, `phone_author_key`), not a key of
its own: `PUT /listings/{number}/blocked-author` on a native number blocks that key, so the person's legacy listings
with the same number are hidden too, and HOMI's realtor votes (WP-44) and the realtor check of DEC-77 (WP-84) count
on the same key. WP-26's rule offers «Это риелтор» on a `phone` author, so native cards offer it without a change.
The block answer of a native author (WP-13) and its entry in `GET /hidden` carry `kind: phone` and the label above;
`listing_numbers` holds every number HOMI knows with that key, native and legacy alike, as WP-44's
`BlockedAuthorService::block()` answers for any phone author (default 24).

The new keys are required in the resources (always present, nullable where stated). The Mini App's typed test
objects and the dev emulator's fixtures that build a card, a preview or `GET /me` gain them in this PR, so `pnpm
--filter app typecheck` stays green after `pnpm types:generate` (the frontend reads the backend fixtures through
`fixture()` of `@homi/testing`).

#### Contact and translation of the card

- `POST /listings/{number}/contact`: a `request`-mode listing answers `404 contact_unavailable` unless the caller's
  request is `given`; a `hidden` one always; a native one while `OWNER_LISTINGS_PUBLIC` is off (default 31). It stays
  the only method that returns a number.
- `POST /listings/{number}/translation`: a native number answers `404 not_found` (no original text).

### Error codes

Rows for the error table of `docs/api/README.md`; each is an `ApiException` (WP-10) whose `extra` carries the listed
keys.

| Status | `code` | When | Class |
| ------ | ------ | ---- | ----- |
| 403 | `owner_disabled` | The cabinet is switched off (`owner_enabled: false`) and the method changes content or creates or resumes a listing (the table of "The switch (DEC-81)"), or the caller is not on `owner.allowed_ids` when it is set (create, phone request, publish) | `App\Exceptions\Owner\OwnerCabinetDisabled` |
| 409 | `owner_limit` | The account or the phone already has `max` listings that count; `limit` is `account` or `phone`, `max` the number | `…\Owner\OwnerLimitReached` |
| 409 | `owner_listing_locked` | The listing cannot be changed in its state (`held`, `withdrawn`, `rented`, `removed`) | `…\Owner\OwnerListingLocked` |
| 409 | `owner_phone_required` | Publish without a confirmed number | `…\Owner\OwnerPhoneRequired` |
| 409 | `owner_rejected` | The listing is rejected; `reason` is `denied` (the operators' deny list) or `limit` (the phone limit at the confirmation) | `…\Owner\OwnerRejected` |
| 409 | `owner_photo_limit` | One photo more than `limits.owner_photos` | `…\Owner\OwnerPhotoLimit` |
| 409 | `no_chat` | Also the request method: the bot cannot write to the user yet; nothing was created | `App\Exceptions\Radar\NoChat` (its message is not radar-specific) |
| 429 | `rate_limited` | Also the request limits: `reason` `requests_fast`, `requests_day` or `requests_week`, with `Retry-After` | `App\Exceptions\Requests\RequestLimitReached` |
| 403 | `requests_blocked` | Requests of this user are closed | `…\Requests\RequestsBlocked` |
| 409 | `request_closed` | The listing takes no requests from the caller, or none more today | `…\Requests\RequestClosed` |
| 409 | `own_listing` | The caller's own listing | `…\Requests\OwnListing` |
| 409 | `contact_open` | The listing shows its number now; read the card again | `…\Requests\ContactOpen` |
| 409 | `request_answer_closed` | The owner's answer is no longer possible (the undo window passed, or the request changed meanwhile) | `…\Requests\RequestAnswerClosed` |

The row of `429 rate_limited` in the table gains the request reasons; `404 contact_unavailable` gains "a
`request`-mode listing without a `given` request of the caller".

### Native numbers

`App\Services\Listings\ListingNumber`: `floor(): int` (`config('owner.native_number_floor')`) and `isNative(int
$number): bool` (`$number >= floor()`). Legacy numbers were 47 265 – 49 829 on 2026-11-08 and 51 358 was seen in a
bot link (`docs/migration/06-database-schema.md:40`); the stub catalogue uses six-digit numbers and the reserved
`999404` and `999503`. A fixed floor never collides, and Wave 2 listings can take numbers from the same sequence.
Routing by range needs no lookup: the stub driver here, WP-85's request service and WP-86's merge read it, and the
legacy translator refuses a legacy id at or above the floor as a contract error (WP-42).

### Stubs

#### The listing catalogue

`backend/resources/fixtures/v1/listings/catalog.json` gains ten entries; every existing entry gains `origin:
"legacy"`, `owner` (`tier` from its flags: `verified` where `owner_verified`, `claimed` where `is_owner` and not
verified, else `null`) and `contact.mode: null`, `contact.request: null`.

| Number | Origin | Variant |
| ------ | ------ | ------- |
| `10000001` | native | `request` mode, no request, `response_minutes` 15, an owner description holding a synthetic number (masked); a market verdict with a `district` comparison; the newest `posted.at` of the default feed |
| `10000002` | native | `request` mode, request `pending` |
| `10000003` | native | `request` mode, request `given`: `contact.has_phone` true, the stub contact answers |
| `10000004` | native | request `declined` |
| `10000005` | native | request `expired` (a new request allowed, DEV-060) |
| `10000006` | native | request `cancelled` (the flat was let) |
| `10000007` | native | `phone` mode: `contact.has_phone` true |
| `10000008` | native | the stub user's own listing (`owner.mine: true`, `owner.listing_id` = the active listing of the owner fixtures) |
| `100024` | legacy | a legacy self-placed listing in `gate` mode: `owner.tier: self`, `contact.mode: hidden` (DEC-75); scenario `relay_on` → `request` |
| `100025` | legacy | a «claimed» owner: `is_owner` true, `owner_verified` false, `owner.tier: claimed` (BR-APP-100) |

- The eight native entries are Tashkent long-rent apartments (`stub.city: tashkent`) in the default set, so the
  repeated entries (`101001 …`) shrink from 40 to 32 and the default feed keeps 45 entries and three pages. The
  repeats never copy a native entry, so every repeated number stays below the floor. `100024` and `100025` are in
  the Tashkent region outside the default feed, like `100018` … `100023`.
- Native entries carry the shapes of "Listing items and the card": `is_owner` and `owner_verified` true, `tier:
  self`, `source_ref: null`, `sources: []`, `author: {"kind": "phone", "label": "Хозяин", "count": 1}`, one history
  entry without a channel, `geo_radius_m: 500`, a shown point as `location`. Their photos use the stub form
  `{media}/stub/<number>/<n>.jpg?e=0&s=stub`, so `sources:publish-stub-media` writes them.
- The per-user parts (`owner.mine`, `contact.request`) are fixed in the entries, as `favorite` and `viewed` are while
  `sources.native_stubs` is on (WP-42, "Overlay").
- `owner.entry` is computed by the stub source from DEC-94's rule, not stored: true on every entry with `is_owner`
  that is not `10000008` while `owner.enabled` is on, so it is false everywhere by default (*added by the intake of
  `index-YX9bFVws.js`*).
- `StubListingSource`: the contact method answers the synthetic number of `10000003` and `10000007` and `404
  contact_unavailable` for the other native entries and for `100024`; the translation method answers `404
  not_found` for every native number. Its doc comment lists the new numbers.
- `StubListingRefs` resolves native numbers through the card source like any other. The repeats `101033` …
  `101040` disappear with the shrink; the two personal fixtures that name four of them take native numbers instead
  (`favorites/default.json`: `101035` → `10000001`, `101039` → `10000002`; `history/default.json`: `101034` →
  `10000003`, `101038` → `10000004`), so both lists keep 25 items and show native listings.

#### Owner fixtures

`backend/resources/fixtures/v1/owner/*.json`, read through `StubResponder` by `App\Services\Sources\Stub\StubOwner`:

- `list.json` — nine listings: an untouched draft (no form key set beyond the defaults, no photo), a draft without
  a point, a complete draft without a phone, an active listing with two pending requests (number `10000008`), a
  paused, a held (`paused`, `held: true`, `hold_reason: "moderator"`), a withdrawn, a let (`rented`) and a rejected
  listing (`reject_reason: "denied"`); `max: 2`, `can_add: false`, `past: 3` (the list holds three listings that
  count, more than `max`, so that every status is seen on one screen). `list.empty.json` (`items: []`, `can_add:
  true`, `past: 0`) and `list.returning.json` (`items: []`, `can_add: true`, `past: 3`).
- `requests.json` — requests in every owner-side status, two of them `pending`, one `declined` with `can_undo`, one
  `given` with `can_late`, one `agent` with `agent_marked`.
- `demand.json` (`count: 7`, `few: false`, both bounds), `place.json`.
- Photo addresses reuse the photos of the native catalogue entries, so `sources:publish-stub-media` covers them.

Show answers the entry of `list.json` with that id (`404` for any other id); writes answer that entry with the sent
fields applied and store nothing: `PATCH` merges the form, `store` answers the untouched draft of `list.json`
(`200`, DEV-054) and a new draft (`201`) in `owner_empty` and `owner_returning`, publish answers the listing `active`
with a number when it has every part and a number, status sets
the status, photo writes add, remove or order photos of the entry. The answer method answers the request of
`requests.json` with the action applied; the place method answers `tashkent` / `yunusobod` for a point within 0.3°
of the Tashkent centre of the reference data and both `null` elsewhere. Every owner method of a listing id that is
not in `list.json` answers `404 not_found`. The `me` fixtures gain `owner` (`{2, true, false}`).

#### Scenarios

| Scenario | Methods | Answer |
| -------- | ------- | ------ |
| `owner_empty` | list, store, `GET /me` | the empty list; store answers a new draft; `owner {0, false, false}` |
| `owner_returning` | list, store | `items: []`, `past: 3` («С возвращением!», BR-APP-095); store answers a new draft (`201`) |
| `owner_limit` | store, publish | `409 owner_limit` (`limit: "account"`, `max: 2`) |
| `owner_disabled` | store, update, photo writes, contact mode, phone request, publish, status with `active` | `403 owner_disabled` (the switch itself is configuration) |
| `owner_waitlisted` | `GET /me` | `owner.waitlisted: true` |
| `demand_few` | demand | `count: null`, `few: true`, the bounds of `demand.json` (DEC-84) |
| `phone_set` | show | the complete draft with `phone_set: true` and `phone_display` |
| `phone_not_uz`, `phone_not_own` | show | the complete draft with `phone_error` `not_uz` or `not_own` |
| `rejected_denied`, `rejected_limit` | publish; show | `409 owner_rejected` with `reason` `denied` or `limit`; show answers the complete draft `rejected` with that `reject_reason` |
| `held_check` | publish; show | `200` with the complete draft held by the realtor check: a number, `status: paused`, `held: true`, `hold_reason: check_agent`, `published_at: null` |
| `publish_missing` | publish | `422` naming `place` and `photos` |
| `listing_locked` | update, photo writes, contact mode, status, publish, delete | `409 owner_listing_locked` |
| `request_answer_closed` | answer | `409 request_answer_closed` |
| `no_chat` | request | `409 no_chat` |
| `request_limit_fast`, `request_limit_day`, `request_limit_week` | request | `429 rate_limited` with `reason` `requests_fast`, `requests_day`, `requests_week` and `Retry-After` 600, 3 600, 86 400 |
| `requests_blocked` | request | `403 requests_blocked` |
| `request_closed`, `own_listing`, `contact_open` | request | `409` with that code |
| `relay_on` | card of `100024`; request | `contact.mode: request`; the request on `100024` answers `201 pending` |

Without a scenario the request method answers by number: `10000001` and `10000005` → `201 pending`; `10000002`,
`10000003`, `10000004` → `200` with their status; `10000006` → `409 request_closed`; `10000007` → `409
contact_open`; `10000008` → `409 own_listing`; `100024` and every other existing number → `409 request_closed`. The
stub never verifies `init_data` beyond its rules of form.

### Server classes

- Controllers in `App\Http\Controllers\Api\V1\Owner`: `OwnerListingController` (`index`, `store`, `show`,
  `update`, `destroy`), `OwnerPhotoController` (`store`, `destroy`, `order`), `OwnerContactModeController`,
  `OwnerPhoneRequestController`, `OwnerPublishController`, `OwnerStatusController`, `OwnerRequestController`
  (`index`, `answer`), `OwnerWaitlistController`, `OwnerPlaceController`, `OwnerDemandController`; and
  `App\Http\Controllers\Api\V1\Listings\ListingContactRequestController`.
- Form requests in `App\Http\Requests\Api\V1\Owner`: `UpdateOwnerListingRequest`, `StoreOwnerPhotoRequest`,
  `OrderOwnerPhotosRequest`, `UpdateContactModeRequest`, `UpdateOwnerStatusRequest`, `AnswerOwnerRequestRequest`,
  `OwnerPlaceRequest`, `OwnerDemandRequest`; the request list reuses `ListPersonalRequest`;
  `App\Http\Requests\Api\V1\Listings\StoreContactRequestRequest`.
- Resources: `OwnerListingResource`, `OwnerListingItemResource`, `OwnerListingsResource`, `OwnerPhotoResource`,
  `OwnerListingFormResource`, `OwnerListingStatsResource`, `ShownPointResource`, `OwnerRequestResource`,
  `OwnerPlaceResource`, `OwnerDemandResource`, `ContactRequestResultResource`, `ListingOwnerResource`,
  `ContactRequestStateResource`; `MeResource`, `ReferenceResource`, `ListingPreviewResource`,
  `ListingDetailsResource`, `ContactResource` and `MapPointResource` gain the new keys. Each list element has a
  resource with a typed constructor (Scramble, WP-13 "Item resources for the export").
- Data objects: `App\Services\Owner\Data\{OwnerListing, OwnerListingForm, OwnerListingStats, OwnerPhoto, ShownPoint,
  OwnerRequest, OwnerPlace, OwnerDemand}`, `final readonly` with `fromArray()`; `App\Services\Sources\Data\{ListingOwner,
  ContactRequestState}`. `ListingSummary` and `MapPoint` gain `origin`; `ListingDetails` gains `origin`, `owner`,
  `contactMode`, `contactRequest`, and its `fromArray()` masks `owner.description`.
- Enums in `App\Enums`: `ListingOrigin`, `OwnerTier`, `ContactMode`, `ContactRequestStatus` (the six owner-side
  values; the seeker form maps `agent` to `declined`), `OwnerListingStatus`, `OwnerRequestAction`,
  `OwnerRejectReason` (`denied`, `limit`), `OwnerHoldReason` (`check_agent`, `votes_agent`, `votes_fraud`,
  `votes_rented`, `moderator`), `OwnerPhoneError`, `RequestWho`.
- `App\Http\Middleware\EnsureOwnerCabinetEnabled`; the exceptions of "Error codes"; `App\Services\Listings\ListingNumber`;
  `App\Services\Sources\Stub\StubOwner`; the four named limiters in `App\Providers\AppServiceProvider`.

## Files

- `backend/config/owner.php` (new); `backend/phpunit.xml` (`OWNER_CABINET_ENABLED=true`)
- `backend/routes/api.php`; `backend/app/Http/Middleware/EnsureOwnerCabinetEnabled.php`;
  `backend/app/Providers/AppServiceProvider.php` (the limiters)
- `backend/app/Http/Controllers/Api/V1/Owner/*.php`, `backend/app/Http/Controllers/Api/V1/Listings/ListingContactRequestController.php`;
  `ListingContactController.php`, `ListingTranslationController.php`, `ListingController.php` (native numbers on stubs)
- `backend/app/Http/Requests/Api/V1/Owner/*.php`, `backend/app/Http/Requests/Api/V1/Listings/StoreContactRequestRequest.php`
- `backend/app/Http/Resources/Api/V1/{Owner*,ShownPoint,ContactRequestResult,ContactRequestState,ListingOwner}Resource.php`
  (new); `{Me,Reference,ListingPreview,ListingDetails,Contact,MapPoint}Resource.php` (changed)
- `backend/app/Services/Owner/Data/*.php`; `backend/app/Services/Sources/Data/{ListingOwner,ContactRequestState,ListingSummary,ListingDetails,MapPoint}.php`;
  `backend/app/Services/Listings/ListingNumber.php`
- `backend/app/Services/Sources/Stub/{StubOwner,StubListingSource,StubListingRefs}.php`
- `backend/app/Enums/{ListingOrigin,OwnerTier,ContactMode,ContactRequestStatus,OwnerListingStatus,OwnerRequestAction,OwnerRejectReason,OwnerHoldReason,OwnerPhoneError,RequestWho}.php`
- `backend/app/Exceptions/Owner/*.php`, `backend/app/Exceptions/Requests/*.php`
- `backend/resources/fixtures/v1/listings/catalog.json`, `favorites/default.json`, `history/default.json`, `me/*.json`,
  `owner/{list,list.empty,list.returning,requests,demand,place}.json`
- `backend/tests/Feature/Api/V1/Owner/{OwnerListingsContractTest,OwnerPhotosContractTest,OwnerPublishContractTest,OwnerRequestsContractTest,OwnerPlaceDemandContractTest,OwnerSwitchContractTest}.php`,
  `backend/tests/Feature/Api/V1/Listings/ContactRequestContractTest.php`; the existing `CardContractTest.php`,
  `FeedContractTest.php`, `CountFlowMapContractTest.php`, `ContactTranslationShareContractTest.php`,
  `MeContractTest.php`, `ReferenceContractTest.php`; `backend/tests/Feature/Http/OpenApiDocumentTest.php`
- `docs/api/openapi.json`, `frontend/packages/types/src/generated/api.ts`, `docs/api/README.md`
- `frontend/app/lib/session/types.ts` (`Me.owner: {pending: number; has_listings: boolean; waitlisted: boolean}` and
  `owner` in `ME_KEYS`, which `frontend/app/tests/session/types.test.ts` compares with `MeResource.required`)
- Frontend test objects that the regenerated types break (under `frontend/app/tests/` and `frontend/app/dev/`)
- `backend/.env.example`, `docs/infrastructure/environments.md` and `docs/infrastructure/local-development.md`
  (`OWNER_CABINET_ENABLED`, `OWNER_CABINET_ALLOWED_IDS`, `OWNER_LISTINGS_PUBLIC`) — separate shared-file PR

## Steps

1. Read `08` §1.8 and the rows API-037 … API-054, `02` §12a and `03` BR-APP-098 … BR-APP-103; take no route or
   serializer from them.
2. `config/owner.php`, `ListingNumber` with its unit test (`php artisan make:class Services/Listings/ListingNumber`,
   `php artisan make:test --pest --unit Listings/ListingNumberTest`); `EnsureOwnerCabinetEnabled`
   (`php artisan make:middleware EnsureOwnerCabinetEnabled`) and the exceptions.
3. Tests first per group (`php artisan make:test --pest Api/V1/Owner/OwnerListingsContractTest` and the others):
   drafts and status; photos; phone, mode and publish; requests and answers; place and demand; the switch; the
   request method.
4. Enums and data objects; the listing shapes (`origin`, `owner`, `contact.mode`, `contact.request`) in
   `ListingSummary`, `ListingDetails`, `MapPoint` and their resources; the catalogue entries; the existing contract
   tests updated for the new keys.
5. Owner fixtures, `StubOwner`, the owner controllers, requests and resources; the routes with their abilities,
   limiters and the switch of "The switch (DEC-81)".
6. The request method: its request, controller and the answers by number; the contact and translation rules of
   native numbers on the stub.
7. `GET /me` and `GET /reference` additions; `owner` in `Me` and `ME_KEYS` of `frontend/app/lib/session/types.ts`.
8. `OpenApiDocumentTest`: the table gains the 18 pairs and `toHaveCount(59)`; `composer openapi:export`; `pnpm
   types:generate`; check in the generated file that the owner listing, the item, the request and the error codes
   are typed; fix the frontend test objects; `pnpm --filter app typecheck`.
9. `docs/api/README.md`: the error rows, the method table (18 rows with route names, Wave 1 driver `native`), the
   stub numbers and scenarios, the sentence on `meta.source` of mixed lists (below), "59 pairs".
10. Pint, PHPStan, `make ci-backend`, `make ci-frontend`; the shared-file PR for the env keys.

The `meta.source` paragraph of `docs/api/README.md` gains: «In listing lists it names the driver of the shared part;
items placed by HOMI's own owners carry `origin: native`.»

## Behaviour to reproduce

- The owner's contract is strict (BR-API-159): `form` is always an object and `photos` always an array; `status`,
  `who` and the request status take only the listed values. HOMI's enums make an unknown value impossible on the
  server side.
- Refusals are codes, not parsed `detail` strings (BR-API-160): `invalid:<fields>` becomes `422 validation_failed`
  with `errors`, `missing:<fields>` the `422` of publish or `409 owner_phone_required` / `owner_limit` /
  `owner_listing_locked`, `rejected:<reason>` `409 owner_rejected`, `photo:too_many` `409 owner_photo_limit`,
  `photo:not_image` the media code, `photo:too_big` `too_large` or `too_big`.
- One open draft (DEV-054): a second `POST /owner/listings` before anything was entered answers the same draft.
- A new listing starts in `request` mode (DEV-055); a rejected listing can be deleted, and the two refusal
  vocabularies are apart (DEV-056).
- An eleventh photo is refused; the first photo is the cover; the order takes the full list (BR-API-166).
- The phone is confirmed through the bot and the client polls the listing (BR-API-170); the poll is
  `GET /owner/listings/{id}`.
- Publish names what is missing (BR-API-174); a published listing's every save is live (DEC-80).
- `rented` closes the pending requests (BR-API-176, `UNVERIFIED` in legacy); nothing leaves `rented` or `removed`;
  `held` cannot be resumed by the owner (BR-API-177).
- The pending count reaches the client in `GET /me`, so no extra call runs for every user on every launch (fix of
  LB-APP-066; BR-API-179).
- A seeker's request: `who` required, `people` 1 … 20, `move_in` 32 and `message` 500 characters (BR-API-183);
  `no_chat` before anything is created (BR-API-184); the limit and closure codes (BR-API-185) as v1 codes; the status
  only on the seeker's own card, never `agent` (BR-API-186); after `given` the number comes from the contact method,
  not from the card (BR-API-187, DEC-52).
- Self-placed listings carry the owner fields and no channel source (BR-API-188); the tier is a field, not a label
  (BR-API-189 `UNVERIFIED` in legacy; fix of LB-APP-075).
- The waitlist is recorded and `GET /me` says so (BR-API-182; the Mini App offers no entry, so LB-APP-071 has nothing
  to fix there; DEC-82).
- The demand count is exact only from 5; 1 … 4 is `few` (BR-API-169 changed by DEC-84, DEV-063).

## Tests

- Route table (`OpenApiDocumentTest`): 59 pairs, each a route and an OpenAPI path; the `listings/{number}/contact-request`
  route requires `app:write` (a token with `app:read` only → `403 forbidden`).
- Owner listings: list key set in `default`, `owner_empty`, `owner_returning`; store → `201` in `owner_empty` and
  `owner_returning`, `200` with the untouched draft otherwise, `409 owner_limit` with `limit` and `max` in
  `owner_limit`; show by id, a
  non-ULID and an unknown ULID → `404`; the item has no `phone_display`, `form.lat` or `form.lon`, the show answer
  has all three; `PATCH` with one key changes only that key, `null` clears, `rooms: 6`, `floor: 10` with
  `floors_total: 9`, `currency: "EUR"`, `tenants: ["pets"]`, a 601-character description and `lat` without `lon` →
  `422` naming the key; `DELETE` of the draft → `204`, of the active listing → `409 owner_listing_locked`.
- Status: each allowed move → `200`; `active` for the held listing → `409`; `paused` for a draft → `422`; anything
  for the let and the withdrawn listing → `409`.
- Photos: upload of a fixture image → `201` with the photo last; a text file → `unsupported_mime`; in `listing_locked`
  → `409`; the eleventh → `409 owner_photo_limit`; order with a missing id, an extra id and a repeated id → `422`.
- Phone, mode, publish: mode `request`, `phone` → `200`, `open` → `422`; phone request → `200`; publish of the
  complete draft → `409 owner_phone_required`, in `phone_set` → `200` with a number; `rejected_denied` and
  `rejected_limit` → `409 owner_rejected` with `reason` `denied` and `limit`; `held_check` → `200` with `status:
  paused`, `held: true`, `hold_reason: check_agent`; `publish_missing` → `422` naming `place` and `photos`; show in
  `phone_not_uz` and `phone_not_own` → `phone_error`; no answer carries `reject_reason` `agent` or `fraud`.
- Switch (`config(['owner.enabled' => false])`): store, update, the three photo methods, mode, phone request and
  publish → `403 owner_disabled`, also with an invalid body and with a scenario in the header; status `active` →
  `403 owner_disabled`, status `paused`, `rented` and `removed` → as with the switch on; show, list, delete of the
  draft, requests, answer, waitlist, place, demand and the seeker's request → as with the switch on; `GET /reference`
  → `owner_enabled: false`; without a token `401`. Limiters: the eleventh publish of an hour → `429 rate_limited`
  without `reason`.
- Requests (owner side): the cursor walk; the answer with each action → the status of the table; `request_answer_closed`
  → `409`; an unknown request id → `404`.
- Waitlist: `204` twice. Place: a Tashkent point → `tashkent` / `yunusobod`, also sent with 6 decimals; a point in
  Andijan → both `null`; a missing `lon` → `422`. Demand: the fixture with radars on (`count: 7`, `few: false`);
  `demand_few` → `count: null`, `few: true`; `count: 0` and `few: false` with `radar.creation_enabled` off; `rooms: 6`
  → `422`.
- Request method: the answers by number above; each scenario its code, `Retry-After` on the three limits; a missing
  `init_data`, one over 4 096 bytes, `who: "group"`, `people: 0`, a 33-character `move_in` → `422`; the answer and
  the logs never contain the sent `init_data`.
- Listing shapes: every preview and map point has `origin`; the card of `10000001` has `owner.tier: self`, a masked
  description, `contact.mode: request`, `contact.request: null`; `10000003` → `contact.request.status: given` and
  the contact method answers; `10000002` → contact `404 contact_unavailable`; `10000008` → `owner.mine: true` and
  `listing_id`; `100024` → `hidden`, and `request` in `relay_on`; `100025` → `claimed`; translation of `10000001` →
  `404`; every native card has `author.kind: phone` with the label «Хозяин» and no digit; no card holds a key
  `phone` or the raw synthetic number.
- Feed: the default filters find 45 entries in three pages, page one holds `10000001`, no repeated number is at or
  above the floor; `ListingNumber::isNative()` at `9999999`, `10000000` and `10000001`. The end-to-end specs that
  open the first card of the default feed (`frontend/app/e2e/listing-open.spec.ts`) now open a native listing; one
  that needs a legacy card names its number instead, in this PR, and `frontend/app/e2e/saved.spec.ts` keeps its counts of 20 and
  25.
- `GET /me` and sign-in carry `owner` in every scenario; `owner_empty` and `owner_waitlisted` change it.
- Contract: `composer openapi:check` clean; `pnpm types:check` clean; `pnpm --filter app typecheck` green.

## Acceptance checklist

- [ ] The 18 new pairs answer as specified with `meta.source = stub`, or `204`; the route list equals the 59 pairs of
      `25` §4.2 (both tables).
- [ ] With `OWNER_CABINET_ENABLED` off, the methods of the first two rows of "The switch (DEC-81)" answer `403
      owner_disabled`, every way down (pause, «Сдано», «Снять», delete of a draft, answers) works, and `GET
      /reference` says `owner_enabled: false`.
- [ ] Only the owner listing object (`GET /owner/listings/{id}` and the owner's writes, to the owner himself) carries
      `phone_display` and the true point.
- [ ] Every listing item carries `origin`; the card carries `owner`, `contact.mode` and `contact.request`; no card or
      preview carries a number.
- [ ] The request method refuses with distinct codes and checks `no_chat` before anything is created; the limits
      answer `rate_limited` with a `reason` and `Retry-After`.
- [ ] The stub catalogue holds `10000001` … `10000008`, `100024` and `100025` with the listed variants; the default
      feed has 45 entries, three pages, a native entry on page one.
- [ ] `docs/api/README.md` lists the 59 pairs, the new error codes, the stub numbers and the scenarios.
- [ ] OpenAPI and types are regenerated; `make ci-backend` and `make ci-frontend` are green.
- [ ] The three env keys are in the shared-file PR, `OWNER_CABINET_ENABLED` blank in `backend/.env.example`;
      `CLAUDE.md`'s count is updated by a shared-file PR after the merge.
- [ ] Deployed to staging and production; `sources:publish-stub-media` run there; with the key unset `POST
      /api/v1/owner/listings` answers `403 owner_disabled` and `GET /api/v1/reference` says `owner_enabled: false`.

## As built

The package is built as designed, with these points decided in the code (rule 6).

- **Branch.** WP-80 is built from `main`, not stacked on the frontend packages: it is a backend and contract package.
- **The cabinet's tenants** are a vocabulary of their own (`OwnerListingForm::TENANTS`: `family`, `students`, `girls`,
  `boys`, `foreigners`), not the filter's `Tenant` enum (`family`, `men`, `women`).
- **The stub writes** answer the entry with the change applied and store nothing. A point sent with `PATCH` gives the
  answer a shown point beside it. Publish starts from the listing with the phone scenarios applied (`phone_set`
  publishes the complete draft); a hold or a refusal (`held_check`, `rejected_*`) is what publish answers, not a state
  it starts from; a rejected listing answers `409 owner_rejected` with its reason. A first publish takes `10000013`.
- **The native entries stand two at each of the four addresses of the default search** (`10000001`, `10000002` with
  `100001`; `10000003`, `10000004` with `100012`; `10000005`, `10000006` with `100013`; `10000007`, `10000008` with
  `100014`), taking that address's district: with 32 repeats the map still answers four stacks of eleven, as the map
  specs expect (each spot of their own split the stacks, and 40 end-to-end cases failed on CI run 44899906288).
  `frontend/app/e2e/listing-open.spec.ts` opens the first legacy card from the fourth on, since a native card's CTA is
  WP-83's.
- **An unknown id or number answers `404`** before any scenario's error.
- **`PATCH`** takes the values a form body sends (`"600"`, `1`, `"0"`) and answers them in their types. One coordinate
  sent alone, `null` included, is refused naming the other.
- **The photo method** makes the checks of `HashedUploader` (size, then the type by the file's bytes) and answers its
  codes (`unsupported_mime`, `too_large`); the stub stores nothing. A repeated id of the order names `ids`.
- **`init_data`** is limited to 4 096 bytes, not characters, and Telescope hides it with `_token` outside local
  (`app/Providers/TelescopeServiceProvider.php`, beside the files of the specification; sign-in sends the same field).
- **Demand** is `count: 0`, never `few`, while radars are off (DEC-51). An owner request's `move_in` is masked like its
  message.
- **`owner.entry`** is decided by the stub source when it builds the card (`ListingDetails::withOwnerEntry`, DEC-94),
  so a fixture never stores it.
- **The renovations of `renovations.owner`** take the locale of the request's context (`SourceContext`), as every
  other directory of `GET /reference` does.
- **The catalogue** was rewritten by a script: the existing entries gained their keys, and the file's indentation
  is now JSON's, so its diff is larger than its change.
- **PHP 8.6.** The developer machine runs PHP 8.6.0 since 2026-11-20 (Homebrew), without the `redis` extension, so
  `php artisan test` (which boots the local `.env`) cannot start there. The suites ran through `vendor/bin/pest`,
  PHPStan and the OpenAPI export with Telescope, the cache, the queue and the session in memory (KI-70).

## Handoff

Finished: steps 1–9 with their tests. Step 10's shared-file PR for the three env keys follows this PR; `CLAUDE.md`'s
count of pairs is updated after the merge. Needs from the production track: the regular deploy and
`php artisan sources:publish-stub-media` again (the new stub numbers); `OWNER_CABINET_ENABLED` stays unset on the
servers (DEC-81).
