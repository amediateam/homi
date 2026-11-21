<?php

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\Support\FakeSourcedController;

/**
 * The OpenAPI document exported with the two test routes of the sourced helpers and a foreign `APP_URL`. It is
 * exported once per process: Scramble keeps the parsed code of every class it reads in static caches, so each
 * export in the test process adds to the memory of the whole suite.
 *
 * @return array<string, mixed>
 */
function exportedOpenApi(): array
{
    static $document = null;

    if ($document !== null) {
        return $document;
    }

    config(['app.url' => 'https://elsewhere.example']);
    Route::get('api/v1/_test/sourced', [FakeSourcedController::class, 'show']);
    Route::get('api/v1/_test/sourced-list', [FakeSourcedController::class, 'index']);
    $path = storage_path('framework/testing/openapi-'.Str::random(8).'.json');

    test()->artisan('scramble:export', ['--path' => $path])->assertSuccessful();
    $document = json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR);
    File::delete($path);

    return $document;
}

/**
 * @param  array<string, mixed>  $document
 * @param  array<string, mixed>  $schema
 * @return array<string, mixed>
 */
function resolveSchema(array $document, array $schema): array
{
    while (isset($schema['$ref'])) {
        $schema = data_get($document, str_replace('/', '.', substr($schema['$ref'], 2)));
    }

    return $schema;
}

it('documents a sourced answer: the resource as data and meta.source as an enum of the drivers', function (): void {
    $document = exportedOpenApi();
    $schema = $document['paths']['/_test/sourced']['get']['responses']['200']['content']['application/json']['schema'];

    expect($schema['properties']['data'])->toBe(['$ref' => '#/components/schemas/FakeSourcedResource'])
        ->and(resolveSchema($document, $schema['properties']['meta']['properties']['source'])['enum'])->toBe(['stub', 'legacy', 'native'])
        ->and($schema['required'])->toContain('success', 'data', 'meta');
});

it('documents a cursor list: a list of the resource, meta.source and a nullable next cursor', function (): void {
    $document = exportedOpenApi();
    $schema = $document['paths']['/_test/sourced-list']['get']['responses']['200']['content']['application/json']['schema'];
    $meta = $schema['properties']['meta'];

    expect($schema['properties']['data']['items'])->toBe(['$ref' => '#/components/schemas/FakeSourcedResource'])
        ->and(resolveSchema($document, $meta['properties']['source'])['enum'])->toBe(['stub', 'legacy', 'native'])
        ->and($meta['properties']['next_cursor']['type'])->toBe(['string', 'null'])
        ->and($meta['required'])->toContain('source', 'next_cursor');
});

it('documents every error answer with the shared ApiError schema, which has code', function (): void {
    $document = exportedOpenApi();
    $error = $document['components']['schemas']['ApiError'];

    expect($error['required'])->toBe(['success', 'message', 'code'])
        ->and(array_keys($error['properties']))->toBe(['success', 'message', 'code', 'errors'])
        ->and($document['components']['responses'])->not->toBeEmpty();

    foreach ($document['components']['responses'] as $name => $response) {
        expect($response['content']['application/json']['schema'])->toBe(['$ref' => '#/components/schemas/ApiError'], "response {$name}");
    }
});

it('names a relative server, so the export does not depend on APP_URL', function (): void {
    expect(exportedOpenApi()['servers'])->toBe([['url' => '/api/v1']]);
});

it('documents the seven methods of the session and reference contract (WP-11)', function (): void {
    $paths = exportedOpenApi()['paths'];

    expect($paths['/auth/telegram'])->toHaveKey('post')
        ->and($paths['/me'])->toHaveKey('get')
        ->and($paths['/settings'])->toHaveKeys(['get', 'patch'])
        ->and($paths['/settings/card-sample'])->toHaveKey('post')
        ->and($paths['/reference'])->toHaveKey('get')
        ->and($paths['/cities'])->toHaveKey('get')
        ->and($paths['/events'])->toHaveKey('post');
});

it('documents the nine listing methods (WP-12)', function (): void {
    $paths = exportedOpenApi()['paths'];

    foreach (['/listings', '/listings/count', '/listings/new', '/listings/flow', '/listings/map', '/listings/{number}'] as $path) {
        expect($paths)->toHaveKey($path)->and($paths[$path])->toHaveKey('get');
    }

    foreach (['contact', 'translation', 'share'] as $action) {
        expect($paths["/listings/{number}/{$action}"])->toHaveKey('post');
    }
});

