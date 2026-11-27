<?php

namespace App\Services\Sources\Legacy;

/**
 * The time by which a batch of legacy reads must be done (WP-42 review, L4): the card previews of one list may spend
 * at most `legacy.previews.deadline_ms` in all, limiter waits, rounds, retries and HTTP timeouts included. A read not
 * sent or not answered by then is refused (`LegacyClient::pool()`). Read on the application clock, so the tests move
 * it with `Sleep::fake(syncWithCarbon: true)`. Immutable.
 */
final readonly class LegacyDeadline
{
    private function __construct(private int $atMs) {}

    /** The deadline `$ms` milliseconds from now. */
    public static function in(int $ms): self
    {
        return new self(self::nowMs() + max(0, $ms));
    }

    /** The milliseconds left, never below 0. */
    public function remainingMs(): int
    {
        return max(0, $this->atMs - self::nowMs());
    }

    public function passed(): bool
    {
        return $this->remainingMs() === 0;
    }

    private static function nowMs(): int
    {
        return (int) now()->getPreciseTimestamp(3);
    }
}
