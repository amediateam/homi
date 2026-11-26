<?php

namespace App\Enums;

/**
 * Why the access gate refuses a user (`403 access_denied`, `reason`). The client shows an unknown or missing reason
 * as `private` (BR-APP-054). `paused` says that the whole service is on pause and will be back (legacy release
 * `index-CIa0Ldj2.js`); the server switch `ACCESS_PAUSED` sets it (WP-40), and the stub scenario `access_paused`
 * answers it on stubs.
 */
enum AccessReason: string
{
    case Private = 'private';
    case Invite = 'invite';
    case Full = 'full';
    case Blocked = 'blocked';
    case Join = 'join';
    case Paused = 'paused';
}
