# KV-BE-105 — API-023 `POST /api/subscriptions/:id/relax`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-RADAR-006 |
| Dependencies | KV-BE-102 (`RelaxCode`, `RadarRelaxOptions`, `StarterSelector::forRelax`), KV-BE-103 (controller, routes), KV-BE-100 (`update` under lock, `no_chat`); Q-API-034 |

## Goal

The «Расширить» action of the legacy Mini App (and the bot's relax buttons on an existing radar) widens a radar by one
of the codes the server offered in `SubscriptionMutationResult.options`, re-checks chat access first and answers
`{"starter": n}` with the number of newly matching listings sent to the chat.

## Legacy reference

- `$KVADRO_ROOT/docs/api.md:822-838` (`POST …/relax` `{code}` → `{starter}`), `:388-400` (`options[].code` goes to
  `/relax`), `:553-556` (flow codes never go to `/relax`).
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/subscriptions.js:43-49`, `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:69-87`
  (toast «Радар расширен — новые придут в чат, как только появятся»).
- Mock: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:158-172` (codes `district`, `price_more`; `starter: 12`).
- Bot: `$KVADRO_ROOT/docs/telegram-bot.md:983`; review relax buttons (`04` §3.7).
- Audit IDs: API-023, BR-API-077, BR-API-087, BR-API-088, BR-APP-042; LB-API-036.

## Implementation

1. `php artisan make:request Legacy/RelaxSubscriptionRequest --no-interaction`: `code` required string; must be a
   `RelaxCode` case (KV-BE-102) → else `422 {"detail":"invalid_code"}`.
2. `RadarService::relax(User, Radar, RelaxCode): RadarMutation` (added to the KV-BE-100 service): `no_chat` first; the
   relaxed filters come from `RadarRelaxOptions::apply($radar, $code)`; a code that does not widen this radar (for
   example `district` on a whole-city radar) → `422 {"detail":"invalid_code"}` (the server accepts what it would offer
   — stateless check, no stored offer list); a relaxed result that equals another radar of the user →
   `409 {"detail":"duplicate"}`; otherwise `update()` semantics (state kept, `RadarSaved` with kind `relaxed`).
3. `SubscriptionController@relax` → `{"starter": StarterSelector::forRelax($radar)->count}`; the starter ids travel on
   `RadarSaved` to the bot as for create/update.
4. Route `POST api/subscriptions/{number}/relax` with `auth:tma`, `legacy.access`, `throttle:legacy-radar`.
5. The flow-option codes of API-006 (`price`, `rooms`, …) are a different namespace: sending one here is `422` unless
   it is also a `RelaxCode` (they are not, by construction of the enum).

## Files

- `backend/app/Http/Requests/Legacy/RelaxSubscriptionRequest.php` (new)
- `backend/app/Services/Radar/RadarService.php` (`relax`), `backend/app/Http/Controllers/Legacy/SubscriptionController.php`
  (`relax`); `backend/routes/legacy.php`
- `backend/tests/Feature/LegacyApi/Api023SubscriptionRelaxTest.php` (new)

## API contract

- `POST /api/subscriptions/:id/relax` body `{"code": "district"|"price_more"|"rooms"|"owners"|"below_median"}` →
  `200 {"starter": int}`.
- Errors: `409 {"detail":"no_chat"}` (before any change), `409 {"detail":"duplicate"}`, `422
  {"detail":"invalid_code"}`, `404 {"detail":"Not Found"}`, `401`, `403 <reason>`, `429`.

## Business rules

- Kept: BR-API-087 (separate code sets), BR-API-088 (what relaxing means), BR-API-077 (`no_chat` first).
- LB-API-036 (one relax model) applies to v1 only; the legacy surface keeps `/relax`.
- Spec-tested: stateless code validation and the `422` code (`08` API-023 "record legacy"; Q-API-034).

## Acceptance criteria

- Every code offered for a radar by KV-BE-102 is accepted by this endpoint for that radar, changes the stored filters
  as its label says and returns a numeric `starter`; `GET /api/subscriptions` then shows the relaxed filters with 25 keys.
- A user without chat access gets `409 no_chat` and the filters are unchanged.

## Tests

- `Api023SubscriptionRelaxTest`: `each_offered_code_accepted_and_applied` (dataset over `RelaxCode`, building the radar
  so the code is offered), `filters_relaxed_and_listed_with_25_keys`, `starter_counts_new_matches_only`,
  `no_chat_409_filters_unchanged`, `unknown_code_422`, `flow_code_price_422`, `non_widening_code_422`,
  `relax_into_twin_409_duplicate`, `foreign_id_404`, `paused_radar_relaxed_stays_paused`, auth dataset.

## Edge cases

- Two quick taps on «Расширить» → the second call relaxes from the already relaxed filters (`price_more` steps again);
  the old client sends one request per tap — accepted (the toast shows the second `starter`).
- `owners` on a radar already at `owner=any` → `422 invalid_code`.
- Relaxing a daily-rent radar with `price_more` uses daily presets (KV-BE-102).

## Security

- SEC-REQ-014, SEC-REQ-017 (relaxed filters re-normalised), SEC-REQ-027 (radar limiter).

## Definition of done

Tests green (`make ci-backend`), contract harness row API-023 green, parity gate items ticked (`15` §4) for
F-RADAR-006 (API part), docs and the feature row in `09` updated, PR reviewed by the other developer.
