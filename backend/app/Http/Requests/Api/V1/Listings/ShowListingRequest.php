<?php

namespace App\Http\Requests\Api\V1\Listings;

use Illuminate\Foundation\Http\FormRequest;

/** `GET /listings/{number}` (WP-12): `preview=1` answers the preview object only and records no view. */
class ShowListingRequest extends FormRequest
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
            'preview' => ['nullable', 'boolean'],
        ];
    }

    public function wantsPreview(): bool
    {
        return $this->boolean('preview');
    }
}
