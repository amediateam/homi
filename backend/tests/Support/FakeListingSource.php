<?php

namespace Tests\Support;

use App\Services\Search\ListingQuery;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\ListingContact;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingPage;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Data\ListingTranslation;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\SourceContext;
use App\Services\Sources\Stub\StubListingSource;
use LogicException;
use Throwable;

/**
 * The listing source as a radar test sets it (WP-45), bound as the stub driver: `feed()` answers the first `limit` of
 * `$items` in their order with no next page, or throws `$failure`. `calls` records every call with its first argument
 * and its context, so a test sees the window, the sort and the user a starter asked for, or that nothing was asked.
 */
final class FakeListingSource implements ListingSource
{
    /** @var list<ListingSummary> */
    public array $items = [];

    public ?Throwable $failure = null;

    /** @var list<array{0: string, 1: mixed, 2: SourceContext}> method, first argument, context */
    public array $calls = [];

    /** Binds a new instance as the stub driver of the listing capability and answers it. */
    public static function bind(): self
    {
        $fake = new self;
        app()->instance(StubListingSource::class, $fake);

        return $fake;
    }

    /**
     * Previews of the stub shape, each with the overrides of its number.
     *
     * @param  array<int, array<string, mixed>>  $byNumber
     */
    public function withItems(array $byNumber): self
    {
        $this->items = [];

        foreach ($byNumber as $number => $overrides) {
            $this->items[] = ListingSummary::fromArray(ListingArrays::preview(['number' => $number, ...$overrides]));
        }

        return $this;
    }

    public function feed(ListingQuery $query, SourceContext $context): ListingPage
    {
        $this->calls[] = ['feed', $query, $context];

        if ($this->failure !== null) {
            throw $this->failure;
        }

        return new ListingPage(array_slice($this->items, 0, $query->limit), null);
    }

    public function count(SearchFilters $filters, SourceContext $context): int
    {
        return $this->unfaked('count', $filters, $context);
    }

    public function newSince(SearchFilters $filters, int $since, SourceContext $context): int
    {
        return $this->unfaked('newSince', $filters, $context);
    }

    public function flow(SearchFilters $filters, SourceContext $context): FlowEstimate
    {
        return $this->unfaked('flow', $filters, $context);
    }

    public function map(SearchFilters $filters, SourceContext $context): MapPoints
    {
        return $this->unfaked('map', $filters, $context);
    }

    public function details(int $number, SourceContext $context): ListingDetails
    {
        return $this->unfaked('details', $number, $context);
    }

    public function preview(int $number, SourceContext $context): ListingSummary
    {
        return $this->unfaked('preview', $number, $context);
    }

    public function previews(array $numbers, SourceContext $context): array
    {
        return $this->unfaked('previews', $numbers, $context);
    }

    public function hasContact(int $number, SourceContext $context): bool
    {
        return $this->unfaked('hasContact', $number, $context);
    }

    public function authorPhoneLabel(int $number, SourceContext $context): ?string
    {
        return $this->unfaked('authorPhoneLabel', $number, $context);
    }

    public function contact(int $number, SourceContext $context): ListingContact
    {
        return $this->unfaked('contact', $number, $context);
    }

    public function translation(int $number, SourceContext $context): ListingTranslation
    {
        return $this->unfaked('translation', $number, $context);
    }

    private function unfaked(string $method, mixed $argument, SourceContext $context): never
    {
        $this->calls[] = [$method, $argument, $context];

        throw new LogicException("FakeListingSource does not answer {$method}().");
    }
}
