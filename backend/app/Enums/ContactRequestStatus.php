<?php

namespace App\Enums;

/**
 * The status of a seeker's request (WP-80): the owner side sees all six; the seeker never sees `agent`, which reads as
 * `declined` for him (`forSeeker()`).
 */
enum ContactRequestStatus: string
{
    case Pending = 'pending';
    case Given = 'given';
    case Declined = 'declined';
    case Agent = 'agent';
    case Expired = 'expired';
    case Cancelled = 'cancelled';

    /** The status the seeker sees: `agent` reads as `declined`. */
    public function forSeeker(): self
    {
        return $this === self::Agent ? self::Declined : $this;
    }
}
