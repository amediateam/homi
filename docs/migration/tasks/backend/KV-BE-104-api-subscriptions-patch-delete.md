# KV-BE-104 — API-021 `PATCH` and API-022 `DELETE /api/subscriptions/:id`, `ask_found`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-RADAR-004, F-RADAR-005, F-DELIVERY-007, F-HIDE-004 |
| Dependencies | KV-BE-100, KV-BE-101, KV-BE-102 (resume starter), KV-BE-106 (unhide), KV-BE-044 (`FoundSurveyService`, answers); Q-API-030, Q-API-031, Q-DATA-015 |

## Goal

The radar sheet of the legacy Mini App can pause, resume, switch delivery mode, clear hide rules and delete a radar on
HOMI. `PATCH` accepts exactly one of five bodies, `DELETE` removes the radar, and both decide — in one policy shared with
the bot's poll — whether to ask «Нашли жильё?» (`ask_found`).

## Legacy reference

- `$KVADRO_ROOT/docs/api.md:769-808` (PATCH bodies and response), `:810-820` (DELETE `200 {ask_found}` or `204`),
  `:76-82` (limit toast also on `PATCH {active:true}`).
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/subscriptions.js:56-69`, `$KVADRO_ROOT/demo/app/src/features/radar/RadarScreen.jsx:92-178`
  (toggle revert on error, mode, unhide toast, delete confirmation, `ask_found` → `FoundSheet`),
  `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx`, `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:104-128`.
- Mock: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:148-156` (`foundApi`: PATCH and DELETE answer `ask_found: true`).
- Bot: `$KVADRO_ROOT/docs/telegram-bot.md:978-980`; poll BOT-069 (`04` §3.12, §5 — «suppressed shortly after an answer»).
- Audit IDs: API-021, API-022, BR-API-089, BR-API-090, BR-API-091, BR-APP-047, BR-APP-048, BR-APP-049, BR-BOT-063,
  BR-BOT-071; LB-API-003, LB-BOT-024; DEV-033, DEV-034.

## Implementation

1. `php artisan make:request Legacy/PatchSubscriptionRequest --no-interaction`: the JSON body has **exactly one** key
   of `active` (bool), `mode` (`instant`|`digest`), `unhide` (`true` only). Empty body, two keys, an unknown key,
   `mode: "weekly"`, `unhide: false` → `422 {"detail":"invalid_body"}` (spec — the legacy validation code is unknown).
2. `SubscriptionController@patch` (radar by `$user->radars()->where('number', $id)->firstOrFail()`):
   - `{"active": true}` → `RadarService::setActive(true)` (`no_chat` first, then the active-radar limit) →
     `{"subscription", "starter": StarterSelector::forResume()->count, "ask_found": false}`.
   - `{"active": false}` → `setActive(false)` → `{"subscription", "ask_found": FoundAskPolicy::shouldAsk($user, 'pause')}`.
   - `{"mode": …}` → `setMode()` → `{"subscription"}`. Items already pending keep their release time; new matches follow
     the new mode (KV-BE-110).
   - `{"unhide": true}` → `RadarHideRuleService::clearAll($radar)` (KV-BE-106) → `{"subscription"}` with `hidden: 0`.
3. `SubscriptionController@destroy` → `RadarService::delete()` → always `200 {"ask_found": bool}` (never an empty
   `200`, LB-API-003; the legacy `204` variant is not used because the client reads `ask_found`). A second DELETE of the
   same id → `404 {"detail":"Not Found"}` (`15` §3.4 #6).
4. `php artisan make:class Services/Radar/FoundAskPolicy --no-interaction`: `shouldAsk(User, 'pause'|'delete'): bool`
   — true when the user has no `found_answers` row within `radar.found_cooldown_days` (default 30) **and** was not
   asked within the last 24 h (Redis key `found:asked:{user}` with TTL, set when true is returned). Legacy rule unknown
   (BR-API-090 «not shown every time», Q-API-030): spec-tested; the bot's poll after a pause/delete (F-DELIVERY-007,
   telegram track) calls the same policy so the app and the bot never ask twice.
5. Routes `PATCH api/subscriptions/{number}`, `DELETE api/subscriptions/{number}` with `auth:tma`, `legacy.access`,
   `throttle:legacy-radar`.
6. Contract tests for API-021, API-022 with the KV-QA-004 harness.

## Files

