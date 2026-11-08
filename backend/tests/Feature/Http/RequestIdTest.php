<?php

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;

const ULID_PATTERN = '/^[0-9A-HJKMNP-TV-Z]{26}$/';

it('assigns a ulid request id to every response', function (): void {
    $response = $this->get('/up');

    $response->assertOk()->assertHeader('X-Request-Id');
    expect($response->headers->get('X-Request-Id'))->toMatch(ULID_PATTERN);
});

it('echoes a well-formed inbound request id', function (): void {
    $response = $this->withHeader('X-Request-Id', 'edge-7f3a9c2b.1')->get('/up');

    $response->assertHeader('X-Request-Id', 'edge-7f3a9c2b.1');
});

it('replaces an inbound request id that is not safe to log', function (): void {
    $response = $this->withHeader('X-Request-Id', "bad id\nwith newline and way too many characters to be acceptable at all 0123456789")->get('/up');

    expect($response->headers->get('X-Request-Id'))->toMatch(ULID_PATTERN);
});

it('adds the request id to the shared log context', function (): void {
    Route::get('/_test/log-context', fn (): array => Log::sharedContext());

    $response = $this->withHeader('X-Request-Id', 'ctx-123456789')->get('/_test/log-context');

    $response->assertOk()->assertJsonPath('request_id', 'ctx-123456789');
});
