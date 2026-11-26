<?php

use App\Enums\ContactMode;
use App\Enums\OwnerTier;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\ListingDetails;
use Tests\Support\LegacyFixtures;

/**
 * A golden card with overrides.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<array-key, mixed>
 */
function legacyCard(string $fixture = 'listing.rent_apartment', array $overrides = []): array
{
    return [...LegacyFixtures::golden($fixture), ...$overrides];
}

/** @param  array<string, mixed>  $overrides */
function translatedCard(array $overrides = [], string $fixture = 'listing.rent_apartment', bool $relay = false): array
{
    return LegacyFixtures::detailsTranslator(relay: $relay)->translate(legacyCard($fixture, $overrides));
}

it('maps the card\'s own keys: deal_type, market_code, history, owner, original, offers, sources', function (): void {
    $card = translatedCard();

    expect($card['deal'])->toBe('rent_long')
        ->and($card['market'])->toBe(['label' => 'Вторичка', 'code' => 'secondary', 'median_delta' => -0.12, 'tone' => 'good'])
        ->and($card['price_history'][1])->toBe(['at' => '2026-11-14T06:40:00+00:00', 'channel' => 'stub_channel_a', 'url' => 'https://t.me/stub_channel_a/4001', 'text' => null, 'kind' => 'price_down', 'price_usd' => 600, 'change_pct' => -7.4])
        ->and($card['owner_label'])->toBe('Хозяин')
        ->and($card['original']['url'])->toBe('https://t.me/stub_channel_a/4001')
        ->and($card['original']['deleted'])->toBeFalse()
        ->and($card['offers'])->toBe([['text' => 'Торг', 'url' => null]])
        ->and($card['source_ref'])->toBe(['channel' => 'stub_channel_a', 'post_id' => 4001])
        ->and($card['photos']['items'])->toHaveCount(8)
        ->and($card['photos']['count'])->toBe(8);
});

it('never maps phone, phone_display or call_url, and has no phone until WP-43', function (): void {
    $card = translatedCard();

    expect($card)->not->toHaveKeys(['phone', 'phone_display', 'call_url'])
        ->and($card['contact'])->toBe(['has_phone' => false, 'contact_url' => 'https://t.me/stub_author_6', 'contact_paid' => false, 'mode' => null, 'request' => null]);
});

it('masks every author-written text of the card (DEC-52)', function (): void {
    $number = '+998 90 123 45 67';
    $card = translatedCard([
        'summary' => "Тел. {$number}",
        'original_text' => "Звоните {$number}",
        'offers' => [['text' => "Торг, {$number}", 'url' => null]],
        'history' => [['at' => '2026-11-10T07:00:00+00:00', 'channel' => '@stub_channel_a', 'url' => null, 'text' => "Было {$number}", 'kind' => 'published', 'price_usd' => 648, 'change_pct' => null]],
        'author' => ['kind' => 'phone', 'label' => '+998901234567', 'count' => 3],
        'owner_description' => "Мой номер {$number}",
    ]);
    $masked = '+998 ** *** ** 67';

    expect($card['summary'])->toBe("Тел. {$masked}")
        ->and($card['original']['text'])->toBe("Звоните {$masked}")
        ->and($card['offers'][0]['text'])->toBe("Торг, {$masked}")
        ->and($card['price_history'][0]['text'])->toBe("Было {$masked}")
        ->and($card['price_history'][0]['channel'])->toBe('stub_channel_a')
        ->and($card['author']['label'])->toBe($masked)
        ->and($card['owner']['description'])->toBe("Мой номер {$masked}")
        ->and(json_encode($card, JSON_UNESCAPED_UNICODE))->not->toContain('123 45 67')->not->toContain('901234567');
});

it('masks a masked text to itself, so the cached array and the object agree', function (): void {
    $card = translatedCard();
    $details = ListingDetails::fromArray($card);
    $again = translatedCard(['summary' => $card['summary'], 'original_text' => $card['original']['text']]);

    expect($again['summary'])->toBe($card['summary'])
        ->and($again['original']['text'])->toBe($card['original']['text'])
        ->and($details->summary)->toBe($card['summary'])
        ->and($details->originalText)->toBe($card['original']['text'])
        ->and($details->preview->title)->toBe($card['title']);
});

it('keeps an https contact link without a phone number in it, and drops any other', function (?string $url, ?string $kept): void {
    expect(translatedCard(['contact_url' => $url])['contact']['contact_url'])->toBe($kept);
})->with([
    'a chat link' => ['https://t.me/stub_author_6', 'https://t.me/stub_author_6'],
    'a whatsapp link with the number' => ['https://wa.me/998901234567', null],
    'a telegram phone link' => ['https://t.me/+998901234567', null],
    'tel:' => ['tel:+998901234567', null],
    'plain http' => ['http://t.me/stub_author_6', null],
    'null' => [null, null],
]);

it('drops a label that only repeats the owner tier (BR-API-189), in each language', function (string $label, ?string $kept): void {
    expect(translatedCard(['owner' => $label])['owner_label'])->toBe($kept);
})->with([
    ['Проверенный хозяин', null],
    ['Проверенный хозяин · разместил сам в kvadro²', null],
    ['Хозяин — со слов объявления', null],
    ['Tasdiqlangan uy egasi', null],
    ['Uy egasi — eʼlonga koʻra', null],
    ['Verified owner · listed it on kvadro² themselves', null],
    ['Owner — per the listing', null],
    ['Хозяин', 'Хозяин'],
    ['Риелтор', 'Риелтор'],
]);

