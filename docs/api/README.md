# HOMI API v1 — conventions

Every client — the Mini App, the landing, the ARM, the bot's web views — talks to `https://api.homi.<tld>/api/v1`.
This page explains what every answer looks like. The rules come from ADR-0007, as amended by ADR-0017. The contract
itself is the generated document [`openapi.json`](openapi.json); the TypeScript types in `@homi/types` are generated
from it. The collector intake is described separately (ADR-0009).

## Envelope

A successful answer:

```json
{ "success": true, "data": { "number": 71234, "title": "2-room flat" }, "meta": { "source": "stub" } }
```

`message` is optional and only for people. Whether `meta` is present depends on the method. `204 No Content` has no
body and therefore no `meta`.

An error:

```json
{ "success": false, "message": "The given data was invalid.", "code": "validation_failed", "errors": { "deal": ["The selected deal is invalid."] } }
```

`code` is always present, is stable and is snake_case. Program logic reads `code`, never `message`. `errors` appears
only on `422` and maps each field to its messages.

## Error codes

| Status | `code` | When |
| ------ | ------ | ---- |
| 422 | `validation_failed` | A request field is invalid (`errors` lists them) |
| 401 | `unauthenticated` | No valid bearer token (ADR-0003) |
| 401 | `invalid_init_data` | Sign-in: the Telegram launch data is malformed or its signature is wrong |
| 401 | `auth_expired` | Sign-in: the launch data is too old; the client asks to reopen the app |
| 403 | `access_denied` | The access gate refuses the user; `reason` is `private`, `invite`, `full`, `blocked`, `join` or `paused` (show an unknown or missing reason as `private`) |
| 403 | `forbidden` | Not allowed, or the token lacks the ability |
| 403 | `radars_disabled` | Radars are switched off (`radars_enabled: false` of `GET /reference`): every radar create or change; `GET /radars` answers `[]` and `DELETE` works |
| 403 | `owner_disabled` | The owner cabinet is switched off (`owner_enabled: false`, DEC-81) and the method changes content or creates or resumes a listing; or the caller is not on the allow-list when it is set (create, phone request, publish) |
| 403 | `requests_blocked` | `POST /listings/{number}/contact-request`: requests of this user are closed |
| 404 | `not_found` | Unknown route, or a resource or listing that does not exist |
| 404 | `contact_unavailable` | `POST /listings/{number}/contact`: the listing has no phone, the disclosure limit is reached, or it is a `request`-mode listing without a `given` request of the caller |
| 422 | `translation_not_needed` | `POST /listings/{number}/translation` with locale `ru`, the language of the originals |
| 409 | `no_chat` | Radar writes and `POST /listings/{number}/contact-request`: the bot cannot write to the user yet; nothing was changed |
| 409 | `owner_limit` | The account or the phone already has `max` listings that count; `limit` is `account` or `phone`, `max` the number |
| 409 | `owner_listing_locked` | The owner listing cannot be changed in its state (held, withdrawn, let, removed) |
| 409 | `owner_phone_required` | Publish without a confirmed number |
| 409 | `owner_rejected` | The listing is rejected; `reason` is `denied` or `limit` |
| 409 | `owner_photo_limit` | One photo more than `limits.owner_photos` |
| 409 | `request_closed` | The listing takes no requests from the caller, or none more today |
| 409 | `own_listing` | A request on the caller's own listing |
| 409 | `contact_open` | The listing shows its number now; read the card again |
| 409 | `request_answer_closed` | The owner's answer is no longer possible (the undo window passed, or the request changed) |
| 409 | `radar_limit` | Creating or switching on a radar would exceed `limits.radars`; `message` names the limit |
| 409 | `radar_duplicate` | `PUT` or relax would make the radar equal to another radar of the user |
| 413 | `payload_too_large` | The request body is over the size cap |
| 429 | `rate_limited` | Too many requests; wait for the `Retry-After` seconds. With `reason: "daily"` the caller reached the daily limit of opened listings (the full card of `GET /listings/{number}`); without `reason` it is a request limiter (see "Request limits"). The seeker's request limits answer `reason` `requests_fast`, `requests_day` or `requests_week`. `POST /events` never answers `429` from its limiter: the excess is dropped with `204` |
| 502 | `share_failed` | `POST /listings/{number}/share`: Telegram did not prepare the message; fall back to the `t.me` link |
| 503 | `source_unavailable` | The data source of the method cannot answer; show the "could not load" state |
| 503 | `translation_unavailable` | `POST /listings/{number}/translation`: the translation service cannot answer |
| other 4xx/5xx | `http_error` | Any other HTTP error |
| 500 | `server_error` | An unexpected failure; the message is hidden outside debug |

