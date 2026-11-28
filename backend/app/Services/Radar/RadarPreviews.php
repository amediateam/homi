<?php

namespace App\Services\Radar;

use App\Enums\ListingSort;
use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\Radar;
use App\Models\User;
use App\Services\Listings\ListingOverlay;
use App\Services\Listings\ListingRefs;
use App\Services\Radars\RadarPreview;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Contracts\Container\Container;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Date;
use InvalidArgumentException;
use Throwable;

/**
 * What each radar would find now, for `GET /radars?include=previews` (WP-45, BR-APP-063), read through the listing
 * source, never by SQL over HOMI's tables (DEC-43, `25` §5):
 *
 * 1. The shared part, per filter set: the first page (20) of the feed (`source.listings.feed`) by `sort = new`, the
 *    count (`source.listings.count`) and the flow (`source.listings.flow`) of the radar's stored filters — one source
 *    round. It is asked in a context without a user (the request's locale and currency, `foreground`, since a person
 *    waits), so nothing personal enters it: legacy's pager leaves out no caller's hidden listings, and no item carries
 *    a caller's flags. It is cached for `radar.preview_ttl` seconds (120; 0 disables the cache) under
 *    `radar:previews:v1:<drivers>:<filters_hash>:<posted_days>:<polygon>:<locale>:<currency>` and shared by every
 *    user with the same search (RK-25). The key carries what `filters_hash` leaves out but the source reads:
 *    `posted_days` (two radars of one hash with other windows find other listings) and the polygon as drawn
 *    (`<polygon>` is `SearchFilters::polygonDigest()`: the SHA-1 of its vertices in order, or `none`; the hash sorts them). The stub scenario (`X-Stub-Scenario`) is never part of the key, as in
 *    `TranslationService` and `ShareService`: when none of the three drivers is `stub` the shared part is asked
 *    without it, so a client cannot defeat the cache by changing the header; when one is `stub` and a scenario is set,
 *    the cache is neither read nor written and the stub answers the scenario. The entry holds arrays only
 *    (`ListingSummary::toArray()`, AM-120) and is read back through `fromArray()`; an entry of another shape is a
 *    miss, and a failure is never cached. The drivers are resolved once per list, without a user.
 *    There is no fill lock: the feed page is no more than `GET /listings` asks on every visit, and the legacy count
 *    and flow are single-flight in the driver's own cache (WP-42).
 * 2. The caller's part, per radar: HOMI's overlay (`ListingOverlay::feed()` with the caller — hidden listings, blocked
 *    authors, rented and realtor marks, the favourite and viewed flags), then the radar's hide rules (`HideRuleSet`,
 *    all radars' rules in one query; author keys from `listing_refs` only for a radar with an author rule), then the
 *    first five. Count and flow are not overlaid. A read never moves `hidden_count`: only a starter counts what the
 *    rules hold back (`StarterSelector`).
 *
 * The radars switched on are computed first, then the paused ones (each group in the order given; the answer keeps
 * that order). Two bounds hold for one list, both checked before each source round: at most `radar.preview_max_rounds`
 * (10) rounds, counted on a cache miss only, and the total budget `radar.preview_budget_ms` (4 000), measured on the
 * application clock (a round already started is bounded by the driver's own timeouts). After a failure, after the
 * last round allowed or once the budget is spent, every remaining radar whose shared part is not cached gets `null`.
 * The list itself never fails because of previews: the source's `SourceUnavailable` and any other error of a round
 * are caught here (the latter reported), and any error of one radar's own part — its stored filters that no longer
 * read as a search, the overlay's reads — is reported and gives that radar `null`.
 */
