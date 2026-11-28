<?php

namespace Database\Factories;

use App\Models\VoteDecision;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A `rented` mark of a listing by three voters at the proposed threshold.
 *
 * @extends Factory<VoteDecision>
 */
class VoteDecisionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subject_type' => 'listing',
            'subject' => (string) $this->faker->numberBetween(100_000, 9_999_999),
            'reason' => 'rented',
            'voters' => 3,
            'weight_sum' => '3.00',
            'threshold' => '3.00',
            'outcome' => 'marked',
            'created_at' => now()->subHour(),
        ];
    }
}
