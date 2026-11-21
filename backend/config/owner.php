<?php

/*
|--------------------------------------------------------------------------
| The owner cabinet (WP-80; WP-84 … WP-86 read the rest)
|--------------------------------------------------------------------------
| `enabled`: the switch of DEC-81. While it is off the cabinet's content is frozen (`403 owner_disabled`) and every
| way down stays open; `GET /api/v1/reference` reports it as `owner_enabled`. The servers leave
| OWNER_CABINET_ENABLED unset until DEC-81's gates; the local stack and the tests set it to true.
| `allowed_ids`: Telegram ids allowed to create, request a phone and publish while it is set (WP-84).
| `public`: native listings in the feed (WP-86); only `false` turns it off — a blank value reads as `''`, which a
| boolean cast would turn off too.
| `renovations`: the cabinet's renovation codes with a name per locale, until legacy's `owner` list is known.
| `native_number_floor`: the first number of HOMI's own listings (`App\Services\Listings\ListingNumber`).
*/

return [
    'enabled' => (bool) env('OWNER_CABINET_ENABLED', false),
    'allowed_ids' => array_values(array_map('intval', array_filter(array_map('trim', explode(',', (string) env('OWNER_CABINET_ALLOWED_IDS', ''))), static fn (string $id): bool => ctype_digit($id)))),
    'public' => env('OWNER_LISTINGS_PUBLIC') !== false,
    'limits' => [
        'listings' => 2,
        'photos' => 10,
        'requests' => ['day' => 10, 'week' => 30, 'pause_minutes' => 10],
    ],
    'renovations' => [
        ['code' => 'euro', 'name' => ['ru' => 'Евроремонт', 'uz' => 'Yevroremont', 'en' => 'Euro-style renovation']],
        ['code' => 'cosmetic', 'name' => ['ru' => 'Косметический ремонт', 'uz' => 'Kosmetik taʼmir', 'en' => 'Cosmetic repair']],
        ['code' => 'none', 'name' => ['ru' => 'Без ремонта', 'uz' => 'Taʼmirsiz', 'en' => 'No renovation']],
    ],
    'native_number_floor' => 10000000,
];
