<?php

use App\Http\Controllers\Api\V1\Auth\TelegramAuthController;
use App\Http\Controllers\Api\V1\MeController;
use App\Http\Controllers\Api\V1\ReferenceController;
use App\Http\Controllers\Api\V1\SettingsController;
use App\Http\Resources\Api\V1\MeResource;
use App\Http\Resources\Api\V1\SettingsResource;
use App\Models\User;
use App\Models\UserSetting;
use App\Providers\SourceServiceProvider;
use App\Services\Identity\TokenIssuer;
use App\Services\Sources\Stub\NativeStubs;
use App\Services\Sources\Stub\StubUser;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;
use Mockery\MockInterface;
use Tests\Support\EnvOverride;

/**
 * The stub mode of the native methods (WP-40): `AnswerNativeStubs` answers the routes of `NativeStubs` while the switch
 * is on. A stub keeps answering what its method answered on stubs (WP-11): each is compared with the committed
 * fixtures through its resources, since the controllers are native.
 */
dataset('native stub routes', [
    'sign-in' => ['POST', '/api/v1/auth/telegram', ['init_data' => 'query_id=AAHomiSyntheticQuery&auth_date=1&hash=00'], TelegramAuthController::class, '__invoke'],
    'me' => ['GET', '/api/v1/me', [], MeController::class, '__invoke'],
    'settings' => ['GET', '/api/v1/settings', [], SettingsController::class, 'show'],
    'settings update' => ['PATCH', '/api/v1/settings', ['currency' => 'UZS', 'quiet_hours' => null], SettingsController::class, 'update'],
]);

function actAsNativeStubUser(array $abilities = ['app:read', 'app:write']): void
{
    Sanctum::actingAs(User::factory()->create(), $abilities);
}

it('answers a method of the map from its stub body and never reaches the controller while the switch is on', function (string $method, string $uri, array $body, string $controller, string $action): void {
    actAsNativeStubUser();
    config(['sources.native_stubs' => true]);
    $this->mock($controller, fn (MockInterface $mock) => $mock->shouldReceive($action)->never());

    $this->json($method, $uri, $body)->assertOk()->assertJsonPath('success', true)->assertJsonPath('meta.source', 'stub');
})->with('native stub routes');

it('lets the request reach the controller while the switch is off', function (string $method, string $uri, array $body, string $controller, string $action): void {
    actAsNativeStubUser();
    $this->mock($controller, fn (MockInterface $mock) => $mock->shouldReceive($action)->once()->andReturn(response()->json(['answered_by' => 'controller'])));

    $this->json($method, $uri, $body)->assertOk()->assertExactJson(['answered_by' => 'controller']);
})->with('native stub routes');

it('lets a route outside the map reach its controller while the switch is on', function (): void {
    config(['sources.native_stubs' => true]);
    $this->mock(ReferenceController::class, fn (MockInterface $mock) => $mock->shouldReceive('__invoke')->once()->andReturn(response()->json(['answered_by' => 'controller'])));

    $this->getJson('/api/v1/reference')->assertOk()->assertExactJson(['answered_by' => 'controller']);
});

/**
 * The answer of a stub method of WP-11 built from its committed fixture, `$overlay` laid over it, in the stub envelope;
 * through JSON, as a client reads it.
 *
 * @param  class-string<JsonResource>  $resource
 * @param  array<string, mixed>  $overlay
 * @return array<string, mixed>
 */
function committedStubAnswer(string $resource, string $fixture, array $overlay = []): array
{
    $data = json_decode((string) file_get_contents(resource_path("fixtures/v1/{$fixture}.json")), true, flags: JSON_THROW_ON_ERROR);

    return json_decode((string) json_encode([
        'success' => true,
        'data' => (new $resource(array_replace($data, $overlay)))->resolve(request()),
        'meta' => ['source' => 'stub'],
    ]), true, flags: JSON_THROW_ON_ERROR);
}

it('answers what the stub of WP-11 answered from the committed fixtures, in the request locale', function (string $method, string $uri, array $body, string $resource, string $fixture): void {
    actAsNativeStubUser();
    config(['sources.native_stubs' => true]);

    $stub = $this->json($method, $uri, $body, ['Accept-Language' => 'uz'])->assertOk();

    app()->setLocale('uz');
    expect($stub->json())->toBe(committedStubAnswer($resource, $fixture, $method === 'PATCH' ? $body : []))
        ->and($stub->headers->get('Content-Language'))->toBe('uz')
        ->and($stub->headers->get('Content-Type'))->toBe('application/json')
        ->and(UserSetting::query()->count())->toBe(0);
})->with([
    'me' => ['GET', '/api/v1/me', [], MeResource::class, 'me/default'],
    'settings' => ['GET', '/api/v1/settings', [], SettingsResource::class, 'settings/default'],
    'settings update' => ['PATCH', '/api/v1/settings', ['currency' => 'UZS', 'quiet_hours' => null, 'digest_hours' => [12, 20]], SettingsResource::class, 'settings/default'],
]);

