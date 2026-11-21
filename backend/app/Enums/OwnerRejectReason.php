<?php

namespace App\Enums;

/**
 * Why a listing is rejected (WP-80, DEV-056): `denied` the number is on the operators' deny list, `limit` the number had
 * its listings at the confirmation.
 */
enum OwnerRejectReason: string
{
    case Denied = 'denied';
    case Limit = 'limit';
}
