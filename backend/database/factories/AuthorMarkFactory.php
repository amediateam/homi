<?php

namespace Database\Factories;

use App\Models\AuthorMark;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A phone author HOMI's votes marked as a realtor an hour ago (a made-up key).
 *
 * @extends Factory<AuthorMark>
 */
class AuthorMarkFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'author_key' => 'phone:'.$this->faker->unique()->regexify('[0-9a-f]{32}'),
            'realtor_marked_at' => now()->subHour(),
            'source' => 'votes',
            'created_at' => now()->subHour(),
        ];
    }
}
