# KV-BE-031 — API-004 `GET /api/feed` with keyset cursor and sorts

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-FEED-001, F-FILTER-003, F-FILTER-001 |
| Dependencies | KV-BE-017, KV-BE-023, KV-BE-028; KV-DB-004 (cursor ADR) (and the `legacy-reads` limiter of KV-BE-010; the partial feed indexes of KV-DB-008) |

## Goal

`GET /api/feed` returns pages of 20 `ListingPreview` items for the 25-key filter query, in the requested sort, with an
opaque keyset cursor whose `null` value is the only end signal; pages never repeat or skip an item while new listings
arrive.

## Legacy reference

- API-004 (`08` §2): `$KVADRO_ROOT/docs/api.md:107`, `:188-225` (query), `:355-366` (`FeedPage`), `:507-522`;
  `$KVADRO_ROOT/docs/about.md:187-192`.
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:10-66` (query building), `:75-93` (`limit=20`, `sort`, `cursor`),
  `$KVADRO_ROOT/demo/app/src/main.jsx:25` (prefetch), `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:36-42`,
  `:57-61`, `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:88` (403), `$KVADRO_ROOT/demo/app/src/features/sort/SortSheet.jsx:17-33`,
  `$KVADRO_ROOT/demo/app/src/features/radar/useRadarPreviews.js:42`.
- Mocks: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:118`, `$KVADRO_ROOT/demo/app/tools/parity/mocks-filters.mjs:32`,
  `:81-82` (500 and 403 on page 2).
- Rules: BR-API-022, BR-API-024…037, BR-API-014; LB-API-004, LB-API-005, LB-API-006, LB-API-009; CF-004; Q-API-008,
  Q-API-010, Q-API-036.

## Implementation

1. Read `.claude/skills/laravel-database-optimization/` and `.ai/agents/postgis-geo-engineer.md` (keyset pagination,
   partial indexes, `EXPLAIN`).
2. `php artisan make:class Domain/Listings/FeedCursor --no-interaction`: encode/decode base64url JSON
   `{"v":1,"s":"<sort>","k":[<sort key>,<number>],"f":"<first 8 hex of the canonical filter hash>"}`; decoding validates
   version, sort equality with the request, key types, and `f` against the request's filter hash; any mismatch →
   `LegacyValidationException('cursor')` → `422 {"detail":"invalid_cursor"}`.
3. `php artisan make:enum Enums/Search/Sort --no-interaction`: `New`, `Cheap`, `Expensive`, `Deal`, `Center`, `Ppm` with
   their order columns: `new` = `first_seen_at desc, number desc` (default when `sort` is absent); `cheap` /
   `expensive` = `price_usd_cents asc|desc`; `deal` = `listing_market.median_delta asc`; `center` = `center_km asc`;
   `ppm` = USD price per m² asc (sale only); tie-breaker always `number` in the same direction; rows with a `null` sort key
   last (`NULLS LAST`) and encoded in the cursor.
4. `ListingSearchService::page(SearchFilters, Sort, ?FeedCursor, int $limit, User)` builds the keyset `WHERE (key,
   number) < (:k, :n)` (row comparison) over `query()` of KV-BE-023 and fetches `limit + 1` rows to decide `next_cursor`.
5. Sort availability (BR-API-024): `deal` only with a single `apartment` type, non-daily, city with `median: true`;
   `center` only for cities with zones; `ppm` only for `sale`. An unavailable sort → `422 {"detail":"invalid_sort"}`
   (spec; the legacy client never sends one); `sort=new` explicitly is accepted.
6. `limit`: default 20; values 1…50 accepted, anything else → `422 {"detail":"invalid_limit"}` (SEC-REQ-017; Q-API-007
   spec).
7. `php artisan make:controller Legacy/FeedController --no-interaction` (`index`; `count`/`flow` added by KV-BE-032);
   `GET api/feed` with `auth:tma`, `legacy.access`, `throttle:legacy-reads`; request = `LegacyFilterRequest` (KV-BE-017).
8. Response through `ListingPreviewSerializer` (KV-BE-028): `{"items": [...], "next_cursor": "<opaque>"|null}`; `total`
   not emitted (unread).
9. Verify with `EXPLAIN` on PostgreSQL that each sort uses its partial index; record plans in the PR.

## Files

- `backend/app/Domain/Listings/FeedCursor.php`, `backend/app/Enums/Search/Sort.php` (new)
- `backend/app/Services/Listings/ListingSearchService.php` (`page()`)
- `backend/app/Http/Controllers/Legacy/FeedController.php` (new); `backend/routes/legacy.php`
- `backend/tests/Unit/Listings/FeedCursorTest.php`, `backend/tests/Feature/LegacyApi/Api004FeedTest.php`,
  `backend/tests/Feature/Pgsql/FeedKeysetTest.php` (new)

