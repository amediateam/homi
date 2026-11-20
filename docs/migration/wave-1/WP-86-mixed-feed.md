# WP-86 — The mixed feed: owner listings in feed, count, new, flow, map and card

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-84, WP-85, WP-42, WP-46 |
| Size | about 2 400 changed lines with tests, L |
| Behaviour reference | `02` BR-API-167, BR-API-175, BR-API-188, BR-API-196; `07` §2.2 (the filter rules), §2.5 (BR-API-057 … BR-API-062); `08` API-004 … API-008, API-035; `09` F-OWNER-009; `16` SEC-040, SEC-REQ-052 |
| Needs from the production track | the regular deploy |

## Goal

Every listing method answers the listings read from legacy and the listings HOMI's own owners placed (DEC-70)
together, through one merge step after the driver of the shared part. A native listing is a listing like any other
in the feed, the counts, the new-since count, the flow, the map, the card and the radar poll: ordered by the same
sort key, filtered by the same 25 keys, shown at its shown point only, with the market verdict wherever a
harvested median exists (DEC-78). `meta.source` stays honest: a list names the driver of the shared part, a native
card names `native`.

## Scope

In:

- `OwnerListingMerge`, a decorator of the `listings` capability that `SourceManager::listings()` puts around the
  `legacy` driver; the routing by number (`ListingNumber::isNative()` of WP-80).
- `NativeListingSource` (feed part, count, new-since, flow part, map part, details, preview, previews, translation)
  over WP-84's `owner_listings`.
- `NativeListingFilter`: the 25 filter keys on native rows, and the agreement test against WP-84's demand rule.
- `NativeListingPresenter`: the shapes of WP-12 (title, price, facts, posted, stats, the market block, the
  comparison) in the request locale and currency; `backend/lang/{ru,uz,en}/listings.php`.
