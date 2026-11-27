<?php

namespace App\Services\Listings;

use App\Events\Listings\ContactQuotaExceeded;
use App\Exceptions\Listings\ContactUnavailable;
use App\Models\AccessGrant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The per-user disclosure quota of the author's number (WP-43, SEC-REQ-028, DEC-19): how many distinct listings one
 * user is given a number for per day in Asia/Tashkent. Only `ContactService::disclose()` asks it, for the Mini App and
 * the bot alike (one counter); reading a card counts nothing, because a card carries no number.
 *
 * The day's entry `contact:<user id>:<Y-m-d in Asia/Tashkent>` holds every listing a contact was asked for that day,
 * each marked answered or refused, and whether the account was flagged; it expires one hour after the end of that
 * Tashkent day. It is read and written through the `Cache` facade under `Cache::lock` (never raw Redis set commands:
 * the tests and CI run on the `array` store), so two requests of one user never lose each other's listings.
 *
 * - `decide()` checks and reserves under one lock: a listing answered earlier that day is always allowed again and
 *   counts once; a new one is allowed while fewer than `contacts.soft_limit` listings were asked for, and is then
 *   marked answered; otherwise it is marked refused, and refused again when asked again. So the first `soft_limit`
 *   listings are answered, later ones refused, and asking on is what reaches the hard limit. A listing whose answer
 *   failed after `decide()` (a `503`) stays counted as asked for.
 * - `record()` confirms a disclosure (it marks the listing answered; a number reserved by `decide()` counts once).
 * - Above `contacts.hard_limit` listings asked for, once per day: an existing `access_grants` row gets `flagged_at`
 *   and `flag_reason = 'contact_quota'` (an update of those two columns only: never `state`, `admitted_via` or a seat,
 *   so the flag can never create or widen access); a user without a row (open mode without seats, an owner of the
 *   list, the bot's users) gets none — the flag is then not stored anywhere, because a place for it needs a migration.
 *   Either way a warning names the internal user id only, with `stored` saying whether a row was flagged, and
 *   `ContactQuotaExceeded` is dispatched, so the operator learns of it. Blocking stays an operator action
 *   (`access:block`).
 * - Both limits `null`: the quota is off, and nothing is read or written.
 * - The cache store or its lock failing: fail closed (`decide()` refuses, `record()` throws `ContactUnavailable`), with
 *   a warning at most once a minute while the store can still count that; never a `500`.
 */
final class ContactDisclosure
{
    public const string TIMEZONE = 'Asia/Tashkent';

    public const string FLAG_REASON = 'contact_quota';

    /** How long the lock of a day's entry lives, and how long a request waits for it, in seconds. */
    private const int LOCK_SECONDS = 5;

    private const int LOCK_WAIT_SECONDS = 2;

    /** Whether the user may be given the number of the listing now; a refusal is counted. */
    public function decide(User $user, int $number): bool
    {
        if (! self::on()) {
            return true;
        }

        try {
            return $this->settle($user, $number, false);
        } catch (Exception $failure) {
            $this->storeFailed($failure);

            return false;
        }
    }

    /**
     * Confirms that the user was given the number of the listing.
     *
     * @throws ContactUnavailable when the day's entry cannot be written (fail closed)
     */
    public function record(User $user, int $number): void
    {
        if (! self::on()) {
            return;
        }

        try {
            $this->settle($user, $number, true);
        } catch (Exception $failure) {
            $this->storeFailed($failure);

            throw new ContactUnavailable;
        }
    }

    /** The cache key of the user's day, in Asia/Tashkent. */
    public static function key(User $user, ?CarbonImmutable $at = null): string
    {
        return 'contact:'.$user->id.':'.($at ?? CarbonImmutable::now())->setTimezone(self::TIMEZONE)->format('Y-m-d');
    }

    /**
     * Decides (`$confirm` false) or confirms (`$confirm` true) the listing in the user's day under its lock and stores
     * the day; the first time the day holds more listings than the hard limit, the account is flagged afterwards.
     *
     * @return bool whether the listing is answered
     */
    private function settle(User $user, int $number, bool $confirm): bool
    {
        $now = CarbonImmutable::now();
        $key = self::key($user, $now);
        $expires = $now->setTimezone(self::TIMEZONE)->endOfDay()->addHour();

        /** @var array{0: bool, 1: int|null} $settled */
        $settled = Cache::lock("{$key}:lock", self::LOCK_SECONDS)->block(self::LOCK_WAIT_SECONDS, function () use ($key, $expires, $number, $confirm): array {
            $day = self::day(Cache::get($key));
            $soft = self::limit('contacts.soft_limit');

            if ($confirm || ($day['n'][$number] ?? null) === true) {
                $allowed = true;
            } else {
                $allowed = ! isset($day['n'][$number]) && ($soft === null || count($day['n']) < $soft);
            }

            $day['n'][$number] = $allowed;
            $hard = self::limit('contacts.hard_limit');
            $flag = $hard !== null && ! $day['f'] && count($day['n']) > $hard;
            $day['f'] = $day['f'] || $flag;
            Cache::put($key, $day, $expires);

            return [$allowed, $flag ? count($day['n']) : null];
        });

        [$allowed, $flagged] = $settled;

        if ($flagged !== null) {
            $this->flag($user, $flagged);
        }

        return $allowed;
    }

    /**
     * The stored day, or an empty one when nothing (or something else) is stored. Listing numbers are kept as array
     * keys; a store that gives them back as numeric strings is read the same.
     *
     * @return array{n: array<int, bool>, f: bool}
     */
    private static function day(mixed $stored): array
    {
        $day = ['n' => [], 'f' => false];

        if (! is_array($stored)) {
            return $day;
        }

        foreach (is_array($stored['n'] ?? null) ? $stored['n'] : [] as $number => $answered) {
            if (is_numeric($number) && is_bool($answered)) {
                $day['n'][(int) $number] = $answered;
            }
        }

        $day['f'] = ($stored['f'] ?? false) === true;

        return $day;
    }

    /**
     * Marks the account for an operator, once per day (the day's entry remembers it); decides nothing, and the access
     * gate reads neither column. A failed write is reported, does not change the answer, and is `stored: false`.
     */
    private function flag(User $user, int $asked): void
    {
        $now = CarbonImmutable::now();

        try {
            $stored = self::writeFlag($user, $now);
        } catch (Throwable $failure) {
            report($failure);
            $stored = false;
        }

        Log::warning('A user passed the hard limit of contact disclosures today.', ['user_id' => $user->id, 'asked' => $asked, 'stored' => $stored]);
        ContactQuotaExceeded::dispatch($user->id, $asked, $now->setTimezone(self::TIMEZONE)->format('Y-m-d'));
    }

    /**
     * The flag on the user's existing grant: an update of `flagged_at` and `flag_reason` only, so no row is created
     * and no state, admission or seat changes.
     *
     * @return bool whether a row was flagged
     */
    private static function writeFlag(User $user, CarbonImmutable $now): bool
    {
        return AccessGrant::query()->whereKey($user->id)->update(['flagged_at' => $now, 'flag_reason' => self::FLAG_REASON]) > 0;
    }

    /** A warning about the failing store, at most once a minute while the store can still count that. */
    private function storeFailed(Exception $failure): void
    {
        try {
            $warn = Cache::add('contact:once:store_failed', 1, 60);
        } catch (Exception) {
            $warn = true;
        }

        if ($warn) {
            Log::warning('The disclosure quota cannot read its cache: contacts are refused.', ['failure' => class_basename($failure)]);
        }
    }

    /** Whether either limit is set. */
    private static function on(): bool
    {
        return self::limit('contacts.soft_limit') !== null || self::limit('contacts.hard_limit') !== null;
    }

    /** A limit of `config/contacts.php`: a whole number of at least 1, else `null` (off). */
    private static function limit(string $key): ?int
    {
        $value = Config::get($key);

        return is_int($value) && $value >= 1 ? $value : null;
    }
}
