<?php

namespace App\Services\Sources\Legacy;

use JsonException;

/**
 * The cursor of the legacy feed (WP-42, "Feed paging and top-up"): `l1.` + base64url (no padding) of
 * `{"c": <legacy cursor of the page to resume, null for the first>, "o": <position in that page to resume from>}`.
 *
 * It comes back from the client and its `c` goes on to legacy, so `decode()` refuses anything it did not write: more
 * than `MAX_BYTES`, another prefix (a stub cursor after a flag switch), a character outside base64url, a body that is
 * not a JSON object of exactly `c` (a non-empty string of at most `MAX_LEGACY_BYTES` bytes, or `null`) and `o` (a whole
 * number ≥ 0 below `MAX_OFFSET`). The feed answers such a cursor with an empty page and a `null` cursor.
 *
 * The caps agree: legacy's cursor is at most `MAX_LEGACY_BYTES` (a longer one is a contract error of the feed page,
 * `ListingSummaryTranslator::page()`), and such a cursor without JSON escapes encodes in at most 365 bytes, inside
 * `MAX_BYTES`. One whose escapes (`"`, `\`, control characters) push it past `MAX_BYTES` ends the list with a logged
 * contract error (`LegacyListingSource`), never a cursor the client could not send back.
 */
final readonly class LegacyFeedCursor
{
    public const string PREFIX = 'l1.';

    /** The longest cursor taken back, as `ListingFeedRequest` allows. */
    public const int MAX_BYTES = 512;

    /** The longest legacy cursor passed on (`next_cursor` of a legacy feed page). */
    public const int MAX_LEGACY_BYTES = 256;

    /** A position in a legacy page is below this; legacy pages hold 20. */
    public const int MAX_OFFSET = 100;

    public function __construct(public ?string $legacy, public int $offset) {}

    public function encode(): string
    {
        $json = json_encode(['c' => $this->legacy, 'o' => $this->offset], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return self::PREFIX.rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
    }

    /** The cursor, or `null` for one this feed did not give. */
    public static function decode(string $cursor): ?self
    {
        if (strlen($cursor) > self::MAX_BYTES || ! str_starts_with($cursor, self::PREFIX)) {
            return null;
        }

        $body = substr($cursor, strlen(self::PREFIX));
        $json = preg_match('/^[A-Za-z0-9_-]+$/D', $body) === 1 ? base64_decode(strtr($body, '-_', '+/'), true) : false;

        if ($json === false) {
            return null;
        }

        try {
            $data = json_decode($json, true, 2, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        if (! is_array($data) || count($data) !== 2 || ! array_key_exists('c', $data) || ! array_key_exists('o', $data)) {
            return null;
        }

        ['c' => $legacy, 'o' => $offset] = $data;

        if (($legacy !== null && (! is_string($legacy) || $legacy === '' || strlen($legacy) > self::MAX_LEGACY_BYTES))
            || ! is_int($offset) || $offset < 0 || $offset >= self::MAX_OFFSET) {
            return null;
        }

        return new self($legacy, $offset);
    }
}