it('derives the owner tier from owner_self, owner_verified and is_owner', function (array $flags, ?string $tier): void {
    expect(translatedCard(['owner_self' => null, 'owner_verified' => null, 'is_owner' => null, ...$flags])['owner']['tier'])->toBe($tier);
})->with([
    'self' => [['owner_self' => true, 'owner_verified' => true, 'is_owner' => true], OwnerTier::Self->value],
    'verified' => [['owner_verified' => true, 'is_owner' => true], OwnerTier::Verified->value],
    'claimed' => [['is_owner' => true], OwnerTier::Claimed->value],
    'none' => [['is_owner' => false], null],
]);

it('maps the contact mode: open is phone, gate is hidden while the relay is off and request once it is on', function (array $card, bool $relay, ?string $mode): void {
    expect(translatedCard($card, relay: $relay)['contact']['mode'])->toBe($mode);
})->with([
    'open' => [['contact_mode' => 'open'], false, ContactMode::Phone->value],
    'gate without a phone' => [['contact_mode' => 'gate', 'phone' => null], false, ContactMode::Hidden->value],
    'gate without a phone, relay on (WP-87)' => [['contact_mode' => 'gate', 'phone' => null], true, ContactMode::Request->value],
    'gate with a phone' => [['contact_mode' => 'gate'], false, ContactMode::Phone->value],
    'none' => [['contact_mode' => null], false, null],
    'unknown' => [['contact_mode' => 'private'], false, null],
]);

it('ignores the per-user owner keys legacy sends for the service key', function (): void {
    $card = translatedCard([], 'listing.no_phone');

    expect($card['owner'])->toMatchArray(['mine' => false, 'listing_id' => null, 'response_minutes' => 15])
        ->and($card['contact']['request'])->toBeNull()
        ->and($card['owner'])->not->toHaveKey('entry')
        ->and($card['favorite'])->toBeFalse();
});

it('builds the comparison only when median is truthy and median_value a number', function (array $card, bool $has): void {
    expect(translatedCard($card)['comparison'] !== null)->toBe($has);
})->with([
    'median' => [[], true],
    'median false' => [['median' => false], false],
    'median_value null' => [['median_value' => null], false],
    'median_value a string' => [['median_value' => '672'], false],
    'median 1' => [['median' => 1], true],
]);

it('writes the comparison as the median_* keys without the prefix', function (): void {
    expect(translatedCard(['median_reason' => 'ремонт', 'median_near_class' => 'jk', 'median_radius_km' => 1.5])['comparison'])->toBe([
        'value' => 672, 'own' => 600, 'n' => 14, 'metric' => 'month', 'scope' => 'district', 'rooms' => 2, 'near_class' => 'jk',
        'radius_km' => 1.5, 'district' => 'Юнусабад', 'place_value' => null, 'note' => null, 'updated' => '2026-11-12',
        'has_reason' => true, 'price_usd' => 600, 'price_per_m2' => null,
    ]);
});

it('keeps the first park and the first school of nearby and drops any other kind', function (): void {
    $card = translatedCard(['nearby' => [
        ['kind' => 'metro', 'name' => 'Минор', 'km' => 0.7],
        ['kind' => 'park', 'name' => 'Парк', 'km' => 0.4],
        ['kind' => 'park', 'name' => 'Сквер', 'km' => 0.6, 'note' => 'x'],
        ['kind' => 'school', 'name' => 'Школа', 'km' => 1, 'note' => 'рядом'],
    ]]);

    expect($card['nearby'])->toBe([
        ['kind' => 'park', 'name' => 'Парк', 'km' => 0.4, 'note' => null],
        ['kind' => 'school', 'name' => 'Школа', 'km' => 1, 'note' => 'рядом'],
    ]);
});

it('keeps the first fact of each key and writes a number value as text', function (): void {
    expect(translatedCard(['facts' => [['key' => 'rooms', 'label' => 'Комнат', 'value' => 2], ['key' => 'rooms', 'label' => 'Комнат', 'value' => '3']]])['facts'])
        ->toBe([['key' => 'rooms', 'label' => 'Комнат', 'value' => '2']]);
});

it('takes the preview photos from photos when a card has no photos_preview', function (): void {
    $legacy = legacyCard();
    unset($legacy['photos_preview'], $legacy['photos_count']);
    $card = LegacyFixtures::detailsTranslator()->translate($legacy);

    expect($card['photos']['preview'])->toBe($card['photos']['items'])
        ->and($card['photos']['count'])->toBe(8);
});

it('answers with the number legacy answered for a merged duplicate', function (): void {
    expect(LegacyFixtures::detailsTranslator()->translate(LegacyFixtures::golden('listing.merged'))['number'])->toBe(100001);
});

it('refuses a card that does not fit, naming the key', function (array $overrides, string $key): void {
    try {
        translatedCard($overrides);
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe([$key])
            ->and($error->path)->toBe('/api/listings/{n}');

        return;
    }

    throw new LogicException("{$key} was accepted.");
})->with([
    'id at the native floor' => [['id' => LegacyFixtures::NATIVE_FLOOR + 1], 'id'],
    'photos not a list' => [['photos' => 'x'], 'photos'],
    'facts null' => [['facts' => null], 'facts'],
    'sources not a list' => [['sources' => ['a' => 1]], 'sources'],
    'a source not an object' => [['sources' => ['x']], 'sources.0'],
    'a source without a url' => [['sources' => [['handle' => 'stub_channel_a']]], 'url'],
    'a fact without a label' => [['facts' => [['key' => 'rooms', 'value' => '2']]], 'label'],
    'history not a list' => [['history' => 'x'], 'history'],
    'an event without at' => [['history' => [['kind' => 'published']]], 'at'],
    'author not an object' => [['author' => 'Иван'], 'author'],
]);
