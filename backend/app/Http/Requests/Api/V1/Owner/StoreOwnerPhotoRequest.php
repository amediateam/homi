<?php

namespace App\Http\Requests\Api\V1\Owner;

use Illuminate\Foundation\Http\FormRequest;

/**
 * `POST /owner/listings/{id}/photos` (WP-80): `multipart/form-data` with one field `file`; the media codes come from the
 * uploader (WP-84, `HashedUploader`).
 */
class StoreOwnerPhotoRequest extends FormRequest
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
            'file' => ['required', 'file'],
        ];
    }
}
