<?php

namespace App\Services\Listings;

/**
 * The one masker of phone numbers in listing texts (WP-12, DEC-52): the card never shows an author's number, only its
 * last two digits; `POST /listings/{number}/contact` is the one method that gives the number.
 *
 * - An Uzbek number — `+998`, `998` or `8` in front, or a known operator or city code (`CODES`) alone; its digits
 *   grouped as code, three and two and two (or four), separated by spaces, hyphens, dots, underscores or brackets —
 *   becomes `+998 ** *** ** NN`.
 * - Any other number written with `+` and 10 to 15 digits becomes `+** *** ** NN`.
 * - Prices, areas, floors, dates and post numbers stay: a number without a prefix needs a known code, a grouping of a
 *   phone, and it must not end in `000` (`900 000 000`, `950000000 сум` are prices).
 *
 * The masked form is fixed (`MASKED_PATTERN`), so a client can find a masked number in a text (WP-26), and masking a
 * masked text changes nothing. `AuthorLabel` (WP-44) and `PiiMasker` (WP-55) take the patterns from here.
 */
final class PhoneMasker
{
    /** Operator codes of the mobile networks and the area codes of the regions of Uzbekistan. */
    public const array CODES = [
        '20', '33', '50', '55', '77', '88', '90', '91', '93', '94', '95', '97', '98', '99',
        '61', '62', '65', '66', '67', '69', '70', '71', '72', '73', '74', '75', '76', '79',
    ];

    /** A masked number as this class writes it. */
    public const string MASKED_PATTERN = '/\+(?:998 )?\*\* \*\*\* \*\* \d{2}/';

    /**
     * No number starts on the two digits that end a masked one (`** *** ** NN`), so masking a masked text changes
     * nothing: without it, `NN` and the digits after it could make a second number. Only that fixed tail counts, so
     * a number after other asterisks (`**Тел:** +998 …`, Markdown bold) is still masked.
     */
    private const string NOT_AFTER_MASK = '(?<![\d+*\/])(?<!\*\* \*\*\* \*\* )';

    /** Up to two separators between digit groups, never a line break. */
    private const string SEPARATOR = '[ \t\-._()]{0,2}';

    /** The seven digits after the code: three, then two and two, or four. */
    private const string SUBSCRIBER = '\d{3}'.self::SEPARATOR.'(?:\d{2}'.self::SEPARATOR.'\d{2}|\d{4})';

    /**
     * @param  list<string>  $codes  the codes a number without a prefix may start with; tests add the synthetic `00`
     */
    public static function mask(string $text, array $codes = self::CODES): string
    {
        $prefixed = '/'.self::NOT_AFTER_MASK.'(?:\+998|998|8)'.self::SEPARATOR.'\d{2}'.self::SEPARATOR.self::SUBSCRIBER.'(?!\d)/u';
        $foreign = '/'.self::NOT_AFTER_MASK.'\+(?!998)\d(?:'.self::SEPARATOR.'\d){9,14}(?!\d)/u';
        $bare = '/'.self::NOT_AFTER_MASK.'\(?(?:'.implode('|', array_map(fn (string $code): string => preg_quote($code, '/'), $codes)).')\)?'
            .self::SEPARATOR.self::SUBSCRIBER.'(?!\d)/u';

        $text = (string) preg_replace_callback($prefixed, fn (array $match): string => '+998 ** *** ** '.self::lastTwo($match[0]), $text);
        $text = (string) preg_replace_callback($foreign, fn (array $match): string => '+** *** ** '.self::lastTwo($match[0]), $text);

        return (string) preg_replace_callback($bare, fn (array $match): string => str_ends_with(self::digits($match[0]), '000')
            ? $match[0]
            : '+998 ** *** ** '.self::lastTwo($match[0]), $text);
    }

    private static function lastTwo(string $number): string
    {
        return substr(self::digits($number), -2);
    }

    private static function digits(string $number): string
    {
        return (string) preg_replace('/\D/', '', $number);
    }
}