## API contract

Request: `GET /api/feed?` + `FilterQuery` (`08` §1.7: `city`, `deal`, `owner`, repeated `types`/`districts`/`renovation`/
`appliances`/`zones`, `rooms_min`, `rooms_max`, `price_min`, `price_max` (USD), `area_min`, `area_max`, `posted_days`,
`furnished`, `floor_not_first`, `floor_not_last`, `market`, `near_metro`, `below_median`, `tenant`, `pets`, `pets_only`,
`polygon`) + `limit=20` (always) + `sort` (`cheap|expensive|deal|center|ppm`; absent = newest) + `cursor` (page 2+).
Response `200 FeedPage`: `{"items": ListingPreview[], "next_cursor": string|null}` — `next_cursor` strictly JSON `null`
on the last page (`!`). Errors: `422 {"detail":"invalid_<field>"}` (e.g. `deal=foo`, bad `polygon`, `invalid_cursor`),
`401`, `403 {"detail":"<reason>"}` (client shows «Нет доступа»), `429 {"detail":"rate_limited"}`, `500`. Headers:
`Cache-Control: private, no-store`; never an empty `200`.

## Business rules

- Kept: BR-API-022 (cursor, `limit=20`, `null` end), BR-API-024 (sort values and availability), BR-API-025…037 (filter
  semantics, via KV-BE-023), BR-API-014 (403 for gated users).
- Defect fixes `APPROVED`: LB-API-004 (`next_cursor` always present), LB-API-009 (strict preview keys), LB-API-005 /
  LB-API-006 (normalised filters, known enums).
- Q-API-010 (sort definitions and tie-break) and Q-API-008 (cursor semantics) are spec-tested.
- Hidden listings and blocked authors excluded server-side (LB-API-041 via KV-BE-023; Q-API-036 spec).

## Acceptance criteria

- Following `next_cursor` to the end yields every matching listing exactly once (no duplicate, no gap) for each sort,
  also when listings are inserted between page requests.
- The last page has `next_cursor: null`; an empty result is `{"items": [], "next_cursor": null}`.
- `types=apartment&types=house` and `zones=center&zones=near_center` apply both values.
- A cursor from another sort or other filters → `422 {"detail":"invalid_cursor"}`.

## Tests

`backend/tests/Feature/LegacyApi/Api004FeedTest.php` (KV-QA-002 fixtures, KV-QA-004 harness):

- `default_filters_return_at_most_20_items_with_strict_keys`; `last_page_next_cursor_is_null`
  (fixture `last-page-next-cursor-null`); `empty_result_shape`.
- `pagination_has_no_duplicates_or_gaps` (dataset over the six sorts).
- `repeated_params_all_applied` (`types`, `zones`); each filter key in isolation (dataset from `08` §1.7, coverage dataset
  KV-QA-005); `near_metro_absent_means_not_applied`; `furnished_false_is_applied`.
- `polygon_3_and_40_vertices_accepted`; `polygon_2_and_41_vertices_422` (`pgsql` group for the spatial cases).
- Negative: `deal_foo_is_422_with_string_detail`, `limit_0_and_1000_are_422`, `tampered_cursor_is_422`,
  `cursor_of_other_filters_is_422`.
- Auth/access: no auth → `401`; gate states → `403 <reason>` (`15` §3.1 #10–#12).
- Consistency (`15` §3.7 #1): same filters → feed id set = map id set ∪ listings without coordinates; size = `count`.
- `Feature/Pgsql/FeedKeysetTest.php`: `new_listings_inserted_between_pages_do_not_shift_results`;
  `explain_uses_partial_index_for_new_sort`.
- Hidden/blocked: `hidden_listing_excluded_for_owner_only` (users A and B).

## Edge cases

- `cursor` given with a different `limit` — allowed (cursor does not bind the limit).
- Listings with equal sort key (same price) — tie-break by `number` keeps pages stable.
- `null` sort keys (`center_km` unknown) at the end of `center` sort.
- Literal `undefined` values from the legacy client handled per KV-BE-017.
- A listing withdrawn between pages: it may be missing from later pages; no duplicate is ever produced.

## Security

- SEC-REQ-017 (validation, `limit` cap, cursor validated), SEC-REQ-006, SEC-REQ-014 (per-user flags and exclusions only
  for the requester), SEC-REQ-027 (`legacy-reads` 300/min).
- The cursor carries no personal data and cannot widen the filter (the `f` hash check).

## Definition of done

Tests green (`make ci-backend`, plus the `pgsql` group), parity gate items ticked (15 §4) for F-FEED-001 and
F-FILTER-003, the cursor ADR clause (KV-DB-004) referenced, `EXPLAIN` plans attached to the PR, docs and the feature
rows in 09 updated, PR reviewed by the other developer.
