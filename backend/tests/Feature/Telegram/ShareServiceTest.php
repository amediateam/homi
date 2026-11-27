<?php

use App\Exceptions\Listings\ShareFailed;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Exceptions\TelegramException;
use App\Models\User;
use App\Services\Sources\Legacy\LegacyFakeServer;
use App\Services\Sources\SourceContext;
use App\Services\Telegram\ShareService;
use App\Services\Telegram\TelegramClient;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Pulse\Recorders\SlowOutgoingRequests;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-43: `ShareService` and the minimal `TelegramClient` over a faked Bot API (`savePreparedInlineMessage`, Bot API
 * 10.5) — the message, the reuse of a prepared id per user, listing and locale, the failures that are `502
 * share_failed`, and the promise that the bot token never reaches an exception, a log line or Telescope. The card
 * source is the stub driver unless a test says otherwise; `phpunit.xml` sets the synthetic token below.
 */

const SHARE_TOKEN = '123456789:TEST-homi-synthetic-token';

const SHARE_BOT = 'homi_share_test_bot';

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    Date::setTestNow('2026-11-27 09:00:00');
    config(['telegram.bot.token' => SHARE_TOKEN, 'telegram.bot.username' => SHARE_BOT]);
    $this->user = User::factory()->telegram()->create();
    $this->botAnswers = new ArrayObject;
});

/**
 * The Bot API over `Http::fake()`: each call takes the next answer queued in `$this->botAnswers` (a response or a
 * closure of the request), else a prepared message `prepared-<n>` valid an hour.
 */
function fakeBotApi(): void
{
    $answers = test()->botAnswers;
    $count = 0;

    Http::fake(['api.telegram.org/*' => function (Request $request) use ($answers, &$count): PromiseInterface {
        $count++;
        $queued = $answers->getArrayCopy();
        $next = array_shift($queued);
        $answers->exchangeArray($queued);

        return match (true) {
            $next instanceof Closure => $next($request),
            $next instanceof PromiseInterface => $next,
            default => Factory::response(['ok' => true, 'result' => ['id' => "prepared-{$count}", 'expiration_date' => now()->addHour()->getTimestamp()]]),
        };
    }]);
}

/** @return list<Request> the Bot API requests sent */
function botRequests(): array
{
    return array_values(Http::recorded(fn (Request $request): bool => str_contains($request->url(), 'api.telegram.org'))->map(fn (array $pair): Request => $pair[0])->all());
}

function shareFor(User $user, int $number, string $locale = 'ru'): string
{
    return app(ShareService::class)->prepare($user, $number, new SourceContext($locale, 'USD', $user))->id;
}

it('prepares the message once: the caller\'s Telegram id, the article with the escaped text and the startapp button', function (): void {
    fakeBotApi();

    $share = app(ShareService::class)->prepare($this->user, 100012, new SourceContext('ru', 'USD', $this->user));

    expect($share->id)->toBe('prepared-1')
        ->and($share->expiresAt)->toBe('2026-11-27T10:00:00+00:00');

    $sent = botRequests();
    expect($sent)->toHaveCount(1)
        ->and($sent[0]->method())->toBe('POST')
        ->and($sent[0]->url())->toBe('https://api.telegram.org/bot'.SHARE_TOKEN.'/savePreparedInlineMessage')
        ->and($sent[0]->isJson())->toBeTrue()
        ->and($sent[0]->data())->toBe([
            'user_id' => $this->user->telegram_user_id,
            'result' => [
                'type' => 'article',
                'id' => 'l_100012',
                'title' => '2-комн. квартира, 54 м²',
                'input_message_content' => [
                    'message_text' => '<b>2-комн. квартира, 54 м²</b> · $600/мес · Юнусабад',
                    'parse_mode' => 'HTML',
                ],
                'reply_markup' => ['inline_keyboard' => [[['text' => 'Открыть объявление', 'url' => 'https://t.me/'.SHARE_BOT.'?startapp=l_100012']]]],
            ],
            'allow_user_chats' => true,
            'allow_bot_chats' => true,
            'allow_group_chats' => true,
            'allow_channel_chats' => true,
        ]);
});

