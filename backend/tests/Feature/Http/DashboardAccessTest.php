<?php

use App\Http\DashboardAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;

it('refuses the Horizon dashboard without the nginx basic-auth user', function () {
    $this->get('/horizon')->assertForbidden();
});

it('refuses the Horizon dashboard when the nginx user is empty', function () {
    $this->withServerVariables([DashboardAccess::SERVER_VARIABLE => ''])
        ->get('/horizon')
        ->assertForbidden();
});

it('ignores a client header that imitates the nginx user', function () {
    $this->withHeaders(['Homi-Dashboard-User' => 'homi'])
        ->get('/horizon')
        ->assertForbidden();
});

it('opens the Horizon dashboard behind nginx basic auth', function () {
    $this->withServerVariables([DashboardAccess::SERVER_VARIABLE => 'homi'])
        ->get('/horizon')
        ->assertOk();
});

it('lets the Telescope gate follow nginx basic auth', function (array $server, bool $allowed) {
    $this->app->instance('request', Request::create('/telescope', 'GET', server: $server));

    expect(Gate::allows('viewTelescope'))->toBe($allowed);
})->with([
    'no nginx user' => [[], false],
    'empty nginx user' => [[DashboardAccess::SERVER_VARIABLE => ''], false],
    'nginx user' => [[DashboardAccess::SERVER_VARIABLE => 'homi'], true],
]);

it('records an ordinary request outside local only with TELESCOPE_RECORD_ALL', function (bool $recordAll) {
    config(['telescope.record_all' => $recordAll]);

    $entry = IncomingEntry::make(['uri' => '/api/v1/media', 'response_status' => 200])
        ->type(EntryType::REQUEST);

    expect(collect(Telescope::$filterUsing)->every(fn (callable $filter): bool => $filter($entry)))
        ->toBe($recordAll);
})->with([
    'record all' => [true],
    'failures only' => [false],
]);
