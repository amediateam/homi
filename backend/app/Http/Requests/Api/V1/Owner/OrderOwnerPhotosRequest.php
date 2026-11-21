<?php

namespace App\Http\Requests\Api\V1\Owner;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

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
            'ids.*' => ['string', 'ulid'],
        ];
    }

    /**
     * A repeated id names `ids`, as a missing or an extra one does (the stub compares the set).
     *
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $ids = array_filter((array) $this->input('ids', []), is_string(...));

            if (count($ids) !== count(array_unique($ids))) {
                $validator->errors()->add('ids', 'Each photo id comes once.');
            }
        }];
    }

    /** @return list<string> */
    public function ids(): array
    {
        return array_values(array_map(strval(...), (array) $this->validated('ids')));
    }
}
