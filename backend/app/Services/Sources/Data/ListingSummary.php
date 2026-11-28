<?php

namespace App\Services\Sources\Data;

use App\Enums\Deal;
use App\Enums\ListingOrigin;
use App\Enums\PropertyType;
use App\Services\Listings\PhoneMasker;

/**
 * A listing preview (WP-12): an item of every listing list and the `preview=1` form of the card. Raw values travel
 * next to the display strings and are null when the source does not know them (`25` §4.5). The nested objects of the
 * answer (`district`, `metro`, `photos`, `posted`, `market`) are flattened here; `ListingPreviewResource` nests them.
 *
 * `fromArray()` is the one way a driver builds it; it masks the phone numbers of the author-written `title`, `place` and
 * `landmark` (DEC-52, `PhoneMasker`), never the names HOMI takes from a directory (district, metro).
 */
final readonly class ListingSummary
{
    /** @param  list<string>  $photosPreview */
    public function __construct(
        public int $number,
        public ListingOrigin $origin,
        public ?Deal $deal,
        public ?PropertyType $type,
        public string $title,
        public ?PriceInfo $price,
        public ?int $rooms,
        public ?float $areaTotal,
        public ?int $floor,
        public ?int $floorsTotal,
        public ?string $districtCode,
        public ?string $districtName,
        public ?string $place,
        public ?string $landmark,
        public ?string $metroName,
        public ?float $metroKm,
        public ?float $centerKm,
        public ?GeoPoint $location,
        public array $photosPreview,
        public int $photosCount,
        public ?string $photosCover,
        public bool $hasVideo,
        public bool $petsOk,
        public ?bool $isOwner,
        public bool $ownerVerified,
        public string $postedLabel,
        public string $postedWhen,
        public ?string $postedAt,
        public ?string $statusText,
        public ?string $marketLabel,
        public ?float $medianDelta,
        public ?string $marketTone,
        public bool $favorite,
        public bool $viewed,
        public ?SourceRef $sourceRef,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $deal = Fields::nullableString($data, 'deal');
        $type = Fields::nullableString($data, 'type');
        $price = Fields::nullableObject($data, 'price');
        $district = Fields::nullableObject($data, 'district');
        $metro = Fields::nullableObject($data, 'metro');
        $location = Fields::nullableObject($data, 'location');
        $photos = Fields::object($data, 'photos');
        $posted = Fields::object($data, 'posted');
        $market = Fields::object($data, 'market');
        $sourceRef = Fields::nullableObject($data, 'source_ref');
        $place = Fields::nullableString($data, 'place');
        $landmark = Fields::nullableString($data, 'landmark');

        return new self(
            number: Fields::int($data, 'number'),
            origin: ListingOrigin::tryFrom(Fields::string($data, 'origin')) ?? throw new \InvalidArgumentException('The field "origin" must be legacy or native.'),
            deal: $deal === null ? null : (Deal::tryFrom($deal) ?? throw new \InvalidArgumentException('The field "deal" must be a deal or null.')),
            type: $type === null ? null : (PropertyType::tryFrom($type) ?? throw new \InvalidArgumentException('The field "type" must be a property type or null.')),
            title: PhoneMasker::mask(Fields::string($data, 'title')),
            price: $price === null ? null : PriceInfo::fromArray($price),
            rooms: Fields::nullableInt($data, 'rooms'),
            areaTotal: Fields::nullableFloat($data, 'area_total'),
            floor: Fields::nullableInt($data, 'floor'),
            floorsTotal: Fields::nullableInt($data, 'floors_total'),
            districtCode: $district === null ? null : Fields::nullableString($district, 'code'),
            districtName: $district === null ? null : Fields::string($district, 'name'),
            place: $place === null ? null : PhoneMasker::mask($place),
            landmark: $landmark === null ? null : PhoneMasker::mask($landmark),
            metroName: $metro === null ? null : Fields::string($metro, 'name'),
            metroKm: $metro === null ? null : Fields::nullableFloat($metro, 'km'),
            centerKm: Fields::nullableFloat($data, 'center_km'),
            location: $location === null ? null : GeoPoint::fromArray($location),
            photosPreview: Fields::strings($photos, 'preview'),
            photosCount: Fields::count($photos, 'count'),
            photosCover: Fields::nullableString($photos, 'cover'),
            hasVideo: Fields::bool($data, 'has_video'),
            petsOk: Fields::bool($data, 'pets_ok'),
            isOwner: Fields::nullableBool($data, 'is_owner'),
            ownerVerified: Fields::bool($data, 'owner_verified'),
            postedLabel: Fields::string($posted, 'label'),
            postedWhen: Fields::string($posted, 'when'),
            postedAt: Fields::nullableString($posted, 'at'),
            statusText: Fields::nullableString($data, 'status_text'),
            marketLabel: Fields::nullableString($market, 'label'),
            medianDelta: Fields::nullableFloat($market, 'median_delta'),
            marketTone: Fields::nullableString($market, 'tone'),
            favorite: Fields::bool($data, 'favorite'),
            viewed: Fields::bool($data, 'viewed'),
            sourceRef: $sourceRef === null ? null : SourceRef::fromArray($sourceRef),
        );
    }

    /**
     * The v1 array `fromArray()` reads back into an equal preview: scalars and arrays only, for a cache that refuses
     * objects (AM-120; the radar previews of WP-45). The texts are already masked, and masking again changes nothing.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'number' => $this->number,
            'origin' => $this->origin->value,
            'deal' => $this->deal?->value,
            'type' => $this->type?->value,
            'title' => $this->title,
            'price' => $this->price?->toArray(),
            'rooms' => $this->rooms,
            'area_total' => $this->areaTotal,
            'floor' => $this->floor,
            'floors_total' => $this->floorsTotal,
            'district' => $this->districtName === null ? null : ['code' => $this->districtCode, 'name' => $this->districtName],
            'place' => $this->place,
            'landmark' => $this->landmark,
            'metro' => $this->metroName === null ? null : ['name' => $this->metroName, 'km' => $this->metroKm],
            'center_km' => $this->centerKm,
            'location' => $this->location?->toArray(),
            'photos' => ['preview' => $this->photosPreview, 'count' => $this->photosCount, 'cover' => $this->photosCover],
            'has_video' => $this->hasVideo,
            'pets_ok' => $this->petsOk,
            'is_owner' => $this->isOwner,
            'owner_verified' => $this->ownerVerified,
            'posted' => ['label' => $this->postedLabel, 'when' => $this->postedWhen, 'at' => $this->postedAt],
            'status_text' => $this->statusText,
            'market' => ['label' => $this->marketLabel, 'median_delta' => $this->medianDelta, 'tone' => $this->marketTone],
            'favorite' => $this->favorite,
            'viewed' => $this->viewed,
            'source_ref' => $this->sourceRef?->toArray(),
        ];
    }

    /**
     * The same preview with HOMI's per-user flags (the overlay of `25` §4.5): a favourites list marks every item a
     * favourite, the history every item viewed.
     */
    public function withFlags(?bool $favorite = null, ?bool $viewed = null): self
    {
        return clone ($this, ['favorite' => $favorite ?? $this->favorite, 'viewed' => $viewed ?? $this->viewed]);
    }

    /**
     * The same preview of an author HOMI's votes mark as a realtor (the overlay of WP-42, step 4): not an owner's, and
     * not a verified owner's either, so HOMI's mark wins over a source's «Проверенный хозяин» (the Mini App's badge reads
     * `owner_verified` before `is_owner`).
     */
    public function asRealtors(): self
    {
        return clone ($this, ['isOwner' => false, 'ownerVerified' => false]);
    }
}
