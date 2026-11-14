# WP-41 — Legacy driver core, reference data and cities

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-40 |
| Size | about 2 200 changed lines without fixtures, L |
| Behaviour reference | `25` §4.5; `24` §3, §8.2 (Q-API-059, Q-API-060, Q-API-062), §8.3 (RK-25, RK-26, RK-28); `08` §1.1 … §1.6 and the rows of API-001 and API-002; `10` conflicts CF-006 and CF-017; the answers log of WP-02 (`decisions/<date>-operator-request.md`); WP-11 (the shapes to produce) |
| Needs from the production track | When the operator has issued the key: server env on staging, then production — `LEGACY_API_URL`, `LEGACY_SERVICE_KEY`, and, if the operator's contract differs from the defaults, `LEGACY_AUTH_HEADER`, `LEGACY_AUTH_PREFIX`, `LEGACY_RATE_PER_SECOND`; outbound HTTPS from the API hosts to the legacy host allowed; then run `php artisan legacy:ping` on the server and report the result. Until then nothing: the package merges and deploys without a key and no flag changes |

## Goal

HOMI's servers can call the legacy API safely: one client that sends the service key, limits and times its calls,
breaks the circuit when legacy fails, and turns legacy errors into v1 errors. The `legacy` driver exists for
`GET /reference` and `GET /cities` and returns exactly the shapes of WP-11. Locally and in CI the same code runs
against recorded fixtures.

## Scope

In: `config/legacy.php`; `LegacyClient` with limiter, retry, breaker, error mapping and locale mapping; the fixture
server for local and CI; golden fixtures for the two methods; `LegacyReferenceSource` with its translators and
caches; `legacy:ping`.

Out: listing methods (WP-42), contact and translation (WP-43), landing files (WP-60); switching any flag on
production (WP-48). No person, test or CI job calls legacy in this package or any other (DEC-33).

## Decisions that bind this package

- Only HOMI's servers hold the key; it exists in the server env of staging and production only (DEC-33, DEC-42,
  `25` §4.5). The repository, CI and developer machines never see it.
- The key's header, routes and limits are the operator's specification (Q-API-059, Q-API-060). They are
  configuration here, with defaults, so the package is not blocked by a missing answer (RK-28).
- One translator per method; legacy errors become v1 errors; `uz` becomes `uz_Latn` at this boundary only (`25` §4.5).
- Reference data and cities are cached for ten minutes; one outbound limiter; 15 s timeout; one retry for reads; a
  breaker that answers `source_unavailable` instead of queueing (`25` §4.5).
- A legacy release that changes a shape must fail a test, not a user (RK-26).

## Design

### Configuration (`backend/config/legacy.php`)

| Key | Env | Default | Meaning |
| --- | --- | ------- | ------- |
| `base_url` | `LEGACY_API_URL` | `https://legacy.invalid` | origin without a path |
| `service_key` | `LEGACY_SERVICE_KEY` | empty | empty ⇒ the driver is unavailable (never an anonymous call) |
| `auth.header` | `LEGACY_AUTH_HEADER` | `X-Service-Key` | header that carries the key |
| `auth.prefix` | `LEGACY_AUTH_PREFIX` | empty | text before the key, for example `Bearer ` |
| `locale.via`, `locale.name` | `LEGACY_LOCALE_VIA`, `LEGACY_LOCALE_NAME` | `header`, `Accept-Language` | how a request selects the language: `header`, `query` or `none` |
| `currency.via`, `currency.name` | `LEGACY_CURRENCY_VIA`, `LEGACY_CURRENCY_NAME` | `none`, `currency` | the same for the currency |
| `timeout`, `connect_timeout` | — | 15, 5 | seconds |
| `retry.times`, `retry.sleep_ms` | — | 1, 200 | `GET` only |
| `rate.per_second`, `rate.max_wait_ms`, `rate.background_share` | `LEGACY_RATE_PER_SECOND` | 5, 500, 0.4 | outbound limiter |
| `breaker.failures`, `breaker.window`, `breaker.open_for`, `breaker.open_max` | — | 5, 30, 30, 300 | seconds |
| `cache.reference`, `cache.cities`, `cache.card`, `cache.last_good` | — | 600, 600, 60, 86 400 | seconds |
| `fake` | `LEGACY_FAKE` | true in `local` and `testing`, false elsewhere | serve fixtures instead of the network |

