# WP-12 — Contract: listings, map, card, contact, translation, share

| Field | Value |
| ----- | ----- |
| Stage | A |
| Status | TODO |
| Depends on | WP-11 |
| Size | about 2 800 changed lines without generated files and fixtures, L |
| Behaviour reference | `25` §4.1, §4.2, §4.5; `08` §1.7, §1.8 and the rows of API-004 … API-010 and API-017, RES-001, RES-002; `03` §1.12 and §4 (BR-APP-001 … BR-APP-009, BR-APP-020, BR-APP-023, BR-APP-024, BR-APP-026 … BR-APP-035, BR-APP-059, BR-APP-062); tasks `tasks/backend/KV-BE-016-search-filters-normaliser.md`, `KV-BE-037-call-links.md`, `KV-BE-048-translation.md`, `KV-BE-046-share.md` (rules only) |
| Needs from the production track | After the deploy, run `php artisan sources:publish-stub-media` once on staging and once on production (it writes placeholder images under `stub/` on the public media disk), and confirm that one fixture photo address loads from the CDN host |

## Goal

The eight listing methods of `25` §4.2 exist as stub routes with their final request and response shapes:
`GET /listings`, `GET /listings/count`, `GET /listings/flow`, `GET /listings/map`, `GET /listings/{number}`,
`POST /listings/{number}/contact`, `POST /listings/{number}/translation`, `POST /listings/{number}/share`. The filter
model exists once on the server. The stub driver filters a small catalogue, so the frontend sees results change with
the filters.

## Scope

In: the filter value object and its normaliser; data objects; `ListingSource` methods and `StubListingSource`; the
seven `source.listings.*` features; routes, requests, resources; the fixture catalogue and placeholder photos.

Out: the legacy driver, overlay and photo rewriting (WP-42); real contact, translation and share (WP-43); favourite
and viewed flags from real data (WP-44 through the overlay of WP-42).

## Decisions that bind this package

- Listings are addressed by their public number (`25` §4.1). The answer may carry another number than the one asked
  for when legacy merged duplicates; the client follows the answer.
- Raw values travel next to display strings (`25` §4.5, Q-API-062): legacy formats many strings on the server. Every
  raw field that legacy may not supply is nullable; the display string is always present.
- Behaviour changes stay off (DEC-36): the card keeps carrying the author's phone as legacy does (the proposal to
  hide it, DEV-007, is not applied); impossible filter combinations are normalised, not rejected (DEV-004 off);
  inverted ranges are swapped (DEV-025 off).
- Every per-listing object carries `source_ref` when the source knows it (`25` §5, Q-API-063).
- When the source cannot answer: `503 source_unavailable` (`25` §4.1).

## Design

All paths are under `/api/v1`, bearer with ability `app:read`. `success` and `meta.source` are left out of the
examples. Common errors: `401 unauthenticated`, `403 access_denied`, `422 validation_failed`, `429 rate_limited`,
`503 source_unavailable`.

### Filter parameters (shared by feed, count, flow and map)

Arrays are sent as repeated bracket keys (`types[]=apartment&types[]=house`). Booleans are `true` or `false`.

| Parameter | Type | Rule |
| --------- | ---- | ---- |
| `city` | string | required; a city code of `GET /reference` |
| `deal` | string | required; `rent_long`, `rent_daily`, `sale` |
| `owner` | string | `any` (default), `no_agents`, `owners` |
| `types[]` | string | `apartment`, `house`, `room`, `commercial`, `land`; types not valid for the deal are dropped; empty → `apartment` |
| `districts[]` | string | district codes of the city |
| `zones[]` | string | `center`, `near_center`, only for a city with zones |
| `rooms_min`, `rooms_max` | integer | 0 … 10; `4` as maximum means "4 or more" |
| `price_min`, `price_max` | integer | whole USD, ≥ 1 |
| `area_min`, `area_max` | integer | 1 … 10 000; sale only |
| `posted_days` | integer | `1`, `3`, `7` |
| `furnished` | boolean | three states: absent, `true`, `false` |
| `renovation[]` | string | renovation codes of the deal |
| `appliances[]` | string | appliance codes; rent only |
| `floor_not_first`, `floor_not_last`, `near_metro`, `below_median`, `pets`, `pets_only` | boolean | applied only when `true` |
| `market` | string | `new`, `secondary`; sale only |
| `tenant` | string | `family`, `men`, `women`; rent only |
| `polygon` | string | `lat,lon;lat,lon;…`, 3 … 40 vertices, 5 decimals, not closed |

