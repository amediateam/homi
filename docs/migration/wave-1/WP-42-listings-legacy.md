# WP-42 — Listings through legacy: feed, count, flow, map, card, overlay, photos

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | WAITING (merged in #131, env keys #130; migrations, `AUTHOR_KEY_SECRET` and the photo location pending) |
| Depends on | WP-41 |
| Size | about 3 000 changed lines without fixtures, L |
| Behaviour reference | `25` §4.5, §5 (last paragraph); WP-12 (the shapes to produce); `08` §1.3, §1.7, §1.8 and the rows of API-004 … API-008 and API-035, RES-001, RES-002; `02` BR-API-156 … BR-API-158, LB-API-055, Q-API-066; `03` §1.12 (server-formatted strings); `24` §8.2 (Q-API-062, Q-API-063), §8.3 (RK-25, RK-26); `16` SEC-REQ-014, SEC-REQ-018, SEC-REQ-025; tasks `tasks/backend/KV-BE-039-view-history.md` (what records a view) and `KV-BE-040-…`, `KV-BE-041-…` (exclusion rules) |
| Needs from the production track | 1. An nginx location on the media host of staging and production that proxies and caches legacy photos (described under "Photos"); then the value of `LEGACY_MEDIA_PUBLIC_URL` in the server env, and that host named to the development track for the `img-src` list of the Mini App. 2. Server env: `AUTHOR_KEY_SECRET` (random, at least 32 bytes, different per environment). 3. Approve two migrations on production: `listing_refs`, `listing_views` (new, empty) |

## Goal

The `legacy` driver answers the six listing reads — feed, count, new-since count, flow, map, card — in the shapes of
WP-12. HOMI adds
what legacy cannot know about HOMI's users: favourite and viewed flags, hidden listings, blocked authors and HOMI's
own report outcomes. Opening a card records the view in HOMI. Photo addresses point at HOMI's media host. Contract
tests fail when a recorded legacy answer stops fitting a translator.

## Scope

In: `LegacyListingSource` (feed, count, newSince, flow, map, details, preview, previews); translators; the overlay
and its data contract; feed top-up and cursors; `listing_refs` and `listing_views`; view recording; photo address
rewriting; golden fixtures and contract tests.

Out: the contact method and translation (WP-43 — until then `contact.has_phone` is `false`); the
tables behind favourites, hidden listings, blocked authors and votes (WP-44 binds the real overlay data); radar
polling (WP-46); switching flags on production (WP-48).

## Decisions that bind this package

- Legacy answers for the service key, not for the user; HOMI overlays the per-user part (`25` §4.5, DEC-42).
- A feed page that shrinks below half its size after filtering is topped up from the next legacy page (`25` §4.5).
- Caching: a card for one minute, nothing for the feed (`25` §4.5). The per-user owner fields (`owner.mine`,
  `owner.listing_id`, `contact.request`) are never cached with the card (*added by the owner-cabinet plan*).
- Every table that points at a listing stores the number and, when known, the source channel and post (`25` §5,
  Q-API-063).
- Reports and votes are applied in HOMI only (DEC-48): legacy never learns about them, so HOMI filters its own view.
- Raw values next to display strings; where legacy gives only a string, HOMI parses it once on the server and the
  gap is listed per field (Q-API-062).
- Photos are proxied and cached by nginx on a HOMI host; the client keeps deriving the small variant (`25` §4.5).
- A legacy new-since answer whose `count` is missing or not an integer ≥ 0 is a contract error and reaches the user
  as `503 source_unavailable`, never as a `count` of `0` (the rule of WP-41 for answers that do not fit). For the
  user both look the same — the Mini App shows no banner on an error or on `0` (API-035) — but an error is logged
  and counted, so a legacy release that changes the answer shows up in the contract tests and the logs instead of
  hiding behind zeros (RK-26). This is HOMI's side of LB-API-055 and LB-APP-048: `count` of `GET /listings/new` is
  always an integer (WP-12).
- No raw phone number leaves the driver with a card (DEC-52, WP-12): the legacy card's `phone` and `phone_display`
  are not copied into `ListingDetails`, and numbers inside texts are masked.

## Design

### `LegacyListingSource` (`App\Services\Sources\Legacy`)

| Method | Legacy call | Cache (shared part, before the overlay) |
| ------ | ----------- | --------------------------------------- |
| `feed(ListingQuery)` | `GET /api/feed` with `limit=20` | none |
| `count(SearchFilters)` | `GET /api/feed/count` | 30 s per filters and locale (`legacy.cache.count`; 0 disables) |
| `newSince(SearchFilters, int $since)` | `GET /api/feed/new` with the filter query and `since` | none: `since` differs per user and visit |
| `flow(SearchFilters)` | `GET /api/feed/flow` | 60 s per filters and locale (`legacy.cache.flow`) |
| `map(SearchFilters)` | `GET /api/map` | 30 s per filters and locale (`legacy.cache.map`) |
| `details(int)` | `GET /api/listings/{id}` | 60 s per number, locale and currency (`legacy.cache.card`), without the per-user owner fields (*added by the owner-cabinet plan*) |
| `preview(int)` | `GET /api/listings/{id}?preview=1` | 60 s, same key space |
| `previews(list<int>)` | parallel `preview` reads, at most 5 at a time (`legacy.previews.concurrency`), each through the limiter and the card cache | per item |

The short caches for count, flow and map are an addition to `25` §4.5: they protect the service key from identical
live requests of many users (RK-25) and never hold per-user data. `previews()` drops a number that answers `404` and
logs one that is unavailable; if the operator offers a batch read (WP-02 point 9), only this method changes.
Calls made for a system context (`SourceContext::system()`) are marked `background` for the limiter.

Bind the class in `config/sources.php` for the capability `listings`. Defaults of the features stay `stub`. The
interface of WP-10 also has `contact()` and `translation()`: here both throw `SourceUnavailable`; WP-43 writes them.

### Translators (`App\Services\Sources\Legacy\Translators`)

- `FiltersTranslator::toQuery(SearchFilters, ?sort, ?cursor)`: the legacy parameter list of `08` §1.7 — repeated
  keys without brackets, booleans only when true, `furnished` as `true` or `false` when set, numbers when not null,
  `polygon` as `lat,lon;…`, `sort` omitted for `new`. `fromLegacy(array): SearchFilters` for flow options: fills
  missing keys with defaults, maps the old `zone` string into `zones` (LB-API-028), drops type codes that are not
  valid for the deal (LB-API-006). `area_min` and `area_max` are passed to legacy for every deal (DEC-62); whether
  legacy applies them to rent is `02` Q-API-082.
- `PriceParser::parse(?string $price, ?string $kind, mixed $usd): ?PriceInfo` — the client rule of `03` §1.12 done
  once on the server: split on « · »; in the first part the bracket text becomes `alt`, the text from the first `/`
  becomes `period`, the rest `display`; the other parts become `notes`. `usd` is the legacy `usd` or `price_usd`
  when numeric, else `null`. `kind` passes `down_payment` and, since legacy release `index-Dbpp463V.js`,
  `business` (BR-API-156); anything else becomes `null` (Q-API-065).
- `ListingSummaryTranslator` and `ListingDetailsTranslator`: the field table of WP-12. Rules worth stating:
  `title` = `short_title`, else the part of `title` before « · »; `posted` = the two « · » parts of `age`
  (`label`, `when`), `at` ← legacy `posted_at` when present (since `index-CIa0Ldj2.js`), else `null`; `floor`:
  `0` and negative values pass through unchanged, and only a missing key or `null` is `null` (never turn `0` into
  `null`); the card's `deal` ← `deal_type`; `district.code` through `DistrictMatcher` (the city's
  directory of `ReferenceSource`, compared by name in the request locale; no match → `null` and a counter);
  `has_video` = truthiness of `video`; `metro.km` and `center_km` numeric or `null`; `source_ref` through
  `SourceRefParser` from `original_url`, else the first `sources[].url`, with the pattern
  `https://t.me/<channel>/<post id>` (optional `s/`); `comparison` only when `median` is truthy and `median_value`
  is numeric. Strings are passed as text; nothing is treated as markup (SEC-REQ-018). Both translators build
  their object through its `fromArray()`, so `PhoneMasker` of WP-12 masks `title`, `summary`, `original.text`,
  `offers[].text` and `price_history[].text` — the legacy `original_text` and `summary` carry the numbers of the
  post. The legacy keys `phone`, `phone_display` and the call link are not mapped; `contact` gets `contact_url`
  and `contact_paid`, and `has_phone: false` until WP-43 sets it. The card cache stores the data object, so it
  holds no raw number.
