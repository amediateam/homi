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
 * and tries that bucket, as long as its total wait stays within `max_wait_ms` (or within what is left of a
 * `LegacyWaitBudget` several calls share, DEC-110); otherwise it fails at once with `SourceUnavailable`, so nothing
 * queues behind legacy. A background call (`LegacyCall::$background`) may fill only `background_share` of a bucket,
 * at least one place, and never waits in `acquire()`. `RateLimiter` is not used: it reports availability in whole
 * seconds, and this limiter waits in milliseconds.
 *
 * `tryAcquire()` and `waitForNextSecond()` are the two halves of `acquire()` for a caller that sends several reads
 * (`LegacyClient::pool()`): it takes the places free now, sends those reads at once, and waits for the next second
 * only for the rest, so a read always goes out in the second whose place it took (WP-42 review, M1).
 */
final class LegacyLimiter
{
    private const string PREFIX = 'legacy:out:';

    public function __construct(private readonly Repository $cache) {}

    /**
     * @param  LegacyWaitBudget|null  $shared  the wait a batch of calls shares; without one, each call may wait `max_wait_ms`
     *
     * @throws SourceUnavailable when no place is free within the wait the caller may spend
     */
    public function acquire(bool $background, ?LegacyWaitBudget $shared = null): void
    {
        if ($background) {
            if (! $this->tryAcquire(true)) {
                throw new SourceUnavailable;
            }

            return;
        }

        $budget = $shared ?? new LegacyWaitBudget(Config::integer('legacy.rate.max_wait_ms'));

        while (! $this->tryAcquire(false)) {
            if (! $this->waitForNextSecond($budget)) {
                throw new SourceUnavailable;
            }
        }
    }

    /** A place in the current second's bucket (a background call within its share), without waiting. */
    public function tryAcquire(bool $background): bool
    {
        $second = $this->second();

        return $background ? $this->takeBackground($second) : $this->take($second);
    }

    /**
     * Sleeps to the start of the next second, spending the wait from `$budget`, when the budget has it and the wait is
     * at most `$atMostMs`; else returns `false` at once without sleeping.
     */
    public function waitForNextSecond(LegacyWaitBudget $budget, ?int $atMostMs = null): bool
    {
        $wait = 1000 - $this->nowMs() % 1000;

        if ($wait > $budget->remaining() || ($atMostMs !== null && $wait > $atMostMs)) {
            return false;
        }

        $budget->spend($wait);
        Sleep::for($wait)->milliseconds();

        return true;
    }

    private function take(int $second): bool
    {
        return $this->count(self::PREFIX.$second) <= Config::integer('legacy.rate.per_second');
    }

    private function takeBackground(int $second): bool
    {
        // At least one place, so a low rate does not lock the background callers out.
        $share = max(1, (int) floor(Config::integer('legacy.rate.per_second') * Config::float('legacy.rate.background_share')));

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
