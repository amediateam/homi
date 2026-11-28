<?php

/*
| The `relaxed` hint of a radar write (WP-45, `RadarRelaxOptions`, BR-APP-044): when the radar found nothing and has no
| way to widen it, how often listings of its search appear — «≈N в день» from one a day, else «N за неделю». The words
| of the Mini App's radar tile (`alert.day`, `alert.week` of the legacy catalogue), in the locale of the write.
*/

return [
    'relaxed' => [
        'day' => 'Kuniga ≈:n',
        'week' => 'Haftasiga :n',
    ],
];
