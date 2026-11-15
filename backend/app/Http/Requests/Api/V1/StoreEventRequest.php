<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\PostTooLargeException;

/**
 * `POST /events` (WP-11): `{name, props?}`. Only a missing or non-string `name` is a `422`. An unknown name, a name
 * outside the pattern or unknown properties are accepted and not stored (WP-47 stores the catalogue). The raw body
 * is capped at 8 KB before anything else: over it, `413 payload_too_large`.
 */
class StoreEventRequest extends FormRequest
{
    public const int MAX_BODY_BYTES = 8192;

    /**
     * The event names of the legacy vocabulary (`03` §3.3), so one vocabulary serves both products; `listing_id`
     * carries the listing number.
     */
    public const array CATALOGUE = [
        'app_launch', 'app_opened', 'app_error',
        'follow_prompt_shown', 'follow_prompt_expired', 'follow_prompt_closed',
        'return_prompt_shown', 'return_prompt_expired', 'return_prompt_closed',
        'feed_radar_shown', 'feed_radar_closed',
        'home_screen_offered', 'home_screen_added', 'home_screen_closed',
        'chat_access_declined', 'chat_access_allowed',
        'listing_shared', 'original_copied', 'contact_write', 'original_opened', 'contact_call',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string'],
            'props' => ['sometimes'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (strlen($this->getContent()) > self::MAX_BODY_BYTES) {
            throw new PostTooLargeException('The event body is over '.self::MAX_BODY_BYTES.' bytes.');
        }
    }
}
