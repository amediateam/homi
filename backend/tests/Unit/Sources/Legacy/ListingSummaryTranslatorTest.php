<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Legacy\LegacyFeedCursor;
use App\Services\Sources\Legacy\Translators\Coercions;
use Tests\Support\LegacyFixtures;

/**
 * A feed item of the golden first page, with overrides.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<array-key, mixed>
 */
function legacyItem(int $number = 100001, array $overrides = []): array
{
    foreach (LegacyFixtures::golden('feed.default')['items'] as $item) {
        if ($item['id'] === $number) {
            return [...$item, ...$overrides];
        }
    }

    throw new LogicException("No golden feed item {$number}.");
}

/** @param  array<string, mixed>  $overrides */
function translatedItem(array $overrides = [], int $number = 100001): array
{
    return LegacyFixtures::summaryTranslator()->translate(legacyItem($number, $overrides), 'tashkent');
}

it('takes the short title, else the part of the title before « · »', function (array $item, string $title): void {
    expect(translatedItem($item)['title'])->toBe($title);
})->with([
    'short_title' => [['short_title' => '2-комн. квартира', 'title' => 'Другое · Юнусабад'], '2-комн. квартира'],
    'title before the dot' => [['short_title' => null, 'title' => '2-комн. квартира, 54 м² · Юнусабад · у метро'], '2-комн. квартира, 54 м²'],
    'a title without a dot' => [['short_title' => null, 'title' => 'Квартира'], 'Квартира'],
    'neither' => [['short_title' => null, 'title' => null], ''],
]);

it('masks a number in the title', function (): void {
    expect(translatedItem(['short_title' => 'Квартира, звоните +998 00 123 45 67'])['title'])->toBe('Квартира, звоните +998 ** *** ** 67');
});

it('splits age into label and when, and keeps a readable posted_at (index-CIa0Ldj2.js)', function (array $item, array $posted): void {
    expect(translatedItem($item)['posted'])->toBe($posted);
})->with([
    'both' => [['age' => 'Опубликовано · сегодня', 'posted_at' => '2026-11-14T06:40:00+00:00'], ['label' => 'Опубликовано', 'when' => 'сегодня', 'at' => '2026-11-14T06:40:00+00:00']],
    'posted_at absent' => [['age' => 'Обновлено · 2 дня назад', 'posted_at' => null], ['label' => 'Обновлено', 'when' => '2 дня назад', 'at' => null]],
    'posted_at unreadable' => [['posted_at' => 'вчера'], ['label' => 'Опубликовано', 'when' => 'сегодня', 'at' => null]],
    'posted_at relative' => [['posted_at' => 'tomorrow'], ['label' => 'Опубликовано', 'when' => 'сегодня', 'at' => null]],
    'age without a dot' => [['age' => 'сегодня'], ['label' => 'сегодня', 'when' => '', 'at' => '2026-11-14T06:40:00+00:00']],
    'no age' => [['age' => null, 'posted_at' => null], ['label' => '', 'when' => '', 'at' => null]],
]);

it('keeps a ground floor and a basement, and only a missing floor is null', function (mixed $floor, ?int $read): void {
    $item = legacyItem(100001, ['floor' => $floor]);

    if ($floor === 'absent') {
        unset($item['floor']);
    }

    expect(LegacyFixtures::summaryTranslator()->translate($item)['floor'])->toBe($read);
})->with([
    'ground' => [0, 0],
    'basement' => [-1, -1],
    'third' => [3, 3],
    'as a float' => [3.0, 3],
    'null' => [null, null],
    'absent' => ['absent', null],
]);

it('sets has_video by the truthiness of video', function (mixed $video, bool $has): void {
    expect(translatedItem(['video' => $video])['has_video'])->toBe($has);
})->with([
    'a link' => ['https://t.me/stub_channel_a/4002', true],
    'an object' => [['url' => 'x'], true],
    'true' => [true, true],
    'null' => [null, false],
    'false' => [false, false],
    'empty' => ['', false],
    'zero' => [0, false],
]);

it('reads metro_km and center_km as numbers or null, and needs both coordinates for a location', function (): void {
    $item = translatedItem(['metro_km' => 'близко', 'center_km' => null, 'lon' => null]);

    expect($item['metro'])->toBe(['name' => 'Минор', 'km' => null])
        ->and($item['center_km'])->toBeNull()
        ->and($item['location'])->toBeNull()
        ->and(translatedItem(['metro' => null])['metro'])->toBeNull()
        ->and(translatedItem(['metro_km' => 1])['metro']['km'])->toBe(1);
});

