<?php

use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\SourceContext;
use App\Services\Sources\Stub\FixtureStore;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Support\FakeCapabilityController;

function scenarioContext(?string $scenario): SourceContext
{
    return new SourceContext('ru', 'USD', scenario: $scenario);
}

it('reads a fixture of the store', function (): void {
    $store = new FixtureStore(base_path('tests/Support/fixtures'));

    expect($store->get('fake/default'))->toBe(['from' => 'stub']);
});

it('decodes a fixture once per process', function (): void {
    $root = storage_path('framework/testing/fixtures-'.Str::random(8));
    File::ensureDirectoryExists("{$root}/area");
    File::put("{$root}/area/item.json", '{"version": 1}');
    $store = new FixtureStore($root);

    $first = $store->get('area/item');
    File::put("{$root}/area/item.json", '{"version": 2}');

    expect($first)->toBe(['version' => 1])
        ->and($store->get('area/item'))->toBe(['version' => 1]);
    File::deleteDirectory($root);
});

it('fails loudly on an unknown or invalid fixture name', function (string $name): void {
    $store = new FixtureStore(base_path('tests/Support/fixtures'));

    expect(fn () => $store->get($name))->toThrow(InvalidArgumentException::class);
})->with(['fake/nothing', '../../../.env', 'Fake/Default', '/etc/passwd', 'fake/default.json']);

it('has the fixture store of the API in resources', function (): void {
    expect(app(FixtureStore::class)->root())->toBe(resource_path('fixtures/v1'))
        ->and(is_dir(resource_path('fixtures/v1')))->toBeTrue()
        ->and(fn () => app(FixtureStore::class)->get('nothing/here'))->toThrow(InvalidArgumentException::class);
});

it('picks the fixture of a scenario the method names and ignores any other', function (): void {
    $store = new FixtureStore(base_path('tests/Support/fixtures'));
    $scenarios = ['empty' => 'fake/empty'];

    expect($store->pick(scenarioContext(null), 'fake/default', $scenarios))->toBe(['from' => 'stub'])
        ->and($store->pick(scenarioContext('empty'), 'fake/default', $scenarios))->toBe(['from' => 'stub', 'scenario' => 'empty'])
        ->and($store->pick(scenarioContext('first_launch'), 'fake/default', $scenarios))->toBe(['from' => 'stub']);
});

it('answers a reserved scenario with its error', function (): void {
    $store = new FixtureStore(base_path('tests/Support/fixtures'));

    expect(fn () => $store->pick(scenarioContext('source_unavailable'), 'fake/default'))->toThrow(SourceUnavailable::class);
});

it('honours the scenario header for the stub driver', function (): void {
    FakeCapabilityController::install();

    $this->getJson('/api/v1/_test/fake', ['X-Stub-Scenario' => 'empty'])
        ->assertOk()
        ->assertJsonPath('data.scenario', 'empty')
        ->assertJsonPath('meta.source', 'stub');
});

it('gives each reserved scenario its status and code', function (string $scenario, int $status): void {
    FakeCapabilityController::install();

    $this->getJson('/api/v1/_test/fake', ['X-Stub-Scenario' => $scenario])
        ->assertStatus($status)
        ->assertJsonPath('success', false)
        ->assertJsonPath('code', $scenario);
})->with([
    'source_unavailable' => ['source_unavailable', 503],
    'rate_limited' => ['rate_limited', 429],
    'unauthenticated' => ['unauthenticated', 401],
    'forbidden' => ['forbidden', 403],
]);

it('ignores the scenario header for the legacy driver', function (): void {
    FakeCapabilityController::install();
    FakeCapabilityController::storeRule(['everyone' => 'legacy']);

    $this->getJson('/api/v1/_test/fake', ['X-Stub-Scenario' => 'source_unavailable'])
        ->assertOk()
        ->assertJsonPath('data.from', 'legacy')
        ->assertJsonPath('meta.source', 'legacy');
});

it('copies the stub images to the public media disk under stub/', function (): void {
    $disk = (string) config('media.disks.public');
    Storage::fake($disk);
    $from = storage_path('framework/testing/stub-media-'.Str::random(8));
    File::ensureDirectoryExists("{$from}/listings");
    File::put("{$from}/listings/flat-1.jpg", 'jpeg bytes');
    File::put("{$from}/.gitkeep", '');

    $this->artisan('sources:publish-stub-media', ['--from' => $from])->assertSuccessful();
    $this->artisan('sources:publish-stub-media', ['--from' => $from])->assertSuccessful();

    Storage::disk($disk)->assertExists('stub/listings/flat-1.jpg');
    Storage::disk($disk)->assertMissing('stub/.gitkeep');
    expect(Storage::disk($disk)->get('stub/listings/flat-1.jpg'))->toBe('jpeg bytes')
        ->and(Storage::disk($disk)->allFiles())->toBe(['stub/listings/flat-1.jpg']);
    File::deleteDirectory($from);
});

it('publishes from resources/fixtures/media by default', function (): void {
    Storage::fake((string) config('media.disks.public'));

    $this->artisan('sources:publish-stub-media')->assertSuccessful();

    expect(is_dir(resource_path('fixtures/media')))->toBeTrue();
});
