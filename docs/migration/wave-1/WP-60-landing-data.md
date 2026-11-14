# WP-60 — Landing data

| Field | Value |
| ----- | ----- |
| Stage | E |
| Status | TODO |
| Depends on | WP-41 |
| Size | about 1 300 changed lines, S–M; a third of it is fixtures |
| Behaviour reference | `08` (RES-010, RES-011, RES-012, RES-013); `03b` §1.5, LND-032, §3.1 (BR-LND-007 … BR-LND-012, BR-LND-014 … BR-LND-016), §4.1 (LB-LND-004, LB-LND-005, LB-LND-012); `25` §4.2 … §4.5, §7; the contract fixed by WP-13; data shapes and rules of KV-BE-154, KV-BE-155, KV-BE-156 (not their "builder from own database" design, which is Wave 2); the public-read rules of KV-BE-159 |
| Needs from the production track | (1) Server env on staging and production: `LEGACY_LANDING_URL` (the origin of the legacy landing, public files, no key) and `LEGACY_LANDING_MEDIA_PUBLIC_URL`. (2) An nginx location on the media host of each environment that proxies and caches the legacy landing photos (block under "Photos"); it must be reachable by browsers. (3) Outbound `https` from the application servers to the legacy landing host. (4) The scheduler runs every minute (asked earlier); one entry arrives. (5) After the deploy and the env values: `php artisan sources:set source.landing.live legacy --by=<who> --reason="WP-60"` and the same for `source.landing.pins`, staging first, then production; after the defaults PR of step 12 is deployed, `php artisan sources:reset <feature> --all --by=<who> --reason="WP-60 default"` for both and `php artisan sources:check`. No migration |

## Goal

`GET /api/v1/landing/live` and `GET /api/v1/landing/pins` stop answering from fixtures: a legacy driver reads the
three public data files of the legacy landing, caches them, translates them into the v1 shape that WP-13 fixed, and
points every photo and every link at HOMI. The landing of WP-61 then shows live numbers, pins and prices.

## Scope

In:

- `LegacyLandingSource`, the `legacy` driver of `LandingSource`, with its file client, cache, last-good copy,
  translators and the scheduled refresh.
- The photo address rewrite for landing snapshots and the request for the proxy location.
- Golden fixtures of the three files and the contract tests; the fixture server entries for local and CI.
- Switching the two features from `stub` to `legacy` on staging and production.

Out:

- The contract itself, the stub driver, the routes, requests, resources and OpenAPI entries — WP-13. This package
  changes the contract only by response headers.
- A `native` driver that builds the data from HOMI's own listings (the design of KV-BE-154 … KV-BE-156) — Wave 2.
- The statistics surface for SEO pages (KV-BE-159) — Wave 3.
- Rendering — WP-61.

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | `25` §7 and §4.2 — landing data comes from the public files of the legacy landing | The driver calls no legacy API method and sends no service key. `25` §4.2 names RES-010 … RES-012 and §7 names RES-010 … RES-013: the three data files are read by the driver, the snapshot photos (RES-013) are proxied |
| 2 | DEC-33 — only HOMI's servers call legacy | Locally and in CI the driver runs on recorded fixtures (`legacy.fake`); the real origin is set in the server env only |
| 3 | DEC-35, `25` §4.3 — a source per method | Two features, `source.landing.live` and `source.landing.pins`, each `stub` or `legacy`; switching needs no deploy and is reversible with `sources:reset` |
| 4 | DEC-40 — brand | Every `link` is rebuilt for HOMI's bot; the legacy bot name never leaves the backend |
| 5 | DEC-36 | Defects of the data are fixed in the translator: LB-LND-004 (point medians), LB-LND-005 (unused `dots`, no build time), LB-LND-012 (photo copies kept without end) |
| 6 | RK-25, `25` §4.5 | A failed fetch serves the last good copy; `503 source_unavailable` only when there is none |
| 7 | `25` §2 rule 7 | The answers hold no phone, no listing text, no author; the translator drops an item that contains a phone-like string |
| 8 | `25` §4.6 | OpenAPI and the generated types are regenerated if a header or a nullable changes; CI fails on drift |

