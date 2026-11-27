<?php

namespace App\Events\Listings;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * A user was given the author's number of a listing (WP-43, DEC-52): `ContactService::disclose()` dispatches it once
 * per answer of `POST /listings/{number}/contact` (`channel` = `app`) or of the bot's «Показать номер» (`bot`, WP-53),
 * never for a refused or failed request. WP-47 writes the action-log row from it; until then it has no listener. It
 * carries the internal user id and the listing number only — never the number given, the call link or a Telegram id.
 */
final class ContactDisclosed
{
    use Dispatchable;

    public function __construct(public readonly int $userId, public readonly int $number, public readonly string $channel) {}
}
