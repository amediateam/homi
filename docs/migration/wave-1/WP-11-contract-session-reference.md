# WP-11 — Contract: session, me, settings, reference, cities, events

| Field | Value |
| ----- | ----- |
| Stage | A |
| Status | WAITING (merged in #45 on 2026-11-15; production track: `TELEGRAM_SUPPORT_USERNAME`, deploy, staging check of `GET /reference` without a token and of sign-in → `GET /me`) |
| Depends on | WP-10 |
| Size | about 2 000 changed lines without generated files and fixtures, M |
| Behaviour reference | `25` §3.4, §4.1, §4.2; `08` §1.5 and the rows of API-001, API-002, API-003, API-024, API-025, API-034 (API-036 since the intake of `index-BnFvC-Ft.js`); `02` BR-API-123; `03` §3.3 (events), §4 (BR-APP-050, BR-APP-054, BR-APP-055); `16` §4.1 (SEC-REQ-002, SEC-REQ-004, SEC-REQ-005), SEC-REQ-022; task `tasks/backend/KV-BE-045-settings.md` (preset sets, partial update) |
| Needs from the production track | Two new env key names, announced in the PR. `TELEGRAM_SUPPORT_USERNAME`, blank by default (public name of the support account; staging and production values set by that track). `RADAR_CREATION_ENABLED`: leave it **unset** on staging and production — radars stay switched off there until the bot's sending package sets it (WP-57, DEC-51). After the deploy, check on staging that `GET /api/v1/reference` answers without a token and reports `radars_enabled: false` |

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
- Radars cannot be created or changed until the bot can deliver them (DEC-51). The switch is HOMI's configuration,
  `config('radar.creation_enabled')`; `GET /reference` reports it as `radars_enabled`, so every client knows before
  it offers a radar.
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
of `private`, `invite`, `full`, `blocked`, `join`, `paused`. The client shows an unknown or missing reason as
`private` (BR-APP-054). A missing token ability is the different code `forbidden`.

`paused` is the sixth reason: the whole service is on pause (legacy since `index-CIa0Ldj2.js`, the audit's BR-API-194).
Its scenario is `access_paused`, known wherever this specification names "the five `access_*`". Natively it is
answered by the switch of WP-40, which is off by default (DEC-60); until then only the scenario answers it
(*added by the intake of `index-CIa0Ldj2.js`*).

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
**stub user** (`users.email = 'stub@homi.invalid'`, created on first use with a fixed `name` and a random
`password`, because both columns are `NOT NULL` until WP-40), so `auth:sanctum` works unchanged on every other
route. Nothing is verified. Scenarios: `auth_expired`, `invalid_init_data`, `access_private`, `access_invite`,
`access_full`, `access_blocked`, `access_join`. *Corrected while executing:* `data.user` follows the scenarios of
`GET /me` (`first_launch`, `no_city`, `uz`), so one header value gives the same user on both methods. The two `401`
errors are `App\Exceptions\Identity\{InitDataExpired, InvalidInitData}`, the names WP-40 planned. They are created
here without WP-40's internal reason.

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
          "quiet_hours": {"from": 23, "to": 8}, "digest_hours": [9, 19], "card_style": "classic",
          "options": {
            "locales": [{"code": "ru", "name": "Русский"}, {"code": "uz", "name": "Oʻzbekcha"}, {"code": "en", "name": "English"}],
            "currencies": [{"code": "USD", "name": "Доллары"}, {"code": "UZS", "name": "Сумы"}],
            "quiet_hours": [null, {"from": 22, "to": 8}, {"from": 23, "to": 8}, {"from": 0, "to": 9}, {"from": 23, "to": 7}],
            "digest_hours": [[9], [9, 19], [12, 20], [19]]}}}
