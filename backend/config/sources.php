<?php

use App\Services\Sources\Contracts\LandingSource;
use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\Contracts\ReferenceSource;
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

    'capabilities' => [
        'reference' => ['contract' => ReferenceSource::class, 'drivers' => ['stub' => StubReferenceSource::class]],
        'listings' => ['contract' => ListingSource::class, 'drivers' => []],
        'landing' => ['contract' => LandingSource::class, 'drivers' => []],
    ],

    'features' => [
        // WP-11
        'source.reference' => ['capability' => 'reference', 'default' => ['*' => 'stub']],
        'source.cities' => ['capability' => 'reference', 'default' => ['*' => 'stub']],
    ],
];
