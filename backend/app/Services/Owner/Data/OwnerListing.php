<?php

namespace App\Services\Owner\Data;

use App\Enums\ContactMode;
use App\Enums\OwnerHoldReason;
use App\Enums\OwnerListingStatus;
use App\Enums\OwnerPhoneError;
use App\Enums\OwnerRejectReason;
use App\Services\Sources\Data\Fields;

/**
 * An owner listing (WP-80, "The owner listing object"): a ULID from its creation, a number from its first publish,
 * its state, photos, form, counters, contact mode and phone. Only the owner listing object — the show answer and the
 * owner's writes — carries the true point and the owner's own number; the list's items leave both out.
 */
final readonly class OwnerListing
{
    /** @param  list<OwnerPhoto>  $photos */
    public function __construct(
        public string $id,
        public ?int $number,
        public OwnerListingStatus $status,
        public bool $withdrawn,
        public bool $held,
        public ?OwnerHoldReason $holdReason,
        public ?string $publishedAt,
        public array $photos,
        public OwnerListingForm $form,
        public ?OwnerListingStats $stats,
        public ContactMode $contactMode,
        public bool $phoneSet,
        public ?string $phoneDisplay,
        public ?OwnerPhoneError $phoneError,
        public ?OwnerRejectReason $rejectReason,
        public ?ShownPoint $shownPoint,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $stats = Fields::nullableObject($data, 'stats');
        $shown = Fields::nullableObject($data, 'shown_point');
        $hold = Fields::nullableString($data, 'hold_reason');
        $phoneError = Fields::nullableString($data, 'phone_error');
        $reject = Fields::nullableString($data, 'reject_reason');

        return new self(
            id: Fields::string($data, 'id'),
            number: Fields::nullableInt($data, 'number'),
            status: OwnerListingStatus::tryFrom(Fields::string($data, 'status')) ?? throw new \InvalidArgumentException('The field "status" must be an owner listing status.'),
            withdrawn: Fields::bool($data, 'withdrawn'),
            held: Fields::bool($data, 'held'),
            holdReason: $hold === null ? null : (OwnerHoldReason::tryFrom($hold) ?? throw new \InvalidArgumentException('Unknown hold reason.')),
            publishedAt: Fields::nullableString($data, 'published_at'),
            photos: array_map(OwnerPhoto::fromArray(...), Fields::objects($data, 'photos')),
            form: OwnerListingForm::fromArray(Fields::object($data, 'form')),
            stats: $stats === null ? null : OwnerListingStats::fromArray($stats),
            contactMode: ContactMode::tryFrom(Fields::string($data, 'contact_mode')) ?? throw new \InvalidArgumentException('Unknown contact mode.'),
            phoneSet: Fields::bool($data, 'phone_set'),
            phoneDisplay: Fields::nullableString($data, 'phone_display'),
            phoneError: $phoneError === null ? null : (OwnerPhoneError::tryFrom($phoneError) ?? throw new \InvalidArgumentException('Unknown phone error.')),
            rejectReason: $reject === null ? null : (OwnerRejectReason::tryFrom($reject) ?? throw new \InvalidArgumentException('Unknown reject reason.')),
            shownPoint: $shown === null ? null : ShownPoint::fromArray($shown),
        );
    }

    /** Whether the listing can no longer be changed by its owner: held, withdrawn, let or removed. */
    public function locked(): bool
    {
        return $this->held || $this->withdrawn || in_array($this->status, [OwnerListingStatus::Rented, OwnerListingStatus::Removed], true);
    }
}