A method may define its own codes, which its OpenAPI entry documents. The media methods use `code` = `reason`
(`unsupported_mime`, `too_large`, `too_big`, `undecodable`, `presign_unavailable`, `upload_not_found`,
`forbidden_upload`), and the older `reason` key stays for them.

## `meta.source`

Every answer of a source method says which driver produced `data`:

| Value | Meaning |
| ----- | ------- |
| `stub` | Fixtures. The client shows a small "demo data" marker (`25` §4.4) |
| `legacy` | The legacy service, called by HOMI's servers only |
| `native` | HOMI's own code |

It always names the driver that actually answered. When a method falls back, `meta.source` names the driver it fell
back to. In listing lists it names the driver of the shared part; items placed by HOMI's own owners carry
`origin: native`. The value is the operator's choice per method and environment. `php artisan sources:list` shows it,
`sources:set` changes it on the next request, and every change is logged (`config/sources.php`).

## Cursor lists

Feed-like lists return a page and a cursor:

```json
{ "success": true, "data": [{ "number": 71234 }, { "number": 71230 }], "meta": { "source": "legacy", "next_cursor": "eyJiIjo3MTIzMH0" } }
```

Pass `next_cursor` back as `?cursor=` to get the next page. `meta.next_cursor` is always present, and `null` means
the list has ended. The cursor is opaque: do not parse it or build it. A cursor the list did not give (for example
one from before a driver switch) ends the list quietly: an empty page and `null`. Favourites and history are paged
the same way, 20 per page, with `limit` 1 … 50.

Older page-number lists (`?page[number]=&page[size]=`) put `page`, `size`, `total` and `last_page` in `meta` and
`next`/`prev` in `links`.

## Stub scenarios

While a method answers from stubs, the request header `X-Stub-Scenario: <name>` picks another fixture of that
method, for example `first_launch`. The header has an effect only when the driver is `stub`, so it is harmless
anywhere else. A scenario that a method does not know is ignored, so one value can stay set across many requests.
Each method lists its scenarios in its specification. Every stub method knows these four:

| Scenario | Answer |
| -------- | ------ |
| `source_unavailable` | `503 source_unavailable` |
| `rate_limited` | `429 rate_limited` with `Retry-After` |
| `unauthenticated` | `401 unauthenticated` |
| `forbidden` | `403 forbidden` |

Every method that needs a session also knows `access_private`, `access_invite`, `access_full`, `access_blocked`,
`access_join` and `access_paused`, which answer `403 access_denied` with that `reason`. `paused` says that the whole
service is on pause (legacy release `index-CIa0Ldj2.js`); since WP-40 the server switch `ACCESS_PAUSED` answers it
for real (off by default, DEC-60; team accounts pass it, DEC-106), and the real access gate runs before every stub
method that needs a session (the stub sign-in is not gated), so a refused user hears the gate's reason first. Sign-in
knows `auth_expired` and `invalid_init_data` as well.

