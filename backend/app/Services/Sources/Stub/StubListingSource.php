<?php

namespace App\Services\Sources\Stub;

use App\Enums\ListingSort;
use App\Enums\OwnerFilter;
use App\Exceptions\Listings\ContactUnavailable;
use App\Exceptions\Listings\TranslationUnavailable;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\FlowOption;
use App\Services\Sources\Data\ListingContact;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Data\ListingTranslation;
use App\Services\Sources\Data\MapPoint;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\SourceContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Config;
use InvalidArgumentException;

/**
 * The stub driver of the listing capability (WP-12) over `listings/catalog.json`: 16 invented listings covering
 * every deal × type and the special cases (video, no photos, no coordinates, suspicious price, verified owner, the two
 * price kinds, two raw synthetic numbers in texts). The Tashkent long-rent apartments are repeated with shifted
 * numbers (`101001` …) until the default filters find 45, so the feed has three pages.
 *
 * Filters applied in memory: city, deal, types, rooms (a maximum of 4 or more is open), price, districts,
 * `near_metro` (metro within 1 km), `below_median` (a negative median delta) and owner; the others are accepted and
 * ignored. Count, map and new-since follow the same filter, so the same filters give the same set.
 *
 * Reserved numbers: `999404` → 404, `999503` → 503, `100016` answers with `100001` (a merged duplicate). Scenarios:
 * `empty`, `few` and `page2_error` (feed), `new_none` and `new_one` (new-since), `contact_unavailable`,
 * `translation_unavailable`. A cursor the feed did not give ends the list quietly (`StubCursor`). `{media}` and
 * `{api}` in the fixture become `config('media.public_url')` and `config('app.url')`. The `stub` object of an
 * entry (city, synthetic phone) is stub data, never answered.
 */
final class StubListingSource implements ListingSource
{
    /** How many entries the default filters (Tashkent, long rent, apartment) find. */
    public const int DEFAULT_SET = 45;

    /** Number that a merged duplicate answers with. */
    public const array MERGED = [100016 => 100001];

    public const int NOT_FOUND = 999404;

    public const int UNAVAILABLE = 999503;

    /** First number of the repeated entries. */
    private const int REPEAT_BASE = 101000;

    /** @var array<int, array<array-key, mixed>>|null */
    private ?array $entries = null;

    public function __construct(private readonly FixtureStore $fixtures) {}

    public function feed(ListingQuery $query, SourceContext $context): ListingPage
    {
        $this->fixtures->failForReserved($context);
        $offset = StubCursor::offset($query->cursor);

        if ($offset === null) {
            return new ListingPage([], null);
        }

        if ($context->scenario === 'page2_error' && $offset > 0) {
            throw new SourceUnavailable('Stub scenario page2_error.');
        }

        $matches = match ($context->scenario) {
            'empty' => [],
            'few' => array_slice($this->sorted($this->matching($query->filters), $query->sort), 0, 5),
            default => $this->sorted($this->matching($query->filters), $query->sort),
        };

        $page = array_slice($matches, $offset, $query->limit);
        $next = $offset + $query->limit;

        return new ListingPage(
            array_map(ListingSummary::fromArray(...), $page),
            $next < count($matches) ? "s1.{$next}" : null,
        );
    }

    public function count(SearchFilters $filters, SourceContext $context): int
    {
        $this->fixtures->failForReserved($context);

        return count($this->matching($filters));
    }

    public function newSince(SearchFilters $filters, int $since, SourceContext $context): int
    {
        $this->fixtures->failForReserved($context);

        return match ($context->scenario) {
            'new_none' => 0,
            'new_one' => 1,
            default => intdiv(count($this->matching($filters)), 4),
        };
    }

    public function flow(SearchFilters $filters, SourceContext $context): FlowEstimate
    {
        $this->fixtures->failForReserved($context);
        $count = count($this->matching($filters));
        $options = $count < 10 ? $this->fixtures->get('listings/flow.options') : [];

        return new FlowEstimate($count, 7, array_values(array_map(
            fn (mixed $option): FlowOption => is_array($option) ? FlowOption::fromArray($option) : throw new InvalidArgumentException('Each flow option must be an object.'),
            $options,
        )));
    }

