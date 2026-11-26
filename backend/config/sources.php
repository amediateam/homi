<?php

use App\Services\Sources\Contracts\LandingSource;
use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\Contracts\ReferenceSource;
use App\Services\Sources\Legacy\LegacyReferenceSource;
use App\Services\Sources\Stub\StubLandingSource;
use App\Services\Sources\Stub\StubListingSource;
use App\Services\Sources\Stub\StubReferenceSource;

/*
|--------------------------------------------------------------------------
| Source drivers of /api/v1 (ADR-0017, WP-10)
|--------------------------------------------------------------------------
| Not the intake collectors: `App\Models\Source` and the `sources` table are a different thing (Phase 3).
|
| `capabilities`: one contract per capability and the class bound to each driver name (`stub`, `legacy`,
| `native`). A driver that is not bound answers `503 source_unavailable`.
|
| `features`: one Pennant feature per method. `default` maps an `APP_ENV` name to a driver; `*` is the
| fallback. An operator overrides the default with `php artisan sources:set` (for everyone, a share of users or
| named users); `sources:list` shows defaults and rules. The contract packages add the features together with
| their stub drivers (WP-11: `source.reference`, `source.cities`; WP-12: `source.listings.*`; WP-13:
| `source.landing.*`). Native-only methods have no feature.
|
| Feature names contain dots: read the map whole (`config('sources.features')[$name]`), never through a dotted key.
*/

return [
    // Off from WP-48 on production: a rule or default that names `stub` then falls back or answers 503.
    'allow_stub' => (bool) env('SOURCES_ALLOW_STUB', true),

    // Stub mode of the native methods for the end-to-end suite (WP-40): while on, `AnswerNativeStubs` answers the
    // routes of `App\Services\Sources\Stub\NativeStubs` with their stub bodies. Allowed only in `local` and
    // `testing`: `SourceServiceProvider` refuses to boot with it anywhere else, so no stub can answer on a server.
    'native_stubs' => (bool) env('SOURCES_NATIVE_STUBS', false),

    'capabilities' => [
        // WP-41: the legacy driver of `GET /reference` and `GET /cities`; the defaults stay `stub` until WP-48.
        'reference' => ['contract' => ReferenceSource::class, 'drivers' => ['stub' => StubReferenceSource::class, 'legacy' => LegacyReferenceSource::class]],
        'listings' => ['contract' => ListingSource::class, 'drivers' => ['stub' => StubListingSource::class]],
        'landing' => ['contract' => LandingSource::class, 'drivers' => ['stub' => StubLandingSource::class]],
    ],

    'features' => [
        // WP-11
        'source.reference' => ['capability' => 'reference', 'default' => ['*' => 'stub']],
        'source.cities' => ['capability' => 'reference', 'default' => ['*' => 'stub']],

        // WP-12
        'source.listings.feed' => ['capability' => 'listings', 'default' => ['*' => 'stub']],
        'source.listings.count' => ['capability' => 'listings', 'default' => ['*' => 'stub']],
        'source.listings.new' => ['capability' => 'listings', 'default' => ['*' => 'stub']],
        'source.listings.flow' => ['capability' => 'listings', 'default' => ['*' => 'stub']],
        'source.listings.map' => ['capability' => 'listings', 'default' => ['*' => 'stub']],
        'source.listings.card' => ['capability' => 'listings', 'default' => ['*' => 'stub']],
        'source.listings.contact' => ['capability' => 'listings', 'default' => ['*' => 'stub']],
        'source.listings.translation' => ['capability' => 'listings', 'default' => ['*' => 'stub']],

        // WP-13
        'source.landing.live' => ['capability' => 'landing', 'default' => ['*' => 'stub']],
        'source.landing.pins' => ['capability' => 'landing', 'default' => ['*' => 'stub']],
    ],
];
