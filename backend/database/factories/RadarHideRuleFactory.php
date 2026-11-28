<?php

namespace Database\Factories;

use App\Enums\Radar\HideRuleKind;
use App\Models\Radar;
use App\Models\RadarHideRule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A channel rule of a radar, made an hour ago; the channel name is unique.
 *
 * @extends Factory<RadarHideRule>
 */
class RadarHideRuleFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'radar_id' => Radar::factory(),
            'kind' => HideRuleKind::Channel,
            'target' => 'channel_'.$this->faker->unique()->numberBetween(1, 9_999_999),
            'created_at' => now()->subHour(),
        ];
    }
}
