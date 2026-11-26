<?php

namespace Tests\Support;

use Closure;

/**
 * Runs a closure with one environment key set to a value or unset, and puts the key back afterwards: for the tests of
 * a config file's defaults, which `require` the file inside the closure. `env()` reads `$_SERVER`, `$_ENV` and
 * `getenv()`, so all three are changed.
 */
final class EnvOverride
{
    /**
     * @template TResult
     *
     * @param  Closure(): TResult  $callback
     * @return TResult
     */
    public static function with(string $key, ?string $value, Closure $callback): mixed
    {
        $saved = [getenv($key), $_ENV[$key] ?? null, $_SERVER[$key] ?? null];
        self::put($key, $value === null ? [false, null, null] : [$value, $value, $value]);

        try {
            return $callback();
        } finally {
            self::put($key, $saved);
        }
    }

    /** @param  array{0: string|false, 1: mixed, 2: mixed}  $values  the values of getenv(), $_ENV and $_SERVER */
    private static function put(string $key, array $values): void
    {
        $values[0] === false ? putenv($key) : putenv($key.'='.$values[0]);

        if ($values[1] === null) {
            unset($_ENV[$key]);
        } else {
            $_ENV[$key] = $values[1];
        }

        if ($values[2] === null) {
            unset($_SERVER[$key]);
        } else {
            $_SERVER[$key] = $values[2];
        }
    }
}
