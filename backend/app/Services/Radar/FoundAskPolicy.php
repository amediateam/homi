<?php

namespace App\Services\Radar;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use InvalidArgumentException;

/**
 * Whether pausing or deleting a radar asks «Нашли жильё?» (WP-45; task `KV-BE-104`, BR-API-090 «not every time»; the
 * legacy rule is unknown, Q-API-030): yes when the user has no `found_answers` row of the last
 * `radar.found_cooldown_days` (30) days and was not asked in the last 24 hours. A «yes» is remembered for 24 hours under
 * `found:asked:<user id>` (`Cache::add`, so two pauses at the same moment ask once). The bot's poll after a pause or a
 * delete asks the same policy, so the app and the bot never ask twice.
 *
 * Called after the write it follows has succeeded: a refused or unknown radar never spends the 24 hours.
 */
final readonly class FoundAskPolicy
{
    /** How long a «yes» keeps the next one back (s). */
    public const int ASKED_SECONDS = 86_400;

    /** @var list<string> */
    public const array TRIGGERS = ['pause', 'delete'];

    /** @param  'pause'|'delete'|string  $trigger */
    public function shouldAsk(User $user, string $trigger): bool
    {
        if (! in_array($trigger, self::TRIGGERS, true)) {
            throw new InvalidArgumentException('«Нашли жильё?» follows a pause or a delete only.');
        }

        $answered = $user->foundAnswers()
            ->where('created_at', '>=', now()->subDays(Config::integer('radar.found_cooldown_days')))
            ->exists();

        return ! $answered && Cache::add(self::key($user), true, self::ASKED_SECONDS);
    }

    /** The cache key of the user's last «yes» (WP-47's erasure registry lists it). */
    public static function key(User $user): string
    {
        return "found:asked:{$user->id}";
    }
}
