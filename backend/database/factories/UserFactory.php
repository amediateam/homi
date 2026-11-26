<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * A user who came through a Telegram sign-in (WP-40): no name, email or password, a unique Telegram id.
     */
    public function telegram(): static
    {
        return $this->state(fn (array $attributes) => [
            'name' => null,
            'email' => null,
            'email_verified_at' => null,
            'password' => null,
            'remember_token' => null,
            'telegram_user_id' => fake()->unique()->numberBetween(100_000_000, 7_999_999_999),
            'language_code' => 'ru',
        ]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
