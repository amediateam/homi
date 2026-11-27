<?php

namespace App\Services\Sources\Data;

use App\Enums\ContactMode;
use App\Services\Listings\PhoneMasker;

/**
 * The full card of `GET /listings/{number}` (WP-12): the preview plus the card's own parts. It holds no phone number
 * of the author (DEC-52): `hasPhone` says whether `POST …/contact` can give one; `ListingContact` is the only object
 * with a number.
 *
 * `fromArray()` is the one way a driver builds it; it masks `summary`, `original.text`, `offers[].text`,
 * `price_history[].text`, `author.label`, `owner_label` and `owner.description` (and, through `ListingSummary`,
 * `title`). Since WP-80 it carries the
 * owner part (`owner`) and the two contact keys of a self-placed listing (`contactMode`, `contactRequest`).
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
        public ListingOwner $owner,
        public ?ContactMode $contactMode,
        public ?ContactRequestState $contactRequest,
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
        $mode = Fields::nullableString($contact, 'mode');
        $ownerLabel = Fields::nullableString($data, 'owner_label');
        $request = Fields::nullableObject($contact, 'request');

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
            ownerLabel: $ownerLabel === null ? null : PhoneMasker::mask($ownerLabel),
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
            owner: ListingOwner::fromArray(Fields::object($data, 'owner')),
            contactMode: $mode === null ? null : (ContactMode::tryFrom($mode) ?? throw new \InvalidArgumentException('The field "contact.mode" must be a contact mode or null.')),
            contactRequest: $request === null ? null : ContactRequestState::fromArray($request),
        );
    }

    /** The same card with the invitation of DEC-94 decided by the source (`owner.entry`). */
    public function withOwnerEntry(bool $entry): self
    {
        return clone ($this, ['owner' => $this->owner->withEntry($entry)]);
    }

    /** The same card with another preview part: HOMI's per-user flags and marks (the overlay of WP-42). */
    public function withPreview(ListingSummary $preview): self
    {
        return clone ($this, ['preview' => $preview]);
    }

    /** The same card with another owner part (the overlay of WP-42). */
    public function withOwner(ListingOwner $owner): self
    {
        return clone ($this, ['owner' => $owner]);
    }

    /** The same card with the caller's request and whether `POST …/contact` can give a number (the overlay of WP-42). */
    public function withContactRequest(?ContactRequestState $request, bool $hasPhone): self
    {
        return clone ($this, ['contactRequest' => $request, 'hasPhone' => $hasPhone]);
    }
}
