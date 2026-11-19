<?php

use App\Enums\AccessReason;
use App\Exceptions\AccessDenied;
use App\Exceptions\ApiException;
use App\Exceptions\Listings\DailyLimitReached;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Exceptions\MissingAbilityException;

/** The `code` table of WP-10: every error body of /api/v1 carries `code`. */
it('renders model-not-found as a 404 envelope', function (): void {
    Route::get('api/v1/_test/missing', fn () => throw new ModelNotFoundException);

    $this->getJson('/api/v1/_test/missing')
        ->assertNotFound()
        ->assertExactJson(['success' => false, 'message' => 'Resource not found.', 'code' => 'not_found']);
});

it('renders unknown api routes as a 404 envelope', function (): void {
    $this->getJson('/api/v1/definitely-not-here')
        ->assertNotFound()
        ->assertExactJson(['success' => false, 'message' => 'Resource not found.', 'code' => 'not_found']);
});

it('renders validation failures as a 422 envelope with errors', function (): void {
    Route::post('api/v1/_test/validate', fn () => request()->validate(['name' => ['required']]));

    $this->postJson('/api/v1/_test/validate', [])
        ->assertUnprocessable()
        ->assertJsonPath('success', false)
        ->assertJsonPath('code', 'validation_failed')
        ->assertJsonStructure(['message', 'code', 'errors' => ['name']]);
});

it('renders authentication failures as a 401 envelope', function (): void {
    Route::get('api/v1/_test/auth', fn () => throw new AuthenticationException);

    $this->getJson('/api/v1/_test/auth')
        ->assertUnauthorized()
        ->assertExactJson(['success' => false, 'message' => 'Unauthenticated.', 'code' => 'unauthenticated']);
});

it('renders authorization failures as a 403 envelope', function (): void {
    Route::get('api/v1/_test/forbidden', fn () => throw new AuthorizationException('No.'));

    $this->getJson('/api/v1/_test/forbidden')
        ->assertForbidden()
        ->assertExactJson(['success' => false, 'message' => 'No.', 'code' => 'forbidden']);
});

it('renders a missing token ability as a 403 envelope', function (): void {
    Route::get('api/v1/_test/ability', fn () => throw new MissingAbilityException(['media:write']));

    $this->getJson('/api/v1/_test/ability')
        ->assertForbidden()
        ->assertExactJson(['success' => false, 'message' => 'Invalid ability provided.', 'code' => 'forbidden']);
});

it('chooses the code by status for an authorization failure that carries its own status', function (): void {
    Route::get('api/v1/_test/hidden', fn () => throw (new AuthorizationException)->withStatus(404));

    $this->getJson('/api/v1/_test/hidden')
        ->assertNotFound()
        ->assertExactJson(['success' => false, 'message' => 'Resource not found.', 'code' => 'not_found']);
});

it('renders throttling as a 429 envelope and keeps Retry-After', function (): void {
    Route::get('api/v1/_test/throttle', fn () => throw new ThrottleRequestsException('Too Many Attempts.', null, ['Retry-After' => 7]));

    $this->getJson('/api/v1/_test/throttle')
        ->assertStatus(429)
        ->assertHeader('Retry-After', '7')
        ->assertExactJson(['success' => false, 'message' => 'Too Many Attempts.', 'code' => 'rate_limited']);
});

it('renders the daily limit as 429 rate_limited with the reason daily and Retry-After', function (): void {
    Route::get('api/v1/_test/daily', fn () => throw new DailyLimitReached(5400));

    $this->getJson('/api/v1/_test/daily')
        ->assertStatus(429)
        ->assertHeader('Retry-After', '5400')
        ->assertExactJson(['success' => false, 'message' => 'The daily limit of opened listings is reached.', 'code' => 'rate_limited', 'reason' => 'daily']);
});

it('renders a body over the size cap as a 413 envelope', function (): void {
    Route::post('api/v1/_test/big', fn () => throw new PostTooLargeException);

    $this->postJson('/api/v1/_test/big')
        ->assertStatus(413)
        ->assertJsonPath('success', false)
        ->assertJsonPath('code', 'payload_too_large');
});

it('renders other http exceptions with the http_error code', function (): void {
    Route::get('api/v1/_test/only-get', fn () => 'ok');

    $this->deleteJson('/api/v1/_test/only-get')
        ->assertStatus(405)
        ->assertJsonPath('success', false)
        ->assertJsonPath('code', 'http_error');
});

it('renders an api exception with its own status, code, headers and extra keys', function (): void {
    $exception = new class('The listing was removed.', 410, 'listing_gone', ['X-Removed' => 'yes'], ['number' => 7, 'success' => true]) extends ApiException {};
    Route::get('api/v1/_test/own', fn () => throw $exception);

    $this->getJson('/api/v1/_test/own')
        ->assertStatus(410)
        ->assertHeader('X-Removed', 'yes')
        ->assertExactJson(['success' => false, 'message' => 'The listing was removed.', 'code' => 'listing_gone', 'number' => 7]);
});

it('renders an unavailable source as 503 source_unavailable', function (): void {
    Route::get('api/v1/_test/source-down', fn () => throw new SourceUnavailable);

    $this->getJson('/api/v1/_test/source-down')
        ->assertStatus(503)
        ->assertJsonPath('success', false)
        ->assertJsonPath('code', 'source_unavailable');
});

it('renders a listing the source does not know as 404 not_found', function (): void {
    Route::get('api/v1/_test/source-missing', fn () => throw new SourceNotFound);

    $this->getJson('/api/v1/_test/source-missing')
        ->assertNotFound()
        ->assertExactJson(['success' => false, 'message' => 'Resource not found.', 'code' => 'not_found']);
});

it('leaves an exception that carries its own response to the framework', function (): void {
    Route::get('api/v1/_test/own-response', fn () => throw new HttpResponseException(response()->json(['custom' => true], 202)));

    $this->getJson('/api/v1/_test/own-response')
        ->assertStatus(202)
        ->assertExactJson(['custom' => true]);
});

it('masks unexpected exceptions as a 500 envelope when debug is off', function (): void {
    config(['app.debug' => false]);
    Route::get('api/v1/_test/boom', fn () => throw new RuntimeException('secret detail'));

    $response = $this->getJson('/api/v1/_test/boom');

    $response->assertStatus(500)->assertExactJson(['success' => false, 'message' => 'Server Error', 'code' => 'server_error']);
    expect($response->getContent())->not->toContain('secret detail');
});

it('leaves non-api requests to the default html rendering', function (): void {
    Route::get('/_test/html-missing', fn () => throw new ModelNotFoundException);

    $response = $this->get('/_test/html-missing');

    $response->assertNotFound();
    expect($response->headers->get('Content-Type'))->toContain('text/html');
});

it('renders an access refusal with its reason', function (AccessReason $reason): void {
    Route::get('api/v1/_test/denied', fn () => throw new AccessDenied($reason));

    $this->getJson('/api/v1/_test/denied')
        ->assertForbidden()
        ->assertExactJson(['success' => false, 'message' => 'Access denied.', 'code' => 'access_denied', 'reason' => $reason->value]);
})->with(AccessReason::cases());

it('knows the six refusal reasons of the no-access screen', function (): void {
    expect(array_map(fn (AccessReason $reason): string => $reason->value, AccessReason::cases()))
        ->toBe(['private', 'invite', 'full', 'blocked', 'join', 'paused']);
});