    public function map(SearchFilters $filters, SourceContext $context): MapPoints
    {
        $this->fixtures->failForReserved($context);
        $matches = $this->matching($filters);
        $points = [];

        foreach ($matches as $entry) {
            $summary = ListingSummary::fromArray($entry);

            if ($summary->location === null) {
                continue;
            }

            $points[] = MapPoint::fromArray([
                'number' => $summary->number,
                'lat' => $summary->location->lat,
                'lon' => $summary->location->lon,
                'label' => $summary->price->display ?? '—',
                'tone' => in_array($summary->marketTone, ['good', 'check', 'suspicious'], true)
                    ? $summary->marketTone
                    : ($summary->medianDelta !== null && $summary->medianDelta > 0.1 ? 'high' : null),
                'priced' => $summary->price?->usd !== null,
                'usd' => $summary->price?->usd,
            ]);
        }

        return new MapPoints($points, count($matches));
    }

    public function details(int $number, SourceContext $context): ListingDetails
    {
        return ListingDetails::fromArray($this->entry($number, $context));
    }

    public function preview(int $number, SourceContext $context): ListingSummary
    {
        return ListingSummary::fromArray($this->entry($number, $context));
    }

    public function previews(array $numbers, SourceContext $context): array
    {
        $this->fixtures->failForReserved($context);
        $previews = [];

        foreach ($numbers as $number) {
            $entry = $this->entries()[self::MERGED[$number] ?? $number] ?? null;

            if ($entry !== null) {
                $previews[$number] = ListingSummary::fromArray($entry);
            }
        }

        return $previews;
    }

    public function contact(int $number, SourceContext $context): ListingContact
    {
        $entry = $this->entry($number, $context);
        $phone = is_array($entry['stub'] ?? null) && is_string($entry['stub']['phone'] ?? null) ? $entry['stub']['phone'] : null;

        if ($context->scenario === 'contact_unavailable' || $phone === null || ! ListingDetails::fromArray($entry)->hasPhone) {
            throw new ContactUnavailable;
        }

        return ListingContact::fromArray([
            'call_url' => rtrim(Config::string('app.url'), '/').'/call/stub-token-'.$entry['number'],
            'expires_at' => now()->addMinutes(10)->toIso8601String(),
            'phone' => $phone,
            'phone_display' => sprintf('+998 %s %s-%s-%s', substr($phone, 4, 2), substr($phone, 6, 3), substr($phone, 9, 2), substr($phone, 11, 2)),
        ]);
    }

    public function translation(int $number, SourceContext $context): ListingTranslation
    {
        $entry = $this->entry($number, $context);

        if ($context->scenario === 'translation_unavailable') {
            throw new TranslationUnavailable;
        }

        if (ListingDetails::fromArray($entry)->originalText === null) {
            throw new SourceNotFound('The listing has no original text.');
        }

        $texts = $this->fixtures->get('listings/translation')[$context->locale] ?? null;
        $text = is_array($texts) ? ($texts[(string) $entry['number']] ?? $texts['default'] ?? null) : null;

        return ListingTranslation::fromArray(['text' => is_string($text) ? $text : throw new InvalidArgumentException("No stub translation for \"{$context->locale}\"."), 'locale' => $context->locale]);
    }

    /**
     * Every entry, repeats included, keyed by number, with the tokens replaced; `sources:publish-stub-media` reads
     * the photo addresses from here.
     *
     * @return array<int, array<array-key, mixed>>
     */
    public function entries(): array
    {
        if ($this->entries !== null) {
            return $this->entries;
        }

        $entries = [];

        foreach ($this->fixtures->get('listings/catalog') as $entry) {
            if (! is_array($entry) || ! is_int($entry['number'] ?? null)) {
                throw new InvalidArgumentException('Each entry of listings/catalog must be an object with a number.');
            }

            $entries[$entry['number']] = $this->tokens($entry);
        }

        $defaults = array_values(array_filter($entries, fn (array $entry): bool => $this->isDefaultSet($entry)));
        $bases = array_values(array_filter($defaults, fn (array $entry): bool => ($entry['status_text'] ?? null) === null));

        for ($i = 1; $bases !== [] && count($defaults) + $i - 1 < self::DEFAULT_SET; $i++) {
            $copy = $this->repeat($bases[($i - 1) % count($bases)], $i);
            $entries[$copy['number']] = $copy;
        }

        return $this->entries = $entries;
    }

    /**
     * @return array<array-key, mixed>
     *
     * @throws SourceNotFound|SourceUnavailable
     */
    private function entry(int $number, SourceContext $context): array
    {
        $this->fixtures->failForReserved($context);

        if ($number === self::UNAVAILABLE) {
            throw new SourceUnavailable('Stub listing 999503 is unavailable.');
        }

        return $this->entries()[self::MERGED[$number] ?? $number] ?? throw new SourceNotFound('Listing not found.');
    }

    /** @return list<array<array-key, mixed>> */
    private function matching(SearchFilters $filters): array
    {
        return array_values(array_filter($this->entries(), fn (array $entry): bool => $this->matches($entry, $filters)));
    }

