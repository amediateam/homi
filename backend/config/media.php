<?php

/*
|--------------------------------------------------------------------------
| Media module (master prompt §7, ADR-0012)
|--------------------------------------------------------------------------
|
| Pipeline: Upload → Validate → Store (content-addressed original) → Process
| (WebP variants on the `media` queue) → Publish (CDN URL) → Deliver.
|
*/

return [

    // Disk per role. Local: public / local / tmp. Staging & production: s3_public / s3_private / s3_tmp.
    'disks' => [
        'public' => env('MEDIA_PUBLIC_DISK', 'public'),
        'private' => env('MEDIA_PRIVATE_DISK', 'local'),
        'tmp' => env('MEDIA_TMP_DISK', 'tmp'),
    ],

    // Base URL of the public CDN host; the same key layout exists in every environment.
    'public_url' => rtrim((string) env('MEDIA_PUBLIC_URL', ''), '/'),

    // Validation limits for images (master prompt §7.4).
    'max_bytes' => (int) env('MEDIA_MAX_BYTES', 25 * 1024 * 1024),
    'max_dimension' => (int) env('MEDIA_MAX_DIMENSION', 8000),
    'allowed_mimes' => [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ],

    // Variant widths (no upscaling) and WebP quality. Few sizes on purpose (§7.4).
    'variants' => [320, 640, 1024, 1920],
    'webp_quality' => (int) env('MEDIA_WEBP_QUALITY', 80),

    // Key layout; immutable caching relies on content-addressed names.
    'paths' => [
        'originals' => 'originals',
        'derived' => 'derived',
        'uploads' => 'uploads',
    ],

    'temporary_url_minutes' => (int) env('MEDIA_TEMPORARY_URL_MINUTES', 10),
    'presign_minutes' => (int) env('MEDIA_PRESIGN_MINUTES', 15),

    'queue' => 'media',

];
