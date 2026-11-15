<?php

namespace App\Enums;

/** What a listing offers (`types[]` of the filters, `type` of a listing; WP-12, BR-API-028). */
enum PropertyType: string
{
    case Apartment = 'apartment';
    case House = 'house';
    case Room = 'room';
    case Commercial = 'commercial';
    case Land = 'land';

    /**
     * The types a deal offers, in this order (BR-API-028, BR-APP-005).
     *
     * @return list<self>
     */
    public static function forDeal(Deal $deal): array
    {
        return match ($deal) {
            Deal::RentLong => [self::Apartment, self::House, self::Room, self::Commercial],
            Deal::RentDaily => [self::Apartment, self::House, self::Room],
            Deal::Sale => [self::Apartment, self::House, self::Commercial, self::Land],
        };
    }
}