- `backend/app/Http/Requests/Legacy/PatchSubscriptionRequest.php` (new)
- `backend/app/Http/Controllers/Legacy/SubscriptionController.php` (`patch`, `destroy`); `backend/routes/legacy.php`
- `backend/app/Services/Radar/FoundAskPolicy.php` (new); `backend/config/radar.php` (`found_cooldown_days`)
- `backend/tests/Feature/LegacyApi/Api021SubscriptionPatchTest.php`, `Api022SubscriptionDeleteTest.php`,
  `backend/tests/Feature/Radar/FoundAskPolicyTest.php` (new)

## API contract

- `PATCH /api/subscriptions/:id` with one of `{"active": true}`, `{"active": false}`, `{"mode": "instant"}`,
  `{"mode": "digest"}`, `{"unhide": true}` → `200 {"subscription": Subscription, "starter"?: int, "ask_found"?: bool}`
  (`subscription` always; `starter` on resume; `ask_found` on `active` changes).
- `DELETE /api/subscriptions/:id` → `200 {"ask_found": bool}`.
- Errors: `409 {"detail":"no_chat"}` (resume only, before any change), `409 {"detail":"subscription_limit"}` (resume at
  the limit), `422 {"detail":"invalid_body"}`, `404 {"detail":"Not Found"}` (foreign, unknown, already deleted),
  `401`, `403 <reason>`, `429`. `Cache-Control: private, no-store`.

## Business rules

- Kept: BR-API-089 (resume returns unseen `starter`), BR-API-090 (`ask_found` on pause/delete), BR-API-091 /
  BR-BOT-063 (`unhide` clears the radar's hide rules), BR-APP-047, BR-APP-048 (client rules), BR-BOT-071.
- Defect fix `APPROVED`: LB-API-003 (no empty `200` on DELETE).
- `PROPOSED`: DEV-033 (one-by-one removal — bot only; `PATCH {unhide:true}` keeps clearing all), DEV-034 (user-wide hide
  rules — KV-BE-106).
- Spec-tested: the `ask_found` policy (Q-API-030), the `422` code, the limit scope on resume (Q-DATA-015).

## Acceptance criteria

- Each of the five bodies returns the updated `subscription` with 25-key filters; any other body is `422` and changes
  nothing.
- `{"active": true}` for a user without chat access → `409 no_chat` and the radar stays paused.
- After DELETE the radar is gone from API-018 and from the bot's `/subs` (same table); its pending items are gone; the
  user's delivered set is untouched (no re-sends if an identical radar is created later).
- `ask_found` is true at most once per 24 h and never within 30 days after an answer, whether asked by the app or the bot.

## Tests

- `Api021SubscriptionPatchTest`: dataset of the five bodies → `200` and the expected `subscription` fields;
  `resume_returns_unseen_starter`, `resume_no_chat_409_radar_stays_paused`, `resume_at_limit_409_not_no_chat`,
  `pause_does_not_check_chat`, `mode_switch_keeps_pending_release_times`, `unhide_clears_rules_hidden_zero`,
  `invalid_bodies_422` (empty, two keys, unknown key, `mode: weekly`, `unhide: false`), `foreign_id_404`, auth dataset.
- `Api022SubscriptionDeleteTest`: `deletes_and_returns_ask_found`, `second_delete_404`, `pending_items_removed`,
  `delivered_set_kept`, `foreign_id_404_like_unknown`, `never_empty_200`.
- `FoundAskPolicyTest`: `asks_first_time`, `not_again_within_24h`, `not_within_30_days_after_answer` (frozen clock),
  `bot_and_app_share_the_state`.
- Race (pgsql, KV-QA-008): `15` §3.6 #6 — radar deleted while its matching job runs → no card planned after the delete
  commits (asserted together with KV-BE-108).

## Edge cases

- `{"active": false}` on an already paused radar → `200`, no state change, `ask_found` per policy.
- `{"mode": "digest"}` while the user has no digest hours configured → stored; the planner falls back to the default
  digest preset (KV-BE-110).
- `{"active": true}` on an active radar → `200`, `starter: 0`, no limit check needed.
- DELETE while a starter list is being sent → cards already claimed stay delivered; the rest are dropped by the
  claim-time eligibility check (KV-BE-109).

## Security

- SEC-REQ-014 (owner-scoped), SEC-REQ-015 (state changes under the per-user lock of KV-BE-100), SEC-REQ-027
  (radar limiter), SEC-REQ-033.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), contract harness rows API-021 and API-022 green, parity gate items
ticked (`15` §4) for F-RADAR-004, F-RADAR-005 and the `ask_found` part of F-DELIVERY-007, docs and the feature rows in
`09` updated, PR reviewed by the other developer.
