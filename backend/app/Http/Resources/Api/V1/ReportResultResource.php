<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The answer of `POST /listings/{number}/reports` (WP-13): whether the listing is now hidden for the reporter —
 * `true` for `rented` and `fraud`, `false` for `agent` and `wrong_data`. Never `204` (fix of LB-API-015).
 *
 * @property-read bool $resource
 */
class ReportResultResource extends JsonResource
{
    public function __construct(private readonly bool $hidden)
    {
        parent::__construct($hidden);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['hidden' => $this->hidden];
    }
}
