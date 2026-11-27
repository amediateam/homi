<?php

namespace App\Services\Sources\Legacy;

use App\Exceptions\AccessDenied;
use App\Exceptions\ApiException;
use App\Exceptions\Listings\ContactUnavailable;
use App\Exceptions\Listings\DailyLimitReached;
use App\Exceptions\Listings\TranslationUnavailable;
use App\Exceptions\Sources\LegacyContractError;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Listings\AuthorKey;
use App\Services\Listings\Contracts\ListingExclusion;
use App\Services\Listings\ListingNumber;
use App\Services\Listings\ListingRefs;
use App\Services\Listings\PhotoUrlRewriter;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\Data\Fields;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\FlowOption;
use App\Services\Sources\Data\ListingContact;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Data\ListingTranslation;
use App\Services\Sources\Data\MapPoint;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\Legacy\Translators\Coercions;
use App\Services\Sources\Legacy\Translators\DistrictMatcher;
use App\Services\Sources\Legacy\Translators\FiltersTranslator;
use App\Services\Sources\Legacy\Translators\FlowTranslator;
use App\Services\Sources\Legacy\Translators\ListingDetailsTranslator;
use App\Services\Sources\Legacy\Translators\ListingSummaryTranslator;
use App\Services\Sources\Legacy\Translators\MapPointsTranslator;
use App\Services\Sources\Legacy\Translators\NewCountTranslator;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Closure;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use InvalidArgumentException;
use JsonException;
use LogicException;

/**
 * The `legacy` driver of the listing capability (WP-42): the six listing reads of `08` §1.7 and §1.8 through
 * `LegacyClient` and the translators, answered in the shapes of WP-12. Legacy answers for the service key; what
 * belongs to the caller (favourite and viewed flags, the owner fields of DEC-94, exclusions) is HOMI's overlay.
 *
 * | Method       | Legacy call                         | Cache                                                       |
 * | ------------ | ----------------------------------- | ----------------------------------------------------------- |
 * | `feed`       | `GET /api/feed`, pages of 20        | none                                                        |
 * | `count`      | `GET /api/feed/count`               | `legacy.cache.count` s per filters and language             |
 * | `newSince`   | `GET /api/feed/new` with `since`    | none                                                        |
 * | `flow`       | `GET /api/feed/flow`                | `legacy.cache.flow` s per filters, language and currency    |
 * | `map`        | `GET /api/map`                      | `legacy.cache.map` s per filters, language and currency     |
 * | `details`    | `GET /api/listings/{n}`             | `legacy.cache.card` s per number, language and currency     |
 * | `preview`    | `GET /api/listings/{n}?preview=1`   | the same, beside the card's entry; a cached card serves it  |
 * | `previews`   | `preview` reads, `legacy.previews.concurrency` at a time through `LegacyClient::pool()`, one limiter wait of `legacy.previews.max_wait_ms` (`background_wait_ms` in the background) and one deadline of `legacy.previews.deadline_ms` for the batch | per item |
 * | `hasContact` | the contact entry, else `GET /api/listings/{n}` again                                           | the contact entry per number, `legacy.cache.card` s |
 * | `contact`    | variant A: the contact entry, else `GET /api/listings/{n}` again; variant B: `GET /api/listings/{n}/call` | the contact entry per number, `legacy.cache.card` s |
 * | `translation`| `POST /api/listings/{n}/translate`, the language per `translationSelector()`, an optional call for the breaker (WP-43) | none here: `TranslationService` keeps it per number, locale and selector |
 *
 * Every cache here is shared between users, so a cold key is filled once (single-flight, WP-42 review M2): the first
 * caller takes the lock `{key}:fill` (held at most as long as one read may take) and reads legacy; a caller that finds
 * it taken looks at the cache again every 100 ms for up to `legacy.cache.fill_wait_ms` and serves what the first one
 * stored, or, when the wait runs out, reads legacy itself — the lock never fails a request. The feed, the new-since
 * count and the previews batch have no shared cache entry to fill (the batch caches each preview, unlocked).
 *
 * A duration of 0 disables its cache. The cache holds the translated v1 arrays, never an object (the store may
 * serialise): a card is held as the translators give it — masked (DEC-52), without `phone`, `phone_display` or the
 * call link, and without the per-user owner fields — and rebuilt with the data object's `fromArray()`; a count as a
 * number, read back whether the store gives an int or a numeric string. Count asks legacy in `USD` (a number does not
 * depend on the currency); flow, map and the card carry formatted prices, so their keys carry the currency. An entry
 * that no longer fits its data object is dropped and read again. A number legacy answered `404` for is not asked again
 * for `legacy.cache.not_found` s, and a number at or above the native floor is never asked (`404` at once).
 *
 * `listing_refs` (`ListingRefs`): a full card read from legacy (a cache miss, so once per listing, language and
 * currency a minute: the card cache's key and `legacy.cache.card`) is filed with the author key of the raw answer
 * (`AuthorKey`), which still holds the number the translated card drops; a `404` marks a number HOMI knew gone, and a
 * card that answers with another number marks the asked one merged into it.
 *
 * Feed paging (WP-42, "Feed paging and top-up"): one HOMI page reads the legacy page its cursor names, leaves out what
 * `ListingExclusion` excludes, resumes at the cursor's position and takes up to `limit` items; while fewer than half of
 * `limit` are collected and legacy has a next page, it reads up to `legacy.feed.top_up_pages` more. The cursor is
 * `LegacyFeedCursor`: a position counts every item of the legacy page passed over, excluded ones included, so a
 * listing hidden between two pages never shifts the walk. A cursor the feed did not give ends the list quietly.
 *
 * Errors: a call that fails is `503 source_unavailable` and a contract error of the answer the same (logged and counted
 * here when a translator finds it). The keys of an answer whose values a translator could not use as sent
 * (`Coercions`: another type, a fraction, an unknown code, a part left out) are logged as a warning with the path
 * template and the key names, never a value — at most once a minute per path and set of keys without their positions
 * (`items.3.floor` counts as `items.*.floor`) — and every such answer is counted (`coerced`). The photo rewriter and the
 * district matcher are made for each answer, so their counts are that answer's. The card passes legacy's daily limit on as `429 rate_limited` with `reason:
 * "daily"` (DEC-59); every other method answers it as `503`, since only the card has that limit. A system context
 * (no user) makes background calls in the limiter, unless it is `SourceContext::foreground()` (the call page).
 *
 * The contact (WP-43, Q-API-062). Every full card read from legacy also files its author's contact (`LegacyContact`:
 * the phone in E.164 when it reads as one number, legacy's `phone_display`, whether a call link exists) in a second
 * cache entry beside the card's, `legacy:v1:listings:contact:<number>` (per number only: a phone does not depend on
 * the language or the currency), for `legacy.cache.card` s, as a string encrypted with `Crypt` (the application key):
 * the card's own entry holds no number, and under the mode `link` the entry holds none either (`LegacyContact::kept()`).
 * `contact()` decides the variant per card under `legacy.contact.mode`: variant A answers the phone and its display
 * (`callUrl` and `expiresAt` blank: `ContactService` answers HOMI's own call link) without a legacy call while the
 * entry is cached; on a miss — expired, or unreadable after the application key changed — one caller reads the card
 * again and caches it (single-flight on the entry's key; legacy's daily limit is then `503`, not the card's `429`).
 * Variant B asks `GET /api/listings/{n}/call` and answers its `url` — a path joined to the origin of
 * `legacy.base_url`, an absolute one only `https` on legacy's host and port or a host and port of
 * `legacy.contact.link_hosts` (`callUrl()`)
 * — valid for `legacy.contact.link_ttl` s, with legacy's `phone_display` only when it reads as one number; a `404`
 * there, or a link to another host, is `404 contact_unavailable`. A card without either is `ContactUnavailable`, and
 * so is a number legacy answered `404` for (its entry is dropped then). `hasContact()` is the first half of
 * `contact()`: the entry, else the card read, never the call link, so `ContactService` asks the quota before
 * variant B spends a legacy call.
 *
 * A background batch of previews (a queued job, the bot: WP-46's radar matcher) waits for its share's places within
 * `legacy.previews.background_wait_ms` instead of failing at once, and never leaves an item out silently either: when
 * the wait or the deadline runs out it is `SourceUnavailable`, and the job backs off (releases itself with a delay)
 * rather than retrying at once; the previews read so far are cached, so the next attempt asks only for the rest.
 */
