<?php

use App\Enums\Deal;
use App\Enums\PropertyType;
use App\Services\Sources\Data\ListingContact;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Data\ListingTranslation;
use App\Services\Sources\Data\MapPoint;
use App\Services\Sources\Data\MapPoints;
use App\Services\Sources\Data\PriceInfo;
use Tests\Support\ListingArrays;

it('reads a preview with its raw values next to the display strings', function (): void {
    $summary = ListingSummary::fromArray(ListingArrays::preview());

    expect($summary->number)->toBe(100012)
        ->and($summary->deal)->toBe(Deal::RentLong)
        ->and($summary->type)->toBe(PropertyType::Apartment)
        ->and($summary->price?->usd)->toBe(600)
        ->and($summary->areaTotal)->toBe(54.0)
        ->and($summary->districtCode)->toBe('yunusobod')
        ->and($summary->sourceRef?->postId)->toBe(4812);
});

it('reads the nullable parts of a preview as null', function (): void {
    $summary = ListingSummary::fromArray(ListingArrays::preview([
        'deal' => null, 'type' => null, 'price' => null, 'district' => null, 'metro' => null, 'location' => null, 'source_ref' => null,
    ]));

    expect([$summary->deal, $summary->type, $summary->price, $summary->districtName, $summary->metroName, $summary->location, $summary->sourceRef])
        ->each->toBeNull();
});

it('keeps the ground-level floor 0 and a basement floor, and reads only null as unknown', function (?int $floor): void {
    expect(ListingSummary::fromArray(ListingArrays::preview(['floor' => $floor]))->floor)->toBe($floor);
})->with([[0], [-1], [null]]);

it('masks the phone numbers of every author-written field', function (): void {
    $raw = 'звоните +998 00 000 00 67';
    $details = ListingDetails::fromArray(ListingArrays::details([
        'title' => "Квартира, {$raw}", 'summary' => $raw,
        'offers' => [['text' => $raw, 'url' => null]],
        'original' => ['text' => $raw, 'url' => null, 'deleted' => false],
        'price_history' => [['at' => '2026-11-10T07:00:00+00:00', 'channel' => 'stub_channel_a', 'url' => null, 'text' => $raw, 'kind' => null, 'price_usd' => null, 'change_pct' => null]],
    ]));
    $translation = ListingTranslation::fromArray(['text' => $raw, 'locale' => 'uz']);

    expect([$details->preview->title, $details->summary, $details->offers[0]->text, $details->originalText, $details->priceHistory[0]->text, $translation->text])
        ->each->toContain('+998 ** *** ** 67')->not->toContain('000 00 67');
});

it('masks the author-written place, landmark, fact values and nearby notes too, and nothing HOMI writes', function (): void {
    $raw = 'звоните +998 00 000 00 67';
    $details = ListingDetails::fromArray(ListingArrays::details([
        'place' => "Массив Ц-5, {$raw}", 'landmark' => $raw,
        'facts' => [['key' => 'rooms', 'label' => 'Комнат', 'value' => '2'], ['key' => 'note', 'label' => 'Тел +998 00 000 00 68', 'value' => $raw]],
        'nearby' => [['kind' => 'park', 'name' => 'Парк +998 00 000 00 69', 'km' => 0.4, 'note' => $raw]],
    ]));

    expect([$details->preview->place, $details->preview->landmark, $details->facts[1]->value, $details->nearby[0]->note])
        ->each->toContain('+998 ** *** ** 67')->not->toContain('000 00 67')
        ->and($details->facts[0]->value)->toBe('2')
        ->and($details->facts[1]->label)->toBe('Тел +998 00 000 00 68')
        ->and($details->nearby[0]->name)->toBe('Парк +998 00 000 00 69')
        ->and($details->preview->districtName)->toBe('Юнусабадский');
});

it('keeps a price kind only when it is down_payment or business (BR-API-156, Q-API-065)', function (?string $kind, ?string $kept): void {
    expect(PriceInfo::fromArray(['display' => '$85 000', 'period' => null, 'alt' => null, 'notes' => [], 'usd' => 85000, 'kind' => $kind])->kind?->value)->toBe($kept);
})->with([['down_payment', 'down_payment'], ['business', 'business'], ['installment', null], [null, null]]);

it('reads the card without any phone of the author', function (): void {
    $details = ListingDetails::fromArray(ListingArrays::details());

    expect($details->hasPhone)->toBeTrue()
        ->and($details->contactUrl)->toBeNull()
        ->and(property_exists($details, 'phone'))->toBeFalse()
        ->and($details->comparison?->value)->toBe(680.0);
});

it('gives a call link with every phone of a contact', function (): void {
    expect(fn () => ListingContact::fromArray(['call_url' => null, 'expires_at' => '2026-11-14T10:20:00+00:00', 'phone' => '+998000000067', 'phone_display' => '+998 00 000-00-67']))
        ->toThrow(InvalidArgumentException::class, 'call_url');
});

it('writes a map label as plain text', function (): void {
    expect(MapPoint::fromArray(['number' => 1, 'origin' => 'legacy', 'lat' => 41.3, 'lon' => 69.2, 'label' => '<b>$600</b> & up', 'tone' => 'good', 'priced' => true, 'usd' => 600])->label)
        ->toBe('b>$600/b> up');
});

it('refuses map counts out of order: points ≤ with_point ≤ total', function (int $points, int $total, int $withPoint): void {
    $point = MapPoint::fromArray(['number' => 1, 'origin' => 'legacy', 'lat' => 41.3, 'lon' => 69.2, 'label' => '$600', 'tone' => null, 'priced' => true, 'usd' => 600]);

    expect(fn () => new MapPoints(array_fill(0, $points, $point), $total, $withPoint))->toThrow(InvalidArgumentException::class);
})->with([
    'more points than listings with a point' => [2, 5, 1],
    'more listings with a point than listings' => [1, 2, 3],
]);

it('refuses a preview that misses or mistypes a field', function (array $data, string $field): void {
    expect(fn () => ListingSummary::fromArray($data))->toThrow(InvalidArgumentException::class, $field);
})->with([
    'missing title' => [array_diff_key(ListingArrays::preview(), ['title' => true]), 'title'],
    'string number' => [ListingArrays::preview(['number' => '100012']), 'number'],
    'unknown deal' => [ListingArrays::preview(['deal' => 'barter']), 'deal'],
    'photos without count' => [ListingArrays::preview(['photos' => ['preview' => [], 'cover' => null]]), 'count'],
    'missing place' => [array_diff_key(ListingArrays::preview(), ['place' => true]), 'place'],
]);

it('writes the nullable parts and the flags of a preview back as they were read', function (): void {
    $preview = ListingSummary::fromArray(ListingArrays::preview([
        'deal' => null, 'type' => null, 'price' => null, 'district' => null, 'metro' => null, 'location' => null, 'source_ref' => null,
    ]))->withFlags(favorite: true, viewed: true);

    expect(ListingSummary::fromArray($preview->toArray()))->toEqual($preview);
});
