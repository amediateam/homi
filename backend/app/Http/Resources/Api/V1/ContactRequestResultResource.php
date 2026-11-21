<?php

namespace App\Http\Resources\Api\V1;

use App\Enums\ContactRequestStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** `data` of `POST /listings/{number}/contact-request` (WP-80): the seeker-side status of the caller's request. */
class ContactRequestResultResource extends JsonResource
{
    public function __construct(private readonly ContactRequestStatus $status)
    {
        parent::__construct($status);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['status' => $this->status->forSeeker()];
    }
}
