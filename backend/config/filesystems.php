<?php

/*
|--------------------------------------------------------------------------
| Filesystem disks
|--------------------------------------------------------------------------
|
| Media roles (public / private / tmp) are resolved through config/media.php,
| which names a disk per role. Locally the roles map to the three local disks
| below (ADR-0012: no MinIO in development; cdn.homi.loc serves storage/app/public).
| In staging/production they map to the three S3 disks (MinIO at s3.hc.uz,
| ADR-0011), one bucket per role so Local, Staging and Production never share
| a writable bucket (master prompt §7.6).
|
*/

$s3 = [
    'driver' => 's3',
    'key' => env('AWS_ACCESS_KEY_ID'),
    'secret' => env('AWS_SECRET_ACCESS_KEY'),
    'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    'endpoint' => env('AWS_ENDPOINT'),
    'use_path_style_endpoint' => (bool) env('AWS_USE_PATH_STYLE_ENDPOINT', true),
    'throw' => false,
    'report' => false,
];

return [

    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [

        // Private files: never reachable through the CDN; read via signed temporary URLs.
        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        // Public media: served by the CDN host in every environment (ADR-0012).
        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim((string) env('MEDIA_PUBLIC_URL', rtrim((string) env('APP_URL', 'http://localhost'), '/').'/storage'), '/'),
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        // Raw uploads before validation/processing; pruned by media:prune-tmp.
        'tmp' => [
            'driver' => 'local',
            'root' => storage_path('app/tmp'),
            'throw' => false,
            'report' => false,
        ],

        's3_public' => $s3 + [
            'bucket' => env('MEDIA_PUBLIC_BUCKET'),
            'url' => rtrim((string) env('MEDIA_PUBLIC_URL', ''), '/') ?: null,
            'visibility' => 'public',
        ],

        's3_private' => $s3 + [
            'bucket' => env('MEDIA_PRIVATE_BUCKET'),
        ],

        's3_tmp' => $s3 + [
            'bucket' => env('MEDIA_TMP_BUCKET'),
        ],

    ],

    /*
    | public/storage is not used: cdn.homi.loc reads storage/app/public directly (ADR-0012).
    */
    'links' => [],

];