## Design

### Driver

`App\Services\Sources\Legacy\LegacyLandingSource implements LandingSource` (contract of WP-10 and WP-13):

```php
public function live(SourceContext $context): LandingLive;
public function pins(string $deal, SourceContext $context): LandingPins;   // 'rent' or 'sale'
```

Bound in `config/sources.php` under `capabilities.landing.drivers.legacy`. The two features are moved the way
WP-48 moved the others: first a stored rule (`sources:set`), then a small PR that makes `legacy` their default for
`staging` and `production` (`local` and `testing` stay `stub`), then `sources:reset --all`. Since WP-48 the servers
run with `SOURCES_ALLOW_STUB=false`: until this package switches them, the two methods answer `503
source_unavailable` there, never a stub.

`App\Services\Sources\Legacy\LegacyLandingFiles` fetches a file:

- `GET <legacy.landing.base_url>/data/live.json`, `/data/pins-rent.json`, `/data/pins-sale.json`, with
  `Accept: application/json`, timeout `legacy.landing.timeout` (10 s), one retry. It does **not** go through
  `LegacyClient`: these files live on another host and must never receive the service key header.
- It sends `If-None-Match` and `If-Modified-Since` from the previous answer; `304` keeps the stored body.
- It uses `LegacyBreaker` of WP-41 with its own name (`landing`), so a dead landing host does not open the breaker
  of the listing methods, and the other way round.
- `LegacyFakeServer` of WP-41 gains the landing origin: when `legacy.fake` is true the three paths are served from
  `backend/resources/fixtures/legacy/landing/`.

Configuration, added to `backend/config/legacy.php`:

| Key | Env | Default | Meaning |
| --- | --- | ------- | ------- |
| `landing.base_url` | `LEGACY_LANDING_URL` | `https://legacy-landing.invalid` | origin of the legacy landing; unset ⇒ the driver is unavailable |
| `landing.media_public_url` | `LEGACY_LANDING_MEDIA_PUBLIC_URL` | empty | public prefix of the snapshot proxy; empty ⇒ pins are published without photos |
| `landing.fresh_seconds` | — | 900 | how long a fetched file is used without asking again |
| `landing.stale_seconds` | — | 86 400 | how long the last good copy may be served after fetches fail |
| `landing.timeout` | — | 10 | seconds |

### Cache and refresh

| Item | Rule |
| ---- | ---- |
| Keys | `legacy:landing:live`, `legacy:landing:pins:rent`, `legacy:landing:pins:sale` — each holds the raw body, `etag`, `last_modified`, `fetched_at` |
| Fresh | younger than `fresh_seconds`: answered from the cache, no network |
| Refresh on request | older: one caller refreshes under `Cache::lock("legacy:landing:<file>", 15)`; the others get the stored copy at once |
| Scheduled refresh | `php artisan landing:refresh`, every ten minutes, `onOneServer`: fetches the three files, so a page request almost never waits for legacy. Legacy rewrites the files about once a day and serves them with `max-age=1800` (LND-032, RES-010) |
| Failure | the stored copy is served while it is younger than `stale_seconds`; one `warning` log line per file and hour; `SourceUnavailable` (→ `503 source_unavailable`) only without a usable copy |
| Bad content | a body that is not JSON or fails the shape check is treated as a failure and logged as `LegacyContractError` (the release-drift signal of RK-26); the previous copy stays |

The translated answer is not cached separately: translation is cheap and depends on the language.

### Translation

`App\Services\Sources\Legacy\Translators\LandingLiveTranslator` and `LandingPinsTranslator`. Unknown keys are
ignored; a missing required key is a `LegacyContractError`.

