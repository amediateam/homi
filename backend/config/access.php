<?php

/*
|--------------------------------------------------------------------------
| Access to the Mini App (WP-40)
|--------------------------------------------------------------------------
| The tokens of a Telegram sign-in (ADR-0003): Sanctum personal access tokens named `miniapp` with the
| abilities `app:read` and `app:write` only. `token_ttl_minutes` is their lifetime; a user holds at most
| `max_tokens` unexpired ones, and a new sign-in revokes the oldest. Expired tokens are pruned daily
| (`sanctum:prune-expired --hours=24`, routes/console.php).
|
| The access gate (`App\Services\Access\AccessGate`) decides on the sign-in and on every bearer route:
| - `mode`: `private` (only the owners), `invite` (admitted users only; WP-52 admits through an invite) or `open`
|   (everyone). A missing or unknown value is `private`, so a server without the key fails closed (DEC-43: the
|   servers set `open`).
| - `max_seats`: in `open` mode, how many users may be admitted; each first admission writes a grant under a lock
|   that counts the admitted grants. Blank means no limit, and then no grant row is written; `0` admits nobody new,
|   and so does any other value that is not a whole number (a mistyped limit fails closed).
| - `owner_telegram_ids`: the Telegram ids that always pass (`private` mode lets in only them), comma-separated.
| - `require_chat`: refuse with `join` a user whose chat with the bot is not active. Off: radar writes have their own
|   `no_chat` check.
| - `paused`: the whole service is on pause (DEC-60): sign-in and every bearer route answer `reason: paused`, except
|   for team accounts (DEC-106); the public methods keep answering. Off unless a pause is needed.
| A value that cannot be read is the safe default: never an exception on a bearer route.
*/

$seats = env('ACCESS_MAX_SEATS');
$owners = env('ACCESS_OWNER_TELEGRAM_IDS');

return [
    'token_ttl_minutes' => 1440,

    'max_tokens' => 5,

    'mode' => env('ACCESS_MODE', 'private'),

    'max_seats' => match (true) {
        $seats === null, is_string($seats) && trim($seats) === '' => null,
        is_string($seats) && ctype_digit(trim($seats)) => (int) trim($seats),
        default => 0,
    },

    'owner_telegram_ids' => array_values(array_map(
        intval(...),
        array_filter(
            array_map(trim(...), explode(',', is_scalar($owners) ? (string) $owners : '')),
            fn (string $id): bool => ctype_digit($id) && (int) $id > 0,
        ),
    )),

    'require_chat' => false,

    'paused' => filter_var(env('ACCESS_PAUSED', false), FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? false,
];
