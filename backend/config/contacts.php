<?php

/*
|--------------------------------------------------------------------------
| Author contacts (WP-42, WP-43; WP-44 reads the rest)
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
| HOMI's call links (WP-43, `App\Services\Listings\CallLinkService`): `call_link_signing_key`
| (`CALL_LINK_SIGNING_KEY`) signs the token of `<call_page_base>/call/<token>`; random, at least 32 bytes, different
| per environment. `call_link_signing_key_previous` (`CALL_LINK_SIGNING_KEY_PREVIOUS`) is still accepted while set,
| for a rotation (blank otherwise). Blank or shorter than 32 bytes: in `local` and `testing` a key derived from
| `app.key` is used; elsewhere no link is issued (`POST …/contact` answers `503 source_unavailable`, with a warning at
| most once a minute). `call_link_ttl`: seconds a link is valid (verified with 60 s more for clock skew).
| `call_page_base`: the origin of the call page; `null` means `app.url` (the API host, where the route lives).
|
| The disclosure quota (WP-43, `App\Services\Listings\ContactDisclosure`, SEC-REQ-028): `soft_limit`
| (`CONTACT_SOFT_LIMIT`) distinct listings a user gets a number for per Tashkent day, `hard_limit`
| (`CONTACT_HARD_LIMIT`) distinct listings asked for that flag the account for an operator. A whole number of at least
| 1; anything else (blank, 0, a word) is `null`, which switches that limit off. The values are a product decision
| (DEC-19, Q-SEC-003): the servers start with both blank.
|
| A blank env value is the default, as if the key were absent: `.env.example` lists the names with blank values.
*/

$value = static function (string $key, mixed $default): mixed {
    $raw = env($key);

    return $raw === null || (is_string($raw) && trim($raw) === '') ? $default : $raw;
};

$limit = static function (string $key) use ($value): ?int {
    $raw = $value($key, null);

    if (is_int($raw)) {
        return $raw >= 1 ? $raw : null;
    }

    return is_string($raw) && preg_match('/^\s*[1-9]\d{0,8}\s*$/', $raw) === 1 ? (int) $raw : null;
};

return [
    'author_key_secret' => (string) $value('AUTHOR_KEY_SECRET', ''),

    'call_link_signing_key' => (string) $value('CALL_LINK_SIGNING_KEY', ''),
    'call_link_signing_key_previous' => (string) $value('CALL_LINK_SIGNING_KEY_PREVIOUS', ''),
    'call_link_ttl' => 600,
    'call_page_base' => null,

    'soft_limit' => $limit('CONTACT_SOFT_LIMIT'),
    'hard_limit' => $limit('CONTACT_HARD_LIMIT'),
];
