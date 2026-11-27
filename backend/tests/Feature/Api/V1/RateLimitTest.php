<?php

use App\Models\Source;
use App\Models\User;
use App\Services\Access\RateLimits;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\EnvOverride;

/**
 * The named limiters of /api/v1 and the daily cap on opening full cards (WP-40, SEC-REQ-027, KV-BE-010; DEC-104 …
 * DEC-107), on a frozen clock with the array cache of the test suite. The stub catalogue answers the listings.
 */
beforeEach(function (): void {
    $this->freezeTime();
});

/** Signs a HOMI user in for the next requests (a new one unless given), with the abilities of a Mini App token. */
function actAsLimitedUser(?User $user = null): User
{
    app('auth')->forgetGuards();
    $user ??= User::factory()->create();
    Sanctum::actingAs($user, ['app:read', 'app:write']);

    return $user;
}

/**
 * @param  array<string, mixed>  $body
 * @param  array<string, string>  $headers
 */
function callV1(string $method, string $uri, array $body = [], array $headers = []): TestResponse
{
    return test()->json($method, '/api/v1/'.$uri, $body, $headers);
}

function assertLimited(TestResponse $response, int $period): void
{
    $response->assertTooManyRequests()
        ->assertExactJson(['success' => false, 'message' => 'Too Many Attempts.', 'code' => 'rate_limited']);

    expect((int) $response->headers->get('Retry-After'))->toBeGreaterThan(0)->toBeLessThanOrEqual($period);
}

it('limits each route class at its configured count, per period, and names no reason', function (string $key, bool $bearer, string $method, string $uri, array $body, int $period, int $answered): void {
    config(['rate_limits.'.$key => 2]);

    if ($bearer) {
        actAsLimitedUser();
    }

    foreach (range(1, 2) as $attempt) {
        expect(callV1($method, $uri, $body)->status())->toBe($answered);
    }

    assertLimited(callV1($method, $uri, $body), $period);

    $this->travel($period - 1)->seconds();
    assertLimited(callV1($method, $uri, $body), $period);

    $this->travel(2)->seconds();
    expect(callV1($method, $uri, $body)->status())->toBe($answered);
})->with([
    'v1-auth, per address' => ['auth.per_address', false, 'POST', 'auth/telegram', ['init_data' => 'a'], 60, 401],
    'v1-public' => ['public.per_minute', false, 'GET', 'reference', [], 60, 200],
    'v1-me' => ['me.per_minute', true, 'GET', 'me', [], 60, 200],
    'v1-reads' => ['reads.per_minute', true, 'GET', 'favorites', [], 60, 200],
    'v1-listing' => ['listing.per_minute', true, 'GET', 'listings/100001?preview=1', [], 60, 200],
    'v1-contact' => ['contact.per_hour', true, 'POST', 'listings/100001/contact', [], 3600, 200],
    // WP-43: `v1-translation` counts only the misses of `TranslationService` (`TranslationTest`); the route is read
    // under `v1-reads`, so a cached translation is counted there.
    'v1-reads, a translation' => ['reads.per_minute', true, 'POST', 'listings/100001/translation', [], 60, 200],
    'v1-share' => ['share.per_hour', true, 'POST', 'listings/100001/share', [], 3600, 200],
    'v1-lists' => ['lists.per_minute', true, 'PUT', 'favorites/100001', [], 60, 200],
    'v1-reports' => ['reports.per_day', true, 'POST', 'listings/100001/reports', ['reason' => 'rented'], 86400, 200],
    'v1-radars' => ['radars.per_minute', true, 'PATCH', 'settings', [], 60, 200],
    'v1-media' => ['media.per_minute', true, 'GET', 'media/01JDQ0000000000000000000AA', [], 60, 404],
]);

it('counts every route of a limiter in one bucket', function (): void {
    config(['rate_limits.public.per_minute' => 3]);

    callV1('GET', 'reference')->assertOk();
    callV1('GET', 'cities')->assertOk();
    callV1('GET', 'landing/live')->assertOk();
    assertLimited(callV1('GET', 'landing/pins'), 60);
});

it('drops the events over the limit with 204, without reading them', function (): void {
    config(['rate_limits.events.per_minute' => 2]);
    actAsLimitedUser();

    callV1('POST', 'events', ['name' => ''])->assertUnprocessable();
    callV1('POST', 'events', ['name' => 'app_launch'])->assertNoContent();

    $dropped = callV1('POST', 'events', ['name' => ''])->assertNoContent();
    expect($dropped->getContent())->toBe('');
});

it('keeps a bucket per user, and one bucket for a user on two addresses', function (): void {
    config(['rate_limits.reads.per_minute' => 1]);
    $first = actAsLimitedUser();

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10']);
    callV1('GET', 'favorites')->assertOk();
    $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.20']);
    assertLimited(callV1('GET', 'favorites'), 60);

    actAsLimitedUser();
    callV1('GET', 'favorites')->assertOk();

    actAsLimitedUser($first);
    assertLimited(callV1('GET', 'favorites'), 60);
});

