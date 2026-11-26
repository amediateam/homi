<?php

use App\Enums\AccessReason;
use App\Models\AccessGrant;
use App\Models\Source;
use App\Models\User;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as Router;
use Laravel\Sanctum\Sanctum;

/** The access gate on the routes (WP-40, SEC-REQ-006): `access` on every bearer route, `access:lenient` on events. */

/**
 * Every bearer route of `/api/v1` by name, as a method and an address with sample parameters (a listing number, a
 * ULID). The gate runs before any form request, so no route needs a body to reach it.
 *
 * @return array<string, array{0: string, 1: string}>
 */
function bearerRoutesOfV1(): array
{
    $routes = [];

    foreach (Router::getRoutes()->getRoutesByName() as $name => $route) {
        if (! str_starts_with($name, 'api.v1.') || ! $route instanceof Route || ! in_array('Illuminate\Auth\Middleware\Authenticate:sanctum', Router::gatherRouteMiddleware($route), true)) {
            continue;
        }

        $method = collect($route->methods())->first(fn (string $method): bool => $method !== 'HEAD');
        $uri = preg_replace_callback('/\{(\w+)\}/', fn (array $match): string => $match[1] === 'number' ? '100012' : '01JF0000000000000000000000', $route->uri());
        $routes[$name] = [(string) $method, '/'.$uri];
    }

    return $routes;
}

/**
 * The status, code and reason of every bearer route for the acting user.
 *
 * @return array<string, array{0: int, 1: mixed, 2: mixed}>
 */
function answersOfBearerRoutes(): array
{
    $answers = [];

    foreach (bearerRoutesOfV1() as $name => [$method, $uri]) {
        $response = test()->json($method, $uri);
        $body = json_decode((string) $response->getContent(), true);
        $answers[$name] = [$response->status(), data_get($body, 'code'), data_get($body, 'reason')];
    }

    return $answers;
}

it('refuses a blocked user on every bearer route with blocked, POST /events too, before the abilities', function (): void {
    $user = User::factory()->telegram()->create();
    AccessGrant::factory()->for($user)->blocked()->create();
    Sanctum::actingAs($user, []);

    $answers = answersOfBearerRoutes();

    expect($answers)->toHaveKey('api.v1.events.store')->toHaveKey('api.v1.media.store')
        ->and(array_values(array_unique(array_map(serialize(...), $answers))))->toBe([serialize([403, 'access_denied', 'blocked'])]);
});

it('refuses everyone on every bearer route with paused during a pause, a blocked user too', function (bool $blocked): void {
    config(['access.paused' => true]);
    $user = User::factory()->telegram()->create();

    if ($blocked) {
        AccessGrant::factory()->for($user)->blocked()->create();
    }

    Sanctum::actingAs($user, ['*']);

    expect(array_values(array_unique(array_map(serialize(...), answersOfBearerRoutes()))))->toBe([serialize([403, 'access_denied', 'paused'])]);
})->with(['a user' => [false], 'a blocked user' => [true]]);

it('keeps answering the public methods during a pause, for the no-access screen', function (string $uri): void {
    config(['access.paused' => true]);

    $this->getJson($uri)->assertOk();
})->with(['/api/v1/reference', '/api/v1/cities', '/api/v1/landing/live', '/api/v1/landing/pins']);

it('lets a user of open mode through the gate on every bearer route, and nothing answers paused while the pause is off', function (): void {
    Sanctum::actingAs(User::factory()->telegram()->create(), ['*']);

    foreach (answersOfBearerRoutes() as $name => [$status, $code, $reason]) {
        expect($code)->not->toBe('access_denied', "{$name} answered {$status} access_denied.")
            ->and($reason)->not->toBe('paused');
    }
});

it('answers each refusal of the gate with its reason on a bearer route', function (array $access, AccessReason $reason): void {
    config(['access' => [...config('access'), ...$access]]);
    Sanctum::actingAs(User::factory()->telegram()->create(), ['app:read']);

    $this->getJson('/api/v1/me')->assertForbidden()
        ->assertExactJson(['success' => false, 'message' => 'Access denied.', 'code' => 'access_denied', 'reason' => $reason->value]);
})->with([
    'private' => [['mode' => 'private'], AccessReason::Private],
    'invite' => [['mode' => 'invite'], AccessReason::Invite],
    'full' => [['max_seats' => 0], AccessReason::Full],
    'join' => [['require_chat' => true], AccessReason::Join],
    'paused' => [['paused' => true], AccessReason::Paused],
]);

it('lets a gated user who is not blocked send events, and refuses him the rest', function (array $access): void {
    config(['access' => [...config('access'), ...$access]]);
    Sanctum::actingAs(User::factory()->telegram()->create(), ['app:read', 'app:write']);

    $this->postJson('/api/v1/events', ['name' => 'app_launch'])->assertNoContent();
    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('code', 'access_denied');
})->with([
    'private' => [['mode' => 'private']],
    'invite' => [['mode' => 'invite']],
    'full' => [['max_seats' => 0]],
    'join' => [['require_chat' => true]],
]);

it('answers 401 for a missing token before the gate, and 403 only for the gate (LB-API-021)', function (): void {
    config(['access.mode' => 'private']);

    $this->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated')->assertJsonMissingPath('reason');
    $this->postJson('/api/v1/events', ['name' => 'app_launch'])->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
});

it('lets a collector token through the gate, which decides only for users', function (): void {
    config(['access.mode' => 'private']);
    $this->withToken(Source::factory()->create()->createToken('collector', ['media:write'])->plainTextToken);

    $this->getJson('/api/v1/media/01JF0000000000000000000000')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->postJson('/api/v1/media/presign', [])->assertUnprocessable()->assertJsonPath('code', 'validation_failed');
});

it('runs the real gate in the stub mode of the native methods', function (): void {
    config(['sources.native_stubs' => true]);
    $user = User::factory()->telegram()->create();
    AccessGrant::factory()->for($user)->blocked()->create();
    Sanctum::actingAs($user, ['app:read']);

    $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('reason', 'blocked');
});