`live.json` → `LandingLive`:

| Legacy | v1 | Rule |
| ------ | -- | ---- |
| `now` | `now` | ISO 8601 with offset |
| — | `generated_at` | the `Last-Modified` of the file, else the fetch time (fix of LB-LND-005: the page can tell how old the numbers are) |
| `day`, `week` | `day`, `week` | integers ≥ 0; `day` is clamped to `week` |
| `since` | — | dropped (always `null`, unused) |
| `latest[].id` | `latest[].number` | integer; at most 6 items, order kept (newest first) |
| `latest[].rooms`, `price_usd`, `area`, `seen_at` | same names | `price_usd` integer; `area` number or `null` |
| `latest[].delta` | `delta_pct` | integer per cent against the market |
| `latest[].tone` | `tone` | one of `good`, `high`, `same`, `mixed`, `no_repair`; anything else → `null` (BR-LND-012) |
| `latest[].district`, `district_code` | `district: {code, name}` | name in the request language, see below |
| `latest[].link` | `link` | rebuilt: `https://t.me/<bot username>?startapp=l_<number>-web` from `telegram.bot.username` (the legacy value names the legacy bot) |
| `sheet.all`, `sheet.demo` | same | `{count: int, per_day: float}`; `demo.count` clamped to `all.count` |

`pins-<deal>.json` → `LandingPins`:

| Legacy | v1 | Rule |
| ------ | -- | ---- |
| — | `generated_at` | as above |
| `bargains_week` | `bargains_week` | integer, or `null` (always `null` for `sale`) (BR-LND-009) |
| `pins[].id` | `number` | |
| `pins[].x`, `y` | `x`, `y` | per cent on the landing's static map image; a pin outside 0 … 100 is dropped |
| `rooms`, `price_usd`, `area`, `floor`, `floors_total`, `age_min`, `in_all`, `in_rooms` | same names | types as the contract (BR-LND-010, BR-LND-011) |
| `delta`, `tone` | `delta_pct`, `tone` | as for `latest` |
| `district`, `district_code` | `district: {code, name}` | |
| `point` | `point` | landmark name as legacy gives it (Russian); passed through for every language |
| `photo` (`img/snap/<id>.webp`) | `photo_url` | `<media_public_url>/<id>.webp`; see "Photos" |
| `link` | `link` | rebuilt as above |
| `is_owner` | `is_owner` | `true`, `false` or `null` |
| `medians[]` | `medians[]` | only rows whose `district_code` is a district: rows with the prefix `pt:` are dropped (fix of LB-LND-004 — the legacy page showed about two thousand point medians as district buttons). `[]` for `sale` (BR-LND-008) |
| `dots` | — | dropped (unused, LB-LND-005) |

Rules for both:

- **District names.** The files are the same for every language and carry Russian names. For `uz` and `en` the name
  is taken from the reference data (`ReferenceSource`, cached, WP-41) by `district_code`; a code the reference data
  does not know keeps the legacy name. Codes in the files use underscores (`mirzo_ulugbek`); the lookup compares
  after normalising `-` and `_`.
- **Withdrawn listings.** A listing number that HOMI already knows as gone (`listing_refs.gone_at`, WP-42) or that
  carries a takedown mark (WP-44, set by `delivery:withdraw` of WP-57) is left out of `latest` and `pins`
  (SEC-REQ-040). This is one indexed query per answer.
- **Privacy guard.** Any string value that matches the phone pattern of `PiiMasker` (WP-55; a local pattern if that
  class does not exist yet) removes its item and writes one `warning`.
- **No suspicion labels**: the answer has the tri-state `is_owner` only (SEC-REQ-045).
- The driver never formats text: the counter rules (BR-LND-007), the push list (BR-LND-014) and the «≈N в день»
  wording (BR-LND-015, BR-LND-016) are rules of the page (WP-61).