- `MapPointsTranslator`: `id → number`; points without numeric `lat` and `lon` are dropped; `<` and `&` are removed
  from `label` (fix of LB-API-008 on HOMI's side); `total` defaults to the number of points; `with_point` ← legacy
  `with_point` (since `index-CIa0Ldj2.js`), default the number of points legacy sent.
- `NewCountTranslator`: `FiltersTranslator::toQuery()` of the filters (no `sort`, no cursor) plus `since` as an
  integer; the answer's `count` must be a JSON integer ≥ 0 (a number with a zero fraction, such as `12.0`, counts
  as an integer). Missing, `null`, a string, a negative number or a fraction raise `LegacyContractError` naming
  `count` (BR-API-157, LB-API-055).
- `FlowTranslator`: `days` below 1 becomes 1; `options` default `[]`; each option's `filters` through
  `FiltersTranslator::fromLegacy()`; `count` numeric or `null`.
- Owner fields (*added by the owner-cabinet plan*): every item carries `origin: legacy`. The details translator
  maps legacy's self fields (`owner_self`, `contact_mode`, `response_minutes`, `owner_description`, `owner_mine`,
  `my_request`; `02` BR-API-188) to `owner {}` and `contact.mode`: `owner.tier` is `self` with `owner_self`,
  `verified` with `owner_verified`, `claimed` with `is_owner` alone, else `null`; `open` → `phone`; a `gate` listing
  with no phone → `hidden` (integrator default 3 of the owner-cabinet plan) until WP-87 switches the relay on
  (DEC-75), then `request`. `owner_mine` and `my_request` belong to
  nobody under a service key and are ignored, like `favorite`. An owner label that the tier already says («Проверенный
  хозяин…», «Хозяин — со слов объявления», BR-API-189) is dropped from `owner_label`. A legacy id at or above the
  native floor (`ListingNumber::isNative()`, WP-80) raises `LegacyContractError`, so a collision is never served.
- Required keys per answer (their absence is a `LegacyContractError`): feed `items` (array) and the key
  `next_cursor`; item `id`, `photos_preview`; count `count`; new-since `count` (an integer ≥ 0); flow `week`, `days`;
  map `points`; card `id`, `photos`, `facts`, `sources`.

`favorite` and `viewed` of the legacy answer are ignored: they belong to nobody under a service key.

### Overlay

`App\Services\Listings\Contracts\OverlayData` — what the overlay needs from HOMI's own data:

```php
/** @param list<int> $numbers @return list<int> */ public function favorites(User $user, array $numbers): array;
/** @param list<int> $numbers @return list<int> */ public function viewed(User $user, array $numbers): array;
/** @return list<int> */                           public function hiddenNumbers(User $user): array;
/** @return list<string> */                        public function blockedAuthorKeys(User $user): array;
/** @param list<int> $numbers @return list<int> */ public function rentedByVotes(array $numbers): array;
/** @return list<string> */                        public function realtorAuthorKeys(): array;
```

This package binds `NullOverlayData` (empty answers, except `viewed`, which reads `listing_views`); WP-44 binds the
real implementation. `App\Services\Listings\ListingOverlay` applies it:

1. Excluded numbers of the user = hidden numbers ∪ numbers of `listing_refs` whose `author_key` is one of the user's
   blocked keys ∪ (for the page) numbers marked rented by HOMI's votes. An item that carries its own author key
   (operator field, below) is checked directly.
2. Feed and map: excluded items are removed. Card: an excluded listing is still returned (a direct link must open);
   only the flags are set.
