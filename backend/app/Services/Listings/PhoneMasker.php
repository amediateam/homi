<?php

namespace App\Services\Listings;

/**
 * The one masker of phone numbers in listing texts (WP-12, DEC-52): the card never shows an author's number, only its
 * last two digits; `POST /listings/{number}/contact` is the one method that gives the number.
 *
 * - An Uzbek number — `+998`, `998` or `8` in front, or a known operator or city code (`CODES`) alone; its digits
 *   grouped as code, three and two and two (or four), with up to three separators between groups (`SEPARATORS`:
 *   spaces, the no-break and thin spaces, hyphens and dashes, the minus sign, dots, underscores and brackets) —
 *   becomes `+998 ** *** ** NN`.
 * - Any other number written with `+` and 10 to 15 digits becomes `+** *** ** NN`.
 * - Prices, areas, floors, dates and post numbers stay: a number without a prefix needs a known code, a grouping of a
 *   phone, and it must not end in `000` (`900 000 000`, `950000000 сум` are prices). A slash and a comma are not
 *   separators (`3/9`, `54/30`, `1,200,000`).
 * - A number without `+` starts after anything but a digit or `+`: a slash (`+998…/+998…`) or asterisks (Markdown
 *   bold) too. A `+` starts a number wherever it stands (`кв45+998…`, `++998…`).
 * - Fullwidth digits (`９９８…`) are read as ASCII digits and written as ASCII; the fullwidth plus stays a sign like any
 *   other, so it never turns a number of WP-12's into a `+` number of another length.
 *
 * Two passes, repeated until the text no longer changes:
 *
 * 1. The numbers of the whole text, links included, so no link can hide a number glued to it
 *    (`https://t.me/chan,тел:(00) 765-43-21`).
 * 2. The links (`https://…`, `http://…`, and `t.me/…`, `telegram.me/…`, `wa.me/…`, `api.whatsapp.com/…` without a
 *    scheme, up to the next whitespace or masked number): a link `LinkGuard` keeps (read as `https`) stays as written,
 *    so a post link keeps its channel and post id; any other link keeps only its last two digits
 *    (`https://instagram.com/p/C********90/`): a WhatsApp link, a Telegram phone link, a link with nine digits.
 *
 * Every change of a round leaves fewer digits, so the rounds end; the last one changes nothing, so masking a masked
 * text changes nothing either (idempotent), and the masked form is fixed (`MASKED_PATTERN`), so a client can find a
 * masked number in a text (WP-26). A later round reads what an earlier one uncovered: the two digits a link kept
 * when a number is glued to them (`wa.me/**00 765 43 21`), and the last two digits of a masked number as the code of
 * the next (`+998 00 765 43 00 765 43 21`), as WP-12's masker did in one go. So no masked number needs a guard, and
 * WP-12's masker hides nothing this one leaves (the test pins it against a frozen copy). A text not settled after
 * `MAX_ROUNDS` rounds — only a long chain of numbers each glued to the last two digits of the one before settles that
 * slowly — has every digit masked, which is final too. A text that is not UTF-8, or that a pattern cannot read, has
 * every digit masked as well. `AuthorLabel` (WP-44) and `PiiMasker` (WP-55) take the patterns from here; `LinkGuard`
 * and `AuthorKey` take `SEPARATORS` and `asciiDigits()`.
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
     * The characters between the digit groups of a written number, as the body of a `/u` character class: space, tab,
     * no-break space (U+00A0), thin space (U+2009), narrow no-break space (U+202F), hyphen-minus, the hyphens and
     * dashes U+2010 … U+2014, the minus sign (U+2212), dot, underscore and brackets. Never a line break, a slash or a
     * comma.
     */
    public const string SEPARATORS = ' \t\-._()\x{00A0}\x{2009}\x{202F}\x{2010}-\x{2014}\x{2212}';

    /** Up to three separators between digit groups. */
    private const string SEPARATOR = '['.self::SEPARATORS.']{0,3}';

    /** The seven digits after the code: three, then two and two, or four. */
    private const string SUBSCRIBER = '\d{3}'.self::SEPARATOR.'(?:\d{2}'.self::SEPARATOR.'\d{2}|\d{4})';

    /** A number without `+` never starts right after a digit or a `+`. */
    private const string NOT_AFTER_DIGIT = '(?<![\d+])';

    /** A link, or a link of Telegram or WhatsApp without a scheme, up to the next whitespace or masked number. */
    private const string LINK = '~(?:https?://|(?:www\.)?(?:t|telegram|wa)\.me/|api\.whatsapp\.com/)(?:(?!\+(?:998 )?\*\* )\S)*~iu';

    /** The rounds a text may take to settle; real texts take one or two (the second only confirms). */
    private const int MAX_ROUNDS = 16;

    /** The fullwidth digits, as ASCII. */
    private const array FULLWIDTH = [
        '０' => '0', '１' => '1', '２' => '2', '３' => '3', '４' => '4', '５' => '5', '６' => '6', '７' => '7', '８' => '8', '９' => '9',
    ];

    /**
     * @param  list<string>  $codes  the codes a number without a prefix may start with; tests add the synthetic `00`
     */
    public static function mask(#[\SensitiveParameter] string $text, array $codes = self::CODES): string
    {
        $text = self::asciiDigits($text);

        if (preg_match('//u', $text) !== 1) {
            return self::everyDigit($text);
        }

        $patterns = self::patterns($codes);

        for ($round = 0; $round < self::MAX_ROUNDS; $round++) {
            $masked = self::maskLinks(self::maskNumbers($text, $patterns));

            if ($masked === null) {
                return self::everyDigit($text);
            }

            if ($masked === $text) {
                return $text;
            }

            $text = $masked;
        }

        return self::everyDigit($text);
    }

    /** The text with its fullwidth digits written in ASCII. */
    public static function asciiDigits(#[\SensitiveParameter] string $text): string
    {
        return strtr($text, self::FULLWIDTH);
    }

    /**
     * The three patterns of a number: with `+998`, `998` or `8`; another country's with `+`; a bare code.
     *
     * @param  list<string>  $codes
     * @return array{prefixed: string, foreign: string, bare: string}
     */
    private static function patterns(array $codes): array
    {
        $bareCodes = implode('|', array_map(fn (string $code): string => preg_quote($code, '/'), $codes));

        return [
            'prefixed' => '/(?:\+998|'.self::NOT_AFTER_DIGIT.'(?:998|8))'.self::SEPARATOR.'\d{2}'.self::SEPARATOR.self::SUBSCRIBER.'(?!\d)/u',
            'foreign' => '/\+(?!998)\d(?:'.self::SEPARATOR.'\d){9,14}(?!\d)/u',
            'bare' => '/'.self::NOT_AFTER_DIGIT.'\(?(?:'.$bareCodes.')\)?'.self::SEPARATOR.self::SUBSCRIBER.'(?!\d)/u',
        ];
    }

    /**
     * Pass 1: the numbers of the whole text, `null` when a pattern fails.
     *
     * @param  array{prefixed: string, foreign: string, bare: string}  $patterns
     */
    private static function maskNumbers(#[\SensitiveParameter] string $text, array $patterns): ?string
    {
        $text = preg_replace_callback($patterns['prefixed'], fn (array $match): string => '+998 ** *** ** '.self::lastTwo($match[0]), $text);
        $text = $text === null ? null : preg_replace_callback($patterns['foreign'], fn (array $match): string => '+** *** ** '.self::lastTwo($match[0]), $text);

        return $text === null ? null : self::maskBare($patterns['bare'], $text);
    }

    /**
     * The bare numbers of a text, `null` when the pattern fails. A match that ends in `000` is a price and stays, and
     * the search goes on from its next character, not from its end: a price must not hide a number that starts inside
     * it (`/00   9990000 45`).
     */
    private static function maskBare(string $pattern, #[\SensitiveParameter] string $text): ?string
    {
        $masked = '';
        $copied = 0;
        $from = 0;

        while (($found = preg_match($pattern, $text, $match, PREG_OFFSET_CAPTURE, $from)) === 1) {
            [$number, $at] = $match[0];

            if (str_ends_with(self::digits($number), '000')) {
                $from = $at + strlen(mb_substr($number, 0, 1));

                continue;
            }

            $masked .= substr($text, $copied, $at - $copied).'+998 ** *** ** '.self::lastTwo($number);
            $copied = $from = $at + strlen($number);
        }

        return $found === false ? null : $masked.substr($text, $copied);
    }

    /** Pass 2: the links of the text, `null` when the pattern fails (or was given `null`). */
    private static function maskLinks(#[\SensitiveParameter] ?string $text): ?string
    {
        return $text === null ? null : preg_replace_callback(self::LINK, fn (array $match): string => self::maskLink($match[0]), $text);
    }

    /**
     * A link as written when `LinkGuard` keeps it (a link without a scheme or with `http` is judged as `https`), else
     * with every digit but the last two replaced by `*`. A masked link has two digits left, so it masks to itself.
     */
    private static function maskLink(#[\SensitiveParameter] string $link): string
    {
        $judged = 'https://'.(string) preg_replace('~^https?://~i', '', $link);

        return LinkGuard::safe($judged) !== null ? $link : (string) preg_replace('/\d(?=(?:\D*\d){2})/u', '*', $link);
    }

    /** A text the patterns cannot read (not UTF-8, or a pattern failed) with every digit replaced by `*`. */
    private static function everyDigit(#[\SensitiveParameter] string $text): string
    {
        return (string) preg_replace('/[0-9]/', '*', $text);
    }

    private static function lastTwo(#[\SensitiveParameter] string $phone): string
    {
        return substr(self::digits($phone), -2);
    }

    private static function digits(#[\SensitiveParameter] string $phone): string
    {
        return (string) preg_replace('/\D/', '', $phone);
    }
}
