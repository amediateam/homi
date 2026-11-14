# WP-10 — API v1 framework: source drivers, flags, stubs, OpenAPI, generated types

| Field | Value |
| ----- | ----- |
| Stage | A |
| Status | TODO |
| Depends on | WP-03 (`openapi-typescript`, the test runners and the `pgsql` group are installed) |
| Size | about 2 400 changed lines without generated files, L |
| Behaviour reference | `25` §4.1, §4.3, §4.4, §4.6; `24` §3; ADR-0003, ADR-0007 and ADR-0017 (written by WP-01); `HANDOFF.md` T3 and T5; skills `.claude/skills/pennant-development/`, `.claude/skills/scramble-development/` |
| Needs from the production track | Approve one migration on production (`source_flag_changes`, additive, empty). Know two new artisan commands that are run on the servers from stage C on: `php artisan sources:list` and `php artisan sources:set …`. No env key, no nginx change |

## Goal

The plumbing that every later API package uses exists and is proven on a test capability: a controller asks for a
capability and gets the driver that the method's flag names; the answer says which driver produced it; a console
command changes the driver without a deploy and the change is logged; stubs read fixtures; the OpenAPI file and the
TypeScript types are generated, committed and checked in CI.

## Scope

In: error codes in the envelope; `meta.source` and cursor helpers; the driver enum, the three capability contracts,
selector and manager; flag configuration, Pennant definitions, three console commands, the audit table; the fixture
store and the scenario switch; Scramble export with its CI check and the docs gate; type generation with its CI
check; the typed helper in `@homi/api-client`; `docs/api/README.md`.

Out: any method of `25` §4.2 (WP-11 … WP-13 add them, each with its data objects, fixtures and stub driver); the
legacy drivers (WP-41, WP-42); authentication and rate limits (WP-40).

## Decisions that bind this package

- One layer, a driver per method (DEC-35, `25` §4.3): one interface per capability, one Pennant feature per method
  whose value names the driver, defaults per environment in configuration, overrides for everyone, a share of users
  or named users, console commands, a log of who changed what.
- Contract first (DEC-41, `25` §4.6): routes, form requests and resources are the contract; OpenAPI and the types are
  generated from them and CI fails when a committed file is stale.
- Honest source (`25` §4.1, §4.4, RK-27): every answer carries `meta.source`; the client's "demo data" marker reads it.
- Nobody but HOMI's servers calls legacy (DEC-33): nothing in this package opens a network connection.
- Envelope and errors are those of ADR-0007; tokens those of ADR-0003.

## Design

### Envelope: codes, source, cursor

Every error body is `{"success": false, "message": string, "code": string, "errors"?: object}`. `code` is always
present. Add `App\Exceptions\ApiException` (abstract; `status`, `code`, optional `headers`, optional extra top-level
keys) and extend `App\Http\ApiExceptionRenderer` with this table:

| Case | Status | `code` |
| ---- | ------ | ------ |
| `ValidationException` | 422 | `validation_failed` (with `errors`) |
| `AuthenticationException` | 401 | `unauthenticated` |
| `AuthorizationException`, missing token ability | 403 | `forbidden` |
| `ModelNotFoundException`, unknown route | 404 | `not_found` |
| `ThrottleRequestsException` | 429 | `rate_limited` (keeps `Retry-After`) |
| body over the size cap | 413 | `payload_too_large` |
| any `ApiException` | its own | its own |
| other HTTP exceptions | theirs | `http_error` |
| anything else | 500 | `server_error` (message hidden unless `APP_DEBUG`) |

Two `ApiException` classes ship here: `App\Exceptions\Sources\SourceUnavailable` (503, `source_unavailable`) and
`App\Exceptions\Sources\SourceNotFound` (404, `not_found`). `MediaException` keeps its body and gains `code` equal to
its `reason`.

`ApiController` gains two helpers; the existing ones stay:

