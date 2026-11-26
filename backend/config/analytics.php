<?php

/*
|--------------------------------------------------------------------------
| Product analytics (WP-40; WP-47 extends this file)
|--------------------------------------------------------------------------
| `client` is what `GET /api/v1/me` tells the Mini App's PostHog client under `analytics`, next to the
| user's own `distinct_id` (`users.analytics_distinct_id`): whether it captures clicks by itself, whether
| it records the session, and the share of sessions it records. No env keys yet.
*/

return [
    'client' => [
        'autocapture' => true,
        'replay' => false,
        'replay_rate' => 0.0,
    ],
];