final class LegacyListingSource implements ListingSource
{
    /** The page size legacy is always asked for (`25` §4.5). */
    public const int LEGACY_PAGE = 20;

    /** The `v1` changes when a cached shape does. */
    private const string PREFIX = 'legacy:v1:listings:';

    /** How often a caller waiting for another caller's fill looks at the cache again. */
    private const int FILL_STEP_MS = 100;

    /** The path template of legacy's call link (API-009). */
    private const string CALL_PATH = '/api/listings/{n}/call';

    /** The path template of legacy's translation (API-010). */
    private const string TRANSLATE_PATH = '/api/listings/{n}/translate';

    /** The longest call link taken from legacy. */
    private const int MAX_CALL_URL = 2048;

    /**
     * A host a warning may name: a DNS name of at most 253 characters, lower-case labels of letters, digits and inner
     * hyphens, no trailing dot (`callUrl()` also refuses one with a run of seven digits or more).
     */
    private const string LOGGABLE_HOST = '/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/D';

    /** The port of an `https` address that names none. */
    private const int HTTPS_PORT = 443;

    public function __construct(
        private readonly LegacyClient $client,
        private readonly Repository $cache,
        private readonly SourceManager $sources,
        private readonly ListingExclusion $exclusion,
        private readonly ListingRefs $refs,
    ) {}

    public function feed(ListingQuery $query, SourceContext $context): ListingPage
    {
        $at = $query->cursor === null ? new LegacyFeedCursor(null, 0) : LegacyFeedCursor::decode($query->cursor);

        if ($at === null) {
            return new ListingPage([], null);
        }

        $limit = max(1, $query->limit);
        $topUps = max(0, Config::integer('legacy.feed.top_up_pages'));
        $items = [];

        for ($read = 0; ; $read++) {
            ['items' => $page, 'next_cursor' => $next] = $this->feedPage($query, $at->legacy, $context);
            $excluded = array_flip($this->exclusion->excluded($page, $query->filters, $context));
            $position = $at->offset;

            for (; $position < count($page) && count($items) < $limit; $position++) {
                if (! isset($excluded[$page[$position]->number])) {
                    $items[] = $page[$position];
                }
            }

            if ($position < count($page)) {
                return new ListingPage($items, $this->cursor(new LegacyFeedCursor($at->legacy, $position)));
            }

            if ($next === null) {
                return new ListingPage($items, null);
            }

            if (count($items) >= $limit / 2 || $read >= $topUps) {
                return new ListingPage($items, $this->cursor(new LegacyFeedCursor($next, 0)));
            }

            $at = new LegacyFeedCursor($next, 0);
        }
    }

    public function count(SearchFilters $filters, SourceContext $context): int
    {
        $query = FiltersTranslator::toQuery($filters);
        $key = $this->filtersKey('count', $query, $context, false);
        $seconds = Config::integer('legacy.cache.count');
        $read = function () use ($query, $context): int {
            $answer = $this->read(NewCountTranslator::COUNT_PATH, $query, $this->call($context, 'USD'));

            return $this->checked(fn (): int => NewCountTranslator::count($answer, NewCountTranslator::COUNT_PATH));
        };

        if ($seconds <= 0) {
            return $read();
        }

        return $this->singleFlight(
            $key,
            function () use ($key): ?int {
                // Redis gives a stored number back as a numeric string, the array store as an int.
                $cached = $this->cache->get($key);

                return is_numeric($cached) ? (int) $cached : null;
            },
            function () use ($key, $seconds, $read): int {
                $count = $read();
                $this->cache->put($key, $count, $seconds);

                return $count;
            },
        );
    }

