<?php

use App\Enums\SourceDriver;
use App\Models\User;
use App\Services\Listings\ContactDisclosure;
use App\Services\Listings\TranslationService;
use Illuminate\Redis\Connections\Connection;
use Illuminate\Redis\Events\CommandExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Telescope\Contracts\EntriesRepository;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\Watchers\RedisWatcher;

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