Types per deal: long rent `apartment, house, room, commercial`; daily rent `apartment, house, room`; sale
`apartment, house, commercial, land` (BR-APP-005). Keys that do not apply to the deal are stripped (BR-APP-020);
`min > max` is swapped; a closed polygon is opened. An unknown enum value, an unknown code, a malformed number or
polygon is `422` with the parameter name in `errors`. Feed only: `sort` (`new` default, `cheap`, `expensive`,
`deal`, `center`, `ppm`), `cursor` (opaque string, at most 512 characters), `limit` (1 … 50, default 20).

The same 25 keys form the **filters object** in flow options and radars: every key present, arrays never `null`,
`polygon` as `[[lat, lon], …]` or `null`, in this order: `city`, `deal`, `types`, `districts`, `rooms_min`,
`rooms_max`, `price_min`, `price_max`, `zones`, `near_metro`, `below_median`, `owner`, `tenant`, `pets`, `pets_only`,
`furnished`, `renovation`, `floor_not_first`, `floor_not_last`, `area_min`, `area_max`, `market`, `appliances`,
`posted_days`, `polygon`.

### Listing preview (items of every listing list)

```json
{"number": 100012, "deal": "rent_long", "type": "apartment", "title": "2-комн. квартира, 54 м²",
 "price": {"display": "$600", "period": "/мес", "alt": "≈ 7,7 млн сум", "notes": ["депозит $600"], "usd": 600, "kind": null},
 "rooms": 2, "area_total": 54, "floor": 3, "floors_total": 9,
 "district": {"code": "yunusabad", "name": "Юнусабадский"}, "place": null, "landmark": "Мегапланет",
 "metro": {"name": "Минор", "km": 0.7}, "center_km": 4.2, "location": {"lat": 41.35012, "lon": 69.28431},
 "photos": {"preview": ["https://cdn.homi.loc/stub/100012/1.jpg?e=0&s=stub"], "count": 8, "cover": null},
 "has_video": false, "pets_ok": false, "is_owner": true, "owner_verified": false,
 "posted": {"label": "Опубликовано", "when": "вчера", "at": "2026-11-13T08:10:00+00:00"},
 "status_text": null, "market": {"label": null, "median_delta": -0.12, "tone": "good"},
 "favorite": false, "viewed": false, "source_ref": {"channel": "stub_channel_a", "post_id": 4812}}
```

| Field | Null | From legacy | Note |
| ----- | ---- | ----------- | ---- |
| `number` | no | `id` | integer |
| `deal`, `type` | yes | `deal_type` on cards only | `null` on previews when legacy does not send them |
| `title` | no | `short_title`, else the part of `title` before « · » | |
| `price` | yes | `price`, `price_kind`, `usd` | `display` = first part without the bracket text and the period; `period` = text from the first `/`; `alt` = bracket text; `notes` = the remaining « · » parts; `usd` raw or `null`; `kind` is `null`, `down_payment` or `business` |
| `rooms`, `area_total`, `floor`, `floors_total`, `landmark`, `place`, `center_km` | yes | same names | |
| `district` | yes | `district_name` | `code` is `null` when the name cannot be matched to the city's directory |
| `metro` | yes | `metro`, `metro_km` | `km` may be `null` |
| `location` | yes | `lat`, `lon` | |
| `photos` | no | `photos_preview`, `photos_count`, `cover` | absolute addresses of HOMI's media host, form `…/<digits>/<digits>.jpg?…`; the small variant is the same address with `.s.jpg` (RES-001, RES-002) |
| `has_video` | no | `video` | boolean |
| `is_owner` | yes | `is_owner` | |
| `posted` | no | `age` | `label` and `when` are the two parts of the legacy string; `at` is raw or `null` |
| `status_text` | yes | `status_text` | |
| `market` | no | `market`, `median_delta`, `median_tone` | `tone`: `good`, `check`, `suspicious`, `same`, `mixed`, `no_repair`, another string, or `null` |
| `favorite`, `viewed` | no | per-user flags | from HOMI's own data |
| `source_ref` | yes | source link of the card | channel without `@`, numeric post id |

### `GET /listings` — legacy: the feed (API-004)

`data` is an array of previews; `meta.next_cursor` is a string or `null` (`null` ends the list); pages hold at most
`limit` items and may hold fewer (BR-APP-024: the client de-duplicates by `number`). `sort` values that the client
does not offer for the filters are accepted and fall back to `new`. Scenarios: `empty`, `few` (5 items, one page),
`page2_error` (the second page answers `503`).

