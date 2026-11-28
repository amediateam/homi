<?php

namespace App\Services\Radar;

/**
 * The listings a radar write sends to the chat at once (WP-45, `StarterSelector`): their numbers, newest first, and
 * how many they are — the `starter` of the API answer equals the cards the bot sends.
 */
final readonly class Starter
{
    public int $count;

    /** @param  list<int>  $numbers */
    public function __construct(public array $numbers)
    {
        $this->count = count($numbers);
    }

    /** Nothing to send: a twin answered as `existing`, a pause, a mode change, an unchanged search, the switch off. */
    public static function none(): self
    {
        return new self([]);
    }
}
