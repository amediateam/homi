<?php

use App\Services\Identity\DigestSchedule;
use Carbon\CarbonImmutable;

/** A wall-clock moment of Tashkent (UTC+5), given to the schedule as a UTC instant. */
function digestMoment(string $wallClock): CarbonImmutable
{
    return CarbonImmutable::parse($wallClock, 'Asia/Tashkent')->utc();
}

it('keeps the hours sorted and without repeats', function (array $hours, array $kept): void {
    expect(DigestSchedule::fromHours($hours)->hours)->toBe($kept);
})->with([
    'sorted already' => [[9, 19], [9, 19]],
    'out of order' => [[20, 12], [12, 20]],
    'with a repeat' => [[19, 9, 19], [9, 19]],
    'midnight and the last hour' => [[23, 0], [0, 23]],
    'empty' => [[], []],
]);

it('refuses a value that is not a whole hour of a day', function (array $hours): void {
    expect(fn () => DigestSchedule::fromHours($hours))->toThrow(InvalidArgumentException::class);
})->with([
    'hour 24' => [[9, 24]],
    'a negative hour' => [[-1]],
    'a string' => [['9']],
    'a float' => [[9.0]],
    'null' => [[null]],
]);

it('gives the first slot at or after the moment, in Tashkent', function (array $hours, string $wallClock, string $slot): void {
    $next = DigestSchedule::fromHours($hours)->nextSlotAtOrAfter(digestMoment($wallClock));

    expect($next?->toIso8601String())->toBe($slot)
        ->and($next?->getTimezone()->getName())->toBe('Asia/Tashkent');
})->with([
    'before the first slot' => [[9, 19], '2026-11-27 08:59:59', '2026-11-27T09:00:00+05:00'],
    'at a slot' => [[9, 19], '2026-11-27 09:00:00', '2026-11-27T09:00:00+05:00'],
    'just after a slot' => [[9, 19], '2026-11-27 09:00:01', '2026-11-27T19:00:00+05:00'],
    'after the last slot of the day' => [[9, 19], '2026-11-27 19:30', '2026-11-28T09:00:00+05:00'],
    'one slot, passed today' => [[9], '2026-11-27 10:00', '2026-11-28T09:00:00+05:00'],
    'a slot at midnight' => [[0], '2026-11-27 23:59', '2026-11-28T00:00:00+05:00'],
]);

it('reads the moment in Tashkent whatever its zone', function (): void {
    // 04:30 UTC is 09:30 in Tashkent, after the morning slot.
    expect(DigestSchedule::fromHours([9, 19])->nextSlotAtOrAfter(CarbonImmutable::parse('2026-11-27 04:30', 'UTC'))?->toIso8601String())
        ->toBe('2026-11-27T19:00:00+05:00');
});

it('has no slot when empty', function (): void {
    expect(DigestSchedule::fromHours([])->nextSlotAtOrAfter(digestMoment('2026-11-27 09:00')))->toBeNull();
});
