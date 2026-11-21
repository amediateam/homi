<?php

namespace App\Http\Requests\Api\V1\Owner;

use App\Services\Owner\Data\OwnerListingForm;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Config;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * `PATCH /owner/listings/{id}` (WP-80): any subset of the form's keys; `null` clears a key, an absent key stays,
 * unknown keys are ignored. `lat` and `lon` come together; `room` excludes `rooms`; `floor` above `floors_total` is
 * refused naming `floor`. Whether the point lies in the country and the city is WP-84's check (`errors.point`).
 */
class UpdateOwnerListingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'city' => ['sometimes', 'nullable', 'string', 'max:64'],
            'district_code' => ['sometimes', 'nullable', 'string', 'max:64'],
            'landmark' => ['sometimes', 'nullable', 'string', 'max:120'],
            // Not `sometimes`: a point comes whole, so one coordinate without the other is refused.
            'lat' => ['nullable', 'numeric', 'between:-90,90', 'required_with:lon'],
            'lon' => ['nullable', 'numeric', 'between:-180,180', 'required_with:lat'],
            'room' => ['sometimes', 'nullable', 'boolean'],
            'rooms' => ['sometimes', 'nullable', 'integer', 'between:1,5', 'prohibited_if_accepted:room'],
            'area_m2' => ['sometimes', 'nullable', 'numeric', 'between:5,1000', 'decimal:0,1'],
            'floor' => ['sometimes', 'nullable', 'integer', 'between:-3,99'],
            'floors_total' => ['sometimes', 'nullable', 'integer', 'between:1,99'],
            'price' => ['sometimes', 'nullable', 'integer', 'between:1,999999999999'],
            'currency' => ['sometimes', 'nullable', Rule::in(['USD', 'UZS'])],
            'renovation' => ['sometimes', 'nullable', 'string', Rule::in(array_column(Config::array('owner.renovations'), 'code'))],
            'furniture' => ['sometimes', 'nullable', 'boolean'],
            'tenants' => ['sometimes', 'nullable', 'list'],
            'tenants.*' => ['string', 'distinct', Rule::in(OwnerListingForm::TENANTS)],
            'pets' => ['sometimes', 'nullable', 'boolean'],
            'description' => ['sometimes', 'nullable', 'string', 'max:600'],
        ];
    }

    /**
     * `floor` above `floors_total` (both sent) names `floor`.
     *
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $floor = $this->input('floor');
            $total = $this->input('floors_total');

            if (is_numeric($floor) && is_numeric($total) && (int) $floor > (int) $total) {
                $validator->errors()->add('floor', 'The floor must not be above the floors of the building.');
            }

            // A point comes whole: one coordinate sent alone, `null` included, is refused.
            if ($this->has('lat') !== $this->has('lon')) {
                $validator->errors()->add($this->has('lat') ? 'lon' : 'lat', 'The point needs both coordinates.');
            }
        }];
    }

    /**
     * The sent form keys with their values (`null` clears); `currency` cleared is `USD`; a point rounded to 5 decimals.
     *
     * @return array<string, mixed>
     */
    public function changes(): array
    {
        $changes = array_intersect_key($this->validated(), array_flip(OwnerListingForm::KEYS));

        if (array_key_exists('currency', $changes) && $changes['currency'] === null) {
            $changes['currency'] = 'USD';
        }

        // The validated values in their types: a form body may send `"600"`, `1` or `"0"`.
        foreach ($changes as $key => $value) {
            if ($value === null) {
                continue;
            }

            $changes[$key] = match ($key) {
                'lat', 'lon' => round((float) $value, 5),
                'area_m2' => round((float) $value, 1),
                'rooms', 'floor', 'floors_total', 'price' => (int) $value,
                'room', 'furniture', 'pets' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
                default => $value,
            };
        }

        if (array_key_exists('room', $changes) && $changes['room'] === null) {
            $changes['room'] = false;
        }

        return $changes;
    }
}
