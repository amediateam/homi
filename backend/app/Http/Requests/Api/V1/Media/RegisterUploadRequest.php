<?php

namespace App\Http\Requests\Api\V1\Media;

use App\Enums\MediaVisibility;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterUploadRequest extends FormRequest
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
            // Keys are issued by POST /media/presign as uploads/{user_id}/{ulid}.{ext}.
            'key' => ['required', 'string', 'max:255', 'regex:/^uploads\/[0-9]+\/[A-Za-z0-9]+\.(jpg|png|webp|gif)$/'],
            'visibility' => ['sometimes', Rule::enum(MediaVisibility::class)],
        ];
    }

    public function visibility(): MediaVisibility
    {
        return MediaVisibility::from((string) $this->validated('visibility', MediaVisibility::Public->value));
    }
}
