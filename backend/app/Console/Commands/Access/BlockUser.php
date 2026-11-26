<?php

namespace App\Console\Commands\Access;

use App\Enums\Access\AccessGrantState;
use App\Models\AccessGrant;
use App\Services\Access\AccessGate;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Support\Facades\Log;

/**
 * `access:block` (WP-40): an operator blocks a user, who then hears `403 access_denied` with `reason: blocked` on the
 * sign-in and on every bearer route, `POST /events` included; the block beats the owner list and an admission. The
 * grant keeps how the user was admitted, so `access:unblock` can give it back; a user never admitted gets a grant
 * without `admitted_via`. The cached decision is dropped at once. One log line without any Telegram id.
 */
#[Signature('access:block
    {user : The internal user id (never a Telegram id)}
    {--by= : Who blocks (required)}
    {--reason= : Why (required)}')]
#[Description('Block a user at the access gate; takes effect on his next request')]
class BlockUser extends AccessCommand
{
    public function handle(AccessGate $gate): int
    {
        $user = $this->targetUser();
        $audit = $this->audit();

        if ($user === null || $audit === null) {
            return self::FAILURE;
        }

        if (AccessGrant::query()->find($user->id)?->state === AccessGrantState::Blocked) {
            $this->components->warn("User {$user->id} is blocked already.");

            return self::SUCCESS;
        }

        // An upsert, so a seat admission of the same moment cannot make the insert fail; it keeps `admitted_via`.
        AccessGrant::query()->upsert(
            [['user_id' => $user->id, 'state' => AccessGrantState::Blocked->value, 'admitted_via' => null]],
            ['user_id'],
            ['state'],
        );
        $gate->forget($user);

        [$by, $reason] = $audit;
        Log::notice('Access blocked.', ['user_id' => $user->id, 'by' => $by, 'reason' => $reason]);
        $this->components->info("User {$user->id} is blocked.");

        return self::SUCCESS;
    }
}
