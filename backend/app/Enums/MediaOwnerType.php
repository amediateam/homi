<?php

namespace App\Enums;

use App\Models\Source as SourceModel;
use App\Models\User as UserModel;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * The kind of actor that holds a media file reference, stored as plain text next to the
 * actor's key. There is deliberately no global morph map: it would change the
 * `tokenable_type` of every new Sanctum token, and `$user->tokens()` would stop finding the
 * existing ones.
 */
enum MediaOwnerType: string
{
    case User = 'user';
    case Source = 'source';

    public static function fromActor(Model $actor): self
    {
        return match (true) {
            $actor instanceof UserModel => self::User,
            $actor instanceof SourceModel => self::Source,
            default => throw new LogicException('A media file cannot be owned by '.$actor::class.'.'),
        };
    }

    /**
     * The actor's key as stored in `media_file_references.owner_id`.
     */
    public static function ownerId(Model $actor): string
    {
        self::fromActor($actor);

        return (string) $actor->getKey();
    }

    /**
     * The value of `media_files.uploaded_by`, a foreign key to `users`: only a user is recorded.
     */
    public static function uploaderId(Model $actor): ?int
    {
        return $actor instanceof UserModel ? $actor->id : null;
    }
}
