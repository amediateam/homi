<?php

namespace App\Services\Radar;

use App\Enums\ListingSort;
use App\Models\Radar;
use App\Models\User;
use App\Services\Delivery\Contracts\DeliveredSet;
use App\Services\Listings\ListingOverlay;
use App\Services\Listings\ListingRefs;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Contracts\Container\Container;
use Illuminate\Support\Facades\Config;

/**
 * The listings a radar write sends to the chat at once (WP-45; task `KV-BE-102`), read through the listing source,
 * never by SQL over HOMI's tables (DEC-43, `25` §5):
 *
 * 1. Candidates: one page of 20 of the feed (`source.listings.feed`) for the radar's filters with `posted_days` set to
 *    `radar.starter_window_days` (3, the bot's «за последние 3 дня»; Q-API-033), newest first, in a new context with
 *    the user — the write's locale and currency, else the user's settings. The stored filters are not changed. The
 *    legacy driver passes the window on to legacy; the stub driver's fixtures ignore it.
 * 2. HOMI's overlay (`ListingOverlay::feed()`, as `GET /listings` applies it on every driver): the listings the user hid,
 *    those of authors he blocked and those HOMI's votes mark as rented leave. The legacy pager has already left them
 *    out through `ListingExclusion` before topping a page up; the stub driver leaves out nothing itself, so the overlay
 *    runs here for both, and a second pass over legacy's page removes nothing more.
 * 3. The delivered set (`DeliveredSet`, null until WP-46): what the user has received from any radar. `forResume()`
 *    also leaves out what he opened (the overlay's `viewed`) — «которые вы не видели» (API-021).
 * 4. The radar's hide rules (`HideRuleSet`, channel and district from the preview, the author key from `listing_refs`
 *    only when the radar has an author rule): each listing they keep back adds 1 to `hidden_count`. Counted after
 *    steps 2 and 3, so a listing the user hid or already received is not counted as held back.
 * 5. At most `radar.starter_max` (20), each number once; `Starter::$count` is the numbers.
 *
 * With `radar.starter_enabled` off every method answers an empty starter without asking the source. A source failure
 * is the caller's to handle (`SourceUnavailable`).
 */
final readonly class StarterSelector
{
    /** The page of candidates (`25` §5: one page of 20). */
    private const int PAGE = 20;

    public function __construct(
        private SourceManager $sources,
        private DeliveredSet $delivered,
        private RadarHideRuleService $hideRules,
        private ListingRefs $refs,
        private Container $container,
    ) {}

    /** After a create: the new radar's listings the user has not received. */
    public function forCreate(User $user, Radar $radar, ?string $locale = null, ?string $currency = null): Starter
    {
        return $this->select($user, $radar, $locale, $currency, unseen: false);
    }

    /** After new filters: only what the user has not received (API-020). */
    public function forUpdate(User $user, Radar $radar, ?string $locale = null, ?string $currency = null): Starter
    {
        return $this->select($user, $radar, $locale, $currency, unseen: false);
    }

    /** After a relax: as after new filters. */
    public function forRelax(User $user, Radar $radar, ?string $locale = null, ?string $currency = null): Starter
    {
        return $this->select($user, $radar, $locale, $currency, unseen: false);
    }

    /** After a radar is switched back on: only what the user has neither received nor opened (API-021). */
    public function forResume(User $user, Radar $radar, ?string $locale = null, ?string $currency = null): Starter
    {
        return $this->select($user, $radar, $locale, $currency, unseen: true);
    }

    private function select(User $user, Radar $radar, ?string $locale, ?string $currency, bool $unseen): Starter
    {
        if (! Config::boolean('radar.starter_enabled')) {
            return Starter::none();
        }

        $context = new SourceContext(
            $locale ?? $user->settings?->locale->value ?? 'ru',
            $currency ?? $user->settings?->currency->value ?? 'USD',
            $user,
        );
        $filters = SearchFilters::fromNormalised([...$radar->filters, 'posted_days' => Config::integer('radar.starter_window_days')]);
        $page = $this->sources->listings('source.listings.feed', $context)->source->feed(new ListingQuery($filters, ListingSort::New, null, self::PAGE), $context);
        $page = $this->container->make(ListingOverlay::class)->feed($page, $filters, $context);

        /** @var array<int, ListingSummary> $candidates */
        $candidates = [];

        foreach ($page->items as $item) {
            if (! isset($candidates[$item->number]) && ! ($unseen && $item->viewed)) {
                $candidates[$item->number] = $item;
            }
        }

        $candidates = array_diff_key($candidates, array_flip($this->delivered->delivered($user, array_keys($candidates))));
        [$numbers, $held] = $this->applyRules($radar, $candidates);

        if ($held > 0) {
            Radar::query()->whereKey($radar->getKey())->increment('hidden_count', $held);
            $radar->hidden_count += $held;
            $radar->syncOriginalAttribute('hidden_count');
        }

        return new Starter(array_slice($numbers, 0, max(0, Config::integer('radar.starter_max'))));
    }

    /**
     * The candidates the radar's hide rules let through, in order, and how many they held back.
     *
     * @param  array<int, ListingSummary>  $candidates
     * @return array{0: list<int>, 1: int}
     */
    private function applyRules(Radar $radar, array $candidates): array
    {
        $rules = $candidates === [] ? HideRuleSet::none() : $this->hideRules->rulesFor($radar);

        if ($rules->isEmpty()) {
            return [array_keys($candidates), 0];
        }

        $authors = $rules->hasAuthorRules() ? $this->refs->authorKeysOf(array_keys($candidates)) : [];
        $numbers = [];
        $held = 0;

        foreach ($candidates as $number => $item) {
            if ($rules->excludes($item->sourceRef?->channel, $item->districtCode, $authors[$number] ?? null)) {
                $held++;
            } else {
                $numbers[] = $number;
            }
        }

        return [$numbers, $held];
    }
}
