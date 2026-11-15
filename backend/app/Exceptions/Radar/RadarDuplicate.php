<?php

namespace App\Exceptions\Radar;

use App\Exceptions\ApiException;
use Throwable;

/**
 * The change would make the radar equal to another radar of the user (WP-13).
 */
final class RadarDuplicate extends ApiException
{
    public function __construct(string $message = 'Another radar already has these filters.', ?Throwable $previous = null)
    {
        parent::__construct($message, 409, 'radar_duplicate', previous: $previous);
    }
}
