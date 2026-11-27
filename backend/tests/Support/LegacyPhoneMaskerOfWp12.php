<?php

namespace Tests\Support;

/**
 * A frozen copy of the masker WP-12 shipped (`origin/main:backend/app/Services/Listings/PhoneMasker.php`, commit
 * `4b39f32`), kept only for the tests of WP-42: the masker of WP-42 must never be weaker than this one (review of
 * `ec369f2`, point 1), so `PhoneMaskerTest` runs both over the same texts and checks that no number this masker
 * replaced is left in the new masker's output. Its patterns are WP-12's, unchanged; `mask()` also lists, through
 * `$replaced`, the numbers it replaced, as written. Never used by the application.
 */
final class LegacyPhoneMaskerOfWp12
{
    /** WP-12's operator codes of the mobile networks and the area codes of the regions of Uzbekistan. */
    public const array CODES = [
        '20', '33', '50', '55', '77', '88', '90', '91', '93', '94', '95', '97', '98', '99',
        '61', '62', '65', '66', '67', '69', '70', '71', '72', '73', '74', '75', '76', '79',
    ];

    /** Up to two separators between digit groups, never a line break. */
    private const string SEPARATOR = '[ \t\-._()]{0,2}';

    /** The seven digits after the code: three, then two and two, or four. */
    private const string SUBSCRIBER = '\d{3}'.self::SEPARATOR.'(?:\d{2}'.self::SEPARATOR.'\d{2}|\d{4})';

    /**
     * WP-12's `PhoneMasker::mask()`.
     *
     * @param  list<string>  $codes
     * @param  list<string>|null  $replaced  the numbers replaced, as written, in the order they were replaced
     *
     * @param-out list<string> $replaced
     */
    public static function mask(string $text, array $codes = self::CODES, ?array &$replaced = null): string
    {
        $replaced = [];
        $prefixed = '/(?<![\d+*\/])(?:\+998|998|8)'.self::SEPARATOR.'\d{2}'.self::SEPARATOR.self::SUBSCRIBER.'(?!\d)/u';
        $foreign = '/(?<![\d+*\/])\+(?!998)\d(?:'.self::SEPARATOR.'\d){9,14}(?!\d)/u';
        $bare = '/(?<![\d+*\/])\(?(?:'.implode('|', array_map(fn (string $code): string => preg_quote($code, '/'), $codes)).')\)?'
            .self::SEPARATOR.self::SUBSCRIBER.'(?!\d)/u';

        $text = (string) preg_replace_callback($prefixed, function (array $match) use (&$replaced): string {
            $replaced[] = $match[0];

            return '+998 ** *** ** '.self::lastTwo($match[0]);
        }, $text);
        $text = (string) preg_replace_callback($foreign, function (array $match) use (&$replaced): string {
            $replaced[] = $match[0];

            return '+** *** ** '.self::lastTwo($match[0]);
        }, $text);

        return (string) preg_replace_callback($bare, function (array $match) use (&$replaced): string {
            if (str_ends_with(self::digits($match[0]), '000')) {
                return $match[0];
            }

            $replaced[] = $match[0];

            return '+998 ** *** ** '.self::lastTwo($match[0]);
        }, $text);
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
