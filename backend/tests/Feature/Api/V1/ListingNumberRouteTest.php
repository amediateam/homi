<?php

use App\Models\User;
use App\Services\Listings\ListingNumber;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Route as Router;
use Laravel\Sanctum\Sanctum;

/*
 * Review of stage A, F3: a listing number in the path is 1 to 18 digits without a leading zero
 * (`ListingNumber::ROUTE_PATTERN`) on every `{number}` route of `/api/v1` — WP-12's card, WP-43's contact, translation
 * and share, WP-80's contact request and WP-44's personal writes alike — so a number outside the `int` range, zero or
 * one with a leading zero matches no route and answers the framework's `404 not_found` before any controller casts it
 * (it once answered `500`), whether the native stubs answer or HOMI's own tables do.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Queue::fake();
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

/**
 * Every method and path of `/api/v1` with a `{number}` parameter.
 *
 * @return list<array{method: string, uri: string, route: Route}>
 */
function listingNumberRoutes(): array
{
    $calls = [];

    foreach (Router::getRoutes()->getRoutes() as $route) {
        if (! str_starts_with($route->uri(), 'api/v1/') || ! in_array('number', $route->parameterNames(), true)) {
            continue;
        }

        foreach (array_diff($route->methods(), ['HEAD']) as $method) {
            $calls[] = ['method' => $method, 'uri' => $route->uri(), 'route' => $route];
        }
    }

    return $calls;
}

it('constrains the number of every listing route of the API to the listing-number pattern', function (): void {
    $calls = listingNumberRoutes();

    expect($calls)->toHaveCount(13);

    foreach ($calls as $call) {
        expect($call['route']->wheres['number'] ?? null)->toBe(ListingNumber::ROUTE_PATTERN, "{$call['method']} {$call['uri']}");
    }
});

it('answers 404 not_found, never 500, for a number outside the pattern on every listing route', function (bool $nativeStubs, string $number): void {
    config(['sources.native_stubs' => $nativeStubs]);

    foreach (listingNumberRoutes() as $call) {
        $this->json($call['method'], '/'.str_replace('{number}', $number, $call['uri']), ['reason' => 'agent'])
            ->assertNotFound()->assertJsonPath('code', 'not_found');
    }
})->with([
    'HOMI\'s tables' => false,
    'native stubs' => true,
])->with([
    'beyond the integers' => '99999999999999999999',
    'the largest integer' => '9223372036854775807',
    'nineteen digits' => '1000000000000000000',
    'zero' => '0',
    'a leading zero' => '00000000000000000000001',
]);

it('lets the largest number of the pattern through to the controller, which never answers 500', function (bool $nativeStubs): void {
    config(['sources.native_stubs' => $nativeStubs]);

    foreach (listingNumberRoutes() as $call) {
        $status = $this->json($call['method'], '/'.str_replace('{number}', '999999999999999999', $call['uri']), ['reason' => 'agent'])->status();

        // The share answers its own `502 share_failed` here before it reads the listing: this test configures no bot
        // and its user has no Telegram id (`ShareService::prepare()`, WP-43).
        expect($status)->not->toBe(500, "{$call['method']} {$call['uri']}");
    }
})->with([
    'HOMI\'s tables' => false,
    'native stubs' => true,
]);
