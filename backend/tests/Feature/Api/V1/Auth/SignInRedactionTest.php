<?php

use App\Models\User;
use App\Services\Access\AccessGate;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Laravel\Telescope\Contracts\EntriesRepository;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\Watchers\RequestWatcher;
use Tests\Support\InitDataSigner;

/**
 * Redaction of the launch data and the tokens (WP-40, SEC-REQ-047): neither the signed value, nor a bearer token, nor
 * its hash, nor a Telegram id reaches a log line or an exception report, whatever the sign-in answers; Telescope hides
 * them outside `local`, and the session never keeps the launch data as old input.
 */
beforeEach(function (): void {
    Date::setTestNow('2026-11-26 09:00:00');
});

/**
 * Everything written to the log while the closure runs, exceptions with their traces (arguments included), as text.
 */
function loggedTextOf(Closure $requests): string
{
    $entries = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($entries): void {
        $entries->append($entry);
    });

    $requests();

    return implode("\n", array_map(function (MessageLogged $entry): string {
        $context = array_map(fn (mixed $value): mixed => $value instanceof Throwable ? (string) $value : $value, $entry->context);

        return $entry->level.' '.$entry->message.' '.json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    }, $entries->getArrayCopy()));
}

/**
 * What no log line may hold: each launch value, its start (a trace prints the first characters of a string
 * argument) and its `hash`; each issued token, its plain part and the hash of that; the Telegram ids.
 *
 * @param  list<string>  $values
 * @param  list<string>  $tokens
 * @param  list<int>  $telegramIds
 * @return list<string>
 */
function signInSecretsOf(array $values, array $tokens, array $telegramIds = [InitDataSigner::TELEGRAM_USER_ID]): array
{
    $secrets = array_map(strval(...), $telegramIds);

    foreach ($values as $value) {
        array_push($secrets, $value, substr($value, 0, 15));

        $hash = InitDataSigner::field($value, 'hash');

        if ($hash !== null) {
            $secrets[] = $hash;
        }
    }

    foreach ($tokens as $token) {
        $plain = explode('|', $token, 2)[1];
        array_push($secrets, $token, $plain, hash('sha256', $plain));
    }

    return $secrets;
}

/** @param  list<string>  $secrets */
function expectNoSecretIn(string $logged, array $secrets): void
{
    foreach ($secrets as $secret) {
        expect(str_contains($logged, $secret))->toBeFalse('A log line holds a launch value, a token or a Telegram id.');
    }
}

/** Signs in with the launch value from the given address; the token, or null when the sign-in is refused. */
function signInFrom(string $address, string $initData, int $status): ?string
{
    $response = test()->withServerVariables(['REMOTE_ADDR' => $address])
        ->postJson('/api/v1/auth/telegram', ['init_data' => $initData])
        ->assertStatus($status);

    return $status === 200 ? (string) $response->json('data.token') : null;
}

it('writes no launch value, token, token hash or Telegram id to the log, whatever the sign-in answers', function (): void {
    $now = now()->getTimestamp();
    $valid = InitDataSigner::valid($now);
    $other = InitDataSigner::valid($now, ['user' => ['id' => 100000001], 'query_id' => 'AAHomiRedactionOther']);
    $values = [
        'valid' => $valid,
        'forged' => InitDataSigner::tamper($valid, 'auth_date', (string) ($now - 5)),
        'expired' => InitDataSigner::valid($now - 7200),
        'duplicate key' => $valid.'&auth_date='.$now,
        'too large' => $valid.'&pad='.str_repeat('x', 4097),
        'refused by the gate' => InitDataSigner::valid($now, ['query_id' => 'AAHomiRedactionPrivate']),
        'failing on the server' => $other,
    ];
    $tokens = [];

    $logged = loggedTextOf(function () use ($values, &$tokens): void {
        $tokens[] = (string) $this->postJson('/api/v1/auth/telegram', ['init_data' => $values['valid']])->assertOk()->json('data.token');
        $this->withToken($tokens[0])->getJson('/api/v1/me')->assertOk();
        app('auth')->forgetGuards();
        $this->withToken($tokens[0].'x')->getJson('/api/v1/me')->assertUnauthorized();
        $this->withoutToken()->postJson('/api/v1/auth/telegram', ['init_data' => $values['forged']])->assertUnauthorized();
        $this->postJson('/api/v1/auth/telegram', ['init_data' => $values['expired']])->assertUnauthorized();
        $this->postJson('/api/v1/auth/telegram', ['init_data' => $values['duplicate key']])->assertUnauthorized();
        $this->postJson('/api/v1/auth/telegram', ['init_data' => $values['too large']])->assertUnprocessable();

        config(['access.mode' => 'private']);
        app(AccessGate::class)->forget(User::query()->sole());
        $this->postJson('/api/v1/auth/telegram', ['init_data' => $values['refused by the gate']])->assertForbidden();

        config(['access.mode' => 'open', 'app.debug' => false]);
        User::creating(fn (): never => throw new RuntimeException('The user store failed.'));
        $this->postJson('/api/v1/auth/telegram', ['init_data' => $values['failing on the server']])->assertServerError();
    });

    expect($logged)->toContain('The user store failed.')->toContain('Telegram sign-in refused.');
    expectNoSecretIn($logged, signInSecretsOf(array_values($values), $tokens, [InitDataSigner::TELEGRAM_USER_ID, 100000001]));
});

