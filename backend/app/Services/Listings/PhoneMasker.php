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
 * - A link (`https://…`, `http://…`) and a link written without a scheme (`t.me/…`, `telegram.me/…`, `wa.me/…`,
 *   `api.whatsapp.com/…`) is cut out of the text first and the text between the links is masked. A link `LinkGuard`
 *   keeps (read as `https`) stays as written, so a post link keeps its channel and post id; any other link keeps only
 *   its last two digits (`wa.me/**********21`): a WhatsApp link, a Telegram phone link or a link with nine digits.
 * - A number may follow anything but a digit or `+`: a slash (`+998…/+998…`) or asterisks (Markdown bold) too.
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
     * A number starts after anything but a digit or `+`, and never on the two digits that end a masked one
     * (`** *** ** NN`), so masking a masked text changes nothing: without the second rule, `NN` and the digits after it
     * could make a second number. Only that fixed tail counts, so a number after other asterisks (`**Тел:** +998 …`,
     * Markdown bold) or after a slash is still masked.
     */
    private const string NOT_AFTER_MASK = '(?<![\d+])(?<!\*\* \*\*\* \*\* )';

    /** A link, or a link of Telegram or WhatsApp written without a scheme, up to the next whitespace. */
    private const string LINK = '~(?:https?://|(?:www\.)?(?:t|telegram|wa)\.me/|api\.whatsapp\.com/)\S*~iu';

    /** Up to two separators between digit groups, never a line break. */
    private const string SEPARATOR = '[ \t\-._()]{0,2}';

    /** The seven digits after the code: three, then two and two, or four. */
    private const string SUBSCRIBER = '\d{3}'.self::SEPARATOR.'(?:\d{2}'.self::SEPARATOR.'\d{2}|\d{4})';

    /**
     * @param  list<string>  $codes  the codes a number without a prefix may start with; tests add the synthetic `00`
     */
    public static function mask(#[\SensitiveParameter] string $text, array $codes = self::CODES): string
    {
        if (preg_match_all(self::LINK, $text, $links, PREG_OFFSET_CAPTURE) === 0) {
            return self::maskText($text, $codes);
        }

        $masked = '';
        $at = 0;

        foreach ($links[0] as [$link, $offset]) {
            $masked .= self::maskText(substr($text, $at, $offset - $at), $codes).self::maskLink($link);
            $at = $offset + strlen($link);
        }

        return $masked.self::maskText(substr($text, $at), $codes);
    }

    /**
     * The numbers of a text without links.
     *
     * @param  list<string>  $codes
     */
    private static function maskText(#[\SensitiveParameter] string $text, array $codes): string
    {
        if ($text === '') {
            return '';
        }

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

    /**
     * A link as written when `LinkGuard` keeps it (a link without a scheme or with `http` is judged as `https`), else
     * with every digit but the last two replaced by `*`. A masked link has two digits left, so it masks to itself.
     */
    private static function maskLink(#[\SensitiveParameter] string $link): string
    {
        $judged = 'https://'.(string) preg_replace('~^https?://~i', '', $link);

        return LinkGuard::safe($judged) !== null ? $link : (string) preg_replace('/\d(?=(?:\D*\d){2})/u', '*', $link);
    }

    private static function lastTwo(#[\SensitiveParameter] string $number): string
    {
        return substr(self::digits($number), -2);
    }

    private static function digits(#[\SensitiveParameter] string $number): string
    {
        return (string) preg_replace('/\D/', '', $number);
    }
}
