<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    /*
    | HOMI: bearer-token API (ADR-0003) — no cookie auth, so no credentials and no csrf-cookie path.
    | Origins are explicit per environment (CORS_ALLOWED_ORIGINS, comma-separated), never '*'.
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Accept-Language', 'Authorization', 'Content-Type', 'X-Requested-With', 'Idempotency-Key'],

    'exposed_headers' => ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],

    'max_age' => 7200,

    'supports_credentials' => false,

];
