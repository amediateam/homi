<?php

namespace App\Services\Listings;

use Carbon\CarbonImmutable;

/**
 * A call link of HOMI (WP-43, variant A): the address of the call page with its signed token, and when it stops being
 * valid. The address is a capability — whoever holds it sees the author's number until it expires — so it is never
 * logged or cached; it goes only into the answer of `POST …/contact`.
 */
final readonly class CallLink
{
    public function __construct(#[\SensitiveParameter] public string $url, public CarbonImmutable $expiresAt) {}
}