it('matches the district in the city of the filters, and gives null for a name it does not know', function (): void {
    expect(translatedItem()['district'])->toBe(['code' => 'yunusobod', 'name' => 'Юнусабад'])
        ->and(translatedItem(['district_name' => 'Новый район'])['district'])->toBe(['code' => null, 'name' => 'Новый район'])
        ->and(translatedItem(['district_name' => null])['district'])->toBeNull();
});

it('takes usd, else price_usd, for the raw price', function (array $item, ?int $usd): void {
    expect(translatedItem($item)['price']['usd'])->toBe($usd);
})->with([
    'usd' => [['usd' => 600], 600],
    'price_usd' => [['usd' => null, 'price_usd' => 610], 610],
    'a non-numeric usd and a price_usd' => [['usd' => 'n/a', 'price_usd' => 610], 610],
    'neither' => [['usd' => null], null],
]);

it('rewrites the preview photos and the cover, and counts photos_count less the dropped addresses, else the addresses sent', function (): void {
    $item = translatedItem(['photos_count' => 8, 'cover' => '/media/100001/2.jpg?e=1&s=abc', 'photos_preview' => ['/media/100001/1.jpg?e=1&s=abc', 'https://elsewhere.invalid/x.jpg']]);
    $withoutCount = translatedItem(['photos_count' => null, 'photos_preview' => ['/media/100001/1.jpg?e=1&s=abc', '/media/100001/2.jpg?e=1&s=abc']]);
    $allDropped = translatedItem(['photos_count' => 3, 'photos_preview' => ['https://elsewhere.invalid/1.jpg', 'https://elsewhere.invalid/2.jpg']]);

    expect($item['photos'])->toBe([
        'preview' => [LegacyFixtures::MEDIA.'/100001/1.jpg?e=1&s=abc'],
        'count' => 7,
        'cover' => LegacyFixtures::MEDIA.'/100001/2.jpg?e=1&s=abc',
    ])->and($withoutCount['photos']['count'])->toBe(2)
        ->and($allDropped['photos'])->toMatchArray(['preview' => [], 'count' => 1]);
});

it('gives empty photo lists and a count of 0 without a configured media base', function (): void {
    $item = LegacyFixtures::summaryTranslator('')->translate(legacyItem(100024));

    expect(legacyItem(100024)['photos_count'])->toBeGreaterThan(0)
        ->and($item['photos'])->toBe(['preview' => [], 'count' => 0, 'cover' => null]);
});

it('ignores the per-user flags legacy sends for the service key', function (): void {
    expect(translatedItem(['favorite' => true, 'viewed' => true]))->toMatchArray(['favorite' => false, 'viewed' => false]);
});

it('marks every item legacy, with no type and no deal on a preview, and a deal from deal_type when sent', function (): void {
    expect(translatedItem())->toMatchArray(['origin' => 'legacy', 'type' => null, 'deal' => null, 'source_ref' => null])
        ->and(translatedItem(['deal_type' => 'sale'])['deal'])->toBe('sale')
        ->and(translatedItem(['deal_type' => 'rent'])['deal'])->toBeNull();
});

it('reads the flags strictly and is_owner as true, false or null', function (): void {
    expect(translatedItem(['pets_ok' => 'yes', 'owner_verified' => 1, 'is_owner' => 'yes']))->toMatchArray(['pets_ok' => false, 'owner_verified' => false, 'is_owner' => null])
        ->and(translatedItem(['is_owner' => false])['is_owner'])->toBeFalse();
});

it('builds the preview object of the data layer', function (): void {
    expect(LegacyFixtures::summaryTranslator()->toData(legacyItem()))->toBeInstanceOf(ListingSummary::class);
});

it('refuses an item that does not fit, naming the key in the page', function (array $item, string $key): void {
    try {
        LegacyFixtures::summaryTranslator()->page(['items' => [legacyItem(), $item], 'next_cursor' => null]);
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe([$key])
            ->and($error->path)->toBe('/api/feed');

        return;
    }

    throw new LogicException("{$key} was accepted.");
})->with([
    'id missing' => [legacyItem(100013, ['id' => null]), 'items.1.id'],
    'id zero' => [legacyItem(100013, ['id' => 0]), 'items.1.id'],
    'id a string' => [legacyItem(100013, ['id' => '100013']), 'items.1.id'],
    'id at the native floor (a collision is never served)' => [legacyItem(100013, ['id' => LegacyFixtures::NATIVE_FLOOR]), 'items.1.id'],
    'photos_preview missing' => [legacyItem(100013, ['photos_preview' => null]), 'items.1.photos_preview'],
    'photos_preview not a list' => [legacyItem(100013, ['photos_preview' => '/media/1/1.jpg']), 'items.1.photos_preview'],
]);

