<?php

use App\Services\Listings\PhoneMasker;
use Random\Engine\Mt19937;
use Random\Randomizer;
use Tests\Support\LegacyPhoneMaskerOfWp12;

/** The synthetic code `00` joins the masker's codes, so no real operator code appears in a test or a fixture. */
function maskSynthetic(string $text): string
{
    return PhoneMasker::mask($text, [...PhoneMasker::CODES, '00']);
}

it('masks an Uzbek number in any written form down to its last two digits', function (string $written): void {
    expect(maskSynthetic("Звоните: {$written}, спросить Анну"))->toBe('Звоните: +998 ** *** ** 67, спросить Анну');
})->with([
    '+998 00 000 00 67',
    '998000000067',
    '8 00 000-00-67',
    '(00) 000 00 67',
    '00.000.00.67',
    '00_000_00_67',
    '+998 (00) 000-00-67',
    '+998-00-000-00-67',
    '000000067',
    '00 000 0067',
]);

it('masks the prefixed forms whatever the operator code', function (): void {
    expect(PhoneMasker::mask('тел +998 00 000 00 67 и 998000000068'))->toBe('тел +998 ** *** ** 67 и +998 ** *** ** 68');
});

it('needs a known code for a number without a prefix', function (): void {
    expect(PhoneMasker::mask('(00) 000 00 67'))->toBe('(00) 000 00 67')
        ->and(maskSynthetic('(00) 000 00 67'))->toBe('+998 ** *** ** 67');
});

it('masks another country\'s number written with a plus', function (string $written): void {
    expect(maskSynthetic("WhatsApp {$written}"))->toBe('WhatsApp +** *** ** 67');
})->with(['+70000000067', '+44 000 000 00 67', '+1 (000) 000-00-67']);

it('masks two numbers in one line and numbers at both ends of a text', function (): void {
    expect(maskSynthetic('+998 00 000 00 67 или 00 000 00 68'))->toBe('+998 ** *** ** 67 или +998 ** *** ** 68')
        ->and(maskSynthetic("Сдаю квартиру\nтел 998000000069"))->toBe("Сдаю квартиру\nтел +998 ** *** ** 69");
});

it('leaves prices, areas, floors, dates and post numbers alone', function (string $text): void {
    expect(maskSynthetic($text))->toBe($text);
})->with([
    '900 000 000 сум',
    '1 200 000 сум',
    '$85 000',
    '85 м²',
    '30.10 17:00',
    'этаж 8 из 9',
    't.me/stub_channel_a/4812',
    'https://t.me/stub_channel_a/48120000',
    'цена 950000000 сум',
    '18.10.2026, 2-комн., 54 м², 3/9',
    'счёт 12998000000067',
]);

it('changes nothing when masking twice', function (): void {
    $once = maskSynthetic('+998 00 000 00 67, (00) 000-00-68, +44 000 000 00 69');

    expect(maskSynthetic($once))->toBe($once)
        ->and($once)->toBe('+998 ** *** ** 67, +998 ** *** ** 68, +** *** ** 69');
});

it('writes the fixed masked form a client can find', function (): void {
    expect(preg_match(PhoneMasker::MASKED_PATTERN, maskSynthetic('a +998 00 000 00 67 b'), $match))->toBe(1)
        ->and($match[0])->toBe('+998 ** *** ** 67')
        ->and(preg_match(PhoneMasker::MASKED_PATTERN, '+** *** ** 67'))->toBe(1);
});

it('is idempotent on any text: a masked text masks to itself', function (array $codes): void {
    $random = new Randomizer(new Mt19937(42));
    $alphabet = '0123456789999888  +-()*/._';
    $failures = [];

    for ($i = 0; $i < 20_000 && count($failures) < 5; $i++) {
        $text = $random->getBytesFromString($alphabet, $random->getInt(8, 40));

        if ($random->getInt(0, 3) === 0) {
            $text = '+998 ** *** ** '.$random->getInt(10, 99).$text;
        }

        $once = PhoneMasker::mask($text, $codes);

        if (PhoneMasker::mask($once, $codes) !== $once) {
            $failures[] = $text;
        }
    }

    expect($failures)->toBe([]);
})->with([
    'the default codes' => [PhoneMasker::CODES],
    'with the synthetic 00' => [[...PhoneMasker::CODES, '00']],
]);

