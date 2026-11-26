<?php

namespace App\Console\Commands\Access;

use App\Models\User;
use Illuminate\Console\Command;

/** What `access:block` and `access:unblock` share: the user by his internal id, and who and why. */
abstract class AccessCommand extends Command
{
    /** The user named by the `user` argument (an internal user id, never a Telegram id), or null after an error. */
    protected function targetUser(): ?User
    {
        $id = $this->argument('user');

        if (! ctype_digit($id) || (int) $id < 1) {
            $this->components->error('user takes an internal user id, a positive integer (never a Telegram id).');

            return null;
        }

        $user = User::query()->find((int) $id);

        if ($user === null) {
            $this->components->error("There is no user {$id}.");
        }

        return $user;
    }

    /** @return array{0: string, 1: string}|null who and why, both required */
    protected function audit(): ?array
    {
        $by = trim((string) $this->option('by'));
        $reason = trim((string) $this->option('reason'));

        if ($by === '' || mb_strlen($by) > 64) {
            $this->components->error('--by is required: who makes the change, at most 64 characters.');

            return null;
        }

        if ($reason === '' || mb_strlen($reason) > 255) {
            $this->components->error('--reason is required: why, at most 255 characters.');

            return null;
        }

        return [$by, $reason];
    }
}
