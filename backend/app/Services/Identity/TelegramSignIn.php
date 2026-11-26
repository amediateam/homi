<?php

namespace App\Services\Identity;

use App\Exceptions\AccessDenied;
use App\Exceptions\Identity\InitDataExpired;
use App\Exceptions\Identity\InvalidInitData;
use App\Models\User;
use App\Services\Access\AccessGate;
use App\Services\Access\RateLimits;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use LogicException;

/**
 * The Telegram sign-in of the Mini App (WP-40, `POST /auth/telegram`): exchanges a launch value (`initData`) for a
 * bearer token, in this order (the per-address limiter of the route runs before):
 *
 * 1. the verifier checks the value with the bot token of this environment (`401 invalid_init_data` or
 *    `401 auth_expired`);
 * 2. one value may be exchanged at most `telegram.initdata.max_exchanges` times inside its window (a reload, an
 *    expired token), counted by its fingerprint for the length of the window (SEC-REQ-003); beyond that
 *    `429 rate_limited`;
 * 3. the launch becomes a HOMI user (`UserResolver`);
 * 4. one user signs in at most `rate_limits.auth.per_user` times a minute (default 5, SEC-REQ-027, read leniently by
 *    `RateLimits`), counted by the internal user id; beyond that `429 rate_limited`;
 * 5. the access gate decides; a refusal answers `403 access_denied` with its reason and issues no token;
 * 6. `TokenIssuer` issues the token.
 *
 * One log line per attempt: on success the value's fingerprint and the internal user id, on a refusal its reason
 * (with the fingerprint and the user id once they are known). Neither the value nor the token nor a Telegram id is
 * ever logged, and the value is a `SensitiveParameter`, so no stack trace shows it (SEC-REQ-047).
 */
final readonly class TelegramSignIn
{
    public function __construct(
        private TelegramInitDataVerifier $verifier,
        private UserResolver $users,
        private AccessGate $gate,
        private TokenIssuer $tokens,
    ) {}

    /**
     * @throws InvalidInitData
     * @throws InitDataExpired
     * @throws ThrottleRequestsException
     * @throws AccessDenied
     */
    public function exchange(#[\SensitiveParameter] string $initData): TelegramSession
    {
        $launch = $this->verify($initData);
        $this->countExchange($launch);

        $user = $this->users->fromInitData($launch);
        $this->limitUser($launch, $user);

        $refusal = $this->gate->decide($user)->refusal();

        if ($refusal !== null) {
            $this->refused('access_'.$refusal->reason->value, $launch, $user);

            throw $refusal;
        }

        $token = $this->tokens->issue($user);
        $expiresAt = $token->accessToken->getAttribute('expires_at');

        if (! $expiresAt instanceof DateTimeInterface) {
            throw new LogicException('A Mini App token must expire.');
        }

        Log::info('Telegram sign-in.', ['fingerprint' => $launch->fingerprint, 'user_id' => $user->id]);

        return new TelegramSession($user, $token, CarbonImmutable::instance($expiresAt));
    }

    /**
     * @throws InvalidInitData
     * @throws InitDataExpired
     */
    private function verify(#[\SensitiveParameter] string $initData): TelegramInitData
    {
        try {
            return $this->verifier->verify($initData);
        } catch (InvalidInitData $e) {
            $this->refused($e->reason->value);

            throw $e;
        } catch (InitDataExpired $e) {
            $this->refused('expired');

            throw $e;
        }
    }

    /** @throws ThrottleRequestsException */
    private function countExchange(TelegramInitData $launch): void
    {
        $key = 'auth:exchanges:'.$launch->fingerprint;
        $window = max(1, Config::integer('telegram.initdata.max_age', 3600));

        $this->throttle($key, max(1, Config::integer('telegram.initdata.max_exchanges', 20)), $window, 'too_many_exchanges', $launch);
    }

    /** @throws ThrottleRequestsException */
    private function limitUser(TelegramInitData $launch, User $user): void
    {
        $key = 'auth:user:'.$user->id;
        $this->throttle($key, RateLimits::value('auth.per_user'), 60, 'too_many_sign_ins', $launch, $user);
    }

    /**
     * Counts one attempt under the key, or refuses with `429 rate_limited` and `Retry-After` once the key holds
     * `$limit` attempts inside its decay.
     *
     * @throws ThrottleRequestsException
     */
    private function throttle(string $key, int $limit, int $decaySeconds, string $reason, TelegramInitData $launch, ?User $user = null): void
    {
        if (RateLimiter::tooManyAttempts($key, $limit)) {
            $this->refused($reason, $launch, $user);

            throw new ThrottleRequestsException('Too Many Attempts.', headers: ['Retry-After' => (string) max(1, RateLimiter::availableIn($key))]);
        }

        RateLimiter::hit($key, $decaySeconds);
    }

    private function refused(string $reason, ?TelegramInitData $launch = null, ?User $user = null): void
    {
        Log::notice('Telegram sign-in refused.', array_filter([
            'reason' => $reason,
            'fingerprint' => $launch?->fingerprint,
            'user_id' => $user?->id,
        ], fn (mixed $value): bool => $value !== null));
    }
}