```

Hours are whole hours of Asia/Tashkent wall-clock, 0 … 23; `quiet_hours: null` means off; a window may cross
midnight. `PATCH` takes any subset of the seven writable keys and returns the full object:

| Body field | Rule |
| ---------- | ---- |
| `locale` | `ru`, `uz`, `en` |
| `currency` | `USD`, `UZS` |
| `theme` | `auto`, `light`, `dark` |
| `city` | a city code of `GET /reference` |
| `quiet_hours` | `null` or `{from, to}` equal to one of `options.quiet_hours` |
| `digest_hours` | an array equal to one of `options.digest_hours` |
| `card_style` | `classic`, `rich`; anything else, `null` included, is `422` (fix of LB-APP-051) |

Unknown keys are ignored; an empty body is a `200` no-op; a bad value is `422 validation_failed` with `errors.<key>`.
Setting `locale` or `city` makes `locale_chosen` or `city_chosen` true in `GET /me`. Changed against legacy: `PUT`
with partial semantics became `PATCH`; `quiet` (`off` or `HH-HH`) and `digest` (`HH` or `HH,HH`) became structured;
`locales`, `currencies` and the two preset lists moved under `options`; `theme` and `city` are returned. The preset
sets are the ones the legacy bot offers (task `KV-BE-045`). Stub: `PATCH` validates and returns the fixture with the
sent keys overlaid; nothing is stored.

*Added by the intake of legacy release `index-BnFvC-Ft.js` (2026-11-19; `03` SCR-048, BR-APP-074, DEC-57):*
`card_style` is the style in which the bot sends listing cards, `classic` (photo and caption) or `rich` (swipeable
photos, data as a table). It is always present in the answer, `classic` by default until Q-API-067 says otherwise;
legacy may omit it or send `null`, and any other value crashed the legacy settings screen (LB-APP-051). It is the
seventh writable key. Scenario `card_rich` answers `GET` and `PATCH` with `card_style: "rich"`
(`settings/card_rich.json`; legacy parity scenario `settings-cards-rich-saved`). Enum `App\Enums\CardStyle`.

### `POST /settings/card-sample` — bearer `app:write`; legacy: API-036

*Added by the intake of legacy release `index-BnFvC-Ft.js` (2026-11-19).* No body; a body is ignored. The bot sends
the user one sample listing card in the saved `card_style`. Answer:

```json
{"data": {"sent": true}}
```

`sent` is always a boolean and the answer is always JSON, never `204` (fix of LB-APP-052); `false` means the bot could
not send the card. Native in Wave 1: HOMI's bot sends the sample (WP-53 builds the card, WP-57 sends it). Which
listing the sample shows, when `sent` is `false` and the per-user rate limit are open (Q-API-067); the bot side of
`rich` is Q-BOT-046. Stub: nothing is sent; `sent: true`, and scenario `card_sample_unsent` answers `sent: false`;
the four reserved scenarios and the five `access_*` apply. Route name `api.v1.settings.card-sample`;
`App\Http\Controllers\Api\V1\CardSampleController` with `CardSampleResource`.

### `GET /reference` — public, cacheable per locale; legacy: the shared part of the meta method and the bot names (API-001, API-003)

```json
{"data": {
  "bot": {"username": "homi_stub_bot", "support_username": "homi_stub_support"},
  "limits": {"radars": 10},
  "radars_enabled": true,
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

`bot.*`, `limits.*` and `radars_enabled` come from HOMI's configuration (`telegram.bot.username`, which exists; the
new `telegram.support.username`; and the new `backend/config/radar.php`, created here with two keys: `max` —
`(int) env('RADAR_MAX', 10)`, whose env key WP-45 announces — and `creation_enabled` —
`(bool) env('RADAR_CREATION_ENABLED', false)`; WP-45 extends the file). They are filled by the resource for every
driver and are not part of a fixture or of a legacy answer; everything else comes from
`ReferenceSource::reference()`. `radars_enabled` is a boolean and always present: `false` means that radars cannot
be created or changed yet (DEC-51; the radar methods of WP-13 follow the same key). `backend/.env.example` sets
`RADAR_CREATION_ENABLED=true`, and `backend/phpunit.xml` sets it to `true` as well, so the local stack, the test
suites and the CI jobs (which build their `.env` from the example) run with radars on; staging and production leave
the key unset until WP-57. `bot.username` and `support_username` may be
`null`; `map.tiles_url` is `null` until HOMI hosts tiles (`25` §3.8); price presets are whole USD. Names are
localised by `Accept-Language`. `is_region` replaces the legacy rule "zoom below 11". Changed against legacy: one
public method instead of an authenticated one plus `/api/bot`; `metro` and `median` became `has_metro` and
`has_median`; `center` became an object; `max_subscriptions` became `limits.radars`; `new_features` became
`features` (HOMI announces only `pets`: legacy `cards`, since release `index-BnFvC-Ft.js`, is not announced,
DEC-57); the top-level `districts` and `zones` fallback is gone (every city carries its own); `radars_enabled`
is new (legacy has no such switch). Scenarios:
`single_city` (only `tashkent`), `no_bot` (`bot.username: null`). *Corrected while executing:*
- `single_city` filters the default fixture of the locale, so it needs no fixture of its own and stays localised.
- `no_bot` cannot be a fixture, because the bot name is configuration. `ReferenceController` answers it when the
  driver is `stub`.
- The answer may be cached: `Cache-Control: public, max-age=300` and `Vary: Accept-Language`. The radar switch
  therefore reaches clients within five minutes.

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

Answer `204`. *Corrected while executing:* a present `props` that is not an object is also `422 validation_failed`
(the table says object). It is checked in `StoreEventRequest::after()`, because the `array` rule alone is exported as
a list of strings, and `EventController` documents it with `#[BodyParameter]`. Event names and property names are the legacy ones (`03` §3.3), so one vocabulary serves both
products; `listing_id` carries the listing number. Catalogue:

| Name | Properties |
| ---- | ---------- |
| `app_launch` | `entry` (`link`, `news`, `menu`), `ms`, `v`, `sdk`, `js`, `platform`, `tg` (the Telegram WebApp version, a string; legacy since release `index-BnFvC-Ft.js`) |
| `app_opened` | `entry`, `listing_id` (only for `link`), `ms` |
| `app_error` | `v`, `error` = `{kind (boot, error, rejection, render), name, message, source, stage (boot, app), screen, tg, platform}` |
| `follow_prompt_shown`, `follow_prompt_expired`, `follow_prompt_closed` | none |
| `return_prompt_shown` | `n` (integer ≥ 0, the `count` of `GET /listings/new`), `custom` (boolean) |
| `return_prompt_expired`, `return_prompt_closed` | `custom` |
| `feed_radar_shown`, `feed_radar_closed` | `custom` |
| `home_screen_offered`, `home_screen_added`, `home_screen_closed` | none |
| `chat_access_declined`, `chat_access_allowed` | none |
| `listing_shared`, `original_copied`, `contact_write` | `listing_id` |
| `original_opened` | `listing_id`, `src` (`button`, `video`, `sources`, `price_history`, `offers`) |
| `contact_call` | `listing_id`, `via` (`tel`, `browser`), `src` (`text`, `author`) |

`custom` says whether the filters of the nudge differ from the defaults of their deal and city (BR-APP-013). The
five `return_prompt_*` and `feed_radar_*` names belong to the return banner and the radar card in the feed, added by
legacy release `index-DY_DH7h-.js` (SCR-046, SCR-047, API-034, BR-API-123). An unknown `name` or unknown properties
are accepted with `204` and not stored (WP-47). Errors: `401 unauthenticated`
(an event without a session is never stored, SEC-REQ-022); `413 payload_too_large`; `422 validation_failed` only when
`name` is missing or not a string. Over the rate limit the answer is still `204` and the event is dropped. Changed
against legacy: properties moved from the top level into `props`; nothing was renamed. Stub: validates and answers
`204`. The body cap is checked first in `StoreEventRequest` (`prepareForValidation()`): a raw body
(`$this->getContent()`) over 8 192 bytes throws `Illuminate\Http\Exceptions\PostTooLargeException`, which the
renderer of WP-10 answers as `413 payload_too_large`.

### Data objects, source and routes

- `App\Services\Sources\Data\ReferenceData` (rates, tiles URL, features, locales, cities, renovations, appliances,
  price presets), `CityData`, `NamedCode`, `CityStats`; each `final readonly` with `fromArray()` used by the fixture
  store and, later, by the legacy translator.
- `ReferenceSource` gains `reference()` and `cities()`; `App\Services\Sources\Stub\StubReferenceSource` reads
  `reference/default.<locale>.json` and `cities/default.json`. Features `source.reference` and `source.cities` are
  added to `config/sources.php` with default `stub` everywhere.
- `App\Services\Sources\Stub\StubResponder`: `fixture(string $name, Request $request, array $scenarios = [], array $errors = []): array`
  returns the fixture `$name`, or the one that `$scenarios` (scenario name → fixture name, for example
  `['first_launch' => 'me/first_launch']`) gives for the scenario header, and throws the mapped error for a reserved
  or method-specific error scenario (`$errors`: scenario name → a closure that returns the exception). A scenario that
  is neither in the map nor an error of the method is ignored (WP-10). The stub controllers of native-only methods use
  it and answer with `SourceDriver::Stub`. *Corrected while executing:*
  - the five `access_*` refusals are known by every method of `StubResponder`, as "common errors on every bearer
    route" asks;
  - `check(Request $request, array $errors = []): SourceContext` throws the same errors for a method without a
    fixture (`POST /events`);
  - it rests on `FixtureStore::pick()` and `failForReserved()` of WP-10.
- Routes (`backend/routes/api.php`, names `api.v1.*`): `auth.telegram`, `me.show`, `settings.show`,
  `settings.update`, `reference.show`, `cities.index`, `events.store`; since the intake of `index-BnFvC-Ft.js` also
  `settings.card-sample`. Today the file has one `v1` group that
  carries `auth:sanctum` and holds the media routes: split it into an outer group (prefix, name, `SetRequestLocale`,
  `throttle:api`) and an inner `auth:sanctum` group that keeps the media routes unchanged. The public routes sit in
  the outer group; `throttle:api` stays until WP-40 attaches the named limiters.
- Resources: `MeResource`, `SettingsResource`, `ReferenceResource`, `CityStatsResource`, `SessionResource`.

## Files

- `backend/routes/api.php`; `backend/app/Http/Middleware/SetRequestLocale.php`; `backend/bootstrap/app.php` (only
  if a middleware alias is registered for it)
- `backend/app/Http/Controllers/Api/V1/{Auth/TelegramAuthController,MeController,SettingsController,ReferenceController,CityController,EventController}.php`
- `backend/app/Http/Requests/Api/V1/{Auth/TelegramSignInRequest,UpdateSettingsRequest,StoreEventRequest}.php`
- `backend/app/Http/Resources/Api/V1/{SessionResource,MeResource,SettingsResource,ReferenceResource,CityStatsResource}.php`
- `backend/app/Services/Sources/Data/{ReferenceData,CityData,NamedCode,CityStats}.php`;
  `backend/app/Services/Sources/Stub/{StubReferenceSource,StubResponder,StubUser}.php`; `backend/app/Exceptions/AccessDenied.php`
- `backend/config/sources.php`, `backend/config/telegram.php` (`support.username`), `backend/config/settings.php` (the
  option lists), `backend/config/radar.php` (new: `max`, `creation_enabled`), `backend/phpunit.xml`
  (`RADAR_CREATION_ENABLED=true`)
- `backend/resources/fixtures/v1/me/{default,first_launch,no_city,uz}.json`, `settings/default.json`,
  `reference/default.{ru,uz,en}.json`, `cities/{default,no_daily}.json` (*corrected:* no `single_city` or `no_bot`
  fixture, see `GET /reference`). The fixture store of WP-10 now accepts dots after the area (`reference/default.ru`).
- *Added while executing:*
  - enums `App\Enums\{Locale,Currency,Theme,Deal,AccessReason}`. `Locale`, `Currency` and `Theme` have `fromField()`
    because the OpenAPI export does not resolve `BackedEnum::from()`;
  - `App\Services\Sources\Data\{Fields,GeoPoint}` (strict reads, and the city centre) and
    `App\Services\Identity\SettingsOptions`;
  - `App\Http\Resources\Api\V1\{NamedCodeResource,CityResource}`;
  - `App\Exceptions\Identity\{InvalidInitData,InitDataExpired}`;
  - `backend/tests/Support/ContractShapes.php` (the expected shapes, also for WP-42 and WP-48),
    `backend/tests/Unit/Sources/ReferenceDataTest.php` and `backend/tests/Feature/Http/{ApiRoutesTest,SetRequestLocaleTest}.php`.
- `backend/tests/Feature/Api/V1/{SignInContractTest,MeContractTest,SettingsContractTest,ReferenceContractTest,CitiesContractTest,EventsContractTest}.php`
- `docs/api/openapi.json`, `frontend/packages/types/src/generated/api.ts` (regenerated); `docs/api/README.md`
- `backend/.env.example` (`TELEGRAM_SUPPORT_USERNAME`, blank; `RADAR_CREATION_ENABLED=true`) — separate shared-file
  PR

## Steps

1. Tests first for each method: status, exact key set (`JsonShape` of WP-10), `meta.source`, errors, scenarios.
2. `SetRequestLocale` and the `AccessDenied` exception (403, `access_denied`, extra key `reason`).
3. Data objects and `ReferenceSource` methods; `StubReferenceSource`; the two features. Write the reference fixtures
   for three cities, with names in three locales:
   - `tashkent`: districts, zones, metro, median;
   - `andijan`: no metro, no zones, `has_median` false;
   - `tashkent_region`: `is_region: true`, zoom 9.

   *Corrected while executing*, after the audit:
   - `samarkand` is not a legacy city: the bot treats it as unsupported (`04`). `andijan` is one, and has no metro and
     no median (`06`, `04`).
   - The district codes are the 12 slugs of `03b`, with underscores as in the landing data (`yunusobod`, not
     `yunusabad`). The region carries its five towns with SEO pages.
   - The zones are «Центр (внутри кольца)» and «Ближе к центру» (`06`, `07`).
   - The price presets are those of the bot (`04`).
   - Renovation and appliance codes are not documented (Q-DATA-030) and are placeholders.
   - The audit has no coordinates, so the centres are approximate public ones.
4. `GET /reference`, `GET /cities` with resources (`php artisan make:resource …`, `make:controller …`);
   `config/radar.php` with its two keys and the `phpunit.xml` entry.
5. `StubUser` and `POST /auth/telegram` (`php artisan make:request Api/V1/Auth/TelegramSignInRequest`).
6. `GET /me`, `GET /settings`, `PATCH /settings` on `StubResponder`.
7. `POST /events` with the body cap.
8. `composer openapi:export`, `pnpm types:generate`; read the generated types of all seven methods and fix the
   resources until every field of the examples above is typed (no `unknown`, no untyped object).
9. Pint, PHPStan, both CI gates; the PR for the two env keys. Its description tells both developers to add
   `RADAR_CREATION_ENABLED=true` to their existing local `backend/.env` (a file made before this package lacks the
   line and would run with radars off), and tells the production track to leave the key unset.

## Behaviour to reproduce

- First launch: `locale_chosen: false` leads to the language picker; `city_chosen: false` (strictly) to the city
  picker when there is more than one city (BR-APP-050, BR-APP-055). The stub scenarios make both reachable.
- The no-access screen needs the reason and must work without a session: `GET /reference` is public for that reason
  (legacy `/api/bot` was).
- A stale `initData` is told apart from a bad one (`auth_expired` against `invalid_init_data`).
- `radars_enabled` has no legacy counterpart: legacy lets a user create a radar at any time. HOMI reports `false`
  until its bot can deliver (DEC-51), and the Mini App and the bot then say "soon" instead of offering a radar.
- Arrays are never `null`; `counts` always has three keys; a city without listings has zeros (the client reads them
  without guards in legacy, fixed by typing here).

## Tests

- Per method: happy path with the exact key set and types; each scenario; each error with status and `code`.
- Sign-in: missing `init_data`, 4 097 bytes, non-string → `422`; a `200` returns a token that authenticates `GET /me`;
  two sign-ins create two tokens for one stub user; the token lacks `media:write` (`403 forbidden` on a media write).
- Settings: one case per writable key; `quiet_hours` outside the options, `digest_hours: [9, 9]`, unknown city →
  `422` with the field name; `{}` → `200`. Since the intake of `index-BnFvC-Ft.js`: `card_style` `rich` round-trips,
  `compact` and `null` → `422`, scenario `card_rich`; `POST /settings/card-sample` answers `sent: true`,
  `card_sample_unsent` answers `sent: false`, `app:read` alone is `403 forbidden`, no token is `401`
  (`CardSampleContractTest`).
- Reference and cities: answer without `Authorization`; `Accept-Language: uz` gives Uzbek names and
  `Content-Language: uz`; `uz-Latn` is read as `uz`; an unsupported language falls back to `ru`; flag set to an
  unbound driver → `503 source_unavailable`; `radars_enabled` is `true` with `radar.creation_enabled` on and
  `false` with it off (set through `config()` in the test), with the same answer otherwise.
- Events: every catalogue name → `204`; unknown name → `204`; 9 KB body → `413`; no token → `401`.
- Contract: the exported OpenAPI has all seven paths; `pnpm types:check` is clean.

## Acceptance checklist

- [ ] The seven methods answer as specified with `meta.source = stub`; the error cases carry the listed codes.
- [ ] `403 access_denied` carries `reason` on sign-in and on bearer routes in the `access_*` scenarios.
- [ ] `GET /reference` and `GET /cities` work without a token and follow `Accept-Language`.
- [ ] Fixtures hold three cities and no real personal data; `@homi/testing`'s `fixture()` reads them.
- [ ] OpenAPI and generated types are committed and typed field by field; both CI gates are green.
- [ ] `GET /reference` carries `radars_enabled` from `config('radar.creation_enabled')`, whatever the driver.
- [ ] `TELEGRAM_SUPPORT_USERNAME` and `RADAR_CREATION_ENABLED` are announced and added to `backend/.env.example` in
      their own PR; the PR says that staging and production leave `RADAR_CREATION_ENABLED` unset.
- [ ] Deployed to staging and production; a sign-in on staging returns a token and `GET /me` answers with it.

## Handoff

**2026-11-15, development track (Claude Code).** Branch `feat/wp-11-contract-session-reference`, PR #45, ready for
review.

- **Done:** steps 1–9. Each contract test was seen failing before its code.
  - `make ci-backend` → exit 0 (Pest 343 passed, 4 skipped); `make ci-frontend` → exit 0; `make test-pgsql` → 4 passed.
  - The env-key PR #46 for `backend/.env.example` is open next to #45.
- **Decisions taken here:** each is marked *corrected while executing* or *added while executing* in the sections
  above.
- **Merged** on 2026-11-15 on «сливай #45» (merge commit `2e3d3bf`; `backend` run 43657763081 and `frontend` run
  43657762964 green on `main`). The env keys followed on «сливай #46» (`e1a65f2`, `backend` run 43658186462 green).
  The key names are in `docs/infrastructure/environments.md`, and this status and the `CLAUDE.md` update are in the
  follow-up docs PR #47.
- **Next:**
  1. ~~review and merge~~ (done);
  2. both developers add `RADAR_CREATION_ENABLED=true` and `TELEGRAM_SUPPORT_USERNAME=` to their local environment
     file (the agent cannot write it: the committed deny rule `Edit(**/.env)`);
  3. the production track sets `TELEGRAM_SUPPORT_USERNAME`, leaves `RADAR_CREATION_ENABLED` unset, deploys, and
     checks on staging that `GET /reference` answers without a token with `radars_enabled: false` and that a sign-in
     token opens `GET /me`;
  4. set the status to `DONE`.

### Notes for the generated types

Every field of the examples is typed. Two maps stay open by design:
- `props` of an event: its properties depend on the event name;
- `meta` of every sourced answer: `sourced()` of WP-10 spreads `$meta`.

`scramble:analyze` keeps two `JR001` warnings for `MeResource` and `SettingsResource`. They wrap a decoded fixture,
not a model, until WP-40.
