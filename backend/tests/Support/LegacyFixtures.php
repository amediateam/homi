<?php

namespace Tests\Support;

use App\Services\Listings\PhotoUrlRewriter;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\Legacy\Translators\DistrictMatcher;
use App\Services\Sources\Legacy\Translators\ListingDetailsTranslator;
use App\Services\Sources\Legacy\Translators\ListingSummaryTranslator;
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

    /** The stub reference data of a language (WP-11), as the district matcher reads it. */
    public static function reference(string $locale = 'ru'): ReferenceData
    {
        return ReferenceData::fromArray(self::stub("reference/default.{$locale}"));
    }

    /** HOMI's media base of the tests: the photo addresses of the translated fixtures start with it. */
    public const string MEDIA = 'https://media.homi.test/lm';

    /** `owner.native_number_floor` (WP-80); the unit suite has no configuration to read it from. */
    public const int NATIVE_FLOOR = 10_000_000;

    public static function summaryTranslator(string $media = self::MEDIA, ?ReferenceData $reference = null): ListingSummaryTranslator
    {
        return new ListingSummaryTranslator(new PhotoUrlRewriter($media, ['legacy.invalid']), new DistrictMatcher($reference ?? self::reference()), self::NATIVE_FLOOR);
    }

    public static function detailsTranslator(string $media = self::MEDIA, bool $relay = false): ListingDetailsTranslator
    {
        return new ListingDetailsTranslator(new PhotoUrlRewriter($media, ['legacy.invalid']), new DistrictMatcher(self::reference()), self::NATIVE_FLOOR, $relay);
    }

    /**
     * The places (dotted, `*` for a list index) where `$actual` is `null` or an empty list and `$expected` is not: the
     * fields the legacy answer cannot fill where the stub has a value (rule 12 of the WP-42 brief). `JsonShape` alone
     * accepts both against any type and any list.
     *
     * @return list<string>
     */
    public static function nullGaps(mixed $expected, mixed $actual, string $path = ''): array
    {
        if ($actual === null) {
            return $expected === null ? [] : [$path];
        }

        if (! is_array($expected) || ! is_array($actual)) {
            return [];
        }

        if ($actual === [] && $expected !== [] && array_is_list($expected)) {
            return [$path];
        }

        $gaps = [];
        $list = array_is_list($expected) && array_is_list($actual);

        foreach ($expected as $key => $value) {
            if (array_key_exists($key, $actual)) {
                $child = $list ? '*' : (string) $key;
                $gaps = [...$gaps, ...self::nullGaps($value, $actual[$key], $path === '' ? $child : "{$path}.{$child}")];
            }
        }

        return array_values(array_unique($gaps));
    }

    /**
     * A copy without one dotted key (`items.0.id`).
     *
     * @param  array<array-key, mixed>  $data
     * @return array<array-key, mixed>
     */
    public static function without(array $data, string $key): array
    {
        [$head, $rest] = array_pad(explode('.', $key, 2), 2, null);

        if ($rest === null) {
            unset($data[$head]);

            return $data;
        }

        $child = $data[$head] ?? null;
        $data[$head] = is_array($child) ? self::without($child, $rest) : $child;

        return $data;
    }

    /** @return array<array-key, mixed> */
    private static function decode(string $path): array
    {
        $decoded = json_decode((string) file_get_contents(dirname(__DIR__, 2)."/resources/fixtures/{$path}.json"), true, flags: JSON_THROW_ON_ERROR);

        return is_array($decoded) ? $decoded : throw new LogicException("{$path} is not a JSON object or list.");
    }
}
