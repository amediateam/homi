<?php

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