### Photos

Legacy keeps unsigned copies of channel photos at `img/snap/<id>.webp` without removing them (LB-LND-012, RES-013).
HOMI stores no copy. `photo_url` points at a proxy on HOMI's media host, as listing photos do (`25` §4.5, WP-42).
Request to the production track, on the media host of each environment:

```nginx
location ^~ /ls/ {                              # LEGACY_LANDING_MEDIA_PUBLIC_URL = https://<media host>/ls
    proxy_pass https://<legacy landing host>/img/snap/;
    proxy_set_header Host <legacy landing host>;
    proxy_ssl_server_name on;
    proxy_set_header Cookie ""; proxy_set_header Referer "";
    proxy_hide_header Set-Cookie; proxy_ignore_headers Set-Cookie;
    proxy_cache <a cache zone>; proxy_cache_key $uri;
    proxy_cache_valid 200 24h; proxy_cache_valid 404 5m;
    add_header X-Robots-Tag "noindex" always;
    add_header X-Content-Type-Options "nosniff" always;
    limit_except GET HEAD { deny all; }
}
```

A photo that legacy removes disappears from HOMI within a day; a pin that is filtered out as withdrawn is no longer
linked at all. While `landing.media_public_url` is empty the driver sets `photo_url` to `null`; if the resource of
WP-13 does not allow `null` there, make the field nullable in this PR and regenerate OpenAPI and the types.

### HTTP surface

The routes, the request class and the resources are those of WP-13. Added here:

| Aspect | Rule |
| ------ | ---- |
| Access | public, no token; the limiter the stub routes already use — if they have none, `throttle:landing` (120 per minute per IP) defined in `AppServiceProvider` |
| `meta.source` | `legacy` or `stub`, from the resolved driver |
| Caching headers | `Cache-Control: public, max-age=300, stale-while-revalidate=1800`; `ETag` (hash of the body); `Last-Modified` = `generated_at`; `Vary: Accept-Language`; `If-None-Match` → `304` |
| Language | `Accept-Language` picks `ru`, `uz` or `en` for district names; default `ru` |
| Errors | `422 validation_failed` for an unknown `deal`; `503 source_unavailable` without a usable copy; `429 rate_limited` |
| CORS | none: the landing app fetches on its server (WP-61); the methods are not called from browsers |

## Files

All paths under `backend/`.

- `app/Services/Sources/Legacy/{LegacyLandingSource,LegacyLandingFiles}.php`
- `app/Services/Sources/Legacy/Translators/{LandingLiveTranslator,LandingPinsTranslator}.php`
- `app/Services/Sources/Legacy/LegacyFakeServer.php` (the landing origin)
- `app/Console/Commands/Sources/RefreshLanding.php` (`landing:refresh`), `routes/console.php`
- `app/Http/Controllers/Api/V1/Landing/{LandingLiveController,LandingPinsController}.php` (headers, `304`)
- `config/legacy.php` (`landing.*`), `config/sources.php` (driver binding)
- `resources/fixtures/legacy/landing/{live,pins-rent,pins-sale}.json` and variants `live.missing_key.json`,
  `pins-rent.point_medians.json`, `pins-rent.phone.json`; `resources/fixtures/legacy/README.md` (their source)
- `tests/Unit/Sources/Legacy/{LandingLiveTranslatorTest,LandingPinsTranslatorTest}.php`
- `tests/Feature/Sources/Legacy/{LegacyLandingFilesTest,LegacyLandingSourceTest,LandingGoldenContractTest}.php`
- `tests/Feature/Api/V1/Landing/{LandingDriversContractTest,LandingHeadersTest}.php`
- Shared file, separate small PR: `.env.example` (`LEGACY_LANDING_URL`, `LEGACY_LANDING_MEDIA_PUBLIC_URL`);
  `docs/infrastructure/environments.md`