    public function newSince(SearchFilters $filters, int $since, SourceContext $context): int
    {
        $answer = $this->read(NewCountTranslator::PATH, NewCountTranslator::query($filters, $since), $this->call($context, 'USD'));

        return $this->checked(fn (): int => NewCountTranslator::count($answer));
    }

    public function flow(SearchFilters $filters, SourceContext $context): FlowEstimate
    {
        $query = FiltersTranslator::toQuery($filters);

        return $this->cached(
            $this->filtersKey('flow', $query, $context, true),
            Config::integer('legacy.cache.flow'),
            function () use ($query, $context): array {
                $answer = $this->read(FlowTranslator::PATH, $query, $this->call($context));

                return $this->checked(fn (): array => $this->noted(FlowTranslator::PATH, fn (Coercions $seen): array => FlowTranslator::translate($answer, $seen)));
            },
            fn (array $flow): FlowEstimate => new FlowEstimate(
                Fields::count($flow, 'week'),
                Fields::int($flow, 'days'),
                array_map(FlowOption::fromArray(...), Fields::objects($flow, 'options')),
            ),
        );
    }

    public function map(SearchFilters $filters, SourceContext $context): MapPoints
    {
        $query = FiltersTranslator::toQuery($filters);

        return $this->cached(
            $this->filtersKey('map', $query, $context, true),
            Config::integer('legacy.cache.map'),
            function () use ($query, $context): array {
                $answer = $this->read(MapPointsTranslator::PATH, $query, $this->call($context));

                return $this->checked(fn (): array => $this->noted(
                    MapPointsTranslator::PATH,
                    fn (Coercions $seen): array => MapPointsTranslator::translate($answer, ListingNumber::floor(), $seen),
                ));
            },
            fn (array $map): MapPoints => new MapPoints(
                array_map(MapPoint::fromArray(...), Fields::objects($map, 'points')),
                Fields::count($map, 'total'),
                Fields::count($map, 'with_point'),
            ),
        );
    }

    public function details(int $number, SourceContext $context): ListingDetails
    {
        self::refuseNative($number);

        return $this->cached(
            $this->cardKey('card', $number, $context),
            Config::integer('legacy.cache.card'),
            fn (): array => $this->fetchCard($number, $context, false),
            ListingDetails::fromArray(...),
        );
    }

    public function preview(int $number, SourceContext $context): ListingSummary
    {
        self::refuseNative($number);

        return $this->cachedPreview($number, $context) ?? $this->cached(
            $this->cardKey('preview', $number, $context),
            Config::integer('legacy.cache.card'),
            fn (): array => $this->fetchCard($number, $context, true),
            ListingSummary::fromArray(...),
        );
    }

    /**
     * The cached ones first; the others read `legacy.previews.concurrency` at a time through `LegacyClient::pool()`,
     * each through the breaker, the limiter and the outcome mapping of a single read, the whole batch sharing one
     * limiter wait of `legacy.previews.max_wait_ms` (DEC-110; `legacy.previews.background_wait_ms` for a background
     * batch) and one deadline of `legacy.previews.deadline_ms`. A number legacy does not know (`404`) is left out and
     * not asked again for `legacy.cache.not_found` s. Any other preview legacy did not give — unavailable, refused by
     * the breaker or the limiter, not sent or not answered by the deadline, legacy's daily limit, an answer that does
     * not fit — makes the whole call `503` (legacy's pause stays `403 paused`), after the previews read so far are
     * cached: a personal list never loses an item silently.
     */
    public function previews(array $numbers, SourceContext $context): array
    {
        $asked = array_values(array_unique(array_filter($numbers, fn (int $number): bool => $number >= 1 && ! ListingNumber::isNative($number))));
        $previews = [];
        $misses = [];

        foreach ($asked as $number) {
            if ($this->cache->has($this->goneKey($number))) {
                continue;
            }

            $preview = $this->cachedPreview($number, $context);

            if ($preview !== null) {
                $previews[$number] = $preview;
            } else {
                $misses[] = $number;
            }
        }

        if ($misses !== []) {
            $this->withTranslators($context, function (ListingSummaryTranslator $summary) use ($misses, $context, &$previews): void {
                $this->fetchPreviews($misses, $summary, $context, $previews);
            });
        }

        $ordered = [];

        foreach ($asked as $number) {
            if (isset($previews[$number])) {
                $ordered[$number] = $previews[$number];
            }
        }

        return $ordered;
    }

    /** Whether the contact entry (else the card read again) gives a variant under `legacy.contact.mode`; no call link is asked. */
    public function hasContact(int $number, SourceContext $context): bool
    {
        try {
            return $this->contactEntry($number, $context)->variant(Config::string('legacy.contact.mode')) !== null;
        } catch (ContactUnavailable) {
            return false;
        }
    }

    /**
     * The author's contact under `legacy.contact.mode`: variant A gives the phone (and blank `callUrl` and `expiresAt`
     * for `ContactService` to fill with HOMI's link), variant B legacy's call link.
     */
    public function contact(int $number, SourceContext $context): ListingContact
    {
        $contact = $this->contactEntry($number, $context);

        return match ($contact->variant(Config::string('legacy.contact.mode'))) {
            LegacyContact::PHONE => new ListingContact('', '', $contact->phone, $contact->phoneDisplay()),
            LegacyContact::LINK => $this->callLink($number, $context, $contact->linkDisplay()),
            default => throw new ContactUnavailable,
        };
    }

