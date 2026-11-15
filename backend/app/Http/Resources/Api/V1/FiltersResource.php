<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Search\SearchFilters;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The filters object (WP-12): the 25 keys in the documented order, every key present, lists never null, `polygon`
 * as `[[lat, lon], …]` or null. Flow options and radars carry it.
 *
 * @property-read SearchFilters $resource
 */
class FiltersResource extends JsonResource
{
    public function __construct(private readonly SearchFilters $filters)
    {
        parent::__construct($filters);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $f = $this->filters;
        [$types, $districts, $zones, $renovation, $appliances] = [[], [], [], [], []];

        foreach ($f->types as $type) {
            $types[] = $type;
        }

        foreach ($f->districts as $district) {
            $districts[] = $district;
        }

        foreach ($f->zones as $zone) {
            $zones[] = $zone;
        }

        foreach ($f->renovation as $code) {
            $renovation[] = $code;
        }

        foreach ($f->appliances as $code) {
            $appliances[] = $code;
        }

        $polygon = null;

        if ($f->polygon !== null) {
            $polygon = [];

            foreach ($f->polygon as [$lat, $lon]) {
                $polygon[] = [$lat, $lon];
            }
        }

        return [
            'city' => $f->city,
            'deal' => $f->deal,
            'types' => $types,
            'districts' => $districts,
            'rooms_min' => $f->roomsMin,
            'rooms_max' => $f->roomsMax,
            'price_min' => $f->priceMin,
            'price_max' => $f->priceMax,
            'zones' => $zones,
            'near_metro' => $f->nearMetro,
            'below_median' => $f->belowMedian,
            'owner' => $f->owner,
            'tenant' => $f->tenant,
            'pets' => $f->pets,
            'pets_only' => $f->petsOnly,
            'furnished' => $f->furnished,
            'renovation' => $renovation,
            'floor_not_first' => $f->floorNotFirst,
            'floor_not_last' => $f->floorNotLast,
            'area_min' => $f->areaMin,
            'area_max' => $f->areaMax,
            'market' => $f->market,
            'appliances' => $appliances,
            'posted_days' => $f->postedDays,
            'polygon' => $polygon,
        ];
    }
}
