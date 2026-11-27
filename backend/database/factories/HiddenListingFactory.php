<?php

namespace Database\Factories;

use App\Enums\Personal\HiddenReason;
use App\Models\HiddenListing;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A listing a user hid by hand an hour ago.
 *
 * @extends Factory<HiddenListing>
 */
class HiddenListingFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'listing_number' => $this->faker->unique()->numberBetween(100_000, 9_999_999),
            'source_channel' => null,
            'source_post_id' => null,
            'reason' => HiddenReason::Manual,
            'created_at' => now()->subHour(),
        ];
    }
}
