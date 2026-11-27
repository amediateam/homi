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
 * source rules of WP-10, defined by `AppServiceProvider` with `defaultValue()`. Off means no new mark is written
 * (`VoteService`) and the overlay ignores the existing marks at once (`EloquentOverlayData` asks before its cache of the
 * realtor keys); the votes, the voter's own hide and a recount that removes a mark go on. `votes:detector` switches
 * them.
 *
 * A switch writes one `source_flag_changes` row — WP-10's audit of the source rules, whose columns fit (brief decision
 * 16: no table of its own) — and a `notice` log line; neither holds personal data. A change made any other way — a
 * direct `Feature::…->activate()`, `pennant:purge` — is audited by `RecordSourceFlagChange` with actor `unknown`; it
 * skips the event of this class's own switch (`isWriting()`, so the class is a singleton), so a switch is audited once.
 * The stored value is read once outside the transaction, which stores the default row if it is missing: inside a
 * PostgreSQL transaction Pennant's retry of a lost insert would abort it. On PostgreSQL the change runs behind an
 * advisory lock per feature, so the old value of the audit is right.
 *
 * "Off" survives a purge: while Pennant stores no value — never switched, or its value purged or forgotten — a
 * detector resolves to the latest value its audit rows give it (`defaultValue()`; the audit is append-only), and
 * Pennant stores that again.
 */
final class VoteDetectors
{
    public const string RENTED = 'votes.rented-detector';

    public const string REALTOR = 'votes.realtor-detector';

    /** @var array<string, string> the command's name of a detector => its feature */
    public const array FEATURES = ['rented' => self::RENTED, 'realtor' => self::REALTOR];

    /** True while `set()` writes a value, so `RecordSourceFlagChange` skips the event it causes. */
    private bool $writing = false;

    public function __construct(private readonly Application $app) {}

    public function isWriting(): bool
    {
        return $this->writing;
    }

    /**
     * The value of a detector while Pennant stores none: the latest `new_rule` its `source_flag_changes` rows hold,
     * read through the model's cast and by `id`, as a strict boolean — off only for a stored `false`, as Pennant reads
     * a value — else on (never switched). A row without a value, written for a purge or a forget, is skipped, so a
     * purge never turns a detector back on. Pennant stores the answer, so a request reads the audit only while no value
     * is stored: once per feature after a deploy or a purge.
     */
    public static function defaultValue(string $feature): bool
    {
        $latest = SourceFlagChange::query()->where('feature', $feature)->whereNotNull('new_rule')->orderByDesc('id')->first(['id', 'new_rule']);

        return $latest?->new_rule !== false;
    }

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
            $this->writing = true;

            try {
                Feature::globally()->activate($feature, $on);
            } finally {
                $this->writing = false;
            }

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