```php
/** @param array<string, mixed> $meta */
protected function sourced(mixed $data, SourceDriver $source, array $meta = [], int $status = 200): JsonResponse;
// body: {"success": true, "data": …, "meta": {"source": "stub|legacy|native", …$meta}}

/** @param iterable<int, mixed> $items */
protected function cursorPage(iterable $items, ?string $nextCursor, SourceDriver $source): JsonResponse;
// body: {"success": true, "data": [...], "meta": {"source": …, "next_cursor": string|null}}
```

`meta.next_cursor` is always present on a cursor list and `null` ends it. Methods that answer `204` carry no body and
therefore no `meta`.

### Drivers, contracts, manager

- `App\Enums\SourceDriver`: `Stub = 'stub'`, `Legacy = 'legacy'`, `Native = 'native'`.
- Contracts in `App\Services\Sources\Contracts`: `ReferenceSource`, `ListingSource`, `LandingSource`. They are
  created here **without methods**. Each contract package adds its methods together with the data objects, the stub
  implementation and the fixtures, so no package depends on a class that does not exist yet. The target signatures:

```php
interface ReferenceSource {
    public function reference(SourceContext $context): ReferenceData;                 // WP-11
    /** @return list<CityStats> */
    public function cities(SourceContext $context): array;                            // WP-11
}
interface ListingSource {                                                             // WP-12
    public function feed(ListingQuery $query, SourceContext $context): ListingPage;
    public function count(SearchFilters $filters, SourceContext $context): int;
    public function flow(SearchFilters $filters, SourceContext $context): FlowEstimate;
    public function map(SearchFilters $filters, SourceContext $context): MapPoints;
    public function details(int $number, SourceContext $context): ListingDetails;     // throws SourceNotFound
    public function preview(int $number, SourceContext $context): ListingSummary;     // throws SourceNotFound
    /** @param list<int> $numbers @return array<int, ListingSummary> keyed by number; unknown numbers are absent */
    public function previews(array $numbers, SourceContext $context): array;
    public function contact(int $number, SourceContext $context): ListingContact;
    public function translation(int $number, SourceContext $context): ListingTranslation;
}
interface LandingSource {                                                             // WP-13
    public function live(SourceContext $context): LandingLive;
    public function pins(string $deal, SourceContext $context): LandingPins;
}
```

- `App\Services\Sources\SourceContext` (readonly): `locale` (`ru`, `uz`, `en`), `currency` (`USD`, `UZS`), `?User
  $user`, `?string $scenario`. Built by `SourceContext::fromRequest(Request)`: locale from `Accept-Language`
  (first supported tag, else `ru`), currency from the user's settings once WP-40 exists (until then `USD`), scenario
  from the header below. `SourceContext::system(string $locale = 'ru')` serves jobs and the bot.
- `App\Services\Sources\SourceManager`: `resolve(string $feature, SourceContext $context): ResolvedSource`, where
  `ResolvedSource` holds `SourceDriver $driver` and the instance. Typed shortcuts `reference(string $feature, …)`,
  `listings(…)`, `landing(…)` return the contract type for PHPStan. A driver that is not bound for the capability
  throws `SourceUnavailable`. A controller reads:

```php
$source = $this->sources->listings('source.listings.feed', $context);
return $this->cursorPage(ListingPreviewResource::collection($page->items), $page->nextCursor, $source->driver);
```

### Flags

`backend/config/sources.php`:

```php
return [
    'allow_stub' => (bool) env('SOURCES_ALLOW_STUB', true),
    'capabilities' => [
        'reference' => ['contract' => ReferenceSource::class, 'drivers' => []],   // driver name => class
        'listings'  => ['contract' => ListingSource::class,   'drivers' => []],
        'landing'   => ['contract' => LandingSource::class,   'drivers' => []],
    ],
    'features' => [
        // name => capability and the default driver per environment
        'source.reference' => ['capability' => 'reference', 'default' => ['*' => 'stub']],
    ],
];
```

`default` is a map of `APP_ENV` name to driver; `*` is the fallback. The full list, filled by the contract packages:
`source.reference`, `source.cities`, `source.listings.feed`, `source.listings.count`, `source.listings.flow`,
`source.listings.map`, `source.listings.card`, `source.listings.contact`, `source.listings.translation`,
`source.landing.live`, `source.landing.pins`. Native-only methods have no feature (`25` §4.3).

