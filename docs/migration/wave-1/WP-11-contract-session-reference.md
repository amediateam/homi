# WP-11 — Contract: session, me, settings, reference, cities, events

| Field | Value |
| ----- | ----- |
| Stage | A |
| Status | TODO |
| Depends on | WP-10 |
| Size | about 2 000 changed lines without generated files and fixtures, M |
| Behaviour reference | `25` §3.4, §4.1, §4.2; `08` §1.5 and the rows of API-001, API-002, API-003, API-024, API-025, API-034; `03` §3.3 (events), §4 (BR-APP-050, BR-APP-054, BR-APP-055); `16` §4.1 (SEC-REQ-002, SEC-REQ-004, SEC-REQ-005), SEC-REQ-022; task `tasks/backend/KV-BE-045-settings.md` (preset sets, partial update) |
| Needs from the production track | One new env key name, blank by default, announced in the PR: `TELEGRAM_SUPPORT_USERNAME` (public name of the support account; staging and production values set by that track). After the deploy, check on staging that `GET /api/v1/reference` answers without a token |

## Goal

Seven methods of `25` §4.2 exist as Laravel routes with form requests, resources, data objects and fixtures, and
answer with `meta.source = stub`: `POST /auth/telegram`, `GET /me`, `GET /settings`, `PATCH /settings`,
`GET /reference`, `GET /cities`, `POST /events`. OpenAPI and `@homi/types` describe them. The Mini App can be built
on them before any real code exists.

## Scope

In: routes, validation, response shapes, error cases, fixtures, the stub user and its token, the request-locale
middleware, the `ReferenceSource` methods with their stub driver, the two features `source.reference` and
`source.cities`.

Out: real sign-in, users, settings storage, the gate and rate limits (WP-40); the legacy driver for reference data
(WP-41); storing events (WP-47). The shapes fixed here do not change in those packages.

## Decisions that bind this package

- The contract is fixed as stub routes (DEC-41); legacy shapes never reach the frontend (`24` §3).
- Bot name, support name and limits are HOMI's (DEC-40): they come from HOMI's configuration even when the
  directories come from legacy.
- Access is open (DEC-43), but the refusal shape exists, because the no-access screen exists.
- Stub answers are deterministic and sanitised (`25` §4.4): no real names, phones or channel names in fixtures.
- JSON keys are snake_case; the locale comes from `Accept-Language`; `uz` is the only Uzbek code on this surface
  (CF-006) — `uz_Latn` exists only inside the legacy driver.

## Design

All paths are under `/api/v1`. "Bearer" means `auth:sanctum` with the named ability. Every `200` answer has
`"success": true` and `meta.source`; they are left out of the examples below. Common errors on every bearer route:
`401 unauthenticated`, `403 access_denied` (shape below), `429 rate_limited`.

**Access refusal.** One shape, used by sign-in and by every bearer route:
`403 {"success": false, "message": "Access denied.", "code": "access_denied", "reason": "blocked"}` with `reason` one
of `private`, `invite`, `full`, `blocked`, `join`. The client shows an unknown or missing reason as `private`
(BR-APP-054). A missing token ability is the different code `forbidden`.

**Locale.** Middleware `App\Http\Middleware\SetRequestLocale` on the whole `v1` group: the first supported tag of
`Accept-Language` (`ru`, `uz`, `en`; `uz-Latn` and `uz_Latn` are read as `uz`), else `ru`; sets the application
locale and the `Content-Language` response header.

### `POST /auth/telegram` — public; legacy has no equivalent (it authenticates every request)

| Body field | Type | Rule |
| ---------- | ---- | ---- |
| `init_data` | string | required, 1 … 4 096 bytes, the raw `initData` query string |

```json
{"data": {"token": "<opaque>", "token_type": "Bearer", "expires_at": "2026-11-15T09:30:00+00:00",
          "user": { "…": "the object of GET /me" }}}
```