it('shares one preview schema between the feed and the preview card (WP-12)', function (): void {
    $document = exportedOpenApi();
    $feed = resolveSchema($document, $document['paths']['/listings']['get']['responses']['200']['content']['application/json']['schema']);

    expect($feed['properties']['data']['items'])->toBe(['$ref' => '#/components/schemas/ListingPreviewResource'])
        ->and($document['components']['schemas']['ListingPreviewResource']['properties'])->toHaveKeys(['number', 'price', 'photos', 'source_ref'])
        ->and($document['components']['schemas']['ListingPreviewResource']['properties'])->not->toHaveKey('phone');
});

it('types the new-since count as an integer (WP-12, fix of LB-API-055)', function (): void {
    $document = exportedOpenApi();
    $schema = resolveSchema($document, $document['paths']['/listings/new']['get']['responses']['200']['content']['application/json']['schema']);

    expect($schema['properties']['data']['properties']['count'])->toBe(['type' => 'integer'])
        ->and($schema['properties']['data']['required'])->toContain('count');
});

it('documents the fields of legacy release index-CIa0Ldj2: with_point, agent_marked and the meaning of floor', function (): void {
    $schemas = exportedOpenApi()['components']['schemas'];

    expect($schemas['MapPointsResource']['properties']['with_point'])->toBe(['type' => 'integer'])
        ->and($schemas['MapPointsResource']['required'])->toBe(['points', 'total', 'with_point'])
        ->and($schemas['ReportResultResource']['properties']['agent_marked'])->toBe(['type' => 'boolean'])
        ->and($schemas['ReportResultResource']['required'])->toBe(['hidden', 'agent_marked'])
        ->and($schemas['ListingPreviewResource']['properties']['floor']['type'])->toBe(['integer', 'null'])
        ->and($schemas['ListingPreviewResource']['properties']['floor']['description'])->toContain('`0` is the ground-level');
});

it('has every method of the Wave 1 table (25 §4.2) as a route and an OpenAPI path, and no other (WP-13)', function (): void {
    $table = [
        'POST /auth/telegram', 'GET /me', 'GET /settings', 'PATCH /settings', 'POST /settings/card-sample',
        'GET /reference', 'GET /cities', 'GET /listings', 'GET /listings/count', 'GET /listings/flow', 'GET /listings/new', 'GET /listings/map',
        'GET /listings/{number}', 'POST /listings/{number}/contact', 'POST /listings/{number}/translation',
        'POST /listings/{number}/share', 'GET /favorites', 'PUT /favorites/{number}', 'DELETE /favorites/{number}',
        'GET /history', 'DELETE /history', 'PUT /hidden/listings/{number}', 'DELETE /hidden/listings/{number}',
        'PUT /listings/{number}/blocked-author', 'DELETE /listings/{number}/blocked-author', 'GET /hidden',
        'DELETE /hidden/authors/{id}', 'DELETE /hidden', 'POST /listings/{number}/reports', 'DELETE /listings/{number}/reports',
        'POST /surveys/found', 'POST /surveys/found/where', 'GET /radars', 'POST /radars', 'PUT /radars/{id}', 'PATCH /radars/{id}',
        'DELETE /radars/{id}', 'POST /radars/{id}/relax', 'POST /events', 'GET /landing/live', 'GET /landing/pins',
        // The owner cabinet and the seeker's request (WP-80).
        'GET /owner/listings', 'POST /owner/listings', 'GET /owner/listings/{id}', 'PATCH /owner/listings/{id}',
        'DELETE /owner/listings/{id}', 'POST /owner/listings/{id}/photos', 'DELETE /owner/listings/{id}/photos/{photo}',
        'PUT /owner/listings/{id}/photos/order', 'PUT /owner/listings/{id}/contact-mode', 'POST /owner/listings/{id}/phone-request',
        'POST /owner/listings/{id}/publish', 'PUT /owner/listings/{id}/status', 'GET /owner/listings/{id}/requests',
        'POST /owner/requests/{id}/answer', 'PUT /owner/waitlist', 'GET /owner/place', 'GET /owner/demand',
        'POST /listings/{number}/contact-request',
    ];
    $routes = [];

    foreach (Route::getRoutes()->getRoutes() as $route) {
        $uri = '/'.$route->uri();

        if (! str_starts_with($uri, '/api/v1/') || str_starts_with($uri, '/api/v1/media') || str_starts_with($uri, '/api/v1/_test')) {
            continue;
        }

        foreach (array_diff($route->methods(), ['HEAD']) as $method) {
            $routes[] = $method.' '.substr($uri, strlen('/api/v1'));
        }
    }

    sort($routes);
    $expected = $table;
    sort($expected);
    $paths = exportedOpenApi()['paths'];

    expect($table)->toHaveCount(59)
        ->and($routes)->toBe($expected);

    foreach ($table as $pair) {
        [$method, $path] = explode(' ', $pair, 2);
        expect($paths[$path] ?? [])->toHaveKey(strtolower($method));
    }
});