it('writes no launch value, token or Telegram id to the log on the 21st exchange of one value', function (): void {
    // Only the count of exchanges may refuse here: the per-address and per-user limits are raised out of the way.
    config(['rate_limits.auth.per_address' => 100, 'rate_limits.auth.per_user' => 100]);
    $value = InitDataSigner::valid(now()->getTimestamp());
    $tokens = [];

    $logged = loggedTextOf(function () use ($value, &$tokens): void {
        foreach (range(1, 20) as $exchange) {
            $tokens[] = (string) signInFrom('203.0.113.10', $value, 200);
        }

        signInFrom('203.0.113.10', $value, 429);
    });

    expect($tokens)->toHaveCount(20)->each->not->toBeEmpty()
        ->and($logged)->toContain('Telegram sign-in refused.')->toContain('"reason":"too_many_exchanges"')->not->toContain('too_many_sign_ins');
    expectNoSecretIn($logged, signInSecretsOf([$value], $tokens));
});

it('writes no launch value, token or Telegram id to the log when one user signs in too often', function (): void {
    config(['rate_limits.auth.per_user' => 1]);
    $now = now()->getTimestamp();
    $values = [
        InitDataSigner::valid($now, ['query_id' => 'AAHomiRedactionFirst']),
        InitDataSigner::valid($now, ['query_id' => 'AAHomiRedactionSecond']),
    ];

    $tokens = [];
    $logged = loggedTextOf(function () use ($values, &$tokens): void {
        $tokens[] = (string) signInFrom('203.0.113.10', $values[0], 200);
        signInFrom('198.51.100.20', $values[1], 429);
    });

    expect($logged)->toContain('"reason":"too_many_sign_ins"')->toContain('"user_id":'.User::query()->sole()->id)
        ->not->toContain('too_many_exchanges');
    expectNoSecretIn($logged, signInSecretsOf($values, $tokens));
});

it('writes no launch value, token or Telegram id to the log when the address is over the route limit', function (): void {
    config(['rate_limits.auth.per_address' => 1]);
    $now = now()->getTimestamp();
    $values = [
        InitDataSigner::valid($now, ['query_id' => 'AAHomiRedactionFirst']),
        InitDataSigner::valid($now, ['query_id' => 'AAHomiRedactionSecond']),
    ];

    $tokens = [];
    $logged = loggedTextOf(function () use ($values, &$tokens): void {
        $tokens[] = (string) signInFrom('203.0.113.10', $values[0], 200);
        signInFrom('203.0.113.10', $values[1], 429);
    });

    // The route limiter answers before the sign-in runs: the only line is the first, successful sign-in.
    expect(substr_count($logged, 'Telegram sign-in.'))->toBe(1)
        ->and($logged)->not->toContain('Telegram sign-in refused.');
    expectNoSecretIn($logged, signInSecretsOf($values, $tokens));
});

it('hides the launch data, the bearer token and the cookies from Telescope outside local', function (): void {
    expect(app()->environment('local'))->toBeFalse()
        ->and(Telescope::$hiddenRequestParameters)->toContain('init_data', 'initData')
        ->and(Telescope::$hiddenRequestHeaders)->toContain('authorization', 'cookie')
        ->and(Telescope::$hiddenResponseParameters)->toContain('data.token');
});

it('masks the launch data in the address of a stored Telescope request outside local, under either spelling', function (): void {
    expect(app()->environment('local'))->toBeFalse();
    config(['telescope.record_all' => true]);
    (new RequestWatcher(['size_limit' => 64]))->register(app());
    $value = InitDataSigner::valid(now()->getTimestamp());

    Telescope::startRecording(loadMonitoredTags: false);

    try {
        $token = (string) $this->postJson('/api/v1/auth/telegram?city=tashkent&initData='.rawurlencode($value).'&init_data='.rawurlencode($value), ['init_data' => $value])
            ->assertOk()->json('data.token');
        $this->getJson('/api/v1/reference?init.data='.rawurlencode($value).'&init_data[]='.urlencode($value).'&lang=ru')->assertOk();

        Telescope::store(app(EntriesRepository::class));
    } finally {
        Telescope::stopRecording();
        Telescope::flushEntries();
    }

    $stored = DB::table('telescope_entries')->where('type', 'request')->orderBy('sequence')->pluck('content')->all();
    $uris = array_map(fn (string $content): mixed => json_decode($content, true)['uri'] ?? null, $stored);

    expect($uris)->toBe([
        '/api/v1/auth/telegram?city=tashkent&initData=********&init_data=********',
        '/api/v1/reference?init.data=********&init_data%5B0%5D=********&lang=ru',
    ]);

    $plain = explode('|', $token, 2)[1];
    foreach ([$value, rawurlencode($value), urlencode($value), (string) InitDataSigner::field($value, 'hash'), $token, $plain] as $secret) {
        expect(str_contains(implode("\n", $stored), $secret))->toBeFalse('A stored Telescope entry holds the launch value or the token.');
    }
});

it('never keeps the launch data as old input of a session', function (): void {
    Route::post('_test/flash', fn () => throw ValidationException::withMessages(['city' => 'Unknown city.']))->middleware('web');

    $this->post('/_test/flash', ['init_data' => 'query_id=AAHomi&hash=abc', 'city' => 'tashkent'])->assertRedirect();

    expect(session()->getOldInput())->toBe(['city' => 'tashkent']);
});
