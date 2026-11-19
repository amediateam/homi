<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The answer of `POST /settings/card-sample` (intake of legacy `index-BnFvC-Ft.js`, API-036): whether the bot sent the
 * sample card. Always a JSON boolean, never `204` (fix of LB-APP-052).
 *
 * @property-read bool $resource
 */
class CardSampleResource extends JsonResource
{
    public function __construct(private readonly bool $sent)
    {
        parent::__construct($sent);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['sent' => $this->sent];
    }
}
