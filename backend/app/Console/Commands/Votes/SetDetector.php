<?php

namespace App\Console\Commands\Votes;

use App\Console\Commands\Sources\SourceRuleCommand;
use App\Services\Personal\VoteDetectors;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;

/**
 * `votes:detector` (WP-44, SEC-REQ-045): the kill switch of a vote detector, without a deploy. Who and why are required
 * and go to the audit row, as for `sources:set`.
 */
#[Signature('votes:detector
    {detector : rented or realtor}
    {state : on or off}
    {--by= : Who makes the change (required)}
    {--reason= : Why (required)}')]
#[Description('Switch a vote detector on or off for everyone: off writes no new mark, and the listing answers ignore the existing marks from the next request')]
class SetDetector extends SourceRuleCommand
{
    public function handle(VoteDetectors $detectors): int
    {
        $detector = (string) $this->argument('detector');
        $state = (string) $this->argument('state');

        if (! isset(VoteDetectors::FEATURES[$detector])) {
            $this->components->error('The detector is one of: rented, realtor.');

            return self::FAILURE;
        }

        if (! in_array($state, ['on', 'off'], true)) {
            $this->components->error('The state is on or off.');

            return self::FAILURE;
        }

        $audit = $this->audit();

        if ($audit === null) {
            return self::FAILURE;
        }

        $this->report($detectors->set($detector, $state === 'on', ...$audit));

        return self::SUCCESS;
    }
}