Since WP-40 four methods answer natively, with `meta.source = native`: `POST /auth/telegram`, `GET /me`,
`GET /settings` and `PATCH /settings`. Their stub answers — and so their scenarios: the profiles of `GET /me`
(`first_launch`, `uz`, `en`, `owner_*`, …), `card_rich` of the settings and the sign-in's own — answer only while
`SOURCES_NATIVE_STUBS` is on, which the API allows only in `local` and `testing` (it refuses to boot with it
anywhere else); the end-to-end suite runs so, with `ACCESS_MODE=open`. Every other method still answers from its
stub (`meta.source = stub`) until its package lands.

Outside production the Mini App forwards the cookie `homi_stub_scenario` as this header (WP-22). The fixtures live in
`backend/resources/fixtures/v1/<area>/<name>.json`, in the shape of the data objects and sanitised: no real phones,
names, addresses or channel names. Frontend tests read the same files through `fixture("<area>/<name>")` of
`@homi/testing`.

## Locale and currency

The locale comes from `Accept-Language`: the first supported tag (`ru`, `uz`, `en`; `uz-Latn` and `uz_Latn` are read
as `uz`), else `ru`. Every answer says it in `Content-Language`. `uz` is the only Uzbek code of this API. The currency
is the user's stored setting (`PATCH /settings`, default `USD`; `USD` for a request without a user, or with a
collector's token); since WP-40 the request context of every source carries it. The stub sources do not price by it
(the stub listings stay in `$`); the sources that replace them read it.

## Session

`POST /auth/telegram` exchanges the raw `initData` of the Mini App launch for a bearer token (abilities `app:read`
and `app:write`, 24 hours) and the object of `GET /me`. Send the token as `Authorization: Bearer <token>`.
`GET /reference` and `GET /cities` need no token, so the no-access screen works without a session.

Since WP-40 the sign-in is real. `init_data` is read from the JSON body only (at most 4 096 bytes; a value in the
query string is ignored) and verified with the bot token of the environment: a malformed or forged value is
`401 invalid_init_data`, one older than an hour `401 auth_expired`. The same value may be exchanged again inside its
hour, at most 20 times, then `429 rate_limited`. A user has at most 5 unexpired tokens of the Mini App; a sixth
sign-in revokes the oldest. The access gate decides before a token is issued: a refusal is `403 access_denied` with
its `reason` and no token. Every other bearer method passes the same gate first (`POST /events` only refuses
`blocked` and `paused`); a decision is cached for at most 2 s, and `access:block` drops it at once.

## Request limits

Since WP-40 every `/api/v1` route has a named limiter of its own (counts in `backend/config/rate_limits.php`,
starting values of SEC-REQ-027, tuned on staging). A bearer route counts per user (`user:<internal id>`, never a
Telegram id), a public route per client address. The Mini App's server forwards the client's `X-Forwarded-For`, and
the API believes it only from `TRUSTED_PROXIES`.

| Limiter | Count | Routes |
| ------- | ----- | ------ |
| `v1-auth` | 10 a minute per address; inside the sign-in also 5 a minute per verified user | `POST /auth/telegram` |
| `v1-public` | 60 a minute per address | `GET /reference`, `GET /cities`, `GET /landing/*` |
| `v1-me` | 30 a minute | `GET /me` |
| `v1-reads` | 300 a minute | the feed, count, new, flow and map; `GET /settings`, `GET /radars`, `GET /favorites`, `GET /history`, `GET /hidden`; the owner's reads of `/owner/listings` |
| `v1-listing` | 120 a minute | `GET /listings/{number}`, full card and preview |
| `listing-opens` | the daily cap (see "Listings"): 100 different full cards in 24 hours | `GET /listings/{number}` without `preview=1` |
| `v1-contact`, `v1-translation`, `v1-share` | 30, 30 and 20 an hour | `POST /listings/{number}/contact`, `/translation`, `/share` |
| `v1-lists` | 60 a minute | the writes of favourites, hidden listings and authors, blocked authors, `DELETE /history`, the surveys, `DELETE /listings/{number}/reports`, `POST /listings/{number}/contact-request` |
| `v1-reports` | 30 a day | `POST /listings/{number}/reports` |
| `v1-radars` | 30 a minute | the radar writes, `DELETE /radars/{id}`, `PATCH /settings`, `POST /settings/card-sample` |
| `v1-events` | 60 a minute; the excess is answered `204` and dropped: never `429` from its limiter | `POST /events` |
| `v1-media` | 120 a minute | `GET /media/{media}` |
| `uploads`, `owner-writes`, `owner-publish`, `owner-place`, `owner-demand` | as before WP-40 | the media writes; the owner cabinet's writes, `GET /owner/place`, `GET /owner/demand` |

