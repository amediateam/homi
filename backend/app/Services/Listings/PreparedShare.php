<?php

namespace App\Services\Listings;

/** A prepared inline message of HOMI's bot (WP-12, API-017): its id for `WebApp.shareMessage` and when it expires. */
final readonly class PreparedShare
{
    public function __construct(public string $id, public string $expiresAt) {}
}
