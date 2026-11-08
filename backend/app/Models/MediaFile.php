<?php

namespace App\Models;

use App\Enums\MediaStatus;
use App\Enums\MediaVisibility;
use App\Services\Media\StoredOriginal;
use Carbon\CarbonImmutable;
use Database\Factories\MediaFileFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A content-addressed original image plus the WebP variants derived from it.
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
            'visibility' => MediaVisibility::class,
            'status' => MediaStatus::class,
            'variants' => 'array',
        ];
    }

    /**
     * Find or create the row for a stored original (same bytes → same row).
     */
    public static function fromStored(StoredOriginal $stored, MediaVisibility $visibility, ?int $uploadedBy = null): self
    {
        return self::query()->firstOrCreate(
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
}
