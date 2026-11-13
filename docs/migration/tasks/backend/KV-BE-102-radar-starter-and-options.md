# KV-BE-102 — Starter selection, radar relax options and `relaxed` hints

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-RADAR-002, F-RADAR-006, F-DELIVERY-005, F-FILTER-005 |
| Dependencies | KV-BE-100 (`RadarMutation`), KV-BE-109 (delivered set, `unseen`), KV-BE-032 (`FlowEstimator`), KV-BE-023 (search query with per-user exclusions), KV-BE-021 (rate and label strings); Q-API-033, Q-API-034, Q-API-031 |

## Goal

After every radar mutation the service knows which listings go to the chat at once (`starter`: count and ids) and,
for narrow radars, which relax options to offer (`options[]` with `code`, `label`, `rate`, `count`), plus the
`relaxed[]` hint list that is always an array — so API-019, API-020, API-021 and API-023 and the bot's review and
starter list all answer from one place.

## Legacy reference

- `$KVADRO_ROOT/docs/api.md:382-400` (`SubscriptionMutationResult`: `starter`, `options` with `code` for `/relax`,
  `relaxed` must be at least `[]`), `:398-400` (client picks the first option with `count ≥ 7`, else the last),
  `:553-556` (flow codes vs relax codes).
- `$KVADRO_ROOT/docs/about.md:198-201` (starter on create, «only not received» after an edit);
  `$KVADRO_ROOT/docs/telegram-bot.md:983` (relax in the bot), bot text «Уже есть за последние 3 дня: N»
  (`04` §3.8).
- Client toasts: `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:49-67`, `:137-143`, `:166-175`;
  `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:56-63`, `:476`.
