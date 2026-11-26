<?php

namespace App\Services\Identity;

use Carbon\CarbonImmutable;
use DateTimeInterface;
use InvalidArgumentException;

/**
 * A user's quiet hours (WP-40, `25` §5): from the whole hour `from` up to, not including, the whole hour `to`, in
 * Asia/Tashkent wall-clock, read through the zone name and never a fixed offset. `from` after `to` crosses midnight
 * (23–08 holds 23:00 … 07:59). Both ends null is off: the window then holds no moment. The delivery planner (WP-46)
 * asks `contains()` and holds a message until `endAfter()`.
 */
final readonly class QuietWindow
{
    public const string ZONE = 'Asia/Tashkent';

    private function __construct(public ?int $from, public ?int $to) {}

    /**
     * Both null is off; otherwise both are hours 0 … 23 and differ.
     *
     * @throws InvalidArgumentException for one end without the other, an hour outside 0 … 23, or equal ends
     */
    public static function fromHours(?int $from, ?int $to): self
    {
        if ($from === null && $to === null) {
            return new self(null, null);
        }

        if ($from === null || $to === null) {
            throw new InvalidArgumentException('Quiet hours need both ends or neither.');
        }

        if ($from < 0 || $from > 23 || $to < 0 || $to > 23) {
            throw new InvalidArgumentException("Quiet hours {$from}–{$to} are not hours of a day.");
        }

        if ($from === $to) {
            throw new InvalidArgumentException("Quiet hours {$from}–{$to} start and end at the same hour.");
        }

        return new self($from, $to);
    }

    public static function off(): self
    {
        return new self(null, null);
    }

    public function isOff(): bool
    {
        return $this->from === null || $this->to === null;
    }

    /** @return array{from: int, to: int}|null the `quiet_hours` value of the API; null when off */
    public function toArray(): ?array
    {
        return $this->from === null || $this->to === null ? null : ['from' => $this->from, 'to' => $this->to];
    }

    /** Whether the moment falls inside the window: the start hour is in, the end hour is out. */
    public function contains(DateTimeInterface $moment): bool
    {
        if ($this->from === null || $this->to === null) {
            return false;
        }

        $hour = self::local($moment)->hour;

        return $this->from < $this->to
            ? $hour >= $this->from && $hour < $this->to
            : $hour >= $this->from || $hour < $this->to;
    }

    /**
     * The first end of the window strictly after the moment — the end of the current window when the moment is inside
     * it — in Asia/Tashkent; null when off.
     */
    public function endAfter(DateTimeInterface $moment): ?CarbonImmutable
    {
        if ($this->to === null) {
            return null;
        }

        $local = self::local($moment);
        $end = $local->setTime($this->to, 0);

        return $end->greaterThan($local) ? $end : $local->addDay()->setTime($this->to, 0);
    }

    private static function local(DateTimeInterface $moment): CarbonImmutable
    {
        return CarbonImmutable::instance($moment)->setTimezone(self::ZONE);
    }
}
