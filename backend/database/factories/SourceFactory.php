<?php

namespace Database\Factories;

use App\Models\Source;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Source>
 */
class SourceFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => $this->faker->unique()->lexify('source_????'),
            'name' => $this->faker->company(),
            'trust_weight' => 1.00,
            'is_active' => true,
        ];
    }

    public function telegramUz(): static
    {
        return $this->state(fn (): array => ['code' => 'telegram_uz', 'name' => 'telegram.uz collector']);
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['is_active' => false]);
    }
}
