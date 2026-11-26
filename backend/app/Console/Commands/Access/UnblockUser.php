<?php

namespace App\Console\Commands\Access;

use App\Enums\Access\AccessGrantState;
use App\Models\AccessGrant;
use App\Services\Access\AccessGate;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Support\Facades\Log;

/**
 * `access:unblock` (WP-40): lifts an operator's block. A user who had been admitted is admitted again as he was; a
 * user blocked before any admission loses the grant, so the gate decides for him as for anyone new. The cached
 * decision is dropped at once. One log line without any Telegram id.
 */
#[Signature('access:unblock
    {user : The internal user id (never a Telegram id)}
    {--by= : Who unblocks (required)}
    {--reason= : Why (required)}')]
#[Description('Lift the block of a user at the access gate; takes effect on his next request')]
class UnblockUser extends AccessCommand
{
    public function handle(AccessGate $gate): int
    {
        $user = $this->targetUser();
        $audit = $this->audit();

        if ($user === null || $audit === null) {
            return self::FAILURE;
        }

        $grant = AccessGrant::query()->find($user->id);

        if ($grant === null || $grant->state !== AccessGrantState::Blocked) {
            $this->components->warn("User {$user->id} is not blocked.");

            return self::SUCCESS;
        }

        if ($grant->admitted_via === null) {
            $grant->delete();
        } else {
            $grant->update(['state' => AccessGrantState::Admitted]);
        }

        $gate->forget($user);

        [$by, $reason] = $audit;
        Log::notice('Access unblocked.', ['user_id' => $user->id, 'by' => $by, 'reason' => $reason]);
        $this->components->info("User {$user->id} is unblocked.");

        return self::SUCCESS;
    }
}