Over a limit the answer is `429 rate_limited` with `Retry-After` and no `reason`; only the daily cap adds
`reason: "daily"`. The two limits inside the sign-in — the exchange count of one value and the per-user count —
answer the same way.

## Listings

The feed, count, new-since, flow and map take the same filter parameters (WP-12). Arrays are repeated bracket keys
(`types[]=apartment&types[]=house`); booleans are `true` or `false`; unknown parameters are ignored.

| Parameter | Rule |
| --------- | ---- |
| `city` | required; a city code of `GET /reference` |
| `deal` | required; `rent_long`, `rent_daily`, `sale` |
| `owner` | `any` (default), `no_agents`, `owners` |
| `types[]` | `apartment`, `house`, `room`, `commercial`, `land`; types the deal does not offer are dropped; none left → `apartment` |
| `districts[]` | district codes of the city |
| `zones[]` | `center`, `near_center`; dropped for a city without zones |
| `rooms_min`, `rooms_max` | 0 … 10; `4` or more as the maximum means "4 or more" |
| `price_min`, `price_max` | whole USD, ≥ 1 |
| `area_min`, `area_max` | 1 … 10 000; every deal (sale only before legacy release `index-CIa0Ldj2.js`) |
| `posted_days` | `1`, `3`, `7` |
| `furnished` | absent, `true` or `false` |
| `renovation[]` | renovation codes of `GET /reference`; codes of another deal are dropped |
| `appliances[]` | appliance codes; rent only |
| `floor_not_first`, `floor_not_last`, `near_metro`, `below_median`, `pets`, `pets_only` | applied only when `true`; `pets` and `pets_only` long rent only, `pets_only` wins over `pets` |
| `market` | `new`, `secondary`; sale only |
| `tenant` | `family`, `men`, `women`; long rent only |
| `polygon` | `lat,lon;lat,lon;…`, 3 … 40 vertices, rounded to 5 decimals, a closed polygon is opened |

Keys that do not apply to the deal are stripped; of several geography modes the server keeps `polygon`, else `zones`,
else `districts`; `min > max` is swapped. An unknown value or code, a malformed number or polygon is `422
validation_failed` naming the parameter. The feed adds `sort` (`new` default, `cheap`, `expensive`, `deal`, `center`,
`ppm`; an order the filters do not offer falls back to `new`), `cursor` and `limit` (1 … 50, default 20);
`GET /listings/new` adds `since` (Unix seconds, required). Flow options and radars carry the same 25 keys as the
filters object, every key present.

No card answer, full or `preview=1`, carries the author's number: numbers in listing texts are masked to
`+998 ** *** ** NN` (or `+** *** ** NN`), and `POST /listings/{number}/contact` is the one method that returns
`phone`, `phone_display` and `call_url` (DEC-52). A merged duplicate answers with another `number`; the client
follows the answer.

`floor` of a listing is a whole number or `null`: `0` is the ground-level (semi-basement) floor, a negative number
is a basement, and only `null` means that the floor is unknown. A client must not read `0` as "no floor".

`GET /listings/map` answers `points`, `total` and `with_point`. `total` counts the listings of the filters, with or
without coordinates, and `with_point` those with coordinates; both are always present, and
`count(points) ≤ with_point ≤ total`. When the answer holds fewer points than `with_point`, the source cut it by a
limit.