### `GET /listings/count`, `GET /listings/flow` — legacy: API-005, API-006

```json
{"data": {"count": 137}}
{"data": {"week": 21, "days": 7,
          "options": [{"code": "price", "label": "до $700", "rate": "≈5 в день", "count": 34, "filters": {"…": "25 keys"}}]}}
```

`days` is ≥ 1; `options` is always an array (empty when there is nothing to suggest); `count` in an option may be
`null`. Renamed nothing. Scenario for both: `source_unavailable`.

### `GET /listings/map` — legacy: API-007

```json
{"data": {"points": [{"number": 100012, "lat": 41.35012, "lon": 69.28431, "label": "$600", "tone": "good",
                      "priced": true, "usd": 600}], "total": 61}}
```

All points of the filters in one answer, no paging. `label` is plain text: the server removes `<` and `&`, and the
client renders it as text (fix of LB-APP-020). `tone` is `good`, `high`, `check`, `suspicious` or `null`; `usd` may
be `null`; `total` ≥ the number of points. Changed: `id` became `number`.

### `GET /listings/{number}` — legacy: API-008

`{number}` is a positive integer (`whereNumber`); anything else is `404 not_found`. Query `preview=1` returns the
preview object only and records no view. Without it `data` is the preview plus:

```json
{"photos": {"preview": ["…"], "count": 8, "cover": null, "items": ["https://cdn.homi.loc/stub/100012/1.jpg?e=0&s=stub"]},
 "market": {"label": "Вторичка", "code": "secondary", "median_delta": -0.12, "tone": "good"},
 "facts": [{"key": "rooms", "label": "Комнат", "value": "2"}],
 "nearby": [{"kind": "park", "name": "Парк", "km": 0.4, "note": null}],
 "stats": {"days_listed": 3, "publications": 2, "channels": 2, "views": 41},
 "price_history": [{"at": "2026-11-10T07:00:00+00:00", "channel": "stub_channel_a", "url": "https://t.me/stub_channel_a/4790",
                    "text": null, "kind": "published", "price_usd": 650, "change_pct": null}],
 "geo_radius_m": 500, "author": {"kind": "phone", "label": "+998 ** *** ** 67", "count": 3}, "owner_label": "Хозяин",
 "contact": {"phone": "+998000000067", "phone_display": "+998 00 000-00-67",
             "call_url": "https://api.homi.loc/call/stub-token", "call_url_expires_at": "2026-11-14T10:10:00+00:00",
             "contact_url": null, "contact_paid": false},
 "summary": "Светлая квартира рядом с метро.", "offers": [{"text": "Торг", "url": null}],
 "original": {"text": "Сдаётся 2-комн… тел. +998 00 000 00 67", "url": "https://t.me/stub_channel_a/4812", "deleted": false},
 "sources": [{"handle": "stub_channel_a", "url": "https://t.me/stub_channel_a/4812"}],
 "comparison": {"value": 680, "own": 600, "n": 14, "metric": "month", "scope": "district", "rooms": 2, "near_class": null,
                "radius_km": null, "district": "Юнусабадский", "place_value": null, "note": null,
                "updated": "2026-11-12", "has_reason": false, "price_usd": 600, "price_per_m2": null}}
```

- `facts[].key` is unique; `nearby[].kind` is `park` or `school`, unique; `price_history[].price_usd` and
  `change_pct` are always present (nullable); `sources` is always an array; `geo_radius_m` may be `null`.
- `comparison` is `null` when there is no market comparison (legacy `median` falsy); otherwise it holds the legacy
  `median_*` fields without the prefix, with `value` required.
- `contact`: when `phone` is not `null`, `call_url` is not `null` (legacy rule "phone ⇒ call link"). All four phone
  and link fields are `null` together when the listing has no phone or the user's daily disclosure limit is reached.
  If the source gives no raw number (Q-API-062), `phone` is `null` and `call_url` is still set.
- Errors: `404 not_found` for an unknown or removed number. Scenarios and reserved numbers of the stub: number
  `999404` → `404`; `999503` → `503`; `100016` answers with the object of `100001` (merged duplicate); `100015` is
  withdrawn (`status_text` set, contact fields `null`, `original.deleted: true`).
- Changed against legacy: the contact fields are grouped; `history` became `price_history`; `owner` became
  `owner_label`; `original_text`, `original_url`, `post_deleted` are grouped under `original`; `median*` under
  `comparison`; `market_code` under `market.code`.

