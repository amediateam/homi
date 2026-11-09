# KV-BE-032 — API-005 `GET /api/feed/count` and API-006 `GET /api/feed/flow`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-FILTER-005, F-COMPAT-002 |
| Dependencies | KV-BE-023, KV-BE-016, KV-BE-021 (and the `legacy-reads` limiter of KV-BE-010; Redis per ADR-0005) |

## Goal

The live match count and the weekly flow estimate answer within the client's debounce budget on every filter change:
`{count}` for the filter query, and `{week, days, options[]}` with `days ≥ 1` and relaxation options that carry complete
25-key filters; both cached briefly by a normalised filter key.

## Legacy reference

- API-005: `$KVADRO_ROOT/docs/api.md:108`, `:524-534`; client `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:100-103`,
  `$KVADRO_ROOT/demo/app/src/features/filters/useLiveFeedStats.js:12-26` (250 ms debounce, abort),
  `$KVADRO_ROOT/demo/app/src/features/radar/useRadarPreviews.js:52`; mock `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:119`.
- API-006: `$KVADRO_ROOT/docs/api.md:109`, `:536-556`; client `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:110-113`,
  `$KVADRO_ROOT/demo/app/src/features/filters/useLiveFeedStats.js:34-45` (500 ms), `useRadarPreviews.js:59`,
  `$KVADRO_ROOT/demo/app/src/app/useFollowNudge.js:63`; mocks `mocks.mjs:120`, `:160-164`,
  `$KVADRO_ROOT/demo/app/tools/parity/mocks-filters.mjs:33-45` (option codes `price`, `rooms`).
- Rules: BR-API-040, BR-API-039, BR-API-087, BR-API-142; LB-API-007, LB-API-036, LB-API-038, LB-API-052; DEV-021;
  CF-018.

## Implementation

1. Read `.claude/skills/laravel-database-optimization/` (caching, count queries) and `.claude/skills/laravel-best-practices/`.
2. `ListingSearchService::count(SearchFilters, User): int` over `query()` of KV-BE-023 (no sort, no limit; `count(*)`).
3. `php artisan make:class Services/Radar/FlowEstimator --no-interaction` (Radar module so M4 extends it for radar
   mutations): `estimate(SearchFilters, User): FlowResult` — `days` = window length from config (`flow.window_days`,
   7; never below 1), `week` = matching listings with `first_seen_at` inside the window; `options` from a list of
   relaxation candidates (raise `price_max` one preset step, widen `rooms_*` by one, drop `districts`/`zones` to the
   whole city, include realtors `owner=any`), each evaluated with `count`; an option is offered only when it adds
   listings; each carries `code`, `label` and `rate` (strings through the display formatter, KV-BE-021), `count` and
   the complete `filters` (`SearchFilters::toLegacyArray()`). Selection rules are UNVERIFIED — spec-tested.
4. Cache: `Cache::remember()` on Redis with key `feed:{count|flow}:{canonicalHash}:{locale}:{exclusionVersion}` and TTL
   from config (30 s count, 60 s flow). `exclusionVersion` = a per-user counter bumped by hide/unhide/block/unblock
   (written by KV-BE-040 / KV-BE-041; until then a constant) so per-user exclusions never leak between users; users
   without exclusions share the anonymous key.
5. `FeedController@count` and `FeedController@flow` (`App\Http\Controllers\Legacy\FeedController`), routes
   `GET api/feed/count`, `GET api/feed/flow` with `auth:tma`, `legacy.access`, `throttle:legacy-reads`; requests via
   `LegacyFilterRequest` (no `limit`, `sort`, `cursor`).
6. Aborted requests: set a statement timeout for these queries (config, e.g. 5 s) so a dropped connection does not keep
   PostgreSQL busy (LB-API-052).

## Files