it('names the price kind after the price and leaves the parts a listing lacks out, in the request locale', function (int $number, string $locale, string $text, string $button): void {
    fakeBotApi();

    shareFor($this->user, $number, $locale);

    expect(botRequests()[0]['result']['input_message_content']['message_text'])->toBe($text)
        ->and(botRequests()[0]['result']['reply_markup']['inline_keyboard'][0][0]['text'])->toBe($button);
})->with([
    'business, uz' => [100004, 'uz', '<b>Помещение, 120 м²</b> · $2 500/мес · biznes narxi, joy ijarada · Мирабад', 'Eʼlonni ochish'],
    'down payment, en' => [100008, 'en', '<b>3-комн. квартира, 78 м²</b> · $85 000 · down payment · Юнусабад', 'Open the listing'],
    'no district' => [100011, 'ru', '<b>Участок, 600 м²</b> · $30 000', 'Открыть объявление'],
]);

it('reuses the prepared id within its lifetime without a second request, and prepares anew in its last minute', function (): void {
    fakeBotApi();

    expect(shareFor($this->user, 100012))->toBe('prepared-1')
        ->and(Cache::get(ShareService::key($this->user, 100012, 'ru')))->toBe(['id' => 'prepared-1', 'expires' => now()->addHour()->getTimestamp()]);

    $this->travel(58)->minutes();
    expect(shareFor($this->user, 100012))->toBe('prepared-1')
        ->and(botRequests())->toHaveCount(1);

    $this->travel(61)->seconds();
    expect(shareFor($this->user, 100012))->toBe('prepared-2')
        ->and(botRequests())->toHaveCount(2);
});

it('prepares a new message for another locale and another listing', function (): void {
    fakeBotApi();

    expect([shareFor($this->user, 100012, 'ru'), shareFor($this->user, 100012, 'uz'), shareFor($this->user, 100001, 'ru'), shareFor($this->user, 100012, 'uz')])
        ->toBe(['prepared-1', 'prepared-2', 'prepared-3', 'prepared-2'])
        ->and(botRequests())->toHaveCount(3);
});

it('never gives user B the id prepared for user A', function (): void {
    fakeBotApi();
    $other = User::factory()->telegram()->create();

    expect(shareFor($this->user, 100012))->toBe('prepared-1')
        ->and(shareFor($other, 100012))->toBe('prepared-2')
        ->and(botRequests()[1]['user_id'])->toBe($other->telegram_user_id)
        ->and(shareFor($other, 100012))->toBe('prepared-2')
        ->and(shareFor($this->user, 100012))->toBe('prepared-1');
});

it('does not cache an id that expires within a minute', function (): void {
    $this->botAnswers[] = Factory::response(['ok' => true, 'result' => ['id' => 'short-lived', 'expiration_date' => now()->addSeconds(30)->getTimestamp()]]);
    fakeBotApi();

    expect(shareFor($this->user, 100012))->toBe('short-lived')
        ->and(Cache::has(ShareService::key($this->user, 100012, 'ru')))->toBeFalse()
        ->and(shareFor($this->user, 100012))->toBe('prepared-2');
});

it('escapes the HTML of the text and keeps it literal in the article title, with any phone number masked', function (): void {
    LegacyListingsHttp::fake(function (Request $request): ?PromiseInterface {
        if (LegacyListingsHttp::path($request) !== '/api/listings/100001') {
            return null;
        }

        $preview = json_decode((string) app(LegacyFakeServer::class)->answer($request)->wait()->getBody(), true);

        return Factory::response(['short_title' => '<b>Loft</b> & sky > 5 «тел. +998001234567»', 'district_name' => 'A&B'] + $preview);
    });
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);
    fakeBotApi();

    shareFor($this->user, 100001);

    $result = botRequests()[0]['result'];
    expect($result['input_message_content']['message_text'])->toBe('<b>&lt;b&gt;Loft&lt;/b&gt; &amp; sky &gt; 5 «тел. +998 ** *** ** 67»</b> · $600/мес · A&amp;B')
        ->and($result['title'])->toBe('<b>Loft</b> & sky > 5 «тел. +998 ** *** ** 67»')
        ->and(json_encode(botRequests()[0]->data(), JSON_UNESCAPED_UNICODE))->not->toContain('001234567');
});

