<?php

use App\Services\Listings\PhoneMasker;

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
