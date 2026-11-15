<?php

namespace App\Http\Requests\Api\V1\Personal;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `POST /surveys/found` (WP-13, API-032): the answer to «Нашли жильё?» and what asked it. The legacy answer `kvadro`
 * is `homi` (brand, DEC-40). Extra keys are ignored.
 */
class StoreFoundAnswerRequest extends FormRequest
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
            'answer' => ['required', 'string', Rule::in(['homi', 'elsewhere', 'searching', 'stopped'])],
            'trigger' => ['required', 'string', Rule::in(['pause', 'delete'])],
        ];
    }
}