The full card of `GET /listings/{number}` may answer `429 rate_limited` with `reason: "daily"` and `Retry-After`
when the caller reached the daily limit of opened listings. Since WP-40 the limit is real (DEC-104 … DEC-107): 100
different full cards per user in 24 hours (`RATE_LIMIT_LISTING_OPENS_PER_DAY`); the 24 hours start at the first
counted card, and `Retry-After` is the seconds until the count starts again. A card the user already opened in that
window opens again for free, also after the limit; only a card answered `200` counts, so a `404` or an error costs
nothing; the `preview=1` form is never counted or refused. The stub scenario `daily_limit` still answers it too, and
the `preview=1` form answers as usual in that scenario.

Stub scenarios of the listing methods: `empty`, `few`, `page2_error` (feed); `new_none`, `new_one` (new-since);
`map_cut` (map: the first half of the points, with `with_point` and `total` unchanged); `daily_limit` (the full
card: `429 rate_limited`, `reason: "daily"`, `Retry-After: 3600`); `contact_unavailable`; `translation_unavailable`;
`share_failed`. The stub applies the area filter to every deal. Reserved numbers: `999404` answers `404`, `999503`
answers `503`, `100016` answers with `100001`, and `100015` is withdrawn. `100018` … `100021` carry the
listing-screen variants of WP-26, in the Tashkent region outside the default feed: `100018` a chat link without a
number (one price event, listed today in one channel, no views, an offer link), `100019` a paid number (three price events, the `near`
comparison), `100020` no contact with the post kept (the `city` comparison), `100021` a video of a deleted post whose
text holds the author's number and a second one (an author of 24 listings). `100022` and `100023`, in the same
set, carry the floor variants: `100022` is on the ground-level floor (`floor: 0`) and `100023` in a basement
(`floor: -1`). Photo addresses resolve after `php artisan sources:publish-stub-media`.

## Methods (Wave 1)

The `/api/v1` surface built so far (the first table of `25` §4.2 and the owner cabinet of WP-80): 59 pairs of a
method and a path. "Public" methods need no token; the others need a bearer token with `app:read` for
reads and `app:write` for writes. The driver is the Wave 1 target. Sign-in, `GET /me`, `GET /settings` and
`PATCH /settings` answer natively since WP-40 (`meta.source = native`; their stubs only behind `SOURCES_NATIVE_STUBS`
in `local` and `testing`); every other method answers from stubs (`meta.source = stub`) until its legacy or native
package lands, and `php artisan sources:list` shows the current driver of each source method.

