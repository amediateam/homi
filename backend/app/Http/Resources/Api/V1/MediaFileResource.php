<?php

namespace App\Http\Resources\Api\V1;

use App\Models\MediaFile;
use App\Services\Media\MediaUrlBuilder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin MediaFile
 */
class MediaFileResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var MediaFile $media */
        $media = $this->resource;
        $urls = app(MediaUrlBuilder::class)->all($media);

        return [
            'id' => $media->id,
            'mime' => $media->mime,
            'ext' => $media->ext,
            'bytes' => $media->bytes,
            'width' => $media->width,
            'height' => $media->height,
            'visibility' => $media->visibility->value,
            'status' => $media->status->value,
            'urls' => [
                'original' => $urls['original'],
                /** @var array<int, string> width => URL (WebP) */
                'variants' => (object) $urls['variants'],
            ],
            'created_at' => $media->created_at?->toIso8601String(),
        ];
    }
}