3. `favorite` and `viewed` are set from HOMI's data on every item.
4. Realtor marks from HOMI's votes: an item whose author key is marked gets `is_owner: false`, and is removed when
   the request filters by `owner` `owners` or `no_agents`.
5. Count, the new-since count and flow are **not** overlaid (the plan lists them as plain legacy); a count may
   therefore exceed what the user can scroll. Map `total` is reduced by the number of removed points, and
   `with_point` with it. HOMI's own cap and order of a map answer are open (Q-API-086): this driver passes on what
   legacy cut.

The card method answers the legacy `429 too many today` as it arrives from the client of WP-41 (`DailyLimitReached`:
`429 rate_limited` with `reason: "daily"`, DEC-59), not as `source_unavailable`.

Without a user (system context) only step 1's vote part and step 4 run.

The owner cabinet adds two per-user parts (*added by the owner-cabinet plan*): the overlay writes `owner.mine` and
`owner.listing_id` (from WP-84's owner listings of the user, written by WP-85) and `contact.request` (from WP-85's
request states, and
for a `request`-mode listing `contact.has_phone` only with a `given` request), on legacy and native items alike; the
card cache never holds them. A realtor mark of step 4 also sets `owner.tier` to `null`, so HOMI's mark wins over a
legacy «Проверенный хозяин» (an integrator default of that plan; reports are still not passed to legacy, DEC-48).
The overlay also writes `owner.entry` (DEC-94; WP-80): true while the cabinet is on, for a card with `is_owner` that
is not `owner.mine`; legacy's own `owner_entry` of the card (`$KVADRO_ROOT/docs/api.md` §3, r38) is not read, since
its rule is legacy's and open (`api.md` §14, question 19) (*added by the intake of `index-YX9bFVws.js`*).

The controllers apply the overlay and the view recorder to the answer of every driver, `stub` included: the stub's
own `favorite` and `viewed` values are overwritten like legacy's, so a favourite saved by real code shows on a stub
feed. One exception: while `sources.native_stubs` is on (WP-40), both are skipped, so the end-to-end suite keeps the
fixed flags of the fixtures and leaves no rows behind (`25` §4.4: stubs are deterministic). Author keys exist only
for cards that came through the legacy driver (`AuthorKey::fromCard()` reads the legacy card) and, once WP-86 is
merged, for native listings, filed under their owner's phone key (*added by the owner-cabinet plan*).

**Feed paging and top-up.** Legacy is always asked for pages of 20. To build one HOMI page: fetch the legacy page the
cursor names, apply the overlay, skip the offset the cursor carries, and take items up to `limit`. While fewer than
`limit / 2` items are collected and legacy has a next cursor, fetch the next legacy page and continue, at most
`legacy.feed.top_up_pages` (default 2) extra pages per request. A HOMI page therefore never exceeds `limit` and may
be shorter. `meta.next_cursor` is `l1.` + base64url of `{"c": <legacy cursor to resume from>, "o": <items of that
page already delivered>}`, or `null` when legacy has no further page and the current one is used up. A cursor that
does not decode, or has another prefix (for example a stub cursor after a flag switch), ends the list quietly: empty
`data`, `null` cursor.

### `listing_refs` and author keys

Table `listing_refs`: `listing_number` (`unsignedBigInteger`, primary key), `source_channel` (string 64, nullable),
`source_post_id` (`unsignedBigInteger`, nullable), `author_key` (string 96, nullable, indexed), `author_kind`
(string 8, nullable), `district_code` (string 64, nullable), `merged_into` (`unsignedBigInteger`, nullable),
`first_seen_at`, `last_seen_at`, `gone_at` (`timestampTz`, nullable). The author key is pseudonymous, not opaque: a
`phone:` key is a keyed hash of a person's number and is used for decisions about that person (the votes of WP-44,
the realtor check of WP-84), so the security review of WP-70 checks its retention. A native listing is filed under
its owner's phone key (`phone_author_key` of WP-84; WP-86 writes the row), so blocking and votes reach that person's
legacy listings with the same number too (*added by the owner-cabinet plan*).

`App\Services\Listings\AuthorKey::fromCard(array $legacyCard): ?AuthorKey`:

| Case | Key | Kind |
| ---- | --- | ---- |
| the operator sends a stable author key (field name in `legacy.fields.author_key`, WP-02 point 6) | `legacy:<value>` | from `author.kind` |
| the card has a phone | `phone:` + first 32 hex of HMAC-SHA-256(phone in E.164, `AUTHOR_KEY_SECRET`) | `phone` |
| no phone, a source channel | `source:<channel>` | `source` |
| neither | none | — |

`App\Services\Listings\ListingRefs`: `remember(ListingDetails, ?AuthorKey)` upserts on every card fetched from legacy
(a cache miss, so at most once a minute per listing); `pointer(int $number): ListingPointer` (number, channel, post —
used by every personal table of WP-44); `numbersOfAuthors(list<string>): list<int>`; `markGone(int)` on a `404`;
`markMerged(int $asked, int $answered)` when legacy answers with another number.

The card read is also the source of WP-84's medians harvester (DEC-78): WP-84 adds the event
`App\Events\Listings\LegacyCardFetched` beside the call of `ListingRefs::remember()`, so the `comparison` block of
every card fetched from legacy reaches it once per cache miss (*added by the owner-cabinet plan*).

### View history

Table `listing_views`: `id`, `user_id` (foreign key, cascade), `listing_number`, `source_channel`, `source_post_id`,
`first_viewed_at`, `last_viewed_at`, `views` (integer); unique (`user_id`, `listing_number`); index (`user_id`,
`last_viewed_at`). `App\Services\Listings\ViewRecorder::record(User, ListingDetails)` upserts synchronously after a
successful full card read and sets `viewed: true` on that answer. `preview=1` never records. With a merged answer the
surviving number is recorded.

### Photos

`App\Services\Listings\PhotoUrlRewriter`: a legacy address of the form `/media/<listing>/<n>.jpg?e=…&s=…` (relative,
or absolute on a legacy host) becomes `<LEGACY_MEDIA_PUBLIC_URL>/<listing>/<n>.jpg?e=…&s=…`, query untouched; any
other address is dropped and counted. The result keeps the form `…/<digits>/<digits>.jpg?…`, so the client's small
variant (`.s.jpg`, RES-002) works. Config: `legacy.media.public_url` (`LEGACY_MEDIA_PUBLIC_URL`); empty ⇒ photos
arrays are empty and a warning is logged once a minute.

