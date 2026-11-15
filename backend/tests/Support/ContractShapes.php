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

    /** A listing preview (WP-12): an item of every listing list and `data` of `GET /listings/{number}?preview=1`. */
    public const array LISTING_PREVIEW = [
        'number' => 'int', 'deal' => 'string', 'type' => 'string', 'title' => 'string',
        'price' => ['display' => 'string', 'period' => 'string', 'alt' => 'string', 'notes' => ['*' => 'string'], 'usd' => 'int', 'kind' => 'string'],
        'rooms' => 'int', 'area_total' => 'float|int', 'floor' => 'int', 'floors_total' => 'int',
        'district' => ['code' => 'string', 'name' => 'string'], 'place' => 'string', 'landmark' => 'string',
        'metro' => ['name' => 'string', 'km' => 'float|int'], 'center_km' => 'float|int',
        'location' => ['lat' => 'float|int', 'lon' => 'float|int'],
        'photos' => ['preview' => ['*' => 'string'], 'count' => 'int', 'cover' => 'string'],
        'has_video' => 'bool', 'pets_ok' => 'bool', 'is_owner' => 'bool', 'owner_verified' => 'bool',
        'posted' => ['label' => 'string', 'when' => 'string', 'at' => 'string'],
        'status_text' => 'string', 'market' => ['label' => 'string', 'median_delta' => 'float|int', 'tone' => 'string'],
        'favorite' => 'bool', 'viewed' => 'bool', 'source_ref' => ['channel' => 'string', 'post_id' => 'int'],
    ];

    /** The full card of `GET /listings/{number}` (WP-12): the preview plus the card's parts, no phone (DEC-52). */
    public const array LISTING_DETAILS = [
        ...self::LISTING_PREVIEW,
        'photos' => ['preview' => ['*' => 'string'], 'count' => 'int', 'cover' => 'string', 'items' => ['*' => 'string']],
        'market' => ['label' => 'string', 'code' => 'string', 'median_delta' => 'float|int', 'tone' => 'string'],
        'facts' => ['*' => ['key' => 'string', 'label' => 'string', 'value' => 'string']],
        'nearby' => ['*' => ['kind' => 'string', 'name' => 'string', 'km' => 'float|int', 'note' => 'string']],
        'stats' => ['days_listed' => 'int', 'publications' => 'int', 'channels' => 'int', 'views' => 'int'],
        'price_history' => ['*' => ['at' => 'string', 'channel' => 'string', 'url' => 'string', 'text' => 'string', 'kind' => 'string', 'price_usd' => 'int', 'change_pct' => 'float|int']],
        'geo_radius_m' => 'int',
        'author' => ['kind' => 'string', 'label' => 'string', 'count' => 'int'],
        'owner_label' => 'string',
        'contact' => ['has_phone' => 'bool', 'contact_url' => 'string', 'contact_paid' => 'bool'],
        'summary' => 'string',
        'offers' => ['*' => ['text' => 'string', 'url' => 'string']],
        'original' => ['text' => 'string', 'url' => 'string', 'deleted' => 'bool'],
        'sources' => ['*' => ['handle' => 'string', 'url' => 'string']],
        'comparison' => [
            'value' => 'float|int', 'own' => 'float|int', 'n' => 'int', 'metric' => 'string', 'scope' => 'string', 'rooms' => 'int',
            'near_class' => 'string', 'radius_km' => 'float|int', 'district' => 'string', 'place_value' => 'float|int', 'note' => 'string',
            'updated' => 'string', 'has_reason' => 'bool', 'price_usd' => 'int', 'price_per_m2' => 'float|int',
        ],
    ];

    /** The filters object (WP-12): the 25 keys in the documented order, in flow options and radars. */
    public const array FILTERS = [
        'city' => 'string', 'deal' => 'string', 'types' => ['*' => 'string'], 'districts' => ['*' => 'string'],
        'rooms_min' => 'int', 'rooms_max' => 'int', 'price_min' => 'int', 'price_max' => 'int', 'zones' => ['*' => 'string'],
        'near_metro' => 'bool', 'below_median' => 'bool', 'owner' => 'string', 'tenant' => 'string', 'pets' => 'bool',
        'pets_only' => 'bool', 'furnished' => 'bool', 'renovation' => ['*' => 'string'], 'floor_not_first' => 'bool',
        'floor_not_last' => 'bool', 'area_min' => 'int', 'area_max' => 'int', 'market' => 'string',
        'appliances' => ['*' => 'string'], 'posted_days' => 'int', 'polygon' => ['*' => ['*' => 'float|int']],
    ];

    /** `data` of `GET /listings/flow` (WP-12). */
    public const array FLOW = [
        'week' => 'int', 'days' => 'int',
        'options' => ['*' => ['code' => 'string', 'label' => 'string', 'rate' => 'string', 'count' => 'int', 'filters' => self::FILTERS]],
    ];

    /** `data` of `GET /listings/map` (WP-12). */
    public const array MAP = [
        'points' => ['*' => ['number' => 'int', 'lat' => 'float|int', 'lon' => 'float|int', 'label' => 'string', 'tone' => 'string', 'priced' => 'bool', 'usd' => 'int']],
        'total' => 'int',
    ];

    /** `data` of `POST /listings/{number}/contact` (WP-12), the only answer with the author's number. */
    public const array CONTACT = ['call_url' => 'string', 'expires_at' => 'string', 'phone' => 'string', 'phone_display' => 'string'];

    /** The answer of `GET /listings/count` and `GET /listings/new`; `count` is an integer in every case (fix of LB-API-055). */
    public const array LISTING_COUNT = ['success' => 'bool', 'data' => ['count' => 'int'], 'meta' => ['source' => 'string']];
}
