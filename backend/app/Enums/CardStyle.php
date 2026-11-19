<?php

namespace App\Enums;

use App\Services\Sources\Data\Fields;

/**
 * How the bot sends a listing card into the user's chat (`03` SCR-048, DEC-57): `classic` is a photo with a caption,
 * `rich` is the newer card with swipeable photos and the data as a table.
 */
enum CardStyle: string
{
    case Classic = 'classic';
    case Rich = 'rich';

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
