<?php

namespace App\Services\Sources\Data;

use App\Enums\ContactRequestStatus;

/**
 * The caller's request on a listing, as the card shows it (WP-80): its status in the seeker's form — `agent` reads as
 * `declined` — and when it was sent.
 */
final readonly class ContactRequestState
{
    public function __construct(
        public ContactRequestStatus $status,
        public ?string $sentAt,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $status = ContactRequestStatus::tryFrom(Fields::string($data, 'status')) ?? throw new \InvalidArgumentException('The field "status" must be a request status.');

        return new self(status: $status->forSeeker(), sentAt: Fields::nullableString($data, 'sent_at'));
    }
}