it('reads the last two digits of a masked number as the code of the next one, as WP-12 did, and masks to a fixed point', function (string $text, string $masked): void {
    expect(maskSynthetic($text))->toBe($masked)
        ->and(maskSynthetic($masked))->toBe($masked);
})->with([
    'a number glued to the tail of the one before' => ['Тел: 00 123 45 00 1234567 сум', 'Тел: +998 ** *** ** +998 ** *** ** 67 сум'],
    'a number after a masked one' => ['+998 ** *** ** 00)4999099', '+998 ** *** ** +998 ** *** ** 99'],
    'two numbers sharing the code, after an asterisk' => ['*00 765 43 00 765 43 21', '*+998 ** *** ** +998 ** *** ** 21'],
    'two numbers sharing the code, after a slash' => ['/00 765 43 00 765 43 21', '/+998 ** *** ** +998 ** *** ** 21'],
    'two prefixed numbers sharing the code' => ['+998 00 765 43 00 765 43 21', '+998 ** *** ** +998 ** *** ** 21'],
]);

it('lets no price hide a number that starts inside it', function (): void {
    expect(maskSynthetic('/00   9990000 45'))->toBe('/00   +998 ** *** ** 45')
        ->and(maskSynthetic('цена 950000000 сум'))->toBe('цена 950000000 сум');
});

it('masks every digit of a text that does not settle in sixteen rounds, and of a text that is not UTF-8', function (): void {
    $chain = 'x 00 765 4300'.str_repeat(' 765 4300', 20).' 765 4321';
    $masked = maskSynthetic($chain);

    expect(preg_match('/\d/', $masked))->toBe(0)
        ->and(maskSynthetic($masked))->toBe($masked)
        ->and(maskSynthetic('x 00 765 4300 765 4300 765 4321'))->toBe('x +998 ** *** ** +998 ** *** ** +998 ** *** ** 21')
        ->and(maskSynthetic("abc \xff +998007654321"))->toBe("abc \xff +************");
});

it('masks a number after other asterisks, such as Markdown bold', function (string $text, string $masked): void {
    expect(PhoneMasker::mask($text))->toBe($masked);
})->with([
    'bold label' => ['**Тел:** +998 00 765 43 21', '**Тел:** +998 ** *** ** 21'],
    'after two asterisks and a space' => ['** 998007654321', '** +998 ** *** ** 21'],
    'after a masked number and asterisks' => ['+998 ** *** ** 67 ** 998007654321', '+998 ** *** ** 67 ** +998 ** *** ** 21'],
]);

it('masks a number after a slash or asterisks, and inside a link that LinkGuard would drop (H1)', function (string $text, string $masked): void {
    expect(maskSynthetic($text))->toBe($masked)
        ->and(maskSynthetic($masked))->toBe($masked);
})->with([
    'two numbers with a slash' => ['+998007654321/+998007654322', '+998 ** *** ** 21/+998 ** *** ** 22'],
    'Markdown bold, bare code' => ['**00 765 43 21**', '**+998 ** *** ** 21**'],
    'Markdown bold, prefixed' => ['**+998 00 765 43 21**', '**+998 ** *** ** 21**'],
    'a WhatsApp link without a scheme' => ['wa.me/998007654321', 'wa.me/+998 ** *** ** 21'],
    'a WhatsApp link in a description' => ['Звоните или https://wa.me/+998007654321 пишите', 'Звоните или https://wa.me/+998 ** *** ** 21 пишите'],
    'a phone link of Telegram' => ['пишите t.me/+998007654321', 'пишите t.me/+998 ** *** ** 21'],
    'a link with the number in its query' => ['см. https://example.com/a?phone=998007654321', 'см. https://example.com/a?phone=+998 ** *** ** 21'],
    'a number glued to a link' => ['t.me/chan/12,+998007654321', 't.me/chan/12,+998 ** *** ** 21'],
    'masked numbers with a slash' => ['+998 ** *** ** 21/+998 ** *** ** 22', '+998 ** *** ** 21/+998 ** *** ** 22'],
]);