final readonly class RadarPreviews
{
    /** The first page of the feed (`25` §5). */
    private const int PAGE = 20;

    /** The items of a preview (WP-13). */
    private const int ITEMS = 5;

    public function __construct(
        private SourceManager $sources,
        private RadarHideRuleService $hideRules,
        private ListingRefs $refs,
        private Repository $cache,
        private Container $container,
    ) {}

    /**
     * The preview of each radar of the caller, by radar id; `null` where it could not be computed.
     *
     * @param  list<Radar>  $radars  the caller's own radars
     * @param  SourceContext  $context  the request's context, with the caller
     * @return array<string, RadarPreview|null>
     */
    public function forRadars(User $user, array $radars, SourceContext $context): array
    {
        if ($radars === []) {
            return [];
        }

        $ids = array_map(fn (Radar $radar): string => (string) $radar->getKey(), $radars);
        $asked = new SourceContext($context->locale, $context->currency, null, $context->scenario, foreground: true);

        try {
            $feed = $this->sources->listings('source.listings.feed', $asked);
            $count = $this->sources->listings('source.listings.count', $asked);
            $flow = $this->sources->listings('source.listings.flow', $asked);
        } catch (Throwable $e) {
            report($e);

            return array_fill_keys($ids, null);
        }

        $stub = in_array(SourceDriver::Stub, [$feed->driver, $count->driver, $flow->driver], true);
        $round = new PreviewRound(
            $feed,
            $count,
            $flow,
            $stub ? $asked : new SourceContext($context->locale, $context->currency, null, null, foreground: true),
            cached: ! $stub || $context->scenario === null,
        );
        $personal = new SourceContext($context->locale, $context->currency, $user, $context->scenario, $context->foreground);
        $rules = $this->hideRules->rulesForMany($ids);
        $overlay = $this->container->make(ListingOverlay::class);
        $started = Date::now();
        $stopped = false;
        $rounds = 0;
        $computed = [];
        $first = array_filter($radars, fn (Radar $radar): bool => $radar->active);
        $then = array_filter($radars, fn (Radar $radar): bool => ! $radar->active);

        foreach ([...$first, ...$then] as $radar) {
            $id = (string) $radar->getKey();

            try {
                $filters = SearchFilters::fromNormalised($radar->filters);
                $found = $this->shared($radar, $filters, $round, $started, $stopped, $rounds);
                $computed[$id] = $found === null ? null : $this->personal($radar, $filters, $found, $rules[$id] ?? HideRuleSet::none(), $overlay, $personal);
            } catch (Throwable $e) {
                report($e);
                $computed[$id] = null;
            }
        }

        return array_combine($ids, array_map(fn (string $id): ?RadarPreview => $computed[$id] ?? null, $ids));
    }

    /**
     * The shared part of one filter set: from the cache, else one source round while the budget and the rounds last.
     * `$stopped` is set by a failure, once the budget is spent or once `$rounds` (the rounds made, counted on a miss
     * only) reaches `radar.preview_max_rounds`, and then only the cache answers.
     *
     * @return array{items: list<ListingSummary>, count: int, week: int, days: int}|null
     */
    private function shared(Radar $radar, SearchFilters $filters, PreviewRound $round, CarbonImmutable $started, bool &$stopped, int &$rounds): ?array
    {
        $context = $round->context;
        $key = implode(':', [
            'radar:previews:v1',
            $round->feed->driver->value.'-'.$round->count->driver->value.'-'.$round->flow->driver->value,
            $radar->filters_hash,
            $filters->postedDays === null ? 'all' : (string) $filters->postedDays,
            $filters->polygonDigest(),
            $context->locale,
            $context->currency,
        ]);
        $cached = $round->cached ? self::decode($this->cache->get($key)) : null;

        if ($cached !== null) {
            return $cached;
        }

        if ($stopped
            || $rounds >= Config::integer('radar.preview_max_rounds')
            || $started->diffInMilliseconds(Date::now()) >= Config::integer('radar.preview_budget_ms')) {
            $stopped = true;

            return null;
        }

        $rounds++;

        try {
            $page = $round->feed->source->feed(new ListingQuery($filters, ListingSort::New, null, self::PAGE), $context);
            $total = $round->count->source->count($filters, $context);
            $estimate = $round->flow->source->flow($filters, $context);
        } catch (Throwable $e) {
            if (! $e instanceof SourceUnavailable) {
                report($e);
            }

            $stopped = true;

            return null;
        }

        $found = ['items' => $page->items, 'count' => $total, 'week' => $estimate->week, 'days' => $estimate->days];
        $seconds = Config::integer('radar.preview_ttl');

        if ($round->cached && $seconds > 0) {
            $this->cache->put($key, self::encode($found), $seconds);
        }

        return $found;
    }

    /**
     * The caller's preview of one radar: the overlay, the radar's hide rules, the first five.
     *
     * @param  array{items: list<ListingSummary>, count: int, week: int, days: int}  $found
     */
    private function personal(Radar $radar, SearchFilters $filters, array $found, HideRuleSet $rules, ListingOverlay $overlay, SourceContext $context): RadarPreview
    {
        $items = $overlay->feed(new ListingPage($found['items'], null), $filters, $context)->items;
        $authors = $rules->hasAuthorRules() && $items !== []
            ? $this->refs->authorKeysOf(array_map(fn (ListingSummary $item): int => $item->number, $items))
            : [];
        $kept = [];

        foreach ($items as $item) {
            if (count($kept) === self::ITEMS) {
                break;
            }

            if (! $rules->excludes($item->sourceRef?->channel, $item->districtCode, $authors[$item->number] ?? null)) {
                $kept[] = $item;
            }
        }

        return new RadarPreview($kept, $found['count'], $found['week'], $found['days']);
    }

    /**
     * The cache entry of a shared part: arrays only.
     *
     * @param  array{items: list<ListingSummary>, count: int, week: int, days: int}  $found
     * @return array{items: list<array<string, mixed>>, count: int, week: int, days: int}
     */
    private static function encode(array $found): array
    {
        return [...$found, 'items' => array_map(fn (ListingSummary $item): array => $item->toArray(), $found['items'])];
    }

    /**
     * A cache entry read back; `null` for a miss or an entry of another shape.
     *
     * @return array{items: list<ListingSummary>, count: int, week: int, days: int}|null
     */
    private static function decode(mixed $entry): ?array
    {
        if (! is_array($entry) || ! is_array($entry['items'] ?? null) || ! array_is_list($entry['items'])) {
            return null;
        }

        $numbers = [];

        foreach (['count', 'week', 'days'] as $field) {
            $value = $entry[$field] ?? null;

            if (! is_int($value) && ! (is_string($value) && ctype_digit($value))) {
                return null;
            }

            $numbers[$field] = (int) $value;
        }

        if ($numbers['days'] < 1) {
            return null;
        }

        try {
            $items = array_map(fn (mixed $item): ListingSummary => is_array($item) ? ListingSummary::fromArray($item) : throw new InvalidArgumentException('A cached preview item must be an array.'), $entry['items']);
        } catch (InvalidArgumentException) {
            return null;
        }

        return ['items' => $items, ...$numbers];
    }
}
