<?php

use PHPUnit\Framework\AssertionFailedError;
use Tests\Support\JsonShape;

it('describes leaves by their type name', function (mixed $value, string $type): void {
    expect(JsonShape::of($value))->toBe($type);
})->with([
    ['text', 'string'],
    [7, 'int'],
    [7.5, 'float'],
    [true, 'bool'],
    [null, 'null'],
]);

it('describes an object by its keys and a list by the union of its elements', function (): void {
    $answer = [
        'number' => 7,
        'title' => 'Flat',
        'photos' => [['url' => 'a', 'width' => 640], ['url' => 'b', 'width' => null]],
        'tags' => [],
    ];

    expect(JsonShape::of($answer))->toBe([
        'number' => 'int',
        'title' => 'string',
        'photos' => ['*' => ['url' => 'string', 'width' => 'int|null']],
        'tags' => [],
    ]);
});

it('joins different element types of a list', function (): void {
    expect(JsonShape::of([1, 'a', 2.5]))->toBe(['*' => 'float|int|string'])
        ->and(JsonShape::of([['a' => 1], ['b' => 'x']]))->toBe(['*' => ['a' => 'int', 'b' => 'string']]);
});

it('accepts the same shape, null in place of any type, and an empty list in place of any list', function (): void {
    $expected = ['number' => 'int', 'price' => 'float', 'photos' => ['*' => ['url' => 'string']]];

    JsonShape::assertSame($expected, JsonShape::of(['number' => 1, 'price' => 2.5, 'photos' => [['url' => 'a']]]));
    JsonShape::assertSame($expected, JsonShape::of(['number' => 1, 'price' => null, 'photos' => []]));
    JsonShape::assertSame(['photos' => ['*' => ['url' => 'string']]], ['photos' => ['*' => ['url' => 'string|null']]]);

    expect(true)->toBeTrue();
});

it('fails with the path of the first difference', function (array $actual, string $message): void {
    $expected = ['data' => ['number' => 'int', 'photos' => ['*' => ['url' => 'string']]]];

    expect(fn () => JsonShape::assertSame($expected, JsonShape::of($actual)))
        ->toThrow(AssertionFailedError::class, $message);
})->with([
    'a wrong leaf type' => [['data' => ['number' => '7', 'photos' => []]], 'at data.number: expected int, got string'],
    'a missing key' => [['data' => ['photos' => []]], 'at data.number: missing'],
    'an extra key' => [['data' => ['number' => 1, 'photos' => [], 'phone' => 'x']], 'at data.phone: not expected'],
    'inside a list' => [['data' => ['number' => 1, 'photos' => [['url' => 5]]]], 'at data.photos.*.url: expected string, got int'],
    'an object for a leaf' => [['data' => ['number' => ['a' => 1], 'photos' => []]], 'at data.number: expected int, got an object'],
]);
