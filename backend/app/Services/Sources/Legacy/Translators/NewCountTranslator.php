<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Exceptions\Sources\LegacyContractError;
use App\Services\Search\SearchFilters;

/**
 * Legacy's `GET /api/feed/new` (API-035) and, with the same rule, `GET /api/feed/count` (API-005). Pure.
 *
 * The query is the filter query of `FiltersTranslator::toQuery()` — no `sort`, no cursor, no limit — plus `since` in
 * Unix seconds. The answer's `count` must be a JSON integer ≥ 0; a number with a zero fraction (`12.0`) counts as one.
 * Missing, `null`, a string, a negative number or a fraction is a contract error naming `count`, which the user sees
 * as `503 source_unavailable` and never as a count of `0` (BR-API-157, LB-API-055, RK-26).
 */
final class NewCountTranslator
{
    public const string PATH = '/api/feed/new';

    public const string COUNT_PATH = '/api/feed/count';

    private function __construct() {}

    /** @return array<string, scalar|list<scalar>> */
    public static function query(SearchFilters $filters, int $since): array
    {
        return FiltersTranslator::toQuery($filters) + ['since' => $since];
    }

    /**
     * @param  array<array-key, mixed>  $answer  the decoded legacy answer
     *
     * @throws LegacyContractError
     */
    public static function count(#[\SensitiveParameter] array $answer, string $path = self::PATH): int
    {
        $count = Whole::of($answer['count'] ?? null);

        return is_int($count) && $count >= 0
            ? $count
            : throw LegacyContractError::key($path, 'count', 'missing, not a whole number or below zero');
    }
}
