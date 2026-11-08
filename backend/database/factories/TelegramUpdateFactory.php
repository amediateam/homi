<?php

namespace Database\Factories;

use App\Enums\TelegramUpdateStatus;
use App\Models\TelegramUpdate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TelegramUpdate>
 */
class TelegramUpdateFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $updateId = $this->faker->unique()->numberBetween(1, 10_000_000);

        return [
            'bot_id' => 123456789,
            'update_id' => $updateId,
            'payload' => [
                'update_id' => $updateId,
                'message' => [
                    'message_id' => $this->faker->numberBetween(1, 100_000),
                    'date' => now()->timestamp,
                    'chat' => ['id' => 1001, 'type' => 'private'],
                    'from' => ['id' => 1001, 'is_bot' => false, 'first_name' => 'Test'],
                    'text' => 'hello',
                ],
            ],
            'status' => TelegramUpdateStatus::Received,
        ];
    }

    public function done(): static
    {
        return $this->state(fn (): array => ['status' => TelegramUpdateStatus::Done, 'processed_at' => now()]);
    }
}
