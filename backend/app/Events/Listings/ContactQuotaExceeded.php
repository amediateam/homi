<?php

namespace App\Events\Listings;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * A user asked for the numbers of more distinct listings in one Tashkent day than `contacts.hard_limit` (WP-43,
 * SEC-REQ-028, SEC-REQ-048): `ContactDisclosure` flags the account and dispatches this once per user and day, for the
 * monitoring alert. It decides nothing; blocking stays an operator action. It carries the internal user id, how many
 * listings were asked for that day and the day (`Y-m-d` in Asia/Tashkent) — never a phone number or a Telegram id.
 */
final class ContactQuotaExceeded
{
    use Dispatchable;

    public function __construct(public readonly int $userId, public readonly int $asked, public readonly string $day) {}
}
