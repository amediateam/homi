<?php

namespace App\Services\Identity;

use Carbon\CarbonImmutable;
use DateTimeInterface;
use InvalidArgumentException;

/**
 * The hours at which a user's radar digest goes out (WP-40, `25` §5): whole hours of Asia/Tashkent wall-clock, read
 * through the zone name and never a fixed offset, kept sorted and without repeats. The delivery planner (WP-46) asks
 * `nextSlotAtOrAfter()` for the next send; an empty schedule has no slot.
 */
final readonly class DigestSchedule
{
    /** @param  list<int>  $hours  sorted, unique, each 0 … 23 */
    private function __construct(public array $hours) {}

    /**
     * @param  array<array-key, mixed>  $hours
     *
     * @throws InvalidArgumentException for a value that is not a whole hour 0 … 23
     */
    public static function fromHours(array $hours): self
    {
        $valid = [];

        foreach ($hours as $hour) {
            if (! is_int($hour) || $hour < 0 || $hour > 23) {
                throw new InvalidArgumentException('Digest hours must be whole hours 0 … 23.');
            }

            $valid[$hour] = $hour;
        }

        ksort($valid);

        return new self(array_values($valid));
    }

    /** The first slot at or after the moment, in Asia/Tashkent; null when the schedule is empty. */
    public function nextSlotAtOrAfter(DateTimeInterface $moment): ?CarbonImmutable
    {
        if ($this->hours === []) {
            return null;
        }

        $local = CarbonImmutable::instance($moment)->setTimezone(QuietWindow::ZONE);

        foreach ($this->hours as $hour) {
            $slot = $local->setTime($hour, 0);

            if ($slot->greaterThanOrEqualTo($local)) {
                return $slot;
            }
        }

        return $local->addDay()->setTime($this->hours[0], 0);
    }
}
