<?php

namespace App\Http\Requests\Api\V1\Owner;

use Illuminate\Foundation\Http\FormRequest;

/**
 * `GET /owner/place` (WP-80, DEC-79): both coordinates; the server rounds a finer value to 3 decimals before the lookup,
 * so no owner's exact point travels further (SEC-REQ-052).
 */
class OwnerPlaceRequest extends FormRequest
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
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lon' => ['required', 'numeric', 'between:-180,180'],
        ];
    }

    public function lat(): float
    {
        return round((float) $this->validated('lat'), 3);
    }

    public function lon(): float
    {
        return round((float) $this->validated('lon'), 3);
    }
}
