<?php

/*
|--------------------------------------------------------------------------
| Author contacts (WP-42; WP-43 and WP-44 read the rest)
|--------------------------------------------------------------------------
| `author_key_secret` (`AUTHOR_KEY_SECRET`): the key of the HMAC-SHA-256 that turns an author's phone number into the
| pseudonymous `phone:` author key of `listing_refs` (`App\Services\Listings\AuthorKey`). Random, at least 32 bytes,
| different per environment, and never changed once keys are stored: a new secret gives every author a new key, so
| blocks and votes filed under the old one stop matching. Blank, or shorter than 32 bytes, means no `phone:` key is
| derived (an HMAC with a short key could be reversed over the phone space): a card with a phone is then filed under
| no author key at all, never under its source channel — many authors post in one channel, and blocking one of them
| must not hide the others — and a warning is logged at most once a minute. A phone that is not one number is filed
| under no key either; a `source:` key is only for a card without a phone.
|
| A blank env value is the default, as if the key were absent: `.env.example` lists the name with a blank value.
*/

$value = static function (string $key, mixed $default): mixed {
    $raw = env($key);

    return $raw === null || (is_string($raw) && trim($raw) === '') ? $default : $raw;
};

return [
    'author_key_secret' => (string) $value('AUTHOR_KEY_SECRET', ''),
];
