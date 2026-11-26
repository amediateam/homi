<?php

use App\Enums\Currency;
use App\Enums\Locale;
use App\Enums\Theme;
use App\Events\Identity\SettingsChanged;
use App\Models\Source;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\Stub\StubListingSource;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

/** `GET /api/v1/settings` and `PATCH /api/v1/settings` on their native bodies (WP-40): the stub mode is off. */
function actAsSettingsOwner(array $abilities = ['app:read', 'app:write']): User
{
    $user = UserSetting::factory()->create()->user;
    Sanctum::actingAs($user, $abilities);

    return $user;
}

it('answers the defaults of a new user with the options, in the shape of the contract', function (): void {
    Sanctum::actingAs(User::factory()->telegram()->create(['language_code' => 'uz']), ['app:read']);

    $response = $this->getJson('/api/v1/settings', ['Accept-Language' => 'uz'])->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::SETTINGS, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    expect($response->json('meta'))->toBe(['source' => 'native'])
        ->and(array_diff_key($response->json('data'), ['options' => true]))->toBe([
            'locale' => 'uz', 'currency' => 'USD', 'theme' => 'auto', 'city' => null,
            'quiet_hours' => ['from' => 23, 'to' => 8], 'digest_hours' => [9], 'card_style' => 'classic',
        ])
        ->and($response->json('data.options.currencies.1'))->toBe(['code' => 'UZS', 'name' => 'Soʻm'])
        ->and($response->json('data.options.digest_hours'))->toBe([[9], [9, 19], [12, 20], [19]]);
});

it('stores one key, keeps the others and answers the full object', function (string $key, mixed $value): void {
    actAsSettingsOwner();
    $before = $this->getJson('/api/v1/settings')->json('data');

    $after = $this->patchJson('/api/v1/settings', [$key => $value])->assertOk()->assertJsonPath('meta.source', 'native')->json('data');

    expect($after[$key])->toBe($value)
        ->and(array_diff_key($after, [$key => true]))->toBe(array_diff_key($before, [$key => true]))
        ->and($this->getJson('/api/v1/settings')->json('data'))->toBe($after);
})->with([
    'locale' => ['locale', 'uz'],
    'currency' => ['currency', 'UZS'],
    'theme' => ['theme', 'dark'],
    'city' => ['city', 'andijan'],
    'quiet hours' => ['quiet_hours', ['from' => 0, 'to' => 9]],
    'quiet hours off' => ['quiet_hours', null],
    'digest hours' => ['digest_hours', [12, 20]],
    'card style' => ['card_style', 'rich'],
]);

it('stores and returns Uzbek as uz', function (): void {
    $user = actAsSettingsOwner();

    $this->patchJson('/api/v1/settings', ['locale' => 'uz'])->assertOk()->assertJsonPath('data.locale', 'uz');

    expect($user->settings()->sole()->getRawOriginal('locale'))->toBe('uz');
    $this->getJson('/api/v1/settings')->assertJsonPath('data.locale', 'uz');
});

it('stores the language and the currency of one patch together', function (): void {
    $user = actAsSettingsOwner();
    Event::fake([SettingsChanged::class]);

    $this->patchJson('/api/v1/settings', ['currency' => 'UZS', 'locale' => 'en'])->assertOk()
        ->assertJsonPath('data.currency', 'UZS')
        ->assertJsonPath('data.locale', 'en');

    $row = $user->settings()->sole();
    expect($row->currency)->toBe(Currency::Uzs)
        ->and($row->locale)->toBe(Locale::En);
    Event::assertDispatched(SettingsChanged::class, fn (SettingsChanged $event): bool => $event->userId === $user->id && $event->keys === ['locale', 'currency']);
    $this->getJson('/api/v1/me')->assertJsonPath('data.locale_chosen', true)->assertJsonPath('data.currency', 'UZS');
});

it('announces only the sent keys', function (): void {
    $user = actAsSettingsOwner();
    Event::fake([SettingsChanged::class]);

    $this->patchJson('/api/v1/settings', ['theme' => 'dark', 'card_style' => 'rich', 'service_news' => false])->assertOk();

    Event::assertDispatchedTimes(SettingsChanged::class, 1);
    Event::assertDispatched(SettingsChanged::class, fn (SettingsChanged $event): bool => $event->userId === $user->id && $event->keys === ['theme', 'card_style']);
});

