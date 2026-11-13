# KV-BE-029 — `MetaService` and API-001 `GET /api/meta`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-ONBOARD-001, F-ONBOARD-002, F-ACCESS-002, F-LOCALE-001, F-SETTINGS-004, F-MEDIA-002, F-ANALYTICS-002 |
| Dependencies | KV-BE-009, KV-BE-015, KV-BE-019, KV-BE-020, KV-DB-007, KV-DB-011 (and the `legacy-meta` limiter of KV-BE-010; DEC-26 for the PostHog project; PMTiles hosting for `tiles` from the infrastructure track) |

## Goal

`GET /api/meta` is the Mini App bootstrap: for an admitted user it returns the union of every `MetaResponse` field with
the user's profile, rate, analytics configuration and all directories; for a gated user it is the access gate and
answers `403 {"detail": "<reason>"}` with one of the five reasons.

## Legacy reference

- API-001 (`08` §2): `$KVADRO_ROOT/docs/api.md:104`, `:64-72` (403 handling), `:416-466` (schema), `:454-463`
  (`CityMeta`); `$KVADRO_ROOT/docs/about.md:248-252`.
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/meta.js:5`, `$KVADRO_ROOT/demo/app/src/main.jsx:24` (prefetch),
  `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:24`, `:70`, `:79-94`, `:130-143`, `:150-157`,
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:234`, `:252`, `:257`, `$KVADRO_ROOT/demo/app/src/features/onboarding/NoAccessScreen.jsx:13-22`,
  `$KVADRO_ROOT/demo/app/src/lib/analytics.js:126-127`, `$KVADRO_ROOT/demo/app/src/app/subscriptionActions.js:16`.
- Mocks: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:65-73`, `:264` (403 scenario).
- Rules: BR-API-011…016, BR-API-126, BR-API-143…146, BR-API-149, BR-API-154; LB-API-018, LB-API-021, LB-API-048,
  LB-API-051, LB-API-053; Q-API-004, Q-API-026, Q-API-047, Q-API-054.

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/laravel-database-optimization/` (caching) and
   `.claude/skills/pennant-development/` if feature codes come from Pennant.
2. `php artisan make:class Services/Identity/MetaService --no-interaction`: `forUser(User): MetaPayload` combining
   `SettingsService` reads (`user_settings`), `RateService::usdUzs(today)`, `Gazetteer` directories, price presets
   (`price_presets`), analytics config and limits. Per-user part computed per request; directories cached in Redis per
   locale for 5 minutes and flushed by the dictionary seeders (`10` §4.16).
3. `php artisan make:class Http/Serializers/Legacy/MetaSerializer --no-interaction` emitting every key below; locale
   through `LocaleCode::toLegacy()` (`uz` → `uz_Latn`).
4. `php artisan make:controller Legacy/MetaController --invokable --no-interaction`; route `GET api/meta` in
   `routes/legacy.php` with `auth:tma`, `legacy.access` and `throttle:legacy-meta`. The gate denial is thrown by the
   middleware and rendered by `LegacyExceptionRenderer` as `403 {"detail": "<reason>"}` — this is the route the client
   reads the reason from; other routes return the same 403 per SEC-REQ-006.
5. `locale_chosen` = `user_settings.locale_chosen_at` not null; `city_chosen` = `city_chosen_at` not null (derived,
   LB-API-018). `city` is the stored city code or `null`.
6. `analytics`: `null` when `POSTHOG_PROJECT_KEY` is empty; otherwise `{key, host, id, env, team, autocapture, replay,
   replay_rate}` with `id` = `users.analytics_distinct_id` (never the Telegram id), `team` from `users.is_team`, the rest
   from `config/analytics.php` (new, env-driven; Q-API-047 spec-tested).
7. `tiles` = `config('geo.tiles_url')` (`MAP_TILES_URL`), `null` when unset (OSM fallback, RES-004).
8. `cities[]` from the gazetteer: `code`, `name`, `center: [lat, lon]`, `zoom` (regions `< 11`, LB-API-051), `metro`,
   `median`, `districts[]`, `zones[]`; top-level `districts`/`zones` = Tashkent's (fallback for clients without cities).
9. Add `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`, `MAP_TILES_URL`, `ACCESS_MAX_SUBSCRIPTIONS` (if not added by KV-BE-009) to
   `backend/.env.example` in a separate small PR (shared file) and announce them.

## Files

- `backend/app/Services/Identity/MetaService.php`, `backend/app/Domain/Identity/MetaPayload.php` (new)
- `backend/app/Http/Serializers/Legacy/MetaSerializer.php`, `backend/app/Http/Controllers/Legacy/MetaController.php` (new)
- `backend/config/analytics.php`, `backend/config/geo.php` (new or extended); `backend/routes/legacy.php`
- `backend/tests/Feature/LegacyApi/Api001MetaTest.php` (new)

## API contract

