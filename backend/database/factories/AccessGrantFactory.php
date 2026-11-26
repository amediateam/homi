<?php

namespace Database\Factories;

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use App\Models\AccessGrant;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A user admitted through a seat of `open` mode; `blocked()` is a user an operator blocked after that admission, and
 * `blockedBeforeAdmission()` one blocked before he was ever admitted.
 *
 * @extends Factory<AccessGrant>
 */
class AccessGrantFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'state' => AccessGrantState::Admitted,
            'admitted_via' => AdmittedVia::Open,
        ];
    }

    public function blocked(): static
    {
        return $this->state(fn (array $attributes): array => ['state' => AccessGrantState::Blocked]);
    }

    public function blockedBeforeAdmission(): static
    {
        return $this->state(fn (array $attributes): array => ['state' => AccessGrantState::Blocked, 'admitted_via' => null]);
    }
}
