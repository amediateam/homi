<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Exceptions\Sources\LegacyContractError;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\FlowOption;
use InvalidArgumentException;

/**
 * Legacy's `GET /api/feed/flow` (API-006) as `GET /listings/flow` (WP-12). Pure.
 *
 * Required: `week` (a whole number ≥ 0) and `days` (a number below 1 is 1, else a whole number). `options` is `[]`
 * when absent; each option needs `code`, `label`, `rate` and its `filters`, read by `FiltersTranslator::fromLegacy()`;
 * its `count` is a number or `null`.
 */
final class FlowTranslator
{
    public const string PATH = '/api/feed/flow';

    private function __construct() {}

    /**
     * @param  array<array-key, mixed>  $answer  the decoded legacy answer
     *
     * @throws LegacyContractError
     */
    public static function toData(array $answer): FlowEstimate
    {
        $flow = self::translate($answer);

        return new FlowEstimate($flow['week'], $flow['days'], array_map(FlowOption::fromArray(...), $flow['options']));
    }

    /**
     * The answer in the array shape of `data` of the stub's `GET /listings/flow`, checked by the data objects.
     *
     * @param  array<array-key, mixed>  $answer
     * @return array{week: int, days: int, options: list<array<string, mixed>>}
     *
     * @throws LegacyContractError
     */
    public static function translate(array $answer): array
    {
        $week = Whole::of($answer['week'] ?? null);
        $days = $answer['days'] ?? null;
        $days = (is_int($days) || is_float($days)) && $days < 1 ? 1 : Whole::of($days);

        if (! is_int($week) || $week < 0) {
            throw LegacyContractError::key(self::PATH, 'week', 'missing, not a whole number or below zero');
        }

        if (! is_int($days)) {
            throw LegacyContractError::key(self::PATH, 'days', 'missing or not a whole number');
        }

        $options = [];

        foreach (LegacyValue::objects($answer, 'options', self::PATH) as $index => $option) {
            $options[] = self::option($option, "options.{$index}.");
        }

        $flow = ['week' => $week, 'days' => $days, 'options' => $options];

        try {
            new FlowEstimate($flow['week'], $flow['days'], array_map(FlowOption::fromArray(...), $options));
        } catch (InvalidArgumentException $invalid) {
            throw LegacyValue::refused(self::PATH, $invalid);
        }

        return $flow;
    }

    /**
     * @param  array<array-key, mixed>  $option
     * @return array<string, mixed>
     */
    private static function option(array $option, string $prefix): array
    {
        foreach (['code', 'label', 'rate'] as $key) {
            if (! is_string($option[$key] ?? null)) {
                throw LegacyContractError::key(self::PATH, $prefix.$key, 'missing or not a string');
            }
        }

        if (! is_array($option['filters'] ?? null)) {
            throw LegacyContractError::key(self::PATH, "{$prefix}filters", 'missing or not an object');
        }

        return [
            'code' => $option['code'],
            'label' => $option['label'],
            'rate' => $option['rate'],
            'count' => LegacyValue::int($option, 'count'),
            'filters' => FiltersTranslator::fromLegacy($option['filters'], self::PATH, "{$prefix}filters.")->toArray(),
        ];
    }
}