it('answers a stub scenario of the stub card source every time, past the cache, and caches nothing for it', function (): void {
    fakeBotApi();
    $prepare = fn (?string $scenario): string => app(ShareService::class)->prepare($this->user, 100012, new SourceContext('ru', 'USD', $this->user, $scenario))->id;

    expect($prepare(null))->toBe('prepared-1')
        ->and(fn () => $prepare('source_unavailable'))->toThrow(SourceUnavailable::class)
        ->and($prepare('some_scenario'))->toBe('prepared-2')
        ->and($prepare(null))->toBe('prepared-1')
        ->and(botRequests())->toHaveCount(2);
});

it('answers 404 for a listing the card source does not know, without a Bot API request', function (): void {
    fakeBotApi();

    expect(fn () => shareFor($this->user, 999404))->toThrow(SourceNotFound::class)
        ->and(botRequests())->toBe([]);
});

it('fails with share_failed, once and without a retry, for every Bot API error and a timeout', function (Closure $answer): void {
    $this->botAnswers[] = $answer;
    fakeBotApi();

    expect(fn () => shareFor($this->user, 100012))->toThrow(ShareFailed::class)
        ->and(botRequests())->toHaveCount(1)
        ->and(Cache::has(ShareService::key($this->user, 100012, 'ru')))->toBeFalse();
})->with([
    '400' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 400, 'description' => 'Bad Request: can\'t parse entities'], 400)],
    '403, the user blocked the bot' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 403, 'description' => 'Forbidden: bot was blocked by the user'], 403)],
    '429 with retry_after' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 429, 'description' => 'Too Many Requests: retry after 5', 'parameters' => ['retry_after' => 5]], 429)],
    '500' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 500, 'description' => 'Internal Server Error'], 500)],
    'a timeout' => [fn (Request $request): PromiseInterface => (Http::failedConnection('cURL error 28: timed out for https://api.telegram.org/bot'.SHARE_TOKEN.'/savePreparedInlineMessage'))($request)],
    'not JSON' => [fn (): PromiseInterface => Factory::response('<html>Bad gateway</html>', 502)],
    'ok without an id' => [fn (): PromiseInterface => Factory::response(['ok' => true, 'result' => ['expiration_date' => 1795132800]])],
    'ok with a result that is no object' => [fn (): PromiseInterface => Factory::response(['ok' => true, 'result' => true])],
]);

it('fails closed without a request: no usable token, no bot username, a caller without a Telegram id', function (Closure $arrange): void {
    fakeBotApi();
    $user = $arrange($this->user);

    expect(fn () => shareFor($user, 100012))->toThrow(ShareFailed::class)
        ->and(botRequests())->toBe([]);
})->with([
    'a blank token' => [function (User $user): User {
        config(['telegram.bot.token' => '']);

        return $user;
    }],
    'no token' => [function (User $user): User {
        config(['telegram.bot.token' => null]);

        return $user;
    }],
    'a malformed token' => [function (User $user): User {
        config(['telegram.bot.token' => 'not a token/../x']);

        return $user;
    }],
    'no bot username' => [function (User $user): User {
        config(['telegram.bot.username' => null]);

        return $user;
    }],
    'a bot username that is not one' => [function (User $user): User {
        config(['telegram.bot.username' => 'evil.example/x?']);

        return $user;
    }],
    'a caller without a Telegram id' => [fn (): User => User::factory()->create()],
]);

it('sends the token only to an https Bot API address outside local and testing', function (): void {
    fakeBotApi();
    config(['telegram.http.base_url' => 'http://api.telegram.org']);
    app()['env'] = 'production';

    try {
        expect(fn () => app(TelegramClient::class)->call('getMe', []))->toThrow(TelegramException::class, 'TELEGRAM_API_BASE_URL is not https')
            ->and(botRequests())->toBe([]);
    } finally {
        app()['env'] = 'testing';
    }
});

