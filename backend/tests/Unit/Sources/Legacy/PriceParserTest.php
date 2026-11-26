<?php

use App\Enums\PriceKind;
use App\Services\Sources\Data\PriceInfo;
use App\Services\Sources\Legacy\Translators\PriceParser;

it('splits a legacy price string the way the client did (03 §1.12)', function (?string $price, ?array $parts): void {
    expect(PriceParser::parts($price, null, null))->toBe($parts);
})->with([
    'amount only' => ['$150 000', ['display' => '$150 000', 'period' => null, 'alt' => null, 'notes' => [], 'usd' => null, 'kind' => null]],
    'amount with a period' => ['$45/сутки', ['display' => '$45', 'period' => '/сутки', 'alt' => null, 'notes' => [], 'usd' => null, 'kind' => null]],
    'with bracket text' => ['$600/мес (≈ 7,7 млн сум)', ['display' => '$600', 'period' => '/мес', 'alt' => '≈ 7,7 млн сум', 'notes' => [], 'usd' => null, 'kind' => null]],
    'bracket before the period' => ['$600 (≈ 7,7 млн сум)/мес', ['display' => '$600', 'period' => '/мес', 'alt' => '≈ 7,7 млн сум', 'notes' => [], 'usd' => null, 'kind' => null]],
    'with notes' => ['$600/мес (≈ 7,7 млн сум) · депозит $600 · без комиссии', ['display' => '$600', 'period' => '/мес', 'alt' => '≈ 7,7 млн сум', 'notes' => ['депозит $600', 'без комиссии'], 'usd' => null, 'kind' => null]],
    'a sum in UZS' => ['7 700 000 сум/мес', ['display' => '7 700 000 сум', 'period' => '/мес', 'alt' => null, 'notes' => [], 'usd' => null, 'kind' => null]],
    'negotiable' => ['Договорная', ['display' => 'Договорная', 'period' => null, 'alt' => null, 'notes' => [], 'usd' => null, 'kind' => null]],
    'null' => [null, null],
    'empty' => ['  ', null],
]);

it('keeps the two price kinds legacy labels and drops any other (BR-API-156, Q-API-065)', function (?string $kind, ?string $kept): void {
    expect(PriceParser::parts('$85 000', $kind, null))->toHaveKey('kind', $kept);
})->with([
    'down payment' => ['down_payment', 'down_payment'],
    'business' => ['business', 'business'],
    'unknown' => ['installment', null],
    'none' => [null, null],
]);

it('keeps a numeric usd as whole USD and drops anything else', function (mixed $usd, ?int $kept): void {
    expect(PriceParser::parts('$600', null, $usd))->toHaveKey('usd', $kept);
})->with([
    'whole' => [600, 600],
    'whole as a float' => [600.0, 600],
    'a fraction rounds' => [599.6, 600],
    'zero' => [0, 0],
    'negative' => [-5, null],
    'a string' => ['600', null],
    'a text' => ['≈600', null],
    'null' => [null, null],
    'bool' => [true, null],
]);

it('builds the price object of the data layer', function (): void {
    $price = PriceParser::parse('$2 500/мес (≈ 32,0 млн сум)', 'business', 2500);

    expect($price)->toBeInstanceOf(PriceInfo::class)
        ->and($price?->display)->toBe('$2 500')
        ->and($price?->period)->toBe('/мес')
        ->and($price?->alt)->toBe('≈ 32,0 млн сум')
        ->and($price?->usd)->toBe(2500)
        ->and($price?->kind)->toBe(PriceKind::Business)
        ->and(PriceParser::parse(null, 'business', 2500))->toBeNull();
});