**How the value is stored.** Pennant's database store keeps what a resolver returned for each scope, so a default
resolved once per user would go stale when the default changes. To avoid that, each feature has exactly one stored
value, in Pennant's global scope, and it is a rule:

```json
{"everyone": "legacy", "share": {"driver": "native", "percent": 10}, "users": {"42": "native"}}
```

All three keys are optional; an empty rule means "use the default". `SourceServiceProvider::boot()` defines every
configured feature with a static empty rule (`Feature::define($name, [])`); the rule is read with
`Feature::globally()->value($name)` and written with `Feature::globally()->activate($name, $rule)`. This is verified
against the installed package (`vendor/laravel/pennant`: `Decorator::globally()`, `GlobalScope`, a non-closure
resolver is a static value); confirm the calls with `search-docs` before use.

`App\Services\Sources\SourceSelector::driverFor(string $feature, ?User $user): SourceDriver`, in this order:

1. `users[<user id>]` when a user is given;
2. `share.driver` when a user is given and `crc32("<feature>:<user id>") % 100 < share.percent` (stable per user and
   feature, so a user does not flip between requests);
3. `everyone`;
4. the configured default for the environment.

A resolved `stub` while `allow_stub` is false, or an unknown driver name, falls to the configured default and logs
an error once per minute; if the default itself is `stub`, the method answers `503 source_unavailable`.

**Commands** (`php artisan make:command … --no-interaction`):

| Command | Does |
| ------- | ---- |
| `sources:list` | Table: feature, capability, default here, stored rule, bound drivers |
| `sources:set {feature} {driver} [--share=N] [--user=ID]* --by= --reason=` | Without options sets `everyone`; `--share` sets the share rule; `--user` sets named users. Refuses a driver that is not bound for the capability, and `stub` when `allow_stub` is false |
| `sources:reset {feature} [--share] [--user=ID]* [--all] --by= --reason=` | Removes that part of the rule; `--all` empties it |
| `sources:check` | Exit 1 when a feature resolves to an unbound driver in this environment; for `make dev-check` and deploy smoke tests |

`--by` and `--reason` are required. Each change inserts a row into `source_flag_changes` (`id`, `feature`,
`old_rule` json, `new_rule` json, `actor` string 64, `reason` string 255, `environment` string 32, `created_at`) and
writes a `notice` log line. A listener on Pennant's `FeatureUpdated`, `FeatureUpdatedForAllScopes` and
`FeatureDeleted` events records any change that did not come through the commands with actor `unknown`, so the log
has no gaps.

### Stubs

- Fixtures live in `backend/resources/fixtures/v1/<area>/<name>.json`, in the shape of the data objects (not of the
  legacy answer), sanitised: no real phones, names, addresses or channel names.
- `App\Services\Sources\Stub\FixtureStore`: `get(string $name): array` (decoded once per process), throws on an
  unknown name. Native-only methods use the same store from their stub controllers until stage C.
- Scenario switch: the request header `X-Stub-Scenario: <name>` selects `<name>.<scenario>.json` or a named error.
  It is read only when the resolved driver is `stub`; an unknown scenario is ignored. Reserved for every stub method:
  `source_unavailable` (503), `rate_limited` (429), `unauthenticated` (401), `forbidden` (403). The contract packages
  list their own scenarios. The Mini App forwards a cookie as this header outside production (stage B decides the
  cookie name); the header is harmless on production because it can only pick another fixture.
- Stub images: `php artisan sources:publish-stub-media` copies the placeholder images of
  `backend/resources/fixtures/media/` to the public media disk under `stub/`, so fixture photo addresses resolve
  under `MEDIA_PUBLIC_URL` in every environment (WP-12 adds the images and uses the command).

### OpenAPI

- `Gate::define('viewApiDocs', …)` in `AppServiceProvider`, using the existing `App\Http\DashboardAccess` rule that
  guards Horizon and Telescope.
