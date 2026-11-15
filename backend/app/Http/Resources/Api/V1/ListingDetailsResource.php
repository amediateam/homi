<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingDetails;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The full card of `GET /listings/{number}` (WP-12): the preview plus the card's parts. `contact` holds what the
 * screen needs for its buttons and no number: the keys `phone`, `phone_display`, `call_url` and
 * `call_url_expires_at` do not exist here (DEC-52); `POST …/contact` gives them.
 *
 * @property-read ListingDetails $resource
 */
class ListingDetailsResource extends JsonResource
{
    public function __construct(private readonly ListingDetails $details)
    {
        parent::__construct($details);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $card = $this->details;
        $preview = (new ListingPreviewResource($card->preview))->toArray($request);
        [$items, $facts, $nearby, $history, $offers, $sources] = [[], [], [], [], [], []];

        foreach ($card->photoItems as $photo) {
            $items[] = $photo;
        }

        foreach ($card->facts as $fact) {
            $facts[] = ['key' => $fact->key, 'label' => $fact->label, 'value' => $fact->value];
        }

        foreach ($card->nearby as $place) {
            $nearby[] = ['kind' => $place->kind, 'name' => $place->name, 'km' => $place->km, 'note' => $place->note];
        }

        foreach ($card->priceHistory as $event) {
            $history[] = [
                'at' => $event->at, 'channel' => $event->channel, 'url' => $event->url, 'text' => $event->text,
                'kind' => $event->kind, 'price_usd' => $event->priceUsd, 'change_pct' => $event->changePct,
            ];
        }

        foreach ($card->offers as $offer) {
            $offers[] = ['text' => $offer->text, 'url' => $offer->url];
        }

        foreach ($card->sources as $source) {
            $sources[] = ['handle' => $source->handle, 'url' => $source->url];
        }

        $comparison = $card->comparison;

        return [
            ...$preview,
            'photos' => [
                'preview' => $preview['photos']['preview'],
                'count' => $card->preview->photosCount,
                'cover' => $card->preview->photosCover,
                'items' => $items,
            ],
            'market' => [
                'label' => $card->preview->marketLabel,
                'code' => $card->marketCode,
                'median_delta' => $card->preview->medianDelta,
                'tone' => $card->preview->marketTone,
            ],
            'facts' => $facts,
            'nearby' => $nearby,
            'stats' => [
                'days_listed' => $card->daysListed,
                'publications' => $card->publications,
                'channels' => $card->channels,
                'views' => $card->views,
            ],
            'price_history' => $history,
            'geo_radius_m' => $card->geoRadiusM,
            'author' => $card->authorKind === null ? null : ['kind' => $card->authorKind, 'label' => $card->authorLabel, 'count' => $card->authorCount],
            'owner_label' => $card->ownerLabel,
            'contact' => ['has_phone' => $card->hasPhone, 'contact_url' => $card->contactUrl, 'contact_paid' => $card->contactPaid],
            'summary' => $card->summary,
            'offers' => $offers,
            'original' => ['text' => $card->originalText, 'url' => $card->originalUrl, 'deleted' => $card->originalDeleted],
            'sources' => $sources,
            'comparison' => $comparison === null ? null : [
                'value' => $comparison->value,
                'own' => $comparison->own,
                'n' => $comparison->n,
                'metric' => $comparison->metric,
                'scope' => $comparison->scope,
                'rooms' => $comparison->rooms,
                'near_class' => $comparison->nearClass,
                'radius_km' => $comparison->radiusKm,
                'district' => $comparison->district,
                'place_value' => $comparison->placeValue,
                'note' => $comparison->note,
                'updated' => $comparison->updated,
                'has_reason' => $comparison->hasReason,
                'price_usd' => $comparison->priceUsd,
                'price_per_m2' => $comparison->pricePerM2,
            ],
        ];
    }
}
