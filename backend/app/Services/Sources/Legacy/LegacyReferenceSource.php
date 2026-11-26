<?php

namespace App\Services\Sources\Legacy;

use App\Exceptions\ApiException;
use App\Exceptions\Sources\LegacyContractError;
use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Contracts\ReferenceSource;
use App\Services\Sources\Data\CityData;
use App\Services\Sources\Data\CityStats;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\Legacy\Translators\CityStatsTranslator;
use App\Services\Sources\Legacy\Translators\ReferenceTranslator;
use App\Services\Sources\SourceContext;
use Closure;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;

/**
 * The `legacy` driver of the reference capability (WP-41): `GET /reference` from legacy's `GET /api/meta` and
 * `GET /cities` from its `GET /api/cities`, through `LegacyClient` and the translators.
 *
 * Both answers are cached in the array shape of the stub fixtures (the cache store may serialise, and no class is
 * unserialised from it): the reference data per locale for `legacy.cache.reference` seconds, the cities for
 * `legacy.cache.cities`. Each successful answer is also kept as the last good copy for `legacy.cache.last_good`
 * (RK-25): while legacy fails, that copy is served with a `warning`, so an outage does not empty the directories.
 * Without a copy every failure is `503 source_unavailable` — also a pause or a daily limit of legacy, which are not
 * outcomes of these public methods. The `v1` in the keys changes when the cached shape does.
 */
final class LegacyReferenceSource implements ReferenceSource
{
    private const string PREFIX = 'legacy:v1:';

    public function __construct(
        private readonly LegacyClient $client,
        private readonly Repository $cache,
    ) {}

    public function reference(SourceContext $context): ReferenceData
    {
        return ReferenceData::fromArray($this->referenceArray($context));
    }

    public function cities(SourceContext $context): array
    {
        $cities = $this->cached('cities', Config::integer('legacy.cache.cities'), function () use ($context): array {
            $codes = array_map(fn (CityData $city): string => $city->code, $this->reference($context)->cities);
            $answer = $this->client->get(CityStatsTranslator::PATH, [], LegacyCall::for($context));

            return self::translated(fn (): array => CityStatsTranslator::translate($answer, $codes));
        });

        /** @var list<array<array-key, mixed>> $cities */
        return array_map(CityStats::fromArray(...), $cities);
    }

    /** @return array<array-key, mixed> */
    private function referenceArray(SourceContext $context): array
    {
        return $this->cached(
            "reference:{$context->locale}",
            Config::integer('legacy.cache.reference'),
            function () use ($context): array {
                $answer = $this->client->get(ReferenceTranslator::PATH, [], LegacyCall::for($context));

                return self::translated(fn (): array => ReferenceTranslator::translate($answer, $context->locale));
            },
        );
    }

    /**
     * The fresh copy, else a new answer (kept fresh and as the last good copy), else the last good copy.
     *
     * @param  Closure(): array<array-key, mixed>  $fetch
     * @return array<array-key, mixed>
     *
     * @throws SourceUnavailable
     */
    private function cached(string $name, int $seconds, Closure $fetch): array
    {
        $key = self::PREFIX.$name;
        $fresh = $this->cache->get($key);

        if (is_array($fresh)) {
            return $fresh;
        }

        try {
            $value = $fetch();
        } catch (ApiException $failure) {
            return $this->lastGood($key, $failure);
        }

        $this->cache->put($key, $value, $seconds);
        $this->cache->put("{$key}:last", $value, Config::integer('legacy.cache.last_good'));

        return $value;
    }

    /**
     * A translation, with its contract error logged here; the client logs the ones it finds itself.
     *
     * @template TValue of array
     *
     * @param  Closure(): TValue  $translate
     * @return TValue
     *
     * @throws LegacyContractError
     */
    private static function translated(Closure $translate): array
    {
        try {
            return $translate();
        } catch (LegacyContractError $drift) {
            Log::error('A legacy answer does not fit its contract.', $drift->context());

            throw $drift;
        }
    }

    /**
     * @return array<array-key, mixed>
     *
     * @throws SourceUnavailable
     */
    private function lastGood(string $key, ApiException $failure): array
    {
        $last = $this->cache->get("{$key}:last");

        if (is_array($last)) {
            Log::warning('Serving the last good legacy answer.', ['key' => $key, 'because' => $failure->errorCode]);

            return $last;
        }

        throw $failure instanceof SourceUnavailable ? $failure : new SourceUnavailable('The legacy reference data is unavailable.');
    }
}
