<?php

namespace App\Enums;

enum IntakeEventStatus: string
{
    /** Stored raw; normalisation has not run yet (no Listings module in Phase 3). */
    case Received = 'received';
    case Processed = 'processed';
    case Failed = 'failed';
    /** Older than the version HOMI already holds for this listing; kept for audit, never applied. */
    case Stale = 'stale';
}
