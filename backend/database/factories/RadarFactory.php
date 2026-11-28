<?php

namespace Database\Factories;

use App\Models\Radar;
use App\Models\User;
use App\Services\Search\SearchFilters;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * An active instant radar for Tashkent long rent made a day ago, its `price_max` unique, so one user's radars never
 * share a filters hash. `filters()` sets other filters with their hash, city and deal; `paused()` pauses it.
 *
 * @extends Factory<Radar>
 */
class RadarFactory extends Factory
{
    /** The defaults of BR-APP-001 for Tashkent long rent: the 25 keys of `SearchFilters::toArray()`. */
    public const array DEFAULT_FILTERS = [
        'city' => 'tashkent', 'deal' => 'rent_long', 'types' => ['apartment'], 'districts' => [],
        'rooms_min' => null, 'rooms_max' => null, 'price_min' => null, 'price_max' => null, 'zones' => [],
        'near_metro' => false, 'below_median' => false, 'owner' => 'any', 'tenant' => null, 'pets' => false,
        'pets_only' => false, 'furnished' => null, 'renovation' => [], 'floor_not_first' => false,
        'floor_not_last' => false, 'area_min' => null, 'area_max' => null, 'market' => null, 'appliances' => [],
        'posted_days' => null, 'polygon' => null,
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            ...Radar::filterAttributes(SearchFilters::fromNormalised([...self::DEFAULT_FILTERS, 'price_max' => $this->faker->unique()->numberBetween(100, 9_999_999)])),
            'active' => true,
            'mode' => 'instant',
            'entry' => 'filters',
            'relax_code' => null,
            'hidden_count' => 0,
            'paused_at' => null,
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ];
    }

    /**
     * Normalised filters over the defaults, with their hash, city and deal.
     *
     * @param  array<string, mixed>  $overrides
     */
    public function filters(array $overrides): static
    {
        return $this->state(fn (): array => Radar::filterAttributes(SearchFilters::fromNormalised([...self::DEFAULT_FILTERS, ...$overrides])));
    }

    public function paused(): static
    {
        return $this->state(fn (): array => ['active' => false, 'paused_at' => now()->subHour()]);
    }
}
