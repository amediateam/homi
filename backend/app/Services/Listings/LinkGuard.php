<?php

namespace App\Services\Listings;

/**
 * The links a listing card may carry from the author's post (WP-42, DEC-52): `contact.contact_url`, `offers[].url`,
 * `original.url`, `sources[].url` and `price_history[].url`. A link is kept only when it is `https` and cannot carry a
 * phone number, so no number reaches the card through a link either. Pure.
 *
 * Dropped: any scheme but `https` (`tel:`, `http:`); a WhatsApp link (`wa.me`, `api.whatsapp.com`); a Telegram phone
 * link (`t.me/+…`, `telegram.me/+…`); and any link with nine digits in a row once it is percent-decoded and the
 * separators a number is written with are left out (whitespace, `-`, `.`, `_`, `(`, `)`, `+`), so
 * `https://wa.me/+998-00-765-43-21` and `…?phone=%2B998%2000…` are caught whatever their host; and a link that does
 * not decode to valid UTF-8, which cannot be checked. A slash is not such a separator: a post link keeps its channel
 * and post id apart (`https://t.me/chan_2024/1234567` is kept).
 *
 * `safeName()` is the same rule for a channel or author name a card shows (`source_ref.channel`, `sources[].handle`,
 * `price_history[].channel`): a name that holds nine digits or more, wherever they stand (`@998901234567`,
 * `ivan_998_90_123_45_67`), could be a phone number and is never shown. A Telegram link whose channel is such a name
 * is dropped too.
 */
final class LinkGuard
{
    /** Hosts whose links open a chat with a phone number. */
    private const array PHONE_HOSTS = ['wa.me', 'www.wa.me', 'api.whatsapp.com'];

    /** Telegram's hosts, whose `/+…` links name a phone number. */
    private const array TELEGRAM_HOSTS = ['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'];

    /** The digits a name may hold: with nine it could be a phone number. */
    private const int NAME_DIGITS_MAX = 8;

    private function __construct() {}

    /** The channel or author name when a card may show it, else `null`. */
    public static function safeName(?string $name): ?string
    {
        return $name === null || preg_match_all('/\d/', $name) > self::NAME_DIGITS_MAX ? null : $name;
    }

    /** The link when a card may carry it, else `null`. */
    public static function safe(?string $url): ?string
    {
        if ($url === null || preg_match('~^https://[^\s/?#@]+(?:[/?#]\S*)?$~i', $url) !== 1) {
            return null;
        }

        $decoded = self::decoded($url);
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = (string) parse_url($decoded, PHP_URL_PATH);
        $flat = preg_replace('/[\s\-._()+]+/u', '', $decoded);

        if ($flat === null
            || in_array($host, self::PHONE_HOSTS, true)
            || (in_array($host, self::TELEGRAM_HOSTS, true) && (str_starts_with($path, '/+') || self::safeName(self::channelOf($path)) === null))
            || preg_match('/\d{9,}/', $flat) === 1) {
            return null;
        }

        return $url;
    }

    /** The channel of a Telegram path (`/<channel>/…` or `/s/<channel>/…`), `''` without one. */
    private static function channelOf(string $path): string
    {
        $segments = explode('/', trim($path, '/'));

        return $segments[0] === 's' ? $segments[1] ?? '' : $segments[0];
    }

    /** The link percent-decoded until it no longer changes (at most three rounds: a link encoded twice is caught). */
    private static function decoded(string $url): string
    {
        for ($round = 0; $round < 3; $round++) {
            $next = rawurldecode($url);

            if ($next === $url) {
                break;
            }

            $url = $next;
        }

        return $url;
    }
}
