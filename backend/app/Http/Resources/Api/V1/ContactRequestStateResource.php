<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ContactRequestState;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** The caller's request on a listing (WP-80): its seeker-side status and when it was sent. */
class ContactRequestStateResource extends JsonResource
{
    public function __construct(private readonly ContactRequestState $state)
    {
        parent::__construct($state);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['status' => $this->state->status, 'sent_at' => $this->state->sentAt];
    }
}
