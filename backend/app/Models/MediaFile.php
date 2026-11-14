<?php

namespace App\Models;

use App\Enums\MediaOwnerType;
use App\Enums\MediaStatus;
use App\Enums\MediaVisibility;
use App\Services\Media\StoredOriginal;
use Carbon\CarbonImmutable;
use Database\Factories\MediaFileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * A content-addressed original image plus the WebP variants derived from it.
 *
 * One row per (disk, sha256), owned through `media_file_references` (WP-00): an actor may read
 * or delete the file only while it holds a reference, and the row goes with the last one.
 * `uploaded_by` is history only; nothing reads it for authorisation.
 *
 * @property string $id
 * @property string $disk
 * @property string $key
 * @property string $sha256
 * @property string $mime
 * @property string $ext
 * @property int $bytes
 * @property int|null $width
 * @property int|null $height
 * @property MediaVisibility $visibility
 * @property MediaStatus $status
 * @property array<int, string>|null $variants width => object key
 * @property int|null $uploaded_by
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
class MediaFile extends Model
{
    /** @use HasFactory<MediaFileFactory> */
    use HasFactory;

    use HasUlids;

    protected $fillable = [
        'disk', 'key', 'sha256', 'mime', 'ext', 'bytes', 'width', 'height',
        'visibility', 'status', 'variants', 'uploaded_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'bytes' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            'uploaded_by' => 'integer',
            'visibility' => MediaVisibility::class,
            'status' => MediaStatus::class,
            'variants' => 'array',
        ];
    }

    /**
     * Record a stored original for an actor: find or create the row for its bytes and attach the
     * actor as an owner in one transaction that holds the row lock, so a concurrent delete of the
     * last reference cannot remove the row between the two statements.
     */
    public static function recordFor(Model $actor, StoredOriginal $stored, MediaVisibility $visibility): self
    {
        return DB::transaction(function () use ($actor, $stored, $visibility): self {
            $media = self::fromStored($stored, $visibility, MediaOwnerType::uploaderId($actor));
            $media->attachOwner($actor);

            return $media;
        });
    }

    /**
     * Find or create the row for a stored original (same bytes → same row). Inside a transaction
     * the row stays locked until it commits.
     */
    public static function fromStored(StoredOriginal $stored, MediaVisibility $visibility, ?int $uploadedBy = null): self
    {
        return self::query()->lockForUpdate()->firstOrCreate(
            ['disk' => $stored->disk, 'sha256' => $stored->sha256],
            [
                'key' => $stored->key,
                'mime' => $stored->mime,
                'ext' => $stored->ext,
                'bytes' => $stored->bytes,
                'width' => $stored->width,
                'height' => $stored->height,
                'visibility' => $visibility,
                'status' => MediaStatus::Pending,
                'uploaded_by' => $uploadedBy,
            ],
        );
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /**
     * @return HasMany<MediaFileReference, $this>
     */
    public function references(): HasMany
    {
        return $this->hasMany(MediaFileReference::class);
    }

    /**
     * Only media files the actor holds a reference to.
     *
     * @param  Builder<self>  $query
     */
    public function scopeOwnedBy(Builder $query, Model $actor): void
    {
        $query->whereHas('references', function (Builder $references) use ($actor): void {
            /** @var Builder<MediaFileReference> $references */
            $references->heldBy($actor);
        });
    }

    /**
     * Give the actor a reference; idempotent and safe against a parallel attach of the same actor.
     */
    public function attachOwner(Model $actor): MediaFileReference
    {
        return $this->references()->createOrFirst([
            'owner_type' => MediaOwnerType::fromActor($actor),
            'owner_id' => MediaOwnerType::ownerId($actor),
        ]);
    }

    public function isReferencedBy(Model $actor): bool
    {
        return $this->references()->heldBy($actor)->exists();
    }

    /**
     * Whether anything still holds this file. Wave 2 adds listing photos as a third kind of holder here.
     */
    public function isReferenced(): bool
    {
        return $this->references()->exists();
    }

    /**
     * Whether the variants job must run: the row is new, or an earlier run failed (for example
     * because a concurrent delete removed the original before these bytes arrived again).
     */
    public function needsVariants(): bool
    {
        return $this->wasRecentlyCreated || $this->status === MediaStatus::Failed;
    }

    /**
     * Whether any row records these bytes on this disk. After this row is deleted, a match means
     * the same bytes were uploaded again and their objects must stay.
     */
    public function contentIsRecorded(): bool
    {
        return self::query()->where('disk', $this->disk)->where('sha256', $this->sha256)->exists();
    }
}
