<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\DatabaseTruncation;

/**
 * Base of the `pgsql` group (`tests/Pgsql`, run with `make test-pgsql`): tests that need PostgreSQL
 * itself — SQL that differs from SQLite, and concurrent writes from child processes through
 * `concurrently()` in `tests/Pest.php`.
 *
 * It truncates instead of refreshing, because a child process cannot see the transaction that
 * `RefreshDatabase` keeps open. Truncation runs `migrate:fresh` on first use, so every test is
 * refused, as skipped, unless the connection is `pgsql` and the database name ends with `_test`:
 * once from the process environment before the application boots, and once from the booted
 * configuration, which a cached configuration (`config:cache`) would take from elsewhere.
 */
abstract class PgsqlTestCase extends TestCase
{
    use DatabaseTruncation;

    protected function setUp(): void
    {
        $refusal = self::refusal(getenv('DB_CONNECTION'), getenv('DB_DATABASE'));

        if ($refusal !== null) {
            $this->markTestSkipped($refusal);
        }

        parent::setUp();
    }

    public function createApplication(): Application
    {
        $app = parent::createApplication();
        $config = $app->make('config');
        $connection = $config->get('database.default');
        $refusal = self::refusal($connection, $config->get("database.connections.{$connection}.database"));

        if ($refusal !== null) {
            $this->markTestSkipped($refusal.' (booted configuration)');
        }

        return $app;
    }

    /**
     * Why the group must not run on this connection and database, or null when it may.
     */
    public static function refusal(mixed $connection, mixed $database): ?string
    {
        if ($connection !== 'pgsql') {
            return 'The pgsql group needs DB_CONNECTION=pgsql; run it with `make test-pgsql`.';
        }

        if (! is_string($database) || ! str_ends_with($database, '_test')) {
            return 'The pgsql group refuses a database whose name does not end with "_test".';
        }

        return null;
    }
}
