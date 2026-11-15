<?php

namespace App\Http\Requests\Api\V1\Auth;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

/** `POST /auth/telegram`: the raw `initData` query string of the Mini App launch, at most 4 096 bytes. */
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
}
