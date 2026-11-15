<?php

namespace App\Enums;

/** The display currencies of the product. Prices in the reference data are whole USD whatever the user's currency. */
enum Currency: string
{
    case Usd = 'USD';
    case Uzs = 'UZS';
}
