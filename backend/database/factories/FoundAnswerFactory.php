<?php

namespace Database\Factories;

use App\Enums\Personal\FoundAnswerType;
use App\Enums\Personal\FoundTrigger;
use App\Models\FoundAnswer;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A user who found a home elsewhere, asked when pausing a radar an hour ago, without a place yet.
 *
 * @extends Factory<FoundAnswer>
 */
class FoundAnswerFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'answer' => FoundAnswerType::Elsewhere,
            'trigger' => FoundTrigger::Pause,
            'where' => null,
            'created_at' => now()->subHour(),
        ];
    }
}
