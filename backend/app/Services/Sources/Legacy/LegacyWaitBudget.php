<?php

namespace App\Services\Sources\Legacy;

/**
 * A limiter wait shared by several legacy reads (DEC-110): `LegacyLimiter::acquire()` spends from it instead of its
 * own `legacy.rate.max_wait_ms` per read, so one batch — the card previews of a personal list — may wait up to
 * `legacy.previews.max_wait_ms` in all, across its parallel rounds and retries. Mutable; one per batch.
 */
final class LegacyWaitBudget
{
    public function __construct(private int $remainingMs) {}

    public function remaining(): int
    {
        return max(0, $this->remainingMs);
    }

    public function spend(int $ms): void
    {
        $this->remainingMs -= $ms;
    }
}
