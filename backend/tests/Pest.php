<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Concurrency;
use Tests\DuskTestCase;
use Tests\PgsqlTestCase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

pest()->extend(DuskTestCase::class)
//  ->use(Illuminate\Foundation\Testing\DatabaseMigrations::class)
    ->in('Browser');

pest()->extend(PgsqlTestCase::class)
    ->group('pgsql')
    ->in('Pgsql');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/**
 * Run the tasks at the same time in child `php artisan` processes and return their results in
 * the order of the tasks (pgsql group only). A task is a static closure that captures scalars
 * only, because it is serialised into the child, and it sees committed rows only. Ten identical
 * tasks: `concurrently(array_fill(0, 10, $task))`.
 *
 * A closure written inside a test keeps the generated Pest test class as its scope, and the
 * child does not have that class; each task is therefore unbound from any class first, so a
 * task cannot use `self::`, `static::` or `$this`. Write each task as its own closure on its own
 * lines: the serialiser reads the source and cannot tell two closures on one line apart. A task
 * that throws an exception whose constructor needs more than a message, such as a
 * `QueryException`, fails the test with an `ArgumentCountError` that names that class.
 *
 * @template TResult
 *
 * @param  array<int, Closure(): TResult>  $tasks
 * @return list<TResult>
 */
function concurrently(array $tasks): array
{
    $unbound = array_map(static fn (Closure $task): Closure => Closure::bind($task, null, null), $tasks);
    $results = Concurrency::driver('process')->run($unbound);
    ksort($results);

    return array_values($results);
}
