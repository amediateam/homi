<?php

use App\Services\Identity\QuietWindow;
use Carbon\CarbonImmutable;

/** A wall-clock moment of Tashkent (UTC+5), given to the window as a UTC instant. */
function tashkentMoment(string $wallClock): CarbonImmutable
{
    return CarbonImmutable::parse($wallClock, 'Asia/Tashkent')->utc();
}

it('holds no moment and has no end when off', function (): void {
    $window = QuietWindow::fromHours(null, null);

    expect($window->isOff())->toBeTrue()
        ->and($window->toArray())->toBeNull()
        ->and($window->contains(tashkentMoment('2026-11-26 23:30')))->toBeFalse()
        ->and($window->contains(tashkentMoment('2026-11-26 03:00')))->toBeFalse()
        ->and($window->endAfter(tashkentMoment('2026-11-26 23:30')))->toBeNull()
        ->and(QuietWindow::off())->toEqual($window);
});

it('crosses midnight for 23–08: the start hour is in, the end hour is out', function (string $wallClock, bool $inside): void {
    $window = QuietWindow::fromHours(23, 8);

    expect($window->isOff())->toBeFalse()
        ->and($window->toArray())->toBe(['from' => 23, 'to' => 8])
        ->and($window->contains(tashkentMoment($wallClock)))->toBe($inside);
})->with([
    'the evening before' => ['2026-11-26 22:59:59', false],
    'the start' => ['2026-11-26 23:00:00', true],
    'midnight' => ['2026-11-27 00:00:00', true],
    'the last minute' => ['2026-11-27 07:59:59', true],
    'the end' => ['2026-11-27 08:00:00', false],
    'noon' => ['2026-11-27 12:00:00', false],
]);

it('starts at midnight for 00–09', function (string $wallClock, bool $inside): void {
    expect(QuietWindow::fromHours(0, 9)->contains(tashkentMoment($wallClock)))->toBe($inside);
})->with([
    'the minute before midnight' => ['2026-11-26 23:59:59', false],
    'midnight' => ['2026-11-27 00:00:00', true],
    'the last minute' => ['2026-11-27 08:59:59', true],
    'the end' => ['2026-11-27 09:00:00', false],
]);

it('reads the hour in Tashkent whatever the zone of the moment', function (): void {
    $window = QuietWindow::fromHours(23, 8);

    // 18:30 UTC and 21:30 in Moscow are 23:30 in Tashkent; 17:30 UTC is 22:30 there.
    expect($window->contains(CarbonImmutable::parse('2026-11-26 18:30', 'UTC')))->toBeTrue()
        ->and($window->contains(CarbonImmutable::parse('2026-11-26 21:30', 'Europe/Moscow')))->toBeTrue()
        ->and($window->contains(new DateTime('2026-11-26 17:30', new DateTimeZone('UTC'))))->toBeFalse();
});

it('ends at the next end hour after the moment, in Tashkent', function (int $from, int $to, string $wallClock, string $end): void {
    $after = QuietWindow::fromHours($from, $to)->endAfter(tashkentMoment($wallClock));

    expect($after?->toIso8601String())->toBe($end)
        ->and($after?->getTimezone()->getName())->toBe('Asia/Tashkent');
})->with([
    '23–08, inside before midnight' => [23, 8, '2026-11-26 23:30', '2026-11-27T08:00:00+05:00'],
    '23–08, inside after midnight' => [23, 8, '2026-11-27 03:00', '2026-11-27T08:00:00+05:00'],
    '23–08, outside' => [23, 8, '2026-11-27 12:00', '2026-11-28T08:00:00+05:00'],
    '23–08, at the end' => [23, 8, '2026-11-27 08:00', '2026-11-28T08:00:00+05:00'],
    '00–09, at the start' => [0, 9, '2026-11-27 00:00', '2026-11-27T09:00:00+05:00'],
    '00–09, the minute before' => [0, 9, '2026-11-26 23:59', '2026-11-27T09:00:00+05:00'],
]);

it('refuses a malformed window', function (?int $from, ?int $to): void {
    expect(fn () => QuietWindow::fromHours($from, $to))->toThrow(InvalidArgumentException::class);
})->with([
    'a start without an end' => [23, null],
    'an end without a start' => [null, 8],
    'hour 24' => [24, 8],
    'a negative hour' => [-1, 8],
    'an end of 24' => [23, 24],
    'equal ends' => [8, 8],
]);
