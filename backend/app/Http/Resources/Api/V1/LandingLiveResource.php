<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\LandingLive;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `data` of `GET /landing/live` (WP-13): public; no phone, no listing text, no author.
 *
 * @property-read LandingLive $resource
 */
class LandingLiveResource extends JsonResource
{
    public function __construct(private readonly LandingLive $live)
    {
        parent::__construct($live);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $live = $this->live;

        return [
            'now' => $live->now,
            'generated_at' => $live->generatedAt,
            'day' => $live->day,
            'week' => $live->week,
            'latest' => LandingLatestResource::collection($live->latest),
            'sheet' => [
                'all' => ['count' => $live->allCount, 'per_day' => $live->allPerDay],
                'demo' => ['count' => $live->demoCount, 'per_day' => $live->demoPerDay],
            ],
        ];
    }
}
