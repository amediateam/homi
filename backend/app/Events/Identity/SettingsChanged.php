<?php

namespace App\Events\Identity;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A user changed settings (WP-40): `SettingsService::patch()` dispatches it after the change is committed, with the
 * keys of `PATCH /settings` that were sent, in the order of the contract. The bot (the language of its menu and
 * texts) and the delivery planner (WP-46) listen later. It carries the internal user id only.
 */
final class SettingsChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /** @param  list<string>  $keys  a non-empty subset of `UserSettingsData::KEYS` */
    public function __construct(public readonly int $userId, public readonly array $keys) {}
}
