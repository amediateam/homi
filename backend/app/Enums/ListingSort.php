<?php

namespace App\Enums;

/** The order of `GET /listings` (WP-12, BR-APP-023). `new` is the default. */
enum ListingSort: string
{
    case New = 'new';
    case Cheap = 'cheap';
    case Expensive = 'expensive';
    case Deal = 'deal';
    case Center = 'center';
    case Ppm = 'ppm';
}
