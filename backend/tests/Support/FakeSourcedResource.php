<?php

namespace Tests\Support;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The resource of the OpenAPI test route (WP-10).
 *
 * @property array{number: int, title: string} $resource
 */
final class FakeSourcedResource extends JsonResource
{
    /** @return array{number: int, title: string} */
    public function toArray(Request $request): array
    {
        return [
            'number' => $this->resource['number'],
            'title' => $this->resource['title'],
        ];
    }
}
