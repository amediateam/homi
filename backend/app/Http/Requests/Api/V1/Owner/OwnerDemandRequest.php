<?php

namespace App\Http\Requests\Api\V1\Owner;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `GET /owner/demand` (WP-80, DEC-84): the flat whose demand is asked; `city` required, the rest optional.
 */
class OwnerDemandRequest extends FormRequest
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
            'city' => ['required', 'string', 'max:64'],
            'district' => ['nullable', 'string', 'max:64'],
            'rooms' => ['nullable', 'integer', 'between:1,5'],
            'room' => ['nullable', 'boolean'],
            'price' => ['nullable', 'integer', 'min:1'],
            'currency' => ['nullable', Rule::in(['USD', 'UZS'])],
        ];
    }
}
