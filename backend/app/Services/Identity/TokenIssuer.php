<?php

namespace App\Services\Identity;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Issues the Mini App's bearer token after a sign-in (WP-40, ADR-0003, SEC-REQ-007): a Sanctum token named `miniapp`
 * with the abilities `app:read` and `app:write` only — never `media:write`, `intake:write` or an ARM ability — that
 * expires after `access.token_ttl_minutes`. A user holds at most `access.max_tokens` unexpired `miniapp` tokens: the
 * oldest beyond that are revoked in the same transaction, which holds the user's row so that two sign-ins of one user
 * cannot both keep their surplus.
 */
final class TokenIssuer
{
    public const string NAME = 'miniapp';

    /** @var list<string> */
    public const array ABILITIES = ['app:read', 'app:write'];

    public function issue(User $user): NewAccessToken
    {
        return DB::transaction(function () use ($user): NewAccessToken {
            User::query()->whereKey($user->getKey())->lockForUpdate()->value('id');

            $now = CarbonImmutable::now();
            $token = $user->createToken(self::NAME, self::ABILITIES, $now->addMinutes(Config::integer('access.token_ttl_minutes', 1440)));

            $oldestKept = $this->unexpired($user, $now)
                ->orderByDesc('id')
                ->skip(max(1, Config::integer('access.max_tokens', 5)) - 1)
                ->value('id');

            if ($oldestKept !== null) {
                $this->unexpired($user, $now)->where('id', '<', $oldestKept)->delete();
            }

            return $token;
        });
    }

    /** @return Builder<PersonalAccessToken> the user's `miniapp` tokens that have not expired */
    private function unexpired(User $user, CarbonImmutable $now): Builder
    {
        return PersonalAccessToken::query()
            ->where('tokenable_type', $user->getMorphClass())
            ->where('tokenable_id', $user->getKey())
            ->where('name', self::NAME)
            ->where(fn (Builder $query): Builder => $query->whereNull('expires_at')->orWhere('expires_at', '>', $now));
    }
}
