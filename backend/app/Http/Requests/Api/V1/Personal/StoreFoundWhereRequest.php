<?php

namespace App\Http\Requests\Api\V1\Personal;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** `POST /surveys/found/where` (WP-13, API-033): where the home was found. Extra keys are ignored. */
class StoreFoundWhereRequest extends FormRequest
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
            'where' => ['required', 'string', Rule::in(['telegram', 'olx', 'site', 'agent', 'friends', 'street', 'other'])],
        ];
    }
}
