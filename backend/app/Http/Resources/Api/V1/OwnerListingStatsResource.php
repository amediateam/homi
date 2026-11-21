<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\OwnerListingStats;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** The counters of a published owner listing (WP-80); `daily` holds seven values, the last is today. */
class OwnerListingStatsResource extends JsonResource
{
    public function __construct(private readonly OwnerListingStats $stats)
    {
        parent::__construct($stats);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $daily = [];

        foreach ($this->stats->daily as $count) {
            $daily[] = (int) $count;
        }

        return [
            'pending' => $this->stats->pending,
            'requests' => $this->stats->requests,
            'given' => $this->stats->given,
            'sent' => $this->stats->sent,
            'opened' => $this->stats->opened,
            'favorites' => $this->stats->favorites,
            'days_listed' => $this->stats->daysListed,
            'daily' => $daily,
            'price_delta' => $this->stats->priceDelta,
            'price_tone' => $this->stats->priceTone,
        ];
    }
}
