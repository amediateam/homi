<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingContact;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `data` of `POST /listings/{number}/contact` (WP-12, DEC-52), the only answer with the author's number: `phone`
 * (E.164) and `phone_display` are null when the source has none; `call_url` is always set and valid until
 * `expires_at`.
 *
 * @property-read ListingContact $resource
 */
class ContactResource extends JsonResource
{
    public function __construct(private readonly ListingContact $contact)
    {
        parent::__construct($contact);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'call_url' => $this->contact->callUrl,
            'expires_at' => $this->contact->expiresAt,
            'phone' => $this->contact->phone,
            'phone_display' => $this->contact->phoneDisplay,
        ];
    }
}
