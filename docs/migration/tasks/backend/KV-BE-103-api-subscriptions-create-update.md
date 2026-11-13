# KV-BE-103 — API-019 `POST` and API-020 `PUT /api/subscriptions`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-RADAR-002, F-RADAR-003, F-RADAR-008 |
| Dependencies | KV-BE-100, KV-BE-101, KV-BE-102, KV-BE-017 (legacy request parsing), KV-BE-010 (`radar` limiter), KV-QA-004 (harness); Q-API-031, Q-API-034 |

## Goal

The legacy Mini App creates and edits radars on HOMI: `POST /api/subscriptions` with `{filters, entry, relaxed?}` and
`PUT /api/subscriptions/:id` with `{filters, relaxed?}` answer a byte-compatible `SubscriptionMutationResult`, refuse
with `409 no_chat` before any change when the bot cannot write to the user, and with a non-`no_chat` `409` at the radar
limit.

## Legacy reference

- `$KVADRO_ROOT/docs/api.md:731-754` (POST body, client re-read, `409` at the limit), `:756-767` (PUT), `:76-85`
  (`409` semantics), `:382-400` (result).
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/subscriptions.js:13-36`, `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:94-175`
  (re-read, `entry` values, toasts), `$KVADRO_ROOT/demo/app/src/lib/chatAccess.js:27-54` (write access and one repeat),
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:310`, `:582`, `:599`, `:631` (`entry` = `few`, `filters`, `empty`, `prompt`).
- Mock: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:158-172` (`radarEditApi`).
- Audit IDs: API-019, API-020, BR-API-076, BR-API-077, BR-API-078, BR-API-080, BR-API-086, BR-API-087, BR-API-092,
  BR-APP-041, BR-BOT-099; LB-API-013, LB-API-014, LB-API-033, LB-API-034, LB-API-035, LB-API-037; DEV-004, DEV-009.

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (form requests) and KV-BE-017 (`LegacyFilterRequest`,
   `failedValidation` → `422 {"detail":"invalid_<field>"}`).
2. `php artisan make:request Legacy/StoreSubscriptionRequest --no-interaction` and `Legacy/UpdateSubscriptionRequest`:
   JSON body; `filters` object built into `SearchFilters` by the shared normaliser (KV-BE-016; SEC-REQ-017 — unknown
   keys ignored, `zone` accepted as `zones`, LB-API-028); `entry` ∈ `filters`, `empty`, `few`, `prompt` (required on
   POST; invalid → `422 invalid_entry`); `relaxed` optional string `^[a-z_]{1,32}$` (analytics only, LB-API-035);
   PUT has no `entry`. A body without `filters` → `422 invalid_filters`.
3. `SubscriptionController@store`: `RadarService::create($user, $filters, new RadarCreateContext(entry, relaxed,
   'legacy'))` → `MutationResultBuilder` (KV-BE-102) → `{"subscription": SubscriptionSerializer, "starter": n,
   "options"?: [...], "relaxed": [...]}`. `existing_active` (twin) answers `200` with the same shape and `starter: 0`
   (the old client only reaches this after its own twin check failed — race or bot-created twin).
4. `SubscriptionController@update`: radar resolved as `$user->radars()->where('number', $id)->firstOrFail()` — a
   foreign, unknown or malformed id → `404 {"detail":"Not Found"}` exactly like unknown (SEC-REQ-014); then
   `RadarService::update()`; result as above. Path id: positive integer < 2^53, else `404`.
5. Routes in `routes/legacy.php`: `POST api/subscriptions`, `PUT api/subscriptions/{number}` with `auth:tma`,
   `legacy.access`, `throttle:legacy-radar` (30/min, SEC-REQ-027).
6. Error mapping through the KV-BE-005 renderer: `NoChatException` → `409 {"detail":"no_chat"}`;
   `RadarLimitReached` → `409 {"detail":"subscription_limit"}`; `RadarDuplicate` → `409 {"detail":"duplicate"}`.
7. Contract tests with KV-QA-004 (API-019, API-020 golden fixtures) and the legacy OpenAPI document of KV-BE-013.

## Files

- `backend/app/Http/Requests/Legacy/StoreSubscriptionRequest.php`, `UpdateSubscriptionRequest.php` (new)
- `backend/app/Http/Controllers/Legacy/SubscriptionController.php` (`store`, `update`); `backend/routes/legacy.php`
- `backend/tests/Feature/LegacyApi/Api019SubscriptionCreateTest.php`, `Api020SubscriptionUpdateTest.php` (new)

## API contract

- `POST /api/subscriptions` body `{"filters": SearchFilters, "entry": "filters"|"empty"|"few"|"prompt",
  "relaxed"?: string}` → `200 SubscriptionMutationResult`.
- `PUT /api/subscriptions/:id` body `{"filters": SearchFilters, "relaxed"?: string}` → `200 SubscriptionMutationResult`.
- `SubscriptionMutationResult` = `{"subscription": Subscription, "starter": int, "options"?: [{"code", "label",
  "rate", "count"}], "relaxed": [{"text": string}]}` — `relaxed` always present.
- Errors: `409 {"detail":"no_chat"}` (before any change), `409 {"detail":"subscription_limit"}`, `409
  {"detail":"duplicate"}` (PUT into a twin), `422 {"detail":"invalid_<field>"}`, `404 {"detail":"Not Found"}` (PUT on a
  foreign or unknown id), `401`, `403 <reason>`, `429 {"detail":"rate_limited"}`. `Cache-Control: private, no-store`.

## Business rules

- Kept: BR-API-076, BR-API-077 / BR-BOT-099, BR-API-078, BR-API-080, BR-API-086 (`entry`/`relaxed` statistics only),
  BR-API-087 (flow codes arrive as `relaxed`, never applied), BR-APP-041 (client flow unchanged).
- Defect fixes `APPROVED`: LB-API-013 (repeat after `no_chat` creates one radar), LB-API-014 (`relaxed: []`),
  LB-API-033 (`subscription_limit`), LB-API-035 (`relaxed` analytics only).
- `PROPOSED`: DEV-004 (one normaliser — already in KV-BE-016), DEV-009 (server-side twin handling — the active-twin
  answer is a race guard; the paused-twin reactivation is behind config, KV-BE-100).

## Acceptance criteria

- A user without bot chat access gets `409 no_chat` and `GET /api/subscriptions` is unchanged; after access is granted
  the client's single repeat creates exactly one radar (`15` §3.4 #2).
- The 11th active radar is refused with a `409` whose `detail` is not `no_chat`; nothing is written.
- Every `200` body has `subscription.filters` with 25 keys, a numeric `starter` and an array `relaxed`.
- A PUT on another user's radar number answers exactly like an unknown number.

## Tests

- `Api019SubscriptionCreateTest`: `creates_radar_and_returns_mutation_result` (`assertLegacyShape`),
  `no_chat_409_and_nothing_written`, `repeat_after_access_creates_one`, `limit_409_is_not_no_chat`,
  `ten_concurrent_identical_posts_one_radar` (pgsql, `15` §3.4 #1), `entry_required_and_validated` (dataset incl.
  `entry: "banner"` → `422 invalid_entry`), `invalid_deal_types_422`, `relaxed_absent_and_present`,
  `relaxed_stored_as_analytics_only`, `zone_accepted_as_zones`, `starter_cards_handed_to_bot_once`
  (event fake asserts listing ids), `options_present_only_when_narrow`, auth/access dataset, limiter `429` with
  `Retry-After`.
- `Api020SubscriptionUpdateTest`: `filters_replaced_and_returned`, `previously_delivered_not_resent`,
  `no_chat_before_change_filters_unchanged`, `foreign_id_404_like_unknown`, `malformed_id_404`,
  `update_into_twin_409_duplicate`, `paused_radar_stays_paused` (`->todo('DEV-031 PROPOSED')` for the bot text only),
  validation `422`.

## Edge cases

- `filters.posted_days` present: stored per KV-BE-100 (DEV-005), ignored by the twin hash.
- `filters` with `polygon` and `districts` both set → the normaliser's exclusivity rule (DEV-004) decides; legacy client
  never sends both.
- The client's re-read before POST races a bot create of the same filters → `existing_active`, `200`, no twin.
- A PUT that makes the radar identical to its current filters → no write, `starter: 0`, `200`.
- Body larger than the request cap (KV-BE-005 default) → `413`/`422` without `500`.

## Security

- SEC-REQ-014 (owner-scoped `number` lookup), SEC-REQ-015 (race-safe create), SEC-REQ-017 (normaliser),
  SEC-REQ-027 (radar limiter 30/min), SEC-REQ-033 (`no-store`).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), contract harness rows API-019 and API-020 green, parity gate items
ticked (`15` §4) for F-RADAR-002, F-RADAR-003 and F-RADAR-008 (API part), docs and the feature rows in `09` updated, PR
reviewed by the other developer.
