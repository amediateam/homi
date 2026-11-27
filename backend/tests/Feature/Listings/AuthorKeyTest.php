<?php

use App\Services\Listings\AuthorKey;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;

/*
 * `AuthorKey::fromCard()` (WP-42, "`listing_refs` and author keys"): each case of the specification's table, and the
 * secret rule of the WP-42 brief (rule 11): a blank or short secret never derives a `phone:` key.
 */

const AUTHOR_SECRET = 'author-key-test-secret-of-32-bytes-at-least';

beforeEach(function (): void {
    Http::preventStrayRequests();
    config(['contacts.author_key_secret' => AUTHOR_SECRET, 'legacy.fields.author_key' => '']);
});

/**
 * A raw legacy card with a phone and a post link.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function rawCard(array $overrides = []): array
{
    return [
        'id' => 100001,
        'phone' => '+998001234567',
        'phone_display' => '+998 00 123-45-67',
        'author' => ['kind' => 'phone', 'label' => '+998 ** *** ** 67', 'count' => 3],
        'original_url' => 'https://t.me/Stub_Channel_A/4001',
        'sources' => [['handle' => 'stub_channel_a', 'url' => 'https://t.me/stub_channel_a/4001']],
        ...$overrides,
    ];
}

function phoneKey(string $e164): string
{
    return 'phone:'.substr(hash_hmac('sha256', $e164, AUTHOR_SECRET), 0, 32);
}

/** @return list<string> the warnings logged while `$run` runs */
function authorKeyWarnings(Closure $run): array
{
    $warnings = [];
    Event::listen(MessageLogged::class, function (MessageLogged $log) use (&$warnings): void {
        if ($log->level === 'warning') {
            $warnings[] = $log->message;
        }
    });
    $run();

    return $warnings;
}

it('files the operator\'s stable key as legacy:<value> with the kind of author.kind', function (): void {
    config(['legacy.fields.author_key' => 'author_id']);

    expect(AuthorKey::fromCard(rawCard(['author_id' => 'a-81F2'])))->toEqual(new AuthorKey('legacy:a-81F2', 'phone'))
        ->and(AuthorKey::fromCard(rawCard(['author_id' => 7731, 'author' => null])))->toEqual(new AuthorKey('legacy:7731', null));
});

it('falls back from an operator value that is missing, not text or too long for the column', function (mixed $value): void {
    config(['legacy.fields.author_key' => 'author_id']);

    expect(AuthorKey::fromCard(rawCard(['author_id' => $value])))->toEqual(new AuthorKey(phoneKey('+998001234567'), 'phone'));
})->with([
    'missing' => [null],
    'empty' => ['  '],
    'a list' => [[1, 2]],
    'with a space' => ['a b'],
    'longer than 89' => [str_repeat('x', 90)],
]);

it('treats an operator value that is a phone number as absent, so the card falls through to the phone rule', function (mixed $value): void {
    config(['legacy.fields.author_key' => 'author_id']);

    $key = AuthorKey::fromCard(rawCard(['author_id' => $value]));

    expect($key)->toEqual(new AuthorKey(phoneKey('+998001234567'), 'phone'))
        ->and(AuthorKey::fromCard(rawCard(['author_id' => $value, 'phone' => null])))->toEqual(new AuthorKey('source:stub_channel_a', 'source'));
})->with([
    'E.164' => ['+998001234567'],
    'without the plus' => ['998001234567'],
    'a number' => [998001234567],
    'with dashes' => ['+998-00-123-45-67'],
    'with underscores' => ['998_00_123_45_67'],
    'with brackets and dots' => ['+998(00)123.45.67'],
    'inside a word' => ['id998001234567x'],
    'eight digits, an E.164 number' => ['12345678'],
]);

it('keeps an operator value whose digits do not form a phone number', function (string $value): void {
    config(['legacy.fields.author_key' => 'author_id']);

    expect(AuthorKey::fromCard(rawCard(['author_id' => $value]))?->key)->toBe("legacy:{$value}");
})->with(['a-81F2', '1234567', 'u12345678a', 'a1b2c3d4e5f6g7h8i9j0']);

it('ignores an operator field while legacy.fields.author_key is blank', function (): void {
    expect(AuthorKey::fromCard(rawCard(['author_id' => 'a-81F2']))?->key)->toBe(phoneKey('+998001234567'));
});