it('keeps a link LinkGuard keeps, and masks the text around it', function (): void {
    $text = 'Пост: https://t.me/stub_channel_a/4812 и t.me/s/stub_channel_a/4813, тел +998 00 765 43 21';

    expect(maskSynthetic($text))->toBe('Пост: https://t.me/stub_channel_a/4812 и t.me/s/stub_channel_a/4813, тел +998 ** *** ** 21')
        ->and(maskSynthetic('http://t.me/stub_channel_a/4812'))->toBe('http://t.me/stub_channel_a/4812');
});

it('masks a bare nine-digit number that has a phone\'s shape, even before a currency', function (): void {
    expect(maskSynthetic('931234567 сум'))->toBe('+998 ** *** ** 67 сум')
        ->and(PhoneMasker::mask('931234567 сум'))->toBe('+998 ** *** ** 67 сум');
});

it('leaves the prices and areas of a listing alone', function (string $text): void {
    expect(maskSynthetic($text))->toBe($text);
})->with(['Цена 95 500 000 сум', '$1 429/м²', 'Юнусабад-4, ориентир Корзинка']);

it('writes a masked number a client can still find after a slash or asterisks', function (): void {
    preg_match_all(PhoneMasker::MASKED_PATTERN, maskSynthetic('**00 765 43 21**/+998007654322'), $found);

    expect($found[0])->toBe(['+998 ** *** ** 21', '+998 ** *** ** 22']);
});

it('is idempotent on texts made of links, numbers and Markdown', function (): void {
    $random = new Randomizer(new Mt19937(7));
    $parts = ['https://', 'http://', 'wa.me/', 't.me/', 't.me/+', 'api.whatsapp.com/send?phone=', 'chan/', '+998', '998', '00', ' ', '-', '765', '43', '21', '/', '**', '*', '.', ',', 'тел ', '+', '4812'];
    $failures = [];

    for ($i = 0; $i < 20_000 && count($failures) < 5; $i++) {
        $text = '';

        for ($n = $random->getInt(2, 14); $n > 0; $n--) {
            $text .= $parts[$random->getInt(0, count($parts) - 1)];
        }

        $once = maskSynthetic($text);

        if (maskSynthetic($once) !== $once) {
            $failures[] = $text;
        }
    }

    expect($failures)->toBe([]);
});

/*
 * Review of `ec369f2`, point 1: a link glued to a number swallowed the number's code, so the masker of WP-42 left
 * numbers raw that WP-12's masker hid. The masker must never be weaker than WP-12's (`LegacyPhoneMaskerOfWp12`, a
 * frozen copy of `origin/main`) and must stay idempotent; both are checked over the same generated texts: every
 * glue × number × glue of the reviewer's class, random texts of links, numbers, separators and Markdown, and every
 * string of the fixtures.
 */

/** The separators of a written number (point 2), for the leak check. */
const MASKER_SEPARATORS = '[ \t\-._()\x{00A0}\x{2009}\x{202F}\x{2010}-\x{2014}\x{2212}]';

/**
 * The reviewer's class: one synthetic number in each written form, with every glue before and after it.
 *
 * @return list<string>
 */
function maskerGluedNumbers(): array
{
    $numbers = ['+998001234567', '+998 00 123 45 67', '998 00 123-45-67', '8 (00) 123-45-67', '(00) 123 45 67', '00 123 4567', '+998-00-123-45-67', '+998(00)1234567', '00.123.45.67', '00_123_45_67', '001234567'];
    $glue = ['', ' ', 'x', 'тел:', '**', '*', '/', ',', '(', ')', '[', ']', '<', '>', '`', '#', '@', '=', '&', '?', "\n", 'https://t.me/chan/12 ', 'https://t.me/chan/12', 'wa.me/', 'https://wa.me/', 't.me/', 'https://example.com/?p=', 'https://example.com/', '_', '.', '-', ':', '|', '~', '+', '1', 'tel:'];
    $texts = [];

    foreach ($glue as $before) {
        foreach ($numbers as $number) {
            foreach ($glue as $after) {
                $texts[] = $before.$number.$after;
            }
        }
    }

    return $texts;
}

/**
 * Random texts made of links, digit groups, separators (point 2's too), fullwidth digits, Markdown and masked forms.
 *
 * @return list<string>
 */