Errors: `422 validation_failed` (missing, not a string, too long); `401 invalid_init_data` (bad signature or
malformed); `401 auth_expired` (`auth_date` older than the window — the client shows "session expired, reopen the
app", fix of LB-APP-047); `403 access_denied` with `reason`; `429 rate_limited`.

Stub: accepts any valid body, issues a real Sanctum token (abilities `app:read`, `app:write`, 24 h) for the single
**stub user** (`users.email = 'stub@homi.invalid'`, created on first use), so `auth:sanctum` works unchanged on every
other route. Nothing is verified. Scenarios: `auth_expired`, `invalid_init_data`, `access_private`, `access_invite`,
`access_full`, `access_blocked`, `access_join`.

### `GET /me` — bearer `app:read`; legacy: the user part of the meta method (API-001)

```json
{"data": {"locale": "ru", "locale_chosen": true, "currency": "USD", "theme": "auto",
          "city": "tashkent", "city_chosen": true, "team": false,
          "analytics": {"distinct_id": "5f0c2b1e-7a36-4c59-9d4e-2f1a6b7c8d90", "autocapture": true,
                        "replay": false, "replay_rate": 0}}}
```

`locale` is `ru`, `uz` or `en`; `theme` is `auto`, `light` or `dark`; `city` is a city code or `null`;
`analytics` is `null` when analytics is off in the environment. Changed against legacy: directories, rate, bot name
and limits moved to `GET /reference`; the PostHog key and host are frontend configuration, only the per-user part
stays here; `uz_Latn` became `uz`; the gate reason moved from the body `detail` to `reason`.

Scenarios: `first_launch` (`locale_chosen: false`, `city: null`, `city_chosen: false`), `no_city`
(`city_chosen: false` only), `uz` (locale `uz`, currency `UZS`), and the five `access_*`.

### `GET /settings`, `PATCH /settings` — bearer `app:read` / `app:write`; legacy: API-024, API-025

```json
{"data": {"locale": "ru", "currency": "USD", "theme": "auto", "city": "tashkent",
          "quiet_hours": {"from": 23, "to": 8}, "digest_hours": [9, 19],
          "options": {
            "locales": [{"code": "ru", "name": "Русский"}, {"code": "uz", "name": "Oʻzbekcha"}, {"code": "en", "name": "English"}],
            "currencies": [{"code": "USD", "name": "Доллары"}, {"code": "UZS", "name": "Сумы"}],
            "quiet_hours": [null, {"from": 22, "to": 8}, {"from": 23, "to": 8}, {"from": 0, "to": 9}, {"from": 23, "to": 7}],
            "digest_hours": [[9], [9, 19], [12, 20], [19]]}}}
```

Hours are whole hours of Asia/Tashkent wall-clock, 0 … 23; `quiet_hours: null` means off; a window may cross
midnight. `PATCH` takes any subset of the six writable keys and returns the full object:

| Body field | Rule |
| ---------- | ---- |
| `locale` | `ru`, `uz`, `en` |
| `currency` | `USD`, `UZS` |
| `theme` | `auto`, `light`, `dark` |
| `city` | a city code of `GET /reference` |
| `quiet_hours` | `null` or `{from, to}` equal to one of `options.quiet_hours` |
| `digest_hours` | an array equal to one of `options.digest_hours` |

Unknown keys are ignored; an empty body is a `200` no-op; a bad value is `422 validation_failed` with `errors.<key>`.
Setting `locale` or `city` makes `locale_chosen` or `city_chosen` true in `GET /me`. Changed against legacy: `PUT`
with partial semantics became `PATCH`; `quiet` (`off` or `HH-HH`) and `digest` (`HH` or `HH,HH`) became structured;
`locales`, `currencies` and the two preset lists moved under `options`; `theme` and `city` are returned. The preset
sets are the ones the legacy bot offers (task `KV-BE-045`). Stub: `PATCH` validates and returns the fixture with the
sent keys overlaid; nothing is stored.

### `GET /reference` — public, cacheable per locale; legacy: the shared part of the meta method and the bot names (API-001, API-003)

```json
{"data": {
  "bot": {"username": "homi_stub_bot", "support_username": "homi_stub_support"},
  "limits": {"radars": 10},
  "rates": {"usd_uzs": 12800},
  "map": {"tiles_url": null},
  "features": ["pets"],
  "locales": [{"code": "ru", "name": "Русский"}, {"code": "uz", "name": "Oʻzbekcha"}, {"code": "en", "name": "English"}],
  "cities": [{"code": "tashkent", "name": "Ташкент", "center": {"lat": 41.3111, "lon": 69.2797}, "zoom": 12,
              "is_region": false, "has_metro": true, "has_median": true,
              "districts": [{"code": "yunusabad", "name": "Юнусабадский"}],
              "zones": [{"code": "center", "name": "Центр"}, {"code": "near_center", "name": "Ближе к центру"}]}],
  "renovations": {"rent_long": [{"code": "euro", "name": "Евроремонт"}], "rent_daily": [], "sale": []},
  "appliances": [{"code": "washer", "name": "Стиральная машина"}],
  "price_presets": {"rent_long": [300, 400, 500, 700, 1000], "rent_daily": [20, 30, 50], "sale": [50000, 80000, 120000]}}}
```

`bot.*` and `limits.*` come from HOMI's configuration (`telegram.bot.username`, the new `telegram.support.username`,
`radar.max`); everything else comes from `ReferenceSource::reference()`. `bot.username` and `support_username` may be
`null`; `map.tiles_url` is `null` until HOMI hosts tiles (`25` §3.8); price presets are whole USD. Names are
localised by `Accept-Language`. `is_region` replaces the legacy rule "zoom below 11". Changed against legacy: one
public method instead of an authenticated one plus `/api/bot`; `metro` and `median` became `has_metro` and
`has_median`; `center` became an object; `max_subscriptions` became `limits.radars`; `new_features` became
`features`; the top-level `districts` and `zones` fallback is gone (every city carries its own). Scenarios:
`single_city` (only `tashkent`), `no_bot` (`bot.username: null`).

