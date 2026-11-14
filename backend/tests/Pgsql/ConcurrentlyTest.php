<?php

use Illuminate\Support\Facades\DB;

it('runs a task in a child process of the testing environment on the test database', function (): void {
    [$child] = concurrently([static fn (): array => [
        'environment' => app()->environment(),
        'driver' => DB::connection()->getDriverName(),
        'database' => DB::connection()->getDatabaseName(),
        'pid' => getmypid(),
    ]]);

    expect($child['environment'])->toBe('testing')
        ->and($child['driver'])->toBe('pgsql')
        ->and($child['database'])->toBe(DB::connection()->getDatabaseName())
        ->and($child['database'])->toEndWith('_test')
        ->and($child['pid'])->not->toBe(getmypid());
});

it('returns the results in the order of the tasks', function (): void {
    $tasks = [];

    foreach (range(1, 5) as $i) {
        $tasks[] = static function () use ($i): int {
            usleep((6 - $i) * 50_000);

            return $i * 10;
        };
    }

    expect(concurrently($tasks))->toBe([10, 20, 30, 40, 50]);
});