function maskerRandomTexts(int $seed, int $count): array
{
    $random = new Randomizer(new Mt19937($seed));
    $parts = [
        'https://', 'http://', 'wa.me/', 't.me/', 'telegram.me/', 't.me/+', 'www.', 'api.whatsapp.com/send?phone=', 'chan/', 's/',
        '+998', '998', '8', '00', '90', '765', '43', '21', '4567', '000', '4812', '1',
        ' ', '  ', '-', '(', ')', '_', '.', '/', ',', ':', "\n", "\u{00A0}", "\u{2009}", "\u{202F}", "\u{2011}", "\u{2013}", "\u{2014}", "\u{2212}",
        '**', '*', '*****', '+', '++', 'тел ', 'x', '@', '%2B', '?', '=', '&', '#', '[', ']', '<', '>', '`', '|',
        '９', '０', '０７６５', '＋', '+998 ** *** ** 21', '+** *** ** 43', '** *** ** ',
    ];
    $texts = [];

    for ($i = 0; $i < $count; $i++) {
        $text = '';

        for ($n = $random->getInt(2, 18); $n > 0; $n--) {
            $text .= $parts[$random->getInt(0, count($parts) - 1)];
        }

        $texts[] = $text;
    }

    return $texts;
}

/**
 * Random runs of digit groups and the glue between them (separators, asterisks, slashes, pluses, masked tails): the
 * texts where one number overlaps the next or a price, which the parts above rarely build.
 *
 * @return list<string>
 */
function maskerDigitGroups(int $seed, int $count): array
{
    return maskerGroupTexts($seed, $count, 12,
        ['0', '00', '000', '0000', '90', '901', '9012', '998', '8', '+998', '+', '+1', '12', '123', '1234', '45', '67', '21', '765', '43', '999', '888'],
        ['', ' ', '  ', '   ', '-', '(', ')', '.', '_', '*', '**', '/', "\u{2013}", "\u{00A0}", '+', 'x', ' ** *** ** '],
    );
}

/**
 * Short runs of a few digit groups with spaces, slashes and asterisks: overlaps of a price and a number (`/00   9990000
 * 45`), which a masker that skips a whole price match leaves raw (a few hits in 40 000 at this seed).
 *
 * @return list<string>
 */
function maskerOverlaps(int $seed, int $count): array
{
    return maskerGroupTexts($seed, $count, 8, ['00', '000', '0000', '90', '999', '45', '765', '43', '21'], ['', ' ', '   ', '/', '*']);
}

/**
 * @param  list<string>  $groups
 * @param  list<string>  $glue
 * @return list<string>
 */
function maskerGroupTexts(int $seed, int $count, int $longest, array $groups, array $glue): array
{
    $random = new Randomizer(new Mt19937($seed));
    $texts = [];

    for ($i = 0; $i < $count; $i++) {
        $text = '';

        for ($n = $random->getInt(2, $longest); $n > 0; $n--) {
            $text .= $groups[$random->getInt(0, count($groups) - 1)].$glue[$random->getInt(0, count($glue) - 1)];
        }

        $texts[] = $text;
    }

    return $texts;
}

/**
 * Every string of the stub and legacy fixtures.
 *
 * @return list<string>
 */
function maskerFixtureStrings(): array
{
    $strings = [];
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(dirname(__DIR__, 3).'/resources/fixtures', FilesystemIterator::SKIP_DOTS));

    foreach ($files as $file) {
        if ($file instanceof SplFileInfo && $file->getExtension() === 'json') {
            $decoded = (array) json_decode((string) file_get_contents($file->getPathname()), true);

            array_walk_recursive($decoded, function (mixed $value) use (&$strings): void {
                if (is_string($value)) {
                    $strings[] = $value;
                }
            });
        }
    }

    return $strings;
}

/**
 * The texts in which the new masker leaves raw a number WP-12's masker replaced: its last seven digits, separators
 * allowed between them, stand in the new output more often than in WP-12's. WP-12's masker runs on the text with its
 * fullwidth digits in ASCII, as the new one reads them: WP-12's `\d` read a fullwidth digit, but its `000` rule did
 * not, so `76576500０` was masked there by accident and is a price (`765765000`) here.
 *
 * @param  iterable<string>  $texts
 * @param  list<string>  $codes
 * @return list<string>
 */