### `GET /cities` — public; legacy: API-002

```json
{"data": [{"code": "tashkent", "counts": {"rent_long": 4120, "rent_daily": 310, "sale": 2890},
           "price_presets": {"rent_long": [300, 400, 500, 700, 1000]}, "typical_price": {"rent_long": 550, "sale": 78000}}]}
```

One entry per city of `GET /reference`; `counts` always has the three deals; `price_presets` and `typical_price` are
objects that may lack a deal; values are whole USD whatever the user's currency. Changed: `presets` and `typical`
were renamed. Scenario: `no_daily` (`counts.rent_daily: 0` everywhere, so the rent-term choice hides, BR-APP-004).

### `POST /events` — bearer `app:write`; legacy: API-034

| Body field | Type | Rule |
| ---------- | ---- | ---- |
| `name` | string | required, 1 … 40 characters, `[a-z_]` |
| `props` | object | optional; at most 20 keys; whole body at most 8 KB |

Answer `204`. Event names and property names are the legacy ones (`03` §3.3), so one vocabulary serves both
products; `listing_id` carries the listing number. Catalogue:

| Name | Properties |
| ---- | ---------- |
| `app_launch` | `entry` (`link`, `news`, `menu`), `ms`, `v`, `sdk`, `js`, `platform` |
| `app_opened` | `entry`, `listing_id` (only for `link`), `ms` |
| `app_error` | `v`, `error` = `{kind (boot, error, rejection, render), name, message, source, stage (boot, app), screen, tg, platform}` |
| `follow_prompt_shown`, `follow_prompt_expired`, `follow_prompt_closed` | none |
| `home_screen_offered`, `home_screen_added`, `home_screen_closed` | none |
| `chat_access_declined`, `chat_access_allowed` | none |
| `listing_shared`, `original_copied`, `contact_write` | `listing_id` |
| `original_opened` | `listing_id`, `src` (`button`, `video`, `sources`, `price_history`, `offers`) |
| `contact_call` | `listing_id`, `via` (`tel`, `browser`), `src` (`text`, `author`) |

An unknown `name` or unknown properties are accepted with `204` and not stored (WP-47). Errors: `401 unauthenticated`
(an event without a session is never stored, SEC-REQ-022); `413 payload_too_large`; `422 validation_failed` only when
`name` is missing or not a string. Over the rate limit the answer is still `204` and the event is dropped. Changed
against legacy: properties moved from the top level into `props`; nothing was renamed. Stub: validates and answers
`204`.

### Data objects, source and routes

- `App\Services\Sources\Data\ReferenceData` (rates, tiles URL, features, locales, cities, renovations, appliances,
  price presets), `CityData`, `NamedCode`, `CityStats`; each `final readonly` with `fromArray()` used by the fixture
  store and, later, by the legacy translator.
- `ReferenceSource` gains `reference()` and `cities()`; `App\Services\Sources\Stub\StubReferenceSource` reads
  `reference/default.<locale>.json` and `cities/default.json`. Features `source.reference` and `source.cities` are
  added to `config/sources.php` with default `stub` everywhere.
- `App\Services\Sources\Stub\StubResponder`: `fixture(string $name, Request $request): array` applies the scenario
  header and throws the mapped error for an error scenario. The stub controllers of native-only methods use it and
  answer with `SourceDriver::Stub`.
- Routes (`backend/routes/api.php`, names `api.v1.*`): `auth.telegram`, `me.show`, `settings.show`,
  `settings.update`, `reference.show`, `cities.index`, `events.store`. The public ones sit outside the
  `auth:sanctum` group; the whole `v1` group gets `throttle:api` until WP-40 attaches the named limiters.
- Resources: `MeResource`, `SettingsResource`, `ReferenceResource`, `CityStatsResource`, `SessionResource`.

## Files

- `backend/routes/api.php`; `backend/app/Http/Middleware/SetRequestLocale.php`; `backend/bootstrap/app.php` (group)
- `backend/app/Http/Controllers/Api/V1/{Auth/TelegramAuthController,MeController,SettingsController,ReferenceController,CityController,EventController}.php`
- `backend/app/Http/Requests/Api/V1/{Auth/TelegramSignInRequest,UpdateSettingsRequest,StoreEventRequest}.php`
- `backend/app/Http/Resources/Api/V1/{SessionResource,MeResource,SettingsResource,ReferenceResource,CityStatsResource}.php`
- `backend/app/Services/Sources/Data/{ReferenceData,CityData,NamedCode,CityStats}.php`;
  `backend/app/Services/Sources/Stub/{StubReferenceSource,StubResponder,StubUser}.php`; `backend/app/Exceptions/AccessDenied.php`
