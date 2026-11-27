<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Telegram\PreparedShare;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `data` of `POST /listings/{number}/share` (WP-12): the prepared inline message for `WebApp.shareMessage`.
 *
 * @property-read PreparedShare $resource
 */
class PreparedShareResource extends JsonResource
{
    public function __construct(private readonly PreparedShare $share)
    {
        parent::__construct($share);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['prepared_message_id' => $this->share->id, 'expires_at' => $this->share->expiresAt];
    }
}
