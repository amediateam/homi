<?php

namespace Database\Factories;

use App\Models\ListingMark;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A listing HOMI's votes marked as rented an hour ago.
 *
 * @extends Factory<ListingMark>
 */
class ListingMarkFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'listing_number' => $this->faker->unique()->numberBetween(100_000, 9_999_999),
            'rented_at' => now()->subHour(),
            'created_at' => now()->subHour(),
        ];
    }
}
