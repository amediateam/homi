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
|   asked again; `fill_wait_ms` (`LEGACY_CACHE_FILL_WAIT_MS`) how long a request waits for another request that is
|   filling the same cold entry before it reads legacy itself (0: it never waits).
| - `media`: `public_url` is HOMI's proxy of the legacy photos (`LEGACY_MEDIA_PUBLIC_URL`, for example
|   `https://<media host>/lm`); blank means photo lists are empty. `hosts` are the legacy hosts whose absolute photo
|   addresses are rewritten too (a relative `/media/…` address always is): `LEGACY_MEDIA_HOSTS`, comma-separated,
|   else the host of `base_url`.
| - `contact` (WP-43): `mode` (`LEGACY_CONTACT_MODE`) is what the service key gets for a contact (Q-API-062, WP-02
|   point 7): `phone` — the raw number in the card (variant A: HOMI issues its own call link), `link` — only a call
|   link (variant B: `GET /api/listings/{id}/call`), `auto` (default) — decided per card: a phone that reads as one
|   number is variant A, else a call link variant B, else no contact; any other value is `auto`. `link_ttl`: seconds
|   a legacy call link is answered as valid (`expires_at` of variant B). `link_hosts` (`LEGACY_CONTACT_LINK_HOSTS`,
|   comma-separated, lower-cased): the hosts besides that of `base_url` an absolute call link of variant B may point
|   to, compared exactly, each `host` (port 443) or `host:port` (1…65535; any other form adds nothing); blank means
|   only the host of `base_url`, on its own port (443 when it names none). A link to another host or port is refused
|   with a warning naming that host when it is a host name without a run of seven digits (else `host_invalid`), at
|   most once a minute per host. A relative link is joined to the origin of `base_url`.
| - `translation` (WP-43): how `POST /api/listings/{id}/translate` names the target language under the service key
|   (WP-02 point 8, open): `via` (`LEGACY_TRANSLATION_VIA`) `locale` (default) — the language selector of every call
|   (`locale` above; while that sends no language, `locale.via` neither `header` nor `query`, translation is
|   `unsupported`, with a warning at most once a minute), `query` or `body` — the legacy code (`uz_Latn`, `en`) under
|   `name` (`LEGACY_TRANSLATION_NAME`, default `lang`) in the query string or the JSON body, `unsupported` — legacy is
|   not asked and the method answers `503 translation_unavailable`; any other value is `locale`. `cache.translation`:
|   seconds a translation is kept per listing, locale and effective selector (`TranslationService`, 0 disables).
| - `fields.author_key`: the name of the card field that carries a stable author key, once the operator offers one
|   (WP-02 point 6); blank means none.
| - `previews.concurrency`: card previews read in parallel; `previews.max_wait_ms` (`LEGACY_PREVIEWS_MAX_WAIT_MS`): the
|   limiter wait one batch of previews may spend in all (DEC-110: a personal list of 20 waits for every preview rather
|   than losing some); `previews.background_wait_ms` (`LEGACY_PREVIEWS_BACKGROUND_WAIT_MS`): the same for a background
|   batch, which waits for its share's places instead of failing at once; `previews.deadline_ms`
|   (`LEGACY_PREVIEWS_DEADLINE_MS`): the most one batch may take in all, waits, retries and HTTP timeouts included —
|   blank, 0 or not a number means 12 000, below the 15 s after which the Mini App gives a request up, so HOMI
|   answers first; each pooled request then times out by the deadline, before one `timeout`; `feed.top_up_pages`:
|   extra legacy pages one feed page may read when HOMI's own exclusions shrink it below half.
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
$mediaHosts = $value('LEGACY_MEDIA_HOSTS', null);
$timeout = 15;
$previewsWait = $value('LEGACY_PREVIEWS_MAX_WAIT_MS', 4000);
$previewsWait = is_numeric($previewsWait) && (int) $previewsWait >= 0 ? (int) $previewsWait : 4000;
$backgroundWait = $value('LEGACY_PREVIEWS_BACKGROUND_WAIT_MS', 2000);
$previewsDeadline = $value('LEGACY_PREVIEWS_DEADLINE_MS', null);
$fillWait = $value('LEGACY_CACHE_FILL_WAIT_MS', 1000);
$contactMode = strtolower(trim((string) $value('LEGACY_CONTACT_MODE', 'auto')));
$contactLinkHosts = (string) $value('LEGACY_CONTACT_LINK_HOSTS', '');
$translationVia = strtolower(trim((string) $value('LEGACY_TRANSLATION_VIA', 'locale')));

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

    'timeout' => $timeout,
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
        'translation' => 86_400,
        'fill_wait_ms' => is_numeric($fillWait) && (int) $fillWait >= 0 ? (int) $fillWait : 1000,
        'last_good' => 86_400,
        'after_failure' => 60,
    ],

    'media' => [
        'public_url' => rtrim((string) $value('LEGACY_MEDIA_PUBLIC_URL', ''), '/'),
        'hosts' => is_string($mediaHosts)
            ? array_values(array_filter(array_map(fn (string $host): string => strtolower(trim($host)), explode(',', $mediaHosts)), fn (string $host): bool => $host !== ''))
            : (is_string($baseHost) && $baseHost !== '' ? [strtolower($baseHost)] : []),
    ],

    'contact' => [
        'mode' => in_array($contactMode, ['auto', 'phone', 'link'], true) ? $contactMode : 'auto',
        'link_ttl' => 600,
        'link_hosts' => array_values(array_filter(array_map(fn (string $host): string => strtolower(trim($host)), explode(',', $contactLinkHosts)), fn (string $host): bool => $host !== '')),
    ],

    'translation' => [
        'via' => in_array($translationVia, ['locale', 'query', 'body', 'unsupported'], true) ? $translationVia : 'locale',
        'name' => trim((string) $value('LEGACY_TRANSLATION_NAME', 'lang')),
    ],

    'fields' => [
        'author_key' => '',
    ],

    'previews' => [
        'concurrency' => 5,
        'max_wait_ms' => $previewsWait,
        'background_wait_ms' => is_numeric($backgroundWait) && (int) $backgroundWait >= 0 ? (int) $backgroundWait : 2000,
        'deadline_ms' => is_numeric($previewsDeadline) && (int) $previewsDeadline > 0 ? (int) $previewsDeadline : 12_000,
    ],

    'feed' => [
        'top_up_pages' => 2,
    ],

    'fake' => $fake === null
        ? in_array(env('APP_ENV', 'production'), ['local', 'testing'], true)
        : filter_var($fake, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? false,
];