- Composer scripts: `openapi:export` (`@php artisan scramble:export`) and `openapi:check` (export, then
  `git diff --exit-code -- ../docs/api/openapi.json`); `ci:check` runs `openapi:check` last.
- `.github/workflows/backend.yml`: add `docs/api/openapi.json` to both `paths` lists.
- Read `.claude/skills/scramble-development/` first. The acceptance is concrete: for a route that returns
  `$this->sourced(new XResource(…), …)`, the exported `data` schema is the schema of `XResource` and `meta.source` is
  an enum of the three driver names. If the helper hides the resource type from Scramble's inference, document the
  response on the controller method the way the skill describes; do not hand-edit the exported file.
- Error responses: one shared `ApiError` schema with `code`; each form request documents its `422`.

### Types and the typed client

- `@homi/types`: script `"generate": "openapi-typescript ../../../docs/api/openapi.json -o src/generated/api.ts"`;
  `src/index.ts` re-exports `paths` and `components`, widens `ApiSuccess<T>` with
  `meta?: { source?: 'stub' | 'legacy' | 'native'; next_cursor?: string | null } & …` and requires `code` in
  `ApiFailure`.
- Root script `"types:generate"` and `"types:check"` (generate, then `git diff --exit-code -- packages/types/src/generated`).
  `.github/workflows/frontend.yml` runs `types:check` after install and gains `docs/api/openapi.json` in `paths`;
  `make ci-frontend` runs it too.
- `@homi/api-client`: add the missing `put` method, and `createTypedClient(client)` whose
  `call(method, path, { params?, query?, body?, signal? })` is typed from `paths`: `path` must be a key of `paths`
  that has `method`; `params` fills `{number}`-style segments; the result is `ApiSuccess<data of the 200/201 answer>`.
  `ApiError.code` becomes non-optional with fallback `'unknown'`.

## Files

- `backend/app/Exceptions/ApiException.php`, `backend/app/Exceptions/Sources/{SourceUnavailable,SourceNotFound}.php`
- `backend/app/Http/ApiExceptionRenderer.php`, `backend/app/Http/Controllers/Api/V1/ApiController.php`,
  `backend/app/Exceptions/MediaException.php`
- `backend/app/Enums/SourceDriver.php`; `backend/app/Services/Sources/{SourceContext,SourceManager,SourceSelector,ResolvedSource,SourceRule}.php`;
  `backend/app/Services/Sources/Contracts/{ReferenceSource,ListingSource,LandingSource}.php`;
  `backend/app/Services/Sources/Stub/FixtureStore.php`
- `backend/app/Providers/SourceServiceProvider.php` (registered in `bootstrap/providers.php`); `backend/config/sources.php`
- `backend/app/Console/Commands/Sources/{ListSources,SetSource,ResetSource,CheckSources,PublishStubMedia}.php`
- `backend/app/Models/SourceFlagChange.php`, its factory, `backend/database/migrations/<date>_create_source_flag_changes_table.php`,
  `backend/app/Listeners/RecordSourceFlagChange.php`
- `backend/resources/fixtures/v1/.gitkeep`, `backend/resources/fixtures/media/.gitkeep`
- `backend/tests/Support/{JsonShape,FakeCapability}.php`; tests under `backend/tests/Feature/Sources/` and
  `backend/tests/Feature/Http/`
- `backend/composer.json` (scripts), `.github/workflows/backend.yml`, `.github/workflows/frontend.yml`, `Makefile`
- `docs/api/openapi.json` (generated), `docs/api/README.md` (new: envelope, codes, `meta.source`, cursor, scenarios)
- `frontend/packages/types/{package.json,src/index.ts,src/generated/api.ts}`, `frontend/packages/api-client/src/{index.ts,typed.ts,typed.test.ts}`,
  `frontend/package.json`

## Steps

1. Read the two skills named above, ADR-0007 and ADR-0017. Tests first for each step.
2. Error codes: `ApiException`, the renderer table, the two source exceptions. Update the existing exact-body
   assertions in `tests/Feature/Http/ApiExceptionRenderingTest.php` to include `code`.
