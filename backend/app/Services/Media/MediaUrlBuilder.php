<?php

namespace App\Services\Media;

use App\Enums\MediaVisibility;
use App\Models\MediaFile;
use Illuminate\Support\Facades\Storage;

/**
 * Public files resolve to the CDN base (`media.public_url`, identical layout in every
 * environment); private files resolve to short-lived signed URLs of their disk.
 */
final class MediaUrlBuilder
{
    public function original(MediaFile $file): string
    {
        return $this->url($file, $file->key);
    }

    /**
     * @return array<int, string> width => URL
     */
    public function variants(MediaFile $file): array
    {
        $urls = [];
        foreach ($file->variants ?? [] as $width => $key) {
            $urls[(int) $width] = $this->url($file, $key);
        }

        return $urls;
    }

    /**
     * @return array{original: string, variants: array<int, string>}
     */
    public function all(MediaFile $file): array
    {
        return ['original' => $this->original($file), 'variants' => $this->variants($file)];
    }

    private function url(MediaFile $file, string $key): string
    {
        if ($file->visibility === MediaVisibility::Public) {
            $base = (string) config('media.public_url');

            return $base !== '' ? $base.'/'.ltrim($key, '/') : Storage::disk($file->disk)->url($key);
        }

        return Storage::disk($file->disk)->temporaryUrl(
            $key,
            now()->addMinutes((int) config('media.temporary_url_minutes', 10)),
        );
    }
}
