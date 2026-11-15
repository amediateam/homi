<?php

namespace App\Services\Sources\Stub;

use App\Services\Personal\BlockedAuthor;
use App\Services\Sources\Data\Fields;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use InvalidArgumentException;

/**
 * The listing lists of the native stubs (WP-13): favourites, history, hidden listings and radar previews keep listing
 * numbers, as HOMI's tables will (WP-44, WP-45), and the previews come from the listing source of the card
 * (`ListingSource::previews()`). Listings the source no longer knows are left out; withdrawn ones stay with
 * `status_text`. The fixture numbers are numbers of the WP-12 catalogue. It also reads the entry ids and the blocked
 * authors of the hidden-list fixtures.
 */
final class StubListingRefs
{
    public function __construct(private readonly FixtureStore $fixtures, private readonly SourceManager $sources) {}

    /**
     * The numbers of a fixture key, in order.
     *
     * @return list<int>
     */
    public function numbers(string $fixture, string $key = 'numbers'): array
    {
        $numbers = $this->fixtures->get($fixture)[$key] ?? null;

        if (! is_array($numbers) || ! array_is_list($numbers) || array_filter($numbers, fn (mixed $n): bool => ! is_int($n)) !== []) {
            throw new InvalidArgumentException("The stub fixture \"{$fixture}\" must hold \"{$key}\" as a list of listing numbers.");
        }

        /** @var list<int> $numbers */
        return $numbers;
    }

    /**
     * The previews of the given numbers that the source knows, in the given order.
     *
     * @param  list<int>  $numbers
     * @return list<ListingSummary>
     */
    public function previews(array $numbers, SourceContext $context): array
    {
        if ($numbers === []) {
            return [];
        }

        $known = $this->sources->listings('source.listings.card', $context)->source->previews($numbers, $context);

        return array_values(array_filter(array_map(fn (int $number): ?ListingSummary => $known[$number] ?? null, $numbers)));
    }

    /**
     * One page of a personal list: the numbers are cut by the cursor first, then resolved, so a page may hold fewer
     * than `$limit` items.
     *
     * @param  list<int>  $numbers
     * @return array{0: list<ListingSummary>, 1: string|null}
     */
    public function page(array $numbers, ?string $cursor, int $limit, SourceContext $context): array
    {
        [$slice, $next] = StubCursor::page($numbers, $cursor, $limit);

        return [$this->previews($slice, $context), $next];
    }

    /** The preview of one number, or `SourceNotFound` / `SourceUnavailable` from the source. */
    public function preview(int $number, SourceContext $context): ListingSummary
    {
        return $this->sources->listings('source.listings.card', $context)->source->preview($number, $context);
    }

    /** The entry id (ULID) of a fixture, such as the blocked author of `hidden/blocked_author.json`. */
    public function entryId(string $fixture): string
    {
        return Fields::string($this->fixtures->get($fixture), 'id');
    }

    /**
     * The blocked authors of a hidden-list fixture.
     *
     * @return list<BlockedAuthor>
     */
    public function blockedAuthors(string $fixture): array
    {
        return array_map(fn (array $author): BlockedAuthor => new BlockedAuthor(
            id: Fields::string($author, 'id'),
            kind: Fields::string($author, 'kind'),
            label: Fields::string($author, 'label'),
            count: Fields::count($author, 'count'),
        ), Fields::objects($this->fixtures->get($fixture), 'authors'));
    }
}
