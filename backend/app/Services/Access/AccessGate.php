<?php

namespace App\Services\Access;

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use App\Enums\AccessState;
use App\Enums\Identity\BotChatState;
use App\Models\AccessGrant;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

/**
 * The one access decision of the Mini App (WP-40, SEC-REQ-006): the sign-in asks it before it issues a token, and
 * `EnsureAccessGranted` on every bearer route. In this order (`config/access.php`):
 *
 * 1. the pause (`paused`, DEC-60) refuses everyone but team accounts (DEC-106), a blocked user too;
 * 2. a `blocked` grant refuses (an operator's block beats the owner list and an admission);
 * 3. with `require_chat`, a user whose chat with the bot is not active is refused with `join`;
 * 4. an `admitted` grant or a Telegram id of the owner list passes;
 * 5. mode `private` refuses with `private`, mode `invite` with `invite`; a missing or unknown mode is `private`;
 * 6. mode `open` passes; with `max_seats` set, the first pass of a user admits him under a lock that counts the
 *    admitted grants, and a user who finds no seat left is refused with `full`. Without `max_seats` no row is written.
 *
 * Steps 2–6 are cached per user for two seconds (the client re-checks the no-access screen every 2.5 s); the pause is
 * read on every call. A writer of a grant or of `bot_chat_state` calls `forget()`, so its change takes effect at once;
 * any other change takes effect within the two seconds. The cache key holds the internal user id, never a Telegram id.
 * A configuration value that cannot be read is the safe default, never an exception.
 */
final class AccessGate
{
    public const int CACHE_SECONDS = 2;

    /** The PostgreSQL advisory lock that serialises the seat admissions of `open` mode. */
    private const int SEAT_LOCK = 4_000_040;

    public function decide(User $user): AccessDecision
    {
        if ($this->switchOn('access.paused') && ! $user->is_team) {
            return new AccessDecision(AccessState::Paused);
        }

        $state = Cache::remember(self::cacheKey($user), self::CACHE_SECONDS, fn (): string => $this->evaluate($user)->value);

        return new AccessDecision(AccessState::from($state));
    }

    /** Drops the cached decision of the user, after a change of his grant or of his chat with the bot. */
    public function forget(User $user): void
    {
        Cache::forget(self::cacheKey($user));
    }

    private static function cacheKey(User $user): string
    {
        return 'access:decision:'.$user->id;
    }

    private function evaluate(User $user): AccessState
    {
        $grant = $this->grant($user);

        if ($grant === AccessGrantState::Blocked) {
            return AccessState::Blocked;
        }

        if ($this->switchOn('access.require_chat') && $user->bot_chat_state !== BotChatState::Active) {
            return AccessState::Join;
        }

        if ($grant === AccessGrantState::Admitted || $this->isOwner($user)) {
            return AccessState::Granted;
        }

        return match ($this->mode()) {
            'open' => $this->admitToOpen($user),
            'invite' => AccessState::Invite,
            default => AccessState::Private,
        };
    }

    /** The state of the user's grant, read fresh (a loaded relation would outlive a change). */
    private function grant(User $user): ?AccessGrantState
    {
        return AccessGrant::query()->whereKey($user->id)->first()?->state;
    }

    /**
     * `open` mode: everyone passes without a row, unless `max_seats` is set. Then the first pass admits the user: under
     * the seat lock his grant is read again (a concurrent request of his may have written it), the admitted grants are
     * counted, and the grant is written while a seat is left. `access:block` writes its grant without the seat lock;
     * when its row lands between that read and the insert, the insert finds the user's key taken, and the stored grant
     * decides (`createOrFirst` inserts under a savepoint, so the failed insert does not abort the transaction on
     * PostgreSQL).
     */
    private function admitToOpen(User $user): AccessState
    {
        $seats = $this->maxSeats();

        if ($seats === null) {
            return AccessState::Granted;
        }

        return DB::transaction(function () use ($user, $seats): AccessState {
            if (DB::connection()->getDriverName() === 'pgsql') {
                DB::select('select pg_advisory_xact_lock(?)', [self::SEAT_LOCK]);
            }

            $grant = $this->grant($user);

            if ($grant !== null) {
                return $grant === AccessGrantState::Admitted ? AccessState::Granted : AccessState::Blocked;
            }

            if (AccessGrant::query()->where('state', AccessGrantState::Admitted)->count() >= $seats) {
                return AccessState::Full;
            }

            $stored = AccessGrant::query()->createOrFirst(
                ['user_id' => $user->id],
                ['state' => AccessGrantState::Admitted, 'admitted_via' => AdmittedVia::Open],
            );

            return $stored->state === AccessGrantState::Admitted ? AccessState::Granted : AccessState::Blocked;
        });
    }

    private function isOwner(User $user): bool
    {
        $owners = Config::get('access.owner_telegram_ids');

        if ($user->telegram_user_id === null || ! is_array($owners)) {
            return false;
        }

        foreach ($owners as $owner) {
            if ((is_int($owner) || (is_string($owner) && ctype_digit($owner))) && (int) $owner === $user->telegram_user_id) {
                return true;
            }
        }

        return false;
    }

    private function mode(): string
    {
        $mode = Config::get('access.mode');

        return is_string($mode) ? strtolower(trim($mode)) : 'private';
    }

    /**
     * The seat limit of `open` mode: null (or a blank string) for none, a whole number as it is, and `0` for any value
     * it cannot read, so a mistyped limit admits nobody new instead of everyone.
     */
    private function maxSeats(): ?int
    {
        $seats = Config::get('access.max_seats');

        return match (true) {
            $seats === null, is_string($seats) && trim($seats) === '' => null,
            is_int($seats) && $seats >= 0 => $seats,
            is_string($seats) && ctype_digit(trim($seats)) => (int) trim($seats),
            default => 0,
        };
    }

    /** A switch of `config/access.php`: on only for a value that reads as true; anything else is off. */
    private function switchOn(string $key): bool
    {
        return filter_var(Config::get($key), FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? false;
    }
}