it('answers the stub scenarios of WP-11', function (): void {
    actAsNativeStubUser();
    config(['sources.native_stubs' => true]);

    expect($this->getJson('/api/v1/me', ['X-Stub-Scenario' => 'first_launch'])->assertOk()->json())->toBe(committedStubAnswer(MeResource::class, 'me/first_launch'))
        ->and($this->getJson('/api/v1/settings', ['X-Stub-Scenario' => 'card_rich'])->assertOk()->json())->toBe(committedStubAnswer(SettingsResource::class, 'settings/card_rich'));
});

it('signs in the stub user as the stub of WP-11 did, from the committed fixture, with a token of its own each time', function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
    config(['sources.native_stubs' => true]);
    $body = ['init_data' => 'query_id=AAHomiSyntheticQuery&auth_date=1&hash=00'];

    $first = $this->postJson('/api/v1/auth/telegram', $body, ['Accept-Language' => 'uz'])->assertOk();
    $second = $this->postJson('/api/v1/auth/telegram', $body)->assertOk();

    app()->setLocale('uz');
    expect(Arr::except($first->json(), 'data.token'))->toBe([
        'success' => true,
        'data' => [
            'token_type' => 'Bearer',
            'expires_at' => '2026-11-27T09:00:00+00:00',
            'user' => committedStubAnswer(MeResource::class, 'me/default')['data'],
        ],
        'meta' => ['source' => 'stub'],
    ])
        ->and($first->headers->get('Content-Language'))->toBe('uz')
        ->and($second->json('data.token'))->toBeString()->not->toBe($first->json('data.token'))
        ->and(PersonalAccessToken::findToken($first->json('data.token'))?->abilities)->toBe(TokenIssuer::ABILITIES)
        ->and(User::query()->sole()->email)->toBe(StubUser::EMAIL)
        ->and(User::query()->sole()->tokens()->count())->toBe(2);
});

it('authenticates and checks the abilities before a stub answers', function (): void {
    config(['sources.native_stubs' => true]);

    $this->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');

    actAsNativeStubUser(['media:write']);
    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('code', 'forbidden');
    $this->patchJson('/api/v1/settings', ['currency' => 'UZS'])->assertForbidden()->assertJsonPath('code', 'forbidden');

    actAsNativeStubUser(['app:read']);
    $this->getJson('/api/v1/settings')->assertOk()->assertJsonPath('meta.source', 'stub');
    $this->patchJson('/api/v1/settings', ['currency' => 'UZS'])->assertForbidden()->assertJsonPath('code', 'forbidden');
});

it('validates the form request of a stub as the controller did', function (): void {
    actAsNativeStubUser();
    config(['sources.native_stubs' => true]);

    $this->patchJson('/api/v1/settings', ['currency' => 'EUR'])->assertUnprocessable()->assertJsonValidationErrors('currency');
    $this->postJson('/api/v1/auth/telegram', ['init_data' => str_repeat('a', 4097)])->assertUnprocessable()->assertJsonValidationErrors('init_data');
});

it('names only registered routes in its map', function (): void {
    $stubs = app(NativeStubs::class);

    expect($stubs->routes())->toBe(['api.v1.auth.telegram', 'api.v1.me.show', 'api.v1.settings.show', 'api.v1.settings.update']);
    foreach ($stubs->routes() as $name) {
        expect(Route::has($name))->toBeTrue()->and($stubs->answers($name))->toBeTrue();
    }
    expect($stubs->answers('api.v1.reference.show'))->toBeFalse();
});

it('refuses to boot with the stub mode outside local and testing', function (string $environment): void {
    config(['sources.native_stubs' => true]);
    $this->app->instance('env', $environment);

    expect(fn () => (new SourceServiceProvider($this->app))->boot())->toThrow(LogicException::class, 'SOURCES_NATIVE_STUBS');

    $this->app->instance('env', 'testing');
})->with(['production', 'staging', 'ci']);

it('boots with the stub mode in local and testing, and anywhere with it off', function (string $environment, bool $on): void {
    config(['sources.native_stubs' => $on]);
    $this->app->instance('env', $environment);

    expect(fn () => (new SourceServiceProvider($this->app))->boot())->not->toThrow(LogicException::class);

    $this->app->instance('env', 'testing');
})->with([
    'local, on' => ['local', true],
    'testing, on' => ['testing', true],
    'production, off' => ['production', false],
]);

it('keeps the stub mode off when SOURCES_NATIVE_STUBS is not set', function (): void {
    $config = EnvOverride::with('SOURCES_NATIVE_STUBS', null, fn (): array => require config_path('sources.php'));

    expect($config['native_stubs'])->toBeFalse();
});
