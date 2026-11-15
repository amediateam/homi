<?php

namespace App\Enums;

/**
 * Why the access gate refuses a user (`403 access_denied`, `reason`). The client shows an unknown or missing reason
 * as `private` (BR-APP-054).
 */
enum AccessReason: string
{
    case Private = 'private';
    case Invite = 'invite';
    case Full = 'full';
    case Blocked = 'blocked';
    case Join = 'join';
}
