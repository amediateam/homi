<?php

/*
|--------------------------------------------------------------------------
| Request limits of /api/v1 (WP-40, SEC-REQ-027)
|--------------------------------------------------------------------------
| The counts of the named limiters (`AppServiceProvider::configureRateLimiting()`); the period of each is fixed by
| the key's name. The starting values of SEC-REQ-027, to be tuned on staging. A bearer route counts per user
| (`user:<internal id>`, never a Telegram id), a public route per client address (`config/trustedproxy.php` says
| whose forwarded address is believed).
|
| - `auth`: `POST /auth/telegram`, per minute: `per_address` on the route (`v1-auth`), `per_user` inside the sign-in
|   once the launch is verified (`TelegramSignIn`).
| - `public`: `GET /reference`, `GET /cities`, `GET /landing/*` (`v1-public`).
| - `me`: `GET /me` (`v1-me`).
| - `reads`: the feed, count, new, flow and map, `GET /settings`, the radar list, the personal lists, the owner's
|   reads and the translation of a listing (`v1-reads`).
| - `listing`: `GET /listings/{number}`, the full card and the preview (`v1-listing`).
| - `listing_opens_per_day`: how many different full cards one user opens in 24 hours (`CountListingOpens`; DEC-104,
|   DEC-105: the preview is not counted, DEC-107: a card counted in the window opens again for free); over it
|   `429 rate_limited` with `reason: "daily"`. `RATE_LIMIT_LISTING_OPENS_PER_DAY`, kept as the environment gives it
|   (`RateLimits` reads it: a switch, a fraction, a word or a blank means the default, never a small cap).
| - `contact`, `translation`, `share`: the three card actions, per hour (`v1-contact`, `v1-share`); `translation`
|   counts only the cache misses, inside `TranslationService` (WP-43), and the route itself is read under `v1-reads`.
| - `lists`: the writes of the personal lists, the surveys and the seeker's request (`v1-lists`).
| - `reports`: `POST …/reports`, per day.
| - `radars`: the radar writes, `PATCH /settings` and `POST /settings/card-sample` (`v1-radars`).
| - `events`: `POST /events`; the excess is answered `204` and dropped (`v1-events`).
| - `media`: `GET /media/{media}` (`v1-media`).
|
| Every value is a positive whole number; one that cannot be read as such is the default of `RateLimits::DEFAULTS`,
| never an error.
*/

return [
    'auth' => [
        'per_address' => 10,
        'per_user' => 5,
    ],

    'public' => ['per_minute' => 60],

    'me' => ['per_minute' => 30],

    'reads' => ['per_minute' => 300],

    'listing' => ['per_minute' => 120],

    'listing_opens_per_day' => env('RATE_LIMIT_LISTING_OPENS_PER_DAY', 100),

    'contact' => ['per_hour' => 30],

    'translation' => ['per_hour' => 30],

    'share' => ['per_hour' => 20],

    'lists' => ['per_minute' => 60],

    'reports' => ['per_day' => 30],

    'radars' => ['per_minute' => 30],

    'events' => ['per_minute' => 60],

    'media' => ['per_minute' => 120],
];
