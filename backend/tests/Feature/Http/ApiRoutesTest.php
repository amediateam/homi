<?php

use App\Http\Middleware\AnswerNativeStubs;
use App\Http\Middleware\CountListingOpens;
use App\Http\Middleware\EnsureAccessGranted;
use App\Http\Middleware\EnsureOwnerCabinetEnabled;
use App\Http\Middleware\EnsureRadarsEnabled;
use App\Http\Middleware\SetRequestLocale;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route as Router;

/** @return list<string> the middleware of a named route in the order it runs */
function middlewareOf(string $name): array
{
    $route = Router::getRoutes()->getByName($name);

    return $route instanceof Route ? array_values(Router::gatherRouteMiddleware($route)) : throw new RuntimeException("No route named {$name}.");
}

/** @return list<string> the named limiters of a route, in the order they run */
function limitersOf(string $name): array
{
    $prefix = 'Illuminate\Routing\Middleware\ThrottleRequests:';

    return array_values(array_map(
        fn (string $entry): string => substr($entry, strlen($prefix)),
        array_filter(middlewareOf($name), fn (string $entry): bool => str_starts_with($entry, $prefix)),
    ));
}

/**
 * The limiters of every v1 route (WP-40: the spec's table and the coordinator's decision 4 for the routes it does not
 * name), by limiter. A route that is not listed here fails the test, so a new route cannot ship without a limiter.
 *
 * @return array<string, list<string>> the route names without `api.v1.` by their limiters joined with `+`
 */
function expectedLimiters(): array
{
    return [
        'v1-auth' => ['auth.telegram'],
        'v1-public' => ['reference.show', 'cities.index', 'landing.live', 'landing.pins'],
        'v1-me' => ['me.show'],
        'v1-reads' => [
            'settings.show', 'listings.index', 'listings.count', 'listings.new', 'listings.flow', 'listings.map',
            'favorites.index', 'history.index', 'hidden.index', 'radars.index',
            'owner.listings.index', 'owner.listings.show', 'owner.listings.requests.index',
            // WP-43: a cached translation is a read; `v1-translation` counts the misses inside `TranslationService`.
            'listings.translation',
        ],
        'v1-listing' => ['listings.show'],
        'v1-contact' => ['listings.contact'],
        'v1-share' => ['listings.share'],
        'v1-lists' => [
            'favorites.update', 'favorites.destroy', 'history.destroy', 'hidden.listings.update', 'hidden.listings.destroy',
            'listings.blocked-author.update', 'listings.blocked-author.destroy', 'hidden.authors.destroy', 'hidden.destroy',
            'listings.reports.destroy', 'surveys.found.store', 'surveys.found.where', 'listings.contact-request.store',
        ],
        'v1-reports' => ['listings.reports.store'],
        'v1-radars' => ['settings.update', 'settings.card-sample', 'radars.destroy', 'radars.store', 'radars.update', 'radars.patch', 'radars.relax'],
        'v1-events' => ['events.store'],
        'v1-media' => ['media.show'],
        'uploads' => ['media.store', 'media.presign', 'media.register', 'media.destroy'],
        'owner-place' => ['owner.place'],
        'owner-demand' => ['owner.demand'],
        'owner-writes' => [
            'owner.listings.destroy', 'owner.listings.status', 'owner.requests.answer', 'owner.waitlist.update',
            'owner.listings.store', 'owner.listings.update', 'owner.listings.photos.destroy', 'owner.listings.photos.order',
            'owner.listings.contact-mode',
        ],
        'owner-writes+uploads' => ['owner.listings.photos.store'],
        'owner-writes+owner-publish' => ['owner.listings.phone-request', 'owner.listings.publish'],
    ];
}