| Method | Route name | Access | Wave 1 driver |
| ------ | ---------- | ------ | ------------- |
| `POST /auth/telegram` | `api.v1.auth.telegram` | public | native |
| `GET /me` | `api.v1.me.show` | `app:read` | native |
| `GET /settings`, `PATCH /settings` | `api.v1.settings.show`, `.update` | `app:read`, `app:write` | native |
| `POST /settings/card-sample` | `api.v1.settings.card-sample` | `app:write` | native |
| `GET /reference` | `api.v1.reference.show` | public | legacy, cached (`source.reference`) |
| `GET /cities` | `api.v1.cities.index` | public | legacy, cached (`source.cities`) |
| `GET /listings` | `api.v1.listings.index` | `app:read` | legacy + overlay (`source.listings.feed`) |
| `GET /listings/count`, `GET /listings/flow` | `api.v1.listings.count`, `.flow` | `app:read` | legacy (`source.listings.count`, `.flow`) |
| `GET /listings/new` | `api.v1.listings.new` | `app:read` | legacy (`source.listings.new`) |
| `GET /listings/map` | `api.v1.listings.map` | `app:read` | legacy + overlay (`source.listings.map`) |
| `GET /listings/{number}` | `api.v1.listings.show` | `app:read` | legacy + overlay (`source.listings.card`) |
| `POST /listings/{number}/contact` | `api.v1.listings.contact` | `app:read` | legacy (`source.listings.contact`) |
| `POST /listings/{number}/translation` | `api.v1.listings.translation` | `app:read` | legacy (`source.listings.translation`) |
| `POST /listings/{number}/share` | `api.v1.listings.share` | `app:read` | native |
| `GET /favorites`, `PUT /favorites/{number}`, `DELETE /favorites/{number}` | `api.v1.favorites.index`, `.update`, `.destroy` | `app:read`, `app:write` | native |
| `GET /history`, `DELETE /history` | `api.v1.history.index`, `.destroy` | `app:read`, `app:write` | native |
| `PUT /hidden/listings/{number}`, `DELETE /hidden/listings/{number}` | `api.v1.hidden.listings.update`, `.destroy` | `app:write` | native |
| `PUT /listings/{number}/blocked-author`, `DELETE /listings/{number}/blocked-author` | `api.v1.listings.blocked-author.update`, `.destroy` | `app:write` | native |
| `GET /hidden`, `DELETE /hidden/authors/{id}`, `DELETE /hidden` | `api.v1.hidden.index`, `.authors.destroy`, `.destroy` | `app:read`, `app:write` | native |
| `POST /listings/{number}/reports`, `DELETE /listings/{number}/reports` | `api.v1.listings.reports.store`, `.destroy` | `app:write` | native |
| `POST /surveys/found`, `POST /surveys/found/where` | `api.v1.surveys.found.store`, `.where` | `app:write` | native |
| `GET /radars` | `api.v1.radars.index` | `app:read` | native |
| `POST /radars`, `PUT /radars/{id}`, `PATCH /radars/{id}`, `POST /radars/{id}/relax` | `api.v1.radars.store`, `.update`, `.patch`, `.relax` | `app:write`, behind the radar switch | native |
| `DELETE /radars/{id}` | `api.v1.radars.destroy` | `app:write` | native |
| `POST /events` | `api.v1.events.store` | `app:write` | native |
| `GET /landing/live`, `GET /landing/pins` | `api.v1.landing.live`, `.pins` | public, cacheable | legacy, cached (`source.landing.live`, `.pins`) |
| `GET /owner/listings`, `GET /owner/listings/{id}` | `api.v1.owner.listings.index`, `.show` | `app:read` | native |
| `POST /owner/listings`, `PATCH /owner/listings/{id}` | `api.v1.owner.listings.store`, `.update` | `app:write`, switch, `throttle:owner-writes` | native |
| `DELETE /owner/listings/{id}` | `api.v1.owner.listings.destroy` | `app:write`, `throttle:owner-writes` | native |
| `POST /owner/listings/{id}/photos`, `DELETE /owner/listings/{id}/photos/{photo}`, `PUT /owner/listings/{id}/photos/order` | `api.v1.owner.listings.photos.store`, `.destroy`, `.order` | `app:write`, switch, `throttle:owner-writes` (store also `throttle:uploads`) | native |
| `PUT /owner/listings/{id}/contact-mode` | `api.v1.owner.listings.contact-mode` | `app:write`, switch, `throttle:owner-writes` | native |
| `POST /owner/listings/{id}/phone-request`, `POST /owner/listings/{id}/publish` | `api.v1.owner.listings.phone-request`, `.publish` | `app:write`, switch, `throttle:owner-writes`, `throttle:owner-publish` | native |
| `PUT /owner/listings/{id}/status` | `api.v1.owner.listings.status` | `app:write`, switch for `active`, `throttle:owner-writes` | native |
| `GET /owner/listings/{id}/requests` | `api.v1.owner.listings.requests.index` | `app:read` | native |
| `POST /owner/requests/{id}/answer` | `api.v1.owner.requests.answer` | `app:write`, `throttle:owner-writes` | native |
| `PUT /owner/waitlist` | `api.v1.owner.waitlist.update` | `app:write`, `throttle:owner-writes` | native |
| `GET /owner/place`, `GET /owner/demand` | `api.v1.owner.place`, `.demand` | `app:read`, `throttle:owner-place` / `throttle:owner-demand` | native |
| `POST /listings/{number}/contact-request` | `api.v1.listings.contact-request.store` | `app:write` | native |

