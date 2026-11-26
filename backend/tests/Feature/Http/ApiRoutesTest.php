<?php

use App\Http\Middleware\AnswerNativeStubs;
use App\Http\Middleware\EnsureOwnerCabinetEnabled;
use App\Http\Middleware\EnsureRadarsEnabled;
use App\Http\Middleware\SetRequestLocale;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as Router;

/** @return list<string> the middleware of a named route in the order it runs */
function middlewareOf(string $name): array
{
    $route = Router::getRoutes()->getByName($name);

    return $route instanceof Route ? array_values(Router::gatherRouteMiddleware($route)) : throw new RuntimeException("No route named {$name}.");
}

it('puts every v1 route behind the request locale and the api limiter', function (): void {
    $names = collect(Router::getRoutes()->getRoutesByName())->keys()->filter(fn (string $name): bool => str_starts_with($name, 'api.v1.'));

    expect($names)->not->toBeEmpty();
    foreach ($names as $name) {
        expect(middlewareOf($name))->toContain(SetRequestLocale::class, 'Illuminate\Routing\Middleware\ThrottleRequests:api');
    }
});

it('authenticates a bearer route before the limiter, so the limit counts per user, not per address', function (): void {
    $middleware = middlewareOf('api.v1.media.show');
    $auth = array_search('Illuminate\Auth\Middleware\Authenticate:sanctum', $middleware, true);
    $throttle = array_search('Illuminate\Routing\Middleware\ThrottleRequests:api', $middleware, true);

    expect($auth)->toBeInt()->and($throttle)->toBeInt()->and($auth)->toBeLessThan($throttle);
});

it('keeps the public routes public', function (string $name): void {
    expect(middlewareOf($name))->not->toContain('Illuminate\Auth\Middleware\Authenticate:sanctum');
})->with(['api.v1.reference.show', 'api.v1.cities.index']);

it('runs the checks of every v1 route in one order and the stub answer last', function (): void {
    $order = [
        'Illuminate\Auth\Middleware\Authenticate',
        'Illuminate\Routing\Middleware\ThrottleRequests',
        SetRequestLocale::class,
        'Laravel\Sanctum\Http\Middleware\CheckForAnyAbility',
        'Laravel\Sanctum\Http\Middleware\CheckAbilities',
        EnsureRadarsEnabled::class,
        EnsureOwnerCabinetEnabled::class,
        AnswerNativeStubs::class,
    ];
    $names = collect(Router::getRoutes()->getRoutesByName())->keys()->filter(fn (string $name): bool => str_starts_with($name, 'api.v1.'));

    foreach ($names as $name) {
        $middleware = middlewareOf($name);
        $ranks = array_map(fn (string $entry): int|false => array_search(explode(':', $entry)[0], $order, true), $middleware);
        $ranked = array_values(array_filter($ranks, fn (int|false $rank): bool => $rank !== false));
        $sorted = $ranked;
        sort($sorted);

        expect($ranked)->toBe($sorted, "The middleware of {$name} run out of order.")
            ->and(end($middleware))->toBe(AnswerNativeStubs::class, "The stub answer of {$name} is not the last middleware.");
    }
});
