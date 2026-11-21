<?php

namespace App\Http\Requests\Api\V1\Owner;

use Illuminate\Foundation\Http\FormRequest;

/**
 * `PUT /owner/listings/{id}/photos/order` (WP-80): exactly the listing's photo ids in the new order, the cover first.
 */
class OrderOwnerPhotosRequest extends FormRequest
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
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['string', 'ulid', 'distinct'],
        ];
    }

    /** @return list<string> */
    public function ids(): array
    {
        return array_values(array_map(strval(...), (array) $this->validated('ids')));
    }
}
