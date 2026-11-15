<?php

namespace App\Enums;

/** The languages of `/api/v1` (CF-006: `uz` is the only Uzbek code on this surface; `uz_Latn` lives only inside the legacy driver). */
enum Locale: string
{
    case Ru = 'ru';
    case Uz = 'uz';
    case En = 'en';
}
