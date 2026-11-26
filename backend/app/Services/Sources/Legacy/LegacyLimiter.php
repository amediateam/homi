<?php

namespace App\Services\Sources\Legacy;

use App\Exceptions\Sources\SourceUnavailable;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Sleep;

/**
 * The one outbound limiter of every legacy call (`25` §4.5): at most `legacy.rate.per_second` calls in each calendar
 * second, counted in the cache so every PHP process shares it.
 *
 * A user's call takes a place in the current second's bucket; when it is full, the call sleeps to the next second
 * and tries that bucket, as long as its total wait stays within `max_wait_ms`; otherwise it fails at once with
 * `SourceUnavailable`, so nothing queues behind legacy. A background call (`LegacyCall::$background`) may fill only
 * `background_share` of a bucket and never waits. `RateLimiter` is not used: it reports availability in whole
 * seconds, and this limiter waits in milliseconds.
 */
final class LegacyLimiter
{
    private const string PREFIX = 'legacy:out:';

    public function __construct(private readonly Repository $cache) {}

    /** @throws SourceUnavailable when no place is free within the wait the caller may spend */
    public function acquire(bool $background): void
    {
        if ($background) {
            if (! $this->takeBackground($this->second())) {
                throw new SourceUnavailable('The legacy limiter has no place for a background call.');
            }

            return;
        }

        $budget = Config::integer('legacy.rate.max_wait_ms');

        while (true) {
            $now = $this->nowMs();

            if ($this->take(intdiv($now, 1000))) {
                return;
            }

            $wait = 1000 - $now % 1000;

            if ($wait > $budget) {
                throw new SourceUnavailable('The legacy limiter has no place within the wait a request may spend.');
            }

            $budget -= $wait;
            Sleep::for($wait)->milliseconds();
        }
    }

    private function take(int $second): bool
    {
        return $this->count(self::PREFIX.$second) <= Config::integer('legacy.rate.per_second');
    }

    private function takeBackground(int $second): bool
    {
        $share = (int) floor(Config::integer('legacy.rate.per_second') * Config::float('legacy.rate.background_share'));

        return $this->count(self::PREFIX.'bg:'.$second) <= $share && $this->take($second);
    }

    /** The counter of a bucket after this call's increment; a bucket lives two seconds. */
    private function count(string $key): int
    {
        $this->cache->add($key, 0, 2);

        return (int) $this->cache->increment($key);
    }

    private function second(): int
    {
        return intdiv($this->nowMs(), 1000);
    }

    private function nowMs(): int
    {
        return (int) now()->getPreciseTimestamp(3);
    }
}
