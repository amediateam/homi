<?php

namespace App\Services\Sources\Legacy;

use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Config;
use JsonException;
use LogicException;

/**
 * The legacy API on recorded fixtures (`resources/fixtures/legacy`, WP-41): what `LegacyClient` talks to while
 * `legacy.fake` is on — in `local` and `testing` by default, never in production (`SourceServiceProvider`).
 *
 * It is an HTTP client factory of its own, not a global `Http::fake()`: a test's own `Http::fake()` sequence is never
 * shadowed by it, and a legacy call in fake mode can never reach the network (stray requests are refused). It answers
 * like legacy: `401` without the auth header, `GET /api/meta` in the language the client asked for (`meta.<code>.json`,
 * `ru` when the code is unknown), `GET /api/cities`, and `404 {"detail": "Not Found"}` for any other path.
 */
final class LegacyFakeServer
{
    /** @var array<string, string> method and path => fixture without the language and `.json` */
    private const array ROUTES = [
        'GET /api/meta' => 'meta',
        'GET /api/cities' => 'cities',
    ];

    /** @var array<string, string> fixture path => its JSON text */
    private array $files = [];

    public function __construct(private readonly string $directory) {}

    /** A factory whose every request is answered by `answer()`. */
    public function factory(): Factory
    {
        $factory = new Factory;
        $factory->fake(fn (Request $request): PromiseInterface => $this->answer($request));
        $factory->preventStrayRequests();

        return $factory;
    }

    public function answer(Request $request): PromiseInterface
    {
        if (trim($request->toPsrRequest()->getHeaderLine(Config::string('legacy.auth.header'))) === '') {
            return $this->respond('errors/unauthorized', 401);
        }

        $path = (string) parse_url($request->url(), PHP_URL_PATH);
        $fixture = self::ROUTES[$request->method().' '.$path] ?? null;

        if ($fixture === null) {
            return $this->respond('errors/not_found', 404);
        }

        return $this->respond($fixture === 'meta' ? "meta.{$this->locale($request)}" : $fixture, 200);
    }

    /** The legacy language code the request asked for, per `legacy.locale`; `ru` when there is none or it is unknown. */
    private function locale(Request $request): string
    {
        $name = Config::string('legacy.locale.name');
        $code = match (Config::string('legacy.locale.via')) {
            'header' => $request->toPsrRequest()->getHeaderLine($name),
            'query' => self::queryValue($request->url(), $name),
            default => null,
        };

        return is_string($code) && in_array($code, LegacyLocale::legacyCodes(), true) ? $code : 'ru';
    }

    private static function queryValue(string $url, string $name): ?string
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $value = $query[$name] ?? null;

        return is_string($value) ? $value : null;
    }

    private function respond(string $fixture, int $status): PromiseInterface
    {
        return Factory::response($this->read($fixture), $status, ['Content-Type' => 'application/json']);
    }

    private function read(string $fixture): string
    {
        if (! isset($this->files[$fixture])) {
            $file = "{$this->directory}/{$fixture}.json";
            $text = is_file($file) ? file_get_contents($file) : false;

            if (! is_string($text)) {
                throw new LogicException("The legacy fixture \"{$fixture}\" is missing.");
            }

            try {
                json_decode($text, flags: JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                throw new LogicException("The legacy fixture \"{$fixture}\" is not valid JSON.");
            }

            $this->files[$fixture] = $text;
        }

        return $this->files[$fixture];
    }
}