    /**
     * The original text in the context's language, machine-translated by legacy (API-010): `POST
     * /api/listings/{n}/translate` with the target language per `translationSelector()`, never retried, within the
     * client's `legacy.timeout` (15 s), as an optional call (`LegacyCall::$optional`): an open breaker refuses it, and
     * nothing it answers — a timeout, a `5xx` — counts for the breaker shared by every legacy call. Nothing is cached
     * here: `TranslationService` keeps the answer per listing, locale and selector. Legacy's `404` (an unknown listing,
     * or one without an original text) is `404 not_found`, and the number is not marked gone, since its card may still
     * answer; `unsupported`, an empty text, an answer that does not fit (logged as a contract error naming `text`) and
     * every other failure, legacy's daily limit included, are `503 translation_unavailable`; legacy's pause stays `403
     * paused`, as on every legacy method. `locale` while the
     * selector of every call sends no language (`legacy.locale.via` neither `header` nor `query`) is `unsupported`
     * too, with a warning at most once a minute: legacy would answer its default language for every locale.
     *
     * @throws SourceNotFound|TranslationUnavailable|AccessDenied
     */
    public function translation(int $number, SourceContext $context): ListingTranslation
    {
        self::refuseNative($number);

        $via = Config::string('legacy.translation.via');

        if ($via === 'unsupported') {
            throw new TranslationUnavailable;
        }

        $selector = self::translationSelector();

        if ($selector['via'] === 'unsupported') {
            if ($this->cache->add(self::PREFIX.'once:translation_unselected', 1, 60)) {
                Log::warning('LEGACY_TRANSLATION_VIA is locale, but LEGACY_LOCALE_VIA sends no language: translations are unavailable.');
            }

            throw new TranslationUnavailable;
        }

        if ($this->cache->has($this->goneKey($number))) {
            throw new SourceNotFound('Listing not found.');
        }

        $language = [$selector['name'] => LegacyLocale::toLegacy($context->locale)];

        try {
            $answer = $this->client->post(self::cardPath($number).'/translate', $via === 'body' ? $language : [], $this->call($context, optional: true), $via === 'query' ? $language : []);
        } catch (SourceNotFound|AccessDenied $passed) {
            throw $passed;
        } catch (ApiException $failure) {
            $this->failure($failure);

            throw new TranslationUnavailable;
        }

        try {
            $text = $this->checked(fn (): string => self::translatedText($answer));
        } catch (LegacyContractError) {
            throw new TranslationUnavailable;
        }

        return ListingTranslation::fromArray(['text' => $text, 'locale' => $context->locale]);
    }

    /**
     * How legacy's translation is told the target language (WP-02 point 8): `via` and the `name` it goes under —
     * `header` or `query` under `legacy.locale.name` (the selector of every call) when `legacy.translation.via` is
     * `locale` (any value but `query`, `body` and `unsupported`), `query` or `body` under `legacy.translation.name`
     * when it says so — or `unsupported` without a name when legacy is not asked: `legacy.translation.via` is
     * `unsupported`, or it is `locale` while `legacy.locale.via` sends no language. Read at call time;
     * `TranslationService` keys its cache by it, so a changed setting never serves an entry cached under the old one.
     *
     * @return array{via: string, name: string}
     */
    public static function translationSelector(): array
    {
        $via = Config::string('legacy.translation.via');
        $locale = Config::string('legacy.locale.via');

        return match (true) {
            $via === 'unsupported' => ['via' => 'unsupported', 'name' => ''],
            $via === 'query', $via === 'body' => ['via' => $via, 'name' => Config::string('legacy.translation.name')],
            $locale === 'header', $locale === 'query' => ['via' => $locale, 'name' => Config::string('legacy.locale.name')],
            default => ['via' => 'unsupported', 'name' => ''],
        };
    }

    /**
     * One legacy feed page, translated.
     *
     * @return array{items: list<ListingSummary>, next_cursor: string|null}
     */
    private function feedPage(ListingQuery $query, ?string $cursor, SourceContext $context): array
    {
        $answer = $this->read(
            ListingSummaryTranslator::PATH,
            FiltersTranslator::toQuery($query->filters, $query->sort, $cursor, self::LEGACY_PAGE),
            $this->call($context),
        );
        $page = $this->withTranslators($context, fn (ListingSummaryTranslator $summary): array => $this->noted(
            ListingSummaryTranslator::PATH,
            fn (Coercions $seen): array => $summary->page($answer, $query->filters->city, $seen),
        ));

        return ['items' => array_map(ListingSummary::fromArray(...), $page['items']), 'next_cursor' => $page['next_cursor']];
    }

    /** The encoded cursor; one too long for the client to send back ends the list, with an error logged. */
    private function cursor(LegacyFeedCursor $cursor): ?string
    {
        $encoded = $cursor->encode();

        if (strlen($encoded) <= LegacyFeedCursor::MAX_BYTES) {
            return $encoded;
        }

        $this->drifted(LegacyContractError::key(ListingSummaryTranslator::PATH, 'next_cursor', 'too long to pass on'));

        return null;
    }

    /**
     * A full card or its preview form, translated: what the cache keeps.
     *
     * @return array<string, mixed>
     *
     * @throws SourceNotFound|SourceUnavailable|DailyLimitReached
     */
    private function fetchCard(int $number, SourceContext $context, bool $preview): array
    {
        // Only the full card has legacy's daily limit (DEC-59); a preview is outside it.
        return $this->readCard($number, $context, $preview, daily: ! $preview)['card'];
    }

    /**
     * A card or its preview form read from legacy and translated, with the author's contact of a full card (filed by
     * `file()`); legacy's daily limit is passed on only where `$daily` says so.
     *
     * @return array{card: array<string, mixed>, contact: LegacyContact|null}
     *
     * @throws SourceNotFound|SourceUnavailable|DailyLimitReached
     */
    private function readCard(int $number, SourceContext $context, bool $preview, bool $daily): array
    {
        if ($this->cache->has($this->goneKey($number))) {
            throw new SourceNotFound('Listing not found.');
        }

        try {
            $answer = $this->read(self::cardPath($number), $preview ? ['preview' => 1] : [], $this->call($context), daily: $daily);
        } catch (SourceNotFound $missing) {
            $this->rememberGone($number);

            throw $missing;
        }

        $card = $this->withTranslators($context, fn (ListingSummaryTranslator $summary, ListingDetailsTranslator $details): array => $this->noted(
            ListingDetailsTranslator::PATH,
            fn (Coercions $seen): array => $preview
                ? $summary->translate($answer, null, ListingDetailsTranslator::PATH, '', $seen)
                : $details->translate($answer, $seen),
        ));

        return ['card' => $card, 'contact' => $preview ? null : $this->file($number, $card, $answer)];
    }

