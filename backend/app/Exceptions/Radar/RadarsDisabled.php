<?php

namespace App\Exceptions\Radar;

use App\Exceptions\ApiException;
use Throwable;

/**
 * Radars are switched off (DEC-51): `config('radar.creation_enabled')` is false, so no radar is created or
 * changed. Thrown by `EnsureRadarsEnabled` before validation or any lookup; `GET /radars` answers `[]` and `DELETE`
 * works meanwhile.
 */
final class RadarsDisabled extends ApiException
{
    public function __construct(string $message = 'Radars are not available yet.', ?Throwable $previous = null)
    {
        parent::__construct($message, 403, 'radars_disabled', previous: $previous);
    }
}