- `backend/config/sources.php`, `backend/config/telegram.php` (`support.username`), `backend/config/settings.php` (the
  option lists)
- `backend/resources/fixtures/v1/me/{default,first_launch,no_city,uz}.json`, `settings/default.json`,
  `reference/default.{ru,uz,en}.json`, `reference/single_city.ru.json`, `reference/no_bot.ru.json`,
  `cities/{default,no_daily}.json`
- `backend/tests/Feature/Api/V1/{SignInContractTest,MeContractTest,SettingsContractTest,ReferenceContractTest,CitiesContractTest,EventsContractTest}.php`
- `docs/api/openapi.json`, `frontend/packages/types/src/generated/api.ts` (regenerated); `docs/api/README.md`
- `backend/.env.example` (`TELEGRAM_SUPPORT_USERNAME`) — separate shared-file PR

## Steps

1. Tests first for each method: status, exact key set (`JsonShape` of WP-10), `meta.source`, errors, scenarios.
2. `SetRequestLocale` and the `AccessDenied` exception (403, `access_denied`, extra key `reason`).
3. Data objects and `ReferenceSource` methods; `StubReferenceSource`; the two features. Write the reference fixtures
   for three cities: `tashkent` (districts, zones, metro, median), `samarkand` (no metro, no zones, `has_median`
   false) and `tashkent_region` (`is_region: true`, zoom 9), with names in three locales.
4. `GET /reference`, `GET /cities` with resources (`php artisan make:resource …`, `make:controller …`).
5. `StubUser` and `POST /auth/telegram` (`php artisan make:request Api/V1/Auth/TelegramSignInRequest`).
6. `GET /me`, `GET /settings`, `PATCH /settings` on `StubResponder`.
7. `POST /events` with the body cap.
8. `composer openapi:export`, `pnpm types:generate`; read the generated types of all seven methods and fix the
   resources until every field of the examples above is typed (no `unknown`, no untyped object).
9. Pint, PHPStan, both CI gates; the env key PR.

## Behaviour to reproduce

- First launch: `locale_chosen: false` leads to the language picker; `city_chosen: false` (strictly) to the city
  picker when there is more than one city (BR-APP-050, BR-APP-055). The stub scenarios make both reachable.
- The no-access screen needs the reason and must work without a session: `GET /reference` is public for that reason
  (legacy `/api/bot` was).
- A stale `initData` is told apart from a bad one (`auth_expired` against `invalid_init_data`).
- Arrays are never `null`; `counts` always has three keys; a city without listings has zeros (the client reads them
  without guards in legacy, fixed by typing here).

## Tests

- Per method: happy path with the exact key set and types; each scenario; each error with status and `code`.
- Sign-in: missing `init_data`, 4 097 bytes, non-string → `422`; a `200` returns a token that authenticates `GET /me`;
  two sign-ins create two tokens for one stub user; the token lacks `media:write` (`403 forbidden` on a media write).
- Settings: one case per writable key; `quiet_hours` outside the options, `digest_hours: [9, 9]`, unknown city →
  `422` with the field name; `{}` → `200`.
- Reference and cities: answer without `Authorization`; `Accept-Language: uz` gives Uzbek names and
  `Content-Language: uz`; `uz-Latn` is read as `uz`; an unsupported language falls back to `ru`; flag set to an
  unbound driver → `503 source_unavailable`.
- Events: every catalogue name → `204`; unknown name → `204`; 9 KB body → `413`; no token → `401`.
- Contract: the exported OpenAPI has all seven paths; `pnpm types:check` is clean.

## Acceptance checklist

- [ ] The seven methods answer as specified with `meta.source = stub`; the error cases carry the listed codes.
- [ ] `403 access_denied` carries `reason` on sign-in and on bearer routes in the `access_*` scenarios.
- [ ] `GET /reference` and `GET /cities` work without a token and follow `Accept-Language`.
- [ ] Fixtures hold three cities and no real personal data; `@homi/testing`'s `fixture()` reads them.
- [ ] OpenAPI and generated types are committed and typed field by field; both CI gates are green.
- [ ] `TELEGRAM_SUPPORT_USERNAME` is announced and added to `backend/.env.example` in its own PR.
- [ ] Deployed to staging and production; a sign-in on staging returns a token and `GET /me` answers with it.

## Handoff

Empty.
