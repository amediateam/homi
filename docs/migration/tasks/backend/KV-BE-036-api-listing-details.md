# KV-BE-036 — API-008 `GET /api/listings/:id`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-LISTING-001, F-MAP-003, F-SHARE-002, F-HISTORY-001 |
| Dependencies | KV-BE-018, KV-BE-034, KV-BE-035, KV-BE-010 (and `listing_views` of KV-DB-010 for view recording) |

## Goal

`GET /api/listings/:id` serves the full listing card for a listing number (or the survivor of a merged number), the
`ListingPreview` minimum with `?preview=1`, `404 {"detail":"Not Found"}` for anything unknown, and records the view of a
full open in the user's history.

## Legacy reference

- API-008 (`08` §2): `$KVADRO_ROOT/docs/api.md:111`, `:589-608` (preview minimum `:601-604`, numeric id `:606-608`);
  `$KVADRO_ROOT/docs/about.md:156-158`.
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:10-17`, `$KVADRO_ROOT/demo/app/src/main.jsx:38` (prefetch for deep
  links), `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:47-58` (switch to the returned id),
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:115-116` (404 text), `$KVADRO_ROOT/demo/app/src/features/map/MapSelectionCard.jsx:29-36`
  (`preview=1`, errors not shown), `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:17-25` (ids from `l_<id>`).
- Mocks: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:76-104`, `:145-147`, `:193-196`; changelog
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:12`, `:16`.
- Rules: BR-API-048, BR-API-095, BR-API-119, BR-DATA-002, BR-DATA-019; LB-API-011, LB-API-012; Q-API-023, Q-API-035.

## Implementation

1. Read `.claude/skills/laravel-best-practices/` and `.claude/skills/testing-best-practices/`.
2. `php artisan make:controller Legacy/ListingController --no-interaction` (`show`); route `GET api/listings/{id}` with
   `auth:tma`, `legacy.access`, `throttle:legacy-listing` (120/min); `{id}` is a raw string parsed by
   `ListingNumber::fromLegacy()` (positive integer < 2^53; anything else → `404`).
3. Resolve with `ListingNumberResolver` (KV-BE-018): a live number → its listing; an alias → the survivor (response `id`
   = the survivor's `number`, the client switches without a second request, BR-API-048).
4. Visibility: `active` and `withdrawn` within 90 days → `200` (withdrawn carries `status_text`, Q-API-023 spec);
   PII-purged stubs, `taken_down`, `merged` tombstones without survivor, unknown → `404 {"detail":"Not Found"}` — one
   code path, so foreign-to-nobody and unknown look identical.
5. `?preview=1` → `ListingPreviewSerializer` output only (exactly `ListingPreview`, LB-API-012); no view recording, no
   phone, no quota count.
6. Full open → `ListingDetailsService` + `ListingDetailsSerializer` (KV-BE-034) with the `ContactDisclosure` decision
   (KV-BE-035); then record the view: `PersonalListService::recordView(User, Listing)` upserts `listing_views`
   (`last_viewed_at = now`, `view_count + 1`) and increments `listings.views_count` (Q-API-035 spec: full open records,
   preview does not). The list and clear endpoints of history are KV-BE-039.
7. Writes after the response body is built and inside one short transaction; a failure to record never fails the read.

## Files

- `backend/app/Http/Controllers/Legacy/ListingController.php` (new); `backend/routes/legacy.php`
- `backend/app/Services/Engagement/PersonalListService.php` (`recordView()`; created here if KV-BE-038 has not landed)
- `backend/tests/Feature/LegacyApi/Api008ListingTest.php` (new)

## API contract

- `GET /api/listings/<number>` → `200 ListingDetails` (KV-BE-034); `id` is a JSON integer and may differ from the
  requested number (merged survivor).
- `GET /api/listings/<number>?preview=1` → `200 ListingPreview` (at least `photos_preview`, `title`/`short_title`,
  `favorite`, `center_km`, `metro_km`, `median_delta`).
- Errors: unknown, purged, taken down, non-numeric, zero, negative or ≥ 2^53 id → `404 {"detail":"Not Found"}` (client:
  «Объявление не загрузилось», no retry); `401`, `403 <reason>`, `429 {"detail":"rate_limited"}` + `Retry-After`;
  other failures → `500 {"detail":"internal_error"}` (client: error state with «Повторить»).
- Headers: `Cache-Control: private, no-store`.

## Business rules

- Kept: BR-API-048 / BR-DATA-019 (merged id answers with the survivor), BR-API-095 (opening records history and
  `viewed`), BR-API-119 / BR-DATA-002 (integer ids from deep links keep working).
- Defect fixes `APPROVED`: LB-API-011 (integer `id`), LB-API-012 (`preview=1` = exactly `ListingPreview`).
- Q-API-023 and Q-API-035 spec-tested; DEV-007 `PROPOSED` (phones) handled in KV-BE-034/035.

## Acceptance criteria

- Fixtures of rent, daily and sale × five property types return `200` with every strict key; `id` is a JSON number.
- An alias number returns the survivor with the survivor's `id` (`15` §3.7 #7).
- `?preview=1` contains exactly the `ListingPreview` keys and records nothing.
- A full open adds the listing to `GET /api/history` once (moved to the top on re-open) and sets `viewed: true` in later
  previews.
- Unknown, purged and taken-down numbers answer byte-identical `404` bodies with the same query count.

## Tests

`backend/tests/Feature/LegacyApi/Api008ListingTest.php` (KV-QA-002 fixtures, KV-QA-004 harness):

- Dataset `deal × type` → `assertLegacyShape('ListingDetails')`; `id_is_json_integer`.
- `merged_alias_returns_survivor_with_own_id`; `alias_chain_resolves_to_final_survivor`.
- `preview_returns_exact_preview_shape`; `preview_does_not_record_view_or_count_quota`.
- `full_open_records_view_once_and_moves_to_top`; `views_count_incremented`.
- Dataset `not_found`: unknown, purged, taken down, `abc`, `0`, `-1`, `9007199254740993` → identical `404` bodies
  (`15` §3.1 #8 query-count equality).
- `withdrawn_within_90_days_returns_status_text` (spec, Q-API-023).
- `phone_implies_call_url`; `quota_suppression_keeps_shape` (with KV-BE-035 test thresholds).
- Auth/access: no auth `401`; gate dataset `403`; `blocked_user_gets_no_phone` (SEC-REQ-006, `15` §3.1 #10).
- `limiter_121st_request_per_minute_is_429`.

## Edge cases

- Deep link `startapp=l_<id>` for a merged listing: prefetch URL uses the old number; the response carries the new id.
- Listing withdrawn between feed and open → `200` with `status_text` (within 90 days).
- Concurrent opens of the same listing by one user → one `listing_views` row (upsert on the composite key).
- Translation state is client-side; nothing to do server-side.

## Security

- SEC-REQ-006 (gate; `blocked` never sees a phone), SEC-REQ-014 (per-user flags; history row of the requester only),
  SEC-REQ-017 (id parsing), SEC-REQ-027 (`legacy-listing` 120/min), SEC-REQ-028 (via KV-BE-035), SEC-REQ-033.
- Sequential ids are public by design (CF-003); enumeration is contained by limits and the quota, not by hiding numbers.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for F-LISTING-001, F-MAP-003 and F-SHARE-002, docs and
the feature rows in 09 updated, PR reviewed by the other developer.