it('files a phone as phone: and the first 32 hex of the HMAC of its E.164 form', function (string $phone): void {
    $key = AuthorKey::fromCard(rawCard(['phone' => $phone]));

    expect($key)->toEqual(new AuthorKey(phoneKey('+998001234567'), 'phone'))
        ->and(strlen((string) $key?->key))->toBe(38)
        ->and((string) $key?->key)->not->toContain('1234567');
})->with([
    'E.164' => ['+998001234567'],
    'display form' => ['+998 00 123-45-67'],
    'without the plus' => ['998001234567'],
    'without the country code' => ['00 123 45 67'],
    'with brackets' => ['+998 (00) 123.45.67'],
]);

it('files a card without a usable phone under its source channel, lower-cased', function (mixed $phone): void {
    expect(AuthorKey::fromCard(rawCard(['phone' => $phone])))->toEqual(new AuthorKey('source:stub_channel_a', 'source'));
})->with([
    'no phone' => [null],
    'not text' => [998001234567],
    'not a number' => ['call me'],
    'too short' => ['+99812'],
]);

it('takes the source channel from the first source link when the card has no original link', function (): void {
    $card = rawCard(['phone' => null, 'original_url' => null, 'sources' => [['handle' => 'x', 'url' => 'https://t.me/s/Other_Channel/12']]]);

    expect(AuthorKey::fromCard($card))->toEqual(new AuthorKey('source:other_channel', 'source'));
});

it('files no source key for a channel that could be a phone number (nine digits or more)', function (string $url): void {
    expect(AuthorKey::fromCard(rawCard(['phone' => null, 'original_url' => $url, 'sources' => []])))->toBeNull();
})->with(['https://t.me/a998007654321/12', 'https://t.me/ivan_998_00_765_43_21/3', 'https://t.me/a1b2c3d4e5f6g7h8i9/3']);

it('files no author for a card with neither a phone nor a public post link', function (): void {
    expect(AuthorKey::fromCard(rawCard(['phone' => null, 'original_url' => null, 'sources' => []])))->toBeNull()
        ->and(AuthorKey::fromCard(rawCard(['phone' => null, 'original_url' => 'https://t.me/c/123/45', 'sources' => []])))->toBeNull()
        ->and(AuthorKey::fromCard([]))->toBeNull();
});

it('files a card with a phone under no author with a blank or short secret, never its channel, and warns at most once a minute', function (string $secret): void {
    config(['contacts.author_key_secret' => $secret]);

    $warnings = authorKeyWarnings(function (): void {
        expect(AuthorKey::fromCard(rawCard()))->toBeNull()
            ->and(AuthorKey::fromCard(rawCard(['phone' => '+998002222222', 'original_url' => 'https://t.me/stub_channel_a/2'])))->toBeNull()
            ->and(AuthorKey::fromCard(rawCard(['original_url' => null, 'sources' => []])))->toBeNull()
            ->and(AuthorKey::fromCard(rawCard(['phone' => null])))->toEqual(new AuthorKey('source:stub_channel_a', 'source'));
    });
    $this->travel(61)->seconds();
    $later = authorKeyWarnings(fn (): ?AuthorKey => AuthorKey::fromCard(rawCard()));

    expect($warnings)->toBe(['AUTHOR_KEY_SECRET is blank or shorter than 32 bytes: no phone author keys are derived.'])
        ->and($later)->toHaveCount(1)
        ->and(implode(' ', [...$warnings, ...$later]))->not->toContain('1234567');
})->with([
    'blank' => [''],
    '31 bytes' => [str_repeat('s', 31)],
]);

it('derives the key with a secret of exactly 32 bytes, and another key with another secret', function (): void {
    $secret = str_repeat('k', 32);

    expect(AuthorKey::derive(rawCard(), '', $secret)?->key)->toBe('phone:'.substr(hash_hmac('sha256', '+998001234567', $secret), 0, 32))
        ->and(AuthorKey::derive(rawCard(), '', $secret)?->key)->not->toBe(AuthorKey::fromCard(rawCard())?->key);
});

it('marks the card, the phone and the secret as sensitive parameters', function (string $method, int $position): void {
    $parameter = (new ReflectionMethod(AuthorKey::class, $method))->getParameters()[$position];

    expect($parameter->getAttributes(SensitiveParameter::class))->toHaveCount(1);
})->with([
    'fromCard: the card' => ['fromCard', 0],
    'derive: the card' => ['derive', 0],
    'derive: the secret' => ['derive', 2],
    'e164: the phone' => ['e164', 0],
    'phoneHash: the phone' => ['phoneHash', 0],
    'phoneHash: the secret' => ['phoneHash', 1],
]);
