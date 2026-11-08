<?php

namespace Database\Factories;

use App\Enums\IntakeEventStatus;
use App\Enums\IntakeEventType;
use App\Models\IntakeEvent;
use App\Models\SourceListing;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<IntakeEvent>
 */
class IntakeEventFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'source_id' => fn (array $attributes): int => SourceListing::query()->whereKey($attributes['source_listing_id'])->firstOrFail()->source_id,
            'source_listing_id' => SourceListing::factory(),
            'event_type' => IntakeEventType::Created,
            'schema_version' => 1,
            'source_version' => 1,
            'payload' => ['external_id' => 'X', 'deal_type' => 'rent', 'property_type' => 'apartment'],
            'status' => IntakeEventStatus::Received,
            'received_at' => now(),
        ];
    }
}