- The `m1.` cursor and the cross-source order of every sort.
- The author of a native item (the owner's phone author key, so «Скрыть автора» works) and the `listing_refs` row
  of a native number.
- The public switch `OWNER_LISTINGS_PUBLIC`, which takes every native listing out of the public answers at once.
- `meta.source` of the per-number methods for a native number.
- The guard test that a legacy id at or above the floor is refused and counted (the translator rule itself is
  WP-42's, "Design").
- Tests: mixed pages for the stub and the legacy driver, the filter table, the shown point in every public answer,
  the radar poll with a native listing.

Out:

- Owner listings themselves: tables, drafts, publish, statuses, photos and their public copies, the shown point's
  computation, the harvested medians, the demand method — WP-84.
- The caller's request state on the card (`contact.request`, `contact.has_phone` after `given`) and the whole
  disclosure of a native number — WP-85's branch of `ContactService::disclose()` (WP-84's disclosure read and the
  `given` rule). This package reads no owner's number and implements nothing of the disclosure.
- New matching code: none is needed; the radar poller of WP-46 reads the merged feed (WP-46, "Filter sets and
  polling").
- The relay of requests on legacy `gate` listings — WP-87.
- The landing reads (`GET /landing/live`, `/landing/pins`): they stay legacy-only in Wave 1 (WP-60).
- The Mini App: a native item is a card like any other (WP-24, Out); the owner sections of the listing screen —
  WP-83. The bot's card of a native listing — WP-89.
- A HOMI-wide cap and order of the map answer (Q-API-086): unchanged here.

## Decisions that bind this package

- DEC-70: owner listings live in HOMI's tables and are shown beside the listings read from legacy, by one merge step
  after the driver of the shared part. Every item carries `origin` (WP-80).
- DEC-72, DEC-52: the owner's number never travels with a card or a preview. `owner.description` is masked by
  `ListingDetails::fromArray()` (WP-12, "Phone numbers in listing texts"); this package never reads the number: a
  native number's disclosure is WP-85's branch of `ContactService::disclose()` (WP-43, "Contact: two variants, one
  shape").
- DEC-77: a native item has `is_owner: true`, `owner_verified: true` and `owner.tier: self`. HOMI's realtor check and
  its votes hold a listing for the operators (WP-84, "Moderation"); a held listing is out of every list.
- DEC-78: wherever a harvested median exists (WP-84's `MedianBook`), a native listing has the verdict, the
  `comparison` block, a key for the `deal` sort and a match for `below_median`; sparse at first.
- DEC-62: `area_min` and `area_max` apply to every deal; the cabinet has rent only, so they apply to native rows.
- DEC-51: radars are off in production until WP-57; a native listing reaches radars only through the poll, so
  nothing here sends.
- `25` §4.1, `docs/api/README.md` "`meta.source`": one value per answer, the driver that answered. A mixed list
  therefore names the shared driver; a native card names `native`.
- `25` §4.4, RK-27: stub and real data never mix. When the shared driver is `stub`, the stub catalogue answers both
  parts (its native entries, WP-80) and real native rows are not merged.
- *Integrator defaults, listed for the reviewer:* item 4 (the native number floor 10 000 000, routing by range), item 5
  (the shown point: derived from the owner and the 100 m grid cell of the true point, 50 … 420 m from the cell centre,
  at most 491 m from the true point, always inside the circle of `geo_radius_m` 500; WP-84), item 11 (harvested medians:
  60 days, district before city, the usual range ± 10 %, `below_median` = a negative delta), item 9 (two listings per
  account and two per phone, so the native rows of a city stay few in Wave 1), item 18 (the cabinet is long-term rent
  only: a native listing's `deal` is always `rent_long`), item 24 (the author of a native item: `{"kind": "phone",
  "label": «Хозяин», "count": …}` with the owner's phone author key, no new `kind`), item 26 (the check and the votes
  hold, the operators decide; WP-84), item 27 (the public photo copies `owner/<token>/<n>.jpg?v=<version>`, WP-84), item
  29 (the shown point of item 5 replaces the first plan's offset of at most 250 m) and item 31 (the switch
  `OWNER_LISTINGS_PUBLIC`). Defaults of this specification, in the same list: a native number's disclosure has one
  implementation, WP-85's, and the merge implements none; a native listing out of the feed answers a card without its
  description, landmark, point, facts or photos; `landmark` is masked like the owner's description; native candidates
  are read per request in full for the city, capped at `owner.merge.native_cap` (1 000); a native listing has `metro:
  null` and never matches `near_metro` while HOMI has no station list; `zones[]` never matches a native row while the
  reference data maps no district to a zone; the cabinet's renovation codes map to the long-rent codes through
  `owner.renovation_map`; a legacy item whose age cannot be read sorts as newer than every native item, and a
  `posted_at` without an offset is read in Asia/Tashkent (Q-API-083); a native listing that left the feed answers its
  card with `status_text`, and a purged one `404`; the tenant mapping of "Filters on native rows"; a room counts as one
  room.

## Design

Where this text names a class, method or event of WP-42, WP-84 or WP-85, the specification of that package is
authoritative for the name. If it differs, use its name and do not create a second one.

### The merge step (`App\Services\Listings\OwnerListingMerge`)

`OwnerListingMerge implements ListingSource` (`backend/app/Services/Sources/Contracts/ListingSource.php`) and wraps
the instance of the `legacy` driver. `SourceManager::listings()` (`backend/app/Services/Sources/SourceManager.php:46-50`)
returns `new ResolvedSource(SourceDriver::Legacy, new OwnerListingMerge($legacy, $native, …))` when a feature
resolves to `legacy`; `stub` and any later driver are returned unchanged. So every caller that reads listings
through `SourceManager` — the controllers, the radar poller of WP-46, the bot cards of WP-53, the share service and
the personal-list previews — gets the merged answers with no change of its own.

| Method | Legacy part | Native part | Result |
| ------ | ----------- | ----------- | ------ |
| `feed()` | WP-42's feed through the slice read below | `NativeListingSource::candidates()` sorted by the same key | two sorted streams merged (below); at most `limit` items; `m1.` cursor |
| `count()` | WP-42 (not overlaid, WP-42 "Overlay" step 5) | matching active native rows | the sum |
| `newSince()` | WP-42 | matching native rows with `published_at > since` | the sum |
| `flow()` | WP-42 | matching native rows published in the last 7 days | `week` + the native count; `days` and `options` stay legacy's (a gap of "Behaviour to reproduce") |
| `map()` | WP-42 | one point per matching native row, at the shown point | points appended; `total` and `with_point` + the native count |
| `details()`, `preview()` | a legacy number | a native number | routed by number, no merge |
| `previews()` | the legacy numbers of the list | the native numbers | split by number, answers joined, keyed by the asked number |
| `contact()` | a legacy number | a native number: never served here — `ContactService::disclose()` serves it through WP-85's branch; the merge answers `ContactUnavailable`, so a native number never reaches legacy | routed by number |
| `translation()` | a legacy number | a native number: `SourceNotFound` (`404 not_found`; no original text) | routed by number |

A native number is never sent to legacy, and a legacy number is never looked up in HOMI's tables: the routing reads only
`ListingNumber::isNative()`. While `config('owner.public')` (`OWNER_LISTINGS_PUBLIC`, default `true`; WP-80) is `false`,
the native part is empty in every list, count, new-since count, flow and map, and every native number answers
`SourceNotFound` (`404 not_found`), so radars and the bot stop seeing native listings too; WP-85 closes the seeker's
side of a native number in the same state (the request method `409 request_closed`, the disclosure `404
contact_unavailable`; default 31); the owners' cabinet and their answers to requests already open are not touched.
It is the lever for an incident with photos, points or texts (WP-70, WP-71), apart from DEC-81's switch, which
leaves published listings in the feed. The overlay of WP-42 ("Overlay") runs after the merge, in the controllers, on
both kinds alike (hidden listings, blocked authors, favourites, viewed flags, realtor marks). A page from which the
overlay removes native items may be shorter than `limit`; the client continues with the cursor as it does today.

`meta.source`: list methods keep `$resolved->driver`. The per-number controllers (`ListingController::show()`,
`ListingContactController`, `ListingTranslationController`, and the request controller of WP-80) answer with
`OwnerListingMerge::driverFor($resolved, $number)`: `native` when the resolved source is the merge and the number is
native, else the resolved driver. On the stub driver a native stub number answers `stub`. `ListingShareController` has
no source feature (a method of HOMI's own) and keeps answering its own driver, `stub` until WP-43
(`backend/app/Http/Controllers/Api/V1/Listings/ListingShareController.php`).

### Cross-source order

`App\Services\Listings\FeedSortKey::of(ListingSort $sort, ListingSummary $item): ?float` gives the comparable key of
an item of either origin; `null` means "no key" and sorts last, except for `new` (below).

| Sort | Legacy key | Native key | Direction | Without a key |
| ---- | ---------- | ---------- | --------- | ------------- |
| `new` | `posted.at` (legacy `posted_at`, BR-API-196); when it is `null`, `PostedWhenParser::parse(posted.when, locale)` at hour precision | `published_at` | descending | a legacy item with neither sorts as newer than every native item, so it keeps its legacy place |
| `cheap` | `price.usd` | `price_usd` | ascending | last |
| `expensive` | `price.usd` | `price_usd` | descending | last |
| `deal` | `market.median_delta` | the delta of WP-84's `MarketVerdict` | ascending | last |
| `center` | `center_km` | `center_km` of the shown point | ascending | last |
| `ppm` | legacy's own | never: the cabinet has no sale (item 18), so a sale search has no native candidates | — | — |

- Equal keys: the higher number first. Native numbers are above every legacy number, so the order is total.
- The legacy stream keeps legacy's own order; the merge only interleaves native items into it by the key. When the
  key of a legacy item is out of order (legacy sorted by a value HOMI does not see), the item keeps its place in the
  legacy stream and only the native items around it move.
- `posted_at` without an offset is read in Asia/Tashkent; the time zone of legacy's value is Q-API-083.
- `PostedWhenParser` (`App\Services\Listings`) reads the `when` forms that the stub catalogue holds («сегодня», «вчера»,
  «N дней назад», `backend/resources/fixtures/v1/listings/catalog.json`; «на днях» for its repeats,
  `backend/app/Services/Sources/Stub/StubListingSource.php`) and the forms of the three locales in the golden fixtures
  of WP-42, relative to the time of the request; «сегодня» and «на днях» give a day, not an hour. Anything else is
  `null`. It is used only for this sort; the client still computes the age itself (WP-12, "Listing preview").
- `SearchFiltersNormaliser::sortFor()` (`backend/app/Services/Search/SearchFiltersNormaliser.php:113-130`) is
  unchanged: `deal` is offered only for an apartment search in a city with a median, `center` only in a city with
  zones, `ppm` only for a sale.

### Paging and the `m1.` cursor

`App\Services\Listings\MergeCursor`: `m1.` + base64url of a JSON object:

```json
{"s": "new", "l": {"c": "<legacy cursor>", "o": 3}, "n": [1763535600, 10000004]}
```

- `s` — the sort the cursor was made for; a cursor of another sort ends the list quietly.
- `l` — the `l1.` state of WP-42 ("Overlay", feed paging and top-up) that resumes the legacy stream, or `null` when
  the legacy stream has ended.
- `n` — the key and number of the last native item delivered, `[]` before the first one, `null` when the native
  stream has ended.

One page:

1. Decode the cursor; none = the start of both streams. An `l1.` cursor (made before this package) continues the
   legacy stream alone (`n: null`). Any other prefix, or a cursor that does not decode, ends the list quietly: empty
   `data`, `null` cursor (`docs/api/README.md`, "Cursor lists").
2. Legacy part: `LegacyListingSource::feedSlice(ListingQuery, ?state, SourceContext): LegacyFeedSlice` — WP-42's
   feed with its top-up, which in addition returns, for every item, the `l1.` state that resumes right after it, and
   the state after the last one. This package adds the method to WP-42's class; `feed()` stays and becomes
   `feedSlice()` without the per-item states.
3. Native part: the candidates of "Native candidates" in the sort's order, after `n`.
4. Merge by `FeedSortKey`, take at most `limit`. The new `l` is the state after the last legacy item taken (or the
   old one when none was taken, or `null` when the slice said the stream ended and every item was taken); the new
   `n` is the last native item taken (or `null` when the candidates ran out).
5. `meta.next_cursor` is `null` when both parts have ended.

A full walk delivers every item of both streams exactly once, in order; a native listing published between two
page reads appears in its sorted place only if that place is still ahead of the cursor, as a new legacy listing
does today.

### Native candidates (`App\Services\Listings\Native\NativeListingSource`)

- `candidates(SearchFilters, ListingSort, SourceContext): list<NativeRow>` — one indexed query on `owner_listings`
  (WP-84, "Tables"): `status = active`, `number` not null, `city = filters.city`, then `NativeListingFilter::matches()`
  in PHP on every row. At most `config('owner.merge.native_cap')` (1 000) rows are read per request; above that the
  newest are kept, one `warning` is logged per hour and the metric `native_merge_capped_total` counts it (RK-36).
  Wave 1 allows two listings per account and per phone (item 9), so the native rows of a city stay few; the cap is a
  guard, not a page size.
- `NativeRow` is a read model of one row: number, ULID, the owner's user id, the form fields, `price_usd`,
  `published_at`, the shown point as `GeoPoint`, the photo addresses of WP-84's public copies. How WP-84's model
  exposes the shown point on PostgreSQL and on SQLite is WP-84's; this package reads only its accessor and never
  the true point.
- `count()`, `newSince()`, the flow part and the map part are counts and projections of the same candidates.
- `details(int)`, `preview(int)`: the row with that number. `active` → the card of the presenter. `paused`,
  `rented`, `removed` or `withdrawn` (also `held`) → the unlisted card: `status_text` «Снято с публикации» (the text
  the stub catalogue uses for a withdrawn listing), `title`, `price`, `deal` and `district`, with `description`,
  `landmark`, `location`, `center_km` and `owner.description` `null` and `facts` and `photos` empty,
  `contact.has_phone: false`; a held and a withdrawn listing answer the same shape as a paused one, and none of them
  is in a list, a count or the map. Purged by WP-84's retention, or unknown → `SourceNotFound`. (WP-84 deletes the
  public photo copies of a `held`, `withdrawn`, `rented` or `removed` listing at once.)
- `previews(list<int>)`: the same rule per number; unknown numbers are absent.
- No `contact()`: the number of a native listing is read only by WP-85's branch of `ContactService::disclose()`
  over WP-84's disclosure read, which also decides who may receive it (`phone` mode for everyone under the quota;
  `request` mode only after `given`). So the number has one disclosure path and this package holds none.
- Every read is in the context's locale and currency; nothing is cached across users. The per-user parts
  (`owner.mine`, `contact.request`) are the overlay's (WP-85), never this class's.

### Filters on native rows (`App\Services\Listings\Native\NativeListingFilter`)

`matches(SearchFilters $filters, NativeRow $row): bool` — pure, no I/O. The keys of `docs/api/README.md` ("Filter
parameters"), after `SearchFiltersNormaliser` (`backend/app/Services/Search/SearchFiltersNormaliser.php:19-31`):

| Key | Native rows |
| --- | ----------- |
| `city` | the row's `city` (also the query's condition) |
| `deal` | only `rent_long` matches (item 18) |
| `owner` | `any`, `no_agents`, `owners`: every native row matches here; HOMI's realtor votes on a native listing hold it for the operators (`votes_agent`, WP-84, "Moderation"), and the overlay's realtor marks (WP-42, "Overlay") apply to its phone author key as to any listing's |
| `types[]` | `apartment` ↔ `room: false`; `room` ↔ `room: true`; `house`, `commercial`, `land` never match |
| `districts[]` | `district_code` |
| `zones[]` | a zone of the row's district when the reference data maps districts to zones; `CityData` has no such mapping today (`backend/app/Services/Sources/Data/CityData.php:15-25`), so a search with zones matches no native row |
| `rooms_min`, `rooms_max` | `rooms`, a room counting as 1; a `rooms_max` of 4 or more has no upper bound (the stub's rule, `backend/app/Services/Sources/Stub/StubListingSource.php:291-292`) |
| `price_min`, `price_max` | `price_usd`; `null` never matches a set bound |
| `area_min`, `area_max` | `area_m2` (DEC-62); `null` never matches a set bound |
| `market` | stripped for rent by the normaliser |
| `posted_days` | `published_at` within that many days |
| `furnished` | `furniture`; `null` never matches a set value |
| `renovation[]` | the row's code through `config('owner.renovation_map')` (cabinet code → long-rent codes; today the identity over `euro`, `cosmetic`, `none`, WP-80's `config/owner.php`); `null` never matches |
| `appliances[]` | never matches when set: the cabinet's form has no appliances |
| `floor_not_first`, `floor_not_last` | `floor` and `floors_total`; `floor ≤ 1` is first, `floor = floors_total` is last; an unknown floor never matches a set key |
| `near_metro` | never matches: HOMI's reference data has no station list (`CityData` carries `has_metro` only), so a native listing has `metro: null` |
| `below_median` | the verdict's delta is negative (item 11; the stub's rule, `StubListingSource.php:299`) |
| `pets`, `pets_only` | `pets: true` matches both; `false` or `null` matches neither |
| `tenant` | `family` ↔ `tenants` holds `family` or is empty; `men` ↔ `boys` or empty; `women` ↔ `girls` or empty (empty means "anyone") |
| `polygon` | the shown point lies inside the polygon (`NativeGeometry::contains()`); never the true point (SEC-REQ-052) |

`App\Services\Listings\Native\NativeGeometry`: point in polygon (ray casting on the 5-decimal vertices of
`SearchFilters::$polygon`) and the haversine distance in km, pure functions shared by the filter and the presenter.
A filter table (`tests/Support/NativeFilterCases.php`) runs against `NativeListingFilter::matches()` and against
WP-84's demand rule (the in-memory matcher behind `GET /owner/demand`; WP-84's specification is authoritative for
its name), so the feed and the demand count cannot drift (RK-36).

### The presenter (`App\Services\Listings\Native\NativeListingPresenter`)

Legacy formats titles, prices and ages on its server (`03` §1.12); for a native listing HOMI does it, with the
catalogue `backend/lang/{ru,uz,en}/listings.php` (new) in the forms of the stub catalogue
(`backend/resources/fixtures/v1/listings/catalog.json`). The uz and en forms are HOMI's texts for the product owner
to approve.

| Field | Native value |
| ----- | ------------ |
| `origin` | `native` |
| `number`, `deal`, `type` | the number; `rent_long`; `apartment` or `room` |
| `title` | «2-комн. квартира, 54 м²», «1-комн. комната, 18 м²» (the catalogue's room form), «5+-комн. квартира, …» (rooms 5); the uz and en forms of the catalogue |
| `price` | `display` and `alt` in the context's currency with the rate of `GET /reference` (`rates.usd_uzs`), `period` «/мес», `notes` `[]`, `usd` = `price_usd`, `kind` `null` |
| `rooms`, `area_total`, `floor`, `floors_total` | the form's values; `place` `null` |
| `landmark` | the form's value through `PhoneMasker::mask()`, which the presenter applies itself (`ListingSummary::fromArray()` masks `title` only, `backend/app/Services/Sources/Data/ListingSummary.php`) |
| `district` | `{code, name}` from the reference data of the city |
| `metro` | `null` (no station list) |
| `center_km` | `NativeGeometry::km(shown point, CityData::$center)`, one decimal |
| `location` | the shown point (item 5) |
| `photos` | WP-84's public copies `<MEDIA_PUBLIC_URL>/owner/<token>/<n>.jpg?v=<version>` (`<token>` 20 random digits, new for every version, no listing number in the path), `preview` the first three, `count`, `cover` `null`; the form `…/<digits>/<digits>.jpg?…` keeps the client's small variant `…/<n>.s.jpg?v=…` (`MEDIA_PHOTO` of `frontend/app/features/feed/images.ts`, which needs the query); a rewrite gives new addresses, because the CDN ignores query strings (`docs/infrastructure/cdn.md`) |
| `has_video`, `pets_ok` | `false`; `pets === true` |
| `is_owner`, `owner_verified` | `true`, `true` (DEC-77) |
| `posted` | `label` «Опубликовано», `when` the age in the catalogue's forms, `at` = `published_at` (ISO 8601 with offset) |
| `status_text` | `null` while `active`; «Снято с публикации» otherwise |
| `market` (preview) | `{label: null, median_delta: <delta>, tone: <good, same or null>}` from `MedianBook::for()` and `MarketVerdict::for()` of WP-84; all `null` without a median |
| `market` (card) | the same plus `code: null` |
| `comparison` | without a median `null`; else `{value: <median USD>, own: <price_usd>, n, metric: "month", scope: "district" or "city", rooms, near_class: null, radius_km: null, district: <name or null>, place_value: null, note: null, updated, has_reason: false, price_usd, price_per_m2: null}` (BR-API-062: the block shows only with a value and a delta) |
| `facts` | `rooms`, `area`, `floor`, `renovation` (the name of `renovations.owner`), `furniture`, `tenants`, `pets`, each only when set |
| `nearby` | `[]` |
| `stats` | `days_listed` (WP-84's stats), `publications` 1, `channels` 0, `views` = WP-84's `opened` |
| `price_history` | one entry: `at` = `published_at`, `channel` and `url` `null`, `text` `null`, `kind` `published`, `price_usd`, `change_pct` `null` (BR-API-188) |
| `geo_radius_m` | 500 (item 5) |
| `author` | `{"kind": "phone", "label": <the catalogue text «Хозяин» of `listings.php`>, "count": <the owner's listings in the feed>}` (WP-80, "Listing items and the card"); no digit of the owner's number |
| `owner_label` | `null`: the tier says it |
| `owner` | `{tier: "self", mine: false, listing_id: null, response_minutes: <WP-85's response time>, description: <the owner's text>}`; `mine` and `listing_id` are the overlay's (WP-85), and so is `entry` (DEC-94, WP-42's overlay; *added by the intake of `index-YX9bFVws.js`*) |
| `contact` | `{has_phone: <contact_mode = phone>, contact_url: null, contact_paid: false, mode: "phone" or "request", request: null}`; the per-user part is the overlay's (WP-85) |
| `summary`, `offers`, `original`, `sources`, `source_ref` | `null`, `[]`, `{text: null, url: null, deleted: false}`, `[]`, `null` |

Every object is built through `ListingSummary::fromArray()` and `ListingDetails::fromArray()`, so `PhoneMasker` masks
`title` and `owner.description` as for any driver (DEC-52); the presenter masks `landmark` before that. Map points:
`{number, lat, lon}` of the shown point, `label` = `price.display` with `<` and `&` removed, `tone` `good` when the
verdict's tone is `good`, else `null` (the map's tones, `backend/app/Services/Sources/Data/MapPoint.php:11`), `priced:
true`, `usd`, `origin: native`.

### Author key and listing references

- The author of a native item is the owner's phone author: its key is the owner listing's `phone_author_key` of
  WP-84, which WP-84 computes as WP-42's `AuthorKey` does for a card with a phone (`phone:` + the first 32 hex of
  HMAC-SHA-256 of the number in E.164 with `AUTHOR_KEY_SECRET`). `AuthorKey` itself is unchanged, and no new author
  `kind` exists.
- `App\Listeners\Listings\RememberNativeListingRef` (on WP-84's `OwnerListingPublished`, queue `default`,
  idempotent) upserts `listing_refs` for the number: no channel, no post, `author_key` the listing's
  `phone_author_key`, `author_kind` `phone`, `district_code`. So the overlay's blocked-author step (WP-42, "Overlay"
  step 1) and WP-44's `BlockedAuthorService::block()` work for native numbers without a change: «Скрыть автора» on a
  native listing writes a `blocked_authors` row of kind `phone` with the card's label «Хозяин», and it also hides
  that person's legacy listings with the same number; the answer's `listing_numbers` (and its `GET /hidden` entry)
  holds the numbers of both kinds with that key (WP-80, WP-13). HOMI's realtor votes (WP-44) and the realtor check
  of DEC-77 (WP-84) read the same key.
- `ListingRefs::pointer()` answers a native number with no channel and no post, so favourites, history and radar
  deliveries of a native listing need no Wave 2 mapping (`24` §5).

### Radars

The poller of WP-46 reads `ListingSource::feed()` per filter set with `sort = new` in `SourceContext::system()`;
through the merge its pages contain native listings, and a native number it has not seen is new like any other. A
listing published between two polls is therefore delivered by the next poll (300 s plus jitter), not "at once"
(BR-API-175 `UNVERIFIED` in legacy). With no user in the context the overlay runs only its vote part. Nothing is sent
while radars are off (DEC-51).

### Stub driver

Unchanged. The stub catalogue already carries the native entries `10000001` … `10000008` and the legacy-shaped
`100024`, `100025` (WP-80); `OwnerListingMerge` never wraps the stub, so real native rows never appear on a demo
page and the stub's native entries never appear on a real one. A test proves both directions.

## Files

- `backend/app/Services/Listings/{OwnerListingMerge,MergeCursor,FeedSortKey,PostedWhenParser}.php`
- `backend/app/Services/Listings/Native/{NativeListingSource,NativeListingFilter,NativeListingPresenter,NativeGeometry,NativeRow}.php`
- `backend/app/Listeners/Listings/RememberNativeListingRef.php` (discovered by Laravel from `app/Listeners`, as
  `App\Listeners\RecordSourceFlagChange` is today; it is not registered again, which would run it twice)
- `backend/app/Services/Sources/SourceManager.php` (the wrap in `listings()`)
- `backend/app/Services/Sources/Legacy/LegacyListingSource.php` and `LegacyFeedSlice.php` (WP-42; the slice read)
- `backend/app/Http/Controllers/Api/V1/Listings/{ListingController,ListingContactController,ListingTranslationController}.php`
  (`meta.source` of a native number)
- `backend/config/owner.php` (WP-80; keys `renovation_map`, `merge.native_cap`; `public` is WP-80's, read here)
- `backend/lang/{ru,uz,en}/listings.php` (new)
- Tests: `backend/tests/Unit/Listings/{MergeCursorTest,FeedSortKeyTest,PostedWhenParserTest,NativeGeometryTest,NativeListingFilterTest}.php`;
  `backend/tests/Feature/Listings/Native/{MixedFeedTest,MixedCountsTest,MixedMapTest,NativeCardTest,NativeRoutingTest,FilterAgreementTest,ShownPointLeakTest,StubNeverMixesTest,NativeAuthorBlockTest,NativePublicSwitchTest,RadarPollNativeTest}.php`;
  `backend/tests/Feature/Sources/Legacy/LegacyFloorGuardTest.php`; `backend/tests/Pgsql/NativeCandidatesTest.php`;
  `backend/tests/Support/NativeFilterCases.php`
- `docs/api/README.md`: the `meta.source` sentence for mixed lists (written by WP-80) checked against the code; the
  gaps of "Behaviour to reproduce" in the gap list of the listing methods

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

1. Read WP-42 ("Overlay", feed paging and top-up), WP-84 (tables, the shown point, medians, the demand rule) and
   WP-85 ("The card and the disclosure"); write into "Handoff" every name that differs from this text and use the
   other package's name.
2. `NativeGeometry`, `PostedWhenParser`, `FeedSortKey`, `MergeCursor` with their unit tests (`php artisan make:class
   Services/Listings/Native/NativeGeometry` and so on; `php artisan make:test --pest --unit Listings/MergeCursorTest`).
3. `NativeRow`, `NativeListingFilter` and `NativeFilterCases`; `NativeListingFilterTest`; `FilterAgreementTest`
   against WP-84's demand rule.
4. `backend/lang/{ru,uz,en}/listings.php`; `NativeListingPresenter`; `NativeCardTest` for the card, the preview and a
   map point in three locales and two currencies, with and without a harvested median.
5. `NativeListingSource` (candidates, counts, details, previews, translation); `NativeRoutingTest`.
6. The slice read in `LegacyListingSource`; WP-42's feed tests stay green.
7. `OwnerListingMerge` and the wrap in `SourceManager::listings()`, with `config('owner.public')`; `MixedFeedTest`,
   `MixedCountsTest`, `MixedMapTest`, `StubNeverMixesTest`, `NativePublicSwitchTest`; `meta.source` of the per-number
   controllers.
8. `RememberNativeListingRef` with the phone author key; `NativeAuthorBlockTest`.
9. `ShownPointLeakTest`, `LegacyFloorGuardTest`, `RadarPollNativeTest` (with WP-46's poller and planner), the
   PostgreSQL test.
10. Locally: the listing features on `legacy` with `sources:set`, two native listings published with the cabinet
    switch on, the Mini App walked (feed, map, card, favourites, history); reset. `make ci-backend`; PR.

## Behaviour to reproduce

- A listing placed by its owner appears in the feed, on the map and in radars like any other listing (F-OWNER-009),
  with the chip «Проверенный хозяин» from the preview (`is_owner`, `owner_verified`; WP-83 draws it).
- Seekers never learn the exact point: the map, the preview's `location`, `center_km` and the polygon filter use the
  shown point, and the card's circle has a radius of about 500 m, which always holds the true point (BR-API-167,
  SEC-040; the derivation is HOMI's own, item 5, WP-84; legacy's is Q-API-074).
- A published listing is in the feed at once and reaches the radars by the next poll (BR-API-175, `UNVERIFIED` in
  legacy).
- The card of a self-placed listing has no channel source, one history entry without a channel, the owner's own
  description and the response time (BR-API-188, through `owner {}` of WP-80).
- The market verdict follows legacy's rules where HOMI can apply them: a median of the last 60 days by district,
  else city, and rooms (BR-API-057); a difference under 10 % is «на уровне обычной цены» (BR-API-059); tones of
  BR-API-061; the block only with a value and a delta (BR-API-062). The per-m² comparison of BR-API-060 does not
  apply to the cabinet's flats, which are compared by rooms.
- The age label is computed by the client from `posted.at` (BR-API-196); `posted.when` stays as the fallback.
- The same filters give the same set in feed, count and map before the overlay, for both kinds (`08` API-004 tests).
- Gaps, listed in the PR and in `docs/api/README.md`: the order across sources is approximate where legacy's raw time
  or USD price is missing (Q-API-083, RK-36); `flow.days` and `flow.options` count legacy only; a native listing has
  no metro, matches no `zones[]` or `near_metro` search, and its verdict is sparse at first (DEC-78).

## Tests

Pest; every feature test file starts with `Http::preventStrayRequests()`; the legacy driver runs on WP-41's fixture
server; native rows come from WP-84's factories with the cabinet switch on (`phpunit.xml`, WP-80).

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `MergeCursorTest` (unit) | round trip; another sort → ends; an `l1.` cursor → legacy alone; garbage, another prefix → ends; `l: null` and `n: null` → `null` next cursor |
| 2 | `FeedSortKeyTest` (unit) | per sort, a legacy and a native item give comparable keys; `null` keys last; `new` without `at` and with an unparsable `when` sorts before every native item; equal keys → the higher number first |
| 3 | `PostedWhenParserTest` (unit, dataset) | «сегодня», «вчера», «5 дней назад», «на днях» of the stub catalogue and every `when` form of WP-42's fixtures in ru, uz and en on a frozen clock in Asia/Tashkent; an unknown form → `null`; `posted_at` without an offset read in Asia/Tashkent |
| 4 | `NativeGeometryTest` (unit) | a point inside, outside, on a vertex; a 40-vertex polygon; the haversine distance against two known pairs |
| 5 | `NativeListingFilterTest` (unit, the table of `NativeFilterCases`) | each of the 25 keys alone on a matching and a non-matching row; `zones[]`, `near_metro`, `appliances[]` never match; `house` never matches; a room and `rooms_min=2`; `rooms_max=4` is open; the tenant mapping; `null` values against set keys |
| 6 | `FilterAgreementTest` | the same table through WP-84's demand rule gives the same answers |
| 7 | `MixedFeedTest` | per sort, legacy fixture pages and five native rows: the merged order equals the sorted union; a full walk by cursor delivers every item exactly once; a page never exceeds `limit`; the overlay hides a native number of the user's hidden list; `meta.source` is `legacy` and native items carry `origin: native`; a sale search has no native item |
| 8 | `MixedCountsTest` | count, new-since and the flow's `week` are legacy + native; a native listing published before `since` is not counted as new; `days` and `options` unchanged |
| 9 | `MixedMapTest` | native points at the shown point with `origin: native`; `total` and `with_point` grow by the native count; a cut legacy answer keeps its `with_point` plus the native count |
| 10 | `NativeCardTest` | the card of an `active` row in ru, uz, en and USD, UZS; the masked synthetic number in `owner.description` and in `landmark`; `author` = `{kind: phone, label: «Хозяин», count}` with no digit; the photo addresses `…/owner/<token>/<n>.jpg?v=…` without the listing number, and `smallPhotoUrl`'s rule gives their `.s.jpg`; `comparison` with a district median, a city median, none; a `paused`, a `held` and a `withdrawn` row → the same unlisted shape: `status_text`, `title`, `price`, `deal`, `district`, no description, landmark, location, centre distance, facts or photos, `has_phone: false`; a purged row → `404 not_found`; no key of the card holds the true point or a digit run of the owner's number |
| 11 | `NativeRoutingTest` | `details`, `preview`, `previews`, `contact`, `translation` of a native number never reach the legacy fake; of a legacy number never query `owner_listings`; `OwnerListingMerge::contact()` of a native number → `ContactUnavailable`, while `POST /listings/{number}/contact` of an `active` native listing answers through WP-85's branch; translation of a native number → `404 not_found`; the per-number controllers answer `meta.source: native`; share keeps its own driver |
| 12 | `ShownPointLeakTest` | shrinking polygons around a native listing (SEC-REQ-052 acceptance): the listing appears only while the polygon contains the shown point, never the true point; the true point lies at most 491 m from the shown point, inside the card's 500 m circle; feed, map, card and preview answers never contain the true coordinates |
| 13 | `StubNeverMixesTest` | features on `stub` and a real native row in the database: the feed holds the stub's native entries only; features on `legacy`: no stub native number appears |
| 14 | `NativeAuthorBlockTest` | publishing writes the `listing_refs` row with the listing's `phone_author_key` and `author_kind: phone`; `PUT /listings/{number}/blocked-author` on a native number answers `kind: phone`, label «Хозяин»; the answer's `listing_numbers` holds the native number and the legacy fixture numbers of that key; the user's feed then omits every listing of that owner and the legacy fixture listings with the same number; another user still sees them |
| 14a | `NativePublicSwitchTest` | `owner.public` false: no native item in feed, count, new-since, flow, map or a radar poll; a native card → `404 not_found`; `POST /listings/{number}/contact-request` on an `active` native listing → `409 request_closed`, `POST /listings/{number}/contact` of a `phone`-mode native listing → `404 contact_unavailable`; the owner's `GET /owner/listings` and his answer to a pending request unchanged; back to true: everything returns |
| 15 | `LegacyFloorGuardTest` | a legacy fixture whose item id is `10000000` or above → a contract error, counted, never served |
| 16 | `RadarPollNativeTest` | with `radar.matching_enabled` on and the feed on the fixture-backed legacy driver: a native listing published between two polls is planned by the next poll (WP-46's planner); a paused one is not |
| 17 | `NativeCandidatesTest` (`tests/Pgsql`, `make test-pgsql`) | the candidate query on PostgreSQL with geography columns; the cap and its metric |

## Acceptance checklist

- [ ] With the listing features on `legacy` locally and native rows present, the feed, the map, the card, favourites
      and history show both kinds; native items carry `origin: native`; `meta.source` of a list is `legacy` and of a
      native card `native`.
- [ ] Every sort orders the two kinds into one list; a full cursor walk delivers each listing once.
- [ ] Count, new-since and the flow's `week` include native listings; the gaps of "Behaviour to reproduce" are in
      `docs/api/README.md`.
- [ ] No public answer holds the true point of a native listing; the polygon filter reads the shown point.
- [ ] No answer holds a digit run of an owner's number; `owner.description` is masked.
- [ ] The filter table passes against `NativeListingFilter` and against WP-84's demand rule.
- [ ] A legacy id at or above the native floor is refused as a contract error and counted.
- [ ] On the stub driver no real native row appears; on the legacy driver no stub native entry appears.
- [ ] A native listing published between two polls is planned by the next poll of WP-46.
- [ ] Blocking the author of a native listing hides that owner's listings, and the legacy listings with his number,
      for the user only.
- [ ] With `OWNER_LISTINGS_PUBLIC=false` no public answer holds a native listing, no request or disclosure is served
      on a native number, and the cabinet still works.
- [ ] A native card out of the feed (paused, held, withdrawn, let, removed) holds no description, landmark, point,
      facts or photo.
- [ ] On staging (cabinet switch off, no native rows) every listing method answers as before this package.
- [ ] `make ci-backend` and `make test-pgsql` are green; production flags are unchanged.

## Handoff

Empty.
