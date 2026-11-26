<?php

namespace App\Enums;

/**
 * What the access gate decided for a user (WP-40, `App\Services\Access\AccessGate`): `granted`, or the refusal that
 * the client shows on its no-access screen (`403 access_denied` with the `AccessReason` of the same value).
 */
enum AccessState: string
{
    case Granted = 'granted';
    case Private = 'private';
    case Invite = 'invite';
    case Full = 'full';
    case Blocked = 'blocked';
    case Join = 'join';
    case Paused = 'paused';

    /** The reason of the refusal, or null when access is granted. */
    public function reason(): ?AccessReason
    {
        return $this === self::Granted ? null : AccessReason::from($this->value);
    }
}
