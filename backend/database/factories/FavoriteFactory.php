<?php

namespace Database\Factories;

use App\Models\Favorite;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A listing a user saved an hour ago, its channel and post not known yet.
 *
 * @extends Factory<Favorite>
 */
class FavoriteFactory extends Factory
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
            'created_at' => now()->subHour(),
        ];
    }
}
