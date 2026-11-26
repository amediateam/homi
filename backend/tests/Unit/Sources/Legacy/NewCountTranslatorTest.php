<?php

use App\Enums\ListingSort;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Legacy\Translators\FiltersTranslator;
use App\Services\Sources\Legacy\Translators\NewCountTranslator;
use Tests\Support\FilterArrays;
use Tests\Support\LegacyFixtures;

it('reads the golden new-since answer as 12', function (): void {
    expect(NewCountTranslator::count(LegacyFixtures::golden('feed_new')))->toBe(12);
});

it('sends the filter query of the count plus since, and no sort, cursor or limit', function (): void {
    $filters = SearchFilters::fromNormalised(FilterArrays::defaults(['districts' => ['yunusobod'], 'area_min' => 40, 'furnished' => false]));
    $query = NewCountTranslator::query($filters, 1_795_000_000);

    expect($query)->toBe([...FiltersTranslator::toQuery($filters), 'since' => 1_795_000_000])
        ->and($query)->not->toHaveKeys(['sort', 'cursor', 'limit'])
        ->and(NewCountTranslator::query($filters, 0)['since'])->toBe(0)
        ->and(FiltersTranslator::toQuery($filters, ListingSort::Cheap))->toHaveKey('sort');
});

it('reads a whole count, a zero and a whole number sent as a float', function (mixed $count, int $read): void {
    expect(NewCountTranslator::count(['count' => $count]))->toBe($read);
})->with([
    'whole' => [12, 12],
    'zero' => [0, 0],
    'a zero fraction' => [12.0, 12],
]);

it('refuses a count that is not a whole number ≥ 0, naming count (LB-API-055)', function (array $answer): void {
    try {
        NewCountTranslator::count($answer);
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe(['count'])
            ->and($error->path)->toBe(NewCountTranslator::PATH)
            ->and([$error->status, $error->errorCode])->toBe([503, 'source_unavailable']);

        return;
    }

    throw new LogicException('The count was accepted.');
})->with([
    'missing' => [[]],
    'null' => [['count' => null]],
    'a string' => [['count' => '12']],
    'negative' => [['count' => -1]],
    'a fraction' => [['count' => 2.5]],
    'a boolean' => [['count' => true]],
    'a list' => [['count' => [12]]],
]);

it('names the count path for GET /api/feed/count', function (): void {
    expect(fn () => NewCountTranslator::count([], NewCountTranslator::COUNT_PATH))
        ->toThrow(fn (LegacyContractError $error) => expect($error->path)->toBe('/api/feed/count'));
});
