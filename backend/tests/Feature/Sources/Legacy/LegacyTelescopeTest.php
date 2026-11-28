<?php

use App\Enums\SourceDriver;
use App\Models\User;
use App\Services\Listings\ContactDisclosure;
use App\Services\Listings\TranslationService;
use App\Services\Personal\EloquentOverlayData;
use Illuminate\Redis\Connections\Connection;
use Illuminate\Redis\Events\CommandExecuted;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Laravel\Telescope\Contracts\EntriesRepository;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\Watchers\CacheWatcher;
use Laravel\Telescope\Watchers\RedisWatcher;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

beforeEach(function (): void {
    Http::preventStrayRequests();
});

/** Whether Telescope's filters keep the entry. */
function telescopeKeeps(IncomingEntry $entry): bool
{
    return collect(Telescope::$filterUsing)->every(fn (callable $filter): bool => $filter($entry));
}

it('never keeps an outgoing request to the legacy API, even with TELESCOPE_RECORD_ALL', function (): void {
    config(['telescope.record_all' => true, 'legacy.base_url' => 'https://legacy.example']);
    $legacy = IncomingEntry::make(['uri' => 'https://legacy.example/api/listings/5', 'response_status' => 200])->type(EntryType::CLIENT_REQUEST);
    $other = IncomingEntry::make(['uri' => 'https://other.example/api/listings/5', 'response_status' => 200])->type(EntryType::CLIENT_REQUEST);

    expect(telescopeKeeps($legacy))->toBeFalse()
        ->and(telescopeKeeps($other))->toBeTrue();
});

it('drops a legacy request whatever the case of the configured host', function (): void {
    config(['telescope.record_all' => true, 'legacy.base_url' => 'https://Legacy.Example']);
    $legacy = IncomingEntry::make(['uri' => 'https://legacy.example/api/meta', 'response_status' => 200])->type(EntryType::CLIENT_REQUEST);

    expect(telescopeKeeps($legacy))->toBeFalse();
});

it('masks the configured legacy auth header in outgoing requests', function (): void {
    expect(Telescope::$hiddenRequestHeaders)->toContain('x-service-key');
});

it('keeps no Redis command on a translation, contact or listing card key, even with TELESCOPE_RECORD_ALL', function (): void {
    config(['telescope.record_all' => true]);
    $connection = Mockery::mock(Connection::class);
    $connection->shouldReceive('getName')->andReturn('cache');
    $prefix = (string) config('cache.prefix');
    $user = User::factory()->create();
    $value = serialize(['text' => 'Ijaraga 2 xonali kvartira. Qoʻngʻiroq qiling: +998 ** *** ** 67', 'locale' => 'uz']);
    $dropped = [
        ['setex', [$prefix.TranslationService::key(SourceDriver::Legacy, 100001, 'uz'), 86400, $value]],
        ['get', [$prefix.TranslationService::key(SourceDriver::Stub, 100001, 'en')]],
        ['eval', ['return redis.call("exists",KEYS[1])<1 and redis.call("setex",KEYS[1],ARGV[2],ARGV[1])', 1, $prefix.'legacy:v1:listings:contact:100001', 'eyJpdiI6ImNpcGhlcnRleHQifQ==', 60]],
        ['setex', [$prefix.'legacy:v1:listings:card:100001:ru:USD', 60, serialize(['title' => 'Ijaraga'])]],
        ['get', [$prefix.'legacy:v1:listings:preview:100001:uz:UZS']],
        ['setex', [$prefix.ContactDisclosure::key($user), 86400, serialize([100001, 100002])]],
        ['del', [$prefix.'legacy:v1:listings:contact:100001:lock']],
    ];
    $kept = [
        ['get', [$prefix.'legacy:v1:listings:count:ru:abc']],
        ['incr', [$prefix.'v1-translation:user:'.$user->id]],
    ];

    Telescope::startRecording(loadMonitoredTags: false);

    try {
        foreach ([...$dropped, ...$kept] as [$command, $parameters]) {
            (new RedisWatcher)->recordCommand(new CommandExecuted($command, $parameters, 0.2, $connection));
        }

        Telescope::store(app(EntriesRepository::class));
    } finally {
        Telescope::stopRecording();
        Telescope::flushEntries();
    }

    $commands = DB::table('telescope_entries')->where('type', 'redis')->pluck('content')->map(fn (string $content): string => (string) (json_decode($content, true)['command'] ?? ''))->all();

    expect($commands)->toBe([
        "get {$prefix}legacy:v1:listings:count:ru:abc",
        "incr {$prefix}v1-translation:user:{$user->id}",
    ])
        ->and(DB::table('telescope_entries')->pluck('content')->implode("\n"))->not->toContain('Ijaraga')->not->toContain('ciphertext');
});

it('keeps no cache event on a translation, contact or listing card key, even with TELESCOPE_RECORD_ALL', function (): void {
    config(['telescope.record_all' => true, 'legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    Sleep::fake();
    (new CacheWatcher(['hidden' => [], 'ignore' => []]))->register(app());
    LegacyListingsHttp::fake();

    foreach (['card', 'contact'] as $method) {
        Feature::globally()->activate("source.listings.{$method}", ['everyone' => 'legacy']);
    }

    $user = User::factory()->create();
    Sanctum::actingAs($user, ['app:read', 'app:write']);
    $text = ['text' => 'Ijaraga 2 xonali kvartira', 'locale' => 'uz'];

    Telescope::startRecording(loadMonitoredTags: false);

    try {
        // The real flow: the card files the encrypted contact entry, the contact writes the day entry.
        $this->getJson('/api/v1/listings/100001')->assertOk();
        $this->postJson('/api/v1/listings/100001/contact')->assertOk();

        Cache::put(TranslationService::key(SourceDriver::Legacy, 100001, 'uz'), $text, 60);
        Cache::get(TranslationService::key(SourceDriver::Stub, 100001, 'en'));
        Cache::put(ContactDisclosure::key($user), ['n' => [100001 => true], 'f' => false], 60);
        Cache::get('legacy:v1:listings:contact:100002');
        Cache::get('legacy:v1:listings:preview:100001:uz:UZS');
        Cache::forget('legacy:v1:listings:card:100001:ru:USD');
        Cache::put('legacy:v1:listings:count:ru:abc', 7, 60);
        // WP-44: the realtor keys of HOMI's votes are author keys.
        Cache::put(EloquentOverlayData::REALTOR_KEYS, ['phone:'.str_repeat('a', 32)], 60);

        Telescope::store(app(EntriesRepository::class));
    } finally {
        Telescope::stopRecording();
        Telescope::flushEntries();
    }

    $keys = DB::table('telescope_entries')->where('type', 'cache')->pluck('content')->map(fn (string $content): string => (string) (json_decode($content, true)['key'] ?? ''))->unique()->values()->all();

    expect($keys)->toContain('legacy:v1:listings:count:ru:abc')
        ->and(array_values(array_filter($keys, fn (string $key): bool => preg_match('/translation:|listings:(?:contact|card|preview):|^contact:|^personal:realtor/', $key) === 1)))->toBe([])
        ->and(DB::table('telescope_entries')->pluck('content')->implode("\n"))->not->toContain('Ijaraga')->not->toContain('eyJpdiI6')->not->toContain('100001":true');
});
