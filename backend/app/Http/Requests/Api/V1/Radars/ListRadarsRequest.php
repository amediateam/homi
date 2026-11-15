<?php

namespace App\Http\Requests\Api\V1\Radars;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** `GET /radars` (WP-13): `include=previews` adds each radar's preview (fix of LB-API-038). */
class ListRadarsRequest extends FormRequest
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
        return ['include' => ['nullable', Rule::in(['previews'])]];
    }

    public function wantsPreviews(): bool
    {
        return $this->query('include') === 'previews';
    }
}
