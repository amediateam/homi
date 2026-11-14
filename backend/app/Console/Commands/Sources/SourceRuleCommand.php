<?php

namespace App\Console\Commands\Sources;

use App\Models\SourceFlagChange;
use App\Services\Sources\SourceConfig;
use Illuminate\Console\Command;
use InvalidArgumentException;

/** What `sources:set` and `sources:reset` share: the feature check, who and why, and the report of a change. */
abstract class SourceRuleCommand extends Command
{
    protected function feature(SourceConfig $config): ?string
    {
        $feature = (string) $this->argument('feature');

        try {
            $config->feature($feature);
        } catch (InvalidArgumentException $e) {
            $this->components->error($e->getMessage().' Run `php artisan sources:list`.');

            return null;
        }

        return $feature;
    }

    /** @return array{0: string, 1: string}|null who and why, both required */
    protected function audit(): ?array
    {
        $by = trim((string) $this->option('by'));
        $reason = trim((string) $this->option('reason'));

        if ($by === '' || mb_strlen($by) > 64) {
            $this->components->error('--by is required: who makes the change, at most 64 characters.');

            return null;
        }

        if ($reason === '' || mb_strlen($reason) > 255) {
            $this->components->error('--reason is required: why, at most 255 characters.');

            return null;
        }

        return [$by, $reason];
    }

    /** @return list<int>|null the --user ids, or null when one is not a positive integer */
    protected function userIds(): ?array
    {
        $ids = [];

        foreach ((array) $this->option('user') as $id) {
            if (! is_string($id) || ! ctype_digit($id) || (int) $id < 1) {
                $this->components->error('--user takes a user id, a positive integer.');

                return null;
            }

            $ids[] = (int) $id;
        }

        return $ids;
    }

    protected function report(SourceFlagChange $change): void
    {
        $this->components->info(sprintf(
            '%s: %s → %s (audit row %d).',
            $change->feature,
            json_encode($change->old_rule, JSON_UNESCAPED_SLASHES),
            json_encode($change->new_rule, JSON_UNESCAPED_SLASHES),
            $change->id,
        ));
    }
}
