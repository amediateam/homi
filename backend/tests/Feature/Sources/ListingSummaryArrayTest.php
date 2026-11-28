<?php

use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;
use App\Services\Sources\Stub\StubListingSource;

/*
 * WP-45: `ListingSummary::toArray()` is the inverse of `fromArray()`, so a cache that refuses objects (AM-120) can hold
 * a preview as an array — the radar previews' shared part (`RadarPreviews`). Checked over every listing of the stub
 * catalogue, directly and through JSON (a Redis store answers what it was given as a serialised array).
 */
it('writes every preview of the stub catalogue to an array that reads back into an equal preview, scalars only', function (): void {
    $stub = app(StubListingSource::class);
    $previews = $stub->previews(array_keys($stub->entries()), SourceContext::system());

    expect($previews)->not->toBeEmpty();

    foreach ($previews as $preview) {
        $array = $preview->toArray();
        array_walk_recursive($array, fn (mixed $value) => expect(is_object($value))->toBeFalse());

        expect(ListingSummary::fromArray($array))->toEqual($preview)
            ->and(ListingSummary::fromArray(json_decode(json_encode($array, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR)))->toEqual($preview);
    }
});
