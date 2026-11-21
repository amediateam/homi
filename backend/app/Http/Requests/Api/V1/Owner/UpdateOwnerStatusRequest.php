<?php

namespace App\Http\Requests\Api\V1\Owner;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `PUT /owner/listings/{id}/status` (WP-80): `active`, `paused`, `rented` or `removed`.
 */
class UpdateOwnerStatusRequest extends FormRequest
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
            'status' => ['required', Rule::in(['active', 'paused', 'rented', 'removed'])],
        ];
    }
}
