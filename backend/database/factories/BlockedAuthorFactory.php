<?php

namespace Database\Factories;

use App\Models\BlockedAuthor;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A phone author a user blocked an hour ago (a made-up key, never derived from a number), labelled with a masked
 * synthetic number.
 *
 * @extends Factory<BlockedAuthor>
 */
class BlockedAuthorFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'author_key' => 'phone:'.$this->faker->unique()->regexify('[0-9a-f]{32}'),
            'kind' => 'phone',
            'label' => '+998 ** *** ** '.$this->faker->numerify('##'),
            'listing_number' => $this->faker->numberBetween(100_000, 9_999_999),
            'source_channel' => null,
            'source_post_id' => null,
            'created_at' => now()->subHour(),
        ];
    }

    public function ofSource(string $channel): static
    {
        return $this->state(['author_key' => 'source:'.strtolower($channel), 'kind' => 'source', 'label' => '@'.$channel]);
    }
}
