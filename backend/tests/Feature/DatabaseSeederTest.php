<?php

use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Models\User;
use App\Models\UserSetting;
use Database\Seeders\UserSettingSeeder;

/** `php artisan db:seed` runs without model events (`WithoutModelEvents`), so the factory itself gives each user his analytics id. */
it('seeds the database', function (): void {
    $this->seed();

    $user = User::query()->sole();
    expect($user->email)->toBe('test@example.com')
        ->and($user->analytics_distinct_id)->toBeString()->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/');
});

it('gives the seeded user his settings row with the defaults', function (): void {
    $this->seed();

    $settings = UserSetting::query()->sole();
    expect($settings->user_id)->toBe(User::query()->sole()->id)
        ->and($settings->locale)->toBe(Locale::Ru)
        ->and($settings->locale_chosen_at)->toBeNull()
        ->and($settings->currency)->toBe(Currency::Usd)
        ->and($settings->theme)->toBe(Theme::Auto)
        ->and($settings->city)->toBeNull();
});

it('fills only the users without settings, in their last known language, and is idempotent', function (): void {
    $chosen = UserSetting::factory()->chosen(Locale::En, 'samarkand')->create(['theme' => Theme::Dark]);
    $uzbek = User::factory()->telegram()->create(['language_code' => 'uz']);

    $this->seed(UserSettingSeeder::class);
    $this->seed(UserSettingSeeder::class);

    expect(UserSetting::query()->count())->toBe(2)
        ->and(UserSetting::query()->where('user_id', $uzbek->id)->sole()->locale)->toBe(Locale::Uz)
        ->and($chosen->fresh()?->only(['locale', 'city', 'theme']))->toBe(['locale' => Locale::En, 'city' => 'samarkand', 'theme' => Theme::Dark]);
});
