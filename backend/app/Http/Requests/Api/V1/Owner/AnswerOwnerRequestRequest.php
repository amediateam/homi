<?php

namespace App\Http\Requests\Api\V1\Owner;

use App\Enums\OwnerRequestAction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `POST /owner/requests/{id}/answer` (WP-80, BR-API-180): one of the owner's answers.
 */
class AnswerOwnerRequestRequest extends FormRequest
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
            'action' => ['required', Rule::enum(OwnerRequestAction::class)],
        ];
    }
}