it('takes the timeouts of telegram.http, and their defaults when they are blank', function (mixed $timeout, int $expected): void {
    $seen = new ArrayObject;
    config(['telegram.http.timeout' => $timeout, 'telegram.http.connect_timeout' => 0]);
    Http::fake(['api.telegram.org/*' => function (Request $request, array $options) use ($seen): PromiseInterface {
        $seen[] = [$options['timeout'] ?? null, $options['connect_timeout'] ?? null];

        return Factory::response(['ok' => true, 'result' => ['id' => 'x', 'expiration_date' => now()->addHour()->getTimestamp()]]);
    }]);

    shareFor($this->user, 100012);
    expect($seen->getArrayCopy())->toBe([[$expected, 5]]);
})->with([
    'configured' => [7, 7],
    'blank (cast to 0)' => [0, 15],
    'not a number' => ['soon', 15],
]);

it('never puts the bot token into an exception, its description or a log line', function (Closure $answer): void {
    $this->botAnswers[] = $answer;
    fakeBotApi();
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = $entry->message.' '.json_encode($entry->context, JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    });

    try {
        app(TelegramClient::class)->call(ShareService::METHOD, ['user_id' => 1]);
        $this->fail('The call did not fail.');
    } catch (TelegramException $failure) {
        expect($failure->getMessage())->not->toContain(SHARE_TOKEN)->not->toContain('TEST-homi-synthetic-token')
            ->and($failure->description)->not->toContain('TEST-homi-synthetic-token')
            ->and($failure->getPrevious())->toBeNull()
            ->and($failure->getTraceAsString())->not->toContain('TEST-homi-synthetic-token');
    }

    $this->botAnswers[] = $answer;
    expect(fn () => shareFor($this->user, 100012))->toThrow(ShareFailed::class);

    $written = implode("\n", $lines->getArrayCopy());
    expect($lines->count())->toBeGreaterThan(0)
        ->and($written)->not->toContain('TEST-homi-synthetic-token')
        ->and($written)->not->toContain((string) $this->user->telegram_user_id)
        ->and($written)->toContain('"user":'.$this->user->id);
})->with([
    'a description that quotes the token' => [fn (): PromiseInterface => Factory::response(['ok' => false, 'error_code' => 401, 'description' => 'Unauthorized: bot'.SHARE_TOKEN.' and '.SHARE_TOKEN], 401)],
    'a connection error that quotes the address' => [fn (): never => throw new ConnectionException('cURL error 7: failed to connect to https://api.telegram.org/bot'.SHARE_TOKEN.'/savePreparedInlineMessage')],
]);

it('scrubs any token form to bot***', function (): void {
    expect(TelegramException::scrub('see bot'.SHARE_TOKEN.'/getMe and '.SHARE_TOKEN))->toBe('see bot***/getMe and bot***')
        ->and((new TelegramException('getMe', 'echo '.SHARE_TOKEN, 400))->getMessage())->toBe('The Bot API method getMe failed (400): echo bot***');
});

it('keeps no Bot API request in Telescope and groups its address in Pulse without the token', function (): void {
    config(['telescope.record_all' => true]);
    $keeps = fn (IncomingEntry $entry): bool => collect(Telescope::$filterUsing)->every(fn (callable $filter): bool => $filter($entry));
    $groups = config('pulse.recorders.'.SlowOutgoingRequests::class.'.groups');
    $grouped = null;

    foreach ($groups as $pattern => $replacement) {
        $grouped = preg_replace($pattern, $replacement, 'https://api.telegram.org/bot'.SHARE_TOKEN.'/savePreparedInlineMessage', count: $count);

        if ($count > 0) {
            break;
        }
    }

    expect($keeps(IncomingEntry::make(['uri' => 'https://api.telegram.org/bot'.SHARE_TOKEN.'/savePreparedInlineMessage', 'response_status' => 200])->type(EntryType::CLIENT_REQUEST)))->toBeFalse()
        ->and($keeps(IncomingEntry::make(['uri' => 'https://other.example/x', 'response_status' => 200])->type(EntryType::CLIENT_REQUEST)))->toBeTrue()
        ->and($grouped)->toBe('https://api.telegram.org/bot***/savePreparedInlineMessage');

    config(['telegram.http.base_url' => 'https://bot-api.internal.example']);
    expect($keeps(IncomingEntry::make(['uri' => 'https://bot-api.internal.example/bot'.SHARE_TOKEN.'/getMe', 'response_status' => 200])->type(EntryType::CLIENT_REQUEST)))->toBeFalse();
});
