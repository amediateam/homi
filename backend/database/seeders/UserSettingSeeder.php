<?php

namespace Database\Seeders;

use App\Models\User;
use App\Services\Identity\SettingsService;
use Illuminate\Database\Seeder;

/**
 * Gives every user without a settings row the defaults for his last known language, as his first contact or first
 * read would (WP-40, `SettingsService::createDefaults`). Idempotent: a user who has a row keeps it untouched.
 */
class UserSettingSeeder extends Seeder
{
    public function run(SettingsService $settings): void
    {
        User::query()->whereDoesntHave('settings')->eachById(function (User $user) use ($settings): void {
            $settings->createDefaults($user, $user->language_code);
        });
    }
}
