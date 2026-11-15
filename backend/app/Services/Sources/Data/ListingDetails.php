<?php

namespace App\Services\Sources\Data;

use App\Services\Listings\PhoneMasker;

/**
 * The full card of `GET /listings/{number}` (WP-12): the preview plus the card's own parts. It holds no phone number
 * of the author (DEC-52): `hasPhone` says whether `POST …/contact` can give one; `ListingContact` is the only object
 * with a number.
 *
 * `fromArray()` is the one way a driver builds it; it masks `summary`, `original.text`, `offers[].text` and
 * `price_history[].text` (and, through `ListingSummary`, `title`).
 */
final readonly class ListingDetails
{
    /**
     * @param  list<string>  $photoItems
     * @param  list<ListingFact>  $facts
     * @param  list<ListingNearby>  $nearby
     * @param  list<PriceEvent>  $priceHistory
     * @param  list<ListingOffer>  $offers
     * @param  list<ListingSourceLink>  $sources
     */
    public function __construct(
        public ListingSummary $preview,
        public array $photoItems,
        public ?string $marketCode,
        public array $facts,
        public array $nearby,
        public int $daysListed,
        public int $publications,
        public int $channels,
        public ?int $views,
        public array $priceHistory,
        public ?int $geoRadiusM,
        public ?string $authorKind,
        public ?string $authorLabel,
        public ?int $authorCount,
        public ?string $ownerLabel,
        public bool $hasPhone,
        public ?string $contactUrl,
        public bool $contactPaid,
        public ?string $summary,
        public array $offers,
        public ?string $originalText,
        public ?string $originalUrl,
        public bool $originalDeleted,
        public array $sources,
        public ?MarketComparison $comparison,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $stats = Fields::object($data, 'stats');
        $author = Fields::nullableObject($data, 'author');
        $contact = Fields::object($data, 'contact');
        $original = Fields::object($data, 'original');
        $comparison = Fields::nullableObject($data, 'comparison');
        $summary = Fields::nullableString($data, 'summary');
        $originalText = Fields::nullableString($original, 'text');

        return new self(
            preview: ListingSummary::fromArray($data),
            photoItems: Fields::strings(Fields::object($data, 'photos'), 'items'),
            marketCode: Fields::nullableString(Fields::object($data, 'market'), 'code'),
            facts: array_map(ListingFact::fromArray(...), Fields::objects($data, 'facts')),
            nearby: array_map(ListingNearby::fromArray(...), Fields::objects($data, 'nearby')),
            daysListed: Fields::count($stats, 'days_listed'),
            publications: Fields::count($stats, 'publications'),
            channels: Fields::count($stats, 'channels'),
            views: Fields::nullableInt($stats, 'views'),
            priceHistory: array_map(PriceEvent::fromArray(...), Fields::objects($data, 'price_history')),
            geoRadiusM: Fields::nullableInt($data, 'geo_radius_m'),
            authorKind: $author === null ? null : Fields::string($author, 'kind'),
            authorLabel: $author === null ? null : PhoneMasker::mask(Fields::string($author, 'label')),
            authorCount: $author === null ? null : Fields::count($author, 'count'),
            ownerLabel: Fields::nullableString($data, 'owner_label'),
            hasPhone: Fields::bool($contact, 'has_phone'),
            contactUrl: Fields::nullableString($contact, 'contact_url'),
            contactPaid: Fields::bool($contact, 'contact_paid'),
            summary: $summary === null ? null : PhoneMasker::mask($summary),
            offers: array_map(ListingOffer::fromArray(...), Fields::objects($data, 'offers')),
            originalText: $originalText === null ? null : PhoneMasker::mask($originalText),
            originalUrl: Fields::nullableString($original, 'url'),
            originalDeleted: Fields::bool($original, 'deleted'),
            sources: array_map(ListingSourceLink::fromArray(...), Fields::objects($data, 'sources')),
            comparison: $comparison === null ? null : MarketComparison::fromArray($comparison),
        );
    }
}