### `POST /listings/{number}/contact` — legacy: the call link (API-009)

No body. Answers a fresh call link; the client calls it when its link is stale (8 minutes after receipt or 2 minutes
before `expires_at`) and on a tap without a link.

```json
{"data": {"call_url": "https://api.homi.loc/call/stub-token-2", "expires_at": "2026-11-14T10:20:00+00:00",
          "phone": "+998000000067", "phone_display": "+998 00 000-00-67"}}
```

`call_url` is absolute and valid for at least 10 minutes; `phone` and `phone_display` follow the same rule as on the
card. Errors: `404 not_found`; `404 contact_unavailable` (no phone, or the disclosure limit is reached). Changed:
`GET` became `POST` (the call is a disclosure that is counted); `url` became `call_url`; expiry is explicit (fix of
LB-API-045).

### `POST /listings/{number}/translation` — legacy: API-010

No body. Translates the original text into the request locale.

```json
{"data": {"text": "Metro yaqinida yorugʻ kvartira…", "locale": "uz"}}
```

Errors: `404 not_found` (unknown number or no original text); `422 translation_not_needed` (locale `ru`);
`429 rate_limited`; `503 translation_unavailable`. Changed: the target language is the request locale, not a stored
profile value. Stub: returns a fixed text per locale; scenario `translation_unavailable`.

### `POST /listings/{number}/share` — legacy: API-017

No body. Prepares an inline message of HOMI's bot for `WebApp.shareMessage`.

```json
{"data": {"prepared_message_id": "stub-prepared-1", "expires_at": "2026-11-14T11:00:00+00:00"}}
```

Errors: `404 not_found`; `502 share_failed` (the client falls back to the `t.me/<bot>?startapp=l_<number>` link,
BR-APP-038); `429 rate_limited`. Changed: `id` became `prepared_message_id`. This method is native and has no
feature; the stub controller answers with `meta.source = stub`. Scenario `share_failed`.

### Server classes

- `App\Services\Search\SearchFilters` (final readonly, the 25 keys; `fromNormalised()`, `toArray()` in the order
  above, `canonicalHash()` = SHA-256 of the canonical JSON without `posted_days`, keys and arrays sorted) and
  `SearchFiltersNormaliser::normalise(array $raw, bool $forRadar = false): SearchFilters` throwing `FilterRejected`
  (field name). Limits and the two switches `strict_combinations` and `inverted_range` (both off) live in
  `config/filters.php`. Codes are validated against `ReferenceSource::reference()`.
- `App\Services\Search\ListingQuery` (filters, sort, cursor, limit).
- Data objects in `App\Services\Sources\Data`: `ListingSummary`, `ListingDetails`, `PriceInfo`, `SourceRef`,
  `ListingPage`, `MapPoints`, `MapPoint`, `FlowEstimate`, `FlowOption`, `ListingContact`, `ListingTranslation`.
- `ListingSource` gains the nine methods of WP-10. `StubListingSource` loads `listings/catalog.json` (16 base
  listings covering every deal × type, a video listing, one without photos, one without coordinates, one suspicious
  price, one verified owner), repeats the Tashkent long-rent apartments with shifted numbers up to 45 entries, and
  filters in memory by city, deal, types, rooms, price, districts, `near_metro`, `below_median` and owner. Sorts are
  applied; the cursor is `s1.<offset>`. Count and map follow the same filter; flow returns `week = count`, `days = 7`
  and the options of `listings/flow.options.json` when the count is below 10.
- Features with default `stub`: `source.listings.feed`, `.count`, `.flow`, `.map`, `.card`, `.contact`,
  `.translation`.
- Placeholder photos: six neutral generated images (no real photographs) with their small variants in
  `backend/resources/fixtures/media/`; `sources:publish-stub-media` writes `stub/<number>/<n>.jpg` and
  `stub/<number>/<n>.s.jpg` for every catalogue photo. The token `{media}` in fixtures is replaced by
  `config('media.public_url')`, `{api}` by `config('app.url')`.

## Files

- `backend/app/Services/Search/{SearchFilters,SearchFiltersNormaliser,FilterRejected,ListingQuery}.php`; `backend/config/filters.php`
- `backend/app/Services/Sources/Data/*.php` (the objects above); `backend/app/Services/Sources/Stub/StubListingSource.php`;
  `backend/app/Services/Sources/Contracts/ListingSource.php`; `backend/config/sources.php`
