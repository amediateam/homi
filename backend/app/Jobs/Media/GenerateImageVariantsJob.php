<?php

namespace App\Jobs\Media;

use App\Enums\MediaStatus;
use App\Models\MediaFile;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;
use RuntimeException;
use Throwable;

/**
 * Derive WebP variants `derived/{sha256}/{width}.webp` for every configured width that does
 * not exceed the original (no upscaling). Idempotent: existing variants are kept.
 * Ported from app.uz `Jobs/Media/GenerateImageVariantsJob` (catalogue A6).
 *
 * A row deleted before the job starts drops the job quietly; a row deleted while it runs makes
 * it remove the variants it wrote, unless the same bytes were recorded again (WP-00).
 */
class GenerateImageVariantsJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 30;

    public int $timeout = 300;

    public bool $deleteWhenMissingModels = true;

    public function __construct(public MediaFile $file)
    {
        $this->onQueue((string) config('media.queue', 'media'));
    }

    /**
     * @return array<int, object>
     */
    public function middleware(): array
    {
        return [(new WithoutOverlapping($this->file->id))->releaseAfter(60)->expireAfter(600)];
    }

    public function handle(ImageManager $images): void
    {
        $disk = Storage::disk($this->file->disk);
        $original = $disk->get($this->file->key);

        if ($original === null) {
            throw new RuntimeException("Original {$this->file->key} is missing on disk {$this->file->disk}.");
        }

        $originalWidth = $images->decodeBinary($original)->width();
        $quality = (int) config('media.webp_quality', 80);
        $variants = [];
        $written = [];

        /** @var int $width */
        foreach (config('media.variants', []) as $width) {
            if ($width > $originalWidth) {
                continue;
            }

            $key = config('media.paths.derived').'/'.$this->file->sha256.'/'.$width.'.webp';

            if (! $disk->exists($key)) {
                // Decode per size: Intervention images mutate in place, and a fresh decode keeps every variant sharp.
                $encoded = (string) $images->decodeBinary($original)->scaleDown(width: $width)->encode(new WebpEncoder(quality: $quality));

                $disk->put($key, $encoded, [
                    'visibility' => $this->file->visibility->value,
                    'ContentType' => 'image/webp',
                    'CacheControl' => 'public, max-age=31536000, immutable',
                ]);
                $written[] = $key;
            }

            $variants[$width] = $key;
        }

        if (! MediaFile::query()->whereKey($this->file->id)->exists()) {
            if (! $this->file->contentIsRecorded()) {
                $disk->delete($written);
            }

            return;
        }

        $this->file->forceFill(['variants' => $variants, 'status' => MediaStatus::Ready])->save();
    }

    public function failed(?Throwable $exception): void
    {
        Log::error('media.variants.failed', [
            'media_id' => $this->file->id,
            'disk' => $this->file->disk,
            'error' => $exception?->getMessage(),
        ]);

        $this->file->forceFill(['status' => MediaStatus::Failed])->save();
    }
}
