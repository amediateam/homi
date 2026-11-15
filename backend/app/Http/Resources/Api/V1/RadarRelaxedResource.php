<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A relaxed rule of a radar (WP-13): `{"text": …}`.
 *
 * @property-read string $resource
 */
class RadarRelaxedResource extends JsonResource
{
    public function __construct(private readonly string $text)
    {
        parent::__construct($text);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['text' => $this->text];
    }
}
