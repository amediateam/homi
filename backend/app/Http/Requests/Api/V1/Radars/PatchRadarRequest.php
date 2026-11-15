<?php

namespace App\Http\Requests\Api\V1\Radars;

use App\Enums\RadarMode;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * `PATCH /radars/{id}` (WP-13): exactly one known change — `active` (switch on or pause), `mode` or `unhide: true`.
 * No key, several keys or an unknown key is `422` (`08` API-021).
 */
class PatchRadarRequest extends FormRequest
{
    public const array KEYS = ['active', 'mode', 'unhide'];

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
            'active' => ['sometimes', 'boolean'],
            'mode' => ['sometimes', Rule::enum(RadarMode::class)],
            'unhide' => ['sometimes', 'boolean', function (string $attribute, mixed $value, Closure $fail): void {
                if ($value !== true) {
                    $fail('The unhide key can only be true.');
                }
            }],
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $keys = array_map('strval', array_keys($this->json()->all()));

            foreach (array_diff($keys, self::KEYS) as $unknown) {
                $validator->errors()->add($unknown, "The {$unknown} key is not a radar change.");
            }

            if (count(array_intersect($keys, self::KEYS)) !== 1) {
                $validator->errors()->add('change', 'Send exactly one of active, mode or unhide.');
            }
        }];
    }
}
