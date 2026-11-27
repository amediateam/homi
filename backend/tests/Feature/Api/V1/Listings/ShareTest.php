<?php

use App\Models\User;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\JsonShape;

/*
 * WP-43: `POST /listings/{number}/share` for real — `ShareService` behind the route, over a faked Bot API, with
 * `meta.source = native`, the failures as `502 share_failed`, and `v1-share` at its value.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Date::setTestNow('2026-11-27 09:00:00');
    config(['telegram.bot.username' => 'homi_share_api_bot']);
    $this->user = User::factory()->telegram()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/** The Bot API answering every call with `$answer`, or a prepared message valid an hour. */
function fakeShareBotApi(?Closure $answer = null): void
{
    Http::fake(['api.telegram.org/*' => fn (Request $request): PromiseInterface => $answer === null
        ? Factory::response(['ok' => true, 'result' => ['id' => 'prepared-api-1', 'expiration_date' => now()->addHour()->getTimestamp()]])
        : $answer($request)]);
}

function shareOf(int $number): TestResponse
{
    return test()->postJson("/api/v1/listings/{$number}/share");
}

it('answers the prepared message id with its expiry and meta.source native, and the same id again without a request', function (): void {
    fakeShareBotApi();

    $first = shareOf(100012)->assertOk()
        ->assertExactJson(['success' => true, 'data' => ['prepared_message_id' => 'prepared-api-1', 'expires_at' => '2026-11-27T10:00:00+00:00'], 'meta' => ['source' => 'native']]);
    JsonShape::assertSame(['success' => 'bool', 'data' => ['prepared_message_id' => 'string', 'expires_at' => 'string'], 'meta' => ['source' => 'string']], JsonShape::of($first->json()));

    shareOf(100012)->assertOk()->assertJsonPath('data.prepared_message_id', 'prepared-api-1');
    Http::assertSentCount(1);
    Http::assertSent(fn (Request $request): bool => $request['user_id'] === $this->user->telegram_user_id
        && $request['result']['reply_markup']['inline_keyboard'][0][0]['url'] === 'https://t.me/homi_share_api_bot?startapp=l_100012');
});

it('answers 502 share_failed for every Bot API failure, and never quotes the token', function (Closure $answer): void {
    fakeShareBotApi($answer);
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = $entry->message.' '.json_encode($entry->context, JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    });

    $response = shareOf(100012)->assertStatus(502)
        ->assertExactJson(['success' => false, 'message' => 'The share message could not be prepared.', 'code' => 'share_failed']);

    Http::assertSentCount(1);
    expect((string) $response->getContent())->not->toContain('TEST-homi-synthetic-token')
        ->and(implode("\n", $lines->getArrayCopy()))->not->toContain('TEST-homi-synthetic-token');
})->with([
    '400' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 400, 'description' => 'Bad Request: USER_ID_INVALID'], 400)],
    '403' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 403, 'description' => 'Forbidden: bot was blocked by the user'], 403)],
    '429' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 429, 'description' => 'Too Many Requests: retry after 3', 'parameters' => ['retry_after' => 3]], 429)],
    '500' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 500, 'description' => 'Internal Server Error'], 500)],
    'a timeout' => [fn (Request $request): PromiseInterface => (Http::failedConnection('cURL error 28 for https://api.telegram.org/bot123456789:TEST-homi-synthetic-token/savePreparedInlineMessage'))($request)],
]);

it('answers 404 not_found for an unknown listing without a Bot API request', function (): void {
    fakeShareBotApi();

    shareOf(999404)->assertNotFound()->assertJsonPath('code', 'not_found');
    Http::assertNothingSent();
});

it('keeps v1-share at 20 an hour per user, cached answers included', function (): void {
    fakeShareBotApi();

    foreach (range(1, 20) as $attempt) {
        shareOf(100012)->assertOk();
    }

    $limited = shareOf(100012)->assertTooManyRequests()->assertExactJson(['success' => false, 'message' => 'Too Many Attempts.', 'code' => 'rate_limited']);
    expect((int) $limited->headers->get('Retry-After'))->toBeGreaterThan(0)->toBeLessThanOrEqual(3600);
    Http::assertSentCount(1);

    $this->app['auth']->forgetGuards();
    Sanctum::actingAs(User::factory()->telegram()->create(), ['app:read', 'app:write']);
    shareOf(100012)->assertOk();
});

it('keeps v1-contact at 30 an hour per user', function (): void {
    foreach (range(1, 30) as $attempt) {
        $this->postJson('/api/v1/listings/100001/contact')->assertOk();
    }

    $limited = $this->postJson('/api/v1/listings/100001/contact')->assertTooManyRequests()->assertJsonPath('code', 'rate_limited');
    expect((int) $limited->headers->get('Retry-After'))->toBeGreaterThan(0)->toBeLessThanOrEqual(3600);
});