`200 MetaResponse`: `locale: "ru"|"uz_Latn"|"en"`, `locale_chosen: boolean`, `currency: "USD"|"UZS"`, `usd_uzs: number`,
`theme: "auto"|"light"|"dark"`, `city: string|null`, `city_chosen: boolean`, `analytics: null|{key: string, host: string,
id: string, env?: string, team?: boolean, autocapture?: boolean, replay?: boolean, replay_rate?: number}`,
`max_subscriptions: number`, `bot_username: string|null`, `tiles: string|null`, `new_features: string[]`,
`cities: CityMeta[]`, `districts: {code, name}[]`, `zones: {code, name}[]`, `renovations: Record<deal, {code, name}[]>`,
`appliances: {code, name}[]`, `price_presets: Record<deal, number[]>` (USD), `locales: {code, name}[]`.
`CityMeta`: `code`, `name`, `center: [lat, lon]`, `zoom?: number`, `metro: boolean`, `median: boolean`,
`districts: {code, name}[]`, `zones: {code, name}[]`. Arrays never `null`; deals are `rent_long`, `rent_daily`, `sale`.
Errors: `403 {"detail": "private"|"invite"|"full"|"blocked"|"join"}`; `401 {"detail":"unauthorized"|"auth_expired"}`;
`429 {"detail":"rate_limited"}`; `500 {"detail":"internal_error"}`. Headers: `Cache-Control: private, no-store`.
Client behaviour on errors (`08` API-001): 403 → no-access screen (re-check 3 × 2.5 s except `blocked`); any other
failure → retries after 1, 3, 7, 15, 30 s.

## Business rules

- Kept: BR-API-011 (five strings, byte-identical), BR-API-012, BR-API-013 (gate opens within seconds after «Старт» — no
  caching of the decision), BR-API-016, BR-API-126, BR-API-143, BR-API-144, BR-API-145, BR-API-154 (presets in USD).
- Defect fixes `APPROVED`: LB-API-018 (derived `*_chosen`), LB-API-021 (`401` only for authentication, `403` only for
  access), LB-API-048 (`uz_Latn` on the wire), LB-API-051 (`zoom < 11` = region), LB-API-053 (legacy keeps the union;
  the v1 split is M9).
- DEV-001 `PROPOSED` (client shows the access screen for any 403 — new client only); DEV-020 `PROPOSED` (default locale
  of a brand-new user from `language_code`, KV-BE-014).
- Q-API-004: the first call creates the user (KV-BE-007) but records no attribution from `start_param` (spec).

## Acceptance criteria

- Admitted user → `200` with every key present and typed as above; arrays never `null`.
- One case per access state returns `403` with the exact string; `join` turns into `200` immediately after
  `bot_chat_state` becomes active.
- After `PUT /api/settings {locale}` (KV-BE-045) → `locale_chosen: true`; after `{city}` → `city_chosen: true` and `city`
  updated.
- `analytics.id` equals `users.analytics_distinct_id` byte for byte; `analytics: null` without a key; `tiles: null`
  without `MAP_TILES_URL`.

## Tests

`backend/tests/Feature/LegacyApi/Api001MetaTest.php` (fixtures of KV-QA-002, harness of KV-QA-004):

- `admitted_user_gets_full_meta_shape` (`assertLegacyShape('MetaResponse')`); `arrays_never_null`.
- Dataset `access_reasons`: `private`, `invite`, `full`, `blocked`, `join` → `assertLegacyError(403, reason)`.
- `join_becomes_200_after_bot_start`; `blocked_never_gets_meta`.
- Auth (`15` §3.2 rows 1–7): no header, `tma ` empty, tampered hash, stale `auth_date` → `401` dialect, never `200`.
- `locale_round_trip_uz_Latn` (after the KV-BE-045 route exists), `chosen_flags_are_derived`.
- `cities_empty_keeps_top_level_districts`; `region_has_zoom_below_11`; `analytics_null_without_key`;
  `tiles_null_without_config`; `usd_uzs_is_latest_rate`; `price_presets_are_usd_per_deal`.
- `directories_cached_per_locale_and_flushed_by_seed`; `limiter_31st_call_per_minute_is_429`.
- `->todo('DEV-020 PROPOSED')` for the default locale of a new user.

## Edge cases

- No rate stored yet (fresh environment) → `usd_uzs` from the last known rate; with none at all the app must still boot:
  emit the configured fallback and alert (Q-API-054).
- User whose stored city was removed from the gazetteer → `city: null`, `city_chosen: false`.
- Prefetch failure plus the immediate repeat (`client.js:56-60`) → no second user row (`15` §3.4 #8).

## Security

- SEC-REQ-005 / SEC-REQ-006 (statuses and the gate), SEC-REQ-027 (`legacy-meta` 30/min), SEC-REQ-036 (no names
  returned or stored), BR-API-127 (analytics id random, never the Telegram id), SEC-REQ-033 (`no-store`).
- The PostHog key in `meta.analytics.key` is a public project key; the personal API key never appears (SEC-REQ-034).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for F-ONBOARD-001 and the meta part of F-ACCESS-002,
docs and the feature rows in 09 updated, PR reviewed by the other developer; the new env keys are announced in the PR.
