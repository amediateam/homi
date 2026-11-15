<?php

namespace App\Http\Requests\Api\V1\Radars;

use Illuminate\Validation\Rule;

/**
 * `POST /radars` (WP-13): the filters and `entry`, where the radar was turned on, kept for statistics (BR-API-086):
 * the filters sheet, the new-radar sheet, the few-results note, the follow nudge, the feed card and the return banner.
 */
class StoreRadarRequest extends RadarFiltersRequest
{
    public const array ENTRIES = ['filters', 'empty', 'few', 'prompt', 'feed', 'return'];

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [...parent::rules(), 'entry' => ['required', 'string', Rule::in(self::ENTRIES)]];
    }
}
