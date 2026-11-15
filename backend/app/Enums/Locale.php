<?php

namespace App\Enums;

use App\Services\Sources\Data\Fields;

/** The languages of `/api/v1` (CF-006: `uz` is the only Uzbek code on this surface; `uz_Latn` lives only inside the legacy driver). */
enum Locale: string
{
    case Ru = 'ru';
    case Uz = 'uz';
    case En = 'en';

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