function maskerWeakerThanWp12(iterable $texts, array $codes, int $limit = 10): array
{
    $weaker = [];

    $ascii = fn (string $text): string => strtr($text, array_combine(mb_str_split('０１２３４５６７８９'), str_split('0123456789')));

    foreach ($texts as $text) {
        $old = LegacyPhoneMaskerOfWp12::mask($ascii($text), $codes, $replaced);
        $new = $ascii(PhoneMasker::mask($text, $codes));

        foreach ($replaced as $number) {
            $run = '/(?='.implode(MASKER_SEPARATORS.'*', str_split(substr((string) preg_replace('/\D/', '', $number), -7))).')/u';

            if (preg_match_all($run, $new) > preg_match_all($run, $old)) {
                $weaker[] = $text;

                break;
            }
        }

        if (count($weaker) >= $limit) {
            break;
        }
    }

    return $weaker;
}

/**
 * The texts the masker does not mask to a fixed point: masking the masked text changes it.
 *
 * @param  iterable<string>  $texts
 * @param  list<string>  $codes
 * @return list<string>
 */
function maskerNotIdempotent(iterable $texts, array $codes, int $limit = 10): array
{
    $failures = [];

    foreach ($texts as $text) {
        $once = PhoneMasker::mask($text, $codes);

        if (PhoneMasker::mask($once, $codes) !== $once) {
            $failures[] = $text;

            if (count($failures) >= $limit) {
                break;
            }
        }
    }

    return $failures;
}

dataset('masker codes', [
    'the default codes' => [PhoneMasker::CODES],
    'with the synthetic 00' => [[...PhoneMasker::CODES, '00']],
]);

it('never leaves raw a number the masker of WP-12 hid, over the reviewer\'s class of glued numbers', function (array $codes): void {
    expect(maskerWeakerThanWp12(maskerGluedNumbers(), $codes))->toBe([]);
})->with('masker codes');

it('never leaves raw a number the masker of WP-12 hid, over random texts, digit groups and the fixtures', function (array $codes): void {
    expect(maskerWeakerThanWp12(maskerRandomTexts(11, 40_000), $codes))->toBe([])
        ->and(maskerWeakerThanWp12(maskerDigitGroups(12, 40_000), $codes))->toBe([])
        ->and(maskerWeakerThanWp12(maskerOverlaps(99, 40_000), $codes))->toBe([])
        ->and(maskerWeakerThanWp12(maskerFixtureStrings(), $codes))->toBe([]);
})->with('masker codes');

it('is idempotent over the reviewer\'s class, random texts, digit groups and the fixtures', function (array $codes): void {
    expect(maskerNotIdempotent(maskerGluedNumbers(), $codes))->toBe([])
        ->and(maskerNotIdempotent(maskerRandomTexts(42, 40_000), $codes))->toBe([])
        ->and(maskerNotIdempotent(maskerDigitGroups(43, 40_000), $codes))->toBe([])
        ->and(maskerNotIdempotent(maskerOverlaps(44, 40_000), $codes))->toBe([])
        ->and(maskerNotIdempotent(maskerFixtureStrings(), $codes))->toBe([]);
})->with('masker codes');

it('masks each text of the class the masker of ec369f2 left raw', function (string $text): void {
    $masked = maskSynthetic($text);

    expect(preg_match('/1'.MASKER_SEPARATORS.'*2'.MASKER_SEPARATORS.'*3'.MASKER_SEPARATORS.'*4'.MASKER_SEPARATORS.'*5/u', $masked))->toBe(0)
        ->and(maskSynthetic($masked))->toBe($masked);
})->with(fn (): array => (array) json_decode((string) file_get_contents(dirname(__DIR__, 2).'/Support/fixtures/masker/regressions-ec369f2.json'), true));

