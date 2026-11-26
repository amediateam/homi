<?php

namespace App\Http\Requests\Api\V1\Auth;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * `POST /auth/telegram`: the raw `initData` query string of the Mini App launch, at most 4 096 bytes. It is read from
 * the JSON body only (SEC-REQ-003, WP-40): a value in the address would reach access logs and the browser history, so
 * an `init_data` in the query string is ignored, also beside one in the body.
 */
class TelegramSignInRequest extends FormRequest
{
    public const int MAX_BYTES = 4096;

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
            'init_data' => [
                'required',
                'string',
                'max:'.self::MAX_BYTES,
                // `max` counts characters; the limit is in bytes.
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && strlen($value) > self::MAX_BYTES) {
                        $fail('The :attribute field must not be greater than '.self::MAX_BYTES.' bytes.');
                    }
                },
            ],
        ];
    }

    /**
     * The JSON body alone, never the query string.
     *
     * @return array<array-key, mixed>
     */
    public function validationData(): array
    {
        return $this->json()->all();
    }

    /** The validated launch value of the body. */
    public function initData(): string
    {
        $value = $this->validated('init_data');

        return is_string($value) ? $value : '';
    }
}