it('keys a user by his internal id, a collector by its class and id, and a guest by the address', function (): void {
    $user = User::factory()->telegram()->create(['telegram_user_id' => 279058397]);
    $source = Source::factory()->create(['id' => $user->id]);
    $keyFor = function (?Model $actor): string {
        $request = Request::create('/api/v1/me', server: ['REMOTE_ADDR' => '203.0.113.10']);
        $request->setUserResolver(fn (): ?Model => $actor);
        $limit = RateLimiter::limiter('v1-me')($request);

        return $limit instanceof Limit ? $limit->key : throw new RuntimeException('v1-me gives no single limit.');
    };

    expect($keyFor($user))->toBe('user:'.$user->id)
        ->and($keyFor($source))->toBe(Source::class.':'.$source->id)
        ->and($keyFor(null))->toBe('203.0.113.10');
});

it('never lets a user and a collector with the same id share a bucket', function (): void {
    config(['rate_limits.media.per_minute' => 1]);
    $user = actAsLimitedUser(User::factory()->create(['id' => 7]));
    $unknown = (string) Str::ulid();

    callV1('GET', "media/{$unknown}")->assertNotFound();
    assertLimited(callV1('GET', "media/{$unknown}"), 60);

    app('auth')->forgetGuards();
    $this->withToken(Source::factory()->create(['id' => $user->id])->createToken('test', ['media:write'])->plainTextToken);
    callV1('GET', "media/{$unknown}")->assertNotFound();
});

it('keeps a bucket per address on the public routes', function (): void {
    config(['rate_limits.public.per_minute' => 1]);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10']);
    callV1('GET', 'reference')->assertOk();
    $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.20']);
    callV1('GET', 'reference')->assertOk();
    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10']);
    assertLimited(callV1('GET', 'reference'), 60);
});

it('lets the recorded radar-tab burst and a filter session through on the default limits', function (): void {
    actAsLimitedUser();
    $query = 'city=tashkent&deal=rent_long';

    // Ten radars, each with its feed, count and flow, within two seconds (KV-BE-010, LB-API-038).
    foreach (range(1, 10) as $radar) {
        callV1('GET', "listings?{$query}")->assertOk();
        callV1('GET', "listings/count?{$query}")->assertOk();
        callV1('GET', "listings/flow?{$query}")->assertOk();
    }

    // A minute of filtering after it: 40 counts and 20 flows, debounced by the client.
    foreach (range(1, 20) as $step) {
        $this->travel(1)->seconds();
        callV1('GET', "listings/count?{$query}&rooms[]={$step}")->assertOk();
        callV1('GET', "listings/count?{$query}")->assertOk();
        callV1('GET', "listings/flow?{$query}")->assertOk();
    }
});

it('answers a mistyped count with its default, never with an error', function (): void {
    config(['rate_limits.me.per_minute' => 'thirty']);
    actAsLimitedUser();

    foreach (range(1, 30) as $attempt) {
        callV1('GET', 'me')->assertOk();
    }

    assertLimited(callV1('GET', 'me'), 60);
});

it('reads a count leniently', function (mixed $value, int $expected): void {
    config(['rate_limits.me.per_minute' => $value]);

    expect(RateLimits::value('me.per_minute'))->toBe($expected);
})->with([
    'a number' => [7, 7],
    'a string of digits' => ['7', 7],
    'digits with spaces' => [' 7 ', 7],
    'a word' => ['seven', 30],
    'a blank string' => ['', 30],
    'zero' => [0, 30],
    'a negative number' => [-3, 30],
    'a fraction' => [2.5, 30],
    'a switch' => [true, 30],
    'a list' => [[7], 30],
    'nothing' => [null, 30],
]);

it('keeps the values of config/rate_limits.php equal to the defaults of the reader', function (): void {
    $config = EnvOverride::with('RATE_LIMIT_LISTING_OPENS_PER_DAY', null, fn (): array => require config_path('rate_limits.php'));

    expect(Arr::dot($config))->toBe(RateLimits::DEFAULTS);
});

it('reads the daily cap of the environment as the reader decides, never as a small cap', function (?string $value, int $expected): void {
    config(['rate_limits' => EnvOverride::with('RATE_LIMIT_LISTING_OPENS_PER_DAY', $value, fn (): array => require config_path('rate_limits.php'))]);

    expect(RateLimits::value('listing_opens_per_day'))->toBe($expected);
})->with([
    'a number' => ['250', 250],
    'digits with spaces' => [' 40 ', 40],
    'unset' => [null, 100],
    'blank' => ['', 100],
    'zero' => ['0', 100],
    'negative' => ['-5', 100],
    'a word' => ['abc', 100],
    'a switch' => ['true', 100],
    'a switch in brackets' => ['(true)', 100],
    'an exponent' => ['1e3', 100],
    'a fraction' => ['2.5', 100],
    'null' => ['null', 100],
]);

