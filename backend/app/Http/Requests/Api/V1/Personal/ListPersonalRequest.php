<?php

namespace App\Http\Requests\Api\V1\Personal;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The paging of the personal lists (WP-13, DEC-53): favourites and history page like the feed — `cursor` from
 * `meta.next_cursor` and `limit` 1 … 50, default 20.
 */
class ListPersonalRequest extends FormRequest
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
            'cursor' => ['nullable', 'string', 'max:512'],
            'limit' => ['nullable', 'integer', 'between:1,50'],
        ];
    }

    public function cursor(): ?string
    {
        return $this->filled('cursor') ? $this->string('cursor')->toString() : null;
    }

    public function limit(): int
    {
        return $this->integer('limit', 20);
    }
}