- `backend/app/Services/Listings/ListingSearchService.php` (`count()`)
- `backend/app/Services/Radar/FlowEstimator.php`, `backend/app/Domain/Radar/FlowResult.php` (new)
- `backend/app/Http/Controllers/Legacy/FeedController.php` (`count`, `flow`); `backend/routes/legacy.php`;
  `backend/config/search.php` (TTLs, window)
- `backend/tests/Feature/LegacyApi/Api005FeedCountTest.php`, `backend/tests/Feature/LegacyApi/Api006FeedFlowTest.php` (new)

## API contract

- API-005: `GET /api/feed/count?<FilterQuery>` → `200 {"count": number}`.
- API-006: `GET /api/feed/flow?<FilterQuery>` → `200 {"week": number, "days": number, "options": [{"code": string,
  "label": string, "rate": string, "count": number, "filters": SearchFilters}]}` — `days ≥ 1` always; `options` may be
  `[]`; every `options[].filters` has all 25 keys with arrays non-null and `types` valid for its `deal`. `count` is not
  read by the client but is emitted (`08` §1.8 unread list).
- Errors: `422 {"detail":"invalid_<field>"}`, `401`, `403 <reason>`, `429`; the client ignores errors of both
  endpoints and keeps the previous value. `Cache-Control: private, no-store`.

## Business rules

- Kept: BR-API-040 (`week`/`days`, options with full filters), BR-API-039 (25 keys), BR-API-087 (flow option codes are
  sent back as `relaxed`, never to `/relax`), BR-API-142 (no client cache — the server cache absorbs repeats).
- Defect fixes `APPROVED`: LB-API-007 (`days ≥ 1`), LB-API-052 (short-TTL cache by normalised key), LB-API-038 (a
  30-request radar-tab burst must pass — limiter of KV-BE-010).
- DEV-021 `PROPOSED` (one flow vocabulary for app, bot, landing) — wording of `rate`/`label` behind the formatter
  catalogue; test `->todo('DEV-021 PROPOSED')`.
- LB-API-036 (one relax model) applies to v1 only; the legacy flow options stay as they are.

## Acceptance criteria

- `count` equals the number of items reachable through `/api/feed` pagination for the same query (`15` §3.7 #1).
- `days ≥ 1` and `week ≥ 0` for every query, including an empty city.
- Applying an option's `filters` to `/api/feed/count` returns more results than the original query (`15` §3.7 #8).
- A repeated identical request within the TTL runs no database query; two users with different hidden lists never get
  each other's count.

## Tests

- `Api005FeedCountTest`: `count_equals_paginated_feed_size` (coverage dataset), `no_matches_returns_zero`,
  `cached_within_ttl_no_query`, `hidden_listing_changes_count_only_for_owner`, auth/access dataset, `deal_foo_is_422`.
- `Api006FeedFlowTest`: `days_at_least_one_and_week_non_negative`, `options_carry_25_keys_with_non_null_arrays`
  (`assertLegacyShape('FlowResponse')`), `option_filters_increase_count`, `wide_filters_return_no_options`,
  `types_in_options_valid_for_deal`, `labels_localised_ru_uz_en`, `->todo('DEV-021 PROPOSED')`.
- Burst (`15` §5.7): a recorded radar-tab profile of 10 radars × (feed, count, flow) passes without `429`.
- `pgsql` group: `count_with_polygon_matches_feed`.

## Edge cases

- Filters that match nothing in the window but something overall → `week: 0`, options may still be offered.
- City without medians: `below_median` relaxation is never proposed.
- Literal `undefined` query values (KV-BE-017).
- Cache stampede on a popular default query — `Cache::lock`-guarded recompute or `flexible()`.

## Security

- SEC-REQ-017 (validation), SEC-REQ-014 (exclusion version per user — no cross-user cache leak), SEC-REQ-027
  (`legacy-reads`), SEC-REQ-033 (`no-store`).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4) for F-FILTER-005 and the cache part of
F-COMPAT-002, docs and the feature rows in 09 updated, PR reviewed by the other developer; the PR notes that M4 extends
`FlowEstimator` for radar mutation options.
