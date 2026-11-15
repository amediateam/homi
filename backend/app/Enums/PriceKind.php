<?php

namespace App\Enums;

/**
 * The label kind of a price (BR-API-156): a down payment of an instalment sale, or the price of a business with its
 * premises rented out (since legacy release `index-Dbpp463V.js`). Any other legacy value becomes null (Q-API-065).
 */
enum PriceKind: string
{
    case DownPayment = 'down_payment';
    case Business = 'business';
}