it('puts every v1 route behind the request locale and named limiters of its own, never the api limiter', function (): void {
    $names = collect(Router::getRoutes()->getRoutesByName())->keys()->filter(fn (string $name): bool => str_starts_with($name, 'api.v1.'));
    $expected = [];
    foreach (expectedLimiters() as $limiters => $routes) {
        foreach ($routes as $route) {
            $expected['api.v1.'.$route] = explode('+', $limiters);
        }
    }

    expect($names)->not->toBeEmpty()
        ->and($names->sort()->values()->all())->toBe(collect($expected)->keys()->sort()->values()->all())
        ->and(RateLimiter::limiter('api'))->toBeNull();
    foreach ($names as $name) {
        expect(middlewareOf($name))->toContain(SetRequestLocale::class)
            ->and(limitersOf($name))->toBe($expected[$name], "The limiters of {$name} are wrong.");

        foreach (limitersOf($name) as $limiter) {
            expect(RateLimiter::limiter($limiter))->not->toBeNull("The limiter {$limiter} of {$name} is not defined.");
        }
    }
});

it('authenticates a bearer route before its limiter, so the limit counts per user, not per address', function (string $name, string $limiter): void {
    $middleware = middlewareOf($name);
    $auth = array_search('Illuminate\Auth\Middleware\Authenticate:sanctum', $middleware, true);
    $throttle = array_search('Illuminate\Routing\Middleware\ThrottleRequests:'.$limiter, $middleware, true);

    expect($auth)->toBeInt()->and($throttle)->toBeInt()->and($auth)->toBeLessThan($throttle);
})->with([
    'media' => ['api.v1.media.show', 'v1-media'],
    'the card' => ['api.v1.listings.show', 'v1-listing'],
    'events' => ['api.v1.events.store', 'v1-events'],
]);

it('puts the daily cap on opening cards on the card alone', function (): void {
    $names = collect(Router::getRoutes()->getRoutesByName())->keys()->filter(fn (string $name): bool => str_starts_with($name, 'api.v1.'));

    foreach ($names as $name) {
        expect(in_array(CountListingOpens::class, middlewareOf($name), true))->toBe($name === 'api.v1.listings.show', "The daily cap of {$name} is wrong.");
    }
});

it('keeps the public routes public', function (string $name): void {
    expect(middlewareOf($name))->not->toContain('Illuminate\Auth\Middleware\Authenticate:sanctum');
})->with(['api.v1.reference.show', 'api.v1.cities.index']);

it('puts the access gate on every bearer route and on no public one, lenient only on POST /events', function (): void {
    $names = collect(Router::getRoutes()->getRoutesByName())->keys()->filter(fn (string $name): bool => str_starts_with($name, 'api.v1.'));

    foreach ($names as $name) {
        $middleware = middlewareOf($name);
        $gates = array_values(array_filter($middleware, fn (string $entry): bool => explode(':', $entry)[0] === EnsureAccessGranted::class));
        $expected = match (true) {
            ! in_array('Illuminate\Auth\Middleware\Authenticate:sanctum', $middleware, true) => [],
            $name === 'api.v1.events.store' => [EnsureAccessGranted::class.':'.EnsureAccessGranted::LENIENT],
            default => [EnsureAccessGranted::class],
        };

        expect($gates)->toBe($expected, "The access gate of {$name} is wrong.");
    }

    expect(middlewareOf('api.v1.auth.telegram'))->not->toContain(EnsureAccessGranted::class);
});

it('runs the checks of every v1 route in one order and the stub answer last', function (): void {
    $order = [
        'Illuminate\Auth\Middleware\Authenticate',
        'Illuminate\Routing\Middleware\ThrottleRequests',
        SetRequestLocale::class,
        EnsureAccessGranted::class,
        'Laravel\Sanctum\Http\Middleware\CheckForAnyAbility',
        'Laravel\Sanctum\Http\Middleware\CheckAbilities',
        EnsureRadarsEnabled::class,
        EnsureOwnerCabinetEnabled::class,
        CountListingOpens::class,
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
