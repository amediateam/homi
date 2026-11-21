<?php

namespace App\Http\Requests\Api\V1\Owner;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `PUT /owner/listings/{id}/contact-mode` (WP-80): `request` hides the number and takes requests, `phone` shows it.
 */
class UpdateContactModeRequest extends FormRequest
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
            'mode' => ['required', Rule::in(['request', 'phone'])],
        ];
    }
}
