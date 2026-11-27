<?php

namespace App\Services\Personal;

use App\Services\Listings\PhoneMasker;

/**
 * The plain-text label of a blocked author (WP-44; task `KV-BE-041`, BR-DATA-028, BR-DATA-029), stored with the entry
 * when it is made:
 *
 * - A phone author: the number in memory masked by WP-12's `PhoneMasker` — `+998 ** *** ** NN`, another country's
 *   `+** *** ** NN` — when the whole result is that masked form (`ofPhone()`). The source that holds the number masks
 *   it (`ListingSource::authorPhoneLabel()`), so the number itself never leaves the source, and is never stored, logged
 *   or returned.
 * - No such number (contact variant B of WP-43 keeps none; a phone the masker cannot read as one number): the
 *   source's own label, masked again and reduced to digits, `+`, `*` and spaces, of which the first masked number is
 *   kept — so a name, an address or a stray digit never reaches the label — else `HIDDEN_PHONE`.
 * - A source author: `@` and the channel, reduced to the characters of a Telegram handle.
 *
 * No label holds more than the last two digits of a phone or any markup, and every label fits the 64 characters of
 * `blocked_authors.label`.
 */
final class AuthorLabel
{
    /** The label of a phone author whose last two digits are not known. */
    public const string HIDDEN_PHONE = '+998 ** *** ** **';

    /** The width of `blocked_authors.label`. */
    private const int MAX_LENGTH = 64;

    /** One phone number masked as `PhoneMasker` writes it, or `null` when the masker does not read it whole as one. */
    public static function ofPhone(#[\SensitiveParameter] ?string $phone): ?string
    {
        return $phone === null ? null : self::whole(PhoneMasker::mask(trim($phone)));
    }

    /**
     * The label of a phone author: the masked number the source gave (`ofPhone()`), else the source's own label
     * reduced to its first masked number, else `HIDDEN_PHONE`.
     */
    public static function phone(?string $masked, #[\SensitiveParameter] ?string $sourceLabel): string
    {
        return ($masked === null ? null : self::whole($masked)) ?? self::fromSourceLabel($sourceLabel);
    }

    public static function source(string $channel): string
    {
        return '@'.mb_substr((string) preg_replace('/[^A-Za-z0-9_]/', '', $channel), 0, self::MAX_LENGTH - 1);
    }

    /** The text when it is one masked number and nothing else, else `null`. */
    private static function whole(#[\SensitiveParameter] string $text): ?string
    {
        return preg_match('/^'.trim(PhoneMasker::MASKED_PATTERN, '/').'$/D', $text) === 1 ? $text : null;
    }

    /** The first masked number of the source's label, masked again and reduced; `HIDDEN_PHONE` when it holds none. */
    private static function fromSourceLabel(#[\SensitiveParameter] ?string $sourceLabel): string
    {
        if ($sourceLabel === null) {
            return self::HIDDEN_PHONE;
        }

        $reduced = trim((string) preg_replace('/ {2,}/', ' ', (string) preg_replace('/[^0-9+* ]/', '', PhoneMasker::mask($sourceLabel))));

        return preg_match(PhoneMasker::MASKED_PATTERN, $reduced, $match) === 1 ? $match[0] : self::HIDDEN_PHONE;
    }
}
