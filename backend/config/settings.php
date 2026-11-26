<?php

/*
|--------------------------------------------------------------------------
| User settings (WP-11; WP-40 adds the defaults)
|--------------------------------------------------------------------------
| The option lists of `GET /api/v1/settings`. Quiet and digest hours are whole hours of Asia/Tashkent
| wall-clock; the presets are the ones the legacy bot offers (task KV-BE-045, C-03). `PATCH` accepts only
| these presets.
|
| `defaults` are the settings of a new user (WP-40). The language is not among them: it follows the
| launch's Telegram language (`LocaleResolver`), and it is not marked chosen. The quiet hours, the digest
| hours and the card style are a specification choice: the legacy default is unknown (for the card style
| Q-API-067). Each default must be one of the options above.
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

    'defaults' => [
        'currency' => 'USD',
        'theme' => 'auto',
        'city' => null,
        // [from, to], or null for off.
        'quiet_hours' => [23, 8],
        'digest_hours' => [9],
        'card_style' => 'classic',
    ],
];
