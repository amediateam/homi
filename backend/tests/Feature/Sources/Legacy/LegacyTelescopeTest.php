<?php

use Illuminate\Support\Facades\Http;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;

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
    $other = IncomingEntry::make(['uri' => 'https://api.telegram.org/bot/getMe', 'response_status' => 200])->type(EntryType::CLIENT_REQUEST);

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