A boot check in `SourceServiceProvider` throws when `fake` is true in production. The defaults for header, locale
and limits are the "default built without the answer" column of WP-02; when the operator answers, only env values
or these defaults change.

### `LegacyClient` (`App\Services\Sources\Legacy`)

```php
public function get(string $path, array $query = [], ?LegacyCall $call = null): array;   // decoded JSON
public function post(string $path, array $body = [], ?LegacyCall $call = null): array;
```

`LegacyCall` (readonly): `locale` (HOMI code), `currency`, `background` (bool). Each call, in order:

1. No key configured → `SourceUnavailable`.
2. Breaker open → `SourceUnavailable` at once.
3. Limiter: a one-second bucket in the cache (`RateLimiter`, key `legacy:out`). A user request waits for the next
   bucket for at most `max_wait_ms`, then gets `SourceUnavailable`. Background callers (`background: true`: the radar
   matcher, cache warmers) may use only `background_share` of each bucket and never wait.
4. Request: `Accept: application/json`, the auth header, the language per `locale.via` with the mapping `ru → ru`,
   `uz → uz_Latn`, `en → en` (`LegacyLocale`, the only class that knows `uz_Latn`), the currency per `currency.via`,
   `X-Request-Id` of the current request, `User-Agent: homi-api`. Repeated query keys are written the legacy way
   (`types=a&types=b`, `08` §1.3), not with brackets. No cookies, no redirects followed.
5. Retry: one more attempt after `sleep_ms` for a `GET` that ended in a connection error, a timeout, `502`, `503` or
   `504`. Never for `4xx`, never for `POST`.
6. Outcome mapping:

| Legacy outcome | Result |
| -------------- | ------ |
| `2xx` with a JSON object or array | the decoded value |
| `2xx` that is empty or not JSON | `LegacyContractError` |
| `404` | `SourceNotFound` (v1 `404 not_found`) |
| `422` | `LegacyContractError` — HOMI validated the request first, so legacy disagreeing is drift |
| `401`, `403` | `SourceUnavailable`; one `critical` log line "legacy refused the service key" (alert input); counts as a breaker failure |
| `429` | `SourceUnavailable`; the breaker opens for `Retry-After` (at most `open_max`) |
| `5xx`, timeout, connection error (after the retry) | `SourceUnavailable`; breaker failure |

`LegacyContractError` extends `SourceUnavailable` (the user sees `503 source_unavailable`) and logs at `error` the
path template and the offending key names, never values. The service key is never in a log, an exception message or
a Telescope entry: the client redacts the header in everything it reports.

**Breaker.** Consecutive failures inside `window` are counted in the cache; at `failures` the breaker opens for
`open_for`. After that one caller, chosen by a cache lock, sends a probe; success closes the breaker, failure opens
it again. State changes are logged at `warning`.

### Fixture server

`App\Services\Sources\Legacy\LegacyFakeServer::register()` installs an `Http::fake()` handler for `base_url` when
`legacy.fake` is true. It maps method and path to files under `backend/resources/fixtures/legacy/`, chooses the
language variant from the header or query the client sent, and answers `404 {"detail": "Not Found"}` for an unknown
path. Tests register it explicitly; in `local` it is registered at boot, so a developer can set a flag to `legacy`
with `sources:set` and see translated fixtures in the Mini App.

Golden fixtures, written from the contract of `08` (the listed rows and §1.8) and the parity mocks of the legacy tree
(read as a reference, never copied with real data), sanitised:

- `meta.ru.json`, `meta.uz_Latn.json`, `meta.en.json` — every key of the legacy meta answer, three cities matching the
  stub cities of WP-11, plus one variant `meta.no_cities.ru.json` (no `cities`, top-level `districts` and `zones`).