Request to the production track — on the media host of each environment:

```nginx
location ^~ /lm/ {                          # LEGACY_MEDIA_PUBLIC_URL = https://<media host>/lm
    limit_except GET HEAD { deny all; }
    proxy_pass https://<legacy host>/media/;   # the host of LEGACY_API_URL
    proxy_set_header Host <legacy host>;
    proxy_ssl_server_name on;
    proxy_set_header Cookie ""; proxy_set_header Authorization ""; proxy_set_header Referer "";
    proxy_hide_header Set-Cookie; proxy_ignore_headers Set-Cookie;
    proxy_cache <a cache zone>; proxy_cache_key $uri$is_args$args;
    proxy_cache_valid 200 24h; proxy_cache_valid 404 1m;
    add_header Cache-Control "public, max-age=86400";
}
```

The signature in the query is the access control and expires within one to two days (RES-001), so a 24-hour cache
never outlives it by more than a day. The service key is never sent to this location.

### Golden fixtures

Under `backend/resources/fixtures/legacy/`, written from `08` §1.8 and the listed rows, sanitised, documented in the
`README.md` of WP-41: `feed.default.json`, `feed.page2.json` (with `next_cursor: null`), `feed.empty.json`,
`count.json`, `feed_new.json` (`count` 12), `flow.json`, `flow.options.json`, `map.json`,
`listing.rent_apartment.json`, `listing.daily.json`, `listing.sale_house.json`, `listing.commercial.json` (with
`price_kind: "business"`), `listing.land.json`, `listing.preview.json`, `listing.merged.json` (answers with another
`id`), `listing.no_phone.json`, `listing.minimal.json` (only required keys). `LegacyFakeServer` serves them,
including the `?cursor=` of the second page.

## Files

- `backend/app/Services/Sources/Legacy/LegacyListingSource.php`; `…/Legacy/Translators/{FiltersTranslator,PriceParser,ListingSummaryTranslator,ListingDetailsTranslator,MapPointsTranslator,NewCountTranslator,FlowTranslator,SourceRefParser,DistrictMatcher}.php`
- `backend/app/Services/Listings/{ListingOverlay,NullOverlayData,ListingRefs,ListingPointer,AuthorKey,ViewRecorder,PhotoUrlRewriter}.php`,
  `backend/app/Services/Listings/Contracts/OverlayData.php`
- `backend/app/Models/{ListingRef,ListingView}.php` with factories; two migrations
- `backend/app/Http/Controllers/Api/V1/Listings/{ListingController,ListingMapController}.php` (overlay, view recording)
- `backend/config/{legacy,sources}.php` (`cache.*`, `previews.concurrency`, `feed.top_up_pages`, `media.public_url`,
  `fields.author_key`); `backend/config/contacts.php` (new: `author_key_secret`)
- `backend/app/Services/Sources/Legacy/LegacyClient.php` (a `pool()` helper for `previews`)
- `backend/resources/fixtures/legacy/*.json` (the list above)
- `backend/tests/Unit/Sources/Legacy/*TranslatorTest.php`, `PriceParserTest.php`, `SourceRefParserTest.php`;
  `backend/tests/Feature/Sources/Legacy/{LegacyListingSourceTest,ListingGoldenContractTest}.php`;
  `backend/tests/Feature/Listings/{ListingOverlayTest,FeedTopUpTest,ViewRecorderTest,PhotoUrlRewriterTest,ListingRefsTest}.php`
- `backend/.env.example` (`LEGACY_MEDIA_PUBLIC_URL`, `AUTHOR_KEY_SECRET`) — separate shared-file PR

## Steps

1. Read WP-12 again; read `08` §1.7, §1.8 and the six rows. Every feature test file starts with
   `Http::preventStrayRequests()`. Unit test files have no application (the rule of WP-41 step 1): a translator
   that needs `DistrictMatcher`, `PhotoUrlRewriter` or configuration gets them as constructor arguments, or its
   test moves to `tests/Feature`.
2. Golden fixtures; extend `LegacyFakeServer`.
3. `PriceParser`, `SourceRefParser`, `FiltersTranslator` with unit tests (table-driven).
4. Summary, details, map, new-since and flow translators; `DistrictMatcher`; `PhotoUrlRewriter`.
5. `LegacyListingSource` with the caches and `previews()`; bind it; `ListingGoldenContractTest`.
6. Migrations and models (`php artisan make:model ListingRef --factory --migration`, the same for `ListingView`);
   `AuthorKey`, `ListingRefs`.
7. `OverlayData`, `NullOverlayData`, `ListingOverlay`; feed top-up and cursors; wire the controllers.
8. `ViewRecorder` in the card controller.
9. Locally set the six listing features to `legacy` with `sources:set`, walk the Mini App on fixtures, reset.
10. Pint, PHPStan, `make ci-backend`; the env PR; hand the nginx request to the production track in the PR text.

## Behaviour to reproduce

- The same filters give the same set in feed, count and map before the overlay (`08` API-004 tests).
- The last page has `next_cursor: null`; the client de-duplicates by number, so top-up pages may overlap nothing.
- A card may answer with another number (merged duplicate); the client follows it (API-008).
- Opening a card puts it at the top of history once; opening it again moves it up without a duplicate; a preview
  read does not count (task `KV-BE-039`).
- A hidden listing or a blocked author's listing never appears in the user's feed or map, and still appears for
  everyone else (fix of LB-API-041).
- Map labels are plain text (fix of LB-APP-020 on the server side).

Gaps against legacy that this driver cannot close, to list in the PR and in `docs/api/README.md`: raw `price.usd`,
`posted.at`, `deal` and `type` on previews are `null` unless the operator adds them; `district.code` is a name match;
count, the new-since count and flow ignore the user's hidden items. `posted.at` leaves this list if legacy sends
`posted_at` on previews (`02` Q-API-083). `GET /listings/new` has two callers in the Mini App since the intake of
`index-CIa0Ldj2.js`, the return banner and the fresh pill: one more read per long return in the legacy budget.

