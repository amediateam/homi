<?php

namespace App\Http\Requests\Api\V1\Media;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PresignRequest extends FormRequest
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
            'filename' => ['required', 'string', 'max:255'],
            'mime' => ['required', 'string', Rule::in(array_keys((array) config('media.allowed_mimes', [])))],
            'bytes' => ['required', 'integer', 'min:1', 'max:'.(int) config('media.max_bytes')],
        ];
    }
}
