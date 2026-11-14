<?php

use Tests\PgsqlTestCase;

it('lets the pgsql group run only on PostgreSQL and a database whose name ends with _test', function (mixed $connection, mixed $database, bool $runs): void {
    expect(PgsqlTestCase::refusal($connection, $database) === null)->toBe($runs);
})->with([
    'sqlite in memory, as in a plain run' => ['sqlite', ':memory:', false],
    'pgsql on a development database' => ['pgsql', 'homi_db', false],
    'pgsql with the in-memory name of phpunit.xml' => ['pgsql', ':memory:', false],
    'pgsql without a database name' => ['pgsql', false, false],
    'pgsql with _test inside the name only' => ['pgsql', 'homi_test_copy', false],
    'another driver on a test database' => ['mysql', 'homi_test', false],
    'no driver at all' => [false, 'homi_test', false],
    'pgsql on a test database' => ['pgsql', 'homi_test', true],
]);
