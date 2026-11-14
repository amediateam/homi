<?php

namespace App\Policies;

use App\Models\MediaFile;
use Illuminate\Auth\Access\Response;
use Illuminate\Database\Eloquent\Model;

/**
 * Media access (SEC-REQ-016). Users and sources both authenticate through Sanctum, so the
 * actor is any model. A refusal answers exactly like an unknown id (SEC-REQ-014). This is the
 * single place where ARM roles are added later.
 */
class MediaFilePolicy
{
    public function view(Model $actor, MediaFile $media): Response
    {
        return $this->holder($actor, $media);
    }

    public function delete(Model $actor, MediaFile $media): Response
    {
        return $this->holder($actor, $media);
    }

    private function holder(Model $actor, MediaFile $media): Response
    {
        return $media->isReferencedBy($actor)
            ? Response::allow()
            : Response::denyAsNotFound('Resource not found.');
    }
}
