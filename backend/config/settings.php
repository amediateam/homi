<?php

/*
|--------------------------------------------------------------------------
| User settings (WP-11; WP-40 adds the defaults)
|--------------------------------------------------------------------------
| The option lists of `GET /api/v1/settings`. Quiet and digest hours are whole hours of Asia/Tashkent
| wall-clock; the presets are the ones the legacy bot offers (task KV-BE-045, C-03). `PATCH` accepts only
| these presets.
*/

return [
    // Each language under its own name, the same in every interface language.
    'locales' => [
        'ru' => 'Русский',
        'uz' => 'Oʻzbekcha',
        'en' => 'English',
    ],

    // Currency names per interface language.
    'currencies' => [
        'USD' => ['ru' => 'Доллары', 'uz' => 'AQSH dollari', 'en' => 'US dollars'],
        'UZS' => ['ru' => 'Сумы', 'uz' => 'Soʻm', 'en' => 'Uzbek soums'],
    ],

    // null = off; [from, to] may cross midnight.
    'quiet_hours' => [null, [22, 8], [23, 8], [0, 9], [23, 7]],

    'digest_hours' => [[9], [9, 19], [12, 20], [19]],
];
