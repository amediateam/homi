<?php

namespace App\Console\Commands\Votes;

use App\Services\Personal\VoteDetectors;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * `votes:detector` (WP-44, SEC-REQ-045): the kill switch of a vote detector, without a deploy. Who and why are required
 * and go to the audit row (`source_flag_changes`), with the limits of its columns, as for `sources:set`.
 */
#[Signature('votes:detector
    {detector : rented or realtor}
    {state : on or off}
    {--by= : Who makes the change (required)}
    {--reason= : Why (required)}')]
#[Description('Switch a vote detector on or off for everyone: off writes no new mark, and the listing answers ignore the existing marks from the next request')]
class SetDetector extends Command
{
    public function handle(VoteDetectors $detectors): int
    {
        $detector = (string) $this->argument('detector');
        $state = (string) $this->argument('state');
        $by = trim((string) $this->option('by'));
        $reason = trim((string) $this->option('reason'));

        $error = match (true) {
            ! isset(VoteDetectors::FEATURES[$detector]) => 'The detector is one of: rented, realtor.',
            ! in_array($state, ['on', 'off'], true) => 'The state is on or off.',
            $by === '' || mb_strlen($by) > 64 => '--by is required: who makes the change, at most 64 characters.',
            $reason === '' || mb_strlen($reason) > 255 => '--reason is required: why, at most 255 characters.',
            default => null,
        };

        if ($error !== null) {
            $this->components->error($error);

            return self::FAILURE;
        }

        $change = $detectors->set($detector, $state === 'on', $by, $reason);
        $this->components->info(sprintf(
            '%s: %s → %s (audit row %d).',
            $change->feature,
            json_encode($change->old_rule),
            json_encode($change->new_rule),
            $change->id,
        ));

        return self::SUCCESS;
    }
}
