<?php

namespace Database\Factories;

use App\Models\SourceFlagChange;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SourceFlagChange>
 */
class SourceFlagChangeFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'feature' => 'source.listings.feed',
            'old_rule' => [],
            'new_rule' => ['everyone' => 'legacy'],
            'actor' => fake()->userName(),
            'reason' => fake()->sentence(),
            'environment' => 'testing',
        ];
    }
}
