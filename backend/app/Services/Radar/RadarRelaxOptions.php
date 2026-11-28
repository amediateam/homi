<?php

namespace App\Services\Radar;

use App\Models\Radar;
use App\Services\Search\FilterRejected;
use App\Services\Search\SearchFilters;
use App\Services\Search\SearchFiltersNormaliser;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\FlowOption;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Validation\ValidationException;

/**
 * The ways to widen a radar that found nothing (WP-45; tasks `KV-BE-102`, `KV-BE-105`), read through the listing
 * source, never by SQL over HOMI's tables (`25` §5). In Wave 1 they are the options the source computes for the radar's
 * filters (`source.listings.flow`), so a daily-rent radar gets daily options:
 *
 * - `offer()`, for a write whose starter is empty: at most `radar.options_max` options of one `flow()` call, each code
 *   once, an option whose filters are the radar's (the canonical hash, `posted_days` aside) left out; a missing `count`
 *   is the count (`source.listings.count`) of the option's filters over the starter's window
 *   (`radar.starter_window_days`). The offered set — code → filters, as arrays — is remembered for 15 minutes under
 *   `radar:<id>:options` (`key()`). Without an option, `relaxed` is one hint of the radar's own flow when `week > 0`:
 *   «≈N в день» from one a day (N rounded), else «N за неделю» (BR-APP-044, `lang/*\/radar.php`), in the context's
 *   locale; otherwise it is empty.
 * - `filtersFor()`, for `RadarService::relax()`: the filters of a remembered code, or of a code of a set computed again
 *   when the remembered one has expired (and remembered again), normalised once more for a radar (`forRadar`); any
 *   other code, or one whose filters the reference no longer accepts, is `422` on `code`.
 * - `forget()`: the radar's filters changed or it was deleted, so its set no longer applies — the next relax computes
 *   one from the then-current filters (two quick relaxes relax twice).
 *
 * A source failure is the caller's to handle (`SourceUnavailable`); nothing is remembered then. The cache key holds the
 * radar id only (WP-47's erasure registry lists it); the set holds filters, never an author key.
 */
final readonly class RadarRelaxOptions
{
    /** How long an offered set is remembered (s). */
    public const int REMEMBER_SECONDS = 900;

    public function __construct(private SourceManager $sources, private SearchFiltersNormaliser $normaliser) {}

    public static function key(Radar $radar): string
    {
        return "radar:{$radar->id}:options";
    }

    /**
     * The options of the radar and the `relaxed` hints of a write whose starter is empty; the set is remembered.
     *
     * @return array{0: list<FlowOption>, 1: list<string>}
     */
    public function offer(Radar $radar, SourceContext $context): array
    {
        $flow = $this->sources->listings('source.listings.flow', $context)->source->flow($radar->searchFilters(), $context);
        $max = max(0, Config::integer('radar.options_max'));

        /** @var array<string, FlowOption> $options */
        $options = [];

        foreach ($flow->options as $option) {
            if (count($options) >= $max) {
                break;
            }

            if (isset($options[$option->code]) || $option->filters->canonicalHash() === $radar->filters_hash) {
                continue;
            }

            $options[$option->code] = $option->count === null
                ? new FlowOption($option->code, $option->label, $option->rate, $this->countOf($option->filters, $context), $option->filters)
                : $option;
        }

        Cache::put(self::key($radar), array_map(fn (FlowOption $option): array => $option->filters->toArray(), $options), self::REMEMBER_SECONDS);
        $options = array_values($options);

        return [$options, $options === [] ? $this->hint($flow, $context->locale) : []];
    }

    /** The filters a code widens the radar to: of the remembered set, else of a set computed again. */
    public function filtersFor(Radar $radar, string $code, SourceContext $context): SearchFilters
    {
        $remembered = $this->remembered($radar);

        if ($remembered === null) {
            [$options] = $this->offer($radar, $context);
            $remembered = [];

            foreach ($options as $option) {
                $remembered[$option->code] = $option->filters->toArray();
            }
        }

        if (! isset($remembered[$code])) {
            throw ValidationException::withMessages(['code' => 'The code is not an option of this radar.']);
        }

        try {
            return $this->normaliser->normalise($remembered[$code], forRadar: true);
        } catch (FilterRejected) {
            throw ValidationException::withMessages(['code' => 'The option of this code can no longer be applied.']);
        }
    }

    public function forget(Radar $radar): void
    {
        Cache::forget(self::key($radar));
    }

    /**
     * The remembered set, or null when it expired or no longer reads as one.
     *
     * @return array<string, array<array-key, mixed>>|null
     */
    private function remembered(Radar $radar): ?array
    {
        $set = Cache::get(self::key($radar));

        if (! is_array($set)) {
            return null;
        }

        foreach ($set as $code => $filters) {
            if (! is_string($code) || ! is_array($filters)) {
                return null;
            }
        }

        /** @var array<string, array<array-key, mixed>> $set */
        return $set;
    }

    private function countOf(SearchFilters $filters, SourceContext $context): int
    {
        $window = SearchFilters::fromNormalised([...$filters->toArray(), 'posted_days' => Config::integer('radar.starter_window_days')]);

        return $this->sources->listings('source.listings.count', $context)->source->count($window, $context);
    }

    /**
     * The hint of the radar's own flow: none for a week without listings.
     *
     * @return list<string>
     */
    private function hint(FlowEstimate $flow, string $locale): array
    {
        if ($flow->week === 0) {
            return [];
        }

        $perDay = $flow->week / $flow->days;
        $text = $perDay >= 1
            ? __('radar.relaxed.day', ['n' => (int) round($perDay)], $locale)
            : __('radar.relaxed.week', ['n' => $flow->week], $locale);

        return is_string($text) ? [$text] : [];
    }
}
