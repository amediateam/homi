<?php

use App\Services\Personal\AuthorLabel;

/*
 * WP-44, step 6: the plain-text label of a blocked author (task `KV-BE-041`, BR-DATA-028, BR-DATA-029). A phone author
 * shows the masked form of WP-12's `PhoneMasker` — the last two digits only — from the number in memory (masked by the
 * source that holds it, `ofPhone()`), never stored;
 * without that number (contact variant B of WP-43, or a phone the masker cannot read as one number) the source's own
 * label, masked again and reduced to the masked form it holds, else `+998 ** *** ** **`. A source author shows
 * `@channel`, markup stripped.
 */

/** The digits of a label beyond the country code of a masked Uzbek number. */
function labelDigits(string $label): string
{
    return (string) preg_replace('/\D/', '', (string) preg_replace('/^\+998 /', '', $label));
}

it('masks a phone it holds to the form of PhoneMasker, its last two digits only', function (string $phone, string $label): void {
    expect(AuthorLabel::ofPhone($phone))->toBe($label)
        ->and(AuthorLabel::phone(AuthorLabel::ofPhone($phone), 'Хозяин'))->toBe($label);
})->with([
    'an Uzbek number' => ['+998001234567', '+998 ** *** ** 67'],
    'another Uzbek number' => ['+998901112241', '+998 ** *** ** 41'],
    'a foreign number' => ['+12025550123', '+** *** ** 23'],
]);

it('falls back to the source\'s label when it holds no phone, or one the masker cannot read as one number', function (?string $phone, ?string $source, string $label): void {
    expect(AuthorLabel::phone(AuthorLabel::ofPhone($phone), $source))->toBe($label);
})->with([
    'variant B, the source masked it' => [null, '+998 ** *** ** 02', '+998 ** *** ** 02'],
    'a raw number in the source\'s label' => [null, 'Тел: +998 90 123 45 67', '+998 ** *** ** 67'],
    'a name and a masked number' => [null, 'Иван +998 ** *** ** 41 (хозяин)', '+998 ** *** ** 41'],
    'a name only' => [null, 'Хозяин', '+998 ** *** ** **'],
    'digits that are no number' => [null, 'кв. 45, этаж 3', '+998 ** *** ** **'],
    'no label at all' => [null, null, '+998 ** *** ** **'],
    'a short foreign number' => ['+12345678', '+998 ** *** ** 99', '+998 ** *** ** 99'],
    'a short number, no label' => ['+123456789', null, '+998 ** *** ** **'],
]);

it('never shows more than two digits of a phone, whatever it is given', function (?string $phone, ?string $source): void {
    $label = AuthorLabel::phone(AuthorLabel::ofPhone($phone), $source);

    expect(strlen(labelDigits($label)))->toBeLessThanOrEqual(2)
        ->and($label)->not->toContain('<')
        ->and(mb_strlen($label))->toBeLessThanOrEqual(64);
})->with([
    ['+998001234567', null],
    ['+998001234567', '+998001234567'],
    [null, '+998 00 123 45 67 / +998 00 765 43 21'],
    [null, '<b>+998001234567</b>'],
    [null, '998001234567'],
    [null, '00 123-45-67'],
    [null, str_repeat('9', 40)],
    [null, '+998 ** *** ** 67 +998 ** *** ** 21'],
    ['+44 20 7946 0958', null],
    [null, 'wa.me/998001234567'],
]);

it('takes a masked number only when it is one and nothing else', function (?string $masked, string $label): void {
    expect(AuthorLabel::phone($masked, null))->toBe($label);
})->with([
    'a masked number' => ['+998 ** *** ** 67', '+998 ** *** ** 67'],
    'a raw number passed by mistake' => ['+998001234567', '+998 ** *** ** **'],
    'a masked number with more' => ['+998 ** *** ** 67 kv 12', '+998 ** *** ** **'],
    'none' => [null, '+998 ** *** ** **'],
]);

it('names a source author by its channel, markup and other characters stripped', function (string $channel, string $label): void {
    expect(AuthorLabel::source($channel))->toBe($label);
})->with([
    'a channel' => ['example_channel', '@example_channel'],
    'markup' => ['<b>example</b>_channel', '@bexampleb_channel'],
    'an at sign already' => ['@stub_channel_b', '@stub_channel_b'],
    'too long' => [str_repeat('a', 80), '@'.str_repeat('a', 63)],
    'a public handle with digits, kept whole (review A, F6)' => ['ijara_998901234567', '@ijara_998901234567'],
]);
