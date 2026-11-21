<?php

namespace App\Http\Requests\Api\V1\Listings;

use App\Enums\RequestWho;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `POST /listings/{number}/contact-request` (WP-80): who asks and how many, when and a message, and the raw `initData`
 * of the current launch (at most 4 096 bytes; never stored, logged or echoed — WP-85 verifies it).
 */
class StoreContactRequestRequest extends FormRequest
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
            'who' => ['required', Rule::enum(RequestWho::class)],
            'people' => ['required', 'integer', 'between:1,20'],
            'move_in' => ['nullable', 'string', 'max:32'],
            'message' => ['nullable', 'string', 'max:500'],
            'init_data' => ['required', 'string', 'max:4096'],
        ];
    }
}
