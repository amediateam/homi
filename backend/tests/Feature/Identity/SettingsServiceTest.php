<?php

use App\Enums\CardStyle;
use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Events\Identity\SettingsChanged;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Identity\SettingsOptions;
use App\Services\Identity\SettingsService;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

/** The writing statements against `user_settings` that `$action` runs. */
function settingsWrites(Closure $action): array
{
    DB::flushQueryLog();
    DB::enableQueryLog();
    $action();
    DB::disableQueryLog();

    return array_values(array_map(
        fn (array $query): string => $query['query'],
        array_filter(DB::getQueryLog(), fn (array $query): bool => preg_match('/^(insert|update|delete)\b.*"user_settings"/i', $query['query']) === 1),
    ));
}

function settingsUser(array $settings = []): User
{
    return UserSetting::factory()->create($settings)->user;
}

it('creates the defaults of the configuration, in the language of the launch and not marked chosen', function (): void {
    $user = User::factory()->create();

    $data = app(SettingsService::class)->createDefaults($user, 'uz-UZ');

    $row = UserSetting::query()->sole();
    expect($row->user_id)->toBe($user->id)
        ->and($row->locale)->toBe(Locale::Uz)
        ->and($row->locale_chosen_at)->toBeNull()
        ->and($row->currency)->toBe(Currency::Usd)
        ->and($row->theme)->toBe(Theme::Auto)
        ->and($row->city)->toBeNull()
        ->and($row->city_chosen_at)->toBeNull()
        ->and($row->quiet_start)->toBe('23:00:00')
        ->and($row->quiet_end)->toBe('08:00:00')
        ->and($row->digest_hours)->toBe([9])
        ->and($row->card_style)->toBe(CardStyle::Classic)
        ->and($data->toArray())->toBe([
            'locale' => 'uz', 'currency' => 'USD', 'theme' => 'auto', 'city' => null,
            'quiet_hours' => ['from' => 23, 'to' => 8], 'digest_hours' => [9], 'card_style' => 'classic',
        ])
        ->and($data->localeChosen)->toBeFalse()
        ->and($data->cityChosen)->toBeFalse();
});

it('keeps a row that exists when the defaults are created again', function (): void {
    $user = settingsUser(['locale' => Locale::En, 'theme' => Theme::Dark]);

    $data = app(SettingsService::class)->createDefaults($user, 'uz');

    expect($data->locale)->toBe(Locale::En)
        ->and($data->theme)->toBe(Theme::Dark)
        ->and(UserSetting::query()->count())->toBe(1);
});

it('offers every default among the options', function (): void {
    $options = app(SettingsOptions::class);
    $defaults = app(SettingsService::class)->createDefaults(User::factory()->create(), null)->toArray();

    expect($options->isQuietHours($defaults['quiet_hours']))->toBeTrue()
        ->and($options->isDigestHours($defaults['digest_hours']))->toBeTrue();
});

it('gives a user without a row the defaults for his last known language on the first read', function (): void {
    $user = User::factory()->telegram()->create(['language_code' => 'en']);

    $data = app(SettingsService::class)->get($user);

    expect($data->locale)->toBe(Locale::En)
        ->and($data->localeChosen)->toBeFalse()
        ->and(UserSetting::query()->sole()->user_id)->toBe($user->id);
});

it('writes only the columns of the sent keys, in one UPDATE', function (): void {
    $user = settingsUser();

    $writes = settingsWrites(fn () => app(SettingsService::class)->patch($user, ['theme' => 'dark']));

    expect($writes)->toHaveCount(1)
        ->and($writes[0])->toBe('update "user_settings" set "theme" = ?, "updated_at" = ? where "user_settings"."user_id" = ?');
});

it('writes nothing and announces nothing for an empty change', function (): void {
    $user = settingsUser();
    Event::fake([SettingsChanged::class]);

    $writes = settingsWrites(fn () => app(SettingsService::class)->patch($user, ['service_news' => false]));

    expect($writes)->toBe([]);
    Event::assertNotDispatched(SettingsChanged::class);
});

