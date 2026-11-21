<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\OwnerPhoto;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A photo of an owner listing (WP-80). */
class OwnerPhotoResource extends JsonResource
{
    public function __construct(private readonly OwnerPhoto $photo)
    {
        parent::__construct($photo);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['id' => $this->photo->id, 'url' => $this->photo->url];
    }
}
