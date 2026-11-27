<?php

namespace App\Services\Personal;

use App\Models\SourceFlagChange;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Laravel\Pennant\Feature;

/**
 * The kill switches of HOMI's two vote detectors (WP-44, SEC-REQ-045): Pennant features in the global scope, like the
 * source rules of WP-10, defined on by `AppServiceProvider`. Off means no new mark is written (`VoteService`) and the
 * overlay ignores the existing marks at once (`EloquentOverlayData` asks before its cache of the realtor keys); the
 * votes, the voter's own hide and a recount that removes a mark go on. `votes:detector` switches them.
 *
 * A switch writes one `source_flag_changes` row — WP-10's audit of the source rules, whose columns fit (brief decision
 * 16: no table of its own) — and a `notice` log line; neither holds personal data. `RecordSourceFlagChange` records
 * only the source features, so a switch is audited once. The stored value is read once outside the transaction, which
 * stores the default row if it is missing: inside a PostgreSQL transaction Pennant's retry of a lost insert would
 * abort it. On PostgreSQL the change runs behind an advisory lock per feature, so the old value of the audit is right.
 */
final readonly class VoteDetectors
{
    public const string RENTED = 'votes.rented-detector';

    public const string REALTOR = 'votes.realtor-detector';

    /** @var array<string, string> the command's name of a detector => its feature */
    public const array FEATURES = ['rented' => self::RENTED, 'realtor' => self::REALTOR];

    public function __construct(private Application $app) {}

    /** Whether `rented` votes may mark a listing, and the overlay reads the listing marks. */
    public function rentedOn(): bool
    {
        return Feature::globally()->active(self::RENTED);
    }

    /** Whether `agent` votes may mark an author, and the overlay and `agent_marked` read the author marks. */
    public function realtorOn(): bool
    {
        return Feature::globally()->active(self::REALTOR);
    }

    /**
     * Switches the detector (`rented` or `realtor`) for everyone; `InvalidArgumentException` for another name.
     *
     * @throws InvalidArgumentException
     */
    public function set(string $detector, bool $on, string $actor, string $reason): SourceFlagChange
    {
        $feature = self::FEATURES[$detector] ?? throw new InvalidArgumentException('The detector is rented or realtor.');
        Feature::flushCache();
        Feature::globally()->value($feature);

        return DB::transaction(function () use ($feature, $on, $actor, $reason): SourceFlagChange {
            if (DB::getDriverName() === 'pgsql') {
                DB::select('select pg_advisory_xact_lock(hashtext(?))', ['votes:'.$feature]);
            }

            Feature::flushCache();
            $old = Feature::globally()->value($feature);
            Feature::globally()->activate($feature, $on);

            $row = SourceFlagChange::query()->create([
                'feature' => $feature,
                'old_rule' => $old,
                'new_rule' => $on,
                'actor' => $actor,
                'reason' => $reason,
                'environment' => $this->app->environment(),
            ]);

            Log::notice('Vote detector switched.', ['feature' => $feature, 'old' => $old, 'new' => $on, 'actor' => $actor, 'reason' => $reason]);

            return $row;
        });
    }
}
