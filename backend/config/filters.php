<?php

/*
|--------------------------------------------------------------------------
| Search filters (WP-12, SearchFiltersNormaliser)
|--------------------------------------------------------------------------
| The switches stay off while the behaviour changes are not approved (DEC-36):
| - `strict_combinations` (DEV-004): a combination that cannot exist (a type of another deal, a key of another deal,
|   two geography modes, both pet filters, a zone of a city without zones) is rejected instead of normalised;
| - `inverted_range` (DEV-025): `min > max` is rejected instead of swapped;
| - `radar_without_posted_days` (DEV-005): a radar's filters drop `posted_days`.
|
| The limits bound every number and list of the filters (SEC-REQ-017).
*/

return [
    'strict_combinations' => false,
    'inverted_range' => false,
    'radar_without_posted_days' => false,

    'limits' => [
        'rooms' => [0, 10],
        'price' => [1, 9007199254740991],
        'area' => [1, 10000],
        'posted_days' => [1, 3, 7],
        'polygon_vertices' => [3, 40],
        'polygon_decimals' => 5,
        'polygon_length' => 2000,
        'list_items' => 100,
        'code_length' => 64,
    ],
];
