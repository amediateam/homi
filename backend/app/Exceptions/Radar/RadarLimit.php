<?php

namespace App\Exceptions\Radar;

use App\Exceptions\ApiException;
use Throwable;

/**
 * Creating or switching on a radar would exceed `limits.radars` of `GET /reference` (WP-13), or a new radar would exceed
 * the total cap `radar.max_total` (DEC-113, `total()`); the message names the limit that was reached.
 */
final class RadarLimit extends ApiException
{
    public function __construct(public readonly int $limit, ?Throwable $previous = null, public readonly bool $total = false)
    {
        parent::__construct($total ? "You can have at most {$limit} radars." : "You can have at most {$limit} active radars.", 409, 'radar_limit', previous: $previous);
    }

    /** The total cap of a user's radars, switched on and paused together, was reached. */
    public static function total(int $limit): self
    {
        return new self($limit, total: true);
    }
}
