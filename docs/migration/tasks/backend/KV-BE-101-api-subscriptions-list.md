# KV-BE-101 — `Subscription` legacy serializer and API-018 `GET /api/subscriptions`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-RADAR-001 |
| Dependencies | KV-BE-100, KV-BE-106 (`hidden` count), KV-BE-005 (legacy route group), KV-BE-007 (`tma` guard), KV-BE-013 (frozen contract of API-018…API-023), KV-QA-002 / KV-QA-004 (fixtures, harness); Q-API-013, Q-API-032 |

## Goal

The radar tab of the unchanged legacy Mini App lists the user's radars — the ones created in the app and in the bot —
as a bare JSON array of `Subscription` objects whose `filters` always carry all 25 keys with valid codes, and one
serializer produces that object for every radar response (API-018 … API-021).

## Legacy reference

- `$KVADRO_ROOT/docs/api.md:368-378` (`Subscription`), `:721-729` (`GET /api/subscriptions` → `Subscription[]`),
  `:216` (filter objects from the server must be complete), `:402-414` (unread fields).
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/subscriptions.js:5`, `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:58`,
  `:193-195` (error state), `$KVADRO_ROOT/demo/app/src/features/filters/model.js:45-63` (`sameFilters` ignoring
  `posted_days`), `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:95` (re-read before every create).
- Mock: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:105-107` (`subs`, `hidden: 2`).
- Audit IDs: API-018, ENT-008, BR-API-039, BR-API-091, BR-APP-047, BR-APP-063, BR-DATA-009; LB-API-005, LB-API-006,
  LB-API-038, LB-DATA-004; DEV-022 (label wording, client only).

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (resources/serialisation) and KV-BE-028 (serializer conventions).
2. `php artisan make:class Http/Serializers/Legacy/SubscriptionSerializer --no-interaction`: `toArray(Radar, int
   $hidden): array` → `{"id": <number>, "active": bool, "mode": "instant"|"digest", "filters": {25 keys},
   "hidden": int}`. `id` is the radar `number` as a JSON integer. `filters` comes from `filters_v1` re-normalised
   through `SearchFilters::fromStored()->toLegacyArray()` so a migrated row with `zone` or a missing key still comes out
   complete (LB-API-005, LB-DATA-004); arrays never `null`; `types` filtered to the codes valid for the radar's `deal`
   and the legacy dictionary (LB-API-006 — an unknown code would crash the radar title). Unread legacy fields (`title`,
   `new_count`, `finds`, `created_at`, `hidden_count`) are not emitted.
3. `hidden` from `RadarHideRuleService::hiddenCounts(Collection $radars)` (KV-BE-106), batched for the whole list
   (no N+1).
4. `App\Http\Controllers\Legacy\SubscriptionController@index`: `$request->user()->radars()->orderBy('created_at')
   ->orderBy('number')->get()`; returns the bare array (`LegacyController::json($list)`, `[]` when empty).
   Route `GET api/subscriptions` in `routes/legacy.php` with `auth:tma`, `legacy.access`, `throttle:legacy-reads`.
5. Contract test with the KV-QA-004 harness and the API-018 golden fixture; the radar-tab burst profile of KV-BE-010
   (30 requests) includes this endpoint.

## Files

- `backend/app/Http/Serializers/Legacy/SubscriptionSerializer.php` (new)
- `backend/app/Http/Controllers/Legacy/SubscriptionController.php` (new, `index`); `backend/routes/legacy.php`
- `backend/tests/Feature/LegacyApi/Api018SubscriptionsListTest.php` (new)

## API contract

- `GET /api/subscriptions` (`tma`) → `200 [Subscription, …]` — bare array, `[]` when the user has none.
- `Subscription`: `{"id": int, "active": bool, "mode": "instant"|"digest", "filters": SearchFilters (25 keys, arrays
  non-null), "hidden": int}`.
- Errors: `401 {"detail":"unauthorized"}`, `403 {"detail":"<reason>"}`, `429 {"detail":"rate_limited"}`;
  `Cache-Control: private, no-store`.

## Business rules

- Kept: BR-DATA-009 / BR-API-039 (25 keys), BR-API-091 (`hidden` = suppressed by the radar's hide rules), BR-APP-047
  («Скрыто: N» only when `hidden > 0` — client).
- Defect fixes `APPROVED`: LB-API-005 (complete filter objects), LB-API-006 (no unknown enum codes on output),
  LB-DATA-004 (`zone` → `zones` on read as well as in the migration).
- Order of the list: legacy order unknown — creation order, spec-tested.

## Acceptance criteria

- A radar created through the bot path of `RadarService` and one created through API-019 both appear with identical
  shapes (`15` §3.7 #6).
- Every `filters` object has exactly the 25 keys of `08` §1.7; `types` are valid for its `deal`.
- Another user's radars never appear; an empty list is `[]`, never `null` or an empty `200`.

## Tests

- `Api018SubscriptionsListTest`: `returns_bare_array`, `empty_list_is_empty_array`, `filters_have_25_keys_each`
  (`assertLegacyShape('Subscription')`), `migrated_zone_radar_comes_back_with_zones`, `unknown_type_code_filtered_out`,
  `hidden_count_from_hide_rules`, `foreign_radars_not_listed`, `bot_and_app_radars_identical_shape`,
  `ids_are_json_integers`, auth/access dataset (`401`, five `403` reasons), `no_n_plus_one_for_ten_radars`
  (query count).
- Contract: API-018 golden fixture through KV-QA-004.

## Edge cases

- A radar whose `deal` changed in a migration and whose `types` became invalid → only the valid types are emitted; if
  none remain, `['apartment']` (the legacy default) is emitted and the row is logged for review.
- A radar with a polygon stored as `geography` → `filters.polygon` comes from `filters_v1` (5-decimal `[lat, lon]`
  pairs, open ring), never re-derived from the geometry.
- Ten radars × feed/count/flow previews (LB-API-038) are client calls; this endpoint stays one query plus the batched
  hidden count.

## Security

- SEC-REQ-014 (owner-scoped list), SEC-REQ-018 (no markup in server strings — none emitted here), SEC-REQ-033
  (`no-store`), SEC-REQ-027 (`legacy-reads` limiter).

## Definition of done

Tests green (`make ci-backend`), contract harness row API-018 green, parity gate items ticked (`15` §4) for F-RADAR-001
(backend part), docs and the feature row in `09` updated, PR reviewed by the other developer.
