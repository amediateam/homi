<?php

namespace Tests\Support;

/** Normalised filter arrays (the 25 keys of `SearchFilters::toArray()`, WP-12) for the search tests. */
final class FilterArrays
{
    /** The documented key order of the filters object (`WP-12` "Filter parameters"). */
    public const array KEYS = [
        'city', 'deal', 'types', 'districts', 'rooms_min', 'rooms_max', 'price_min', 'price_max', 'zones',
        'near_metro', 'below_median', 'owner', 'tenant', 'pets', 'pets_only', 'furnished', 'renovation',
        'floor_not_first', 'floor_not_last', 'area_min', 'area_max', 'market', 'appliances', 'posted_days', 'polygon',
    ];

    /**
     * The defaults of BR-APP-001 for Tashkent long rent, with overrides.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function defaults(array $overrides = []): array
    {
        return [
            'city' => 'tashkent', 'deal' => 'rent_long', 'types' => ['apartment'], 'districts' => [],
            'rooms_min' => null, 'rooms_max' => null, 'price_min' => null, 'price_max' => null, 'zones' => [],
            'near_metro' => false, 'below_median' => false, 'owner' => 'any', 'tenant' => null, 'pets' => false,
            'pets_only' => false, 'furnished' => null, 'renovation' => [], 'floor_not_first' => false,
            'floor_not_last' => false, 'area_min' => null, 'area_max' => null, 'market' => null, 'appliances' => [],
            'posted_days' => null, 'polygon' => null,
            ...$overrides,
        ];
    }

    /**
     * The canonicalisation of `SearchFilters::canonicalHash()` written out independently of the service, so the radar
     * migration (KV-DB-018) can reproduce it: drop `posted_days`, sort the keys, sort every list (polygon vertices by
     * latitude, then longitude), encode with unescaped slashes and Unicode, SHA-256 in hex.
     *
     * @param  array<string, mixed>  $normalised
     */
    public static function independentHash(array $normalised): string
    {
        unset($normalised['posted_days']);
        ksort($normalised);

        foreach ($normalised as $key => $value) {
            if (is_array($value)) {
                usort($value, fn (mixed $a, mixed $b): int => is_array($a) ? [$a[0], $a[1]] <=> [$b[0], $b[1]] : strcmp($a, $b));
                $normalised[$key] = $value;
            }
        }

        return hash('sha256', json_encode($normalised, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }
}