it('masks a number glued to a link, which the link no longer swallows (review of ec369f2, point 1)', function (string $text, string $masked): void {
    expect(maskSynthetic($text))->toBe($masked)
        ->and(maskSynthetic($masked))->toBe($masked);
})->with([
    'after a channel link and a comma' => ['https://t.me/realtor_tash,тел:(00) 123-45-67', 'https://t.me/realtor_tash,тел:+998 ** *** ** 67'],
    'after an Instagram link and a comma' => ['Инста:https://instagram.com/realtor.tash/,(00) 123 45 67', 'Инста:https://instagram.com/realtor.tash/,+998 ** *** ** 67'],
    'in the query of a link' => ['https://example.com/?tel=(00) 123 45 67', 'https://example.com/?tel=+998 ** *** ** 67'],
    'after a WhatsApp link without a scheme' => ['wa.me/(00) 123 45 67', 'wa.me/+998 ** *** ** 67'],
    'a WhatsApp link with the country code glued' => ['https://wa.me/99800 123 45 67', 'https://wa.me/+998 ** *** ** 67'],
    'after a Telegram link without a scheme' => ['t.me/00 123 4567', 't.me/+998 ** *** ** 67'],
    'glued to the two digits a link keeps' => ['https://wa.me/481200 765 43 21', 'https://wa.me/****+998 ** *** ** 21'],
    'a link with nine digits and a number after it' => ['https://instagram.com/p/C1234567890/ тел 00 765 43 21', 'https://instagram.com/p/C********90/ тел +998 ** *** ** 21'],
]);

it('reads the spaces and dashes of point 2 as separators, up to three between groups', function (string $text, string $masked): void {
    expect(maskSynthetic($text))->toBe($masked)
        ->and(maskSynthetic($masked))->toBe($masked);
})->with([
    'no-break spaces' => ["+998\u{00A0}00\u{00A0}765\u{00A0}43\u{00A0}21", '+998 ** *** ** 21'],
    'thin spaces' => ["+998\u{2009}00\u{2009}765\u{2009}43\u{2009}21", '+998 ** *** ** 21'],
    'narrow no-break spaces' => ["+998\u{202F}00\u{202F}765\u{202F}43\u{202F}21", '+998 ** *** ** 21'],
    'hyphens' => ["00\u{2010}765\u{2010}43\u{2010}21", '+998 ** *** ** 21'],
    'non-breaking hyphens' => ["00\u{2011}765\u{2011}43\u{2011}21", '+998 ** *** ** 21'],
    'figure dashes' => ["00\u{2012}765\u{2012}43\u{2012}21", '+998 ** *** ** 21'],
    'en dashes' => ["тел 00\u{2013}765\u{2013}43\u{2013}21", 'тел +998 ** *** ** 21'],
    'em dashes' => ["00\u{2014}765\u{2014}43\u{2014}21", '+998 ** *** ** 21'],
    'minus signs' => ["00\u{2212}765\u{2212}43\u{2212}21", '+998 ** *** ** 21'],
    'three separators between groups' => ['+998   00   765 - 43 - 21', '+998 ** *** ** 21'],
]);

it('starts a number on its plus wherever the plus stands', function (string $text, string $masked): void {
    expect(maskSynthetic($text))->toBe($masked)
        ->and(maskSynthetic($masked))->toBe($masked);
})->with([
    'after a flat number' => ['кв45+998007654321', 'кв45+998 ** *** ** 21'],
    'after digits' => ['12+998007654321', '12+998 ** *** ** 21'],
    'after another plus' => ['++998007654321', '++998 ** *** ** 21'],
    'another country after digits' => ['12+44 000 000 00 67', '12+** *** ** 67'],
]);

it('reads fullwidth digits as ASCII and writes the masked tail in ASCII', function (string $text, string $masked): void {
    expect(maskSynthetic($text))->toBe($masked)
        ->and(maskSynthetic($masked))->toBe($masked)
        ->and(preg_match(PhoneMasker::MASKED_PATTERN, $masked))->toBe(1);
})->with([
    'country code and number' => ['９９８００７６５４３２１', '+998 ** *** ** 21'],
    'with the fullwidth plus, which stays' => ['＋９９８００７６５４３２１', '＋+998 ** *** ** 21'],
    'a bare code' => ['тел ００ ７６５ ４３ ２１', 'тел +998 ** *** ** 21'],
]);

it('reads no slash or comma as a separator, so floors, areas and prices stay', function (string $text): void {
    expect(maskSynthetic($text))->toBe($text);
})->with(['3/9', '54/30 м²', '1,200,000 сум', '+998/00/765/43/21', '+998,00,765,43,21']);

it('masks a price glued to a plus as another country\'s number, the cost of point 2\'s plus rule', function (): void {
    expect(maskSynthetic('2+1 850 000 000 сум'))->toBe('2+** *** ** 00 сум')
        ->and(maskSynthetic('2 + 1 850 000 000 сум'))->toBe('2 + 1 850 000 000 сум');
});
