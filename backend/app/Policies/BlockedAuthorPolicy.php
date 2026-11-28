<?php

namespace App\Policies;

use App\Models\BlockedAuthor;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * A user's blocked authors (WP-44, SEC-REQ-014): only their owner removes them. The entry is already looked up through
 * the owner's relation (`$user->blockedAuthors()->findOrFail()`), so this is the second guard; a refusal answers
 * exactly like an unknown id, `404 not_found`.
 */
class BlockedAuthorPolicy
{
    public function delete(User $user, BlockedAuthor $entry): Response
    {
        return $entry->user_id === $user->id ? Response::allow() : Response::denyAsNotFound('Resource not found.');
    }
}
