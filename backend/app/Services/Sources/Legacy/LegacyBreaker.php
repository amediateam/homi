<?php

namespace App\Services\Sources\Legacy;

use App\Exceptions\Sources\SourceUnavailable;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use LogicException;

/**
 * The circuit breaker of the legacy client (`25` §4.5): when legacy keeps failing, calls answer `source_unavailable`
 * at once instead of waiting 15 s each.
 *
 * `legacy.breaker.failures` consecutive failures within `window` seconds of the first of them open it for
 * `open_for` seconds; a `429` opens it for its `Retry-After`, at most `open_max`. Once that time has passed, one
 * caller, chosen by a cache lock, sends a probe while every other caller still fails at once; the probe's success
 * closes the breaker, its failure opens it again; only the probe closes it, so a call that was already under way when
 * it opened cannot. What counts as a failure is the client's decision: an answered call that is not one (a `2xx`, a
 * `404`, a contract error, a pause, the daily limit) resets the count. State changes are
 * logged at `warning`. The state lives in the cache, so every PHP process shares it.
 */
final class LegacyBreaker
{
    private const string FAILURES = 'legacy:breaker:failures';

    private const string OPEN_UNTIL = 'legacy:breaker:open_until';

    private const string PROBE = 'legacy:breaker:probe';

    /** How long the state of an opened breaker is kept after it may be probed, so the probe can still find it. */
    private const int KEEP_SECONDS = 86_400;

    public function __construct(private readonly Repository $cache) {}

    /**
     * Lets a call through, or refuses it while the breaker is open. Returns the probe lock when this call is the
     * probe of a breaker that may close; the caller passes it back to `succeeded()` or `failed()`.
     *
     * @throws SourceUnavailable
     */
    public function admit(): ?Lock
    {
        // Redis gives a stored number back as a numeric string, the array store as an int.
        $openUntil = $this->cache->get(self::OPEN_UNTIL);

        if (! is_numeric($openUntil)) {
            return null;
        }

        if (now()->getTimestamp() < (int) $openUntil) {
            throw new SourceUnavailable;
        }

        $lock = $this->lockProvider()->lock(self::PROBE, self::probeSeconds());

        if (! $lock->get()) {
            throw new SourceUnavailable;
        }

        return $lock;
    }

    /** An answered call that is not a failure: the count starts again, and the probe's success closes the breaker. */
    public function succeeded(?Lock $probe): void
    {
        $this->cache->forget(self::FAILURES);

        if ($probe === null) {
            return;
        }

        $this->cache->forget(self::OPEN_UNTIL);
        Log::warning('The legacy breaker closed.');
        $probe->release();
    }

    /** A failure: counted, and the breaker opens at the threshold or when the probe failed. */
    public function failed(?Lock $probe): void
    {
        if ($probe !== null) {
            $this->open(Config::integer('legacy.breaker.open_for'), 'the probe failed');
            $probe->release();

            return;
        }

        $this->cache->add(self::FAILURES, 0, Config::integer('legacy.breaker.window'));
        $failures = (int) $this->cache->increment(self::FAILURES);

        if ($failures >= Config::integer('legacy.breaker.failures')) {
            $this->open(Config::integer('legacy.breaker.open_for'), "{$failures} failures in a row");
        }
    }

    /** Legacy asked HOMI to slow down (`429`): open for `Retry-After` seconds, at most `open_max`. */
    public function throttled(int $retryAfter, ?Lock $probe): void
    {
        $this->open(max(1, min($retryAfter, Config::integer('legacy.breaker.open_max'))), 'legacy answered 429');
        $probe?->release();
    }

    /** How long a probe may take: every attempt with its timeouts, the pause between them and the limiter's waits. */
    private static function probeSeconds(): int
    {
        $attempts = 1 + max(0, Config::integer('legacy.retry.times'));
        $waits = Config::integer('legacy.retry.sleep_ms') + $attempts * Config::integer('legacy.rate.max_wait_ms');

        return $attempts * (Config::integer('legacy.timeout') + Config::integer('legacy.connect_timeout')) + (int) ceil($waits / 1000) + 5;
    }

    private function open(int $seconds, string $why): void
    {
        $this->cache->forget(self::FAILURES);
        $this->cache->put(self::OPEN_UNTIL, now()->getTimestamp() + $seconds, $seconds + self::KEEP_SECONDS);
        Log::warning('The legacy breaker opened.', ['seconds' => $seconds, 'why' => $why]);
    }

    private function lockProvider(): LockProvider
    {
        $store = $this->cache->getStore();

        return $store instanceof LockProvider ? $store : throw new LogicException('The cache store of the legacy breaker cannot lock.');
    }
}