3. `SourceDriver`, the three empty contracts, `SourceContext`, `sourced()` and `cursorPage()`.
4. `config/sources.php`, `SourceServiceProvider`, `SourceSelector`, `SourceManager`; a test-only capability
   (`Tests\Support\FakeCapability` with a stub and a "legacy" double) proves resolution end to end.
5. The migration, model and listener for `source_flag_changes`; the four `sources:*` commands.
6. `FixtureStore`, the scenario header, `sources:publish-stub-media`.
7. The docs gate, the Composer scripts, the first `docs/api/openapi.json`, the workflow change. Prove the check: change
   a resource locally without exporting and see `composer openapi:check` fail.
8. Type generation, `types:check`, the workflow change. Prove it the same way.
9. `put` and `createTypedClient` with a type-level test on the existing media path.
10. `docs/api/README.md`. Pint, PHPStan, `make ci-backend`, `make ci-frontend`.

## Behaviour to reproduce

No legacy behaviour. Rules that later packages rely on:

- `meta.source` names the driver that produced `data`, never the configured one. A method that falls back says what
  it fell back to.
- The selector never throws on a malformed stored rule: it ignores the rule, logs, and uses the default.
- Changing a flag takes effect on the next request without a deploy, a cache clear or a restart.
- The same user gets the same driver for a feature while the rule is unchanged.

## Tests

- Renderer: one case per row of the code table; a `503` from `SourceUnavailable`; `Retry-After` kept on `429`.
- Selector (dataset): empty rule → default per environment (`local`, `staging`, `production`, fallback `*`); `everyone`
  wins over default; `share` 0, 10 and 100 over 1 000 synthetic user ids (0 → none, 100 → all, 10 → between 6 % and
  14 %, and stable on a second call); named user wins over share; no user → never share or named; malformed rule →
  default and one log line; `stub` with `allow_stub` false → default.
- Manager: bound driver returns the instance and the driver; unbound driver → `503 source_unavailable`; `meta.source`
  in the response equals the resolved driver for stub and for the "legacy" double.
- Commands: `sources:set` for everyone, share and users writes the rule and one audit row with actor and reason;
  missing `--by` fails; unbound driver refused; `sources:reset --all`; `sources:list` output; `sources:check` exit
  codes. A direct `Feature::globally()->activate()` in a test still produces an audit row with actor `unknown`.
- Stubs: `FixtureStore` unknown name throws; the scenario header is honoured for `stub` and ignored for the "legacy"
  double; each reserved scenario gives its status and code.
- `pgsql` group: two concurrent `sources:set` calls leave a valid rule and two audit rows.
- OpenAPI: a Pest test exports to a temporary path and asserts that the document has `meta.source` as an enum on the
  test route's schema and a shared error schema with `code`.
- Frontend (Vitest): `createTypedClient` builds the URL from `params` and `query`, sends `PUT`, maps an error body to
  `ApiError` with `code`; type-level assertions (`expectTypeOf`) on a media path.

## Acceptance checklist

- [ ] Every error answer of `/api/v1` has `code`; the existing media and intake tests are green.
- [ ] A test capability answers through `stub` and through a second driver, and `meta.source` follows the flag.
- [ ] `sources:set` and `sources:reset` change behaviour on the next request; every change has an audit row with who
      and why; `sources:list` shows defaults and rules.
- [ ] A stored rule can target everyone, a percentage of users and named users; the three contracts exist.
- [ ] `docs/api/openapi.json` is committed and `composer openapi:check` fails on a stale file; the docs UI is gated.
- [ ] `frontend/packages/types/src/generated/api.ts` is committed and `pnpm types:check` fails on a stale file.
- [ ] `@homi/api-client` has `put` and a typed `call`; `docs/api/README.md` describes envelope, codes, `meta.source`,
      cursor lists and stub scenarios.
- [ ] `make ci-backend` and `make ci-frontend` are green; the migration is named in the PR description.
- [ ] Deployed to staging and production; `php artisan sources:list` runs on staging.

## Handoff

Empty.