- `docs/api/openapi.json`, `frontend/packages/types/src/generated/api.ts` (only if a nullable or a header changed)

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

1. Read the specifications of WP-13 (contract, stub driver), WP-10 (flags, `SourceManager`) and WP-41 (client,
   breaker, fake server, fixture rules). Note differences in "Handoff".
2. Fixtures: write the three files from the shapes of `08` (RES-010 … RES-012) and `03b` §1.5 with synthetic values
   — six `latest` items, about twenty pins per deal, district medians plus a few `pt:` rows, no real listing
   numbers, channels or photos. Record their source in the fixtures `README.md`.
3. `LandingLiveTranslator`, `LandingPinsTranslator` with unit tests on the fixtures and the variant files.
4. `LegacyLandingFiles`: conditional requests, timeout, retry, breaker; the fake-server entries;
   `LegacyLandingFilesTest`.
5. `LegacyLandingSource`: cache, lock, last-good copy, the withdrawn filter, the district-name lookup; bind the
   driver; `LegacyLandingSourceTest`.
6. `landing:refresh` and its schedule entry.
7. Controllers: headers and `304`; `LandingHeadersTest`.
8. `LandingDriversContractTest`: the stub and the legacy driver answer the same schema; `LandingGoldenContractTest`.
9. Locally: `php artisan sources:set source.landing.live legacy --by=<you> --reason=local-check`, call the method,
   see `meta.source = legacy`, then `sources:reset`. Regenerate OpenAPI and the types if anything changed.
10. `make ci-backend`; the env key PR; PR; deploy with both features still on `stub`.
11. With the production track: env values, the nginx location, then the two `sources:set` calls on staging; check
    the two methods and three photo addresses; the same on production.
12. The defaults PR: `legacy` as the default of both features for `staging` and `production`, the case in
    `ServerDefaultsTest` of WP-48; after its deploy `sources:reset --all` for both and `sources:check`.

## Behaviour to reproduce

The legacy landing loads three JSON files and renders live blocks from them (LND-032). HOMI's landing gets the same
facts from two API methods; the table says what must stay true for the page of WP-61.

| # | Fact the page relies on | Rule | Kept by |
| - | ----------------------- | ---- | ------- |
| 1 | The counter shows `day` when it is at least 100, else `week` when at least 100, else nothing | BR-LND-007 | `day` and `week` are real numbers from the file, never padded |
| 2 | Up to four lock-screen pushes are built from `latest` | BR-LND-014 | `latest` keeps order and at most six items; fewer are not padded |
| 3 | The filter-sheet footer says «≈N в день», or a weekly number when `per_day` is below 1 | BR-LND-015, BR-LND-016 | `sheet.all`, `sheet.demo` with `per_day` as a float |
| 4 | Pins sit on the static map by `x`, `y`; the demo feed filters them by rooms, price, district, owner | BR-LND-010, BR-LND-011 | pin fields and types as the contract |
| 5 | Price tones | BR-LND-012 | the closed tone set, else `null` |
| 6 | The savings block uses district medians for 1 … 3 rooms | BR-LND-008 | district rows only; the page filters rooms |
| 7 | The bargains line appears when `bargains_week` is at least 100 | BR-LND-009 | the number as legacy gives it; `null` for sale |
| 8 | Every card and push links into the bot | LND-030 | `link` to HOMI's bot with `startapp=l_<number>-web` |
| 9 | Data may be a day old; a failed load leaves static text | LND-032 | `generated_at`; last-good copy; `503` only without one |

Defects fixed:

| # | Defect | Fix |
| - | ------ | --- |
| 1 | LB-LND-004 — point medians shown as districts | dropped in the translator |
| 2 | LB-LND-005 — constant cache key on the data files, dead `dots`, no build time | `ETag`, short `max-age`, `generated_at`; `dots` dropped |
| 3 | LB-LND-012 — photo copies of third parties kept without end and unsigned | no copy in HOMI; a one-day proxy cache; `noindex`; withdrawn listings unlinked |