    /**
     * Files a full card legacy answered (a cache miss, so once per listing, language and currency a minute: the card
     * cache's key and `legacy.cache.card`): in `listing_refs` the author key read from the raw answer, which still holds
     * the number the translated card no longer has (DEC-52), and the merge when legacy answered another number; and the
     * author's contact in its encrypted entry, under the asked number and the answered one. A preview carries no phone
     * or post link, so it files nothing.
     *
     * @param  array<array-key, mixed>  $card  the translated card
     * @param  array<array-key, mixed>  $answer  legacy's raw answer
     */
    private function file(int $asked, #[\SensitiveParameter] array $card, #[\SensitiveParameter] array $answer): LegacyContact
    {
        $details = ListingDetails::fromArray($card);
        $this->refs->remember($details, AuthorKey::fromCard($answer));
        $this->refs->markMerged($asked, $details->preview->number);

        $contact = LegacyContact::fromCard($answer)->kept(Config::string('legacy.contact.mode'));
        $seconds = Config::integer('legacy.cache.card');

        if ($seconds > 0) {
            $sealed = Crypt::encryptString(json_encode($contact->toArray(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));

            foreach (array_unique([$asked, $details->preview->number]) as $number) {
                $this->cache->put($this->contactKey($number), $sealed, $seconds);
            }
        }

        return $contact;
    }

    /**
     * The author's contact of a listing: its encrypted entry, else the card read again, by one caller at a time
     * (`singleFlight()` on the entry's key, as `cached()` fills a card). A number legacy answered `404` for is
     * `ContactUnavailable` at once, whatever entry is left (`rememberGone()` drops it too).
     *
     * @throws ContactUnavailable|SourceNotFound|SourceUnavailable
     */
    private function contactEntry(int $number, SourceContext $context): LegacyContact
    {
        self::refuseNative($number);

        if ($this->cache->has($this->goneKey($number))) {
            throw new ContactUnavailable;
        }

        if (Config::integer('legacy.cache.card') <= 0) {
            return $this->contactFromCard($number, $context);
        }

        return $this->singleFlight(
            $this->contactKey($number),
            fn (): ?LegacyContact => $this->cachedContact($number),
            fn (): LegacyContact => $this->contactFromCard($number, $context),
        );
    }

    /**
     * The contact of a full card read again (its entry missed; `file()` stores the new entry); the card is cached as
     * `details()` would cache it, so the card or preview read that usually follows (the call page's title) needs no
     * second call. Legacy's daily limit is `503` here: only the card method passes it on.
     */
    private function contactFromCard(int $number, SourceContext $context): LegacyContact
    {
        ['card' => $card, 'contact' => $contact] = $this->readCard($number, $context, false, daily: false);
        $seconds = Config::integer('legacy.cache.card');

        if ($seconds > 0) {
            $this->cache->put($this->cardKey('card', $number, $context), $card, $seconds);
        }

        return $contact ?? throw new LogicException('A full card files its contact.');
    }

    /**
     * The author's contact of a listing from its encrypted entry; `null` when there is none, or it cannot be read (the
     * application key changed, another shape): then the entry is dropped and the card is read again.
     */
    private function cachedContact(int $number): ?LegacyContact
    {
        $key = $this->contactKey($number);
        $sealed = $this->cache->get($key);

        if (! is_string($sealed)) {
            return null;
        }

        try {
            $data = json_decode(Crypt::decryptString($sealed), true, 2, JSON_THROW_ON_ERROR);

            return is_array($data) ? LegacyContact::fromArray($data) : throw new InvalidArgumentException('Not an object.');
        } catch (DecryptException|JsonException|InvalidArgumentException) {
            $this->cache->forget($key);

            return null;
        }
    }

    /**
     * Variant B: legacy's call link of the listing (`GET /api/listings/{n}/call`, `{url}`), absolute, valid for
     * `legacy.contact.link_ttl` s from now, with the display `LegacyContact::linkDisplay()` gives. A `404` there, or a
     * link to a host HOMI does not allow, means no usable contact; legacy's daily limit is `503`.
     *
     * @throws ContactUnavailable|SourceUnavailable
     */
    private function callLink(int $number, SourceContext $context, #[\SensitiveParameter] ?string $display): ListingContact
    {
        try {
            $answer = $this->read(self::cardPath($number).'/call', [], $this->call($context));
        } catch (SourceNotFound) {
            throw new ContactUnavailable;
        }

        $url = $this->checked(fn (): string => $this->callUrl($answer));

        return new ListingContact($url, now()->addSeconds(max(1, Config::integer('legacy.contact.link_ttl')))->toIso8601String(), null, $display);
    }

    /**
     * The `url` of legacy's call answer as an absolute `https` address. A path (`/call/…`) is joined to the origin of
     * `legacy.base_url` (its scheme, host and port, never its path). An absolute link must be `https` without a user
     * or a password, on a host and port of `linkOrigins()` — the host of `legacy.base_url` on its port (443 when it
     * names none), or an entry of `legacy.contact.link_hosts` on the port it names (443 when it names none) — compared
     * lower-cased and exactly (no suffix match); the link's port is 443 when it names none, so `:0` and every other
     * port are refused. A link to any other host or port leaves the listing without a usable link
     * (`ContactUnavailable`), with a warning that names the path template and the host, lower-cased — never its port,
     * path, query or fragment, nor the whole address — at most once a minute per host, so the operator can tell which
     * host belongs in `LEGACY_CONTACT_LINK_HOSTS`; only a host name (`LOGGABLE_HOST`) without a run of seven digits or
     * more (a phone number) is named: any other host is logged as `host_invalid: true`, at most once a minute for all
     * of them. A backslash anywhere, a control character or a space, and every other form are a contract error naming
     * `url`.
     *
     * @param  array<array-key, mixed>  $answer
     *
     * @throws LegacyContractError|ContactUnavailable
     */
    private function callUrl(#[\SensitiveParameter] array $answer): string
    {
        $url = $answer['url'] ?? null;
        $refuse = fn (): LegacyContractError => LegacyContractError::key(self::CALL_PATH, 'url', 'not a call link HOMI can open');

        if (! is_string($url) || $url === '' || strlen($url) > self::MAX_CALL_URL || preg_match('/[\x00-\x20\x7f\\\\]/', $url) === 1) {
            throw $refuse();
        }

        if (str_starts_with($url, '/') && ! str_starts_with($url, '//')) {
            return (self::origin(Config::string('legacy.base_url')) ?? throw $refuse()).$url;
        }

        $parts = parse_url($url);

        if (! is_array($parts) || strtolower($parts['scheme'] ?? '') !== 'https' || ($parts['host'] ?? '') === '' || isset($parts['user']) || isset($parts['pass'])) {
            throw $refuse();
        }

        $host = strtolower($parts['host']);

        if (! in_array($host.':'.($parts['port'] ?? self::HTTPS_PORT), self::linkOrigins(), true)) {
            $named = preg_match(self::LOGGABLE_HOST, $host) === 1 && preg_match('/\d{7,}/', $host) === 0;

            if ($this->cache->add(self::PREFIX.'once:link_host:'.($named ? sha1($host) : 'invalid'), 1, 60)) {
                Log::warning('Legacy gave a call link to a host HOMI does not allow: the listing has no usable link.', ['path' => self::CALL_PATH, ...($named ? ['host' => $host] : ['host_invalid' => true])]);
            }

            throw new ContactUnavailable;
        }

        return $url;
    }

    /** The origin of an absolute address (`scheme://host[:port]`), `null` when it has no scheme or host. */
    private static function origin(string $base): ?string
    {
        $parts = parse_url($base);

        if (! is_array($parts) || ($parts['scheme'] ?? '') === '' || ($parts['host'] ?? '') === '') {
            return null;
        }

        return strtolower($parts['scheme']).'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
    }

    /**
     * The hosts and ports a call link of variant B may point to, as `host:port`, lower-cased: the host of
     * `legacy.base_url` on its port (443 when it names none), read at call time, and each entry of
     * `legacy.contact.link_hosts` (`LEGACY_CONTACT_LINK_HOSTS`): `host` on 443, or `host:port` on that port. A port
     * outside 1…65535 (`:0` among them) and an entry of any other form (a path, a user, a scheme) add nothing.
     *
     * @return list<string>
     */
    private static function linkOrigins(): array
    {
        $base = parse_url(Config::string('legacy.base_url'));
        $origins = [];

        if (is_array($base) && ($base['host'] ?? '') !== '' && ($base['port'] ?? self::HTTPS_PORT) >= 1) {
            $origins[] = strtolower($base['host']).':'.($base['port'] ?? self::HTTPS_PORT);
        }

        foreach (Config::array('legacy.contact.link_hosts') as $entry) {
            if (is_string($entry) && preg_match('/^([a-z0-9._-]+)(?::(\d{1,5}))?$/D', strtolower(trim($entry)), $match) === 1) {
                $port = isset($match[2]) ? (int) $match[2] : self::HTTPS_PORT;

                if ($port >= 1 && $port <= 65_535) {
                    $origins[] = "{$match[1]}:{$port}";
                }
            }
        }

        return array_values(array_unique($origins));
    }

    /**
     * The `text` of legacy's translation answer (`{"text": string}`); a text that is blank is no translation.
     *
     * @param  array<array-key, mixed>  $answer
     *
     * @throws LegacyContractError|TranslationUnavailable
     */
    private static function translatedText(#[\SensitiveParameter] array $answer): string
    {
        $text = $answer['text'] ?? null;

        if (! is_string($text)) {
            throw LegacyContractError::key(self::TRANSLATE_PATH, 'text', 'not a text');
        }

        return trim($text) === '' ? throw new TranslationUnavailable : $text;
    }

    /**
     * The previews of the numbers no cache holds, read in parallel rounds that share one limiter wait; each one read is
     * cached and added to `$previews`. A round with a failure other than `404` ends the batch once its good previews
     * are cached.
     *
     * @param  list<int>  $numbers
     * @param  array<int, ListingSummary>  $previews
     *
     * @throws SourceUnavailable|AccessDenied
     */
    private function fetchPreviews(array $numbers, ListingSummaryTranslator $summary, SourceContext $context, array &$previews): void
    {
        $seconds = Config::integer('legacy.cache.card');
        $call = $this->call($context);
        $wait = new LegacyWaitBudget(max(0, Config::integer($call->background ? 'legacy.previews.background_wait_ms' : 'legacy.previews.max_wait_ms')));
        $deadline = LegacyDeadline::in(Config::integer('legacy.previews.deadline_ms'));

        foreach (array_chunk($numbers, max(1, Config::integer('legacy.previews.concurrency'))) as $chunk) {
            $reads = [];
            $failed = [];

            foreach ($chunk as $number) {
                $reads[$number] = [self::cardPath($number), ['preview' => 1]];
            }

            foreach ($this->client->pool($reads, $call, $wait, $deadline) as $number => $answer) {
                if ($answer instanceof SourceNotFound) {
                    $this->rememberGone((int) $number);

                    continue;
                }

                if ($answer instanceof ApiException) {
                    $failed[] = $this->failure($answer);

                    continue;
                }

                try {
                    $preview = $this->noted(
                        ListingDetailsTranslator::PATH,
                        fn (Coercions $seen): array => $summary->translate($answer, null, ListingDetailsTranslator::PATH, '', $seen),
                    );
                } catch (LegacyContractError $drift) {
                    $this->drifted($drift);
                    $failed[] = $drift;

                    continue;
                }

                if ($seconds > 0) {
                    $this->cache->put($this->cardKey('preview', (int) $number, $context), $preview, $seconds);
                }

                $previews[(int) $number] = ListingSummary::fromArray($preview);
            }

            if ($failed !== []) {
                Log::warning('Legacy previews failed: the batch is unavailable.', [
                    'failed' => count($failed),
                    'asked' => count($numbers),
                    'outcomes' => array_values(array_unique(array_map(fn (ApiException $failure): string => class_basename($failure), $failed))),
                ]);

                foreach ($failed as $failure) {
                    if ($failure instanceof AccessDenied) {
                        throw $failure;
                    }
                }

                throw new SourceUnavailable;
            }
        }
    }

    /** The preview from the cached full card, else from the cached preview form; `null` when neither is cached. */
    private function cachedPreview(int $number, SourceContext $context): ?ListingSummary
    {
        foreach (['card', 'preview'] as $kind) {
            $key = $this->cardKey($kind, $number, $context);
            $cached = $this->cache->get($key);

            if (! is_array($cached)) {
                continue;
            }

            try {
                return ListingSummary::fromArray($cached);
            } catch (InvalidArgumentException) {
                $this->cache->forget($key);
            }
        }

        return null;
    }

    /**
     * The cached array as its data object, else a fresh one, cached for `$seconds` (0: not cached) and filled once
     * (`singleFlight()`). An entry that no longer fits its data object (a shape changed under the same key version) is
     * dropped and read again.
     *
     * @template TData of object
     *
     * @param  Closure(): array<array-key, mixed>  $fetch
     * @param  Closure(array<array-key, mixed>): TData  $build
     * @return TData
     */
    private function cached(string $key, int $seconds, Closure $fetch, Closure $build): mixed
    {
        if ($seconds <= 0) {
            return $build($fetch());
        }

        return $this->singleFlight(
            $key,
            function () use ($key, $build): ?object {
                $cached = $this->cache->get($key);

                if (! is_array($cached)) {
                    return null;
                }

                try {
                    return $build($cached);
                } catch (InvalidArgumentException) {
                    $this->cache->forget($key);

                    return null;
                }
            },
            function () use ($key, $seconds, $fetch, $build): object {
                $value = $fetch();
                $this->cache->put($key, $value, $seconds);

                return $build($value);
            },
        );
    }

    /**
     * A shared cache entry, filled by one caller at a time: the value `$lookup` finds, else `$fill`'s under the lock
     * `{key}:fill`. A caller that finds the lock taken looks again every `FILL_STEP_MS` for up to
     * `legacy.cache.fill_wait_ms`, then fills without it, so the lock never fails a request. Only for entries shared
     * between users: never for a per-user answer.
     *
     * @template TValue of int|object
     *
     * @param  Closure(): (TValue|null)  $lookup  the cached value, `null` when there is none
     * @param  Closure(): TValue  $fill  reads legacy and stores the value
     * @return TValue
     */
    private function singleFlight(string $key, Closure $lookup, Closure $fill): mixed
    {
        $found = $lookup();

        if ($found !== null) {
            return $found;
        }

        $lock = $this->lockProvider()->lock("{$key}:fill", self::fillSeconds());
        $wait = max(0, Config::integer('legacy.cache.fill_wait_ms'));

        for ($waited = 0; ! $lock->get(); $waited += self::FILL_STEP_MS) {
            if ($waited >= $wait) {
                return $fill();
            }

            Sleep::for(min(self::FILL_STEP_MS, $wait - $waited))->milliseconds();
            $found = $lookup();

            if ($found !== null) {
                return $found;
            }
        }

        try {
            return $lookup() ?? $fill();
        } finally {
            $lock->release();
        }
    }

    /**
     * How long a fill may hold its lock: one read with every attempt, its timeouts, the pause and the limiter's waits,
     * plus 5 s (as WP-41 sizes the lock of a reference refresh).
     */
    private static function fillSeconds(): int
    {
        $attempts = 1 + max(0, Config::integer('legacy.retry.times'));
        $waits = Config::integer('legacy.retry.sleep_ms') + $attempts * Config::integer('legacy.rate.max_wait_ms');

        return $attempts * (Config::integer('legacy.timeout') + Config::integer('legacy.connect_timeout')) + (int) ceil($waits / 1000) + 5;
    }

    private function lockProvider(): LockProvider
    {
        $store = $this->cache->getStore();

        return $store instanceof LockProvider ? $store : throw new LogicException('The cache store of the legacy listings cannot lock.');
    }

    /**
     * A legacy read. Legacy's daily limit is passed on only where `$daily` says the method has one (the full card);
     * elsewhere it is `503`. A contract error the client found is counted (the client has logged it).
     *
     * @param  array<string, scalar|list<scalar>|null>  $query
     * @return array<array-key, mixed>
     *
     * @throws SourceUnavailable|SourceNotFound|DailyLimitReached
     */
    private function read(string $path, array $query, LegacyCall $call, bool $daily = false): array
    {
        try {
            return $this->client->get($path, $query, $call);
        } catch (ApiException $failure) {
            throw $this->failure($failure, $daily);
        }
    }

    /**
     * What a failed legacy read is for the caller, a single read or a pooled one alike: legacy's daily limit only where
     * `$daily` says the method has one (the full card), else `503`; a contract error the client found is counted here
     * (the client has logged it). Everything else as the client gave it.
     */
    private function failure(ApiException $failure, bool $daily = false): ApiException
    {
        if ($failure instanceof DailyLimitReached && ! $daily) {
            return new SourceUnavailable;
        }

        if ($failure instanceof LegacyContractError) {
            $this->counted('contract_errors');
        }

        return $failure;
    }

    /**
     * The translators of one call: the photo rewriter of `legacy.media`, the district matcher of the context's
     * reference data and the native floor. Their misses are counted afterwards, and a contract error is logged.
     *
     * @template TResult
     *
     * @param  Closure(ListingSummaryTranslator, ListingDetailsTranslator): TResult  $translate
     * @return TResult
     */
    private function withTranslators(SourceContext $context, Closure $translate): mixed
    {
        $hosts = array_values(array_filter(Config::array('legacy.media.hosts'), is_string(...)));
        $photos = new PhotoUrlRewriter(Config::string('legacy.media.public_url'), $hosts);
        $districts = $this->districts($context);
        $floor = ListingNumber::floor();

        try {
            return $this->checked(fn (): mixed => $translate(
                new ListingSummaryTranslator($photos, $districts, $floor),
                new ListingDetailsTranslator($photos, $districts, $floor, contactMode: Config::string('legacy.contact.mode')),
            ));
        } finally {
            $this->reportMisses($photos, $districts);
        }
    }

    /**
     * The district matcher of the context's language over the reference capability; an unavailable reference source
     * gives one that matches nothing, so a district code is `null` and never a failed answer. The read is HOMI's own,
     * so it goes without the caller's stub scenario, which names the outcome of the caller's method only; it keeps the
     * context's `foreground` flag, so a read for the call page is made as a user's call there too.
     */
    private function districts(SourceContext $context): DistrictMatcher
    {
        $own = new SourceContext($context->locale, $context->currency, $context->user, foreground: $context->foreground);

        try {
            return DistrictMatcher::fromSource($this->sources->reference('source.reference', $own)->source, $own);
        } catch (ApiException) {
            return new DistrictMatcher(null);
        }
    }

    /**
     * The translation of one answer with its own `Coercions`, logged afterwards (also when it fails): the counter
     * `coerced`, and one warning with the path template and the key names, never a value, at most once a minute per
     * path and set of keys without their positions.
     *
     * @template TValue
     *
     * @param  Closure(Coercions): TValue  $translate
     * @return TValue
     */
    private function noted(string $path, Closure $translate): mixed
    {
        $seen = Coercions::collect();

        try {
            return $translate($seen);
        } finally {
            if ($seen->count() > 0) {
                $this->counted('coerced');

                if ($this->cache->add(self::PREFIX.'once:coerced:'.sha1($path.'|'.implode(',', self::shapeOf($seen->keys()))), 1, 60)) {
                    Log::warning('A legacy answer has values HOMI could not use as sent.', ['path' => $path, 'keys' => $seen->keys(), 'count' => $seen->count()]);
                }
            }
        }
    }

    /**
     * A translation, with its contract error logged and counted here.
     *
     * @template TValue
     *
     * @param  Closure(): TValue  $translate
     * @return TValue
     *
     * @throws LegacyContractError
     */
    private function checked(Closure $translate): mixed
    {
        try {
            return $translate();
        } catch (LegacyContractError $drift) {
            $this->drifted($drift);

            throw $drift;
        }
    }

    /**
     * Key names without their positions (`items.3.floor` → `items.*.floor`), distinct and sorted.
     *
     * @param  list<string>  $keys
     * @return list<string>
     */
    private static function shapeOf(array $keys): array
    {
        $shape = array_values(array_unique(array_map(fn (string $key): string => (string) preg_replace('/(?<=^|\.)\d+(?=\.|$)/', '*', $key), $keys)));
        sort($shape);

        return $shape;
    }

    private function drifted(LegacyContractError $drift): void
    {
        Log::error('A legacy answer does not fit its contract.', $drift->context());
        $this->counted('contract_errors');
    }

    /**
     * Counts what the translators could not place: dropped photo addresses (with a warning at most once a minute) and
     * district names without a code. Without `legacy.media.public_url` every photo list is empty, and a warning says so
     * at most once a minute.
     */
    private function reportMisses(PhotoUrlRewriter $photos, DistrictMatcher $districts): void
    {
        if (! $photos->isConfigured() && $this->cache->add(self::PREFIX.'once:media_unset', 1, 60)) {
            Log::warning('LEGACY_MEDIA_PUBLIC_URL is not set: the photo lists of legacy listings are empty.');
        }

        if ($photos->dropped() > 0) {
            $today = $this->counted('photos_dropped', $photos->dropped());

            if ($this->cache->add(self::PREFIX.'once:photos_dropped', 1, 60)) {
                Log::warning('Legacy photo addresses of an unknown form were dropped.', ['today' => $today]);
            }
        }

        if ($districts->misses() > 0) {
            $this->counted('district_misses', $districts->misses());
        }
    }

    /**
     * Adds to today's counter of a kind (`legacy:v1:listings:counter:<kind>:<date>`, kept two days) and returns its
     * total. Redis gives a stored number back as a numeric string.
     */
    private function counted(string $kind, int $by = 1): int
    {
        $key = self::PREFIX."counter:{$kind}:".now()->format('Y-m-d');
        $this->cache->add($key, 0, 2 * 86_400);
        $total = $this->cache->increment($key, $by);

        return is_numeric($total) ? (int) $total : 0;
    }

    /**
     * How a call of this context is made: its language, the currency given or its own, in the background when no user
     * asks (a queued job, the bot) unless the context says a person waits (`SourceContext::foreground()`, the call
     * page), and optional for the breaker where `$optional` says so (the translation: `LegacyCall::$optional`).
     */
    private function call(SourceContext $context, ?string $currency = null, bool $optional = false): LegacyCall
    {
        return new LegacyCall($context->locale, $currency ?? $context->currency, $context->user === null && ! $context->foreground, $optional);
    }

    /** @param  array<string, scalar|list<scalar>>  $query */
    private function filtersKey(string $method, array $query, SourceContext $context, bool $currency): string
    {
        $selectors = $currency ? "{$context->locale}:{$context->currency}" : $context->locale;

        return self::PREFIX."{$method}:{$selectors}:".sha1(LegacyClient::queryString($query));
    }

    private function cardKey(string $kind, int $number, SourceContext $context): string
    {
        return self::PREFIX."{$kind}:{$number}:{$context->locale}:{$context->currency}";
    }

    private function contactKey(int $number): string
    {
        return self::PREFIX."contact:{$number}";
    }

    private function goneKey(int $number): string
    {
        return self::PREFIX."gone:{$number}";
    }

    /**
     * A number legacy answered `404` for: not asked again for a while, gone in `listing_refs`, and its contact entry
     * dropped, so the contact method answers no number of a withdrawn listing even while gone numbers are not kept.
     */
    private function rememberGone(int $number): void
    {
        $this->refs->markGone($number);
        $this->cache->forget($this->contactKey($number));
        $seconds = Config::integer('legacy.cache.not_found');

        if ($seconds > 0) {
            $this->cache->put($this->goneKey($number), 1, $seconds);
        }
    }

    private static function cardPath(int $number): string
    {
        return "/api/listings/{$number}";
    }

    /**
     * A number at or above the native floor is HOMI's own (WP-80), never legacy's.
     *
     * @throws SourceNotFound
     */
    private static function refuseNative(int $number): void
    {
        if ($number < 1 || ListingNumber::isNative($number)) {
            throw new SourceNotFound('Listing not found.');
        }
    }
}
