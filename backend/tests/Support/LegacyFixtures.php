<?php

namespace Tests\Support;

use LogicException;

/**
 * The golden legacy fixtures (`resources/fixtures/legacy`, WP-41, WP-42) and the stub fixtures they mirror
 * (`resources/fixtures/v1`), decoded. A class, not Pest functions: global helper names of the test files collide.
 * Reads the files by path, so unit tests without the application can use it too.
 */
final class LegacyFixtures
{
    /** @return array<array-key, mixed> */
    public static function golden(string $name): array
    {
        return self::decode("legacy/{$name}");
    }

    /** @return array<array-key, mixed> */
    public static function stub(string $name): array
    {
        return self::decode("v1/{$name}");
    }

    /**
     * The stub catalogue entry of a listing number (WP-12), without its `stub` part, which is never answered.
     *
     * @return array<array-key, mixed>
     */
    public static function stubListing(int $number): array
    {
        foreach (self::stub('listings/catalog') as $entry) {
            if (is_array($entry) && ($entry['number'] ?? null) === $number) {
                unset($entry['stub']);

                return $entry;
            }
        }

        throw new LogicException("The stub catalogue has no listing {$number}.");
    }

    /** @return array<array-key, mixed> */
    private static function decode(string $path): array
    {
        $decoded = json_decode((string) file_get_contents(dirname(__DIR__, 2)."/resources/fixtures/{$path}.json"), true, flags: JSON_THROW_ON_ERROR);

        return is_array($decoded) ? $decoded : throw new LogicException("{$path} is not a JSON object or list.");
    }
}
