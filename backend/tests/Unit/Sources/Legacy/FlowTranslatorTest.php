<?php

use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Legacy\Translators\Coercions;
use App\Services\Sources\Legacy\Translators\FlowTranslator;
use Tests\Support\FilterArrays;
use Tests\Support\LegacyFixtures;

it('reads a flow without options as an empty list of options', function (): void {
    expect(FlowTranslator::translate(LegacyFixtures::golden('flow')))->toBe(['week' => 21, 'days' => 7, 'options' => []]);
});

it('reads every option\'s filters through fromLegacy: zones from zone, types of the deal, defaults for missing keys', function (): void {
    $flow = FlowTranslator::translate(LegacyFixtures::golden('flow.options'));
    $stub = LegacyFixtures::stub('listings/flow.options');

    expect($flow['week'])->toBe(3)
        ->and($flow['options'][0]['filters'])->toBe(FilterArrays::defaults(['price_max' => 700, 'zones' => ['center']]))
        ->and($flow['options'][1]['filters'])->toBe($stub[1]['filters'])
        ->and(array_column($flow['options'], 'count'))->toBe([34, null])
        ->and(array_keys($flow['options'][0]['filters']))->toBe(FilterArrays::KEYS)
        ->and(FlowTranslator::toData(LegacyFixtures::golden('flow.options')))->toBeInstanceOf(FlowEstimate::class);
});

it('raises a window below one day to one', function (int|float $days): void {
    expect(FlowTranslator::translate(['week' => 0, 'days' => $days])['days'])->toBe(1);
})->with([0, -3, 0.0, 0.5]);

it('reads a numeric option count as a whole number and anything else as null', function (mixed $count, ?int $read): void {
    $option = LegacyFixtures::golden('flow.options')['options'][1];

    expect(FlowTranslator::translate(['week' => 1, 'days' => 7, 'options' => [[...$option, 'count' => $count]]])['options'][0]['count'])->toBe($read);
})->with([[12, 12], [12.0, 12], [11.6, 12], ['12', null], [null, null]]);

it('refuses what the contract requires, naming the key', function (array $answer, string $key): void {
    try {
        FlowTranslator::translate($answer);
    } catch (LegacyContractError $error) {
        expect($error->keys)->toBe([$key]);

        return;
    }

    throw new LogicException("{$key} was accepted.");
})->with(function (): array {
    return [
        'week missing' => [['days' => 7], 'week'],
        'week negative' => [['week' => -1, 'days' => 7], 'week'],
        'days missing' => [['week' => 1], 'days'],
        'days a fraction' => [['week' => 1, 'days' => 6.5], 'days'],
    ];
});

it('leaves out an option that does not fit and notes it under its place, keeping the others', function (mixed $options, array $noted): void {
    $good = LegacyFixtures::golden('flow.options')['options'][1];
    $seen = Coercions::collect();
    $flow = FlowTranslator::translate(['week' => 1, 'days' => 7, 'options' => is_array($options) ? [...$options, $good] : $options], $seen);

    expect(array_column($flow['options'], 'code'))->toBe(is_array($options) ? [$good['code']] : [])
        ->and($seen->keys())->toBe($noted);
})->with(function (): array {
    $option = LegacyFixtures::golden('flow.options')['options'][0];
    $withoutLabel = $option;
    unset($withoutLabel['label']);

    return [
        'options not a list' => ['none', ['options']],
        'an option without a label' => [[$withoutLabel], ['options.0.label']],
        'an option without filters' => [[['code' => 'x', 'label' => 'x', 'rate' => 'x']], ['options.0.filters']],
        'an option with a bad deal' => [[['code' => 'x', 'label' => 'x', 'rate' => 'x', 'filters' => ['deal' => 'rent']]], ['options.0.filters.deal']],
        'an option with a tenant legacy does not have' => [[[...$option, 'filters' => [...$option['filters'], 'tenant' => 'students']]], ['options.0.filters.tenant']],
        'an option that is not an object' => [['x'], ['options.0']],
    ];
});

it('notes nothing for the golden flows', function (string $fixture): void {
    $seen = Coercions::collect();
    FlowTranslator::translate(LegacyFixtures::golden($fixture), $seen);

    expect($seen->keys())->toBe([]);
})->with(['flow', 'flow.options']);

it('notes an option count of another type, and rounds a fraction with a note', function (): void {
    $option = LegacyFixtures::golden('flow.options')['options'][1];
    $seen = Coercions::collect();
    $flow = FlowTranslator::translate(['week' => 1, 'days' => 7, 'options' => [[...$option, 'count' => '12'], [...$option, 'count' => 11.6]]], $seen);

    expect(array_column($flow['options'], 'count'))->toBe([null, 12])
        ->and($seen->keys())->toBe(['options.0.count', 'options.1.count']);
});
