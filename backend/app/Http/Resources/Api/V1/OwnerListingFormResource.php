<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Owner\Data\OwnerListingForm;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** The form of an owner listing (WP-80): every key, `null` = not set; with the true point (`lat`, `lon`). */
class OwnerListingFormResource extends JsonResource
{
    public function __construct(private readonly OwnerListingForm $form)
    {
        parent::__construct($form);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return self::fields($this->form, withPoint: true);
    }

    /**
     * The form's keys; the list's items leave the true point out.
     *
     * @return array<string, mixed>
     */
    public static function fields(OwnerListingForm $form, bool $withPoint): array
    {
        $tenants = [];

        foreach ($form->tenants as $tenant) {
            $tenants[] = $tenant;
        }

        return [
            'city' => $form->city,
            'district_code' => $form->districtCode,
            'landmark' => $form->landmark,
            ...($withPoint ? ['lat' => $form->lat, 'lon' => $form->lon] : []),
            'room' => $form->room,
            'rooms' => $form->rooms,
            'area_m2' => $form->areaM2,
            'floor' => $form->floor,
            'floors_total' => $form->floorsTotal,
            'price' => $form->price,
            'currency' => $form->currency,
            'renovation' => $form->renovation,
            'furniture' => $form->furniture,
            'tenants' => $tenants,
            'pets' => $form->pets,
            'description' => $form->description,
        ];
    }
}
