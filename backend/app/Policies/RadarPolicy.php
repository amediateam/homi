<?php

namespace App\Policies;

use App\Models\Radar;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * A user's radars (WP-45, SEC-REQ-014): only their owner reads, changes or deletes one. The radar is already looked up
 * through the owner's relation (`$user->radars()->findOrFail()`), so this is the second guard; a refusal answers
 * exactly like an unknown id, `404 not_found`. The bot's radar screens (WP-55) ask the same abilities.
 */
class RadarPolicy
{
    public function view(User $user, Radar $radar): Response
    {
        return $this->owner($user, $radar);
    }

    public function update(User $user, Radar $radar): Response
    {
        return $this->owner($user, $radar);
    }

    public function delete(User $user, Radar $radar): Response
    {
        return $this->owner($user, $radar);
    }

    private function owner(User $user, Radar $radar): Response
    {
        return $radar->user_id === $user->id ? Response::allow() : Response::denyAsNotFound('Resource not found.');
    }
}
