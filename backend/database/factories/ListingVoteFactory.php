<?php

namespace Database\Factories;

use App\Enums\Personal\ReportReason;
use App\Models\ListingVote;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A `rented` vote of weight 1.0 cast an hour ago, its author unknown.
 *
 * @extends Factory<ListingVote>
 */
class ListingVoteFactory extends Factory
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
            'author_key' => null,
            'reason' => ReportReason::Rented,
            'detail' => null,
            'weight' => '1.00',
            'withdrawn_at' => null,
            'created_at' => now()->subHour(),
        ];
    }
}
