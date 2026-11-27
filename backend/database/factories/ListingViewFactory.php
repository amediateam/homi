<?php

namespace Database\Factories;

use App\Models\ListingView;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A listing a user opened once, an hour ago.
 *
 * @extends Factory<ListingView>
 */
class ListingViewFactory extends Factory
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
            'first_viewed_at' => now()->subHour(),
            'last_viewed_at' => now()->subHour(),
            'views' => 1,
        ];
    }
}
