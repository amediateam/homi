<?php

/*
|--------------------------------------------------------------------------
| Radars (WP-11, WP-45)
|--------------------------------------------------------------------------
| - `max` (RADAR_MAX): how many radars a user may have switched on (`limit_scope`); `GET /reference` reports it as
|   `limits.radars`. A positive whole number; blank or anything else means 10. Lowering it keeps the radars a user
|   has and refuses only new activations.
| - `creation_enabled` (RADAR_CREATION_ENABLED): radars cannot be created or changed until the bot can deliver them
|   (DEC-51). `GET /reference` reports it as `radars_enabled`. Staging and production leave it unset until WP-57; the
|   local stack and the tests set it to true.
| - `limit_scope`: `active` counts the radars that are switched on (Q-DATA-015), `total` every radar of the user.
| - `require_chat` (RADAR_REQUIRE_CHAT): a radar write that would send (create, replace, switch on, relax) answers
|   `409 no_chat` while the bot cannot write to the user (`users.bot_chat_state`). Off until the bot keeps that state
|   (WP-52) and sends the starter list (WP-54).
| - `starter_enabled` (RADAR_STARTER_ENABLED): a radar write picks the listings to send at once (`starter`). Off, the
|   starter is empty and no source is asked, so the API never says that cards are in the chat before the bot sends
|   them (WP-54).
| - `starter_window_days`, `starter_max`: the starter's listings are those of the last 3 days (the bot's «за последние
|   3 дня»; Q-API-033), at most 20.
| - `options_max`: the relax options offered when the starter is empty. `preview_ttl` (s) and `preview_budget_ms`: the
|   previews of `GET /radars?include=previews`, shared per filter set, and the time all of them may take.
|   `preview_max_rounds`: the source rounds (feed, count and flow of one filter set not in the cache) one list may
|   make, the radars switched on first; the radars past it that are not cached get no preview (no env key).
| - `author_hide_rules`: whether «Скрыть похожие» may hide an author (promised by the bot's tip, never observed).
| - `found_cooldown_days`: «Нашли жильё?» is not asked again for this long after an answer (Q-API-030).
|
| A blank env value is the default, as if the key were absent: `.env.example` lists the names with blank values.
*/

$value = static function (string $key, mixed $default): mixed {
    $raw = env($key);

    return $raw === null || (is_string($raw) && trim($raw) === '') ? $default : $raw;
};

$flag = static function (string $key) use ($value): bool {
    return filter_var($value($key, false), FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? false;
};

$max = $value('RADAR_MAX', 10);

return [
    'max' => is_int($max) && $max >= 1 ? $max : (is_string($max) && preg_match('/^\s*[1-9]\d{0,3}\s*$/', $max) === 1 ? (int) $max : 10),
    'creation_enabled' => $flag('RADAR_CREATION_ENABLED'),
    'limit_scope' => 'active',
    'require_chat' => $flag('RADAR_REQUIRE_CHAT'),
    'starter_enabled' => $flag('RADAR_STARTER_ENABLED'),
    'starter_window_days' => 3,
    'starter_max' => 20,
    'options_max' => 5,
    'preview_ttl' => 120,
    'preview_budget_ms' => 4000,
    'preview_max_rounds' => 10,
    'author_hide_rules' => false,
    'found_cooldown_days' => 30,
];
