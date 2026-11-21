<?php

use App\Services\Listings\ListingNumber;
use Tests\TestCase;

// The floor is configuration: the application is booted, without a database.
uses(TestCase::class);

it('takes every number from the floor up as native and every number below as legacy', function (): void {
    expect(ListingNumber::floor())->toBe(10000000)
        ->and(ListingNumber::isNative(10000000))->toBeTrue()
        ->and(ListingNumber::isNative(10000008))->toBeTrue()
        ->and(ListingNumber::isNative(9999999))->toBeFalse()
        ->and(ListingNumber::isNative(100024))->toBeFalse()
        ->and(ListingNumber::isNative(999404))->toBeFalse();
});

it('reads the floor from the configuration', function (): void {
    config(['owner.native_number_floor' => 500]);

    expect(ListingNumber::isNative(500))->toBeTrue()
        ->and(ListingNumber::isNative(499))->toBeFalse();
});