- `cities.json`; `errors/not_found.json`, `errors/validation.json` (the array-shaped `detail`), `errors/unauthorized.json`.

A file `backend/resources/fixtures/legacy/README.md` states the source of each fixture (audit row), the legacy
release it describes (the baseline of WP-02) and the rule "no real phone, name, address or channel".

### `LegacyReferenceSource` and its translators

- `reference(SourceContext)`: `GET /api/meta` → `ReferenceTranslator::toData(array): ReferenceData`, cached under
  `legacy:reference:<locale>` for `cache.reference`.
- `cities(SourceContext)`: `GET /api/cities` → `CityStatsTranslator`, cached under `legacy:cities`.
- Last good answer (RK-25): every successful result is also stored under `…:last` for `cache.last_good`. When the
  call fails and a last good copy exists, it is returned and a `warning` is logged; without one the failure
  propagates. This applies to these two methods only.

Translation rules for the meta answer:

| v1 field (WP-11) | Legacy field | Rule |
| ---------------- | ------------ | ---- |
| `rates.usd_uzs` | `usd_uzs` | number; missing or ≤ 0 → contract error |
| `map.tiles_url` | `tiles` | ignored: stays `null` until HOMI hosts tiles (`25` §3.8) |
| `features` | `new_features` | array, default `[]` |
| `locales` | `locales` | codes mapped back (`uz_Latn → uz`); unknown codes dropped |
| `cities[]` | `cities[]` | `code`, `name`; `center` `[lat, lon]` → object; `zoom` default 12; `is_region` = `zoom < 11`; `has_metro` = `metro === true`; `has_median` = `median !== false`; `districts`, `zones` default `[]` |
| `cities` when legacy sends none | top-level `districts`, `zones` | one city `tashkent` built from them (legacy client rule, API-001) |
| `renovations`, `appliances`, `price_presets` | same names | per-deal maps keep the three deal keys, missing ones become `[]` |

Ignored on purpose: the user part of meta (`locale`, `currency`, `theme`, `city`, `analytics`, `*_chosen`),
`bot_username` and `max_subscriptions` — HOMI has its own (WP-11). Required keys whose absence is a contract error:
`usd_uzs`, `renovations`, `appliances`, `price_presets`, and either `cities` or `districts`.

Cities: `counts` must have the three deals (missing → 0); `presets` → `price_presets`; `typical` → `typical_price`;
a city of the reference that legacy omits gets zeros and empty objects.

Binding: `config/sources.php` → `capabilities.reference.drivers.legacy = LegacyReferenceSource::class`. The
defaults of `source.reference` and `source.cities` stay `stub`.

### `legacy:ping`

`php artisan legacy:ping` calls `GET /api/cities` through the client and prints status class, latency and the number
of cities. It refuses to run when `legacy.fake` is true. It is the first thing the production track runs after
installing the key.

## Files

- `backend/config/legacy.php`, `backend/config/sources.php`
- `backend/app/Services/Sources/Legacy/{LegacyClient,LegacyCall,LegacyLocale,LegacyLimiter,LegacyBreaker,LegacyFakeServer,LegacyReferenceSource}.php`
- `backend/app/Services/Sources/Legacy/Translators/{ReferenceTranslator,CityStatsTranslator}.php`
- `backend/app/Exceptions/Sources/LegacyContractError.php`; `backend/app/Console/Commands/Sources/PingLegacy.php`;
  `backend/app/Providers/SourceServiceProvider.php`
- `backend/resources/fixtures/legacy/{meta.ru,meta.uz_Latn,meta.en,meta.no_cities.ru,cities}.json`,
  `errors/*.json`, `README.md`
- `backend/tests/Feature/Sources/Legacy/{LegacyClientTest,LegacyBreakerTest,LegacyLimiterTest,LegacyReferenceSourceTest,ReferenceGoldenContractTest}.php`,
  `backend/tests/Unit/Sources/Legacy/{ReferenceTranslatorTest,CityStatsTranslatorTest,LegacyLocaleTest}.php`
