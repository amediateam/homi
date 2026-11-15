<?php

namespace App\Enums;

use App\Services\Sources\Data\Fields;

/** The display currencies of the product. Prices in the reference data are whole USD whatever the user's currency. */
enum Currency: string
{
    case Usd = 'USD';
    case Uzs = 'UZS';

    /**
     * The value of `$key` in decoded JSON; fails loudly on a missing or unknown value.
     *
     * @param  array<array-key, mixed>  $data
     */
    public static function fromField(array $data, string $key): self
    {
        return self::from(Fields::string($data, $key));
    }
}
