<?php

use App\Services\Sources\Legacy\Translators\Coercions;
use App\Services\Sources\Legacy\Translators\LegacyValue;

/*
 * The keys of one legacy answer whose values HOMI could not use as sent (WP-42): names only, placed, bounded.
 */

it('collects placed key names through its views, once each, counting every note', function (): void {
    $seen = Coercions::collect();
    $item = $seen->at('items.3.');
    $item->note('floor');
    $item->at('stats.')->note('views');
    $item->note('floor');
    $seen->note('next_cursor');

    expect($seen->keys())->toBe(['items.3.floor', 'items.3.stats.views', 'next_cursor'])
        ->and($item->keys())->toBe($seen->keys())
        ->and($seen->count())->toBe(4);
});

it('keeps at most MAX_KEYS names and still counts the rest', function (): void {
    $seen = Coercions::collect();

    foreach (range(0, Coercions::MAX_KEYS + 9) as $index) {
        $seen->note("items.{$index}.floor");
    }

    expect($seen->keys())->toHaveCount(Coercions::MAX_KEYS)
        ->and($seen->count())->toBe(Coercions::MAX_KEYS + 10);
});

it('notes a present value of another type, a fraction, a negative count and a list that is not one; never an absent or null key', function (): void {
    $seen = Coercions::collect();
    $data = [
        'text' => 5, 'blank' => ' ', 'number' => '1.5', 'whole' => 2.0, 'fraction' => 2.5, 'count' => -1,
        'flag' => 'yes', 'bool' => 1, 'list' => 'x', 'objects' => [['a' => 1], 'b'], 'null' => null,
    ];

    expect(LegacyValue::string($data, 'text', $seen))->toBeNull()
        ->and(LegacyValue::string($data, 'blank', $seen))->toBeNull()
        ->and(LegacyValue::number($data, 'number', $seen))->toBeNull()
        ->and(LegacyValue::int($data, 'whole', $seen))->toBe(2)
        ->and(LegacyValue::int($data, 'fraction', $seen))->toBe(3)
        ->and(LegacyValue::count($data, 'count', $seen))->toBeNull()
        ->and(LegacyValue::flag($data, 'flag', $seen))->toBeFalse()
        ->and(LegacyValue::bool($data, 'bool', $seen))->toBeNull()
        ->and(LegacyValue::objects($data, 'list', $seen))->toBe([])
        ->and(LegacyValue::objects($data, 'objects', $seen))->toBe([0 => ['a' => 1]])
        ->and(LegacyValue::string($data, 'null', $seen))->toBeNull()
        ->and(LegacyValue::int($data, 'absent', $seen))->toBeNull()
        ->and(LegacyValue::truthy($data, 'flag'))->toBeTrue();

    expect($seen->keys())->toBe(['text', 'number', 'fraction', 'count', 'flag', 'bool', 'list', 'objects.1']);
});
