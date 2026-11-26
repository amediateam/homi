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
 * `/api/map`; `/api/feed/flow` with options when the query carries `price_max` (a narrow search). `GET
 * /api/listings/{id}` knows every listing of the two feed pages: the card fixture of `CARDS`, else the feed item as a
 * card with the keys a card requires (`photos` = its preview photos, no facts, no sources). With `preview=1` it answers
 * the listing's own preview under the card's `id` (so the merged `100016` previews as `100001`): `listing.preview.json`
 * for `100001`, the feed item for the others. Any other id is `404`.
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

    /** The listing whose preview form `listing.preview.json` is. */
    public const int PREVIEW_FIXTURE_ID = 100001;

    /** The `next_cursor` of `feed.default.json`: the cursor of the second and last feed page. */
    public const string FEED_PAGE_2_CURSOR = 'fixture-cursor-page-2';

    /**
     * The card fixtures: id => fixture. `100016` is a merged duplicate that answers with `100001`; the other listings of
     * the feed pages answer their feed item as a card.
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

    /** The card of a known id, or its own preview under the card's `id`; `404` for any other id. */
    private function card(int $id, bool $preview): PromiseInterface
    {
        $fixture = self::CARDS[$id] ?? null;
        $item = $this->feedItems()[$id] ?? null;

        if ($fixture === null && $item === null) {
            return $this->respond('errors/not_found', 404);
        }

        if (! $preview && $fixture !== null) {
            // The recorded text, so a number such as `625.0` keeps its JSON type.
            return $this->respond($fixture, 200);
        }

        $card = $fixture === null ? $item + ['photos' => $item['photos_preview'] ?? [], 'facts' => [], 'sources' => []] : $this->decoded($fixture);

        if (! $preview) {
            return self::json($card);
        }

        $answered = is_int($card['id'] ?? null) ? $card['id'] : $id;
        $answer = match (true) {
            $answered === self::PREVIEW_FIXTURE_ID => $this->decoded('listing.preview'),
            isset($this->feedItems()[$answered]) => $this->feedItems()[$answered],
            default => $card,
        };

        return self::json(['id' => $answered] + $answer);
    }

    /**
     * A built answer, its numbers in their recorded JSON types (`5.0` stays a float).
     *
     * @param  array<array-key, mixed>  $answer
     */
    private static function json(array $answer): PromiseInterface
    {
        return Factory::response(
            json_encode($answer, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            200,
            ['Content-Type' => 'application/json'],
        );
    }

    /**
     * The items of the two feed pages by id: each listing's own preview.
     *
     * @return array<int, array<array-key, mixed>>
     */
    private function feedItems(): array
    {
        $items = [];

        foreach (['feed.default', 'feed.page2'] as $page) {
            $listed = $this->decoded($page)['items'] ?? [];

            foreach (is_array($listed) ? $listed : [] as $item) {
                if (is_array($item) && is_int($item['id'] ?? null)) {
                    $items[$item['id']] = $item;
                }
            }
        }

        return $items;
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
