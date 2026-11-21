<?php

namespace App\Enums;

/**
 * Why the last shared contact was refused (WP-80, DEV-056).
 */
enum OwnerPhoneError: string
{
    case NotUz = 'not_uz';
    case NotOwn = 'not_own';
}