it('treats an empty body and unknown keys as a no-op that announces nothing', function (array $body): void {
    actAsSettingsOwner();
    $before = $this->getJson('/api/v1/settings')->json('data');
    $updatedAt = UserSetting::query()->sole()->updated_at;
    Event::fake([SettingsChanged::class]);
    $this->travel(5)->seconds();

    $this->patchJson('/api/v1/settings', $body)->assertOk()->assertJsonPath('meta.source', 'native')->assertJsonPath('data', $before);

    Event::assertNotDispatched(SettingsChanged::class);
    expect(UserSetting::query()->sole()->updated_at?->equalTo($updatedAt))->toBeTrue();
})->with([
    'an empty body' => [[]],
    'an unknown key' => [['service_news' => false]],
]);

it('refuses a value outside the options with the field name and stores nothing, not even the valid keys beside it', function (string $key, mixed $value): void {
    $user = actAsSettingsOwner();
    $before = $user->settings()->sole()->toArray();
    Event::fake([SettingsChanged::class]);

    $this->patchJson('/api/v1/settings', array_replace(['theme' => 'dark', 'currency' => 'UZS'], [$key => $value]))
        ->assertUnprocessable()
        ->assertJsonPath('code', 'validation_failed')
        ->assertJsonValidationErrors($key);

    expect($user->settings()->sole()->toArray())->toBe($before);
    Event::assertNotDispatched(SettingsChanged::class);
})->with([
    'the legacy Uzbek code' => ['locale', 'uz_Latn'],
    'an unknown currency' => ['currency', 'EUR'],
    'an unknown theme' => ['theme', 'neon'],
    'a city that the reference data does not have' => ['city', 'samarkand'],
    'a city of null' => ['city', null],
    'quiet hours outside the options' => ['quiet_hours', ['from' => 21, 'to' => 7]],
    'quiet hours as a legacy string' => ['quiet_hours', '23-08'],
    'a repeated digest hour' => ['digest_hours', [9, 9]],
    'digest hours outside the options' => ['digest_hours', [8]],
    'an unknown card style (fix of LB-APP-051)' => ['card_style', 'compact'],
    'a card style of null' => ['card_style', null],
]);

it('never shows or changes the settings of another user', function (): void {
    $first = UserSetting::factory()->chosen(Locale::Uz, 'andijan')->create(['theme' => Theme::Dark])->user;
    $second = actAsSettingsOwner();

    $this->getJson('/api/v1/settings')->assertOk()
        ->assertJsonPath('data.locale', 'ru')
        ->assertJsonPath('data.city', null)
        ->assertJsonPath('data.theme', 'auto');
    $this->patchJson('/api/v1/settings', ['theme' => 'light', 'city' => 'tashkent'])->assertOk();

    $firstRow = UserSetting::query()->findOrFail($first->id);
    expect($firstRow->theme)->toBe(Theme::Dark)
        ->and($firstRow->city)->toBe('andijan')
        ->and(UserSetting::query()->findOrFail($second->id)->theme)->toBe(Theme::Light);
});

it('reads the listings in the currency the user stored', function (): void {
    $user = actAsSettingsOwner();
    $currencies = [];
    $listings = Mockery::mock(ListingSource::class);
    $listings->shouldReceive('count')->andReturnUsing(function (SearchFilters $filters, SourceContext $context) use (&$currencies): int {
        $currencies[] = $context->currency;

        return 7;
    });
    app()->instance(StubListingSource::class, $listings);

    $this->getJson('/api/v1/listings/count?city=tashkent&deal=rent_long')->assertOk()->assertJsonPath('data.count', 7);
    $this->patchJson('/api/v1/settings', ['currency' => 'UZS'])->assertOk();
    // A new request loads the user afresh; the instance of the first requests may hold their settings.
    Sanctum::actingAs($user->fresh() ?? $user, ['app:read', 'app:write']);
    $this->getJson('/api/v1/listings/count?city=tashkent&deal=rent_long')->assertOk();

    expect($currencies)->toBe(['USD', 'UZS']);
});

it('reads with app:read and writes with app:write', function (): void {
    $this->getJson('/api/v1/settings')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');

    actAsSettingsOwner(['app:read']);

    $this->getJson('/api/v1/settings')->assertOk();
    $this->patchJson('/api/v1/settings', ['theme' => 'dark'])->assertForbidden()->assertJsonPath('code', 'forbidden');
    expect(UserSetting::query()->sole()->theme)->toBe(Theme::Auto);
});

it('refuses a collector token that carries the app abilities and writes no settings row', function (): void {
    $token = Source::factory()->create()->createToken('collector', ['app:read', 'app:write'])->plainTextToken;

    $this->withToken($token)->getJson('/api/v1/settings')->assertForbidden()->assertJsonPath('code', 'forbidden');
    $this->withToken($token)->patchJson('/api/v1/settings', ['theme' => 'dark'])->assertForbidden()->assertJsonPath('code', 'forbidden');

    expect(UserSetting::query()->count())->toBe(0);
});
