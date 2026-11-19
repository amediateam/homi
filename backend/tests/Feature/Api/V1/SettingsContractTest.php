<?php

use App\Enums\AccessReason;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

/** `GET /api/v1/settings` and `PATCH /api/v1/settings` on stubs (WP-11): PATCH validates and overlays; nothing is stored. */
function actAsSettingsUser(array $abilities = ['app:read', 'app:write']): void
{
    Sanctum::actingAs(User::factory()->create(), $abilities);
}

beforeEach(fn () => actAsSettingsUser());

it('answers the settings and their options in the shape of the contract, from the stub', function (): void {
    $response = $this->getJson('/api/v1/settings', ['Accept-Language' => 'ru'])->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::SETTINGS, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('meta.source', 'stub')
        ->assertJsonPath('data.quiet_hours', ['from' => 23, 'to' => 8])
        ->assertJsonPath('data.digest_hours', [9, 19])
        ->assertJsonPath('data.card_style', 'classic')
        ->assertJsonPath('data.options.locales', [['code' => 'ru', 'name' => 'Русский'], ['code' => 'uz', 'name' => 'Oʻzbekcha'], ['code' => 'en', 'name' => 'English']])
        ->assertJsonPath('data.options.currencies.0', ['code' => 'USD', 'name' => 'Доллары'])
        ->assertJsonPath('data.options.quiet_hours', [null, ['from' => 22, 'to' => 8], ['from' => 23, 'to' => 8], ['from' => 0, 'to' => 9], ['from' => 23, 'to' => 7]])
        ->assertJsonPath('data.options.digest_hours', [[9], [9, 19], [12, 20], [19]]);
});

it('names the currencies in the language of the request', function (): void {
    $this->getJson('/api/v1/settings', ['Accept-Language' => 'uz'])
        ->assertJsonPath('data.options.currencies.1', ['code' => 'UZS', 'name' => 'Soʻm']);
});

it('changes one key and returns the full object', function (string $key, mixed $value): void {
    $before = $this->getJson('/api/v1/settings')->json('data');

    $after = $this->patchJson('/api/v1/settings', [$key => $value])->assertOk()->assertJsonPath('meta.source', 'stub')->json('data');

    expect($after[$key])->toBe($value)
        ->and(array_diff_key($after, [$key => true]))->toBe(array_diff_key($before, [$key => true]));
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

it('treats an empty body as a no-op and ignores unknown keys', function (): void {
    $before = $this->getJson('/api/v1/settings')->json('data');

    expect($this->patchJson('/api/v1/settings', [])->assertOk()->json('data'))->toBe($before)
        ->and($this->patchJson('/api/v1/settings', ['service_news' => false])->assertOk()->json('data'))->toBe($before);
});

it('refuses a value outside the options with the field name', function (string $key, mixed $value): void {
    $this->patchJson('/api/v1/settings', [$key => $value])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'validation_failed')
        ->assertJsonValidationErrors($key);
})->with([
    'the legacy Uzbek code' => ['locale', 'uz_Latn'],
    'an unknown currency' => ['currency', 'EUR'],
    'an unknown theme' => ['theme', 'neon'],
    'a city that the reference data does not have' => ['city', 'samarkand'],
    'quiet hours outside the options' => ['quiet_hours', ['from' => 21, 'to' => 7]],
    'quiet hours as a legacy string' => ['quiet_hours', '23-08'],
    'a repeated digest hour' => ['digest_hours', [9, 9]],
    'digest hours outside the options' => ['digest_hours', [8]],
    'an unknown card style (fix of LB-APP-051)' => ['card_style', 'compact'],
    'a card style of null' => ['card_style', null],
]);

it('answers the rich card style for the scenario card_rich, and keeps it under a patch of another key', function (): void {
    $this->getJson('/api/v1/settings', ['X-Stub-Scenario' => 'card_rich'])->assertOk()->assertJsonPath('data.card_style', 'rich');
    $this->patchJson('/api/v1/settings', ['theme' => 'dark'], ['X-Stub-Scenario' => 'card_rich'])
        ->assertOk()
        ->assertJsonPath('data.card_style', 'rich')
        ->assertJsonPath('data.theme', 'dark');
});

it('reads app:read and writes with app:write', function (): void {
    actAsSettingsUser(['app:read']);

    $this->getJson('/api/v1/settings')->assertOk();
    $this->patchJson('/api/v1/settings', ['theme' => 'dark'])->assertForbidden()->assertJsonPath('code', 'forbidden');
});

it('refuses access with the reason of the access scenario', function (): void {
    $this->getJson('/api/v1/settings', ['X-Stub-Scenario' => 'access_full'])
        ->assertForbidden()
        ->assertJsonPath('reason', AccessReason::Full->value);
});
