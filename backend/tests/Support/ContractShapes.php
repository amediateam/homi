<?php

namespace Tests\Support;

/**
 * The expected `JsonShape` of each `/api/v1` answer (WP-11 …): the stub contract tests assert them, and the
 * contract tests of the legacy and native drivers (WP-42, WP-48) assert the same constants.
 */
final class ContractShapes
{
    /** The object of `GET /api/v1/me`, also `data.user` of a sign-in (WP-11). */
    public const array ME = [
        'locale' => 'string', 'locale_chosen' => 'bool', 'currency' => 'string', 'theme' => 'string',
        'city' => 'string', 'city_chosen' => 'bool', 'team' => 'bool',
        'analytics' => ['distinct_id' => 'string', 'autocapture' => 'bool', 'replay' => 'bool', 'replay_rate' => 'float|int'],
    ];

    /** The object of `GET /api/v1/settings` and of `PATCH /api/v1/settings` (WP-11). */
    public const array SETTINGS = [
        'locale' => 'string', 'currency' => 'string', 'theme' => 'string', 'city' => 'string',
        'quiet_hours' => ['from' => 'int', 'to' => 'int'],
        'digest_hours' => ['*' => 'int'],
        'options' => [
            'locales' => ['*' => ['code' => 'string', 'name' => 'string']],
            'currencies' => ['*' => ['code' => 'string', 'name' => 'string']],
            'quiet_hours' => ['*' => ['from' => 'int', 'to' => 'int']],
            'digest_hours' => ['*' => ['*' => 'int']],
        ],
    ];

    /**
     * The contract of `GET /api/v1/reference` (WP-11): public, per locale, HOMI's configuration added for every driver.
     * A JSON number without a fraction decodes as an int, so rates and coordinates are `float|int`.
     */
    public const array REFERENCE = [
        'success' => 'bool',
        'data' => [
            'bot' => ['username' => 'string', 'support_username' => 'string'],
            'limits' => ['radars' => 'int'],
            'radars_enabled' => 'bool',
            'rates' => ['usd_uzs' => 'float|int'],
            'map' => ['tiles_url' => 'null'],
            'features' => ['*' => 'string'],
            'locales' => ['*' => ['code' => 'string', 'name' => 'string']],
            'cities' => ['*' => [
                'code' => 'string', 'name' => 'string', 'center' => ['lat' => 'float|int', 'lon' => 'float|int'], 'zoom' => 'int',
                'is_region' => 'bool', 'has_metro' => 'bool', 'has_median' => 'bool',
                'districts' => ['*' => ['code' => 'string', 'name' => 'string']],
                'zones' => ['*' => ['code' => 'string', 'name' => 'string']],
            ]],
            'renovations' => [
                'rent_long' => ['*' => ['code' => 'string', 'name' => 'string']],
                'rent_daily' => ['*' => ['code' => 'string', 'name' => 'string']],
                'sale' => ['*' => ['code' => 'string', 'name' => 'string']],
            ],
            'appliances' => ['*' => ['code' => 'string', 'name' => 'string']],
            'price_presets' => ['rent_long' => ['*' => 'int'], 'rent_daily' => ['*' => 'int'], 'sale' => ['*' => 'int']],
        ],
        'meta' => ['source' => 'string'],
    ];

    /** The contract of `GET /api/v1/cities` (WP-11): one entry per city of the reference data, whole USD. */
    public const array CITIES = [
        'success' => 'bool',
        'data' => ['*' => [
            'code' => 'string',
            'counts' => ['rent_long' => 'int', 'rent_daily' => 'int', 'sale' => 'int'],
            'price_presets' => ['rent_long' => ['*' => 'int'], 'rent_daily' => ['*' => 'int'], 'sale' => ['*' => 'int']],
            'typical_price' => ['rent_long' => 'int', 'sale' => 'int'],
        ]],
        'meta' => ['source' => 'string'],
    ];
}