## Tests

- `PriceParser` (dataset): amount only; amount with period; with bracket text; with notes; `null`; negotiable price;
  `kind` `down_payment` and `business` kept, an unknown value → `null`; numeric `usd` kept, non-numeric dropped.
- `SourceRefParser`: channel and post from a post link, from an `s/` link; a link without a post id → `null`.
- `FiltersTranslator`: each of the 25 keys alone; repeated keys; `furnished=false` sent; booleans absent when false;
  polygon string; `sort=new` omitted; `fromLegacy` with `zone`, with a missing key, with an invalid type.
- Translators on every golden fixture: the result equals the WP-12 shape (`JsonShape` against the stub fixture);
  `listing.minimal.json` yields nulls, not errors; a fixture copy without a required key raises a contract error
  naming the key. `listing.rent_apartment.json` has a synthetic number in `phone`, `original_text` and `summary`:
  the serialised `ListingDetails` holds it nowhere, and both texts hold its masked form.
- New-since: `feed_new.json` → `12`; the legacy query carries the filters as for count plus `since` and no `sort`;
  fixture copies with `count` missing, `null`, `"12"`, `-1` and `2.5` → contract error naming `count` and
  `503 source_unavailable` on the route, never `200`; `12.0` → `12`; nothing is cached.
- Source: card cached for a minute per locale; feed never cached; count cached 30 s; `previews` of 7 numbers sends
  at most 5 in parallel and omits a `404`; a system context marks calls as background.
- Overlay (with a fake `OverlayData`): flags set; hidden and blocked removed from feed and map; card of a hidden
  listing still returned; realtor mark flips `is_owner` and removes under `owner=owners`; map `total` and
  `with_point` reduced; two users see different results from one cached legacy answer.
- Top-up: a page of 20 with 12 excluded triggers one extra legacy page; three excluded do not; the cap of two extra
  pages; a HOMI page never exceeds `limit`; the cursor resumes inside a partly used legacy page, and a full walk
  delivers every non-excluded item exactly once; a foreign or broken cursor → empty page and `null`.
- Views: full read records and returns `viewed: true`; second read increments `views` and moves `last_viewed_at`;
  `preview=1` records nothing; a merged answer records the surviving number; user B's views never mark A's feed.
- Photos: relative and absolute legacy addresses rewritten with the query intact; a foreign address dropped; empty
  configuration → empty arrays.
- Routes with the features on `legacy`: `meta.source = legacy`; legacy `404` → `404 not_found`; legacy down →
  `503 source_unavailable`; legacy `429 too many today` on the card → `429 rate_limited` with `reason: "daily"`.
- Fields of `index-CIa0Ldj2.js`: `posted_at` → `posted.at`, absent → `null`; `floor: 0` and `floor: -1` stay `0`
  and `-1`; a map answer with `with_point` keeps it, without it gets the number of points; a rent query carries
  `area_min` and `area_max`.

## Acceptance checklist

- [ ] Feed, count, new-since count, flow, map and card answer through the `legacy` driver with the shapes of WP-12
      in three locales.
- [ ] A legacy new-since answer without an integer `count ≥ 0` gives `503 source_unavailable`, never a `count`.
- [ ] `ListingGoldenContractTest` covers every fixture and fails readably on a shape change.
- [ ] The overlay sets flags and removes hidden, blocked and vote-marked listings; count, new-since count and flow
      are documented as not overlaid.
- [ ] Feed pages are topped up as specified and end with `null`.
- [ ] A full card read records one view per user and listing; previews do not.
- [ ] Photo addresses are rewritten to the configured media base and keep the `…/<digits>/<digits>.jpg?…` form.
- [ ] `listing_refs` stores number, channel, post and an opaque author key; no phone is stored or logged.
- [ ] No card built by the legacy driver, cached or answered, holds a raw phone number: texts are masked and the
      contact object has no number (WP-12).
- [ ] The nginx request and the two env keys are in the PR description; migrations are named.
- [ ] `make ci-backend` is green; production flags are unchanged.
- [ ] If the key and the media location exist on staging: with the six features set to `legacy` there, the feed,
      map and a card load inside Telegram with real photos; then the features are reset (WP-48 switches for good).

## As built

The package is built as designed, with these points decided in the code (rule 6). Each one corrects or completes
the design above; the AM rows are in `docs/ai/reports/phase-3-notes.md` §AK, the developer's decision DEC-110 in
`docs/migration/decisions/2026-11-27-developer-answers.md`.

**Caches and masking**

- **Caches hold arrays, never objects** (corrects "The card cache stores the data object"). The cache store refuses
  objects (`config/cache.php` `serializable_classes => false`), so every listing cache holds the v1-shaped array of the
  built data object — masked, without `phone`, `phone_display` and the call link, and with the per-user owner fields at
  their defaults — and is rehydrated through `fromArray()`. An entry that no longer fits its data object is dropped and
  read again. A cached number (the count) is read whether the store gives an int or a numeric string (AM-119) (AM-120).
