<?php

/*
|--------------------------------------------------------------------------
| The legacy API behind the `legacy` source driver (WP-41, `25` §4.5)
|--------------------------------------------------------------------------
| Only HOMI's servers call legacy, with a service key that exists in the server environment of staging and production
| only (DEC-33, DEC-42): the repository, CI and developer machines never see it. The key's header, routes and limits
| are the operator's specification (Q-API-059, Q-API-060); until the operator answers (WP-02), the defaults below are
| the "default built without the answer". When the answer comes, only env values or these defaults change.
|
| - `service_key`: blank means the driver is unavailable; there is never an anonymous call. With `fake` on, a blank
|   key is replaced by a placeholder so the auth header is still sent to the fixtures.
| - `auth`: the header that carries the key and the text before it (for example `Bearer `, quoted in the env file).
| - `locale`, `currency`: how a request selects them — `header`, `query` or `none` — and the header or query name.
| - `rate`: one outbound limiter for every legacy call; a user request waits at most `max_wait_ms` for the next
|   one-second bucket, a background caller (the radar matcher, cache warmers) uses at most `background_share` of a
|   bucket and never waits.
| - `breaker`: `failures` consecutive failures inside `window` seconds open it for `open_for` seconds; a `429` opens
|   it for its `Retry-After`, at most `open_max`.
| - `cache`: seconds; `last_good` is how long a last good answer of `GET /reference` and `GET /cities` is served
|   while legacy fails (RK-25), and `after_failure` how long a failed refresh of either is not tried again. The
|   listings (WP-42): `card` per number, locale and currency; `count` per filters and locale, `flow` and `map` per
|   filters, locale and currency (0 disables each); `not_found` how long a number legacy answered `404` for is not
|   asked again.
| - `media`: `public_url` is HOMI's proxy of the legacy photos (`LEGACY_MEDIA_PUBLIC_URL`, for example
|   `https://<media host>/lm`); blank means photo lists are empty. `hosts` are the legacy hosts whose absolute photo
|   addresses are rewritten too (a relative `/media/…` address always is): the host of `base_url`.
| - `fields.author_key`: the name of the card field that carries a stable author key, once the operator offers one
|   (WP-02 point 6); blank means none.
| - `previews.concurrency`: card previews read in parallel; `feed.top_up_pages`: extra legacy pages one feed page may
|   read when HOMI's own exclusions shrink it below half.
| - `fake`: answer from `resources/fixtures/legacy` instead of the network. On by default in `local` and `testing`,
|   off elsewhere; `SourceServiceProvider` refuses to boot with it in production.
|
| A blank env value is the default, as if the key were absent: `.env.example` lists the names with blank values.
*/

$value = static function (string $key, mixed $default): mixed {
    $raw = env($key);

    return $raw === null || (is_string($raw) && trim($raw) === '') ? $default : $raw;
};

$fake = $value('LEGACY_FAKE', null);
$ratePerSecond = $value('LEGACY_RATE_PER_SECOND', 5);
$baseUrl = rtrim((string) $value('LEGACY_API_URL', 'https://legacy.invalid'), '/');
$baseHost = parse_url($baseUrl, PHP_URL_HOST);

return [
    'base_url' => $baseUrl,

    'service_key' => (string) $value('LEGACY_SERVICE_KEY', ''),

    'auth' => [
        'header' => (string) $value('LEGACY_AUTH_HEADER', 'X-Service-Key'),
        'prefix' => (string) $value('LEGACY_AUTH_PREFIX', ''),
    ],

    'locale' => [
        'via' => (string) $value('LEGACY_LOCALE_VIA', 'header'),
        'name' => (string) $value('LEGACY_LOCALE_NAME', 'Accept-Language'),
    ],

    'currency' => [
        'via' => (string) $value('LEGACY_CURRENCY_VIA', 'none'),
        'name' => (string) $value('LEGACY_CURRENCY_NAME', 'currency'),
    ],

    'timeout' => 15,
    'connect_timeout' => 5,

    'retry' => [
        'times' => 1,
        'sleep_ms' => 200,
    ],

    'rate' => [
        'per_second' => is_numeric($ratePerSecond) && (int) $ratePerSecond > 0 ? (int) $ratePerSecond : 5,
        'max_wait_ms' => 500,
        'background_share' => 0.4,
    ],

    'breaker' => [
        'failures' => 5,
        'window' => 30,
        'open_for' => 30,
        'open_max' => 300,
    ],

    'cache' => [
        'reference' => 600,
        'cities' => 600,
        'card' => 60,
        'count' => 30,
        'flow' => 60,
        'map' => 30,
        'not_found' => 60,
        'last_good' => 86_400,
        'after_failure' => 60,
    ],

    'media' => [
        'public_url' => rtrim((string) $value('LEGACY_MEDIA_PUBLIC_URL', ''), '/'),
        'hosts' => is_string($baseHost) && $baseHost !== '' ? [strtolower($baseHost)] : [],
    ],

    'fields' => [
        'author_key' => '',
    ],

    'previews' => [
        'concurrency' => 5,
    ],

    'feed' => [
        'top_up_pages' => 2,
    ],

    'fake' => $fake === null
        ? in_array(env('APP_ENV', 'production'), ['local', 'testing'], true)
        : filter_var($fake, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? false,
];
