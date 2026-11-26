<?php

namespace App\Services\Sources\Legacy;

use App\Exceptions\ApiException;
use App\Exceptions\Sources\LegacyContractError;
use App\Exceptions\Sources\LegacyRefreshBusy;
use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Contracts\ReferenceSource;
use App\Services\Sources\Data\CityData;
use App\Services\Sources\Data\CityStats;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\Legacy\Translators\CityStatsTranslator;
use App\Services\Sources\Legacy\Translators\ReferenceTranslator;
use App\Services\Sources\SourceContext;
use Closure;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use LogicException;

/**
 * The `legacy` driver of the reference capability (WP-41): `GET /reference` from legacy's `GET /api/meta` and
 * `GET /cities` from its `GET /api/cities`, through `LegacyClient` and the translators.
 *
 * Both answers are cached in the array shape of the stub fixtures (the cache store may serialise, and no class is
 * unserialised from it): the reference data per locale for `legacy.cache.reference` seconds, the cities for
 * `legacy.cache.cities`. Each successful answer is also kept as the last good copy for `legacy.cache.last_good`
 * (RK-25): while legacy fails, that copy is served with a `warning`, so an outage does not empty the directories.
 * Without a copy every failure is `503 source_unavailable` — also a pause or a daily limit of legacy, which are not
 * outcomes of these public methods. One process at a time refreshes a key (the others serve the last good copy, or
 * `503` on a cold start), and a failed refresh is not tried again for `legacy.cache.after_failure` seconds (see
 * `cached()`). The `v1` in the keys changes when the cached shape does.
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
            $answer = $this->client->get(CityStatsTranslator::PATH, [], self::call($context));

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
                $answer = $this->client->get(ReferenceTranslator::PATH, [], self::call($context));

                return self::translated(fn (): array => ReferenceTranslator::translate($answer, $context->locale));
            },
        );
    }

    /**
     * The call of a directory read: the request's language, always `USD` (the directories do not depend on the
     * caller's currency, and the cache keys carry the language only).
     */
    private static function call(SourceContext $context): LegacyCall
    {
        return new LegacyCall($context->locale);
    }

    /**
     * The fresh copy, else a new answer (kept fresh and as the last good copy), else the last good copy.
     *
     * These are public methods, so an anonymous client must not be able to make them call legacy at will: one process
     * at a time refreshes a key (a cache lock; the others serve the last good copy, and `503` while none exists), and
     * after a failed refresh nobody tries again for `legacy.cache.after_failure` seconds — the last good copy is served
     * as fresh meanwhile, and without one the key answers `503` at once.
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

        if ($this->cache->has("{$key}:down")) {
            throw new SourceUnavailable;
        }

        $lock = $this->lockProvider()->lock("{$key}:refresh", self::refreshSeconds());

        if (! $lock->get()) {
            $last = $this->cache->get("{$key}:last");

            // Another process is refreshing: its last good copy, or, on a cold start without one, 503 at once rather
            // than one more call to legacy.
            return is_array($last) ? $last : throw new LegacyRefreshBusy;
        }

        try {
            $value = $fetch();
        } catch (LegacyRefreshBusy $busy) {
            // The cities wait for a reference refresh under way in another process: not a failure of legacy.
            $last = $this->cache->get("{$key}:last");

            return is_array($last) ? $last : throw $busy;
        } catch (ApiException $failure) {
            return $this->afterFailure($key, $failure);
        } finally {
            $lock->release();
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
     * A failed refresh: the last good copy, kept as fresh for `after_failure` seconds; without one, the key answers
     * `503` for that long.
     *
     * @return array<array-key, mixed>
     *
     * @throws SourceUnavailable
     */
    private function afterFailure(string $key, ApiException $failure): array
    {
        $pause = Config::integer('legacy.cache.after_failure');
        $last = $this->cache->get("{$key}:last");

        if (is_array($last)) {
            $this->cache->put($key, $last, $pause);
            Log::warning('Serving the last good legacy answer.', ['key' => $key, 'because' => $failure->errorCode]);

            return $last;
        }

        $this->cache->put("{$key}:down", 1, $pause);

        throw $failure instanceof SourceUnavailable ? $failure : new SourceUnavailable;
    }

    /**
     * How long a refresh may take: two reads (the cities ask for the reference data first), each with every attempt,
     * its timeouts, the pause and the limiter's waits, plus 5 s.
     */
    private static function refreshSeconds(): int
    {
        $attempts = 1 + max(0, Config::integer('legacy.retry.times'));
        $waits = Config::integer('legacy.retry.sleep_ms') + $attempts * Config::integer('legacy.rate.max_wait_ms');
        $read = $attempts * (Config::integer('legacy.timeout') + Config::integer('legacy.connect_timeout')) + (int) ceil($waits / 1000);

        return 2 * $read + 5;
    }

    private function lockProvider(): LockProvider
    {
        $store = $this->cache->getStore();

        return $store instanceof LockProvider ? $store : throw new LogicException('The cache store of the legacy source cannot lock.');
    }
}