- **Masking happens in the translator and again in `fromArray()`**, so the array a cache stores already holds no raw
  number; `PhoneMasker` is idempotent (masking a masked text changes nothing; a property test pins it).
  The masker of WP-12 refused a number after `*`, `/`, a digit or a `+`, read only ASCII spaces and hyphens as
  separators, and stopped one number on the last two digits of a masked one, so Markdown bold (`**00 765 43 21**`),
  the second number of `+998…/+998…`, `кв45+998…`, numbers with a no-break space or a dash and `wa.me/998…` inside a
  description stayed raw (AM-121). It now runs in rounds to a fixed point: pass 1 reads numbers over the whole text,
  links included (a number may follow anything but a digit; a `+` number starts on its `+` anywhere; up to three
  separators between groups, the no-break and thin spaces and the dashes U+2010…U+2014 and U+2212 included; fullwidth
  digits are normalised to ASCII), pass 2 masks the digits of every link-like token `LinkGuard` refuses except the
  last two; a round that changes nothing ends it, so masking a masked text changes nothing by construction. A bare
  match ending in `000` is a price and stays, and the search resumes on its next character, so a price cannot hide a
  number that starts inside it; after 16 rounds without settling, or on text that is not UTF-8, every digit is masked.
  The public surface (`mask()`, `CODES`, `MASKED_PATTERN`) is unchanged; `/` and `,` are still not separators (`3/9`,
  `1,200,000`). A frozen copy of the masker of `main` (`tests/Support/LegacyPhoneMaskerOfWp12.php`) pins that the new
  one is never weaker, over generated texts and every fixture string; the property is shown by tests, not proved.
  Costs, accepted: a text link with a run of nine digits (a Google Maps `@41.31…,69.24…`, an Instagram post id, a
  signed expiry `e=…`) is masked; a price glued to a `+` is masked; in an overlap of two numbers the first mask has no
  tail digits and does not match `MASKED_PATTERN` (as on `main`). Besides the texts of WP-12, `place`, `landmark`,
  `facts[].value` and `nearby[].note` are masked in `fromArray()` — on every driver — and in the translators; labels
  and directory strings (district, metro, market, `status_text`, `posted`, the `median_*` texts, flow options, map
  labels, price parts) are not: they are legacy's, not the author's.
- **Links** (completes "Translators"). `LinkGuard` keeps a link (`contact_url`, offer, original, source and history
  links) only when it is `https`, decodes to valid UTF-8 and holds no run of nine digits once flattened: `wa.me/998…`,
  `t.me/+…` (invite links included) and `tel:` links are dropped, and a source whose link is dropped is left out.
  `source_ref` is read from kept links only. A Telegram link, channel or handle whose name holds nine digits or more
  in total is treated as a phone: `LinkGuard` drops the link, `SourceRefParser` gives no reference (so no `source:`
  author key and no channel in `listing_refs` / `listing_views`), a `sources[]` item with such a handle is left out
  whole and `price_history[].channel` becomes `null`.
- **Shared caches are filled once** (completes "Cache"). Card, preview, count, flow and map fill a cold entry under the
  lock `{key}:fill`; a waiter re-reads the cache every 100 ms for up to `legacy.cache.fill_wait_ms` (1 000) and then
  reads legacy without the lock, so the lock never fails a request; no lock while a cache duration is 0, released after
  a failed fill, alive 47 s with the defaults (the longest read). Feed and new-since are not cached, and a preview
  batch does not lock its items.
- The count asks legacy in USD and is keyed by language only; flow and map labels carry formatted prices, so their keys
  include the currency. A cached full card serves its preview. A `404` number is remembered for
  `legacy.cache.not_found` (60 s) and answered without a call (the class of WP-41's public-route stampede).

**Translators**

- **Gaps, completed.** Besides the listed ones, `source_ref` is `null` on every preview and `type` is `null` on cards
  too. `ListingGoldenContractTest` compares each translation with the stub fixture's shape and allows `null` only for
  the documented gaps (`LegacyFixtures::PREVIEW_GAPS`, `CARD_GAPS`); `price.usd` and `posted.at` only where the legacy
  item lacks the key. A second golden test deletes, one at a time, every key a fixture carries and requires the
  translation to change or fail, so a renamed legacy key cannot pass silently (it ignores `total`, `photos_total` and
  a card's `photos_count`, which only cap other values).
- **Lenient parts, strict skeleton.** The required keys of the design still raise `LegacyContractError`; below them, an
  optional field of the wrong type becomes `null`, a fractional optional number is rounded, an unknown `deal_type` is
  `null`, a map `id` may be a string of digits, `days` below 1 is 1, an empty `next_cursor` ends the list, and bad list
  items (a source not an object or without a url, a fact without a label, history not a list, an event without `at`,
  an author not an object, a bad flow option) are left out. Every answer collects the key names it could not use (with
  positions normalised, never values); the source logs them at most once a minute per path template and key set
  (positions normalised: `items.3.floor` is `items.*.floor`) and counts every answer that had one (`coerced`).
- **Defaults.** Map `total` defaults to `with_point`; a card without `photos_preview` previews its `photos`; the minimal
  card gets `''` for `title` and the `posted` strings and zeros in `stats`; `nearby` keeps the first park and the first
  school; `facts` keeps the first entry of each key. `posted.at` is an ISO time with a zone, written as ATOM, else
  `null`. A preview's photo count is legacy's count minus the dropped addresses; a card's is capped at the kept items;
  `0` without a media base.
- **`DistrictMatcher`.** Matches within the searched city (without one, every city; a name two cities share is
  `null`), strips a trailing «район» / «tumani» / «district» and the ending «ский»; an unavailable reference source
  gives `null`, never a failed card. The district read goes without the caller's stub scenario.

**Source, previews and the feed**

- **Previews (DEC-110, corrects "drops a number that answers `404` and logs one that is unavailable").** The whole batch
  shares one limiter wait of `legacy.previews.max_wait_ms` (4 000); a `404` number is omitted; any other failure makes
  the call `503 source_unavailable` after the previews that did arrive are cached; a legacy pause stays `403 paused`.
  A pooled read goes out in the second that gave it its place (`LegacyLimiter::tryAcquire()` and
  `waitForNextSecond()`; `acquire()` is built on them), so a batch never sends more than `legacy.rate.per_second` in a
  second. A batch has an overall deadline `legacy.previews.deadline_ms` (blank, 0 or invalid =
  a fixed 12 000 ms, below the Mini App's 15 s request timeout): after it no round, wait or retry starts, request
  timeouts are capped at the time left, and a read it cuts is `SourceUnavailable` without counting as a breaker
  failure. So previews alone never open the breaker for a hung legacy (the card and feed reads, with their full
  timeout, still do; a refused connection still counts through the 5 s connect timeout), and such a list answers `503`
  after about 12 s. A background batch (`SourceContext::system()`) waits within
  `legacy.previews.background_wait_ms` (2 000) instead of failing beyond the background share, never omits an item,
  and is `SourceUnavailable` when the budget is spent (its job backs off — no job exists yet, WP-46); with the share of
  2 places a second that is about six cold previews per call. `pool()` without a shared wait gives the whole call one
  read's `max_wait_ms`. Under other traffic a cold
  page of 20 can still answer `503`; the Mini App's retry then mostly succeeds from the card cache (DEC-110's record).
- `pool()` retries a read that failed in transit once, as a single call does, and sends every outcome through the one
  mapping of `LegacyClient`; single and pooled reads share one failure path, so a pooled contract error is counted
  too.
- **Feed cursor.** `o` counts every item of the legacy page passed over, excluded ones included, so a listing hidden
  between two pages cannot shift the walk. A HOMI cursor over 512 bytes, or with other types than `c` string|null and
  `o` 0…99, ends the list quietly; a legacy cursor over 256 bytes is a contract error naming `next_cursor`. When the
  top-up cap is reached, a page may be empty and still carry a cursor (the Mini App keeps loading; checked in review).
- Legacy's daily limit becomes `429 rate_limited` with `reason: "daily"` only on the full card; everywhere else `503`.
  A number at or above the native floor is `404` without a call.

**Overlay, refs and views** (stage C)

- **Owner fields on stub answers.** `OwnerOverlayData` (the seam of WP-84/85; `NullOwnerOverlayData` bound) returns
  `null` while nothing is bound, and then `owner.mine`, `owner.listing_id`, `contact.request` and `has_phone` stay as
  the driver gave them, so the WP-80 stub contract (10000008 `mine`, the requests of 10000002–06) is kept. The overlay
  always writes `owner.entry` (DEC-94), after any realtor mark. The seam's `null` (nothing bound: keep the driver's
  values) differs from `[]` (bound, the user has none); WP-84/85 keep that meaning.
- **A realtor mark of step 4 also sets `owner_verified: false`** on the summary and the card (the Mini App checks
  `owner_verified` before `is_owner` for its badge) and the card's `owner_label: null` (legacy's «Хозяин…», decided by
  the mark, not by the text), besides `is_owner: false` and the card's `owner.tier: null`.
