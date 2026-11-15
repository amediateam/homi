<?php

namespace App\Http\Requests\Api\V1\Radars;

use Illuminate\Foundation\Http\FormRequest;

/**
 * `POST /radars/{id}/relax` (WP-13): `code` of one of the options the radar offered; the controller checks it
 * against the radar's options (`422` on `code` otherwise).
 */
class RelaxRadarRequest extends FormRequest
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
        return ['code' => ['required', 'string', 'regex:/^[a-z_]{1,32}$/']];
    }
}
