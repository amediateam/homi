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
| 404 | `not_found` | Unknown route, or a resource or listing that does not exist |
| 404 | `contact_unavailable` | `POST /listings/{number}/contact`: the listing has no phone, or the disclosure limit is reached |
| 422 | `translation_not_needed` | `POST /listings/{number}/translation` with locale `ru`, the language of the originals |
| 409 | `no_chat` | Radar writes: the bot cannot write to the user yet; nothing was changed |
| 409 | `radar_limit` | Creating or switching on a radar would exceed `limits.radars`; `message` names the limit |
| 409 | `radar_duplicate` | `PUT` or relax would make the radar equal to another radar of the user |
| 413 | `payload_too_large` | The request body is over the size cap |
| 429 | `rate_limited` | Too many requests; wait for the `Retry-After` seconds. With `reason: "daily"` the caller reached the daily limit of opened listings (the full card of `GET /listings/{number}`); without `reason` it is the request limiter |
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
back to. The value is the operator's choice per method and environment. `php artisan sources:list` shows it,
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
service is on pause (legacy release `index-CIa0Ldj2.js`); only the scenario answers it until the server switch
exists. Sign-in knows `auth_expired` and `invalid_init_data` as well.

Outside production the Mini App forwards the cookie `homi_stub_scenario` as this header (WP-22). The fixtures live in
`backend/resources/fixtures/v1/<area>/<name>.json`, in the shape of the data objects and sanitised: no real phones,
names, addresses or channel names. Frontend tests read the same files through `fixture("<area>/<name>")` of
`@homi/testing`.

## Locale and currency

The locale comes from `Accept-Language`: the first supported tag (`ru`, `uz`, `en`; `uz-Latn` and `uz_Latn` are read
as `uz`), else `ru`. Every answer says it in `Content-Language`. `uz` is the only Uzbek code of this API. The currency
comes from the user's settings, and until they exist (WP-40) it is `USD`.

## Session

`POST /auth/telegram` exchanges the raw `initData` of the Mini App launch for a bearer token (abilities `app:read`
and `app:write`, 24 hours) and the object of `GET /me`. Send the token as `Authorization: Bearer <token>`.
`GET /reference` and `GET /cities` need no token, so the no-access screen works without a session.

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
when the caller reached the daily limit of opened listings. The per-user limiter is not built yet, so today only the
stub scenario `daily_limit` answers it; the `preview=1` form answers as usual in that scenario.

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

The `/api/v1` surface built so far (the first table of `25` §4.2): 41 pairs of a method and a path; the owner cabinet adds 18 more with WP-80. "Public" methods need no token;
the others need a bearer token with `app:read` for reads and `app:write` for writes. The driver is the Wave 1 target;
until the legacy and native packages land every method answers from stubs (`meta.source = stub`), and
`php artisan sources:list` shows the current driver of each source method.

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

`{number}` is a listing number (a positive integer); `{id}` is a ULID. A foreign id answers like an unknown one,
`404 not_found`. Stub scenarios of the personal and radar methods: `empty` (favourites, history, hidden, radars);
`no_chat`, `radar_limit`, `radar_duplicate` (radar writes); `existing`, `starter`, `few` (radar create); `ask_found`
(radar pause and delete); `agent_marked` (report). Settings: `card_rich` (`GET` and `PATCH /settings` with
`card_style: "rich"`) and `card_sample_unsent` (`POST /settings/card-sample` answers `sent: false`).

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
