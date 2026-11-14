<?php

namespace App\Services\Sources;

use App\Models\SourceFlagChange;
use Closure;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Laravel\Pennant\Feature;

/**
 * Reads and changes the stored rule of a source feature for the `sources:*` commands (WP-10). A change runs in one
 * transaction behind a lock per feature — `pg_advisory_xact_lock` on PostgreSQL, a cache lock elsewhere — and reads
 * the stored rule again after `Feature::flushCache()`, so two changes cannot lose each other. Each change writes one
 * `source_flag_changes` row and a `notice` log line.
 */
final class SourceRuleStore
{
    /** True while this store writes a rule, so `RecordSourceFlagChange` skips the event it causes. */
    private bool $writing = false;

    public function __construct(
        private readonly SourceConfig $config,
        private readonly Application $app,
    ) {}

    public function isWriting(): bool
    {
        return $this->writing;
    }

    /** The value stored for the feature right now, as Pennant holds it; it may be malformed. */
    public function stored(string $feature): mixed
    {
        Feature::flushCache();

        return Feature::globally()->value($feature);
    }

    /**
     * @param  Closure(SourceRule): SourceRule  $change  receives the stored rule (empty when the stored value is malformed)
     *
     * @throws InvalidArgumentException for a feature that is not configured
     */
    public function change(string $feature, Closure $change, string $actor, string $reason): SourceFlagChange
    {
        $this->config->feature($feature);

        // Reading once outside the transaction stores the default row if it is missing. Pennant retries an insert
        // that loses a race, but inside a PostgreSQL transaction the failed insert aborts the transaction first.
        $this->stored($feature);

        $apply = fn (): SourceFlagChange => DB::transaction(function () use ($feature, $change, $actor, $reason): SourceFlagChange {
            if (DB::getDriverName() === 'pgsql') {
                DB::select('select pg_advisory_xact_lock(hashtext(?))', ['sources:'.$feature]);
            }

            $stored = $this->stored($feature);
            $new = $change($this->parse($stored))->toArray();

            $this->writing = true;

            try {
                Feature::globally()->activate($feature, $new);
            } finally {
                $this->writing = false;
            }

            $row = SourceFlagChange::query()->create([
                'feature' => $feature,
                'old_rule' => $stored,
                'new_rule' => $new,
                'actor' => $actor,
                'reason' => $reason,
                'environment' => $this->app->environment(),
            ]);

            Log::notice('Source rule changed.', ['feature' => $feature, 'old' => $stored, 'new' => $new, 'actor' => $actor, 'reason' => $reason]);

            return $row;
        });

        return DB::getDriverName() === 'pgsql' ? $apply() : Cache::lock('sources:'.$feature, 10)->block(5, $apply);
    }

    private function parse(mixed $stored): SourceRule
    {
        try {
            return SourceRule::fromStored($stored);
        } catch (InvalidArgumentException) {
            return new SourceRule;
        }
    }
}