- Mock: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:158-172` (options `district` «Любой район» `count 4`,
  `price_more` «До $900» `count 12`; `starter: 12` after relax).
- Audit IDs: BR-API-078, BR-API-080, BR-API-087, BR-API-088, BR-API-089, BR-APP-042, BR-BOT-049, BR-DATA-012;
  LB-API-014, LB-API-035, LB-API-036; DEV-021 (one flow vocabulary).

## Implementation

1. Read KV-BE-032 (`FlowEstimator`, option builder) and KV-BE-023 (`ListingSearchService::query`).
2. `php artisan make:class Services/Radar/StarterSelector --no-interaction`:
   - `forCreate(Radar)`: active listings matching the radar filters (with the user's hidden listings, blocked authors
     and the radar's hide rules excluded) whose `first_seen_at ≥ now − radar.starter_window_days` (config, default 3:
     the bot's «за последние 3 дня», BR-DATA-012; Q-API-033 confirms the Mini App window), minus the delivered set
     (`DeliveryLedger::delivered`, KV-BE-109); newest first; capped at `radar.starter_max` (default 20, spec — the cap is
     unknown, Q-API-033).
   - `forUpdate(Radar)` and `forRelax(Radar)`: the same window and rules — "only listings the user has not received yet"
     (BR-API-080, BR-BOT-049).
   - `forResume(Radar)`: the same window, additionally excluding listings in the user's view history
     (`listing_views`) — «которые вы не видели» (BR-API-089).
   - Returns `Starter {count, listingIds}`; `count` is what will actually be sent (after the cap), so the toast number
     equals the cards that arrive.
3. `php artisan make:class Services/Radar/RadarRelaxOptions --no-interaction`: offered only when `starter.count <
   config('radar.options_below')` (default 1, spec; the mock shows options with `starter: 0`). Candidates in this
   order, each applied to a copy of `SearchFilters` through the KV-BE-016 normaliser: `district` (drop `districts`,
   `zones`, `polygon` → whole city), `price_more` (raise `price_max` to the next preset step of `price_presets`, or
   +25 % when no preset is above), `rooms` (widen `rooms_min`/`rooms_max` by one, «Любые» when already wide), `owners`
   (`owner` → `any`, «Вместе с риелторами», BR-API-088), `below_median` (drop the market filter). An option is offered
   only if it changes the filters and its `count` (starter count under the relaxed filters, same window) is greater
   than the current one. `label` and `rate` through the display formatter (KV-BE-021; `rate` = the flow of the relaxed
   filters, «≈N в день» / «≈N в неделю», DEV-021 vocabulary behind the catalogue). The codes form the `RelaxCode` enum
   (`app/Enums/Radar/RelaxCode.php`) — a namespace separate from the flow option codes of API-006 (BR-API-087).
4. `relaxed[]`: always an array (LB-API-014). Content (legacy unknown, spec-tested): `[]` when `starter.count > 0` or
   options exist; otherwise one hint `{"text": " — обычно " + rate}` built from the radar's own flow when `week > 0`,
   else `[]`. Strings via the catalogue in `ru`, `uz`, `en`.
5. `php artisan make:class Services/Radar/MutationResultBuilder --no-interaction`: assembles `{starter, options?,
   relaxed}` for a `RadarMutation` and returns the starter listing ids to the caller; `RadarSaved` (KV-BE-100) carries
   them so the telegram track sends the starter cards (F-DELIVERY-005, starter list in `11b` M5.5) and claims each one
   through `DeliveryLedger::claim` with origin `starter`.
6. `existing_active` and `paused`/`mode` mutations return `starter = 0`, no options.
7. `config/radar.php`: `starter_window_days`, `starter_max`, `options_below`.

## Files

- `backend/app/Services/Radar/StarterSelector.php`, `RadarRelaxOptions.php`, `MutationResultBuilder.php` (new)
- `backend/app/Domain/Radar/Starter.php`, `RelaxOption.php`; `backend/app/Enums/Radar/RelaxCode.php` (new)
- `backend/lang/{ru,uz,en}/radar.php` (labels and hints; keys only, wording from `ru.js` and the bot texts)
- `backend/tests/Feature/Radar/StarterSelectorTest.php`, `backend/tests/Feature/Radar/RadarRelaxOptionsTest.php` (new)

## API contract

n/a directly; feeds `SubscriptionMutationResult` = `{"subscription": Subscription, "starter": int, "options"?:
[{"code": string, "label": string, "rate": string, "count": int}], "relaxed": [{"text": string}]}` of KV-BE-103 and
`{"starter": int}` of KV-BE-105. `options` is omitted (not `null`) when there are none.

## Business rules

- Kept: BR-API-078 (starter, options, relaxed), BR-API-080 / BR-BOT-049 (only not-yet-received after an edit),
  BR-API-089 (resume = unseen), BR-API-087 (two code sets), BR-API-088 (widen price, rooms, districts, realtors),
  BR-APP-042 (client choice rule — `count` must be meaningful).
- Defect fixes `APPROVED`: LB-API-014 (`relaxed` always an array), LB-API-035 (`relaxed` analytics only).
- LB-API-036 (one relax model) is v1-only; legacy keeps both mechanisms.
- DEV-021 `PROPOSED` (wording of `rate`) — `->todo('DEV-021 PROPOSED')`.
- Spec-tested (unknown): window 3 days, cap 20, `options_below` 1 (Q-API-033, Q-API-034).

## Acceptance criteria

- `starter.count` equals the number of listing ids handed to the bot, and none of them is in the user's delivered set,
  hidden list, blocked authors or the radar's hide rules (`15` §3.7 #9).
- Every offered option increases the count and its code is accepted by API-023 for that radar.
- `relaxed` is an array in every result; options are absent when `starter > 0`.

## Tests

- `StarterSelectorTest`: `create_starter_is_last_three_days_only` (frozen clock, listings at 71 h 59 m and 72 h 01 m),
  `starter_excludes_delivered_hidden_blocked_and_hide_rules`, `starter_capped_and_count_equals_ids`,
  `update_starter_excludes_previously_received`, `resume_starter_excludes_viewed`, `withdrawn_listing_never_in_starter`,
  `starter_resolves_alias_listings_once` (merged listing counted once).
- `RadarRelaxOptionsTest`: `options_only_when_starter_below_threshold`, `each_option_increases_count` (dataset per
  code), `option_not_offered_when_it_changes_nothing` (whole-city radar gets no `district`), `price_more_uses_next_preset`,
  `owners_option_sets_owner_any`, `relaxed_always_array`, `labels_localised_ru_uz_en`, `->todo('DEV-021 PROPOSED')`.

## Edge cases

- Radar in a city without medians: `below_median` relaxation never offered (the filter is unavailable, BR-API-064).
- Daily rent radar: `price_more` steps use the daily presets.
- Radar created twice in a row (twin, `existing_active`): `starter = 0`, nothing re-sent.
- A starter listing withdrawn between selection and sending: the sender's claim-time eligibility check (KV-BE-109) drops
  it; the toast count may be one higher than the cards — accepted and logged.

## Security

- SEC-REQ-014 (all selections through the owner's radar), SEC-REQ-017 (relaxed filters re-normalised), SEC-REQ-018
  (labels are catalogue strings with numbers only).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (`15` §4) for the starter/options parts of F-RADAR-002,
F-RADAR-006 and F-DELIVERY-005, docs and the feature rows in `09` updated, PR reviewed by the other developer.
