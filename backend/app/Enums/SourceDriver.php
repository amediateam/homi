<?php

namespace App\Enums;

/**
 * Which implementation of a capability answered (ADR-0017): fixtures, the legacy service, or HOMI's own code.
 * Written to every `/api/v1` answer as `meta.source`; the client's "demo data" marker reads `stub`.
 */
enum SourceDriver: string
{
    case Stub = 'stub';
    case Legacy = 'legacy';
    case Native = 'native';
}
