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
