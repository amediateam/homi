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
 */
final class LinkGuard
{
    /** Hosts whose links open a chat with a phone number. */
    private const array PHONE_HOSTS = ['wa.me', 'www.wa.me', 'api.whatsapp.com'];

    /** Telegram's hosts, whose `/+…` links name a phone number. */
    private const array TELEGRAM_HOSTS = ['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'];

    private function __construct() {}

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
            || (in_array($host, self::TELEGRAM_HOSTS, true) && str_starts_with($path, '/+'))
            || preg_match('/\d{9,}/', $flat) === 1) {
            return null;
        }

        return $url;
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
