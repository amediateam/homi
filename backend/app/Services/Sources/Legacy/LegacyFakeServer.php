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
 *
 * The listing paths (WP-42) answer without looking at the filters: `GET /api/feed` the first page, with
 * `cursor=FEED_PAGE_2_CURSOR` the last one and with any other cursor an empty one; `/api/feed/count`, `/api/feed/new`,
 * `/api/map`; `/api/feed/flow` with options when the query carries `price_max` (a narrow search); `GET
 * /api/listings/{id}` the card of `CARDS`, with `preview=1` `listing.preview.json` carrying that card's `id` (so the
 * merged `100016` previews as `100001`), and `404` for any other id.
 */
final class LegacyFakeServer
{
    /** @var array<string, string> method and path => fixture without the language and `.json` */
    private const array ROUTES = [
        'GET /api/meta' => 'meta',
        'GET /api/cities' => 'cities',
        'GET /api/feed' => 'feed.default',
        'GET /api/feed/count' => 'count',
        'GET /api/feed/new' => 'feed_new',
        'GET /api/feed/flow' => 'flow',
        'GET /api/map' => 'map',
    ];

    /** The `next_cursor` of `feed.default.json`: the cursor of the second and last feed page. */
    public const string FEED_PAGE_2_CURSOR = 'fixture-cursor-page-2';

    /**
     * The listing cards the fake server knows: id => fixture. `100016` is a merged duplicate that answers with
     * `100001`; every other id answers `404`.
     *
     * @var array<int, string>
     */
    public const array CARDS = [
        100001 => 'listing.rent_apartment',
        100004 => 'listing.commercial',
        100005 => 'listing.daily',
        100009 => 'listing.sale_house',
        100011 => 'listing.land',
        100014 => 'listing.minimal',
        100016 => 'listing.merged',
        100024 => 'listing.no_phone',
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

        if ($request->method() === 'GET' && preg_match('#^/api/listings/(\d{1,18})$#', $path, $id) === 1) {
            return $this->card((int) $id[1], self::queryValue($request->url(), 'preview') === '1');
        }

        $fixture = self::ROUTES[$request->method().' '.$path] ?? null;

        return match ($fixture) {
            null => $this->respond('errors/not_found', 404),
            'meta' => $this->respond("meta.{$this->locale($request)}", 200),
            'feed.default' => $this->respond(match (self::queryValue($request->url(), 'cursor')) {
                null => 'feed.default',
                self::FEED_PAGE_2_CURSOR => 'feed.page2',
                default => 'feed.empty',
            }, 200),
            'flow' => $this->respond(self::queryValue($request->url(), 'price_max') === null ? 'flow' : 'flow.options', 200),
            default => $this->respond($fixture, 200),
        };
    }

    /** The card of a known id, or its preview form with the card's `id`; `404` for any other id. */
    private function card(int $id, bool $preview): PromiseInterface
    {
        $fixture = self::CARDS[$id] ?? null;

        if ($fixture === null) {
            return $this->respond('errors/not_found', 404);
        }

        if (! $preview) {
            return $this->respond($fixture, 200);
        }

        $answer = $this->decoded('listing.preview');
        $answer['id'] = $this->decoded($fixture)['id'] ?? $id;

        return Factory::response($answer, 200, ['Content-Type' => 'application/json']);
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

    /** @return array<array-key, mixed> */
    private function decoded(string $fixture): array
    {
        $decoded = json_decode($this->read($fixture), true);

        return is_array($decoded) ? $decoded : throw new LogicException("The legacy fixture \"{$fixture}\" is not a JSON object.");
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
