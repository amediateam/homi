<?php

use App\Enums\CardStyle;
use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Identity\SettingsService;

/*
 * WP-40, LB-API-049: patches of different keys of one user's settings race (two tabs, the Mini App and the bot). Each
 * child process patches one key in its own PostgreSQL connection, for a user who has no settings row yet, so the
 * children also race to create it: one row must stay, and every key must survive.
 */
it('keeps every key when patches of different keys of one user run at once', function (): void {
    $id = User::factory()->create()->id;

    $answers = concurrently([
        static fn (): array => app(SettingsService::class)->patch(User::query()->findOrFail($id), ['locale' => 'uz'])->toArray(),
        static fn (): array => app(SettingsService::class)->patch(User::query()->findOrFail($id), ['currency' => 'UZS'])->toArray(),
        static fn (): array => app(SettingsService::class)->patch(User::query()->findOrFail($id), ['theme' => 'dark'])->toArray(),
        static fn (): array => app(SettingsService::class)->patch(User::query()->findOrFail($id), ['city' => 'andijan'])->toArray(),
        static fn (): array => app(SettingsService::class)->patch(User::query()->findOrFail($id), ['digest_hours' => [12, 20]])->toArray(),
        static fn (): array => app(SettingsService::class)->patch(User::query()->findOrFail($id), ['card_style' => 'rich'])->toArray(),
    ]);

    $row = UserSetting::query()->sole();
    expect($answers)->toHaveCount(6)
        ->and($row->user_id)->toBe($id)
        ->and($row->locale)->toBe(Locale::Uz)
        ->and($row->locale_chosen_at)->not->toBeNull()
        ->and($row->currency)->toBe(Currency::Uzs)
        ->and($row->theme)->toBe(Theme::Dark)
        ->and($row->city)->toBe('andijan')
        ->and($row->city_chosen_at)->not->toBeNull()
        ->and($row->digest_hours)->toBe([12, 20])
        ->and($row->card_style)->toBe(CardStyle::Rich)
        ->and($row->quiet_start)->toBe('23:00:00')
        ->and($row->quiet_end)->toBe('08:00:00');
});
