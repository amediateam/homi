<?php

namespace Tests\Support;

use App\Services\Sources\Legacy\LegacyFakeServer;
use Closure;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * Legacy's listing paths over `Http::fake()` (`legacy.fake` off), for the WP-42 tests that count, inspect or change
 * legacy's answers: by default every request is answered as `LegacyFakeServer` answers it from the golden fixtures.
 *
 * Laravel matches fakes in the order they were registered (WP-42 brief, rule 3), so a test registers this one fake
 * once and changes the answers through `answer()`: an override that returns `null` lets the fixtures answer. An
 * override may take the request's Guzzle options as a second argument (`timeout`, `connect_timeout`). A class, not Pest
 * functions: global helper names of the test files collide.
 */
final class LegacyListingsHttp
{
    public const string BASE = 'https://legacy.test';

    /** @var (Closure(Request, array<string, mixed>): (PromiseInterface|null))|null */
    private static ?Closure $override = null;

    /** @param  (Closure(Request, array<string, mixed>): (PromiseInterface|null))|null  $override */
    public static function fake(?Closure $override = null): void
    {
        config(['legacy.fake' => false, 'legacy.base_url' => self::BASE, 'legacy.service_key' => 'listings-test-key']);
        self::$override = $override;

        Http::fake(['legacy.test/*' => function (Request $request, array $options = []): PromiseInterface {
            $answer = self::$override === null ? null : (self::$override)($request, $options);

            return $answer ?? app(LegacyFakeServer::class)->answer($request);
        }]);
    }

    /** @param  (Closure(Request, array<string, mixed>): (PromiseInterface|null))|null  $override */
    public static function answer(?Closure $override): void
    {
        self::$override = $override;
    }

    /**
     * The legacy requests sent to a path, in order.
     *
     * @return list<Request>
     */
    public static function sent(string $path): array
    {
        return array_values(Http::recorded(fn (Request $request): bool => self::path($request) === $path)
            ->map(fn (array $pair): Request => $pair[0])
            ->all());
    }

    public static function path(Request $request): string
    {
        return (string) parse_url($request->url(), PHP_URL_PATH);
    }

    /** The raw query string of a request, as legacy receives it. */
    public static function query(Request $request): string
    {
        return (string) parse_url($request->url(), PHP_URL_QUERY);
    }
}