it('refuses a page whose cursor or items do not fit, and ends the list on an empty cursor', function (): void {
    $translator = LegacyFixtures::summaryTranslator();

    expect(fn () => $translator->page(['items' => [], 'next_cursor' => 5]))->toThrow(LegacyContractError::class)
        ->and(fn () => $translator->page(['items' => [1], 'next_cursor' => null]))->toThrow(LegacyContractError::class)
        ->and($translator->page(['items' => [], 'next_cursor' => ''])['next_cursor'])->toBeNull();
});

it('passes on a legacy cursor of up to 256 bytes and refuses a longer one, naming next_cursor', function (): void {
    $translator = LegacyFixtures::summaryTranslator();
    $longest = str_repeat('c', LegacyFeedCursor::MAX_LEGACY_BYTES);

    expect(LegacyFeedCursor::MAX_LEGACY_BYTES)->toBe(256)
        ->and($translator->page(['items' => [], 'next_cursor' => $longest])['next_cursor'])->toBe($longest);

    try {
        $translator->page(['items' => [], 'next_cursor' => $longest.'c']);
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe(['next_cursor'])
            ->and($error->path)->toBe('/api/feed');

        return;
    }

    throw new LogicException('A cursor of 257 bytes was accepted.');
});

it('writes posted.at as an ATOM time in the zone legacy sent, and null for a time without a zone', function (mixed $sent, ?string $at): void {
    $seen = Coercions::collect();
    $item = LegacyFixtures::summaryTranslator()->translate(legacyItem(100001, ['posted_at' => $sent]), seen: $seen);

    expect($item['posted']['at'])->toBe($at)
        ->and($seen->keys())->toBe($at === null && $sent !== null ? ['posted_at'] : []);
})->with([
    'with an offset' => ['2026-11-14T06:40:00+00:00', '2026-11-14T06:40:00+00:00'],
    'Z' => ['2026-11-14T06:40:00Z', '2026-11-14T06:40:00+00:00'],
    'an offset without a colon' => ['2026-11-14T11:40:00+0500', '2026-11-14T11:40:00+05:00'],
    'a fraction of a second' => ['2026-11-14T06:40:00.250Z', '2026-11-14T06:40:00+00:00'],
    'minutes only' => ['2026-11-14T06:40Z', '2026-11-14T06:40:00+00:00'],
    'no zone' => ['2026-11-14T06:40:00', null],
    'a date alone' => ['2026-11-14', null],
    'a space instead of T' => ['2026-11-14 06:40:00+00:00', null],
    'a day that does not exist' => ['2026-02-31T06:40:00Z', null],
    'relative words' => ['+1 week', null],
    'a number' => [1795132800, null],
    'absent' => [null, null],
]);

it('notes the keys whose values it could not use as sent, by their place, and never a value', function (): void {
    $seen = Coercions::collect();
    $page = LegacyFixtures::summaryTranslator()->page(['items' => [legacyItem(100001), legacyItem(100013, [
        'floor' => 2.5,
        'rooms' => '2',
        'deal_type' => 'lease',
        'price_kind' => 'auction',
        'pets_ok' => 'yes',
        'metro_km' => '0,7',
        'photos_count' => -1,
        'usd' => '+998 00 765 43 21',
        'district_name' => ['+998 00 765 43 21' => 1],
    ])], 'next_cursor' => ''], 'tashkent', $seen);

    expect($page['items'][1])->toMatchArray(['floor' => 3, 'rooms' => null, 'deal' => null, 'pets_ok' => false, 'district' => null])
        ->and($page['items'][1]['price']['kind'])->toBeNull()
        ->and($seen->keys())->toEqualCanonicalizing([
            'next_cursor', 'items.1.floor', 'items.1.rooms', 'items.1.deal_type', 'items.1.price_kind', 'items.1.pets_ok',
            'items.1.metro_km', 'items.1.photos_count', 'items.1.usd', 'items.1.district_name',
        ])
        ->and(json_encode($seen->keys()))->not->toContain('765');
});

it('notes nothing for the golden feed pages, nor for keys that are absent or null', function (): void {
    $seen = Coercions::collect();
    $translator = LegacyFixtures::summaryTranslator();
    $translator->page(LegacyFixtures::golden('feed.default'), 'tashkent', $seen);
    $translator->page(LegacyFixtures::golden('feed.page2'), 'tashkent', $seen);
    $translator->translate(['id' => 100014, 'photos_preview' => []], seen: $seen);
    $translator->translate(['id' => 100014, 'photos_preview' => [], 'floor' => null, 'deal_type' => null, 'posted_at' => null], seen: $seen);

    expect($seen->keys())->toBe([])
        ->and($seen->count())->toBe(0);
});
