<?php

namespace App\Http\Requests\Api\V1\Media;

use App\Enums\MediaVisibility;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMediaRequest extends FormRequest
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
            // Content validation (MIME sniffing, dimensions) happens in HashedUploader.
            'file' => ['required', 'file', 'max:'.(int) ceil(((int) config('media.max_bytes')) / 1024)],
            'visibility' => ['sometimes', Rule::enum(MediaVisibility::class)],
        ];
    }

    public function visibility(): MediaVisibility
    {
        return MediaVisibility::from((string) $this->validated('visibility', MediaVisibility::Public->value));
    }
}
