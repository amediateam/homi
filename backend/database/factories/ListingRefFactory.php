<?php

namespace Database\Factories;

use App\Models\ListingRef;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A legacy listing seen once, an hour ago, from a public channel post, with a phone author key (a made-up hash: the
 * factory never derives one from a number). `ofAuthor()` files it under a given key, `gone()` marks it unknown to
 * legacy.
 *
 * @extends Factory<ListingRef>
 */
class ListingRefFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'listing_number' => $this->faker->unique()->numberBetween(100_000, 9_999_999),
            'source_channel' => 'stub_channel_'.$this->faker->lexify('???'),
            'source_post_id' => $this->faker->numberBetween(1, 99_999),
            'author_key' => 'phone:'.$this->faker->regexify('[0-9a-f]{32}'),
            'author_kind' => 'phone',
            'district_code' => null,
            'merged_into' => null,
            'first_seen_at' => now()->subHour(),
            'last_seen_at' => now()->subHour(),
            'gone_at' => null,
        ];
    }

    public function ofAuthor(string $key, string $kind = 'phone'): static
    {
        return $this->state(['author_key' => $key, 'author_kind' => $kind]);
    }

    public function gone(): static
    {
        return $this->state(['gone_at' => now()]);
    }
}
