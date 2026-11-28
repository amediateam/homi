<?php

namespace App\Services\Personal;

/**
 * What a report did for its reporter (WP-44, `VoteService::report()`; the answer of WP-13): `hidden` — the listing is
 * now hidden for him (`rented`, `fraud`); `agentMarked` — an `agent` report whose author is marked as a realtor, by
 * this vote or already (`config('votes.agent_marked.already_marked')`), while the realtor detector is on. A repeat of
 * the same report answers the same.
 */
final readonly class ReportOutcome
{
    public function __construct(public bool $hidden, public bool $agentMarked) {}
}
