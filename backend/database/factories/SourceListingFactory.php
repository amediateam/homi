<?php

namespace Database\Factories;

use App\Enums\SourceListingStatus;
use App\Models\Source;
use App\Models\SourceListing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SourceListing>
 */
class SourceListingFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'source_id' => Source::factory(),
            'external_id' => strtoupper($this->faker->unique()->bothify('01??????????????????????')),
            'source_version' => 1,
            'status' => SourceListingStatus::Active,
            'first_seen_at' => now(),
            'last_event_at' => now(),
        ];
    }
}