Edge cases:

- Fewer than six `latest` items or an empty `pins` array: answered as they are; the page handles empty states.
- `tone` values the page does not know (`no_repair` appears for sale): passed when in the closed set, else `null`.
- The legacy host answers `200` with an HTML error page: treated as bad content; the previous copy stays.
- The files are rewritten while being read: a body that fails JSON decoding is retried once.
- A listing merged at legacy keeps the number legacy publishes; HOMI does not resolve aliases here.
- Staging and production each have their own cache; both read the same legacy files.

## Tests

| # | Layer | Test | Cases |
| - | ----- | ---- | ----- |
| 1 | Unit | `LandingLiveTranslatorTest` | field-by-field mapping of the fixture; `since` absent; `link` names HOMI's bot and never the legacy one; unknown tone → `null`; `day` above `week` clamped; a missing `latest` key → `LegacyContractError`; no value of the answer matches the phone pattern |
| 2 | Unit | `LandingPinsTranslatorTest` | mapping; `pt:` medians dropped; `dots` absent; pin outside 0 … 100 dropped; `photo_url` built from the prefix, `null` without it; `is_owner` tri-state; sale → `bargains_week` null and `medians` empty; an item with a phone-like string dropped with a warning |
| 3 | Feature | `LegacyLandingFilesTest` | sends no service key header; `If-None-Match` and `304`; timeout and one retry; breaker `landing` opens without touching the listing breaker; the fake server serves the fixtures |
| 4 | Feature | `LegacyLandingSourceTest` | fresh copy → no request; old copy → one refresh under the lock, concurrent callers served the stored copy; fetch fails → last good copy and one warning; no copy → `SourceUnavailable`; HTML body → previous copy kept; uz and en district names from the reference data, unknown code keeps the legacy name; a number with `gone_at` or a takedown mark is absent |
| 5 | Contract | `LandingDriversContractTest` | stub and legacy answers validate against the same schema for `live`, `pins?deal=rent`, `pins?deal=sale` |
| 6 | Contract | `LandingGoldenContractTest` | each recorded file fits its translator; removing a required key from a copy of the fixture fails with the key named |
| 7 | Feature | `LandingHeadersTest` | no token needed; `Cache-Control`, `ETag`, `Last-Modified`, `Vary`; `If-None-Match` → `304`; `deal=x` → `422`; `meta.source` follows the feature; `503` body in the envelope; the limiter answers `429` |
| 8 | Static | OpenAPI and generated types current (`make ci-backend`, `make ci-frontend`) | |

## Acceptance checklist

- [ ] With both features on `legacy`, `GET /api/v1/landing/live` and `/landing/pins?deal=rent|sale` answer in the
      shape of WP-13 with `meta.source = legacy`.
- [ ] Every `link` opens HOMI's bot of that environment; the string of the legacy bot name does not occur in any
      answer.
- [ ] `medians` contains district rows only; `dots` and `since` do not occur.
- [ ] District names follow `Accept-Language` in ru, uz and en.
- [ ] Three `photo_url` values of an answer load from HOMI's media host on staging and on production.
- [ ] With the legacy landing host unreachable (blocked in a staging test) the methods keep answering from the
      stored copy; after the copy is cleared they answer `503 source_unavailable`.
- [ ] No answer contains a phone number, a listing text or an author.
- [ ] `sources:list` shows `legacy` as the default of both features on staging and production with empty rules;
      `sources:check` exits 0. A rule that names `stub` is refused there, and without a driver the methods answer
      `503 source_unavailable` (tried on staging).
- [ ] `landing:refresh` runs from the scheduler; a page request does not wait for legacy.
- [ ] The contract tests for both drivers are green; OpenAPI and the generated types are current; `make ci-backend`
      is green.

## Handoff

Empty — nobody has started this package.