    /** @param  array<array-key, mixed>  $entry */
    private function matches(array $entry, SearchFilters $filters): bool
    {
        $summary = ListingSummary::fromArray($entry);
        $city = is_array($entry['stub'] ?? null) ? ($entry['stub']['city'] ?? null) : null;
        $usd = $summary->price?->usd;
        $rooms = $summary->rooms;

        return $city === $filters->city
            && $summary->deal === $filters->deal
            && in_array($summary->type, $filters->types, true)
            && ($filters->roomsMin === null || ($rooms !== null && $rooms >= $filters->roomsMin))
            && ($filters->roomsMax === null || $filters->roomsMax >= 4 || ($rooms !== null && $rooms <= $filters->roomsMax))
            && ($filters->priceMin === null || ($usd !== null && $usd >= $filters->priceMin))
            && ($filters->priceMax === null || ($usd !== null && $usd <= $filters->priceMax))
            && ($filters->districts === [] || in_array($summary->districtCode, $filters->districts, true))
            && (! $filters->nearMetro || ($summary->metroKm !== null && $summary->metroKm <= 1.0))
            && (! $filters->belowMedian || ($summary->medianDelta !== null && $summary->medianDelta < 0))
            && match ($filters->owner) {
                OwnerFilter::Any => true,
                OwnerFilter::NoAgents => $summary->isOwner !== false,
                OwnerFilter::Owners => $summary->isOwner === true,
            };
    }

    /**
     * @param  list<array<array-key, mixed>>  $entries
     * @return list<array<array-key, mixed>>
     */
    private function sorted(array $entries, ListingSort $sort): array
    {
        $keys = [];

        foreach ($entries as $entry) {
            $summary = ListingSummary::fromArray($entry);
            $usd = $summary->price?->usd;
            $keys[$summary->number] = match ($sort) {
                ListingSort::New => $summary->postedAt,
                ListingSort::Cheap, ListingSort::Expensive => $usd === null ? null : (float) $usd,
                ListingSort::Deal => $summary->medianDelta,
                ListingSort::Center => $summary->centerKm,
                ListingSort::Ppm => $usd === null || ! $summary->areaTotal ? null : $usd / $summary->areaTotal,
            };
        }

        $descending = in_array($sort, [ListingSort::New, ListingSort::Expensive], true);

        usort($entries, function (array $a, array $b) use ($keys, $descending): int {
            [$x, $y] = [$keys[$a['number']], $keys[$b['number']]];

            if ($x === null || $y === null) {
                return ($x === null) <=> ($y === null) ?: $a['number'] <=> $b['number'];
            }

            return ($descending ? $y <=> $x : $x <=> $y) ?: $a['number'] <=> $b['number'];
        });

        return $entries;
    }

    /** @param  array<array-key, mixed>  $entry */
    private function isDefaultSet(array $entry): bool
    {
        return is_array($entry['stub'] ?? null) && ($entry['stub']['city'] ?? null) === 'tashkent'
            && ($entry['deal'] ?? null) === 'rent_long' && ($entry['type'] ?? null) === 'apartment';
    }

    /**
     * A copy of a Tashkent long-rent apartment with a shifted number, a slightly higher price and an earlier post.
     *
     * @param  array<array-key, mixed>  $base
     * @return array<array-key, mixed>
     */
    private function repeat(array $base, int $i): array
    {
        $copy = $base;
        $copy['number'] = self::REPEAT_BASE + $i;

        if (is_array($copy['price'] ?? null) && is_int($copy['price']['usd'] ?? null)) {
            $copy['price']['usd'] += 5 * $i;
            $copy['price']['display'] = '$'.number_format($copy['price']['usd'], 0, '.', ' ');
        }

        if (is_array($copy['posted'] ?? null)) {
            $copy['posted']['at'] = CarbonImmutable::parse('2026-11-12T12:00:00+00:00')->subHours($i)->toIso8601String();
            $copy['posted']['when'] = 'на днях';
        }

        if (is_array($copy['source_ref'] ?? null) && is_int($copy['source_ref']['post_id'] ?? null)) {
            $copy['source_ref']['post_id'] += 100 * $i;
        }

        return $copy;
    }

    /**
     * @param  array<array-key, mixed>  $value
     * @return array<array-key, mixed>
     */
    private function tokens(array $value): array
    {
        $media = rtrim(Config::string('media.public_url'), '/');
        $api = rtrim(Config::string('app.url'), '/');

        array_walk_recursive($value, function (mixed &$item) use ($media, $api): void {
            if (is_string($item)) {
                $item = str_replace(['{media}', '{api}'], [$media, $api], $item);
            }
        });

        return $value;
    }
}
