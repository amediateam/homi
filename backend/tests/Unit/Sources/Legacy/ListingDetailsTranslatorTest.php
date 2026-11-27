<?php

use App\Enums\ContactMode;
use App\Enums\OwnerTier;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Legacy\Translators\Coercions;
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

it('never maps phone, phone_display or call_url; has_phone says the contact method can answer (WP-43)', function (): void {
    $card = translatedCard();

    expect($card)->not->toHaveKeys(['phone', 'phone_display', 'call_url'])
        ->and($card['contact'])->toBe(['has_phone' => true, 'contact_url' => 'https://t.me/stub_author_6', 'contact_paid' => false, 'mode' => null, 'request' => null]);
});

it('sets has_phone per card under each contact mode: a phone read as one number, or a call link', function (string $fixture, array $overrides, array $modes): void {
    foreach ($modes as $mode => $hasPhone) {
        $card = LegacyFixtures::detailsTranslator(contactMode: $mode)->translate(legacyCard($fixture, $overrides));

        expect($card['contact']['has_phone'])->toBe($hasPhone, "mode {$mode}");
    }
})->with([
    'a phone and a call link' => ['listing.rent_apartment', [], ['auto' => true, 'phone' => true, 'link' => true]],
    'a phone only' => ['listing.rent_apartment', ['call_url' => null], ['auto' => true, 'phone' => true, 'link' => true]],
    'a call link only' => ['listing.link_only', [], ['auto' => true, 'phone' => false, 'link' => true]],
    'neither' => ['listing.no_phone', [], ['auto' => false, 'phone' => false, 'link' => false]],
    'a blank phone and a blank link' => ['listing.rent_apartment', ['phone' => ' ', 'call_url' => ''], ['auto' => false, 'phone' => false, 'link' => false]],
    'two numbers in phone, no link' => ['listing.rent_apartment', ['phone' => '+998001234567, +998007654321', 'call_url' => null], ['auto' => false, 'phone' => false, 'link' => false]],
    'two numbers in phone and a link' => ['listing.rent_apartment', ['phone' => '+998001234567 / +998007654321'], ['auto' => true, 'phone' => false, 'link' => true]],
    'a phone of nine digits' => ['listing.rent_apartment', ['phone' => '00 123 45 67', 'call_url' => null], ['auto' => true, 'phone' => true, 'link' => true]],
]);

it('notes a phone that is not one number, never its value', function (mixed $phone, bool $noted): void {
    $seen = Coercions::collect();
    LegacyFixtures::detailsTranslator()->translate(legacyCard(overrides: ['phone' => $phone]), $seen);

    expect(in_array('phone', $seen->keys(), true))->toBe($noted)
        ->and(json_encode($seen->keys()))->not->toContain('001234567');
})->with([
    'one number' => ['+998001234567', false],
    'none' => [null, false],
    'blank' => ['  ', false],
    'false' => [false, false],
    'a name with it' => ['+998001234567 Анвар', true],
    'a number as a JSON number' => [998001234567, true],
]);

