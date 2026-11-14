<?php

namespace App\Models;

use App\Enums\MediaOwnerType;
use Carbon\CarbonImmutable;
use Database\Factories\MediaFileReferenceFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One actor's hold on a media file (WP-00). The content-addressed `media_files` row and its
 * objects live while at least one reference exists.
 *
 * @property int $id
 * @property string $media_file_id
 * @property MediaOwnerType $owner_type
 * @property string $owner_id
 * @property CarbonImmutable|null $created_at
 */
class MediaFileReference extends Model
{
    /** @use HasFactory<MediaFileReferenceFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $fillable = ['media_file_id', 'owner_type', 'owner_id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'owner_type' => MediaOwnerType::class,
        ];
    }

    /**
     * @return BelongsTo<MediaFile, $this>
     */
    public function mediaFile(): BelongsTo
    {
        return $this->belongsTo(MediaFile::class);
    }

    /**
     * References held by the actor (a user or a source; the type keeps equal ids apart).
     *
     * @param  Builder<self>  $query
     */
    public function scopeHeldBy(Builder $query, Model $actor): void
    {
        $query->where('owner_type', MediaOwnerType::fromActor($actor))
            ->where('owner_id', MediaOwnerType::ownerId($actor));
    }
}
