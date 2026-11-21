<?php

namespace App\Services\Owner\Data;

use App\Enums\ContactRequestStatus;
use App\Enums\RequestWho;
use App\Services\Listings\PhoneMasker;
use App\Services\Sources\Data\Fields;

/**
 * A seeker's request as its owner sees it (WP-80, "The owner request object"): the seeker's Telegram first name of
 * the verified launch data (DEC-76), who and how many, when and the message — both masked (DEC-52) — its owner-side status
 * and which answers the server still allows (BR-API-180).
 */
final readonly class OwnerRequest
{
    public function __construct(
        public string $id,
        public ?string $name,
        public RequestWho $who,
        public int $people,
        public ?string $moveIn,
        public ?string $message,
        public ContactRequestStatus $status,
        public bool $agentMarked,
        public bool $canReason,
        public bool $canUndo,
        public bool $canLate,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $message = Fields::nullableString($data, 'message');
        $moveIn = Fields::nullableString($data, 'move_in');

        return new self(
            id: Fields::string($data, 'id'),
            name: Fields::nullableString($data, 'name'),
            who: RequestWho::tryFrom(Fields::string($data, 'who')) ?? throw new \InvalidArgumentException('Unknown "who".'),
            people: Fields::int($data, 'people'),
            moveIn: $moveIn === null ? null : PhoneMasker::mask($moveIn),
            message: $message === null ? null : PhoneMasker::mask($message),
            status: ContactRequestStatus::tryFrom(Fields::string($data, 'status')) ?? throw new \InvalidArgumentException('Unknown request status.'),
            agentMarked: Fields::bool($data, 'agent_marked'),
            canReason: Fields::bool($data, 'can_reason'),
            canUndo: Fields::bool($data, 'can_undo'),
            canLate: Fields::bool($data, 'can_late'),
        );
    }
}
