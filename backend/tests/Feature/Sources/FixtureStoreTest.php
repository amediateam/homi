<?php

use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\SourceContext;
use App\Services\Sources\Stub\FixtureStore;
use App\Services\Sources\Stub\StubListingSource;
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

it('reads a name whose last parts carry a dot, such as reference/default.ru', function (): void {
    $store = new FixtureStore(base_path('tests/Support/fixtures'));

    expect($store->get('fake/name.with.dots'))->toBe(['dotted' => true]);
});

it('fails loudly on an unknown or invalid fixture name', function (string $name): void {
    $store = new FixtureStore(base_path('tests/Support/fixtures'));

    expect(fn () => $store->get($name))->toThrow(InvalidArgumentException::class);
})->with(['fake/nothing', '../../../.env', 'Fake/Default', '/etc/passwd', 'fake/default.json', 'fake/..', 'fake/.hidden', 'fake/a..b', 'fake.x/default']);

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

it('writes a placeholder and its small variant for every photo of the catalogue', function (): void {
    $disk = (string) config('media.disks.public');
    Storage::fake($disk);
    $from = storage_path('framework/testing/stub-media-'.Str::random(8));
    File::ensureDirectoryExists($from);

    foreach (range(1, 6) as $k) {
        File::put("{$from}/placeholder-{$k}.jpg", "full {$k}");
        File::put("{$from}/placeholder-{$k}.s.jpg", "small {$k}");
    }

    $this->artisan('sources:publish-stub-media', ['--from' => $from])->assertSuccessful();
    $this->artisan('sources:publish-stub-media', ['--from' => $from])->assertSuccessful();

    $paths = [];

    foreach (app(StubListingSource::class)->entries() as $entry) {
        foreach ([...$entry['photos']['preview'], ...$entry['photos']['items']] as $address) {
            expect(preg_match('#/stub/(\d+)/(\d+)\.jpg\?#', $address, $match))->toBe(1);
            $paths["stub/{$match[1]}/{$match[2]}.jpg"] = true;
            $paths["stub/{$match[1]}/{$match[2]}.s.jpg"] = true;
        }
    }

    $files = Storage::disk($disk)->allFiles();
    sort($files);
    $expected = array_keys($paths);
    sort($expected);

    expect($files)->toBe($expected)
        ->and(Storage::disk($disk)->get('stub/100012/1.jpg'))->toStartWith('full ')
        ->and(Storage::disk($disk)->get('stub/100012/1.s.jpg'))->toStartWith('small ');
    File::deleteDirectory($from);
});

it('fails without the six placeholders', function (): void {
    Storage::fake((string) config('media.disks.public'));
    $from = storage_path('framework/testing/stub-media-'.Str::random(8));
    File::ensureDirectoryExists($from);
    File::put("{$from}/placeholder-1.jpg", 'full 1');

    $this->artisan('sources:publish-stub-media', ['--from' => $from])->assertFailed();
    File::deleteDirectory($from);
});

it('publishes the generated placeholders of resources/fixtures/media by default', function (): void {
    $disk = (string) config('media.disks.public');
    Storage::fake($disk);

    $this->artisan('sources:publish-stub-media')->assertSuccessful();

    $full = getimagesizefromstring(Storage::disk($disk)->get('stub/100012/1.jpg'));
    $small = getimagesizefromstring(Storage::disk($disk)->get('stub/100012/1.s.jpg'));

    expect($full['mime'] ?? null)->toBe('image/jpeg')
        ->and($small['mime'] ?? null)->toBe('image/jpeg')
        ->and($small[0])->toBeLessThan($full[0]);
});
