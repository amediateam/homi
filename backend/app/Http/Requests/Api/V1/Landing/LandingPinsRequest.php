<?php

namespace App\Http\Requests\Api\V1\Landing;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** `GET /landing/pins` (WP-13): `deal` is `rent` (default) or `sale`. */
class LandingPinsRequest extends FormRequest
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
        return ['deal' => ['nullable', Rule::in(['rent', 'sale'])]];
    }

    /** @return 'rent'|'sale' */
    public function deal(): string
    {
        return $this->query('deal') === 'sale' ? 'sale' : 'rent';
    }
}
