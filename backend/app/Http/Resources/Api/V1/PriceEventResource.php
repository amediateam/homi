<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\PriceEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A publication or a price change of the card's `price_history` (WP-12); the text is masked.
 *
 * @property-read PriceEvent $resource
 */
class PriceEventResource extends JsonResource
{
    public function __construct(private readonly PriceEvent $event)
    {
        parent::__construct($event);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'at' => $this->event->at,
            'channel' => $this->event->channel,
            'url' => $this->event->url,
            'text' => $this->event->text,
            'kind' => $this->event->kind,
            'price_usd' => $this->event->priceUsd,
            'change_pct' => $this->event->changePct,
        ];
    }
}