`{number}` is a listing number (a positive integer); `{id}` is a ULID. A foreign id answers like an unknown one,
`404 not_found`. Stub scenarios of the personal and radar methods: `empty` (favourites, history, hidden, radars);
`no_chat`, `radar_limit`, `radar_duplicate` (radar writes); `existing`, `starter`, `few` (radar create); `ask_found`
(radar pause and delete); `agent_marked` (report). Settings: `card_rich` (`GET` and `PATCH /settings` with
`card_style: "rich"`) and `card_sample_unsent` (`POST /settings/card-sample` answers `sent: false`).

The owner cabinet on stubs (WP-80): the stub listing catalogue has HOMI's own listings `10000001` … `10000008`
(`origin: native`; request mode with no request, a request pending, given, declined, expired and cancelled; phone
mode; the stub user's own listing), a legacy self-placed listing in `gate` mode `100024` (`contact.mode: hidden`) and a
«claimed» owner `100025`. Every number at or above `10000000` is native (`ListingNumber`). Owner scenarios:
`owner_empty`, `owner_returning` (list, create, `GET /me`), `owner_limit`, `owner_disabled`, `owner_waitlisted`
(`GET /me`), `owner_pending` (`GET /me` with `owner.pending: 2`, the requests of the list's listing `01JF…03`; every
other profile has `pending: 0`, so the owner signals of WP-82 stay quiet), `demand_few`, `phone_set`, `phone_not_uz`, `phone_not_own`, `rejected_denied`, `rejected_limit`,
`held_check`, `publish_missing`, `listing_locked`, `request_answer_closed`. The request method answers by number
(`10000001`, `10000005` → `201 pending`; `10000002` … `10000004` → `200` with their status; `10000006` →
`request_closed`; `10000007` → `contact_open`; `10000008` → `own_listing`; any other → `request_closed`) and knows
`no_chat`, `request_limit_fast`, `request_limit_day`, `request_limit_week` (with `Retry-After` 600, 3 600, 86 400),
`requests_blocked`, `request_closed`, `own_listing`, `contact_open` and `relay_on` (the card of `100024` in
`request` mode and its request `201`).

`POST /listings/{number}/reports` answers `hidden` and `agent_marked`, both always present. `hidden` is `true` for
the reasons `rented` and `fraud`. `agent_marked` is `true` only when the reason is `agent` and the author is marked
as a realtor, by this report or already; the stub answers `false`, and `true` for an `agent` report in the scenario
`agent_marked`. `DELETE /listings/{number}/reports` withdraws the caller's `rented` report on the listing and
nothing else. It answers `204`, also when there is nothing to withdraw, and `404 not_found` for an unknown listing.

## Keeping the contract current

| Change | Then run | CI fails when skipped |
| ------ | -------- | --------------------- |
| A route, form request or resource of `/api/v1` | `cd backend && composer openapi:export` | `composer openapi:check` (in `composer ci:check`) |
| `docs/api/openapi.json` | `cd frontend && pnpm types:generate` | `pnpm types:check` (in `make ci-frontend`) |

The export reads the columns of the models from the database on the default connection, so it needs a migrated
PostgreSQL database (locally `backend/.env`; in CI the service of `backend.yml`). Never edit `openapi.json` or
`frontend/packages/types/src/generated/api.ts` by hand. Locally the documentation UI is at
`https://api.homi.loc/docs/api`. On staging and production it sits behind the same nginx basic auth as Horizon and
Telescope.
