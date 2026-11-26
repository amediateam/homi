<?php

namespace App\Services\Access;

use App\Enums\AccessState;
use App\Exceptions\AccessDenied;

/** What the access gate decided for a user (WP-40): granted, or a refusal with its reason. */
final readonly class AccessDecision
{
    public function __construct(public AccessState $state) {}

    public function granted(): bool
    {
        return $this->state === AccessState::Granted;
    }

    /**
     * Whether even the lenient gate of `POST /events` refuses: only an operator's block and the service's pause.
     */
    public function refusesEverything(): bool
    {
        return $this->state === AccessState::Blocked || $this->state === AccessState::Paused;
    }

    /** The `403 access_denied` of a refusal, or null when access is granted. */
    public function refusal(): ?AccessDenied
    {
        $reason = $this->state->reason();

        return $reason === null ? null : new AccessDenied($reason);
    }
}