- **The overlay reads a caller's sets once per request.** Card and preview read only `favorites`, `viewed` and
  `realtorAuthorKeys` (no exclusion sets: a card opened directly is answered anyway); `hiddenNumbers`,
  `blockedAuthorKeys` and `realtorAuthorKeys` are kept per `SourceContext` (a `WeakMap`) on the overlay, which is bound
  `scoped` (`ListingExclusion` resolves to the same instance; `ListingController` takes it per call). `rentedByVotes`
  and the `listing_refs` lookup take the page's numbers and run once per legacy page and once in the controller. A
  test that rebinds `OverlayData` after the overlay was resolved calls `app()->forgetScopedInstances()`; a console
  loop or a job uses a new `SourceContext` per unit of work.
- **Blocked and realtor authors reach only listings with a `listing_refs` row** — someone opened the full card through
  legacy. "An item that carries its own author key is checked directly" is not built: `ListingSummary` carries no key
  and the operator field does not exist yet (WP-02 point 6). `authorKeysOf()` limits the overlay's reads to the page.
- `preview=1` gets the flags and realtor marks and never records a view.
- `markGone` only updates an existing row (a card number is user input); `markMerged` creates a row for the asked
  number. **`remember()` never weakens a filed author key** (completes "`listing_refs` and author keys"): in one
  upsert, a new key replaces the stored one only when it is of the same kind, or the stored one is `source:` and the
  new one `phone:` or `legacy:` (`AuthorKey::replaces()`); a card without a key leaves the stored one; `author_kind`
  follows the key kept. A `phone:` key is not replaced by `legacy:` — switching on the operator field (WP-02 point 6)
  needs a migration rule for the filed rows. A card without a source or district keeps the stored channel and post (as
  a pair) and district, in `listing_refs` and `listing_views`. A card is filed once per listing, language and currency
  a minute (the card cache key), not once per listing. `first_seen_at`, `last_seen_at`
  and `gone_at` are nullable, the writers always set the first two; `views` defaults to 1.
- **`AuthorKey`** (corrects the table of "`listing_refs` and author keys" and the integrator's first rule). A blank or
  short (< 32 bytes) `AUTHOR_KEY_SECRET` never derives a `phone:` key (an HMAC with a short key could be reversed over
  the phone space), and a card that has a phone then gets **no** key — not `source:`, which would put every phone
  author of a channel under one key — with a warning at most once a minute; `source:<channel>` stays for a card
  without a phone, and a card whose `phone` is not one readable number (two numbers, a name with it, not a string)
  gets no key either. `e164()` reads the masker's separators and fullwidth digits. An operator value whose digits form a phone number (read by `e164()`, or nine digits in a row once
  separators are removed) counts as absent, so the card falls through to the phone rule; this also ignores a numeric
  operator id of eight digits or more. A nine-digit phone without `+` gets `998`; other
  values that are not 8–15 digits give no phone key; an operator value that is not printable ASCII or is longer than
  89 characters counts as absent, as does an `author.kind` that is not `[a-z_]{1,8}`.
- The overlay and the view recorder read `sources.native_stubs` on every call, so the switch covers the pager too.
- No existing test changed: every `favorite` and `viewed` value of the stub catalogue is `false`.

**Configuration** — new keys in `config/legacy.php` (blank env = default): `legacy.media.public_url`
(`LEGACY_MEDIA_PUBLIC_URL`), `legacy.media.hosts` (`LEGACY_MEDIA_HOSTS`, default the host of `base_url`),
`legacy.previews.max_wait_ms` (`LEGACY_PREVIEWS_MAX_WAIT_MS`, 4 000), `legacy.cache.*`, `legacy.feed.top_up_pages`,
`legacy.fields.author_key` (no env key until the operator names the field), `legacy.previews.background_wait_ms`
(`LEGACY_PREVIEWS_BACKGROUND_WAIT_MS`, 2 000), `legacy.previews.deadline_ms` (`LEGACY_PREVIEWS_DEADLINE_MS`, 12 000), `legacy.cache.fill_wait_ms` (`LEGACY_CACHE_FILL_WAIT_MS`, 1 000; 0 = never wait); `config/contacts.php`
`author_key_secret` (`AUTHOR_KEY_SECRET`).