- `backend/app/Http/Controllers/Api/V1/Listings/{ListingController,ListingCountController,ListingFlowController,ListingMapController,ListingContactController,ListingTranslationController,ListingShareController}.php`
- `backend/app/Http/Requests/Api/V1/Listings/{ListingFiltersRequest,ListingFeedRequest,ShowListingRequest}.php`
- `backend/app/Http/Resources/Api/V1/{ListingPreviewResource,ListingDetailsResource,MapPointsResource,FlowResource,ContactResource,TranslationResource,PreparedShareResource,FiltersResource}.php`
- `backend/routes/api.php` (static paths `listings/count`, `listings/flow`, `listings/map` before `listings/{number}`)
- `backend/resources/fixtures/v1/listings/{catalog,flow.options,translation}.json`, `backend/resources/fixtures/media/*`
- `backend/tests/Unit/Search/{SearchFiltersTest,CanonicalHashTest}.php`, `backend/tests/Feature/Search/SearchFiltersNormaliserTest.php`,
  `backend/tests/Feature/Api/V1/Listings/*ContractTest.php`
- `docs/api/openapi.json`, `frontend/packages/types/src/generated/api.ts`, `docs/api/README.md` (filter table)

## Steps

1. Read task `KV-BE-016` (rules and probe set only; its legacy output format is not built) and `08` §1.7, §1.8.
2. `SearchFilters`, the normaliser and `config/filters.php` with unit and feature tests (`php artisan make:class …`).
3. Data objects with `fromArray()`; `ListingSource` methods; the catalogue fixture; `StubListingSource`.
4. `ListingFiltersRequest` (rules of the table; `passedValidation()` builds `SearchFilters`) and `ListingFeedRequest`.
5. Feed, count, flow, map controllers and resources; then the card with `preview=1`.
6. Contact, translation and share stub controllers.
7. Placeholder images and `sources:publish-stub-media`; run it locally and open one address under `cdn.homi.loc`.
8. Export OpenAPI, generate types, read every generated listing type field by field.
9. Pint, PHPStan, both CI gates.

## Behaviour to reproduce

- Defaults: `types` `apartment`, `owner` `any`, everything else empty (BR-APP-001). The server applies the same
  defaults, so a request with only `city` and `deal` is valid.
- Geography modes are exclusive in the client (BR-APP-008); if several arrive, the server keeps `polygon`, else
  `zones`, else `districts`.
- The same filters give the same set in feed, count and map (`08` API-004 tests); the stub honours this.
- A removed listing answers `404`; a merged one answers with the surviving number.
- Fixture texts are invented; the only phone pattern used is `+998 00 000 00 NN`.

## Tests

- Normaliser: one case per deal × type (kept or dropped); stripped keys per deal; geography exclusivity; `pets` with
  `pets_only`; inverted ranges swapped; the probe set (`deal=x`, `rooms_min=-1`, `area_min=0`, 2 and 41 vertices,
  `NaN`, unknown district, 10 000-character string) → `422` with the field or a normalised value, never a `500`.
- Canonical hash: equal for inputs that differ only in `posted_days`, key order or array order; `toArray()` has
  exactly 25 keys in the documented order.
- Feed: default filters → 20 items with the exact key set; following `meta.next_cursor` reaches `null` with 45
  distinct numbers; `limit=0` and `limit=51` → `422`; unknown `sort` → `422`; each scenario.
- Count equals the number of items reachable by paging; map numbers are a subset of feed numbers and `total` ≥ points.
- Card: full and `preview=1` key sets; `phone` non-null implies `call_url` non-null; reserved numbers; `abc`, `0`,
  `-1` → `404`.
- Contact, translation, share: happy path, each error code, `Accept-Language: ru` on translation → `422`.
- Contract: OpenAPI has the eight paths and one shared preview schema; `pnpm types:check` is clean.

## Acceptance checklist

- [ ] The eight methods answer as specified with `meta.source = stub`.
- [ ] The filter table is enforced by one request class; the 25-key filters object appears in flow options.
- [ ] Feed pages end with `meta.next_cursor: null`; count, map and feed agree for the same filters.
- [ ] Reserved numbers and scenarios produce `404`, `503`, a merged answer and a withdrawn listing.
- [ ] Photo addresses have the `…/<digits>/<digits>.jpg?…` form and load locally after `sources:publish-stub-media`.
- [ ] Fixtures contain no real phone, name, address, channel or photograph.
- [ ] OpenAPI and types are regenerated and typed field by field; both CI gates are green.
- [ ] Deployed; the production track ran the publish command on staging and production and one photo loads there.

## Handoff

Empty.