it('records the choice of a language or a city, also of the value already stored', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
    $user = settingsUser(['locale' => Locale::Ru]);

    $data = app(SettingsService::class)->patch($user, ['locale' => 'ru', 'city' => 'tashkent']);

    $row = UserSetting::query()->sole();
    expect($data->localeChosen)->toBeTrue()
        ->and($data->cityChosen)->toBeTrue()
        ->and($row->locale_chosen_at?->toIso8601String())->toBe('2026-11-26T09:00:00+00:00')
        ->and($row->city_chosen_at?->toIso8601String())->toBe('2026-11-26T09:00:00+00:00')
        ->and($row->city)->toBe('tashkent');
});

it('marks nothing chosen for a change of another key', function (): void {
    $user = settingsUser();

    $data = app(SettingsService::class)->patch($user, ['currency' => 'UZS', 'theme' => 'light']);

    expect($data->localeChosen)->toBeFalse()
        ->and($data->cityChosen)->toBeFalse();
});

it('stores quiet hours as two wall-clock times and off as none', function (?array $quiet, ?string $start, ?string $end): void {
    $user = settingsUser();

    $data = app(SettingsService::class)->patch($user, ['quiet_hours' => $quiet]);

    $row = UserSetting::query()->sole();
    expect($row->quiet_start)->toBe($start)
        ->and($row->quiet_end)->toBe($end)
        ->and($data->quietHours->toArray())->toBe($quiet);
})->with([
    'midnight to nine' => [['from' => 0, 'to' => 9], '00:00:00', '09:00:00'],
    'off' => [null, null, null],
]);

it('stores digest hours as a sorted list', function (): void {
    $user = settingsUser();

    app(SettingsService::class)->patch($user, ['digest_hours' => [20, 12]]);

    expect(UserSetting::query()->sole()->digest_hours)->toBe([12, 20]);
});

it('announces the sent keys in the order of the contract, with the internal user id', function (): void {
    $user = settingsUser();
    Event::fake([SettingsChanged::class]);

    app(SettingsService::class)->patch($user, ['card_style' => 'rich', 'currency' => 'UZS', 'locale' => 'uz', 'service_news' => false]);

    Event::assertDispatchedTimes(SettingsChanged::class, 1);
    Event::assertDispatched(SettingsChanged::class, fn (SettingsChanged $event): bool => $event->userId === $user->id
        && $event->keys === ['locale', 'currency', 'card_style']);
});

it('announces a change only after the transaction around it commits, and never after a rollback', function (): void {
    $user = settingsUser();
    Event::fake([SettingsChanged::class]);

    DB::transaction(function () use ($user): void {
        app(SettingsService::class)->patch($user, ['theme' => 'dark']);
        Event::assertNotDispatched(SettingsChanged::class);
    });
    Event::assertDispatchedTimes(SettingsChanged::class, 1);

    try {
        DB::transaction(function () use ($user): void {
            app(SettingsService::class)->patch($user, ['theme' => 'light']);

            throw new RuntimeException('rolled back');
        });
    } catch (RuntimeException) {
    }
    Event::assertDispatchedTimes(SettingsChanged::class, 1);
    expect(UserSetting::query()->sole()->theme)->toBe(Theme::Dark);
});

it('leaves the fresh row on the user, so the rest of the request reads it', function (): void {
    $user = settingsUser();
    expect($user->settings?->currency)->toBe(Currency::Usd);

    app(SettingsService::class)->patch($user, ['currency' => 'UZS']);

    expect($user->settings?->currency)->toBe(Currency::Uzs);
});

it('changes only the user it is given', function (): void {
    $first = settingsUser();
    $second = settingsUser();

    app(SettingsService::class)->patch($first, ['theme' => 'dark', 'city' => 'andijan']);

    expect(UserSetting::query()->findOrFail($second->id)->theme)->toBe(Theme::Auto)
        ->and(UserSetting::query()->findOrFail($second->id)->city)->toBeNull()
        ->and(UserSetting::query()->findOrFail($first->id)->theme)->toBe(Theme::Dark);
});

it('goes with its user', function (): void {
    $user = settingsUser();

    $user->delete();

    expect(UserSetting::query()->count())->toBe(0);
});
