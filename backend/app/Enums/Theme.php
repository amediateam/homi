<?php

namespace App\Enums;

use App\Services\Sources\Data\Fields;

/** The colour theme a user chose; `auto` follows Telegram. */
enum Theme: string
{
    case Auto = 'auto';
    case Light = 'light';
    case Dark = 'dark';

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
