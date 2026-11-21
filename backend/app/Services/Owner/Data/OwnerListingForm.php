<?php

namespace App\Services\Owner\Data;

use App\Enums\Currency;
use App\Services\Sources\Data\Fields;

/** The form of an owner listing (WP-80): every key present, `null` = not set. `lat`/`lon` are the true point. */
final readonly class OwnerListingForm
{
    /** The keys of the form, in the documented order (`PATCH` takes any subset of them). */
    public const array KEYS = [
        'city', 'district_code', 'landmark', 'lat', 'lon', 'room', 'rooms', 'area_m2', 'floor', 'floors_total', 'price',
        'currency', 'renovation', 'furniture', 'tenants', 'pets', 'description',
    ];

    /** Who the owner lets to; empty = anyone. Not the filter's `Tenant`: the cabinet has its own vocabulary. */
    public const array TENANTS = ['family', 'students', 'girls', 'boys', 'foreigners'];

    /** @param  list<string>  $tenants */
    public function __construct(
        public ?string $city,
        public ?string $districtCode,
        public ?string $landmark,
        public ?float $lat,
        public ?float $lon,
        public bool $room,
        public ?int $rooms,
        public ?float $areaM2,
        public ?int $floor,
        public ?int $floorsTotal,
        public ?int $price,
        public Currency $currency,
        public ?string $renovation,
        public ?bool $furniture,
        public array $tenants,
        public ?bool $pets,
        public ?string $description,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            city: Fields::nullableString($data, 'city'),
            districtCode: Fields::nullableString($data, 'district_code'),
            landmark: Fields::nullableString($data, 'landmark'),
            lat: Fields::nullableFloat($data, 'lat'),
            lon: Fields::nullableFloat($data, 'lon'),
            room: Fields::bool($data, 'room'),
            rooms: Fields::nullableInt($data, 'rooms'),
            areaM2: Fields::nullableFloat($data, 'area_m2'),
            floor: Fields::nullableInt($data, 'floor'),
            floorsTotal: Fields::nullableInt($data, 'floors_total'),
            price: Fields::nullableInt($data, 'price'),
            currency: Currency::tryFrom(Fields::string($data, 'currency')) ?? throw new \InvalidArgumentException('The field "currency" must be USD or UZS.'),
            renovation: Fields::nullableString($data, 'renovation'),
            furniture: Fields::nullableBool($data, 'furniture'),
            tenants: array_map(fn (string $tenant): string => in_array($tenant, self::TENANTS, true) ? $tenant : throw new \InvalidArgumentException('Unknown tenant "'.$tenant.'".'), Fields::strings($data, 'tenants')),
            pets: Fields::nullableBool($data, 'pets'),
            description: Fields::nullableString($data, 'description'),
        );
    }
}
