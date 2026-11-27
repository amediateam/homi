<?php

use App\Services\Listings\LinkGuard;

/*
 * The links a card may carry from the author's post (WP-42, DEC-52): only https, and none that could carry a number.
 */

it('keeps an https link that cannot carry a phone number', function (string $url): void {
    expect(LinkGuard::safe($url))->toBe($url);
})->with([
    'a chat link' => ['https://t.me/stub_author_6'],
    'a post link' => ['https://t.me/stub_channel_a/4001'],
    'a post link with digits in the channel and the post' => ['https://t.me/chan_2024/1234567'],
    'a preview link' => ['https://t.me/s/stub_channel_b/4010?single'],
    'eight digits with separators' => ['https://example.invalid/listing/12-34-56-78'],
    'a long number split by slashes' => ['https://example.invalid/2026/11/27/123456'],
    'a channel with eight digits' => ['https://t.me/stub_2024_1231/3'],
]);

it('drops any link that could carry a phone number, whatever its host and encoding', function (?string $url): void {
    expect(LinkGuard::safe($url))->toBeNull();
})->with([
    'a whatsapp link' => ['https://wa.me/998007654321'],
    'a whatsapp link with separators' => ['https://wa.me/+998-00-765-43-21'],
    'a whatsapp link without digits' => ['https://wa.me/'],
    'a whatsapp send link, encoded' => ['https://api.whatsapp.com/send?phone=%2B998%2000%20765%2043%2021'],
    'a telegram phone link' => ['https://t.me/+998007654321'],
    'a telegram phone link, encoded' => ['https://t.me/+998%2000%20765%2043%2021'],
    'a telegram phone link with an encoded plus' => ['https://t.me/%2B998007654321'],
    'a telegram phone link encoded twice' => ['https://t.me/%252B998%252000%2520765%252043%252021'],
    'telegram.me' => ['https://telegram.me/+998007654321'],
    'nine digits with dots on another host' => ['https://example.invalid/agent?tel=00.765.43.21'],
    'nine digits with brackets and spaces, encoded' => ['https://example.invalid/?c=(00)%20765-43-21'],
    'a channel name with a number' => ['https://t.me/a998007654321/12'],
    'a channel name with nine digits among letters' => ['https://t.me/a1b2c3d4e5f6g7h8i9/12'],
    'a preview link of such a channel' => ['https://t.me/s/a1b2c3d4e5f6g7h8i9/12'],
    'an invite link' => ['https://t.me/+AbCdEf123'],
    'an invite link on telegram.me' => ['https://telegram.me/+AbCdEf123'],
    'tel:' => ['tel:+998007654321'],
    'http' => ['http://t.me/stub_author_6'],
    'a user in the address' => ['https://user@t.me/stub_author_6'],
    'no host' => ['https:///t.me'],
    'whitespace' => ['https://t.me/stub author'],
    'a number behind a byte that is not UTF-8' => ['https://t.me/x%FF998007654321'],
    'null' => [null],
]);

it('keeps a channel or author name only while it holds at most eight digits (L1)', function (?string $name, ?string $kept): void {
    expect(LinkGuard::safeName($name))->toBe($kept);
})->with([
    'a channel' => ['stub_channel_a', 'stub_channel_a'],
    'eight digits' => ['stub_2024_1231', 'stub_2024_1231'],
    'a handle that is a number' => ['@998007654321', null],
    'nine digits with separators' => ['ivan_998_00_765_43_21', null],
    'nine digits among letters' => ['a1b2c3d4e5f6g7h8i9', null],
    'null' => [null, null],
]);