- `backend/.env.example` (key names, blank) and `docs/infrastructure/environments.md` — separate shared-file PR

## Steps

1. Read `08` §1 and the two rows, `25` §4.5, the answers log of WP-02 (it may be empty) and the skill
   `laravel-best-practices` (HTTP client). Tests first; every test file starts with `Http::preventStrayRequests()`.
2. `config/legacy.php` and the boot check (`php artisan make:class Services/Sources/Legacy/LegacyClient …`).
3. `LegacyClient`: headers, locale mapping, query encoding, timeouts, retry, error mapping, redaction.
4. `LegacyLimiter` and `LegacyBreaker` with frozen-clock tests.
5. Golden fixtures and their `README.md`; `LegacyFakeServer`.
6. `ReferenceTranslator`, `CityStatsTranslator` with unit tests on the fixtures.
7. `LegacyReferenceSource` with caches and the last-good copy; bind it.
8. `legacy:ping`. Locally: `php artisan sources:set source.reference legacy --by=<you> --reason=local-check`, open
   `GET /api/v1/reference`, see `meta.source = legacy`, then `sources:reset`.
9. Pint, PHPStan, `make ci-backend`; the env key PR; deploy (no flag change).

## Behaviour to reproduce

- With the flag on `legacy` and the fixture server, `GET /reference` and `GET /cities` have the same key set and
  types as with `stub` (the shape test of WP-10), in three locales.
- `Accept-Language: uz` on the v1 request becomes `uz_Latn` towards legacy and `uz` again in the answer (CF-006).
- Bot names and `limits.radars` in `GET /reference` are HOMI's with either driver.
- A legacy outage does not empty the directories: the last good answer is served for up to a day.
- Nothing waits in a queue for legacy: a call either goes out within half a second or answers `503`.

## Tests

- Client (with `Http::fake` sequences): the auth header and prefix from configuration; no key → unavailable and no
  request sent; `Accept-Language` mapping for the three locales; `locale.via = query`; repeated query keys
  serialised without brackets; timeout → one retry → unavailable; `503` then `200` → success after one retry; no
  retry on `404`, `422` or any `POST`; each row of the outcome table; empty `200` → contract error; the key and the
  header value absent from logs and exception messages (log spy).
- Limiter (frozen clock): `per_second` calls pass, the next waits into the next second, a call that would wait longer
  than `max_wait_ms` fails; background calls stop at their share and never wait.
- Breaker: five failures open it; while open no request is sent; after `open_for` exactly one probe is sent by
  concurrent callers; success closes; a `429` with `Retry-After: 120` opens for 120 s; `Retry-After: 9999` is capped.
- Translators: every row of the rule table; the no-cities variant; a missing required key → contract error naming
  the key; unknown extra keys ignored.
- Source: second call within ten minutes sends no request; cache key differs per locale; failure with a last good
  copy returns it and logs a warning; failure without one → `503 source_unavailable` on the route.
- Golden contract (RK-26): each golden fixture translates without error and the result has the shape of the stub
  fixture; deleting a required key from a copy fails the test with a readable message.
- Boot: `fake` true with `APP_ENV=production` throws; `legacy:ping` refuses under `fake`.

## Acceptance checklist

- [ ] `LegacyClient` sends the key in the configured header, never logs it, and never calls without a key.
- [ ] Timeouts, one read retry, the limiter and the breaker behave as specified and are covered by tests.
- [ ] Every legacy outcome maps to `not_found` or `source_unavailable`; no legacy error body reaches a v1 answer.
- [ ] `GET /reference` and `GET /cities` with the `legacy` driver equal the stub in shape, in `ru`, `uz` and `en`.
- [ ] The golden fixtures are sanitised and documented; a shape change fails `ReferenceGoldenContractTest`.
- [ ] No test or CI job opens a network connection (`Http::preventStrayRequests()` in every file).
- [ ] The env key names are announced; production flags are unchanged after the deploy.
- [ ] If the key exists: the production track ran `legacy:ping` on staging and it succeeded; otherwise the status of
      this package notes "merged, key pending" and the queue continues.

## Handoff

Empty.
