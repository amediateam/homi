<?php

namespace App\Services\Personal;

use App\Enums\Personal\ReportReason;

/**
 * What one detector of `VoteService` counts the votes of (WP-44, "Reports and votes"): a listing number for `rented`
 * and, on a native number, `fraud`; an author key for `agent`. `subject` is what `vote_decisions.subject` stores — the
 * number as a string, or the pseudonymous key, never a phone number.
 */
final readonly class VoteSubject
{
    private function __construct(public string $type, public string $subject, public ReportReason $reason, public ?int $number, public ?string $authorKey) {}

    public static function listing(int $number, ReportReason $reason): self
    {
        return new self('listing', (string) $number, $reason, $number, null);
    }

    public static function author(string $authorKey): self
    {
        return new self('author', $authorKey, ReportReason::Agent, null, $authorKey);
    }

    public function isAuthor(): bool
    {
        return $this->authorKey !== null;
    }
}
