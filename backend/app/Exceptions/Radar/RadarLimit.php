<?php

namespace App\Exceptions\Radar;

use App\Exceptions\ApiException;
use Throwable;

/**
 * Creating or switching on a radar would exceed `limits.radars` of `GET /reference` (WP-13); the message names the
 * limit.
 */
final class RadarLimit extends ApiException
{
    public function __construct(public readonly int $limit, ?Throwable $previous = null)
    {
        parent::__construct("You can have at most {$limit} active radars.", 409, 'radar_limit', previous: $previous);
    }
}
