<?php

namespace App\Enums;

/** The three deals of the product: long-term rent, daily rent, sale. Keys of every per-deal object of `/api/v1`. */
enum Deal: string
{
    case RentLong = 'rent_long';
    case RentDaily = 'rent_daily';
    case Sale = 'sale';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $deal): string => $deal->value, self::cases());
    }
}
