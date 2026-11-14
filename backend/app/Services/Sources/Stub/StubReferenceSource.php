<?php

namespace App\Services\Sources\Stub;

use App\Services\Sources\Contracts\ReferenceSource;
use App\Services\Sources\Data\CityStats;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\SourceContext;
use InvalidArgumentException;

/**
 * The stub driver of the reference capability (WP-11): `reference/default.<locale>.json` and `cities/default.json`.
 *
 * Scenarios: `single_city` keeps only Tashkent in the reference data (derived from the default fixture, so the names
 * stay in every locale); `no_daily` answers `cities/no_daily.json`. The scenario `no_bot` concerns HOMI's
 * configuration, not this data; `ReferenceController` answers it.
 */
final class StubReferenceSource implements ReferenceSource
{
    public function __construct(private readonly FixtureStore $fixtures) {}

    public function reference(SourceContext $context): ReferenceData
    {
        $data = ReferenceData::fromArray($this->fixtures->pick($context, "reference/default.{$context->locale}"));

        return $context->scenario === 'single_city' ? $data->withCities(['tashkent']) : $data;
    }

    public function cities(SourceContext $context): array
    {
        $cities = $this->fixtures->pick($context, 'cities/default', ['no_daily' => 'cities/no_daily']);

        if (! array_is_list($cities)) {
            throw new InvalidArgumentException('The cities fixture must be a list.');
        }

        return array_map(
            fn (mixed $city): CityStats => is_array($city) ? CityStats::fromArray($city) : throw new InvalidArgumentException('Each city of the cities fixture must be an object.'),
            $cities,
        );
    }
}
