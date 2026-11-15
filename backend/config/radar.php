<?php

/*
|--------------------------------------------------------------------------
| Radars (WP-11; WP-45 extends this file)
|--------------------------------------------------------------------------
| `creation_enabled`: radars cannot be created or changed until the bot can deliver them (DEC-51).
| `GET /api/v1/reference` reports it as `radars_enabled`. Staging and production leave
| RADAR_CREATION_ENABLED unset until WP-57; the local stack and the tests set it to true.
*/

return [
    'max' => (int) env('RADAR_MAX', 10),
    'creation_enabled' => (bool) env('RADAR_CREATION_ENABLED', false),
];
