<?php

namespace App\Enums;

/**
 * An owner's answer to a request (WP-80, BR-API-180).
 */
enum OwnerRequestAction: string
{
    case Give = 'give';
    case Decline = 'decline';
    case ReasonFound = 'reason_found';
    case ReasonAgent = 'reason_agent';
    case Undo = 'undo';
    case Late = 'late';
}
