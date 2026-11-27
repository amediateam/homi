<?php

namespace App\Events\Listings;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * A user asked for the numbers of more distinct listings in one Tashkent day than `contacts.hard_limit` (WP-43,
 * SEC-REQ-028, SEC-REQ-048): `ContactDisclosure` flags the account's grant when it has one and dispatches this once
 * per user and day either way, for the monitoring alert — for a user without a grant it is the only trace besides the
 * warning, since no row is written. It decides nothing; blocking stays an operator action. It carries the internal
 * user id, how many listings were asked for that day and the day (`Y-m-d` in Asia/Tashkent) — never a phone number or
 * a Telegram id.
 */
final class ContactQuotaExceeded
{
    use Dispatchable;

    public function __construct(public readonly int $userId, public readonly int $asked, public readonly string $day) {}
}