**Files outside the list.** `LegacyValue`, `LegacyFeedCursor`, `LegacyDeadline`, `LinkGuard`, `ListingExclusion` (the seam the source
calls on each legacy page, bound to `ListingOverlay`), `OwnerOverlayData` / `NullOwnerOverlayData`,
`tests/Support/{LegacyFixtures,LegacyListingsHttp,FakeOverlayData}.php`, `LegacyFakeServerListingsTest`,
`LegacyPoolTest`, `SensitiveFramesTest` (every raw-data parameter of the translators, `AuthorKey`, `LinkGuard`,
`PhoneMasker` and `LegacyListingSource` carries `#[\SensitiveParameter]`, found by reflection),
`tests/Support/LegacyPhoneMaskerOfWp12.php`, `AuthorKeyTest`, `tests/Pgsql/ListingRowsRaceTest.php`; `PhotoUrlRewriterTest` is a unit test.

**Not run: step 9** (the six features on `legacy` locally, a walk of the Mini App on the fixtures): the developer's
database misses migrations of `main` and these two, and the local API serves the main checkout. The route tests on the
fixture server cover the six methods with `meta.source = legacy`, the shapes in three locales and the selectors that
reach legacy.

**Review.** Four reviews, each a subagent's report; the fixes are verified by the suites. Stage A: 1 high (the golden
test passed a renamed legacy key) and 4 medium (coercions silent, `owner_label` and links unchecked, real-looking
numbers in fixtures, an unbounded legacy cursor), fixed in `2a82366` … `1aebed2`. Stage B: 1 high (the masker of
WP-12 missed numbers after `*` or `/` and inside links, AM-121) and 3 medium (a pooled burst above the rate, no
single-flight on shared caches, DEC-110 under load — recorded in DEC-110), fixed in `1b95e4d` … `9894238`. Stage C:
3 medium (a realtor mark kept `owner_verified`, `remember()` weakened author keys, a short secret filed phone authors
under their channel) and 6 low, fixed in `f74611d`, `ec369f2`. A narrow review of those fixes: 1 high (the masker's
link cutting let a number glued to a link through — a regression against `main`), 1 medium (separators and glued
forms `main` missed too) and 4 low, and the verdict that a realtor mark clears `owner_label`; fixed in `9211434` …
`e804673`; the reviewer's probes, re-run by the integrator on `e804673`, then found 0 numbers the new masker leaves
that `main` masked, 0 idempotence failures and no slow input (540 KB in 0.01 s).

## Handoff

In review (#131, env keys #130). The development track needs nothing more for this package after the merge.

**For the production track, in this order** (no `source.*` flag changes; the defaults stay `stub` until WP-48):

1. **The two migrations before the code serves** — `create_listing_refs_table`, `create_listing_views_table` (new,
   empty). Staging and production serve stubs with `SOURCES_NATIVE_STUBS` unset, so from this merge on the feed, card
   and preview of every driver read `listing_views` and a full card read writes it. Locally and in the e2e job
   (`SOURCES_NATIVE_STUBS=true`) both are skipped.
2. **`AUTHOR_KEY_SECRET`** on staging and production: random, at least 32 bytes, different per environment, set before
   the card feature switches to `legacy`, never changed once keys are stored (a new secret orphans every block and
   vote filed under the old keys). Until it is set, a legacy card with a phone is filed under no author.
3. **The nginx location** of "Photos" on the media host of each environment, then `LEGACY_MEDIA_PUBLIC_URL` in the
   server env. On the CDN host (the origin of the Mini App's `NEXT_PUBLIC_CDN_URL`) the Mini App needs no change — its
   `img-src` already allows that origin (`frontend/app/lib/security/csp.ts`); on any other host, name it to the
   development track for `img-src`.
4. With the legacy key (WP-41's handoff) and the three points above on staging: the acceptance box "the six features
   set to `legacy` there, the feed, map and a card load inside Telegram with real photos; then the features are reset".

**For the operator (WP-02 point 6):** a stable author field must not be a phone number or a numeric id of eight
digits or more — `AuthorKey` ignores such a value (it would be a phone in disguise); ask for an opaque id. Switching
the field on later needs a migration rule for the `phone:` keys already filed (`ListingRefs` never replaces a `phone:`
key with a `legacy:` one).

**For the next packages:**
- WP-43 writes `contact()` and `translation()` (both `SourceUnavailable` here) and sets `contact.has_phone`.
- WP-44 binds the real `OverlayData`; `OwnerOverlayData`'s `null` (unbound: keep the driver's values) differs from
  `[]` (bound, nothing for this user). `ListingOverlay` is `scoped` and keeps its sets per `SourceContext`: a test that
  rebinds the data after the overlay was resolved calls `app()->forgetScopedInstances()`. `/history` and
  `DELETE /history` are still stubs, so `listing_views` fills but cannot be cleared yet.
- WP-46 (radar polling): a background preview batch waits within `legacy.previews.background_wait_ms` (2 s) on the
  background share (2 places a second) — about six cold previews per call; its job backs off on `SourceUnavailable`.
  `GET /radars?include=previews` spends a 4 s wait per radar's batch.
- Open questions for the operator or the next intake: can `contact_url` carry a phone (the rule is defensive); which
  legacy hosts send absolute photo addresses (RES-001 names two); the time zone of `posted_at`; how the Mini App
  should render a masked link (`wa.me/+998 ** *** ** 21`, `instagram.com/p/C********90/`) inside a description.
- WP-48 (the switch to `legacy`): until then the servers record views of **stub** listings (`100001` …) in
  `listing_views`; clear those rows at the switch (or before it), or they mark real legacy listings with the same
  numbers as viewed. `listing_refs` holds only cards read through the legacy driver.
- KI-72: a number written with `/` or `,` between its digit groups (`+998/90/123/45/67`) is not masked — neither by
  WP-12's masker; allowing those separators after a literal `+998` only (where `3/9` and `1,200,000` cannot collide)
  is the candidate fix, guarded by the property tests.