it('masks every author-written text of the card (DEC-52)', function (): void {
    $number = '+998 00 123 45 67';
    $card = translatedCard([
        'summary' => "Тел. {$number}",
        'original_text' => "Звоните {$number}",
        'offers' => [['text' => "Торг, {$number}", 'url' => null]],
        'history' => [['at' => '2026-11-10T07:00:00+00:00', 'channel' => '@stub_channel_a', 'url' => null, 'text' => "Было {$number}", 'kind' => 'published', 'price_usd' => 648, 'change_pct' => null]],
        'author' => ['kind' => 'phone', 'label' => '+998001234567', 'count' => 3],
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
        ->and(json_encode($card, JSON_UNESCAPED_UNICODE))->not->toContain('123 45 67')->not->toContain('001234567');
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
    'a whatsapp link with the number' => ['https://wa.me/998001234567', null],
    'a whatsapp link with separators' => ['https://wa.me/+998-00-765-43-21', null],
    'a whatsapp link without digits' => ['https://wa.me/', null],
    'an encoded whatsapp send link' => ['https://api.whatsapp.com/send?phone=%2B998%2000%20765%2043%2021', null],
    'a telegram phone link' => ['https://t.me/+998001234567', null],
    'an encoded telegram phone link' => ['https://t.me/+998%2000%20765%2043%2021', null],
    'a telegram phone link with an encoded plus' => ['https://t.me/%2B998007654321', null],
    'nine digits with separators on any host' => ['https://example.invalid/agent?tel=00.765.43.21', null],
    'a post link with digits in the channel and the post' => ['https://t.me/chan_2024/1234567', 'https://t.me/chan_2024/1234567'],
    'tel:' => ['tel:+998001234567', null],
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
]);

it('leaves out a part that does not fit and notes it under its place, never failing the card', function (array $overrides, string $field, mixed $kept, array $noted): void {
    $seen = Coercions::collect();
    $card = LegacyFixtures::detailsTranslator()->translate(legacyCard(overrides: $overrides), $seen);

    expect(data_get($card, $field))->toBe($kept)
        ->and($seen->keys())->toBe($noted);
})->with([
    'a source not an object' => [['sources' => ['x', ['handle' => 'stub_channel_a', 'url' => 'https://t.me/stub_channel_a/4001']]], 'sources.0.handle', 'stub_channel_a', ['sources.0']],
    'a source without a url' => [['sources' => [['handle' => 'stub_channel_a']]], 'sources', [], ['sources.0.url']],
    'a fact without a label' => [['facts' => [['key' => 'rooms', 'value' => '2'], ['key' => 'area', 'label' => 'Площадь', 'value' => '54 м²']]], 'facts', [['key' => 'area', 'label' => 'Площадь', 'value' => '54 м²']], ['facts.0.label']],
    'a fact not an object' => [['facts' => ['Комнат: 2']], 'facts', [], ['facts.0']],
    'history not a list' => [['history' => 'x'], 'price_history', [], ['history']],
    'an event without at' => [['history' => [['kind' => 'published'], ['at' => '2026-11-10T07:00:00+00:00', 'kind' => 'published']]], 'price_history.0.at', '2026-11-10T07:00:00+00:00', ['history.0.at']],
    'author not an object' => [['author' => 'Иван'], 'author', null, ['author']],
    'author without a label' => [['author' => ['kind' => 'phone', 'count' => 1]], 'author', null, ['author.label']],
    'a negative stat' => [['stats' => ['days_listed' => -1, 'publications' => 2, 'channels' => 2, 'views' => 41]], 'stats', ['days_listed' => 0, 'publications' => 2, 'channels' => 2, 'views' => 41], ['stats.days_listed']],
    'stats not an object' => [['stats' => 7], 'stats.days_listed', 0, ['stats']],
    'a place without a name' => [['nearby' => [['kind' => 'park', 'km' => 0.4]]], 'nearby', [], ['nearby.0.name']],
    'a place of another kind' => [['nearby' => [['kind' => 'metro', 'name' => 'Минор', 'km' => 0.7]]], 'nearby', [], ['nearby.0.kind']],
    'an offer without a text' => [['offers' => [['url' => 'https://t.me/stub_author_6']]], 'offers', [], ['offers.0.text']],
    'an unknown contact mode' => [['contact_mode' => 'private'], 'contact.mode', null, ['contact_mode']],
    'a flag of another type' => [['post_deleted' => 'yes'], 'original.deleted', false, ['post_deleted']],
]);

it('notes nothing for the golden cards', function (string $fixture): void {
    $seen = Coercions::collect();
    LegacyFixtures::detailsTranslator()->translate(LegacyFixtures::golden($fixture), $seen);

    expect($seen->keys())->toBe([]);
})->with(['listing.rent_apartment', 'listing.daily', 'listing.sale_house', 'listing.commercial', 'listing.land', 'listing.merged', 'listing.no_phone', 'listing.minimal']);

it('masks a number in the owner label, in the translator and in the data object', function (): void {
    $card = translatedCard(['owner' => 'Риелтор +998 00 765 43 21']);

    expect($card['owner_label'])->toBe('Риелтор +998 ** *** ** 21')
        ->and(ListingDetails::fromArray([...$card, 'owner_label' => 'Риелтор 998007654321'])->ownerLabel)->toBe('Риелтор +998 ** *** ** 21');
});

it('drops an author link that could carry a phone number from the original, the sources and the history, keeping plain post links', function (): void {
    $phone = 'https://wa.me/+998-00-765-43-21';
    $card = translatedCard([
        'original_url' => $phone,
        'sources' => [['handle' => 'agent', 'url' => $phone], ['handle' => 'stub_channel_b', 'url' => 'https://t.me/stub_channel_b/9']],
        'history' => [['at' => '2026-11-10T07:00:00+00:00', 'channel' => 'stub_channel_a', 'url' => 'https://t.me/%2B998007654321', 'kind' => 'published', 'price_usd' => 648, 'change_pct' => null]],
        'offers' => [['text' => 'Торг', 'url' => 'https://api.whatsapp.com/send?phone=%2B998%2000%20765%2043%2021']],
    ]);

    expect($card['original']['url'])->toBeNull()
        ->and($card['sources'])->toBe([['handle' => 'stub_channel_b', 'url' => 'https://t.me/stub_channel_b/9']])
        ->and($card['source_ref'])->toBe(['channel' => 'stub_channel_b', 'post_id' => 9])
        ->and($card['price_history'][0]['url'])->toBeNull()
        ->and($card['offers'][0]['url'])->toBeNull()
        ->and(json_encode($card))->not->toContain('765');
});

it('never shows a source handle or a history channel that could be a phone number: nine digits or more (L1)', function (): void {
    $seen = Coercions::collect();
    $card = LegacyFixtures::detailsTranslator()->translate(legacyCard(overrides: [
        'sources' => [
            ['handle' => '@998007654321', 'url' => 'https://t.me/stub_channel_a/4001'],
            ['handle' => 'ivan_998_00_765_43_21', 'url' => 'https://t.me/stub_channel_a/4002'],
            ['handle' => 'stub_2024_1231', 'url' => 'https://t.me/stub_channel_b/9'],
        ],
        'history' => [
            ['at' => '2026-11-10T07:00:00+00:00', 'channel' => '@998007654321', 'url' => null, 'kind' => 'published', 'price_usd' => 648, 'change_pct' => null],
            ['at' => '2026-11-11T07:00:00+00:00', 'channel' => '@stub_2024_1231', 'url' => null, 'kind' => 'published', 'price_usd' => 648, 'change_pct' => null],
        ],
    ]), $seen);

    expect($card['sources'])->toBe([['handle' => 'stub_2024_1231', 'url' => 'https://t.me/stub_channel_b/9']])
        ->and(array_column($card['price_history'], 'channel'))->toBe([null, 'stub_2024_1231'])
        ->and($seen->keys())->toBe(['history.0.channel', 'sources.0.handle', 'sources.1.handle'])
        ->and(json_encode($card))->not->toContain('765')->not->toContain('998007');
});

it('takes no source of a card from a post link whose channel could be a phone number', function (): void {
    $card = translatedCard(['original_url' => 'https://t.me/a1b2c3d4e5f6g7h8i9/12', 'sources' => [['handle' => 'stub_channel_b', 'url' => 'https://t.me/stub_channel_b/9']]]);

    expect($card['source_ref'])->toBe(['channel' => 'stub_channel_b', 'post_id' => 9]);
});

it('counts the card\'s photos at most as the addresses it keeps, and 0 without a media base', function (): void {
    $legacy = legacyCard(overrides: ['photos_count' => 8, 'photos' => [...array_slice(legacyCard()['photos'], 0, 5), 'https://elsewhere.invalid/x.jpg']]);

    expect(LegacyFixtures::detailsTranslator()->translate($legacy)['photos']['count'])->toBe(5)
        ->and(LegacyFixtures::detailsTranslator('')->translate(legacyCard())['photos'])->toBe(['preview' => [], 'count' => 0, 'cover' => null, 'items' => []]);
});
