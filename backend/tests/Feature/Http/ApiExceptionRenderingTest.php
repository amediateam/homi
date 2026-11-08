<?php

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\Route;

it('renders model-not-found as a 404 envelope', function (): void {
    Route::get('api/v1/_test/missing', fn () => throw new ModelNotFoundException);

    $this->getJson('/api/v1/_test/missing')
        ->assertNotFound()
        ->assertExactJson(['success' => false, 'message' => 'Resource not found.']);
});

it('renders unknown api routes as a 404 envelope', function (): void {
    $this->getJson('/api/v1/definitely-not-here')
        ->assertNotFound()
        ->assertJson(['success' => false, 'message' => 'Resource not found.']);
});

it('renders validation failures as a 422 envelope with errors', function (): void {
    Route::post('api/v1/_test/validate', fn () => request()->validate(['name' => ['required']]));

    $this->postJson('/api/v1/_test/validate', [])
        ->assertUnprocessable()
        ->assertJsonPath('success', false)
        ->assertJsonStructure(['message', 'errors' => ['name']]);
});

it('renders authentication failures as a 401 envelope', function (): void {
    Route::get('api/v1/_test/auth', fn () => throw new AuthenticationException);

    $this->getJson('/api/v1/_test/auth')
        ->assertUnauthorized()
        ->assertExactJson(['success' => false, 'message' => 'Unauthenticated.']);
});

it('renders authorization failures as a 403 envelope', function (): void {
    Route::get('api/v1/_test/forbidden', fn () => throw new AuthorizationException('No.'));

    $this->getJson('/api/v1/_test/forbidden')
        ->assertForbidden()
        ->assertExactJson(['success' => false, 'message' => 'No.']);
});

it('renders throttling as a 429 envelope and keeps Retry-After', function (): void {
    Route::get('api/v1/_test/throttle', fn () => throw new ThrottleRequestsException('Too Many Attempts.', null, ['Retry-After' => 7]));

    $this->getJson('/api/v1/_test/throttle')
        ->assertStatus(429)
        ->assertHeader('Retry-After', '7')
        ->assertExactJson(['success' => false, 'message' => 'Too Many Attempts.']);
});

it('masks unexpected exceptions as a 500 envelope when debug is off', function (): void {
    config(['app.debug' => false]);
    Route::get('api/v1/_test/boom', fn () => throw new RuntimeException('secret detail'));

    $response = $this->getJson('/api/v1/_test/boom');

    $response->assertStatus(500)->assertExactJson(['success' => false, 'message' => 'Server Error']);
    expect($response->getContent())->not->toContain('secret detail');
});

it('leaves non-api requests to the default html rendering', function (): void {
    Route::get('/_test/html-missing', fn () => throw new ModelNotFoundException);

    $response = $this->get('/_test/html-missing');

    $response->assertNotFound();
    expect($response->headers->get('Content-Type'))->toContain('text/html');
});