describe('the daily cap on opening full cards', function (): void {
    beforeEach(function (): void {
        config(['rate_limits.listing_opens_per_day' => 2]);
    });

    it('answers the next different full card over the cap with 429 rate_limited, reason daily and Retry-After', function (): void {
        actAsLimitedUser();

        callV1('GET', 'listings/100001')->assertOk();
        callV1('GET', 'listings/100002')->assertOk();

        callV1('GET', 'listings/100003')->assertTooManyRequests()
            ->assertHeader('Retry-After', '86400')
            ->assertExactJson(['success' => false, 'message' => 'The daily limit of opened listings is reached.', 'code' => 'rate_limited', 'reason' => 'daily']);

        $this->travel(86_399)->seconds();
        callV1('GET', 'listings/100003')->assertTooManyRequests()->assertHeader('Retry-After', '1')->assertJsonPath('reason', 'daily');

        $this->travel(1)->seconds();
        callV1('GET', 'listings/100003')->assertOk();
    });

    it('opens a card counted in the window again for free, also after the cap', function (): void {
        actAsLimitedUser();

        callV1('GET', 'listings/100001')->assertOk();
        callV1('GET', 'listings/100001')->assertOk();
        callV1('GET', 'listings/100002')->assertOk();
        callV1('GET', 'listings/100003')->assertTooManyRequests()->assertJsonPath('reason', 'daily');

        callV1('GET', 'listings/100001')->assertOk();
        callV1('GET', 'listings/100002')->assertOk();
    });

    it('counts per user, never per address', function (): void {
        $first = actAsLimitedUser();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10']);
        callV1('GET', 'listings/100001')->assertOk();
        callV1('GET', 'listings/100002')->assertOk();

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.20']);
        callV1('GET', 'listings/100003')->assertTooManyRequests()->assertJsonPath('reason', 'daily');

        actAsLimitedUser();
        callV1('GET', 'listings/100003')->assertOk();

        actAsLimitedUser($first);
        callV1('GET', 'listings/100004')->assertTooManyRequests()->assertJsonPath('reason', 'daily');
    });

    it('neither counts nor refuses the preview (DEC-105)', function (): void {
        actAsLimitedUser();

        foreach ([100001, 100002, 100003] as $number) {
            callV1('GET', "listings/{$number}?preview=1")->assertOk();
        }

        callV1('GET', 'listings/100004')->assertOk();
        callV1('GET', 'listings/100005')->assertOk();
        callV1('GET', 'listings/100006')->assertTooManyRequests()->assertJsonPath('reason', 'daily');

        callV1('GET', 'listings/100006?preview=1')->assertOk();
    });

    it('counts only an answered card: a missing number or a refused request costs nothing', function (): void {
        actAsLimitedUser();

        callV1('GET', 'listings/999404')->assertNotFound();
        callV1('GET', 'listings/100001?preview=maybe')->assertUnprocessable();
        callV1('GET', 'listings/100001', headers: ['X-Stub-Scenario' => 'daily_limit'])->assertTooManyRequests();

        callV1('GET', 'listings/100001')->assertOk();
        callV1('GET', 'listings/100002')->assertOk();
        callV1('GET', 'listings/100003')->assertTooManyRequests()->assertJsonPath('reason', 'daily');
    });

    it('answers a 429 of the request limiter without a reason', function (): void {
        config(['rate_limits.listing.per_minute' => 1]);
        actAsLimitedUser();

        callV1('GET', 'listings/100001')->assertOk();

        $refused = callV1('GET', 'listings/100002')->assertTooManyRequests()->assertJsonMissingPath('reason');
        expect((int) $refused->headers->get('Retry-After'))->toBeLessThanOrEqual(60);
    });

    it('reads a cap written as a string of digits', function (): void {
        config(['rate_limits.listing_opens_per_day' => '3']);
        actAsLimitedUser();

        foreach ([100001, 100002, 100003] as $number) {
            callV1('GET', "listings/{$number}")->assertOk();
        }

        callV1('GET', 'listings/100004')->assertTooManyRequests()->assertJsonPath('reason', 'daily');
    });

    it('reads a cap it cannot read as the default of 100, never as 0', function (mixed $value): void {
        config(['rate_limits.listing_opens_per_day' => $value]);
        actAsLimitedUser();

        expect(RateLimits::value('listing_opens_per_day'))->toBe(100);

        foreach (range(100001, 100023) as $number) {
            callV1('GET', "listings/{$number}")->assertOk();
        }
    })->with(['a word' => 'many', 'zero' => 0, 'blank' => '', 'a switch' => true]);
});
